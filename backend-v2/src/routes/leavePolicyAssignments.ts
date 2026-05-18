import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { denyUnlessCompany } from '../lib/ownership';

const router = new Hono();

const assignmentSchema = z.object({
  employeeId: z.string().uuid(),
  leavePolicyId: z.string().uuid(),
  effectiveFrom: z.string().optional(),
  effectiveTo: z.string().optional(),
  reason: z.string().optional(),
});

router.get('/', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company required' }, 400);

  const { data: assignments } = await c.req.parseBody().then(() => ({ data: null }));
  const employeeId = c.req.query('employeeId');
  const where: Record<string, unknown> = { companyId };
  if (employeeId) where.employeeId = employeeId;

  const results = await prisma.leavePolicyAssignment.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      leavePolicy: { include: { leaveType: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(results.map((a) => ({
    ...a,
    employeeName: `${a.employee.firstName} ${a.employee.lastName}`,
    employeeCode: a.employee.employeeCode,
    leaveTypeName: a.leavePolicy.leaveType.name,
  })));
});

router.post('/', requirePermission('manage_leave'), validateBody(assignmentSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company required' }, 400);
  const body = c.req.valid('json');
  const user = c.get('user');

  const policy = await prisma.leavePolicy.findUnique({ where: { id: body.leavePolicyId } });
  if (!policy) return c.json({ message: 'Leave policy not found' }, 404);
  if (policy.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const emp = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { companyId: true } });
  if (!emp || emp.companyId !== companyId) return c.json({ message: 'Employee not found' }, 404);

  const existingActive = await prisma.leavePolicyAssignment.findFirst({
    where: { employeeId: body.employeeId, leavePolicyId: body.leavePolicyId, effectiveTo: null },
  });
  if (existingActive) {
    if (body.effectiveFrom) {
      await prisma.leavePolicyAssignment.update({
        where: { id: existingActive.id },
        data: { effectiveTo: new Date(body.effectiveFrom) },
      });
    } else {
      return c.json({ message: 'Employee already has an active assignment for this policy' }, 409);
    }
  }

  const allocation = await prisma.leaveAllocation.upsert({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId: body.employeeId,
        leaveTypeId: policy.leaveTypeId,
        year: new Date().getFullYear(),
      },
    },
    create: {
      employeeId: body.employeeId,
      leaveTypeId: policy.leaveTypeId,
      year: new Date().getFullYear(),
      entitlement: policy.entitlementDays,
      carriedForward: 0,
    },
    update: {},
  });

  const assignment = await prisma.leavePolicyAssignment.create({
    data: {
      employeeId: body.employeeId,
      leavePolicyId: body.leavePolicyId,
      companyId,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
      effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : undefined,
      reason: body.reason,
      createdBy: user?.userId,
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
      leavePolicy: { include: { leaveType: { select: { name: true } } } },
    },
  });

  await audit({
    c, action: 'LEAVE_POLICY_ASSIGNED',
    resource: 'leave_policy_assignment', resourceId: assignment.id,
    details: { employeeId: body.employeeId, policyId: body.leavePolicyId },
  });

  return c.json(assignment, 201);
});

router.delete('/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  const existing = await prisma.leavePolicyAssignment.findUnique({ where: { id: c.req.param('id') } });
  if (!existing) return c.json({ message: 'Assignment not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.leavePolicyAssignment.update({
    where: { id: existing.id },
    data: { effectiveTo: new Date() },
  });
  return c.body(null, 204);
});

export default router;