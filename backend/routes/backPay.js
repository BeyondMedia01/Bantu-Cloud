const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');
const { calculateBackPay, getAffectedRuns, buildRateMap } = require('../services/backPayService');

const router = express.Router();

// ─── POST /api/backpay — preview ─────────────────────────────────────────────
/**
 * Body: { effectiveDate, employeeIds, employeeRates?, uniformNewRate?, currency? }
 * employeeRates: [{employeeId, oldRate, newRate}]  — per-employee mode
 * uniformNewRate: number                            — uniform mode (old rate = emp.baseRate)
 */
router.post('/', requirePermission('process_payroll'), async (req, res) => {
  const { effectiveDate, employeeIds, employeeRates, uniformNewRate, currency = 'USD' } = req.body;

  if (!effectiveDate || !employeeIds?.length) {
    return res.status(400).json({ message: 'effectiveDate and employeeIds are required' });
  }

  try {
    const result = await calculateBackPay({
      companyId: req.companyId,
      effectiveDate,
      employeeIds,
      employeeRates,
      uniformNewRate,
      currency,
    });
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/backpay/commit ─────────────────────────────────────────────────
/**
 * Same body as preview. Finds/creates the BACK_PAY transaction code,
 * then creates one PayrollInput per employee for the current period.
 */
router.post('/commit', requirePermission('process_payroll'), async (req, res) => {
  const { effectiveDate, employeeIds, employeeRates, uniformNewRate, currency = 'USD' } = req.body;

  if (!effectiveDate || !employeeIds?.length) {
    return res.status(400).json({ message: 'effectiveDate and employeeIds are required' });
  }

  try {
    const company = await prisma.company.findUnique({ where: { id: req.companyId } });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    // Find or auto-create the BACK_PAY transaction code
    let tc = await prisma.transactionCode.findFirst({
      where: { clientId: company.clientId, code: 'BACK_PAY' },
    });
    if (!tc) {
      tc = await prisma.transactionCode.create({
        data: {
          clientId: company.clientId,
          code: 'BACK_PAY',
          name: 'Back Pay Adjustment',
          description: 'Auto-generated retroactive pay adjustment for prior period rate changes',
          type: 'EARNING',
          taxable: true,
          pensionable: false,
        },
      });
    }

    const runs = await getAffectedRuns(req.companyId, effectiveDate);
    const rateMap = await buildRateMap(employeeIds, req.companyId, employeeRates, uniformNewRate);

    const runIds = runs.map((r) => r.id);
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: { in: runIds }, employeeId: { in: employeeIds } },
      select: { employeeId: true, payrollRunId: true },
    });

    const payslipSet = {};
    for (const p of payslips) {
      if (!payslipSet[p.employeeId]) payslipSet[p.employeeId] = new Set();
      payslipSet[p.employeeId].add(p.payrollRunId);
    }

    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const createdInputs = [];

    for (const empId of employeeIds) {
      const emp = rateMap[empId];
      if (!emp) continue;

      const diff = emp.newRate - emp.oldRate;
      if (diff <= 0) continue;

      let totalShortfall = 0;
      let affectedRunCount = 0;

      for (const run of runs) {
        if (payslipSet[empId]?.has(run.id)) {
          totalShortfall += diff;
          affectedRunCount++;
        }
      }

      if (totalShortfall <= 0) continue;

      const amountField = currency === 'ZiG' ? 'employeeZiG' : 'employeeUSD';

      const input = await prisma.payrollInput.create({
        data: {
          employeeId: empId,
          transactionCodeId: tc.id,
          [amountField]: totalShortfall,
          period,
          processed: false,
          notes: `Back pay: ${affectedRunCount} run(s) × ${currency} ${diff.toFixed(2)}/month (effective ${effectiveDate})`,
        },
      });

      createdInputs.push({
        ...input,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        totalShortfall,
        affectedRunCount,
        currency,
      });
    }

    await audit({
      req,
      action: 'BACK_PAY_COMMITTED',
      resource: 'payroll_input',
      details: {
        effectiveDate,
        period,
        currency,
        inputCount: createdInputs.length,
        employees: createdInputs.map((i) => ({
          employeeId: i.employeeId,
          name: i.employeeName,
          employeeCode: i.employeeCode,
          totalShortfall: i.totalShortfall,
          affectedRunCount: i.affectedRunCount,
        })),
      },
    });

    res.json({
      transactionCodeId: tc.id,
      transactionCodeName: tc.name,
      inputs: createdInputs,
      period,
      message: `Created ${createdInputs.length} PayrollInput(s) for period ${period}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/backpay/negative-run ──────────────────────────────────────────
/**
 * Creates a NEGATIVE-RUN + CORRECTION-RUN pair to reverse and re-process a
 * completed payroll run with corrected employee rates.
 *
 * Body: { sourceRunId, employeeIds, employeeRates?, uniformNewRate?, currency? }
 *   sourceRunId    — the completed run to reverse
 *   employeeIds    — subset of employees to correct (all if omitted)
 *   employeeRates  — [{employeeId, oldRate, newRate}] per-employee overrides
 *   uniformNewRate — single new rate applied to all selected employees
 *   currency       — 'USD' | 'ZiG'
 *
 * Returns:
 *   negativeInputs  — PayrollInput records with CORRECTION_REVERSAL code (negative amounts)
 *   correctionInputs — PayrollInput records with correct amounts for current period
 */
router.post('/negative-run', requirePermission('process_payroll'), async (req, res) => {
  const {
    sourceRunId,
    employeeIds: reqEmployeeIds,
    employeeRates,
    uniformNewRate,
    currency = 'USD',
  } = req.body;

  if (!sourceRunId) {
    return res.status(400).json({ message: 'sourceRunId is required' });
  }

  try {
    // Load and verify the source run
    const sourceRun = await prisma.payrollRun.findUnique({
      where: { id: sourceRunId },
      select: { id: true, companyId: true, status: true, startDate: true, currency: true },
    });
    if (!sourceRun) return res.status(404).json({ message: 'Source payroll run not found' });
    if (req.companyId && sourceRun.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (sourceRun.status !== 'COMPLETED') {
      return res.status(400).json({ message: 'Only COMPLETED runs can be reversed' });
    }

    // Fetch payslips from the source run
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRunId: sourceRunId,
        ...(reqEmployeeIds?.length && { employeeId: { in: reqEmployeeIds } }),
      },
      select: { employeeId: true, gross: true, paye: true, nssaEmployee: true, netPay: true },
    });

    if (payslips.length === 0) {
      return res.status(400).json({ message: 'No payslips found in source run for the given employees' });
    }

    const employeeIds = payslips.map((p) => p.employeeId);
    const company = await prisma.company.findUnique({ where: { id: sourceRun.companyId } });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    // Find or create CORRECTION_REVERSAL and CORRECTION transaction codes
    const ensureCode = async (code, name, description) => {
      let tc = await prisma.transactionCode.findFirst({
        where: { clientId: company.clientId, code },
      });
      if (!tc) {
        tc = await prisma.transactionCode.create({
          data: {
            clientId: company.clientId,
            code,
            name,
            description,
            type: 'EARNING',
            taxable: true,
            pensionable: false,
          },
        });
      }
      return tc;
    };

    const reversalTc    = await ensureCode('CORRECTION_REVERSAL', 'Payroll Correction — Reversal',    'Auto-generated reversal of prior-period payslip gross');
    const correctionTc  = await ensureCode('CORRECTION_PAY',      'Payroll Correction — Corrected Pay', 'Auto-generated corrected pay for prior-period reversal');

    const now    = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Build rate map for corrected amounts (only needed if rates are provided)
    const rateMap = (employeeRates || uniformNewRate)
      ? await buildRateMap(employeeIds, sourceRun.companyId, employeeRates, uniformNewRate)
      : null;

    const amountField = currency === 'ZiG' ? 'employeeZiG' : 'employeeUSD';

    const negativeInputs   = [];
    const correctionInputs = [];

    for (const ps of payslips) {
      // Reversal: negative gross from the original payslip
      const reversalInput = await prisma.payrollInput.create({
        data: {
          employeeId:        ps.employeeId,
          transactionCodeId: reversalTc.id,
          [amountField]:     -(ps.gross),
          period,
          processed: false,
          notes: `Reversal of run ${sourceRunId} gross ${currency} ${ps.gross.toFixed(2)}`,
        },
      });
      negativeInputs.push(reversalInput);

      // Correction: new gross based on corrected rate (or original gross if no rate change)
      const emp         = rateMap?.[ps.employeeId];
      const correctedGross = emp && emp.newRate > 0
        ? ps.gross * (emp.newRate / (emp.oldRate || emp.newRate))
        : ps.gross;

      const correctionInput = await prisma.payrollInput.create({
        data: {
          employeeId:        ps.employeeId,
          transactionCodeId: correctionTc.id,
          [amountField]:     correctedGross,
          period,
          processed: false,
          notes: `Correction for run ${sourceRunId} — corrected gross ${currency} ${correctedGross.toFixed(2)}`,
        },
      });
      correctionInputs.push(correctionInput);
    }

    await audit({
      req,
      action: 'BACKPAY_NEGATIVE_RUN_CREATED',
      resource: 'payroll_input',
      details: {
        sourceRunId,
        period,
        currency,
        reversalCount:    negativeInputs.length,
        correctionCount:  correctionInputs.length,
      },
    });

    res.json({
      sourceRunId,
      period,
      message: `Created ${negativeInputs.length} reversal + ${correctionInputs.length} correction input(s) for period ${period}. Include them in the next payroll run.`,
      negativeInputs,
      correctionInputs,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
