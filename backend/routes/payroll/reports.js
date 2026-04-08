const express = require('express');
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/permissions');
const { calculatePaye } = require('../../utils/taxEngine');
const { generatePayrollSummaryPDF, generatePayslipSummaryPDF, generatePayslipSummaryBuffer } = require('../../utils/pdfService');
const { audit } = require('../../lib/audit');
const { validateBody } = require('../../lib/validate');
const { sendPayslip } = require('../../lib/mailer');
const { getYtdStartDate } = require('../../utils/ytdCalculator');
const { payslipToBuffer, buildPayslipLineItems } = require('../../utils/payslipFormatter');

const router = express.Router({ mergeParams: true });

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
      // Tax directive: count only the months the directive was actually active within this year.
      const dStart = emp.taxDirectiveEffective ? new Date(emp.taxDirectiveEffective) : null;
      const dEnd   = emp.taxDirectiveExpiry   ? new Date(emp.taxDirectiveExpiry)   : null;
      const directiveOverlapsYear = (!dStart || dStart <= yearEnd) && (!dEnd || dEnd >= yearStart);
      let directiveActiveMonths = 0;
      if (directiveOverlapsYear && agg.months > 0) {
        const from = (dStart && dStart > yearStart) ? dStart : yearStart;
        const to   = (dEnd   && dEnd   < yearEnd)   ? dEnd   : yearEnd;
        const rawMonths = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 1;
        directiveActiveMonths = Math.min(Math.max(0, rawMonths), agg.months);
      }

      const annualResult = calcPaye({
        baseSalary: agg.cumulativeGross,
        currency: run.currency || 'USD',
        taxBrackets,
        annualBrackets: annualBracketsReconcile,
        taxCredits: (emp.taxCredits || 0) * agg.months,
        taxDirectivePerc: directiveOverlapsYear ? (emp.taxDirectivePerc || 0) : 0,
        taxDirectiveAmt:  directiveOverlapsYear ? (emp.taxDirectiveAmt || 0) * directiveActiveMonths : 0,
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


module.exports = router;
