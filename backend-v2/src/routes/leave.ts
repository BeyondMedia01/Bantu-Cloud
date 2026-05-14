import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { denyUnlessCompany } from '../lib/ownership';

const router = new Hono();
const VALID_LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'COMPASSIONATE', 'STUDY', 'OTHER'];

router.get('/', requirePermission('view_leave'), async (c) => {
  const employeeId = c.req.query('employeeId');
  const status = c.req.query('status');
  const type = c.req.query('type');
  const user = c.get('user');
  const employeeIdFromCtx = c.get('employeeId');
  const companyId = c.get('companyId');

  if (user.role !== 'EMPLOYEE' && !companyId) return c.json({ data: { records: [], requests: [] } });

  const where: Record<string, unknown> = {};
  if (companyId) where.employee = { companyId };
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;
  if (type) where.type = type;
  if (user.role === 'EMPLOYEE' && employeeIdFromCtx) where.employeeId = employeeIdFromCtx;

  const [records, requests] = await Promise.all([
    prisma.leaveRecord.findMany({ where, include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } }, orderBy: { startDate: 'desc' } }),
    prisma.leaveRequest.findMany({ where, include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } }, orderBy: { createdAt: 'desc' } }),
  ]);

  return c.json({ data: { records, requests } });
});

router.get('/:id', requirePermission('view_leave'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const record = await prisma.leaveRecord.findUnique({
    where: { id },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, companyId: true } } },
  });
  if (!record) return c.json({ message: 'Leave record not found' }, 404);
  if (!companyId || record.employee.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json(record);
});

const createLeaveSchema = z.object({
  employeeId: z.string().optional(),
  type: z.string().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  totalDays: z.number().positive().optional(),
  days: z.number().positive().optional(),
  reason: z.string().optional(),
});

router.post('/', requirePermission('manage_leave'), validateBody(createLeaveSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');
  const daysValue = body.days || body.totalDays || 0;

  if (body.type && !VALID_LEAVE_TYPES.includes(body.type)) {
    return c.json({ message: `Invalid leave type. Must be one of: ${VALID_LEAVE_TYPES.join(', ')}` }, 400);
  }

  if (user.role === 'EMPLOYEE') {
    if (!body.startDate || !body.endDate || !daysValue) {
      return c.json({ error: 'Missing required fields: startDate, endDate, days' }, 400);
    }
    const emp = await prisma.employee.findUnique({ where: { userId: user.userId } });
    if (!emp) return c.json({ message: 'Employee record not found' }, 404);

    const request = await prisma.leaveRequest.create({
      data: { employeeId: emp.id, type: body.type || 'ANNUAL', startDate: new Date(body.startDate), endDate: new Date(body.endDate), days: daysValue, reason: body.reason },
    });
    return c.json(request, 201);
  }

  try {
    const record = await prisma.leaveRecord.create({
      data: {
        employeeId: body.employeeId!,
        type: body.type || 'ANNUAL',
        startDate: new Date(body.startDate),
        endDate: new Date(body.endDate),
        totalDays: daysValue,
        reason: body.reason,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    await prisma.employee.update({
      where: { id: body.employeeId },
      data: { leaveTaken: { increment: daysValue }, leaveBalance: { decrement: daysValue } },
    });

    await audit({ c, action: 'LEAVE_CREATED', resource: 'leave_record', resourceId: record.id, details: { employeeId: body.employeeId, type: body.type, days: daysValue } });
    return c.json(record, 201);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:id', requirePermission('manage_leave'), async (c) => {
  const existing = await prisma.leaveRecord.findUnique({ where: { id: c.req.param('id') }, include: { employee: { select: { companyId: true } } } });
  if (!existing) return c.json({ message: 'Leave record not found' }, 404);
  if (!denyUnlessCompany(c, { companyId: existing.employee.companyId })) return c.json({ message: 'Access denied' }, 403);
  try {
    const body = await c.req.json();
    const record = await prisma.leaveRecord.update({ where: { id: c.req.param('id') }, data: body });
    return c.json(record);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Leave record not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/:id', requirePermission('manage_leave'), async (c) => {
  const existing = await prisma.leaveRecord.findUnique({ where: { id: c.req.param('id') }, include: { employee: { select: { companyId: true } } } });
  if (!existing) return c.json({ message: 'Leave record not found' }, 404);
  if (!denyUnlessCompany(c, { companyId: existing.employee.companyId })) return c.json({ message: 'Access denied' }, 403);
  try {
    await prisma.leaveRecord.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Leave record not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/request/:id/approve', requirePermission('approve_leave'), async (c) => {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: c.req.param('id') }, include: { employee: { select: { companyId: true } } } });
  if (!existing) return c.json({ message: 'Leave request not found' }, 404);
  if (!denyUnlessCompany(c, { companyId: existing.employee.companyId })) return c.json({ message: 'Access denied' }, 403);
  try {
    const { note } = await c.req.json().catch(() => ({}));
    await prisma.leaveRequest.update({
      where: { id: c.req.param('id') },
      data: { status: 'APPROVED', reviewedBy: c.get('user').userId, reviewNote: note },
    });

    await prisma.leaveRecord.create({
      data: { employeeId: existing.employeeId, type: existing.type, startDate: existing.startDate, endDate: existing.endDate, totalDays: existing.days, reason: existing.reason, status: 'APPROVED', approvedBy: c.get('user').userId },
    });
    await prisma.employee.update({
      where: { id: existing.employeeId },
      data: { leaveTaken: { increment: existing.days }, leaveBalance: { decrement: existing.days } },
    });

    await audit({ c, action: 'LEAVE_APPROVED', resource: 'leave_request', resourceId: c.req.param('id') });
    return c.json({ message: 'Leave approved' });
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Leave request not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/request/:id/reject', requirePermission('reject_leave'), async (c) => {
  const existing = await prisma.leaveRequest.findUnique({ where: { id: c.req.param('id') }, include: { employee: { select: { companyId: true } } } });
  if (!existing) return c.json({ message: 'Leave request not found' }, 404);
  if (!denyUnlessCompany(c, { companyId: existing.employee.companyId })) return c.json({ message: 'Access denied' }, 403);
  try {
    const { note } = await c.req.json().catch(() => ({}));
    await prisma.leaveRequest.update({
      where: { id: c.req.param('id') },
      data: { status: 'REJECTED', reviewedBy: c.get('user').userId, reviewNote: note },
    });
    await audit({ c, action: 'LEAVE_REJECTED', resource: 'leave_request', resourceId: c.req.param('id') });
    return c.json({ message: 'Leave rejected' });
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Leave request not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
