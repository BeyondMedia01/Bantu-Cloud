import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { denyUnlessCompany } from '../lib/ownership';

async function checkLoanAccess(c: any, loanId: string): Promise<boolean> {
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    select: { employee: { select: { companyId: true } } },
  });
  if (!loan) return false;
  return denyUnlessCompany(c, { companyId: loan.employee.companyId });
}

const router = new Hono();

router.get('/', requirePermission('view_loans'), async (c) => {
  const employeeId = c.req.query('employeeId');
  const status = c.req.query('status');
  const user = c.get('user');
  const companyId = c.get('companyId');
  const employeeIdFromCtx = c.get('employeeId');

  if (user.role !== 'EMPLOYEE' && !companyId) return c.json({ data: [] });

  const where: Record<string, unknown> = {};
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;
  if (user.role === 'EMPLOYEE' && employeeIdFromCtx) where.employeeId = employeeIdFromCtx;
  if (companyId) where.employee = { companyId };

  const loans = await prisma.loan.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      _count: { select: { repayments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ data: loans });
});

const createLoanSchema = z.object({
  employeeId: z.string().min(1),
  amount: z.number().positive(),
  interestRate: z.number().optional(),
  termMonths: z.number().int().positive(),
  startDate: z.string().min(1),
  repaymentMethod: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/', requirePermission('manage_loans'), validateBody(createLoanSchema), async (c) => {
  const body = c.req.valid('json');
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const emp = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { companyId: true } });
  if (!emp) return c.json({ message: 'Employee not found' }, 404);
  if (emp.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const P = body.amount;
  const r = (body.interestRate || 0) / 100 / 12;
  const n = body.termMonths;
  const monthlyPayment = r === 0 ? P / n : (P * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);

  const loan = await prisma.loan.create({
    data: {
      employeeId: body.employeeId,
      amount: P,
      interestRate: body.interestRate || 0,
      termMonths: n,
      startDate: new Date(body.startDate),
      repaymentMethod: body.repaymentMethod || 'SALARY_DEDUCTION',
      notes: body.notes,
      repayments: {
        create: Array.from({ length: n }, (_, i) => {
          const dueDate = new Date(body.startDate);
          dueDate.setMonth(dueDate.getMonth() + i + 1);
          return { amount: parseFloat(monthlyPayment.toFixed(2)), dueDate };
        }),
      },
    },
    include: { repayments: true },
  });

  await audit({ c, action: 'LOAN_CREATED', resource: 'loan', resourceId: loan.id, details: { employeeId: body.employeeId, amount: P } });
  return c.json(loan, 201);
});

router.get('/:id', requirePermission('view_loans'), async (c) => {
  const loanId = c.req.param('id');
  if (!loanId || !(await checkLoanAccess(c, loanId))) return c.json({ message: 'Loan not found' }, 404);
  const loan = await prisma.loan.findUnique({
    where: { id: loanId },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, repayments: true },
  });
  if (!loan) return c.json({ message: 'Loan not found' }, 404);
  return c.json(loan);
});

const updateLoanSchema = z.object({
  status: z.enum(['ACTIVE', 'PAID_OFF', 'DEFAULTED', 'CANCELLED']).optional(),
  notes: z.string().optional(),
  repaymentMethod: z.string().optional(),
});

router.put('/:id', requirePermission('manage_loans'), validateBody(updateLoanSchema), async (c) => {
  try {
    const loanId = c.req.param('id');
    if (!loanId || !(await checkLoanAccess(c, loanId))) return c.json({ message: 'Loan not found' }, 404);
    const { status, notes, repaymentMethod } = c.req.valid('json' as any);
    const loan = await prisma.loan.update({ where: { id: loanId }, data: { status, notes, repaymentMethod } });
    return c.json(loan);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Loan not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/:id', requirePermission('manage_loans'), async (c) => {
  try {
    const loanId = c.req.param('id');
    if (!loanId || !(await checkLoanAccess(c, loanId))) return c.json({ message: 'Loan not found' }, 404);
    await prisma.loan.delete({ where: { id: loanId } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Loan not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/:id/repayments', requirePermission('view_loans'), async (c) => {
  if (!(await checkLoanAccess(c, c.req.param('id')!))) return c.json({ message: 'Loan not found' }, 404);
  const repayments = await prisma.loanRepayment.findMany({
    where: { loanId: c.req.param('id') },
    orderBy: { dueDate: 'asc' },
  });
  return c.json(repayments);
});

router.patch('/repayments/:repaymentId', requirePermission('manage_loans'), async (c) => {
  try {
    const repayment = await prisma.loanRepayment.findUnique({
      where: { id: c.req.param('repaymentId') },
      include: { loan: { select: { employee: { select: { companyId: true } } } } },
    });
    if (!repayment) return c.json({ message: 'Repayment not found' }, 404);
    if (!denyUnlessCompany(c, { companyId: repayment.loan.employee.companyId })) return c.json({ message: 'Access denied' }, 403);
    const updated = await prisma.loanRepayment.update({
      where: { id: c.req.param('repaymentId') },
      data: { status: 'PAID', paidDate: new Date() },
    });
    return c.json(updated);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Repayment not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
