import { Hono } from 'hono';
import { prisma } from '../lib/prisma';

const router = new Hono();

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ data: [] });

  const actionType = c.req.query('actionType');
  const status = c.req.query('status');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const where: Record<string, unknown> = { companyId };
  if (actionType) where.actionType = actionType;
  if (status) where.status = status;
  if (startDate || endDate) {
    where.actionTimestamp = {};
    if (startDate) (where.actionTimestamp as Record<string, unknown>).gte = new Date(startDate);
    if (endDate) (where.actionTimestamp as Record<string, unknown>).lte = new Date(endDate);
  }

  const logs = await prisma.payrollLog.findMany({
    where,
    include: {
      payrollUser: { select: { fullName: true, email: true, role: true } },
    },
    orderBy: { actionTimestamp: 'desc' },
    take: 500,
  });
  return c.json({ data: logs });
});

export default router;
