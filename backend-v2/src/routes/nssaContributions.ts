import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.get('/', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const year = parseInt(c.req.query('year') || String(new Date().getFullYear()));
  const monthStr = c.req.query('month');
  const month = monthStr ? parseInt(monthStr) : null;
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(500, parseInt(c.req.query('limit') || '200'));

  const startDate = month
    ? new Date(year, month - 1, 1)
    : new Date(year, 0, 1);
  const endDate = month
    ? new Date(year, month, 0, 23, 59, 59)
    : new Date(year, 11, 31, 23, 59, 59);

  const payslips = await prisma.payslip.findMany({
    where: {
      payrollRun: {
        companyId,
        status: 'COMPLETED',
        startDate: { gte: startDate },
        endDate: { lte: endDate },
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
    take: limit,
    skip: (page - 1) * limit,
  });

  const byRun: Record<string, any> = {};
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
        totalEmployerNssa: 0,
        totalPensionableEarnings: 0,
        headcount: 0,
        lines: [],
      };
    }
    const run = byRun[runId];
    const empNssa = ps.nssaEmployee || 0;
    run.totalEmployeeNssa += empNssa;
    run.totalEmployerNssa += empNssa;
    run.totalPensionableEarnings += ps.gross || 0;
    run.headcount++;
    run.lines.push({
      employeeId: ps.employeeId,
      employeeCode: ps.employee.employeeCode,
      name: `${ps.employee.firstName} ${ps.employee.lastName}`,
      pensionableEarnings: ps.gross,
      employeeNssa: empNssa,
      employerNssa: empNssa,
      nssaUSD: ps.nssaUSD ?? null,
      nssaZIG: ps.nssaZIG ?? null,
    });
  }

  return c.json(Object.values(byRun));
});

export default router;
