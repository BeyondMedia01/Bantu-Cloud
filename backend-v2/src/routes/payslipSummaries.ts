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
      select: { id: true, startDate: true, endDate: true, status: true, currency: true, dualCurrency: true },
      orderBy: { startDate: 'desc' },
      take: 50,
    });

    const runIds = payrollRuns.map(r => r.id);

    const payslipAggs = runIds.length > 0
      ? await prisma.payslip.groupBy({
          by: ['payrollRunId'],
          where: { payrollRunId: { in: runIds } },
          _sum: {
            gross: true, netPay: true, paye: true, nssaEmployee: true,
            grossUSD: true, grossZIG: true,
            payeUSD: true, payeZIG: true,
            aidsLevyUSD: true, aidsLevyZIG: true,
            nssaUSD: true, nssaZIG: true,
            netPayUSD: true, netPayZIG: true,
          },
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
        dualCurrency: r.dualCurrency,
        status: r.status,
        // Dual-currency breakdowns (null for single-currency runs)
        grossUSD: agg?._sum.grossUSD ?? null,
        grossZIG: agg?._sum.grossZIG ?? null,
        payeUSD: agg?._sum.payeUSD ?? null,
        payeZIG: agg?._sum.payeZIG ?? null,
        aidsLevyUSD: agg?._sum.aidsLevyUSD ?? null,
        aidsLevyZIG: agg?._sum.aidsLevyZIG ?? null,
        nssaUSD: agg?._sum.nssaUSD ?? null,
        nssaZIG: agg?._sum.nssaZIG ?? null,
        netPayUSD: agg?._sum.netPayUSD ?? null,
        netPayZIG: agg?._sum.netPayZIG ?? null,
      };
    });

    const totals = summaries.reduce(
      (acc, s) => ({
        totalGross: acc.totalGross + s.grossSalary,
        totalNetPay: acc.totalNetPay + s.netSalary,
        totalPaye: acc.totalPaye + s.totalPaye,
        totalNssa: acc.totalNssa + s.totalNssa,
        totalGrossZIG: acc.totalGrossZIG + (s.grossZIG ?? 0),
        totalNetPayZIG: acc.totalNetPayZIG + (s.netPayZIG ?? 0),
        totalPayeZIG: acc.totalPayeZIG + (s.payeZIG ?? 0),
      }),
      { totalGross: 0, totalNetPay: 0, totalPaye: 0, totalNssa: 0, totalGrossZIG: 0, totalNetPayZIG: 0, totalPayeZIG: 0 }
    );

    return c.json({ data: { summaries, totals } });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to fetch payslip summaries' }, 500);
  }
});

export default router;
