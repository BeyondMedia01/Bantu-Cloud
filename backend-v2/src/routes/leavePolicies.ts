import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const createPolicySchema = z.object({
  leaveType: z.string().min(1),
  accrualRate: z.number().optional(),
  maxAccumulation: z.number().optional(),
  carryOverLimit: z.number().optional(),
  encashable: z.boolean().optional(),
  encashCap: z.number().optional(),
});

const updatePolicySchema = z.object({
  accrualRate: z.number().optional(),
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
    orderBy: { leaveType: 'asc' },
  });
  return c.json(policies);
});

router.post('/', requirePermission('manage_leave'), validateBody(createPolicySchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const body = c.req.valid('json');

  try {
    const policy = await prisma.leavePolicy.upsert({
      where: { companyId_leaveType: { companyId, leaveType: body.leaveType } },
      create: {
        companyId,
        leaveType: body.leaveType,
        accrualRate: body.accrualRate ?? 2.5,
        maxAccumulation: body.maxAccumulation ?? 0,
        carryOverLimit: body.carryOverLimit ?? 30,
        encashable: body.encashable ?? true,
        encashCap: body.encashCap ?? 0,
      },
      update: {
        accrualRate: body.accrualRate ?? 2.5,
        maxAccumulation: body.maxAccumulation ?? 0,
        carryOverLimit: body.carryOverLimit ?? 30,
        encashable: body.encashable ?? true,
        encashCap: body.encashCap ?? 0,
      },
    });

    await audit({ c, action: 'LEAVE_POLICY_CREATED', resource: 'leave_policy', resourceId: policy.id, details: { leaveType: body.leaveType } });
    return c.json(policy, 201);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();

  try {
    const existing = await prisma.leavePolicy.findUnique({ where: { id }, select: { companyId: true } });
    if (!existing) return c.json({ message: 'Leave policy not found' }, 404);
    if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

    const body = await c.req.json();
    const policy = await prisma.leavePolicy.update({
      where: { id },
      data: {
        ...(body.accrualRate !== undefined && { accrualRate: body.accrualRate }),
        ...(body.maxAccumulation !== undefined && { maxAccumulation: body.maxAccumulation }),
        ...(body.carryOverLimit !== undefined && { carryOverLimit: body.carryOverLimit }),
        ...(body.encashable !== undefined && { encashable: body.encashable }),
        ...(body.encashCap !== undefined && { encashCap: body.encashCap }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
    });

    await audit({ c, action: 'LEAVE_POLICY_UPDATED', resource: 'leave_policy', resourceId: id });
    return c.json(policy);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Leave policy not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();

  try {
    const existing = await prisma.leavePolicy.findUnique({ where: { id }, select: { companyId: true } });
    if (!existing) return c.json({ message: 'Leave policy not found' }, 404);
    if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

    await prisma.leavePolicy.delete({ where: { id } });
    await audit({ c, action: 'LEAVE_POLICY_DELETED', resource: 'leave_policy', resourceId: id });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Leave policy not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
