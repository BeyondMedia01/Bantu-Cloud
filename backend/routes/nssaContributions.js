const express = require('express');
const prisma = require('../lib/prisma');
const router = express.Router();

/**
 * GET /api/nssa-contributions
 * Returns NSSA contribution summary aggregated from completed payslips.
 * Supports filtering by year and month (defaults to current year).
 *
 * Query params: year, month (1-12), companyId (optional override)
 */
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  const year  = parseInt(req.query.year  || new Date().getFullYear());
  const month = req.query.month ? parseInt(req.query.month) : null;

  const startDate = month
    ? new Date(year, month - 1, 1)
    : new Date(year, 0, 1);
  const endDate = month
    ? new Date(year, month, 0, 23, 59, 59)   // last day of the month
    : new Date(year, 11, 31, 23, 59, 59);

  try {
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: {
          companyId: req.companyId,
          status: 'COMPLETED',
          startDate: { gte: startDate },
          endDate:   { lte: endDate },
        },
      },
      select: {
        id: true,
        employeeId: true,
        nssaEmployee: true,
        nssaUSD: true,
        nssaZIG: true,
        gross: true,
        grossUSD: true,
        grossZIG: true,
        payrollRun: {
          select: {
            id: true,
            startDate: true,
            endDate: true,
            currency: true,
            dualCurrency: true,
            exchangeRate: true,
          },
        },
        employee: {
          select: {
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ payrollRun: { startDate: 'desc' } }, { employee: { lastName: 'asc' } }],
    });

    // Group by payroll run for a summary view
    const byRun = {};
    for (const ps of payslips) {
      const runId = ps.payrollRun.id;
      if (!byRun[runId]) {
        byRun[runId] = {
          payrollRunId: runId,
          period: ps.payrollRun.startDate,
          currency: ps.payrollRun.currency,
          dualCurrency: ps.payrollRun.dualCurrency,
          exchangeRate: ps.payrollRun.exchangeRate,
          totalEmployeeNssa: 0,
          totalEmployerNssa: 0, // employer rate mirrors employee rate
          totalPensionableEarnings: 0,
          headcount: 0,
          lines: [],
        };
      }
      const run = byRun[runId];
      const empNssa = ps.nssaEmployee || 0;
      run.totalEmployeeNssa      += empNssa;
      run.totalEmployerNssa      += empNssa; // employer = employee under equal-rate structure
      run.totalPensionableEarnings += ps.gross || 0;
      run.headcount++;
      run.lines.push({
        employeeId:   ps.employeeId,
        employeeCode: ps.employee.employeeCode,
        name: `${ps.employee.firstName} ${ps.employee.lastName}`,
        pensionableEarnings: ps.gross,
        employeeNssa: empNssa,
        employerNssa: empNssa,
        // dual-currency breakdown when available
        nssaUSD: ps.nssaUSD ?? null,
        nssaZIG: ps.nssaZIG ?? null,
      });
    }

    res.json(Object.values(byRun));
  } catch (error) {
    console.error('NSSA contributions GET error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
