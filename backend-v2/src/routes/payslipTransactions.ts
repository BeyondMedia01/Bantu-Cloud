import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const createTransactionSchema = z.object({
  employeeId: z.string().min(1),
  transactionCodeId: z.string().min(1),
  payrollRunId: z.string().optional(),
  amount: z.number(),
  currency: z.string().optional(),
  description: z.string().optional(),
});

router.get('/', requirePermission('view_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(500, parseInt(c.req.query('limit') || '200'));
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      prisma.payrollTransaction.findMany({
        where: {
          payrollRun: { companyId },
        },
        include: {
          employee: { select: { firstName: true, lastName: true, employeeCode: true } },
          transactionCode: { select: { code: true, name: true, type: true } },
          payrollRun: { select: { startDate: true, endDate: true, currency: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip,
      }),
      prisma.payrollTransaction.count({
        where: {
          payrollRun: { companyId },
        },
      }),
    ]);

    return c.json({ data: transactions, total, page, limit });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to fetch transactions' }, 500);
  }
});

router.get('/:id', requirePermission('view_payroll'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  try {
    const transaction = await prisma.payrollTransaction.findUnique({
      where: { id },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        transactionCode: { select: { code: true, name: true, type: true } },
        payrollRun: { select: { companyId: true, startDate: true, endDate: true } },
      },
    });

    if (!transaction) return c.json({ message: 'Transaction not found' }, 404);
    if (!companyId || transaction.payrollRun.companyId !== companyId) {
      return c.json({ message: 'Access denied' }, 403);
    }

    return c.json(transaction);
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to fetch transaction' }, 500);
  }
});

router.post('/', requirePermission('manage_payroll'), validateBody(createTransactionSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const body = c.req.valid('json');

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: body.employeeId },
      select: { companyId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      return c.json({ message: 'Access denied' }, 403);
    }

    const transaction = await prisma.payrollTransaction.create({
      data: {
        employeeId: body.employeeId,
        transactionCodeId: body.transactionCodeId,
        payrollRunId: body.payrollRunId,
        amount: body.amount,
        currency: body.currency || 'USD',
        description: body.description,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        transactionCode: { select: { code: true, name: true } },
      },
    });
    return c.json(transaction, 201);
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to create transaction' }, 500);
  }
});

router.put('/:id', requirePermission('manage_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const existing = await prisma.payrollTransaction.findUnique({ where: { id }, include: { payrollRun: { select: { companyId: true } } } });
  if (!existing) return c.json({ message: 'Transaction not found' }, 404);
  if (existing.payrollRun.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const body = await c.req.json();
  const updated = await prisma.payrollTransaction.update({ where: { id }, data: body });
  return c.json(updated);
});

router.delete('/:id', requirePermission('manage_payroll'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  try {
    const existing = await prisma.payrollTransaction.findUnique({
      where: { id },
      include: { payrollRun: { select: { companyId: true } } },
    });
    if (!existing) return c.json({ message: 'Transaction not found' }, 404);
    if (existing.payrollRun.companyId !== companyId) {
      return c.json({ message: 'Access denied' }, 403);
    }

    await prisma.payrollTransaction.delete({ where: { id } });
    return c.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to delete transaction' }, 500);
  }
});

export default router;
