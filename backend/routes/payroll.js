const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { calculatePaye } = require('../utils/taxEngine');
const { generatePayrollSummaryPDF, generatePayslipSummaryPDF, generatePayslipSummaryBuffer } = require('../utils/pdfService');
const { getSettingAsNumber } = require('../lib/systemSettings');
const { audit } = require('../lib/audit');
const { validateBody } = require('../lib/validate');
const { sendPayslip } = require('../lib/mailer');
const { calculateYTD } = require('../utils/ytdCalculator');
const { payslipToBuffer, buildPayslipLineItems } = require('../utils/payslipFormatter');

const router = express.Router();

// ─── GET /api/payroll ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { status } = req.query;
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

  try {
    const [runs, employeeCount] = await Promise.all([
      prisma.payrollRun.findMany({
        where: {
          companyId: req.companyId,
          ...(status && { status }),
        },
        include: { 
          _count: { select: { payslips: true } },
          payrollCalendar: true
        },
        orderBy: { runDate: 'desc' },
      }),
      prisma.employee.count({ where: { companyId: req.companyId } }),
    ]);
    res.json(runs.map((r) => ({ ...r, employeeCount })));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll — create a DRAFT run (no payslips yet) ─────────────────

router.post(
  '/',
  requirePermission('manage_payroll'),
  validateBody({
    startDate: { required: true, isDate: true },
    endDate: { required: true, isDate: true },
  }),
  async (req, res) => {
    const { startDate, endDate, currency, exchangeRate, dualCurrency, payrollCalendarId, notes } = req.body;
    if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({ message: 'endDate must be after startDate' });
    }

    const isDual = dualCurrency === true || dualCurrency === 'true';
    if (isDual && (!exchangeRate || parseFloat(exchangeRate) <= 1)) {
      return res.status(400).json({ message: 'A valid USD→ZiG exchange rate (>1) is required for dual-currency runs' });
    }

    try {
      // Period-lock check: block if any overlapping calendar for this client is closed
      const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
        where: {
          clientId: req.clientId, // assumes clientId is resolved in companyContext
          isClosed: true,
          startDate: { lte: new Date(endDate) },
          endDate: { gte: new Date(startDate) },
        },
      });
      if (overlappingClosedCal) {
        return res.status(400).json({ message: `Cannot create payroll for a closed period (${overlappingClosedCal.year}-${overlappingClosedCal.month || ''})` });
      }

      const run = await prisma.payrollRun.create({
        data: {
          companyId: req.companyId,
          payrollCalendarId: payrollCalendarId || null,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          currency: isDual ? 'USD' : (currency || 'USD'),
          exchangeRate: parseFloat(exchangeRate || 1),
          dualCurrency: isDual,
          status: 'DRAFT',
          notes: notes || null,
        },
      });

      await audit({
        req,
        action: 'PAYROLL_RUN_CREATED',
        resource: 'payroll_run',
        resourceId: run.id,
        details: { currency: run.currency, startDate, endDate, status: 'DRAFT' },
      });

      res.status(201).json(run);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// ─── POST /api/payroll/preview — real-time PAYE estimate ─────────────────────
// Body: { inputs: [{employeeId, transactionCodeId, amount}], currency }
// Returns: [{employeeId, gross, paye, aidsLevy, nssa, net}]
// Note: must be declared BEFORE /:runId routes so "preview" isn't treated as a runId.

router.post('/preview', requirePermission('process_payroll'), async (req, res) => {
  // Period-lock check (date-based fallback)
  const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
    where: {
      clientId: req.clientId,
      isClosed: true,
      startDate: { lte: new Date() }, // Preview is usually for current date, but we don't have a fixed period in body always
      // If period is provided in body, use it.
      ...(req.body.period && {
        startDate: { lte: new Date(req.body.period + '-31') },
        endDate: { gte: new Date(req.body.period + '-01') },
      })
    },
  });
  if (overlappingClosedCal) return res.status(400).json({ message: 'This period is closed' });

  const { inputs, currency = 'USD' } = req.body;
  if (!inputs?.length) return res.json([]);

  try {
    const tcIds = [...new Set(inputs.map((i) => i.transactionCodeId))];
    const tcs = await prisma.transactionCode.findMany({
      where: { id: { in: tcIds } },
      select: { id: true, type: true, taxable: true, preTax: true, name: true, code: true },
    });
    const tcMap = Object.fromEntries(tcs.map((t) => [t.id, t]));

    const company = req.companyId
      ? await prisma.company.findUnique({ where: { id: req.companyId } })
      : null;

    const taxTable = company
      ? await prisma.taxTable.findFirst({
        where: {
          clientId: company.clientId,
          currency,
          isActive: true,
        },
        include: { brackets: true },
      }) ?? await prisma.taxTable.findFirst({
        where: {
          clientId: company.clientId,
          currency,
          effectiveDate: { lte: new Date() },
          OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }],
        },
        include: { brackets: true },
        orderBy: { effectiveDate: 'desc' },
      })
      : null;
    const taxBrackets = taxTable?.brackets ?? [];
    const annualBrackets = taxBrackets.length > 0 && (taxTable?.isAnnual ?? true);

    const previewAidsLevyRate = await getSettingAsNumber('AIDS_LEVY_RATE', 3) / 100;
    const previewMedicalAidCreditRate = await getSettingAsNumber('MEDICAL_AID_CREDIT_RATE', 50) / 100;
    const previewNssaEmployeeRate = await getSettingAsNumber('NSSA_EMPLOYEE_RATE', 4.5) / 100;
    const previewNssaCeiling = await getSettingAsNumber('NSSA_CEILING_USD', 700);

    const byEmployee = {};
    for (const inp of inputs) {
      if (!byEmployee[inp.employeeId]) byEmployee[inp.employeeId] = [];
      byEmployee[inp.employeeId].push(inp);
    }

    const results = [];
    for (const [empId, empInputs] of Object.entries(byEmployee)) {
      let earnings = 0, preTaxDeductions = 0, postTaxDeductions = 0, medicalAidAmt = 0;

      for (const inp of empInputs) {
        const tc = tcMap[inp.transactionCodeId];
        const amt = parseFloat(inp.amount) || 0;

        const tcName = tc?.name || '';
        const tcCode = tc?.code || '';
        const isMedAid = tc && tc.type === 'DEDUCTION' && tc.preTax === false &&
          (tcName.toLowerCase().includes('medical aid') ||
            (tcName.toLowerCase().includes('medical') && /^\d+$/.test(tcCode)) ||
            tcCode.toUpperCase() === 'MED_AID' || tcCode.toUpperCase() === 'MEDICAL_AID');

        if (!tc || tc.type === 'EARNING' || tc.type === 'BENEFIT') {
          earnings += amt;
        } else if (tc.type === 'DEDUCTION') {
          if (tc.preTax) preTaxDeductions += amt;
          else if (isMedAid) medicalAidAmt += amt;
          else postTaxDeductions += amt;
        }
      }

      const gross = Math.max(0, earnings);
      const taxResult = calculatePaye({
        baseSalary: gross,
        pensionContribution: preTaxDeductions,
        currency,
        taxBrackets,
        annualBrackets,
        nssaEmployeeRate: previewNssaEmployeeRate,
        nssaCeiling: previewNssaCeiling,
        aidsLevyRate: previewAidsLevyRate,
        medicalAidCreditRate: previewMedicalAidCreditRate,
        medicalAid: medicalAidAmt,
      });

      results.push({
        employeeId: empId,
        gross,
        paye: taxResult.payeBeforeLevy,
        aidsLevy: taxResult.aidsLevy,
        nssa: taxResult.nssaEmployee,
        net: Math.max(0, taxResult.netSalary - postTaxDeductions),
      });
    }

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll/:runId/submit — DRAFT → PENDING_APPROVAL ───────────────

router.post('/:runId/submit', requirePermission('manage_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { payrollCalendar: true }
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (run.payrollCalendar?.isClosed) {
      return res.status(400).json({ message: 'Cannot submit a payroll run for a closed period' });
    }
    // Date-based fallback: check any closed calendar for this client that overlaps the run's dates
    const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: req.clientId,
        isClosed: true,
        startDate: { lte: run.endDate },
        endDate: { gte: run.startDate },
      },
    });
    if (overlappingClosedCal) {
      return res.status(400).json({ message: 'A closed calendar period overlaps with this payroll run dates' });
    }

    if (run.status !== 'DRAFT') return res.status(400).json({ message: 'Only DRAFT runs can be submitted for approval' });

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'PENDING_APPROVAL' },
    });

    await audit({ req, action: 'PAYROLL_RUN_SUBMITTED', resource: 'payroll_run', resourceId: run.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll/:runId/approve — PENDING_APPROVAL → APPROVED ──────────

router.post('/:runId/approve', requirePermission('approve_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { payrollCalendar: true }
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (run.payrollCalendar?.isClosed) {
      return res.status(400).json({ message: 'Cannot approve a payroll run for a closed period' });
    }
    const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: req.clientId,
        isClosed: true,
        startDate: { lte: run.endDate },
        endDate: { gte: run.startDate },
      },
    });
    if (overlappingClosedCal) {
      return res.status(400).json({ message: 'A closed calendar period overlaps with this payroll run dates' });
    }

    if (!['PENDING_APPROVAL', 'DRAFT'].includes(run.status)) {
      return res.status(400).json({ message: 'Only DRAFT or PENDING_APPROVAL runs can be approved' });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'APPROVED' },
    });

    await audit({ req, action: 'PAYROLL_RUN_APPROVED', resource: 'payroll_run', resourceId: run.id });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/payroll/:runId/process — calculate payslips (APPROVED/DRAFT) ──

