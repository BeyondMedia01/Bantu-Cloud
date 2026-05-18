import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.get('/', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { employeeId, leaveTypeId, year } = c.req.query();
  const targetYear = year ? parseInt(year) : new Date().getFullYear();

  const where: Record<string, unknown> = {
    employee: { companyId },
    year: targetYear,
  };
  if (employeeId) where.employeeId = employeeId;
  if (leaveTypeId) where.leaveTypeId = leaveTypeId;

  const allocations = await prisma.leaveAllocation.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(allocations);
});

router.post('/', requirePermission('manage_leave'), validateBody(z.object({
  employeeIds: z.array(z.string().uuid()).min(1),
  leaveTypeId: z.string().uuid(),
  entitlement: z.number(),
  year: z.number().optional(),
  carryForward: z.number().optional(),
})), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const body = c.req.valid('json');
  const targetYear = body.year || new Date().getFullYear();

  const created = [];
  for (const empId of body.employeeIds) {
    const emp = await prisma.employee.findUnique({ where: { id: empId, companyId }, select: { id: true } });
    if (!emp) continue;

    let existing: { id: string } | null = null;
    try {
      existing = await prisma.leaveAllocation.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: empId, leaveTypeId: body.leaveTypeId, year: targetYear } },
        select: { id: true },
      });
    } catch { existing = null; }

    if (existing) {
      const updated = await prisma.leaveAllocation.update({
        where: { id: existing.id },
        data: { entitlement: body.entitlement, carriedForward: body.carryForward || 0 },
      });
      created.push(updated);
    } else {
      const alloc = await prisma.leaveAllocation.create({
        data: {
          employeeId: empId,
          leaveTypeId: body.leaveTypeId,
          year: targetYear,
          entitlement: body.entitlement,
          carriedForward: body.carryForward || 0,
        },
      });
      created.push(alloc);
    }
  }
  return c.json(created, 201);
});

router.delete('/:employeeId/:leaveTypeId/:year', requirePermission('manage_leave'), async (c) => {
  const { employeeId, leaveTypeId, year } = c.req.param();
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } });
  if (!emp || emp.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.leaveAllocation.delete({
    where: {
      employeeId_leaveTypeId_year: {
        employeeId,
        leaveTypeId,
        year: parseInt(year),
      },
    },
  });
  return c.body(null, 204);
});

export default router;