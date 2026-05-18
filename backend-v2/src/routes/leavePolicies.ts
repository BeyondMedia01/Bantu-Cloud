import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const createPolicySchema = z.object({
  leaveTypeId: z.string().uuid(),
  accrualRate: z.number().optional(),
  entitlementDays: z.number().optional(),
  maxAccumulation: z.number().optional(),
  carryOverLimit: z.number().optional(),
  encashable: z.boolean().optional(),
  encashCap: z.number().optional(),
});

const updatePolicySchema = z.object({
  accrualRate: z.number().optional(),
  entitlementDays: z.number().optional(),
  maxAccumulation: z.number().optional(),
  carryOverLimit: z.number().optional(),
  encashable: z.boolean().optional(),
  encashCap: z.number().optional(),
  isActive: z.boolean().optional(),
});

router.get('/', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const policies = await prisma.leavePolicy.findMany({
    where: { companyId },
    include: { leaveType: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return c.json(policies);
});

router.post('/', requirePermission('manage_leave'), validateBody(createPolicySchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const body = c.req.valid('json');

  const lt = await prisma.leaveType.findUnique({ where: { id: body.leaveTypeId } });
  if (!lt) return c.json({ message: 'Leave type not found' }, 404);
  if (lt.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const existing = await prisma.leavePolicy.findUnique({
    where: { companyId_leaveTypeId: { companyId, leaveTypeId: body.leaveTypeId } },
  });
  if (existing) return c.json({ message: 'Policy already exists for this leave type' }, 409);

  const policy = await prisma.leavePolicy.create({
    data: {
      companyId,
      leaveTypeId: body.leaveTypeId,
      accrualRate: body.accrualRate ?? lt.accrualType === 'YEARLY' ? lt.entitlementDays : 2.5,
      entitlementDays: body.entitlementDays ?? lt.entitlementDays,
      maxAccumulation: body.maxAccumulation ?? lt.maxAccumulation ?? 0,
      carryOverLimit: body.carryOverLimit ?? lt.carryForwardDays ?? 30,
      encashable: body.encashable ?? false,
      encashCap: body.encashCap ?? 0,
    },
    include: { leaveType: { select: { id: true, name: true } } },
  });

  await audit({ c, action: 'LEAVE_POLICY_CREATED', resource: 'leave_policy', resourceId: policy.id, details: { leaveTypeId: body.leaveTypeId } });
  return c.json(policy, 201);
});

router.put('/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();

  const existing = await prisma.leavePolicy.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return c.json({ message: 'Leave policy not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const body = await c.req.json();
  const policy = await prisma.leavePolicy.update({
    where: { id },
    data: {
      ...(body.accrualRate !== undefined && { accrualRate: body.accrualRate }),
      ...(body.entitlementDays !== undefined && { entitlementDays: body.entitlementDays }),
      ...(body.maxAccumulation !== undefined && { maxAccumulation: body.maxAccumulation }),
      ...(body.carryOverLimit !== undefined && { carryOverLimit: body.carryOverLimit }),
      ...(body.encashable !== undefined && { encashable: body.encashable }),
      ...(body.encashCap !== undefined && { encashCap: body.encashCap }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
    include: { leaveType: { select: { id: true, name: true } } },
  });

  await audit({ c, action: 'LEAVE_POLICY_UPDATED', resource: 'leave_policy', resourceId: id });
  return c.json(policy);
});

router.delete('/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();

  const existing = await prisma.leavePolicy.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return c.json({ message: 'Leave policy not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.leavePolicy.delete({ where: { id } });
  await audit({ c, action: 'LEAVE_POLICY_DELETED', resource: 'leave_policy', resourceId: id });
  return c.body(null, 204);
});

export default router;