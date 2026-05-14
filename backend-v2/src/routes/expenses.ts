import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const EXPENSE_INCLUDE = {
  Employee: { select: { firstName: true, lastName: true, employeeCode: true } },
  ExpenseCategory: { select: { name: true } },
} as const;

const createExpenseSchema = z.object({
  employeeId: z.string().min(1),
  categoryId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.string().optional(),
  description: z.string().min(1),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
});

const updateExpenseSchema = z.object({
  amount: z.number().positive().optional(),
  currency: z.string().optional(),
  description: z.string().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ data: [] });
  const employeeId = c.req.query('employeeId');
  const status = c.req.query('status');
  const categoryId = c.req.query('categoryId');

  const where: any = { companyId };
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;

  const expenses = await prisma.expense.findMany({
    where,
    include: EXPENSE_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ data: expenses });
});

router.get('/categories', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ data: [] });
  const categories = await prisma.expenseCategory.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
  });
  return c.json({ data: categories });
});

router.get('/:id', async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const expense = await prisma.expense.findUnique({
    where: { id },
    include: {
      Employee: { select: { firstName: true, lastName: true, employeeCode: true, companyId: true } },
      ExpenseCategory: { select: { name: true } },
      User: { select: { name: true } },
    },
  });
  if (!expense) return c.json({ message: 'Expense not found' }, 404);
  if (!companyId || expense.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json({ data: expense });
});

router.post('/', requirePermission('manage_employees'), validateBody(createExpenseSchema), async (c) => {
  const { employeeId, categoryId, amount, currency, description, receiptUrl, notes } = c.req.valid('json');
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const expense = await prisma.expense.create({
    data: { id: uuid(), companyId, employeeId, categoryId, amount, currency: currency || 'USD', description, receiptUrl, notes, updatedAt: new Date() },
  });
  const user = c.get('user');
  await audit({ c, action: 'EXPENSE_CREATED', resource: 'expense', resourceId: expense.id, details: { employeeId, amount, categoryId } });
  return c.json(expense, 201);
});

router.put('/:id', requirePermission('manage_employees'), validateBody(updateExpenseSchema), async (c) => {
  const { id } = c.req.param();
  const data = c.req.valid('json');
  const companyId = c.get('companyId');

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Expense not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (existing.status !== 'PENDING') return c.json({ message: 'Can only edit pending expenses' }, 400);

  const updateData: any = {};
  if (data.amount !== undefined) updateData.amount = data.amount;
  if (data.currency !== undefined) updateData.currency = data.currency;
  if (data.description !== undefined) updateData.description = data.description;
  if (data.receiptUrl !== undefined) updateData.receiptUrl = data.receiptUrl;
  if (data.notes !== undefined) updateData.notes = data.notes;

  const expense = await prisma.expense.update({
    where: { id },
    data: updateData,
    include: EXPENSE_INCLUDE,
  });

  const user = c.get('user');
  await audit({ c, action: 'EXPENSE_UPDATED', resource: 'expense', resourceId: expense.id });
  return c.json({ data: expense });
});

router.delete('/:id', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Expense not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (existing.status !== 'PENDING') return c.json({ message: 'Can only delete pending expenses' }, 400);

  await prisma.expense.delete({ where: { id } });

  const user = c.get('user');
  await audit({ c, action: 'EXPENSE_DELETED', resource: 'expense', resourceId: id });
  return c.json({ message: 'Expense deleted' });
});

router.put('/:id/approve', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const user = c.get('user');

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Expense not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (existing.status !== 'PENDING') return c.json({ message: 'Can only approve pending expenses' }, 400);

  const expense = await prisma.expense.update({
    where: { id },
    data: { status: 'APPROVED', approvedById: user.userId, approvedAt: new Date() },
    include: EXPENSE_INCLUDE,
  });

  await audit({ c, action: 'EXPENSE_APPROVED', resource: 'expense', resourceId: expense.id });
  return c.json({ data: expense });
});

router.put('/:id/reject', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const user = c.get('user');

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Expense not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (existing.status !== 'PENDING') return c.json({ message: 'Can only reject pending expenses' }, 400);

  const expense = await prisma.expense.update({
    where: { id },
    data: { status: 'REJECTED', approvedById: user.userId, approvedAt: new Date() },
    include: EXPENSE_INCLUDE,
  });

  await audit({ c, action: 'EXPENSE_REJECTED', resource: 'expense', resourceId: expense.id });
  return c.json({ data: expense });
});

router.post('/:id/process', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const user = c.get('user');
  const { payrollRunId } = await c.req.json().catch(() => ({}));

  const existing = await prisma.expense.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Expense not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (existing.status !== 'APPROVED') return c.json({ message: 'Can only process approved expenses' }, 400);

  const updateData: any = { status: 'PAID', paidInPayroll: true };
  if (payrollRunId) updateData.payrollRunId = payrollRunId;

  const expense = await prisma.expense.update({
    where: { id },
    data: updateData,
    include: EXPENSE_INCLUDE,
  });

  await audit({ c, action: 'EXPENSE_PAID', resource: 'expense', resourceId: expense.id, details: { payrollRunId } });
  return c.json({ data: expense });
});

export default router;
