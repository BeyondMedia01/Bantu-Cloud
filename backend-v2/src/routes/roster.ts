import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const assignmentSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1),
  shiftId: z.string().min(1),
  startDate: z.string().min(1),
  endDate: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  notes: z.string().optional(),
});

const updateSchema = z.object({
  endDate: z.string().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  notes: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.get('/calendar', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  if (!startDate || !endDate) return c.json({ message: 'startDate and endDate are required' }, 400);

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (end <= start) return c.json({ message: 'endDate must be after startDate' }, 400);

  try {
    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        companyId,
        isActive: true,
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
      include: {
        shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true } },
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });

    const dates: string[] = [];
    const cur = new Date(start);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    const employees: Array<{ id: string; firstName: string; lastName: string; employeeCode: string | null }> = [];
    const empSeen = new Set<string>();
    const grid: Record<string, Record<string, { shiftId: string; code: string; startTime: string; endTime: string }>> = {};

    for (const asgn of assignments) {
      const empId = asgn.employee.id;
      if (!empSeen.has(empId)) { empSeen.add(empId); employees.push(asgn.employee); }
      if (!grid[empId]) grid[empId] = {};

      const days: number[] = JSON.parse(asgn.daysOfWeek || '[1,2,3,4,5]');
      const asgnStart = new Date(asgn.startDate);
      const asgnEnd = asgn.endDate ? new Date(asgn.endDate) : null;

      for (const dateStr of dates) {
        const d = new Date(dateStr);
        if (d < asgnStart || (asgnEnd && d > asgnEnd)) continue;
        if (days.includes(d.getDay())) {
          grid[empId][dateStr] = {
            shiftId: asgn.shift.id,
            code: asgn.shift.code || asgn.shift.name,
            startTime: asgn.shift.startTime,
            endTime: asgn.shift.endTime,
          };
        }
      }
    }

    return c.json({ employees, dates, grid });
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { startDate, endDate, employeeId, shiftId } = c.req.query();

  try {
    const where: Record<string, unknown> = { companyId, isActive: true };
    if (employeeId) where.employeeId = employeeId;
    if (shiftId) where.shiftId = shiftId;
    if (startDate || endDate) {
      where.OR = [{ endDate: null }, { endDate: { gte: startDate ? new Date(startDate) : new Date() } }];
      if (endDate) where.startDate = { lte: new Date(endDate) };
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where,
      include: {
        shift: { select: { id: true, name: true, code: true, startTime: true, endTime: true } },
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { startDate: 'desc' },
    });
    return c.json(assignments);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/', requirePermission('manage_employees'), validateBody(assignmentSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const body = c.req.valid('json');
  const shift = await prisma.shift.findFirst({ where: { id: body.shiftId, companyId } });
  if (!shift) return c.json({ message: 'Shift not found' }, 404);

  const days = body.daysOfWeek ? JSON.stringify(body.daysOfWeek) : '[1,2,3,4,5]';

  try {
    const created = await Promise.all(
      body.employeeIds.map((empId: string) =>
        prisma.shiftAssignment.create({
          data: {
            employeeId: empId,
            shiftId: body.shiftId,
            companyId,
            startDate: new Date(body.startDate),
            endDate: body.endDate ? new Date(body.endDate) : null,
            daysOfWeek: days,
            notes: body.notes || null,
          },
        })
      )
    );
    return c.json(created, 201);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:id', requirePermission('manage_employees'), validateBody(updateSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  try {
    const existing = await prisma.shiftAssignment.findUnique({ where: { id } });
    if (!existing || (companyId && existing.companyId !== companyId)) {
      return c.json({ message: 'Not found' }, 404);
    }

    const body = c.req.valid('json');
    const updateData: Record<string, unknown> = {};
    if (body.endDate !== undefined) updateData.endDate = body.endDate ? new Date(body.endDate) : null;
    if (body.daysOfWeek !== undefined) updateData.daysOfWeek = JSON.stringify(body.daysOfWeek);
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const updated = await prisma.shiftAssignment.update({
      where: { id },
      data: updateData,
      include: {
        shift: { select: { id: true, name: true, startTime: true, endTime: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return c.json(updated);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/:id', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  try {
    const existing = await prisma.shiftAssignment.findUnique({ where: { id } });
    if (!existing || (companyId && existing.companyId !== companyId)) {
      return c.json({ message: 'Not found' }, 404);
    }
    await prisma.shiftAssignment.delete({ where: { id } });
    return c.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
