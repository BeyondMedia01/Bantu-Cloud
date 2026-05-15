import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.get('/', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const payPeriod = c.req.query('payPeriod');
    const format = c.req.query('format') || 'csv';

    const where: any = { payrollRun: { companyId, status: 'COMPLETED' } };
    if (payPeriod) {
      const d = new Date(payPeriod);
      where.payrollRun.startDate = { lte: d };
      where.payrollRun.endDate = { gte: d };
    }

    const payslips = await prisma.payslip.findMany({
      where,
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeCode: true, bankName: true, accountNumber: true },
        },
        payrollRun: { select: { startDate: true, endDate: true } },
      },
      orderBy: { employeeId: 'asc' },
    });

    if (format === 'csv') {
      const header = 'EmployeeCode,FirstName,LastName,Gross,PAYE,NSSA,NetPay,BankName,BankAccount';
      const rows = payslips.map(p =>
        `${p.employee.employeeCode},${p.employee.firstName},${p.employee.lastName},${p.gross},${p.paye},${p.nssaEmployee},${p.netPay},${p.employee.bankName || ''},${p.employee.accountNumber || ''}`
      );
      c.header('Content-Type', 'text/csv');
      c.header('Content-Disposition', 'attachment; filename="payslip-export.csv"');
      return c.body([header, ...rows].join('\n'));
    }

    const data = payslips.map(p => ({
      employeeCode: p.employee.employeeCode,
      employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
      gross: p.gross,
      paye: p.paye,
      nssa: p.nssaEmployee,
      netPay: p.netPay,
      bankName: p.employee.bankName,
      bankAccount: p.employee.accountNumber,
      periodStart: p.payrollRun.startDate,
      periodEnd: p.payrollRun.endDate,
    }));

    return c.json({ data, total: data.length });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to generate payslip export' }, 500);
  }
});

router.get('/:id', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true, bankName: true, accountNumber: true } },
      payrollRun: { select: { companyId: true, startDate: true, endDate: true } },
    },
  });
  if (!payslip) return c.json({ message: 'Payslip not found' }, 404);
  if (payslip.payrollRun.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json(payslip);
});

router.post('/', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const body = await c.req.json();
  const payslips = await prisma.payslip.findMany({
    where: { payrollRun: { companyId, ...(body.payPeriod ? { startDate: { lte: new Date(body.payPeriod) }, endDate: { gte: new Date(body.payPeriod) } } : {}) } },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, bankName: true, accountNumber: true } } },
    orderBy: { employeeId: 'asc' },
  });
  const format = body.format || 'csv';
  if (format === 'csv') {
    const header = 'EmployeeCode,FirstName,LastName,Gross,PAYE,NSSA,NetPay,BankName,BankAccount';
    const rows = payslips.map(p => `${p.employee.employeeCode},${p.employee.firstName},${p.employee.lastName},${p.gross},${p.paye},${p.nssaEmployee},${p.netPay},${p.employee.bankName || ''},${p.employee.accountNumber || ''}`);
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', 'attachment; filename="payslip-export.csv"');
    return c.body([header, ...rows].join('\n'));
  }
  return c.json({ data: payslips });
});

router.delete('/:id', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const payslip = await prisma.payslip.findUnique({ where: { id }, include: { payrollRun: { select: { companyId: true } } } });
  if (!payslip) return c.json({ message: 'Payslip not found' }, 404);
  if (payslip.payrollRun.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  await prisma.payslip.delete({ where: { id } });
  return c.body(null, 204);
});

export default router;
