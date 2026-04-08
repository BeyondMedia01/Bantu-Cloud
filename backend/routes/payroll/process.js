const express = require('express');
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/permissions');
const { calculatePaye, calculateSplitSalaryPaye, grossUpNet } = require('../../utils/taxEngine');
const { generatePayrollSummaryPDF, generatePayslipSummaryPDF, generatePayslipSummaryBuffer } = require('../../utils/pdfService');
const { getSettings } = require('../../lib/systemSettings');
const { audit } = require('../../lib/audit');
const { validateBody } = require('../../lib/validate');
const { sendPayslip } = require('../../lib/mailer');
const { getYtdStartDate } = require('../../utils/ytdCalculator');
const { payslipToBuffer, buildPayslipLineItems } = require('../../utils/payslipFormatter');

const router = express.Router({ mergeParams: true });

// ─── POST /api/payroll/preview — real-time PAYE estimate ─────────────────────
// Body: { inputs: [{employeeId, transactionCodeId, amount}], currency }
// Returns: [{employeeId, gross, paye, aidsLevy, nssa, net}]
// Note: must be declared BEFORE /:runId routes so "preview" isn't treated as a runId.

router.post('/preview', requirePermission('process_payroll'), async (req, res) => {
  const { inputs, currency = 'USD' } = req.body;
  if (!inputs?.length) return res.json({ data: [] });

  try {
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

    if (!taxBrackets || taxBrackets.length === 0) {
      return res.status(422).json({ error: 'No tax brackets configured for this company' })
    }

    const previewSettings = await getSettings([
      'AIDS_LEVY_RATE', 'MEDICAL_AID_CREDIT_RATE', 'NSSA_EMPLOYEE_RATE',
      'NSSA_CEILING_USD', 'NSSA_CEILING_ZIG',
    ]);
    const ps = (key) => parseFloat(previewSettings[key] ?? 0);

    const previewAidsLevyRate = ps('AIDS_LEVY_RATE') / 100;
    const previewMedicalAidCreditRate = ps('MEDICAL_AID_CREDIT_RATE') / 100;
    const previewNssaEmployeeRate = ps('NSSA_EMPLOYEE_RATE') / 100;
    const previewNssaCeilingUSD = ps('NSSA_CEILING_USD');

    // For ZiG payrolls, derive the NSSA ceiling dynamically from the RBZ prevailing rate:
    // ZiG ceiling = USD ceiling × most recent USD→ZiG rate for this company.
    // Falls back to NSSA_CEILING_ZIG setting if no currency rate record exists.
    let previewNssaCeiling = previewNssaCeilingUSD;
    if (currency === 'ZiG' && req.companyId) {
      const latestRate = await prisma.currencyRate.findFirst({
        where: {
          companyId: req.companyId,
          fromCurrency: 'USD',
          toCurrency: 'ZiG',
          effectiveDate: { lte: new Date() },
        },
        orderBy: { effectiveDate: 'desc' },
      });
      previewNssaCeiling = latestRate
        ? previewNssaCeilingUSD * latestRate.rate
        : ps('NSSA_CEILING_ZIG');
    }

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
          (tc.incomeCategory === 'MEDICAL_AID' ||
            /medical\s*aid|med\s*aid/i.test(tcName) ||
            /MED_AID|MEDICAL_AID/i.test(tcCode) ||
            (tcName.toLowerCase().includes('medical') && /^\d+$/.test(tcCode)));

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

    res.json({ data: results });
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
    if (run.currency === 'ZiG') {  // dualCurrency runs consolidate into USD — ZiG table not needed
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
    // Apportionment method: dual-currency runs consolidate all earnings into USD first,
    // so only the USD tax table is required. No separate ZiG table is needed.

    // Load all payroll settings in a single DB query — no hardcoded fallbacks.
    // Values are seeded by autoSeedSystemSettings() on server start.
    const settings = await getSettings([
      'NSSA_CEILING_USD', 'NSSA_CEILING_ZIG',
      'BONUS_EXEMPTION_USD', 'BONUS_EXEMPTION_ZIG',
      'SEVERANCE_EXEMPTION_USD', 'SEVERANCE_EXEMPTION_ZIG',
      'WCIF_RATE', 'SDF_RATE',
      'NSSA_EMPLOYEE_RATE', 'NSSA_EMPLOYER_RATE',
      'AIDS_LEVY_RATE', 'MEDICAL_AID_CREDIT_RATE',
      'PENSION_CAP_USD', 'PENSION_CAP_ZIG',
      'LOAN_PRESCRIBED_RATE_USD', 'LOAN_PRESCRIBED_RATE_ZIG',
      'ELDERLY_TAX_CREDIT_USD', 'ELDERLY_TAX_CREDIT_ZIG',
      'VEHICLE_BENEFIT_CC_1500_USD', 'VEHICLE_BENEFIT_CC_2000_USD', 'VEHICLE_BENEFIT_ABOVE_2000_USD',
      'VEHICLE_BENEFIT_CC_1500_ZIG', 'VEHICLE_BENEFIT_CC_2000_ZIG', 'VEHICLE_BENEFIT_ABOVE_2000_ZIG',
      'ZIMDEF_RATE',
      'WORKING_DAYS_PER_PERIOD', 'WORKING_DAYS_PER_MONTH',
    ]);
    const s = (key) => parseFloat(settings[key] ?? 0);

    const nssaCeilingUSD = s('NSSA_CEILING_USD');
    const nssaCeilingZIG = s('NSSA_CEILING_ZIG');
    const nssaCeiling = run.currency === 'ZiG' ? nssaCeilingZIG : nssaCeilingUSD;

    const bonusExemptionUSD = s('BONUS_EXEMPTION_USD');
    const bonusExemptionZIG = s('BONUS_EXEMPTION_ZIG');
    const bonusExemption = run.currency === 'ZiG' ? bonusExemptionZIG : bonusExemptionUSD;

    const severanceExemptionUSD = s('SEVERANCE_EXEMPTION_USD');
    const severanceExemptionZIG = s('SEVERANCE_EXEMPTION_ZIG');
    const severanceExemption = run.currency === 'ZiG' ? severanceExemptionZIG : severanceExemptionUSD;

    // Industry-specific WCIF and SDF rates: company setting overrides global SystemSetting
    const globalWcifRate = s('WCIF_RATE') / 100;
    const globalSdfRate = s('SDF_RATE') / 100;
    const wcifRate = run.company.wcifRate != null ? run.company.wcifRate / 100 : globalWcifRate;
    const sdfRate = run.company.sdfRate != null ? run.company.sdfRate / 100 : globalSdfRate;

    const nssaEmployeeRate = s('NSSA_EMPLOYEE_RATE') / 100;
    const nssaEmployerRate = s('NSSA_EMPLOYER_RATE') / 100;

    const aidsLevyRate = s('AIDS_LEVY_RATE') / 100;
    const medicalAidCreditRate = s('MEDICAL_AID_CREDIT_RATE') / 100;

    const pensionCapUSD = s('PENSION_CAP_USD');
    const pensionCapZIG = s('PENSION_CAP_ZIG');

    const prescribedRateUSD = s('LOAN_PRESCRIBED_RATE_USD');
    const prescribedRateZIG = s('LOAN_PRESCRIBED_RATE_ZIG');
    const currentPrescribedRate = run.currency === 'ZiG' ? prescribedRateZIG : prescribedRateUSD;

    const elderlyCreditUSD = s('ELDERLY_TAX_CREDIT_USD');
    const elderlyCreditZIG = s('ELDERLY_TAX_CREDIT_ZIG');

    // Vehicle benefit lookup by engine capacity category (ZIMRA deemed benefit table)
    const vehicleBenefitTable = {
      USD: {
        UP_TO_1500CC:    s('VEHICLE_BENEFIT_CC_1500_USD'),
        CC_1501_TO_2000: s('VEHICLE_BENEFIT_CC_2000_USD'),
        ABOVE_2000CC:    s('VEHICLE_BENEFIT_ABOVE_2000_USD'),
      },
      ZiG: {
        UP_TO_1500CC:    s('VEHICLE_BENEFIT_CC_1500_ZIG'),
        CC_1501_TO_2000: s('VEHICLE_BENEFIT_CC_2000_ZIG'),
        ABOVE_2000CC:    s('VEHICLE_BENEFIT_ABOVE_2000_ZIG'),
      },
    };
    const resolveVehicleBenefit = (emp, runCurrency) => {
      const cat = emp.vehicleEngineCategory;
      if (!cat || cat === 'NONE') return emp.motorVehicleBenefit || 0;
      const ccy = runCurrency === 'ZiG' ? 'ZiG' : 'USD';
      return vehicleBenefitTable[ccy][cat] ?? emp.motorVehicleBenefit ?? 0;
    };

    const globalZimdefRate = s('ZIMDEF_RATE') / 100;
    const zimdefRate = run.company.zimdefRate != null ? run.company.zimdefRate / 100 : globalZimdefRate;

    // Working days — order of precedence: Employee.daysPerPeriod > WORKING_DAYS_PER_PERIOD > WORKING_DAYS_PER_MONTH
    const workingDaysPerPeriodDefault = s('WORKING_DAYS_PER_PERIOD') || s('WORKING_DAYS_PER_MONTH');

    const employees = await prisma.employee.findMany({
      where: { companyId: run.companyId },
      select: {
        id: true, employeeCode: true, firstName: true, lastName: true,
        baseRate: true, currency: true, taxMethod: true,
        taxDirectivePerc: true, taxDirectiveAmt: true,
        hoursPerPeriod: true, daysPerPeriod: true,
        paymentBasis: true, rateSource: true,
        necGradeId: true, gradeId: true,
        splitUsdPercent: true, motorVehicleBenefit: true,
        vehicleEngineCategory: true,
        grossingUp: true,
        leaveBalance: true, leaveTaken: true,
        necGrade: { select: { id: true, minRate: true, necLevyRate: true } },
      },
    });

    if (employees.length === 0) {
      return res.status(400).json({ message: 'No employees found for this company' });
    }

    const adjustments = req.body?.adjustments || {};
    const xr = (run.exchangeRate > 0) ? run.exchangeRate : 1;

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
      include: { transactionCode: { select: { type: true, taxable: true, preTax: true, affectsNssa: true, affectsPaye: true, name: true, code: true, incomeCategory: true, defaultValue: true, deemedBenefitPercent: true } } },
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
      include: { transactionCode: { select: { type: true, taxable: true, preTax: true, affectsNssa: true, affectsPaye: true, name: true, code: true, incomeCategory: true, defaultValue: true, deemedBenefitPercent: true } } },
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
      orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],  // secondary key ensures deterministic order for same-date repayments
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
      // Use Zimbabwe tax year boundary (April 1), adjusted for mid-year company starts
      const firstRunRecord = await prisma.payrollRun.findFirst({
        where: { companyId: run.companyId },
        orderBy: { startDate: 'asc' },
        select: { startDate: true },
      });
      const yearStart = getYtdStartDate(run.startDate, firstRunRecord?.startDate ?? null);
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
      console.log(`[PAYE DEBUG] ${emp.firstName} ${emp.lastName} | inputs: ${empInputs.map(i => `${i.transactionCode?.name}(USD:${i.employeeUSD},ZiG:${i.employeeZiG})`).join(', ')} | defaults: ${empDefaults.map(d => `${d.transactionCode?.name}(${d.value} ${d.currency})`).join(', ')}`);
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
          const loanRate = (loan.interestRate != null && !isNaN(loan.interestRate)) ? loan.interestRate : 0;
          if (loanRate < empPrescribedRate) {
            const paidAmt = loan.repayments.reduce((sum, r) => sum + (r.amount || 0), 0);
            const currentBalance = Math.max(0, loan.amount - paidAmt);
            if (currentBalance > 0) {
              const monthlyBenefit = (currentBalance * (empPrescribedRate - loanRate)) / 100 / 12;
              if (emp.currency === 'USD') totalLoanBenefitUSD += monthlyBenefit;
              else totalLoanBenefitZIG += monthlyBenefit;
            }
          }
        }
      } else {
        for (const loan of empLoans) {
          const loanRate = (loan.interestRate != null && !isNaN(loan.interestRate)) ? loan.interestRate : 0;
          if (loanRate < currentPrescribedRate) {
            const paidAmt = loan.repayments.reduce((sum, r) => sum + (r.amount || 0), 0);
            const currentBalance = Math.max(0, loan.amount - paidAmt);
            if (currentBalance > 0) {
              const monthlyBenefit = (currentBalance * (currentPrescribedRate - loanRate)) / 100 / 12;
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
          const divisor = emp.daysPerPeriod || workingDaysPerPeriodDefault;
          const dayRate = emp.baseRate / divisor;
          const amt = round2(dayRate * i.units);
          if (emp.currency === 'ZiG') i.employeeZiG = amt;
          else i.employeeUSD = amt;
        }
      }

      // Auto-calculate OVERTIME TCs if hours (units) are entered but monetary amounts are zero.
      // hourlyRate = dayRate / 8  (assumes 8-hour working day).
      // The overtime multiplier is taken from tc.defaultValue (e.g. 1.5 for time-and-a-half);
      // defaults to 1.5 if not configured on the transaction code.
      for (const i of empInputs) {
        const tc = i.transactionCode;
        const isOvertime = tc.incomeCategory === 'OVERTIME' || tc.name.toLowerCase().includes('overtime');
        
        if (isOvertime && i.units > 0 && (i.employeeUSD || 0) === 0 && (i.employeeZiG || 0) === 0) {
          const divisor = emp.daysPerPeriod || workingDaysPerPeriodDefault;
          const dayRate = emp.baseRate / divisor;
          const hourlyRate = dayRate / 8;
          // Use defaultValue if set; otherwise try to parse multiplier from the TC name (e.g. "Overtime 1.0x" → 1.0)
          const nameMatch = tc.name.match(/(\d+(?:\.\d+)?)x/i);
          const multiplier = tc.defaultValue != null ? parseFloat(tc.defaultValue) : (nameMatch ? parseFloat(nameMatch[1]) : 1.5);
          const amt = round2(hourlyRate * i.units * multiplier);
          
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
            if (tc.affectsPaye === false || tc.taxable === false) {
              inputPayeExcludedUSD += input.employeeUSD || 0;
              inputPayeExcludedZIG += input.employeeZiG || 0;
            }
            if (isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100) {
              const exemptFraction = (100 - tc.deemedBenefitPercent) / 100;
              inputPayeExcludedUSD += (input.employeeUSD || 0) * exemptFraction;
              inputPayeExcludedZIG += (input.employeeZiG || 0) * exemptFraction;
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
            if (tc.affectsPaye === false || tc.taxable === false) inputPayeExcluded += amt;
            if (isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100) {
              const exemptFraction = (100 - tc.deemedBenefitPercent) / 100;
              inputPayeExcluded += amt * exemptFraction;
            }
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
            if (tc.affectsPaye === false || tc.taxable === false) {
              inputPayeExcludedUSD += empUSD;
              inputPayeExcludedZIG += empZIG;
            }
            if (isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100) {
              const exemptFraction = (100 - tc.deemedBenefitPercent) / 100;
              inputPayeExcludedUSD += empUSD * exemptFraction;
              inputPayeExcludedZIG += empZIG * exemptFraction;
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
            if (tc.affectsPaye === false || tc.taxable === false) inputPayeExcluded += amt;
            if (isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100) {
              const exemptFraction = (100 - tc.deemedBenefitPercent) / 100;
              inputPayeExcluded += amt * exemptFraction;
            }
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
        const wDays = emp.daysPerPeriod || workingDaysPerPeriodDefault || 22;
        if (unpaidDays >= wDays) {
          effectiveBaseRate = 0;
        } else {
          effectiveBaseRate = emp.baseRate * (1 - unpaidDays / wDays);
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

      // Gross-up: employer absorbs employee PAYE. Solve for gross where employee nets their base salary.
      // targetNet = baseSalary + cappedPension + medicalAid so only PAYE is absorbed by employer.
      const effectiveBaseSalary = emp.grossingUp
        ? (() => {
            const isZIG = run.currency === 'ZiG';
            const pensionContribution = (adj.pensionContribution || 0) + (isZIG ? inputPensionZIG : inputPensionUSD || inputPension);
            const pensionCap = isZIG ? (pensionCapZIG > 0 ? pensionCapZIG : null) : (pensionCapUSD > 0 ? pensionCapUSD : null);
            const cappedPension = pensionCap != null
              ? Math.min(pensionContribution, pensionCap)
              : pensionContribution;
            const medForGrossUp = isZIG ? 0 : ((adj.medicalAid || 0) + (inputMedicalAidUSD || inputMedicalAid || 0));
            const grossUpTargetNet = baseRate + cappedPension + medForGrossUp;
            const solved = grossUpNet({
              targetNet: grossUpTargetNet,
              currency: isZIG ? 'ZiG' : 'USD',
              taxBrackets: isZIG ? taxBracketsZIG : taxBracketsUSD,
              annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : annualBracketsUSD,
              nssaCeiling: isZIG ? nssaCeilingZIG : nssaCeilingUSD,
              pensionContribution, pensionCap,
              medicalAid: medForGrossUp,
              taxCredits: elderlyCredit > 0 ? elderlyCredit : (emp.taxCredits || 0),
              nssaEmployeeRate, nssaEmployerRate,
            });
            return solved ? solved.grossSalary : baseRate;
          })()
        : baseRate;

      let taxResult, taxResultUSD, taxResultZIG;

      if (run.dualCurrency) {
        let baseUSD = 0, baseZIG = 0;
        const totalBasicUSD = emp.currency === 'USD' ? effectiveBaseSalary : effectiveBaseSalary / xr;

        if (emp.splitZigMode === 'PERCENTAGE' && (emp.splitZigValue || 0) > 0) {
          const splitPerc = Math.min(100, Math.max(0, emp.splitZigValue));
          baseUSD = totalBasicUSD * (1 - splitPerc / 100);
          baseZIG = totalBasicUSD * (splitPerc / 100) * xr;
        } else if (emp.splitZigMode === 'FIXED' && (emp.splitZigValue || 0) > 0) {
          baseZIG = emp.splitZigValue;
          baseUSD = Math.max(0, totalBasicUSD - (baseZIG / xr));
        } else {
          // Fallback/NONE: Use the employee's primary currency only to avoid doubling the consolidated gross
          if (emp.currency === 'ZiG') {
            baseZIG = effectiveBaseSalary;
            baseUSD = 0;
          } else {
            baseUSD = effectiveBaseSalary;
            baseZIG = 0;
          }
        }

        const resolvedMV   = resolveVehicleBenefit(emp, run.currency);
        const mvBenefitUSD = emp.currency !== 'ZiG' ? resolvedMV : 0;
        const mvBenefitZIG = emp.currency === 'ZiG' ? resolvedMV : 0;

        const splitResult = calculateSplitSalaryPaye({
          usdParams: {
            baseSalary: baseUSD,
            taxableBenefits: adj.taxableBenefits || 0,
            motorVehicleBenefit: mvBenefitUSD,
            overtimeAmount: (adj.overtimeAmount || 0) + inputEarningsUSD,
            bonus: adj.bonus || 0, bonusExemption: remBonusExUSD,
            severanceAmount: adj.severanceAmount || 0, severanceExemption: remSevExUSD,
            pensionContribution: (adj.pensionContribution || 0) + inputPensionUSD,
            pensionCap: pensionCapUSD > 0 ? pensionCapUSD : null,
            medicalAid: (adj.medicalAid || 0) + inputMedicalAidUSD,
            taxCredits: elderlyCreditUSD_val > 0 ? elderlyCreditUSD_val : (emp.taxCredits || 0),
            nssaCeiling: nssaCeilingUSD,
            nssaExcludedEarnings: inputNssaExcludedUSD,
            payeExcludedEarnings: inputPayeExcludedUSD,
            loanBenefit: totalLoanBenefitUSD,
            fdsAveragePAYEBasis: fdsAvgPAYEBasis,
          },
          zigParams: {
            baseSalary: baseZIG,
            taxableBenefits: 0, // already in USD side for consolidation
            motorVehicleBenefit: mvBenefitZIG,
            overtimeAmount: inputEarningsZIG,
            bonus: 0, bonusExemption: remBonusExZIG,
            severanceAmount: 0, severanceExemption: remSevExZIG,
            pensionContribution: inputPensionZIG,
            pensionCap: pensionCapZIG > 0 ? pensionCapZIG : null,
            medicalAid: inputMedicalAidZIG,
            taxCredits: elderlyCreditZIG_val > 0 ? elderlyCreditZIG_val : (emp.taxCredits || 0),
            nssaCeiling: nssaCeilingZIG,
            nssaExcludedEarnings: inputNssaExcludedZIG,
            payeExcludedEarnings: inputPayeExcludedZIG,
            loanBenefit: totalLoanBenefitZIG,
            fdsAveragePAYEBasis: null,
          },
          exchangeRate: xr,
          taxBracketsUSD: taxBracketsUSD,
          annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : annualBracketsUSD,
          wcifRate,
          sdfRate,
          zimdefRate,
          aidsLevyRate,
          medicalAidCreditRate,
          nssaEmployeeRate: effectiveNssaEmpRate,
          nssaEmployerRate: effectiveNssaEmprRate,
          taxDirectivePerc: effectiveTaxDirectivePerc,
          taxDirectiveAmt: effectiveTaxDirectiveAmt,
        });

        taxResultUSD = splitResult.usd;
        taxResultZIG = splitResult.zig;
        taxResult    = splitResult.totalResult;
      } else {
        taxResult = calculatePaye({
          baseSalary: effectiveBaseSalary, currency: run.currency,
          taxableBenefits: adj.taxableBenefits || 0,
          motorVehicleBenefit: resolveVehicleBenefit(emp, run.currency),
          overtimeAmount: (adj.overtimeAmount || 0) + inputEarnings,
          bonus: adj.bonus || 0, bonusExemption: remBonusEx,
          severanceAmount: adj.severanceAmount || 0, severanceExemption: remSevEx,
          pensionContribution: (adj.pensionContribution || 0) + inputPension,
          pensionCap: run.currency === 'ZiG'
            ? (pensionCapZIG > 0 ? pensionCapZIG : null)
            : (pensionCapUSD > 0 ? pensionCapUSD : null),
          medicalAid: (adj.medicalAid || 0) + inputMedicalAid,
          // Elderly credit replaces (not adds to) emp.taxCredits — ZIMRA grants one credit type per employee.
          taxCredits: elderlyCredit > 0 ? elderlyCredit : (emp.taxCredits || 0),
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
          grossUSD: taxResultUSD.gross, grossZIG: taxResultZIG.gross,
          payeUSD: taxResultUSD.paye, payeZIG: taxResultZIG.paye,
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
        // Use a minimum of 0.01 to avoid rounding-to-zero for low ZiG salaries at high exchange rates.
        basicSalaryApplied: run.dualCurrency
          ? Math.max(baseRate > 0 ? 0.01 : 0, round2(emp.currency === 'USD' ? baseRate : baseRate / xr))
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
              description: i.notes,
            });
          }
          if ((i.employeeZiG || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: i.transactionCodeId,
              amount: i.employeeZiG,
              currency: 'ZiG',
              description: i.notes,
            });
          }
        } else {
          const amt = toRunCcy(i.employeeUSD, i.employeeZiG);
          if (amt !== 0) {
            allEmpItems.push({
              transactionCodeId: i.transactionCodeId,
              amount: amt,
              currency: run.currency,
              description: i.notes,
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
              description: sd.notes,
            });
          } else if (sd.currency === 'ZiG' && (sd.value || 0) !== 0) {
            allEmpItems.push({
              transactionCodeId: sd.transactionCodeId,
              amount: sd.value,
              currency: 'ZiG',
              description: sd.notes,
            });
          }
        } else {
          const amt = toRunCcy(sd.currency === 'USD' ? sd.value : 0, sd.currency === 'ZiG' ? sd.value : 0);
          if (amt !== 0) {
            allEmpItems.push({
              transactionCodeId: sd.transactionCodeId,
              amount: amt,
              currency: run.currency,
              description: sd.notes,
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
          description: item.description,
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

      // Atomic status lock: only advance if the run is still in a processable state.
      // This prevents double-processing when two concurrent requests both pass the
      // pre-transaction status check (C1/C2 race condition).
      const locked = await tx.payrollRun.updateMany({
        where: { id: run.id, status: { in: ['DRAFT', 'APPROVED', 'ERROR', 'COMPLETED'] } },
        data: { status: 'PROCESSING' },
      });
      if (locked.count === 0) {
        throw new Error('Payroll run is already being processed by another request');
      }

      await tx.payslip.deleteMany({ where: { payrollRunId: run.id } });
      await tx.payrollTransaction.deleteMany({ where: { payrollRunId: run.id } });

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

    // Trigger leave accrual for this company now that payroll is complete.
    // Pass the payroll run's endDate so accrual uses the correct month — this handles
    // cases where payroll is processed before the month ends (e.g. April payroll run
    // processed in late March should still accrue April leave).
    // Awaited so leave balances are current before the response is returned.
    const { runLeaveAccrual } = require('../../jobs/leaveAccrual');
    try {
      const accrualResult = await runLeaveAccrual(run.companyId, run.endDate);
      console.log(`[LeaveAccrual] post-payroll accrual complete for company ${run.companyId}:`, accrualResult);
    } catch (err) {
      // Non-fatal: log but don't block the payroll response.
      // Structured errors from runLeaveAccrual include accrualSummary and accrualErrors.
      console.error(`[LeaveAccrual] post-payroll accrual failed for company ${run.companyId}:`, err.message);
      if (err.accrualErrors) {
        console.error('[LeaveAccrual] Per-employee errors:', JSON.stringify(err.accrualErrors));
      }
    }

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


module.exports = router;