router.post('/:runId/process', requirePermission('process_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { company: true, payrollCalendar: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (run.payrollCalendar?.isClosed) {
      return res.status(400).json({ message: 'Cannot process payroll for a closed period' });
    }
    const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: run.company.clientId,
        isClosed: true,
        startDate: { lte: run.endDate },
        endDate: { gte: run.startDate },
      },
    });
    if (overlappingClosedCal) {
      return res.status(400).json({ message: 'A closed calendar period overlaps with this payroll run dates' });
    }

    if (!['DRAFT', 'APPROVED', 'ERROR', 'COMPLETED'].includes(run.status)) {
      return res.status(400).json({ message: 'Only DRAFT, APPROVED, ERROR, or COMPLETED runs can be processed' });
    }

    // Fetch tax table: prefer explicitly activated table, then period-matched, then most recent
    const fetchTaxTable = async (clientId, currency, date) => {
      // 1. Explicitly activated table for this client+currency
      const active = await prisma.taxTable.findFirst({
        where: { clientId, currency, isActive: true },
        include: { brackets: true },
      });
      if (active) return active;
      // 2. Period-matched by effective/expiry date
      const matched = await prisma.taxTable.findFirst({
        where: {
          clientId,
          currency,
          effectiveDate: { lte: date },
          OR: [{ expiryDate: null }, { expiryDate: { gte: date } }],
        },
        include: { brackets: true },
        orderBy: { effectiveDate: 'desc' },
      });
      if (matched) return matched;
      // 3. Fallback: most recently created table for this client/currency
      return prisma.taxTable.findFirst({
        where: { clientId, currency },
        include: { brackets: true },
        orderBy: { createdAt: 'desc' },
      });
    };

    // Fetch active tax table(s)
    const taxTableUSD = await fetchTaxTable(run.company.clientId, 'USD', run.startDate);
    const taxBracketsUSD = taxTableUSD?.brackets ?? [];
    const annualBracketsUSD = taxBracketsUSD.length > 0 && (taxTableUSD?.isAnnual ?? true);

    let taxBracketsZIG = [];
    let annualBracketsZIG = false;
    if (run.dualCurrency || run.currency === 'ZiG') {
      const taxTableZIG = await fetchTaxTable(run.company.clientId, 'ZiG', run.startDate);
      taxBracketsZIG = taxTableZIG?.brackets ?? [];
      annualBracketsZIG = taxBracketsZIG.length > 0 && (taxTableZIG?.isAnnual ?? true);
    }

    const taxBrackets = run.currency === 'ZiG' ? taxBracketsZIG : taxBracketsUSD;
    const annualBrackets = run.currency === 'ZiG' ? annualBracketsZIG : annualBracketsUSD;

    // Guard: block processing when required tax table is missing.
    // Without brackets the engine returns zero PAYE — a silent under-deduction that
    // produces an incorrect P2 and exposes the employer to ZIMRA penalties.
    const primaryBrackets = run.currency === 'ZiG' ? taxBracketsZIG : taxBracketsUSD;
    if (primaryBrackets.length === 0) {
      return res.status(422).json({
        message: `No active ${run.currency} tax table found. Configure and activate a tax table under Tax Configuration before processing payroll.`,
      });
    }
    if (run.dualCurrency && taxBracketsZIG.length === 0) {
      return res.status(422).json({
        message: 'No active ZiG tax table found for this dual-currency run. Configure and activate a ZiG tax table under Tax Configuration.',
      });
    }

    // NSSA ceiling from SystemSettings (falls back to engine defaults)
    const nssaCeilingUSD = await getSettingAsNumber('NSSA_CEILING_USD', 700);
    const nssaCeilingZIG = await getSettingAsNumber('NSSA_CEILING_ZIG', 20000);
    const nssaCeiling = run.currency === 'ZiG' ? nssaCeilingZIG : nssaCeilingUSD;

    // Bonus exemption threshold (ZIMRA) — configure annually under System Settings.
    // Default falls back to USD 700 (2024 ZIMRA threshold) so unconfigured systems
    // do not over-tax employees on bonus runs.
    const bonusExemptionUSD = await getSettingAsNumber('BONUS_EXEMPTION_USD', 700);
    // ZiG default = 21 000 (ZIMRA 2024 ZiG annual bonus exemption threshold).
    // Update via System Settings → BONUS_EXEMPTION_ZIG when ZIMRA revises this.
    const bonusExemptionZIG = await getSettingAsNumber('BONUS_EXEMPTION_ZIG', 21000);
    const bonusExemption = run.currency === 'ZiG' ? bonusExemptionZIG : bonusExemptionUSD;

    // Severance / retrenchment exemption threshold
    const severanceExemptionUSD = await getSettingAsNumber('SEVERANCE_EXEMPTION_USD', 0);
    const severanceExemptionZIG = await getSettingAsNumber('SEVERANCE_EXEMPTION_ZIG', 0);
    const severanceExemption = run.currency === 'ZiG' ? severanceExemptionZIG : severanceExemptionUSD;

    // Industry-specific WCIF and SDF rates: company setting overrides global SystemSetting
    // Rates are stored as percentages (e.g. 1.5 for 1.5%) — divide by 100 for decimal multiplier
    const globalWcifRate = await getSettingAsNumber('WCIF_RATE', 0) / 100;
    const globalSdfRate = await getSettingAsNumber('SDF_RATE', 0) / 100;
    const wcifRate = run.company.wcifRate != null ? run.company.wcifRate / 100 : globalWcifRate;
    const sdfRate = run.company.sdfRate != null ? run.company.sdfRate / 100 : globalSdfRate;

    // NSSA contribution rates from SystemSettings — stored as percentages, converted to decimals
    const nssaEmployeeRate = await getSettingAsNumber('NSSA_EMPLOYEE_RATE', 4.5) / 100;
    const nssaEmployerRate = await getSettingAsNumber('NSSA_EMPLOYER_RATE', 4.5) / 100;

    // AIDS levy and medical aid credit rates from SystemSettings — stored as percentages
    const aidsLevyRate = await getSettingAsNumber('AIDS_LEVY_RATE', 3) / 100;
    const medicalAidCreditRate = await getSettingAsNumber('MEDICAL_AID_CREDIT_RATE', 50) / 100;

    // Pension deduction cap per ZIMRA regulations (0 = no cap)
    const pensionCapUSD = await getSettingAsNumber('PENSION_CAP_USD', 0);
    const pensionCapZIG = await getSettingAsNumber('PENSION_CAP_ZIG', 0);

    // ZIMRA Prescribed Interest Rates for Loans (for Deemed Interest)
    const prescribedRateUSD = await getSettingAsNumber('LOAN_PRESCRIBED_RATE_USD', 15);
    const prescribedRateZIG = await getSettingAsNumber('LOAN_PRESCRIBED_RATE_ZIG', 150);
    const currentPrescribedRate = run.currency === 'ZiG' ? prescribedRateZIG : prescribedRateUSD;

    const elderlyCreditUSD = await getSettingAsNumber('ELDERLY_TAX_CREDIT_USD', 75);
    const elderlyCreditZIG = await getSettingAsNumber('ELDERLY_TAX_CREDIT_ZIG', 900);

    const globalZimdefRate = await getSettingAsNumber('ZIMDEF_RATE', 1) / 100;
    const zimdefRate = run.company.zimdefRate != null ? run.company.zimdefRate / 100 : globalZimdefRate;

    // Working days per month — used for pro-rating unpaid leave deductions
    const workingDaysPerMonth = await getSettingAsNumber('WORKING_DAYS_PER_MONTH', 22);

    const employees = await prisma.employee.findMany({
      where: { companyId: run.companyId },
      include: { necGrade: true },
    });

    if (employees.length === 0) {
      return res.status(400).json({ message: 'No employees found for this company' });
    }

    const adjustments = req.body?.adjustments || {};
    const xr = run.exchangeRate || 1;

    // Banker's-rounding helper — ZIMRA requires figures to 2 d.p. at each step
    // to prevent accumulated float drift across a large employee headcount.
    const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

    const toRunCcy = (usd, zig) => round2(run.currency === 'ZiG'
      ? (zig || 0) + (usd || 0) * xr
      : (usd || 0) + (zig || 0) / xr);

    // ── Batch-fetch all data BEFORE the transaction (avoids long-running tx) ──

    // All unprocessed inputs for this run — includes both run-linked inputs AND unattached inputs
    // (payrollRunId = null) whose period matches this run's start-date period (YYYY-MM).
    const runPeriod = `${new Date(run.startDate).getFullYear()}-${String(new Date(run.startDate).getMonth() + 1).padStart(2, '0')}`;
    const allInputs = await prisma.payrollInput.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        OR: [
          { payrollRunId: run.id },                                  // run-linked (any processed state — for re-runs)
          { payrollRunId: null, period: { lte: runPeriod }, processed: false }, // unattached, not yet processed
        ],
      },
      include: { transactionCode: { select: { type: true, preTax: true, affectsNssa: true, affectsPaye: true, name: true, code: true, incomeCategory: true } } },
    });
    const inputsByEmployee = {};
    for (const inp of allInputs) {
      (inputsByEmployee[inp.employeeId] = inputsByEmployee[inp.employeeId] || []).push(inp);
    }

    // Active salary structure defaults — auto-populate for employees not already covered by explicit inputs
    const employeeIds = employees.map((e) => e.id);

    const allSalaryDefaults = await prisma.employeeTransaction.findMany({
      where: {
        employeeId: { in: employeeIds },
        isRecurring: true,
        // Match transactions effective at any point during this run period (up to endDate)
        effectiveFrom: { lte: run.endDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: run.startDate } }],
      },
      include: { transactionCode: { select: { type: true, preTax: true, affectsNssa: true, affectsPaye: true, name: true, code: true, incomeCategory: true } } },
    });

    // Build a set of (employeeId:transactionCodeId) already covered by explicit payroll inputs for this run
    const coveredKeys = new Set(allInputs.map((i) => `${i.employeeId}:${i.transactionCodeId}`));

    // Deduplicate salary defaults: when multiple records exist for the same (employee, TC)
    // (e.g. overlapping salary structures due to a mid-period raise), keep only the most recent.
    const latestDefaultByKey = {};
    for (const sd of allSalaryDefaults) {
      const key = `${sd.employeeId}:${sd.transactionCodeId}`;
      if (!latestDefaultByKey[key] ||
        new Date(sd.effectiveFrom) > new Date(latestDefaultByKey[key].effectiveFrom)) {
        latestDefaultByKey[key] = sd;
      }
    }

    // Group defaults by employee, skipping any that are already covered by explicit inputs
    const defaultsByEmployee = {};
    for (const sd of Object.values(latestDefaultByKey)) {
      const key = `${sd.employeeId}:${sd.transactionCodeId}`;
      if (coveredKeys.has(key)) continue; // explicit input takes precedence
      (defaultsByEmployee[sd.employeeId] = defaultsByEmployee[sd.employeeId] || []).push(sd);
    }

    // All due loan repayments for employees in this company
    const allDueRepayments = await prisma.loanRepayment.findMany({
      where: {
        OR: [
          { status: 'UNPAID' },
          { payrollRunId: run.id }, // Also include those already linked to this run for re-processing
        ],
        dueDate: { lte: new Date(run.endDate) },
        loan: { employeeId: { in: employeeIds }, status: { in: ['ACTIVE', 'PAID_OFF'] }, repaymentMethod: 'SALARY_DEDUCTION' },
      },
      include: { loan: { select: { id: true, employeeId: true } } },
      orderBy: { dueDate: 'asc' },
    });
    const repaymentsByEmployee = {};
    for (const rep of allDueRepayments) {
      const empId = rep.loan.employeeId;
      (repaymentsByEmployee[empId] = repaymentsByEmployee[empId] || []).push(rep);
    }

    // All remaining unpaid repayments for loans that will have repayments paid (to detect pay-off)
    const affectedLoanIds = [...new Set(allDueRepayments.map((r) => r.loanId))];
    const remainingRepaymentCounts = {};
    if (affectedLoanIds.length > 0) {
      const dueRepaymentIds = new Set(allDueRepayments.map((r) => r.id));
      const allUnpaid = await prisma.loanRepayment.findMany({
        where: { loanId: { in: affectedLoanIds }, status: 'UNPAID' },
        select: { id: true, loanId: true },
      });
      for (const loanId of affectedLoanIds) {
        const remaining = allUnpaid.filter((r) => r.loanId === loanId && !dueRepaymentIds.has(r.id));
        remainingRepaymentCounts[loanId] = remaining.length;
      }
    }

    // All active loans for employees in this run to calculate balance for deemed interest
    const allActiveLoans = await prisma.loan.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'ACTIVE',
      },
      include: {
        repayments: { where: { status: 'PAID' } }
      },
    });
    const loansByEmployee = {};
    for (const loan of allActiveLoans) {
      loansByEmployee[loan.employeeId] = loansByEmployee[loan.employeeId] || [];
      loansByEmployee[loan.employeeId].push(loan);
    }

    // ── Active leave records during the run period ────────────────────────────
    // Employees on UNPAID leave types (UNPAID, SICK when no paid entitlement,
    // MATERNITY beyond paid days) have their base salary zeroed so they do not
    // receive a salary component — transaction code inputs still apply.
    const UNPAID_LEAVE_TYPES = ['UNPAID', 'UNPAID_SICK', 'UNPAID_MATERNITY'];

    const activeLeaveRecords = await prisma.leaveRecord.findMany({
      where: {
        employeeId: { in: employeeIds },
        status: 'APPROVED',
        type: { in: UNPAID_LEAVE_TYPES },
        startDate: { lte: new Date(run.endDate) },
        endDate: { gte: new Date(run.startDate) },
      },
      select: { employeeId: true, type: true, totalDays: true },
    });
    const unpaidLeaveByEmployee = {};
    for (const rec of activeLeaveRecords) {
      unpaidLeaveByEmployee[rec.employeeId] = rec;
    }

    // ── YTD cumulative gross for FDS_AVERAGE employees ──────────────────────
    // FDS_AVERAGE (Zimbabwe FDS): PAYE is computed on the average of all monthly
    // gross amounts within the current tax year (prior months + this month), so
    // that employees with irregular pay (bonuses, commission) are not overtaxed
    // in peak months and under-taxed in lean months.
    const fdsAvgEmpIds = employees
      .filter((e) => e.taxMethod === 'FDS_AVERAGE')
      .map((e) => e.id);

    const fdsYtdByEmployee = {};
    if (fdsAvgEmpIds.length > 0) {
      const taxYear = new Date(run.startDate).getFullYear();
      const yearStart = new Date(taxYear, 0, 1);
      const ytdPayslips = await prisma.payslip.findMany({
        where: {
          employeeId: { in: fdsAvgEmpIds },
          payrollRun: {
            companyId: run.companyId,
            status: 'COMPLETED',
            startDate: { gte: yearStart, lt: new Date(run.startDate) },
          },
        },
        select: {
          employeeId: true, gross: true,
          exemptBonus: true, exemptBonusUSD: true, exemptBonusZIG: true,
          exemptSeverance: true, medicalAidCredit: true,
          payrollRun: { select: { startDate: true } }
        },
      });
      for (const ps of ytdPayslips) {
        const rec = (fdsYtdByEmployee[ps.employeeId] ??= {
          cumGross: 0,
          uniqueMonths: new Set(),
          cumExemptBonus: 0,
          cumExemptBonusUSD: 0,
          cumExemptBonusZIG: 0,
          cumExemptSeverance: 0
        });
        rec.cumGross += ps.gross ?? 0;
        if (ps.payrollRun?.startDate) {
          const d = new Date(ps.payrollRun.startDate);
          rec.uniqueMonths.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
        }
        rec.cumExemptBonus += ps.exemptBonus || 0;
        rec.cumExemptBonusUSD += ps.exemptBonusUSD || 0;
        rec.cumExemptBonusZIG += ps.exemptBonusZIG || 0;
        rec.cumExemptSeverance += ps.exemptSeverance || 0;
      }
    }

    // ── Calculate payslips in memory ─────────────────────────────────────────

    const payslipData = [];
    const payrollTxData = []; // line-by-line TC breakdown (earnings & deductions)
    const now = new Date();
    // Track which loan repayments were actually deducted (only fully-covered ones are marked PAID)
    const appliedRepaymentIds = new Set();

    for (const emp of employees) {
      const adj = adjustments[emp.id] || {};
      const empInputs = inputsByEmployee[emp.id] || [];
      const empDefaults = defaultsByEmployee[emp.id] || [];
      const empRepayments = repaymentsByEmployee[emp.id] || [];
      const empLoans = loansByEmployee[emp.id] || [];

      // Calculate Deemed Interest Benefit (ZIMRA):
      // Benefit = Balance * (Prescribed Rate - Actual Rate) / 100 / 12
      // For dual-currency runs we infer loan currency from the employee's primary
      // currency (Loan model has no currency field), apply the matching prescribed
      // rate, and route the benefit to the corresponding calculatePaye side.
      let totalLoanBenefit = 0;    // non-dual
      let totalLoanBenefitUSD = 0; // dual-currency USD side
      let totalLoanBenefitZIG = 0; // dual-currency ZiG side

      if (run.dualCurrency) {
        const empPrescribedRate = emp.currency === 'USD' ? prescribedRateUSD : prescribedRateZIG;
        for (const loan of empLoans) {
          if (loan.interestRate < empPrescribedRate) {
            const paidAmt = loan.repayments.reduce((sum, r) => sum + (r.amount || 0), 0);
            const currentBalance = Math.max(0, loan.amount - paidAmt);
            if (currentBalance > 0) {
              const monthlyBenefit = (currentBalance * (empPrescribedRate - loan.interestRate)) / 100 / 12;
              if (emp.currency === 'USD') totalLoanBenefitUSD += monthlyBenefit;
              else totalLoanBenefitZIG += monthlyBenefit;
            }
          }
        }
      } else {
        for (const loan of empLoans) {
          if (loan.interestRate < currentPrescribedRate) {
            const paidAmt = loan.repayments.reduce((sum, r) => sum + (r.amount || 0), 0);
            const currentBalance = Math.max(0, loan.amount - paidAmt);
            if (currentBalance > 0) {
              const monthlyBenefit = (currentBalance * (currentPrescribedRate - loan.interestRate)) / 100 / 12;
              totalLoanBenefit += monthlyBenefit;
            }
          }
        }
      }

      // If the employee has an approved UNPAID leave record spanning this period,
      // zero out the base salary (they are not paid for this period).
      // Transaction code inputs (e.g. partial pay advance) still accumulate normally.
      const unpaidLeave = unpaidLeaveByEmployee[emp.id];

      let inputEarnings = 0, inputDeductions = 0, inputPension = 0;
      let inputMedicalAid = 0, inputMedicalAidUSD = 0, inputMedicalAidZIG = 0;
      let inputEarningsUSD = 0, inputEarningsZIG = 0;
      let inputDeductionsUSD = 0, inputDeductionsZIG = 0;
      let inputPensionUSD = 0, inputPensionZIG = 0;
      // Amounts excluded from NSSA / PAYE basis by transaction code flags
      let inputNssaExcluded = 0, inputPayeExcluded = 0;
      let inputNssaExcludedUSD = 0, inputNssaExcludedZIG = 0;
      let inputPayeExcludedUSD = 0, inputPayeExcludedZIG = 0;

      // Auto-calculate 'Shortime' (201) if units are entered but monetary amounts are zero
      for (const i of empInputs) {
        if (i.transactionCode.code === '201' && i.units > 0 && (i.employeeUSD || 0) === 0 && (i.employeeZiG || 0) === 0) {
          const dayRate = emp.baseRate / (workingDaysPerMonth || 22);
          const amt = round2(dayRate * i.units);
          if (emp.currency === 'ZiG') i.employeeZiG = amt;
          else i.employeeUSD = amt;
        }
      }

      for (const input of empInputs) {
        const tc = input.transactionCode;
        const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
        const isPreTaxDeduction = tc.type === 'DEDUCTION' && tc.preTax === true;
        const tcName = tc.name || '';
        const tcCode = tc.code || '';
        const isMedicalAid = tc.type === 'DEDUCTION' && tc.preTax === false &&
          (tc.incomeCategory === 'MEDICAL_AID' ||
            /medical\s*aid|med\s*aid/i.test(tcName) ||
            /MED_AID|MEDICAL_AID/i.test(tcCode) ||
            (tcName.toLowerCase().includes('medical') && /^\d+$/.test(tcCode)));

        const isPension = tc.type === 'DEDUCTION' && (tc.incomeCategory === 'PENSION' || tc.preTax === true);

        if (run.dualCurrency) {
          if (isEarning) {
            inputEarningsUSD += input.employeeUSD || 0;
            inputEarningsZIG += input.employeeZiG || 0;
            if (tc.affectsNssa === false) {
              inputNssaExcludedUSD += input.employeeUSD || 0;
              inputNssaExcludedZIG += input.employeeZiG || 0;
            }
            if (tc.affectsPaye === false) {
              inputPayeExcludedUSD += input.employeeUSD || 0;
              inputPayeExcludedZIG += input.employeeZiG || 0;
            }
          } else if (isPreTaxDeduction) {
            // Pre-tax pension: deducted from taxable income before PAYE
            inputPensionUSD += input.employeeUSD || 0;
            inputPensionZIG += input.employeeZiG || 0;
          } else if (isMedicalAid) {
            inputMedicalAidUSD += input.employeeUSD || 0;
            inputMedicalAidZIG += input.employeeZiG || 0;
          } else {
            // Post-tax deductions: subtracted from net pay after PAYE
            inputDeductionsUSD += input.employeeUSD || 0;
            inputDeductionsZIG += input.employeeZiG || 0;
          }
        } else {
          const amt = toRunCcy(input.employeeUSD, input.employeeZiG);
          if (isEarning) {
            inputEarnings += amt;
            if (tc.affectsNssa === false) inputNssaExcluded += amt;
            if (tc.affectsPaye === false) inputPayeExcluded += amt;
          } else if (isPreTaxDeduction) {
            inputPension += amt;
          } else if (isMedicalAid) {
            inputMedicalAid += amt;
          } else {
            inputDeductions += amt;
          }
        }
      }

      // Fold in active salary structure defaults (recurring components not covered by explicit inputs)
      for (const sd of empDefaults) {
        const tc = sd.transactionCode;
        const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
        const isPreTaxDeduction = tc.type === 'DEDUCTION' && tc.preTax === true;
        const tcName = tc.name || '';
        const tcCode = tc.code || '';
        const isMedicalAid = tc.type === 'DEDUCTION' && tc.preTax === false &&
          (/medical\s*aid|med\s*aid/i.test(tcName) ||
            /MED_AID|MEDICAL_AID/i.test(tcCode));

        // Treat EmployeeTransaction.value as stored in sd.currency — split into USD/ZiG amounts
        const empUSD = sd.currency === 'USD' ? sd.value : 0;
        const empZIG = sd.currency === 'ZiG' ? sd.value : 0;

        if (run.dualCurrency) {
          if (isEarning) {
            inputEarningsUSD += empUSD;
            inputEarningsZIG += empZIG;
            if (tc.affectsNssa === false) {
              inputNssaExcludedUSD += empUSD;
              inputNssaExcludedZIG += empZIG;
            }
            if (tc.affectsPaye === false) {
              inputPayeExcludedUSD += empUSD;
              inputPayeExcludedZIG += empZIG;
            }
          } else if (isPreTaxDeduction) {
            inputPensionUSD += empUSD;
            inputPensionZIG += empZIG;
          } else if (isMedicalAid) {
            inputMedicalAidUSD += empUSD;
            inputMedicalAidZIG += empZIG;
          } else {
            inputDeductionsUSD += empUSD;
            inputDeductionsZIG += empZIG;
          }
        } else {
          const amt = toRunCcy(empUSD, empZIG);
          if (isEarning) {
            inputEarnings += amt;
            if (tc.affectsNssa === false) inputNssaExcluded += amt;
            if (tc.affectsPaye === false) inputPayeExcluded += amt;
          } else if (isPreTaxDeduction) {
            inputPension += amt;
          } else if (isMedicalAid) {
            inputMedicalAid += amt;
          } else {
            inputDeductions += amt;
          }
        }
      }

      // Pro-rate base salary for employees on approved UNPAID leave this period.
      // Deduction = (unpaidDays / workingDaysPerMonth) × baseRate.
      // Full-month unpaid leave (days ≥ working days) zeroes the salary.
      let effectiveBaseRate = emp.baseRate;
      if (unpaidLeave) {
        const unpaidDays = unpaidLeave.totalDays || 0;
        if (unpaidDays >= workingDaysPerMonth) {
          effectiveBaseRate = 0;
        } else {
          effectiveBaseRate = emp.baseRate * (1 - unpaidDays / workingDaysPerMonth);
        }
      }

      // Pro-rate for mid-period terminations
      if (emp.dischargeDate && effectiveBaseRate > 0) {
        const dDate = new Date(emp.dischargeDate);
        if (dDate >= run.startDate && dDate <= run.endDate) {
          // Calculate worked days in period
          const workedDays = Math.ceil((dDate - run.startDate) / (1000 * 60 * 60 * 24)) + 1;
          const periodDays = Math.ceil((run.endDate - run.startDate) / (1000 * 60 * 60 * 24)) + 1;

          // Cap at working days per month for consistency with leave logic
          const prorationFactor = Math.min(1, workedDays / periodDays);
          effectiveBaseRate = effectiveBaseRate * prorationFactor;
        } else if (dDate < run.startDate) {
          // Discharged before the run started — should ideally be filtered from run, but zero out anyway
          effectiveBaseRate = 0;
        }
      }

      let baseRate = effectiveBaseRate;
      if (effectiveBaseRate > 0 && emp.currency && emp.currency !== run.currency && run.exchangeRate && run.exchangeRate !== 1 && !run.dualCurrency) {
        if (run.currency === 'ZiG' && emp.currency === 'USD') baseRate = effectiveBaseRate * run.exchangeRate;
        else if (run.currency === 'USD' && emp.currency === 'ZiG') baseRate = effectiveBaseRate / run.exchangeRate;
      }

      let necLevy = 0;
      let necEmployer = 0;
      if (emp.rateSource === 'NEC_GRADE' && emp.necGrade) {
        const necMinRate = emp.necGrade.minRate;
        if (baseRate < necMinRate) baseRate = necMinRate;
        necLevy = baseRate * (emp.necGrade.necLevyRate || 0);
        // NEC Employer Match: usually matches the employee contribution
        necEmployer = necLevy;
      }

      const ytd = fdsYtdByEmployee[emp.id] || {
        cumGross: 0,
        uniqueMonths: new Set(),
        cumExemptBonus: 0,
        cumExemptBonusUSD: 0,
        cumExemptBonusZIG: 0,
        cumExemptSeverance: 0
      };

      // Honour tax directive expiry: if the directive has lapsed before the run
      // period starts, treat it as if no directive exists for this run.
      const runStart = new Date(run.startDate);

      // Calculate worker age for elderly tax credit automation (ZIMRA: 65+ years)
      // and NSSA POBS cessation (NSSA: 65+ years)
      let elderlyCredit = 0, elderlyCreditUSD_val = 0, elderlyCreditZIG_val = 0;
      let effectiveNssaEmpRate = nssaEmployeeRate;
      let effectiveNssaEmprRate = nssaEmployerRate;

      if (emp.dateOfBirth) {
        const dob = new Date(emp.dateOfBirth);
        const age = runStart.getFullYear() - dob.getFullYear();
        const birthdayThisYear = new Date(runStart.getFullYear(), dob.getMonth(), dob.getDate());
        const isElderly = age > 65 || (age === 65 && runStart >= birthdayThisYear);
        if (isElderly) {
          // ZIMRA credit
          elderlyCredit = run.currency === 'ZiG' ? elderlyCreditZIG : elderlyCreditUSD;
          elderlyCreditUSD_val = elderlyCreditUSD;
          elderlyCreditZIG_val = elderlyCreditZIG;
          // NSSA cessation (POBS stops at age 65)
          effectiveNssaEmpRate = 0;
          effectiveNssaEmprRate = 0;
        }
      }

      // Enforce annual cumulative thresholds for bonus/severance exemptions
      const remBonusExUSD = Math.max(0, bonusExemptionUSD - ytd.cumExemptBonusUSD);
      const remBonusExZIG = Math.max(0, bonusExemptionZIG - ytd.cumExemptBonusZIG);
      const remBonusEx = run.currency === 'ZiG' ? remBonusExZIG : remBonusExUSD;

      const remSevExUSD = Math.max(0, severanceExemptionUSD - ytd.cumExemptSeverance);
      const remSevExZIG = Math.max(0, severanceExemptionZIG - ytd.cumExemptSeverance);
      const remSevEx = run.currency === 'ZiG' ? remSevExZIG : remSevExUSD;

      // FDS_AVERAGE: derive the average monthly gross (YTD + this month) to pass
      // as the PAYE basis.  Only the PAYE band lookup uses this average; NSSA,
      // pension and net pay always reflect actual current-month earnings.
      let fdsAvgPAYEBasis = null;
      if (emp.taxMethod === 'FDS_AVERAGE') {
        // Estimate current month gross (base + TC earnings in primary currency).
        // For dual-currency runs the USD side is the FDS_AVERAGE reference currency.
        const currGross = run.dualCurrency
          ? (emp.currency === 'USD' ? baseRate : baseRate / xr) + inputEarningsUSD
          : baseRate + inputEarnings;
        fdsAvgPAYEBasis = round2((ytd.cumGross + currGross) / (ytd.uniqueMonths.size + 1));
      }
      const directiveActive =
        (!emp.taxDirectiveEffective || new Date(emp.taxDirectiveEffective) <= runStart) &&
        (!emp.taxDirectiveExpiry || new Date(emp.taxDirectiveExpiry) >= runStart);
      const effectiveTaxDirectivePerc = directiveActive ? (emp.taxDirectivePerc || 0) : 0;
      const effectiveTaxDirectiveAmt = directiveActive ? (emp.taxDirectiveAmt || 0) : 0;

      let taxResult, taxResultUSD, taxResultZIG;

      if (run.dualCurrency) {
        const baseUSD = emp.currency === 'USD' ? baseRate : baseRate / xr;
        const baseZIG = emp.currency === 'ZiG' ? baseRate : baseRate * xr;

        // Motor vehicle benefit is denominated in the employee's primary currency.
        // Route it to the matching currency side; the other side gets zero.
        const mvBenefitUSD = emp.currency !== 'ZiG' ? (emp.motorVehicleBenefit || 0) : 0;
        const mvBenefitZIG = emp.currency === 'ZiG' ? (emp.motorVehicleBenefit || 0) : 0;

        taxResultUSD = calculatePaye({
          baseSalary: baseUSD, currency: 'USD',
          taxableBenefits: adj.taxableBenefits || 0,
          motorVehicleBenefit: mvBenefitUSD,
          overtimeAmount: (adj.overtimeAmount || 0) + inputEarningsUSD,
          bonus: adj.bonus || 0, bonusExemption: remBonusExUSD,
          severanceAmount: adj.severanceAmount || 0, severanceExemption: remSevExUSD,
          pensionContribution: (adj.pensionContribution || 0) + inputPensionUSD,
          pensionCap: pensionCapUSD > 0 ? pensionCapUSD : null,
          medicalAid: (adj.medicalAid || 0) + inputMedicalAidUSD,
          taxCredits: (emp.taxCredits || 0) + elderlyCreditUSD_val,
          wcifRate, sdfRate,
          taxBrackets: taxBracketsUSD,
          // FDS_FORECASTING: always annualise regardless of tax-table isAnnual flag
          annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : annualBracketsUSD,
          nssaCeiling: nssaCeilingUSD,
          nssaEmployeeRate: effectiveNssaEmpRate,
          nssaEmployerRate: effectiveNssaEmprRate,
          nssaExcludedEarnings: inputNssaExcludedUSD,
          payeExcludedEarnings: inputPayeExcludedUSD,
          taxDirectivePerc: effectiveTaxDirectivePerc,
          taxDirectiveAmt: effectiveTaxDirectiveAmt,
          aidsLevyRate, medicalAidCreditRate,
          loanBenefit: totalLoanBenefitUSD,
          fdsAveragePAYEBasis: fdsAvgPAYEBasis,
          zimdefRate,
        });

        taxResultZIG = calculatePaye({
          baseSalary: baseZIG, currency: 'ZiG',
          taxableBenefits: 0, motorVehicleBenefit: mvBenefitZIG,
          overtimeAmount: inputEarningsZIG,
          bonus: 0, bonusExemption: remBonusExZIG,
          severanceAmount: 0, severanceExemption: remSevExZIG,
          pensionContribution: inputPensionZIG,
          pensionCap: pensionCapZIG > 0 ? pensionCapZIG : null,
          medicalAid: inputMedicalAidZIG, taxCredits: elderlyCreditZIG_val,
          wcifRate: 0, sdfRate: 0,
          taxBrackets: taxBracketsZIG, annualBrackets: annualBracketsZIG, nssaCeiling: nssaCeilingZIG,
          nssaEmployeeRate: effectiveNssaEmpRate,
          nssaEmployerRate: effectiveNssaEmprRate,
          nssaExcludedEarnings: inputNssaExcludedZIG,
          payeExcludedEarnings: inputPayeExcludedZIG,
          taxDirectivePerc: effectiveTaxDirectivePerc,
          taxDirectiveAmt: effectiveTaxDirectiveAmt,
          aidsLevyRate, medicalAidCreditRate,
          loanBenefit: totalLoanBenefitZIG,
          zimdefRate,
        });

        taxResult = taxResultUSD;
      } else {
        taxResult = calculatePaye({
          baseSalary: baseRate, currency: run.currency,
          taxableBenefits: adj.taxableBenefits || 0,
          motorVehicleBenefit: emp.motorVehicleBenefit || 0,
          overtimeAmount: (adj.overtimeAmount || 0) + inputEarnings,
          bonus: adj.bonus || 0, bonusExemption: remBonusEx,
          severanceAmount: adj.severanceAmount || 0, severanceExemption: remSevEx,
          pensionContribution: (adj.pensionContribution || 0) + inputPension,
          pensionCap: run.currency === 'ZiG'
            ? (pensionCapZIG > 0 ? pensionCapZIG : null)
            : (pensionCapUSD > 0 ? pensionCapUSD : null),
          medicalAid: (adj.medicalAid || 0) + inputMedicalAid,
          taxCredits: (emp.taxCredits || 0) + elderlyCredit,
          wcifRate, sdfRate,
          taxBrackets,
          // FDS_FORECASTING: always annualise regardless of tax-table isAnnual flag
          annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : annualBrackets,
          nssaCeiling,
          nssaEmployeeRate: effectiveNssaEmpRate,
          nssaEmployerRate: effectiveNssaEmprRate,
          nssaExcludedEarnings: inputNssaExcluded,
          payeExcludedEarnings: inputPayeExcluded,
          taxDirectivePerc: effectiveTaxDirectivePerc,
          taxDirectiveAmt: effectiveTaxDirectiveAmt,
          aidsLevyRate, medicalAidCreditRate,
          loanBenefit: totalLoanBenefit,
          fdsAveragePAYEBasis: fdsAvgPAYEBasis,
          zimdefRate,
        });
      }

      // Cap loan deductions to available net pay — only fully-covered repayments are marked PAID.
      // Partial deductions are skipped so they remain UNPAID and are retried next period.
      let loanDeductions = 0;

      let netPayAfterLoans, netPayUSD, netPayZIG, dualFields;

      if (run.dualCurrency) {
        // Dual-currency: deduct loans from USD net first
        let availableUSD = Math.max(0, taxResultUSD.netSalary - inputDeductionsUSD);
        for (const rep of empRepayments) {
          if (rep.amount > availableUSD + 0.001) continue; // can't fully cover — skip
          appliedRepaymentIds.add(rep.id);
          loanDeductions += rep.amount;
          availableUSD -= rep.amount;
        }
        const netUSD = Math.max(0, taxResultUSD.netSalary - loanDeductions - inputDeductionsUSD);
        const netZIG = Math.max(0, taxResultZIG.netSalary - inputDeductionsZIG);
        netPayAfterLoans = netUSD;
        netPayUSD = netUSD;
        netPayZIG = netZIG;
        dualFields = {
          grossUSD: taxResultUSD.grossSalary, grossZIG: taxResultZIG.grossSalary,
          payeUSD: taxResultUSD.payeBeforeLevy, payeZIG: taxResultZIG.payeBeforeLevy,
          aidsLevyUSD: taxResultUSD.aidsLevy, aidsLevyZIG: taxResultZIG.aidsLevy,
          nssaUSD: taxResultUSD.nssaEmployee, nssaZIG: taxResultZIG.nssaEmployee,
        };
      } else {
        let availableNet = Math.max(0, taxResult.netSalary - inputDeductions);
        for (const rep of empRepayments) {
          if (rep.amount > availableNet + 0.001) continue; // can't fully cover — skip
          appliedRepaymentIds.add(rep.id);
          loanDeductions += rep.amount;
          availableNet -= rep.amount;
        }
        netPayAfterLoans = Math.max(0, taxResult.netSalary - loanDeductions - inputDeductions);
        netPayUSD = null;
        netPayZIG = null;
        const splitPct = emp.splitUsdPercent;
        if (splitPct && splitPct > 0 && splitPct < 100 && run.exchangeRate && run.exchangeRate !== 1) {
          const usdShare = splitPct / 100;
          if (run.currency === 'USD') {
            netPayUSD = netPayAfterLoans * usdShare;
            netPayZIG = netPayAfterLoans * (1 - usdShare) * run.exchangeRate;
          } else {
            netPayZIG = netPayAfterLoans * (1 - usdShare);
            netPayUSD = (netPayAfterLoans * usdShare) / run.exchangeRate;
          }
        }
        dualFields = {};
      }

      payslipData.push({
        employeeId: emp.id,
        payrollRunId: run.id,
        gross: taxResult.grossSalary,
        paye: taxResult.payeBeforeLevy,
        aidsLevy: taxResult.aidsLevy,
        nssaEmployee: taxResult.nssaEmployee,
        nssaEmployer: taxResult.nssaEmployer,
        nssaBasis: taxResult.nssaBasis,
        pensionApplied: taxResult.pensionApplied,
        // For dual-currency runs store the USD-side base so the payslip shows
        // a consistent USD figure regardless of the employee's primary currency.
        basicSalaryApplied: run.dualCurrency
          ? round2(emp.currency === 'USD' ? baseRate : baseRate / xr)
          : baseRate,
        wcifEmployer: taxResult.wcifEmployer,
        sdfContribution: taxResult.sdfContribution,
        zimdefEmployer: taxResult.zimdefEmployer,
        necLevy,
        necEmployer,
        loanDeductions,
        netPay: netPayAfterLoans,
        netPayUSD,
        netPayZIG,
        ...dualFields,
        // Statutory state tracking
        exemptBonus: taxResult.exemptBonus,
        exemptBonusUSD: taxResultUSD?.exemptBonus,
        exemptBonusZIG: taxResultZIG?.exemptBonus,
        exemptSeverance: taxResult.exemptSeverance,
        medicalAidCredit: taxResult.medicalAidCredit,
        taxCreditsApplied: taxResult.taxCreditsApplied,
      });

      // ── Save per-TC breakdown to PayrollTransaction ───────────────────────
      // Covers all inputs (explicit PayrollInput records) and salary-structure
      // defaults (EmployeeTransaction). Enables line-by-line display on payslips.
      const allEmpItems = [];

      // 1. Explicit Inputs
      for (const i of empInputs) {
        if (run.dualCurrency) {
          if ((i.employeeUSD || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: i.transactionCodeId,
              amount: i.employeeUSD,
              currency: 'USD',
            });
          }
          if ((i.employeeZiG || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: i.transactionCodeId,
              amount: i.employeeZiG,
              currency: 'ZiG',
            });
          }
        } else {
          const amt = toRunCcy(i.employeeUSD, i.employeeZiG);
          if (amt !== 0) {
            allEmpItems.push({
              transactionCodeId: i.transactionCodeId,
              amount: amt,
              currency: run.currency,
            });
          }
        }
      }

      // 2. Salary Structure Defaults
      for (const sd of empDefaults) {
        if (run.dualCurrency) {
          if (sd.currency === 'USD' && (sd.value || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: sd.transactionCodeId,
              amount: sd.value,
              currency: 'USD',
            });
          } else if (sd.currency === 'ZiG' && (sd.value || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: sd.transactionCodeId,
              amount: sd.value,
              currency: 'ZiG',
            });
          }
        } else {
          const amt = toRunCcy(sd.currency === 'USD' ? sd.value : 0, sd.currency === 'ZiG' ? sd.value : 0);
          if (amt !== 0) {
            allEmpItems.push({
              transactionCodeId: sd.transactionCodeId,
              amount: amt,
              currency: run.currency,
            });
          }
        }
      }

      for (const item of allEmpItems) {
        payrollTxData.push({
          employeeId: emp.id,
          payrollRunId: run.id,
          transactionCodeId: item.transactionCodeId,
          amount: item.amount,
          currency: item.currency,
        });
      }
    }

    // ── Determine which loans are fully paid off ──────────────────────────────
    // A loan is paid off only if it has no future unpaid repayments AND every due
    // repayment in this period was actually applied (not skipped due to insufficient net pay).
    const paidOffLoanIds = affectedLoanIds.filter((loanId) => {
      if (remainingRepaymentCounts[loanId] !== 0) return false;
      return allDueRepayments.filter((r) => r.loanId === loanId).every((r) => appliedRepaymentIds.has(r.id));
    });

    // ── Short transaction — bulk writes only ───────────────────────────────────

    const result = await prisma.$transaction(async (tx) => {
      // Reset loan data associated with this run before re-calculating
      const linkedRepaymentIds = allDueRepayments.filter(r => r.payrollRunId === run.id).map(r => r.id);
      if (linkedRepaymentIds.length > 0) {
        // Reset repayments to UNPAID
        await tx.loanRepayment.updateMany({
          where: { id: { in: linkedRepaymentIds } },
          data: { status: 'UNPAID', paidDate: null, payrollRunId: null },
        });

        // Reset associated loans to ACTIVE (if they were PAID_OFF)
        const loanIdsToReset = [...new Set(allDueRepayments.filter(r => r.payrollRunId === run.id).map(r => r.loanId))];
        await tx.loan.updateMany({
          where: { id: { in: loanIdsToReset } },
          data: { status: 'ACTIVE' },
        });
      }

      await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
      await tx.payrollTransaction.deleteMany({ where: { payrollRunId: run.id } });
      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'PROCESSING' } });

      await tx.payslip.createMany({ data: payslipData });
      if (payrollTxData.length > 0) {
        await tx.payrollTransaction.createMany({ data: payrollTxData });
      }

      if (allInputs.length > 0) {
        // Mark inputs as processed — retained for audit trail (ZIMRA may request source data).
        // NOTE: Indefinite transaction codes are NOT marked as processed so they repeat in following months.
        const idsToProcess = allInputs.filter(i => i.duration !== 'Indefinite').map(i => i.id);
        if (idsToProcess.length > 0) {
          await tx.payrollInput.updateMany({
            where: { id: { in: idsToProcess } },
            data: { processed: true, payrollRunId: run.id },
          });
        }
      }

      if (appliedRepaymentIds.size > 0) {
        await tx.loanRepayment.updateMany({
          where: { id: { in: [...appliedRepaymentIds] } },
          data: { status: 'PAID', paidDate: now, payrollRunId: run.id },
        });
      }

      if (paidOffLoanIds.length > 0) {
        await tx.loan.updateMany({
          where: { id: { in: paidOffLoanIds } },
          data: { status: 'PAID_OFF' },
        });
      }

      await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'COMPLETED' } });
      return { count: payslipData.length };
    });

    await audit({
      req,
      action: 'PAYROLL_RUN_PROCESSED',
      resource: 'payroll_run',
      resourceId: run.id,
      details: { employeeCount: result.count, currency: run.currency },
    });

    res.json({ message: 'Payroll processed successfully', runId: run.id, count: result.count });
  } catch (error) {
    // Mark run as ERROR if processing fails
    await prisma.payrollRun.update({
      where: { id: req.params.runId },
      data: { status: 'ERROR' },
    }).catch(() => { });
    console.error('Payroll process error:', error);
    res.status(500).json({ message: 'Payroll processing failed' });
  }
});

