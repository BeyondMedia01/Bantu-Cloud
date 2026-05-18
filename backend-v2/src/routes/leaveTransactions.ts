import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.get('/', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { employeeId, leaveTypeId, transactionType, startDate, endDate } = c.req.query();

  const where: Record<string, unknown> = {
    employee: { companyId },
  };
  if (employeeId) where.employeeId = employeeId;
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;
  if (transactionType) where.transactionType = transactionType;
  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) (where.transactionDate as Record<string, unknown>).gte = new Date(startDate);
    if (endDate) (where.transactionDate as Record<string, unknown>).lte = new Date(endDate);
  }

  const transactions = await prisma.leaveTransaction.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: { transactionDate: 'desc' },
    take: 500,
  });
  return c.json(transactions);
});

router.post('/', requirePermission('manage_leave'), validateBody(z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  adjustment: z.number(),
  note: z.string().optional(),
  expiryDate: z.string().optional(),
})), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const body = c.req.valid('json');
  const user = c.get('user');

  const emp = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { companyId: true } });
  if (!emp || emp.companyId !== companyId) return c.json({ message: 'Employee not found' }, 404);

  const { getBalance } = await import('../services/leaveLedger.service');
  const balance = await getBalance(body.employeeId, body.leaveTypeId);
  const newBalance = balance + body.adjustment;

  const tx = await prisma.leaveTransaction.create({
    data: {
      employeeId: body.employeeId,
      leaveTypeId: body.leaveTypeId,
      transactionType: 'ADJUSTMENT',
      amount: body.adjustment,
      balance: newBalance,
      referenceDocType: 'ManualAdjustment',
      description: body.note || 'Manual leave adjustment',
      createdBy: user?.userId,
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      leaveType: { select: { name: true } },
    },
  });
  return c.json(tx, 201);
});

export default router;