import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.get('/', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const payPeriod = c.req.query('payPeriod');
    const payrollRuns = await prisma.payrollRun.findMany({
      where: { companyId, status: 'COMPLETED' },
      select: { id: true, startDate: true, endDate: true, status: true, currency: true },
      orderBy: { startDate: 'desc' },
      take: 50,
    });

    const runIds = payrollRuns.map(r => r.id);

    const payslipAggs = runIds.length > 0
      ? await prisma.payslip.groupBy({
          by: ['payrollRunId'],
          where: { payrollRunId: { in: runIds } },
          _sum: { gross: true, netPay: true, paye: true, nssaEmployee: true },
          _count: { id: true },
        })
      : [];

    const aggMap = new Map(payslipAggs.map(a => [a.payrollRunId, a]));

    const summaries = payrollRuns.map(r => {
      const agg = aggMap.get(r.id);
      return {
        id: r.id,
        payPeriod: r.startDate,
        periodEnd: r.endDate,
        grossSalary: Number(agg?._sum.gross) || 0,
        netSalary: Number(agg?._sum.netPay) || 0,
        totalPaye: Number(agg?._sum.paye) || 0,
        totalNssa: Number(agg?._sum.nssaEmployee) || 0,
        employeeCount: agg?._count.id || 0,
        currency: r.currency,
        status: r.status,
      };
    });

    const totals = summaries.reduce(
      (acc, s) => ({
        totalGross: acc.totalGross + s.grossSalary,
        totalNetPay: acc.totalNetPay + s.netSalary,
        totalPaye: acc.totalPaye + s.totalPaye,
        totalNssa: acc.totalNssa + s.totalNssa,
      }),
      { totalGross: 0, totalNetPay: 0, totalPaye: 0, totalNssa: 0 }
    );

    return c.json({ data: { summaries, totals } });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to fetch payslip summaries' }, 500);
  }
});

export default router;