// ─── GET /api/payroll/:runId/reconcile — year-end PAYE reconciliation ────────
/**
 * Compares the sum of monthly PAYE deducted through the year against the
 * correct annual tax on the employee's cumulative income.  Any shortfall or
 * overpayment is returned as an adjustment figure for the final payslip.
 *
 * Query params: year (defaults to current year)
 * Only meaningful in December (month 12) or the last payroll run of the year.
 */
router.get('/:runId/reconcile', requirePermission('process_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { company: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const year = parseInt(req.query.year || new Date(run.startDate).getFullYear());
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59);

    // Fetch all COMPLETED payslips for this company in the given year
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: {
          companyId: req.companyId,
          status: 'COMPLETED',
          startDate: { gte: yearStart, lte: yearEnd },
        },
      },
      select: {
        employeeId: true,
        gross: true,
        paye: true,
        aidsLevy: true,
        nssaEmployee: true,
        wcifEmployer: true,
        sdfContribution: true,
        zimdefEmployer: true,
        necLevy: true,
        necEmployer: true,
        payrollRun: { select: { id: true, startDate: true } },
      },
      orderBy: { payrollRun: { startDate: 'asc' } },
    });

    // Aggregate per employee
    const byEmployee = {};
    for (const ps of payslips) {
      if (!byEmployee[ps.employeeId]) {
        byEmployee[ps.employeeId] = {
          cumulativeGross: 0, cumulativePaye: 0, cumulativeAidsLevy: 0, months: 0,
          totalWcif: 0,
          totalSdf: 0,
          totalZimdef: 0,
          totalNecLevy: 0,
          totalNecEmpr: 0,
        };
      }
      byEmployee[ps.employeeId].cumulativeGross += ps.gross ?? 0;
      byEmployee[ps.employeeId].cumulativePaye += ps.paye ?? 0;
      byEmployee[ps.employeeId].cumulativeAidsLevy += ps.aidsLevy ?? 0;
      byEmployee[ps.employeeId].months++;
      byEmployee[ps.employeeId].totalWcif += ps.wcifEmployer || 0;
      byEmployee[ps.employeeId].totalSdf += ps.sdfContribution || 0;
      byEmployee[ps.employeeId].totalZimdef += ps.zimdefEmployer || 0;
      byEmployee[ps.employeeId].totalNecLevy += ps.necLevy || 0;
      byEmployee[ps.employeeId].totalNecEmpr += ps.necEmployer || 0;
    }

    // Fetch tax table using same 3-tier logic as /process (active → period-matched → most recent)
    const { calculatePaye: calcPaye } = require('../utils/taxEngine');
    const fetchReconcileTaxTable = async (clientId, currency, date) => {
      const active = await prisma.taxTable.findFirst({
        where: { clientId, currency, isActive: true },
        include: { brackets: true },
      });
      if (active) return active;
      const matched = await prisma.taxTable.findFirst({
        where: { clientId, currency, effectiveDate: { lte: date }, OR: [{ expiryDate: null }, { expiryDate: { gte: date } }] },
        include: { brackets: true },
        orderBy: { effectiveDate: 'desc' },
      });
      if (matched) return matched;
      return prisma.taxTable.findFirst({
        where: { clientId, currency },
        include: { brackets: true },
        orderBy: { createdAt: 'desc' },
      });
    };
    const reconcileTaxTable = await fetchReconcileTaxTable(run.company.clientId, run.currency || 'USD', run.startDate);
    const taxBrackets = reconcileTaxTable?.brackets ?? [];
    const annualBracketsReconcile = taxBrackets.length > 0 && (reconcileTaxTable?.isAnnual ?? true);

    const employees = await prisma.employee.findMany({
      where: { id: { in: Object.keys(byEmployee) }, companyId: req.companyId },
      select: { id: true, firstName: true, lastName: true, employeeCode: true, taxCredits: true, taxDirectivePerc: true, taxDirectiveAmt: true, taxDirectiveEffective: true, taxDirectiveExpiry: true },
    });
    const empMap = Object.fromEntries(employees.map((e) => [e.id, e]));

    const results = [];

    for (const [empId, agg] of Object.entries(byEmployee)) {
      const emp = empMap[empId];
      if (!emp) continue;

      // Annual PAYE: calculate on full year's cumulative gross (annualBrackets already annualise internally)
      const annualResult = calcPaye({
        baseSalary: agg.cumulativeGross,
        currency: run.currency || 'USD',
        taxBrackets,
        annualBrackets: annualBracketsReconcile,
        taxCredits: (emp.taxCredits || 0) * agg.months,
        taxDirectivePerc: ((!emp.taxDirectiveEffective || new Date(emp.taxDirectiveEffective) <= yearEnd) &&
          (!emp.taxDirectiveExpiry || new Date(emp.taxDirectiveExpiry) >= yearStart))
          ? (emp.taxDirectivePerc || 0) : 0,
        taxDirectiveAmt: ((!emp.taxDirectiveEffective || new Date(emp.taxDirectiveEffective) <= yearEnd) &&
          (!emp.taxDirectiveExpiry || new Date(emp.taxDirectiveExpiry) >= yearStart))
          ? (emp.taxDirectiveAmt || 0) * agg.months : 0,
      });

      const correctAnnualPaye = annualResult.totalPaye;
      const deductedPaye = agg.cumulativePaye + agg.cumulativeAidsLevy;
      const adjustment = parseFloat((correctAnnualPaye - deductedPaye).toFixed(2));

      results.push({
        employeeId: empId,
        name: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        year,
        months: agg.months,
        cumulativeGross: parseFloat(agg.cumulativeGross.toFixed(2)),
        deductedPaye: parseFloat(deductedPaye.toFixed(2)),
        correctAnnualPaye: parseFloat(correctAnnualPaye.toFixed(2)),
        adjustment,
        adjustmentType: adjustment > 0 ? 'UNDERPAID' : adjustment < 0 ? 'OVERPAID' : 'BALANCED',
      });
    }

    const totalUnderpaid = results.filter((r) => r.adjustment > 0).reduce((s, r) => s + r.adjustment, 0);
    const totalOverpaid = results.filter((r) => r.adjustment < 0).reduce((s, r) => s + r.adjustment, 0);

    res.json({
      runId: run.id,
      year,
      currency: run.currency || 'USD',
      summary: {
        totalEmployees: results.length,
        totalUnderpaid: parseFloat(totalUnderpaid.toFixed(2)),
        totalOverpaid: parseFloat(totalOverpaid.toFixed(2)),
        note: 'Apply adjustments as PAYE_ADJUSTMENT PayrollInputs on the final run of the year.',
      },
      results,
    });
  } catch (error) {
    console.error('Year-end reconciliation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId/input-reconciliation — payslip vs inputs match ──
/**
 * Compares the PayrollInput totals for each employee against their payslip
 * gross and flags any discrepancies (e.g. inputs processed into the wrong run,
 * rounding drift, or missing inputs).
 */
router.get('/:runId/input-reconciliation', requirePermission('process_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      select: { id: true, companyId: true, currency: true, exchangeRate: true, dualCurrency: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const [payslips, inputs] = await Promise.all([
      prisma.payslip.findMany({
        where: { payrollRunId: run.id },
        select: {
          employeeId: true, gross: true, paye: true, nssaEmployee: true, netPay: true,
          employee: { select: { firstName: true, lastName: true, employeeCode: true } }
        },
      }),
      prisma.payrollInput.findMany({
        where: { payrollRunId: run.id, processed: true },
        include: { transactionCode: { select: { type: true } } },
      }),
    ]);

    const xr = run.exchangeRate || 1;
    const toRunCcy = (usd, zig) => run.currency === 'ZiG'
      ? (zig || 0) + (usd || 0) * xr
      : (usd || 0) + (zig || 0) / xr;

    // Sum inputs per employee
    const inputTotals = {};
    for (const inp of inputs) {
      const tc = inp.transactionCode;
      const amt = run.dualCurrency
        ? (inp.employeeUSD || 0)
        : toRunCcy(inp.employeeUSD, inp.employeeZiG);
      if (!inputTotals[inp.employeeId]) inputTotals[inp.employeeId] = { earnings: 0, deductions: 0 };
      if (tc.type === 'EARNING' || tc.type === 'BENEFIT') inputTotals[inp.employeeId].earnings += amt;
      else if (tc.type === 'DEDUCTION') inputTotals[inp.employeeId].deductions += amt;
    }

    const results = payslips.map((ps) => {
      const inp = inputTotals[ps.employeeId] || { earnings: 0, deductions: 0 };
      const grossDiff = parseFloat((ps.gross - inp.earnings).toFixed(4));
      return {
        employeeId: ps.employeeId,
        name: `${ps.employee.firstName} ${ps.employee.lastName}`,
        employeeCode: ps.employee.employeeCode,
        payslipGross: ps.gross,
        inputEarnings: parseFloat(inp.earnings.toFixed(2)),
        diff: grossDiff,
        status: Math.abs(grossDiff) < 0.01 ? 'OK' : 'MISMATCH',
      };
    });

    const mismatches = results.filter((r) => r.status === 'MISMATCH');

    res.json({
      runId: run.id,
      currency: run.currency,
      summary: { total: results.length, ok: results.length - mismatches.length, mismatches: mismatches.length },
      results,
    });
  } catch (error) {
    console.error('Input reconciliation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId ───────────────────────────────────────────────────

router.get('/:runId', async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: {
        payslips: {
          include: { employee: { select: { firstName: true, lastName: true, position: true } } },
        },
        _count: { select: { payslips: true } },
        payrollCalendar: true,
      },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    res.json(run);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/payroll/:runId ──────────────────────────────────────────────────

router.put('/:runId', requirePermission('approve_payroll'), async (req, res) => {
  const { status, notes } = req.body;
  const VALID_TRANSITIONS = {
    DRAFT: ['PENDING_APPROVAL', 'APPROVED'],
    PENDING_APPROVAL: ['APPROVED', 'DRAFT'],
    APPROVED: ['DRAFT'],
  };

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { payrollCalendar: true }
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (run.payrollCalendar?.isClosed) {
      return res.status(400).json({ message: 'Cannot update a payroll run for a closed period' });
    }
    const overlappingClosedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: run.company?.clientId,
        isClosed: true,
        startDate: { lte: run.endDate },
        endDate: { gte: run.startDate },
      },
    });
    if (overlappingClosedCal) {
      return res.status(400).json({ message: 'A closed calendar period overlaps with this payroll run dates' });
    }

    if (status && VALID_TRANSITIONS[run.status] && !VALID_TRANSITIONS[run.status].includes(status)) {
      return res.status(400).json({
        message: `Cannot transition from ${run.status} to ${status}`,
      });
    }

    const updated = await prisma.payrollRun.update({
      where: { id: run.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
      },
    });

    if (status) {
      await audit({ req, action: `PAYROLL_STATUS_${status}`, resource: 'payroll_run', resourceId: run.id });
    }

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Payroll run not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── DELETE /api/payroll/:runId — DRAFT only ─────────────────────────────────

router.delete('/:runId', requirePermission('manage_payroll'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status !== 'DRAFT') return res.status(400).json({ message: 'Only DRAFT runs can be deleted' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.payrollRun.delete({ where: { id: run.id } });
    await audit({ req, action: 'PAYROLL_RUN_DELETED', resource: 'payroll_run', resourceId: run.id });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId/payslips ─────────────────────────────────────────

router.get('/:runId/payslips', async (req, res) => {
  try {
    const [payslips, transactions] = await Promise.all([
      prisma.payslip.findMany({
        where: { payrollRunId: req.params.runId },
        include: {
          employee: {
            select: { firstName: true, lastName: true, position: true, employeeCode: true, currency: true, baseRate: true },
          },
        },
        orderBy: [{ employee: { lastName: 'asc' } }],
      }),
      prisma.payrollTransaction.findMany({
        where: { payrollRunId: req.params.runId },
        include: { transactionCode: { select: { type: true, code: true, name: true, preTax: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    // Group transactions by employeeId
    const txByEmp = {};
    for (const t of transactions) {
      (txByEmp[t.employeeId] = txByEmp[t.employeeId] || []).push(t);
    }

    const result = payslips.map((p) => {
      const empTxs = txByEmp[p.employeeId] || [];
      const earningTxs = empTxs.filter(
        (t) => t.transactionCode.type === 'EARNING' || t.transactionCode.type === 'BENEFIT'
      );
      const deductionTxs = empTxs.filter(
        (t) => t.transactionCode.type === 'DEDUCTION'
      );
      return {
        ...p,
        basicSalary: p.employee?.baseRate ?? 0,
        allowancesTotal: earningTxs.reduce((s, t) => s + t.amount, 0),
        earningLines: earningTxs.map((t) => ({
          tcId: t.transactionCodeId,
          code: t.transactionCode.code,
          name: t.transactionCode.name,
          amount: t.amount,
          currency: t.currency,
        })),
        deductionLines: deductionTxs.map((t) => ({
          tcId: t.transactionCodeId,
          code: t.transactionCode.code,
          name: t.transactionCode.name,
          amount: t.amount,
          currency: t.currency,
        })),
      };
    });

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId/payslips/:id/pdf ─────────────────────────────────

router.get('/:runId/payslips/:id/pdf', async (req, res) => {
  try {
    const payslip = await prisma.payslip.findUnique({
      where: { id: req.params.id },
      include: {
        employee: true,
        payrollRun: { include: { company: true } },
      },
    });

    if (!payslip) return res.status(404).json({ message: 'Payslip not found' });
    if (req.companyId && payslip.payrollRun.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (req.user.role === 'EMPLOYEE' && req.employeeId && payslip.employeeId !== req.employeeId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const result = await payslipToBuffer(req.params.id);
    if (!result) return res.status(404).json({ message: 'Payslip not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=payslip-${result.employeeName.replace(/\s+/g, '-')}.pdf`
    );
    res.send(result.buffer);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * Shared logic to build the professional table lines with YTD data.
 */
// buildPayslipLineItems refactored to ../utils/payslipFormatter.js

// ─── GET /api/payroll/:runId/summary/pdf ─────────────────────────────────────

router.get('/:runId/summary/pdf', requirePermission('export_reports'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { company: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      include: {
        employee: {
          include: { department: true }
        }
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    // Fetch transactions for this run to provide breakdown (pension vs other)
    const transactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: run.id },
      include: { transactionCode: { select: { type: true, incomeCategory: true, preTax: true } } },
    });
    const txByPayslip = {};
    for (const t of transactions) {
      const key = `${t.employeeId}`;
      if (!txByPayslip[key]) txByPayslip[key] = { pension: 0, otherDeductions: 0 };

      const isPension = t.transactionCode.incomeCategory === 'PENSION';
      if (t.transactionCode.type === 'DEDUCTION') {
        if (isPension) txByPayslip[key].pension += t.amount;
        else txByPayslip[key].otherDeductions += t.amount;
      }
    }

    // Grouping by Department/CostCenter (Belina style)
    const groupsMap = {};
    for (const ps of payslips) {
      const gName = ps.employee.department?.name || ps.employee.costCenter || 'General';
      if (!groupsMap[gName]) groupsMap[gName] = [];

      // Inject breakdown into payslip object for the PDF generator
      const breakdown = txByPayslip[ps.employeeId] || { pension: 0, otherDeductions: 0 };
      groupsMap[gName].push({
        ...ps,
        pensionActual: breakdown.pension,
        otherDeductionsActual: breakdown.otherDeductions,
      });
    }
    const sortedGroups = Object.keys(groupsMap).sort().map(name => ({
      name,
      payslips: groupsMap[name]
    }));

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Master-Roll-${run.id}.pdf`);

    generatePayrollSummaryPDF({
      companyName: run.company?.name || 'Master Roll',
      period: `${run.startDate.toLocaleDateString()} – ${run.endDate.toLocaleDateString()}`,
      currency: run.dualCurrency ? 'USD + ZiG' : (run.currency || 'USD'),
      groups: sortedGroups,
    }, res);
  } catch (error) {
    console.error('Payroll summary PDF error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
  }
});

// ─── GET /api/payroll/:runId/payslip-summary ─────────────────────────────
router.get('/:runId/payslip-summary', requirePermission('export_reports'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      include: { company: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      include: {
        employee: { include: { department: true } },
        transactions: { include: { transactionCode: true } }
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const groupsMap = {};
    for (const ps of payslips) {
      const gName = ps.employee.department?.name || ps.employee.costCenter || 'General';
      if (!groupsMap[gName]) groupsMap[gName] = [];
      
      const basicSalary = (ps.basicSalaryApplied > 0)
        ? ps.basicSalaryApplied
        : (ps.employee.baseRate ?? 0);

      const displayLines = buildPayslipLineItems({ 
        payslip: ps, 
        transactions: ps.transactions,
        basicSalary,
        ytdStat: {}, 
        ytdMap: {}
      }); 

      groupsMap[gName].push({
        ...ps,
        displayLines
      });
    }

    const sortedGroups = Object.keys(groupsMap).sort().map(name => ({
      name,
      payslips: groupsMap[name]
    }));

    const buffer = await generatePayslipSummaryBuffer({
      companyName: run.company?.name || 'Bantu - HR & Payroll',
      period: `${run.startDate.getFullYear()}/${(run.startDate.getMonth() + 1).toString().padStart(2, '0')}`,
      groups: sortedGroups,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Payslip-Summary-${run.id}.pdf`);
    res.send(buffer);

  } catch (error) {
    console.error('Payslip Summary error:', error);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to generate PDF' });
  }
});

// ─── GET /api/payroll/:runId/export — CSV ────────────────────────────────────

router.get('/:runId/export', requirePermission('export_reports'), async (req, res) => {
  try {
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: req.params.runId },
      include: { employee: true },
    });

    const header = 'Employee Code,Name,Position,Gross,PAYE,AIDS Levy,NSSA,Loan Deductions,Net Pay,Currency\n';
    const rows = payslips.map((p) =>
      [
        p.employee.employeeCode || '',
        `${p.employee.firstName} ${p.employee.lastName}`,
        p.employee.position,
        p.gross.toFixed(2),
        p.paye.toFixed(2),
        p.aidsLevy.toFixed(2),
        p.nssaEmployee.toFixed(2),
        (p.loanDeductions || 0).toFixed(2),
        p.netPay.toFixed(2),
        p.employee.currency || 'USD',
      ].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=payroll-export-${req.params.runId}.csv`);
    res.send(header + rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/payroll/:runId/variance — period-on-period comparison ──────────
/**
 * Compares each employee's payslip between the current run and the most recent
 * prior completed run for the same company.  Returns per-employee deltas and
 * flags any employee whose gross changed by more than `threshold` % (default 10).
 *
 * This is the standard payroll-control check run before every pay-day in
 * Belina, Sage Payroll and PaySpace.  Use it to catch:
 *   - Salary changes not signed off
 *   - Missing or duplicated inputs
 *   - New starters / leavers
 *   - Overtime or bonus outliers
 */
router.get('/:runId/variance', requirePermission('process_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: req.params.runId },
      select: { id: true, companyId: true, startDate: true, currency: true, dualCurrency: true, status: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const threshold = parseFloat(req.query.threshold ?? '10'); // % change that triggers a flag

    // Most-recent prior completed run for this company
    const priorRun = await prisma.payrollRun.findFirst({
      where: {
        companyId: req.companyId,
        status: 'COMPLETED',
        startDate: { lt: run.startDate },
      },
      orderBy: { startDate: 'desc' },
    });

    const [currentPayslips, priorPayslips] = await Promise.all([
      prisma.payslip.findMany({
        where: { payrollRunId: run.id },
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      }),
      priorRun
        ? prisma.payslip.findMany({
          where: { payrollRunId: priorRun.id },
          include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
        })
        : Promise.resolve([]),
    ]);

    const priorMap = Object.fromEntries(priorPayslips.map((p) => [p.employeeId, p]));
    const currentEmpIds = new Set(currentPayslips.map((p) => p.employeeId));

    // ── Current employees ──────────────────────────────────────────────────
    const results = currentPayslips.map((cur) => {
      const prior = priorMap[cur.employeeId] ?? null;
      const pGross = prior?.gross ?? null;
      const grossDelta = prior != null ? parseFloat((cur.gross - prior.gross).toFixed(2)) : null;
      const payeDelta = prior != null ? parseFloat((cur.paye - prior.paye).toFixed(2)) : null;
      const nssaDelta = prior != null ? parseFloat((cur.nssaEmployee - prior.nssaEmployee).toFixed(2)) : null;
      const netDelta = prior != null ? parseFloat((cur.netPay - prior.netPay).toFixed(2)) : null;
      const pctChange = pGross != null && pGross !== 0
        ? parseFloat(((grossDelta / pGross) * 100).toFixed(2))
        : null;

      return {
        employeeId: cur.employeeId,
        employeeCode: cur.employee.employeeCode,
        name: `${cur.employee.firstName} ${cur.employee.lastName}`,
        status: prior ? 'EXISTING' : 'NEW',
        current: { gross: cur.gross, paye: cur.paye, aidsLevy: cur.aidsLevy, nssaEmployee: cur.nssaEmployee, netPay: cur.netPay },
        prior: prior ? { gross: prior.gross, paye: prior.paye, aidsLevy: prior.aidsLevy, nssaEmployee: prior.nssaEmployee, netPay: prior.netPay } : null,
        delta: { gross: grossDelta, paye: payeDelta, nssa: nssaDelta, net: netDelta, pct: pctChange },
        flagged: pctChange != null ? Math.abs(pctChange) >= threshold : prior === null,
      };
    });

    // ── Employees in prior run but absent from current (leavers) ──────────
    const terminatedRows = priorPayslips
      .filter((p) => !currentEmpIds.has(p.employeeId))
      .map((p) => ({
        employeeId: p.employeeId,
        employeeCode: p.employee?.employeeCode ?? null,
        name: p.employee ? `${p.employee.firstName} ${p.employee.lastName}` : null,
        status: 'TERMINATED',
        current: null,
        prior: { gross: p.gross, paye: p.paye, aidsLevy: p.aidsLevy, nssaEmployee: p.nssaEmployee, netPay: p.netPay },
        delta: { gross: -p.gross, paye: -p.paye, nssa: -p.nssaEmployee, net: -p.netPay, pct: -100 },
        flagged: true,
      }));

    const allResults = [...results, ...terminatedRows]
      .sort((a, b) => Math.abs(b.delta.gross ?? 0) - Math.abs(a.delta.gross ?? 0));

    res.json({
      runId: run.id,
      priorRunId: priorRun?.id ?? null,
      currency: run.currency,
      threshold,
      summary: {
        total: allResults.length,
        flagged: allResults.filter((r) => r.flagged).length,
        newEmployees: allResults.filter((r) => r.status === 'NEW').length,
        terminated: allResults.filter((r) => r.status === 'TERMINATED').length,
        note: priorRun
          ? `Compared against run ${priorRun.id} (${new Date(priorRun.startDate).toLocaleDateString()}). Employees with gross change ≥ ${threshold}% are flagged.`
          : 'No prior completed run found — all employees shown as NEW.',
      },
      results: allResults,
    });
  } catch (error) {
    console.error('Comparison error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

/**
 * GET /api/payroll/:runId/payslip-summary — PDF
 * Generates a detailed block-style summary grouped by department.
 */

// ─── Payslip Send Helpers ─────────────────────────────────────────────────────

/**
 * Fetches all data for a payslip, generates the PDF, and returns a buffer
 * along with metadata needed for the email (recipient address, names, period).
 */
// payslipToBuffer refactored to ../utils/payslipFormatter.js

// ─── POST /api/payroll/:runId/payslips/:id/send ───────────────────────────────

router.post('/:runId/payslips/:id/send', requirePermission('export_reports'), async (req, res) => {
  try {
    const result = await payslipToBuffer(req.params.id);
    if (!result) return res.status(404).json({ message: 'Payslip not found' });
    if (req.companyId && result.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (!result.email) {
      return res.status(400).json({ message: 'Employee has no email address on file' });
    }

    await sendPayslip(result.email, {
      employeeName: result.employeeName,
      companyName: result.companyName,
      period: result.period,
      pdfBuffer: result.buffer,
    });

    res.json({ message: 'Payslip sent', to: result.email });
  } catch (error) {
    console.error('Send payslip error:', error);
    res.status(500).json({ message: 'Failed to send payslip' });
  }
});

// ─── POST /api/payroll/:runId/send-all ────────────────────────────────────────

router.post('/:runId/send-all', requirePermission('export_reports'), async (req, res) => {
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: req.params.runId } });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (req.companyId && run.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Fetch all payslip IDs for this run
    const payslipIds = (await prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      select: { id: true },
    })).map((p) => p.id);

    if (payslipIds.length === 0) {
      return res.status(400).json({ message: 'No payslips found for this run' });
    }

    // Queue a job for each payslip
    await prisma.job.createMany({
      data: payslipIds.map(id => ({
        type: 'EMAIL_PAYSLIP',
        payload: { payslipId: id },
        status: 'PENDING',
      })),
    });

    await audit({
      req,
      action: 'BULK_PAYSLIP_EMAILS_QUEUED',
      resource: 'payroll_run',
      resourceId: run.id,
      details: { count: payslipIds.length },
    });

    res.json({
      message: `${payslipIds.length} payslip emails have been queued and will be sent in the background.`,
      count: payslipIds.length
    });
  } catch (error) {
    console.error('Queue bulk payslips error:', error);
    res.status(500).json({ message: 'Failed to queue payslip emails' });
  }
});

module.exports = router;
