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
const { payrollQueue } = require('../../queues/index');

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

    // Always use the USD tax table — ZIMRA publishes one set of brackets in USD.
    // ZiG amounts are converted to USD for PAYE calculation via the exchange rate.
    const taxTable = company
      ? await prisma.taxTable.findFirst({
        where: {
          clientId: company.clientId,
          currency: 'USD',
          isActive: true,
        },
        include: { brackets: true },
      }) ?? await prisma.taxTable.findFirst({
        where: {
          clientId: company.clientId,
          currency: 'USD',
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
    // Each currency has its own independently configured ceiling — read directly from settings.
    const previewNssaCeiling = currency === 'ZiG' ? ps('NSSA_CEILING_ZIG') : previewNssaCeilingUSD;

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

// ─── POST /api/payroll/:runId/process — enqueue BullMQ job ──────────────────

router.post('/:runId/process', requirePermission('process_payroll'), async (req, res) => {
  const { runId } = req.params;
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId, companyId: req.companyId },
      select: { id: true, status: true, companyId: true },
    });

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status !== 'APPROVED') {
      return res.status(409).json({ message: `Run must be APPROVED to process (current: ${run.status})` });
    }

    const jobId = `payroll-${runId}`;

    await prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'QUEUED', jobId, progress: 0, employeesProcessed: 0, totalEmployees: 0, errorMessage: null },
    });

    await payrollQueue.add('process', {
      runId,
      companyId: req.companyId,
      clientId: req.clientId,
      userId: req.user.userId,
      adjustments: req.body?.adjustments || {},
    }, {
      jobId,
    });

    res.status(202).json({ ok: true, jobId, status: 'QUEUED', message: 'Payroll run queued for processing' });
  } catch (err) {
    if (err.message?.includes('connect') || err.code === 'ECONNREFUSED') {
      return res.status(503).json({ message: 'Queue service unavailable — try again shortly' });
    }
    console.error('[Payroll] Enqueue error:', err);
    res.status(500).json({ message: 'Failed to queue payroll run' });
  }
});

module.exports = router;
