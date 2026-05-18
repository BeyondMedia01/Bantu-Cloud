import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { denyUnlessCompany } from '../lib/ownership';

const router = new Hono();

const leaveTypeSchema = z.object({
  name: z.string().min(1).max(100),
  accrualType: z.enum(['MONTHLY', 'YEARLY', 'ONE_TIME']).default('YEARLY'),
  entitlementDays: z.number().positive(),
  carryForwardDays: z.number().optional(),
  maxAccumulation: z.number().optional(),
  allowNegative: z.boolean().default(false),
  isPaid: z.boolean().default(true),
});

router.get('/types', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company required' }, 400);
  const types = await prisma.leaveType.findMany({
    where: { companyId, isActive: true },
    orderBy: { name: 'asc' },
  });
  return c.json(types);
});

router.get('/types/:id', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  const type = await prisma.leaveType.findUnique({ where: { id: c.req.param('id') } });
  if (!type) return c.json({ message: 'Leave type not found' }, 404);
  if (type.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json(type);
});

router.post('/types', requirePermission('manage_leave'), validateBody(leaveTypeSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company required' }, 400);
  const body = c.req.valid('json');

  const existing = await prisma.leaveType.findUnique({
    where: { companyId_name: { companyId, name: body.name } },
  });
  if (existing) return c.json({ message: 'Leave type already exists' }, 409);

  const type = await prisma.leaveType.create({
    data: { companyId, ...body },
  });
  await audit({ c, action: 'LEAVE_TYPE_CREATED', resource: 'leave_type', resourceId: type.id, details: { name: body.name } });
  return c.json(type, 201);
});

router.put('/types/:id', requirePermission('manage_leave'), validateBody(leaveTypeSchema.partial()), async (c) => {
  const companyId = c.get('companyId');
  const existing = await prisma.leaveType.findUnique({ where: { id: c.req.param('id') } });
  if (!existing) return c.json({ message: 'Leave type not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const body = c.req.valid('json');

  if (body.name && body.name !== existing.name) {
    const conflict = await prisma.leaveType.findUnique({
      where: { companyId_name: { companyId: existing.companyId, name: body.name } },
    });
    if (conflict) return c.json({ message: 'Leave type name already in use' }, 409);
  }

  const updated = await prisma.leaveType.update({ where: { id: existing.id }, data: body });
  return c.json(updated);
});

router.delete('/types/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  const existing = await prisma.leaveType.findUnique({ where: { id: c.req.param('id') } });
  if (!existing) return c.json({ message: 'Leave type not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const inUse = await prisma.leaveTransaction.count({ where: { leaveTypeId: existing.id } });
  if (inUse > 0) {
    await prisma.leaveType.update({ where: { id: existing.id }, data: { isActive: false } });
    return c.json({ message: 'Deactivated (in use)' });
  }
  await prisma.leaveType.delete({ where: { id: existing.id } });
  return c.body(null, 204);
});

export default router;