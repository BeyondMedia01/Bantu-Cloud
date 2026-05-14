import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const createEncashmentSchema = z.object({
  employeeId: z.string().optional(),
  leaveType: z.string().min(1),
  days: z.number().positive(),
  notes: z.string().optional(),
});

router.get('/', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const user = c.get('user');
  const employeeIdFromCtx = c.get('employeeId');

  const where: Record<string, unknown> = { companyId };
  if (user.role === 'EMPLOYEE' && employeeIdFromCtx) {
    where.employeeId = employeeIdFromCtx;
  }

  const encashments = await prisma.leaveEncashment.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(encashments);
});

router.get('/:id', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const enc = await prisma.leaveEncashment.findUnique({
    where: { id },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
  });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json(enc);
});

router.put('/:id/approve', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const user = c.get('user');
  const enc = await prisma.leaveEncashment.findUnique({
    where: { id }, select: { companyId: true, status: true },
  });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (enc.status !== 'PENDING') return c.json({ message: `Cannot approve a ${enc.status} encashment` }, 400);
  const updated = await prisma.leaveEncashment.update({ where: { id }, data: { status: 'APPROVED', approvedBy: user.userId } });
  await audit({ c, action: 'LEAVE_ENCASHMENT_APPROVED', resource: 'leave_encashment', resourceId: id });
  return c.json(updated);
});

router.put('/:id/reject', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const enc = await prisma.leaveEncashment.findUnique({
    where: { id }, select: { companyId: true, status: true, days: true, leaveBalanceId: true },
  });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (enc.status !== 'PENDING') return c.json({ message: `Cannot reject a ${enc.status} encashment` }, 400);
  const body = await c.req.json().catch(() => ({}));
  await prisma.leaveEncashment.update({ where: { id }, data: { status: 'REJECTED', notes: body.reason || null } });
  await prisma.leaveBalance.update({ where: { id: enc.leaveBalanceId }, data: { encashed: { decrement: enc.days }, balance: { increment: enc.days } } });
  await audit({ c, action: 'LEAVE_ENCASHMENT_REJECTED', resource: 'leave_encashment', resourceId: id });
  return c.json({ message: 'Encashment rejected and balance restored' });
});

router.post('/:id/process', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const enc = await prisma.leaveEncashment.findUnique({
    where: { id }, select: { companyId: true, status: true },
  });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (enc.status !== 'APPROVED') return c.json({ message: `Cannot process a ${enc.status} encashment` }, 400);
  await prisma.leaveEncashment.update({ where: { id }, data: { status: 'PROCESSED' } });
  await audit({ c, action: 'LEAVE_ENCASHMENT_PROCESSED', resource: 'leave_encashment', resourceId: id });
  return c.json({ message: 'Encashment processed' });
});

router.post('/', validateBody(createEncashmentSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const body = c.req.valid('json');
  const user = c.get('user');
  const year = new Date().getFullYear();

  try {
    let employeeId = body.employeeId;
    if (user.role === 'EMPLOYEE') {
      const emp = await prisma.employee.findUnique({ where: { userId: user.userId }, select: { id: true } });
      if (!emp) return c.json({ message: 'Employee record not found' }, 404);
      employeeId = emp.id;
    }

    if (!employeeId) return c.json({ message: 'employeeId is required' }, 400);

    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveType_year: { employeeId, leaveType: body.leaveType, year } },
      include: { leavePolicy: true },
    });

    if (!balance) return c.json({ message: 'No leave balance found for this type and year' }, 400);
    if (balance.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    if (balance.balance < body.days) {
      return c.json({ message: `Insufficient leave balance. Available: ${balance.balance}, Requested: ${body.days}` }, 400);
    }
    if (balance.leavePolicy && !balance.leavePolicy.encashable) {
      return c.json({ message: `${body.leaveType} leave is not encashable per company policy` }, 400);
    }
    if (balance.leavePolicy && balance.leavePolicy.encashCap > 0) {
      const remaining = balance.leavePolicy.encashCap - (balance.encashed || 0);
      if (remaining < body.days) {
        return c.json({ message: `Encashment cap reached. Remaining encashable: ${remaining} days` }, 400);
      }
    }

    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { baseRate: true, currency: true, daysPerPeriod: true },
    });

    const divisor = emp?.daysPerPeriod || 22;
    const monthlySalary = emp?.baseRate || 0;
    const ratePerDay = monthlySalary > 0 && divisor > 0 ? parseFloat((monthlySalary / divisor).toFixed(2)) : 0;
    const totalAmount = parseFloat((body.days * ratePerDay).toFixed(2));
    const currency = emp?.currency || 'USD';

    const encashment = await prisma.leaveEncashment.create({
      data: {
        employeeId,
        leaveBalanceId: balance.id,
        companyId,
        leaveType: body.leaveType,
        days: body.days,
        ratePerDay,
        totalAmount,
        currency,
        requestedBy: user.userId,
        notes: body.notes || null,
      },
    });
    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        encashed: { increment: body.days },
        balance: { decrement: body.days },
      },
    });

    await audit({
      c, action: 'LEAVE_ENCASHMENT_REQUESTED', resource: 'leave_encashment',
      resourceId: encashment.id, details: { employeeId, leaveType: body.leaveType, days: body.days, totalAmount },
    });

    return c.json(encashment, 201);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();
  const user = c.get('user');

  try {
    const body = await c.req.json();

    if (body.status === 'APPROVED') {
      const enc = await prisma.leaveEncashment.findUnique({
        where: { id },
        select: { companyId: true, status: true },
      });
      if (!enc) return c.json({ message: 'Encashment not found' }, 404);
      if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
      if (enc.status !== 'PENDING') return c.json({ message: `Cannot approve a ${enc.status} encashment` }, 400);

      const updated = await prisma.leaveEncashment.update({
        where: { id },
        data: { status: 'APPROVED', approvedBy: user.userId },
      });

      await audit({ c, action: 'LEAVE_ENCASHMENT_APPROVED', resource: 'leave_encashment', resourceId: id });
      return c.json(updated);
    }

    if (body.status === 'REJECTED') {
      const enc = await prisma.leaveEncashment.findUnique({
        where: { id },
        select: { companyId: true, status: true, days: true, leaveBalanceId: true },
      });
      if (!enc) return c.json({ message: 'Encashment not found' }, 404);
      if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
      if (enc.status !== 'PENDING') return c.json({ message: `Cannot reject a ${enc.status} encashment` }, 400);

      await prisma.leaveEncashment.update({
        where: { id },
        data: { status: 'REJECTED', notes: body.reason || null },
      });
      await prisma.leaveBalance.update({
        where: { id: enc.leaveBalanceId },
        data: {
          encashed: { decrement: enc.days },
          balance: { increment: enc.days },
        },
      });

      await audit({ c, action: 'LEAVE_ENCASHMENT_REJECTED', resource: 'leave_encashment', resourceId: id, details: { reason: body.reason } });
      return c.json({ message: 'Encashment rejected and balance restored' });
    }

    return c.json({ message: 'Invalid status. Use APPROVED or REJECTED' }, 400);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Encashment not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
