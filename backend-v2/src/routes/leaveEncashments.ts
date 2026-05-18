import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { addLedgerEntry, getBalance } from '../services/leaveLedger.service';

const router = new Hono();

const createEncashmentSchema = z.object({
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid(),
  days: z.number().positive(),
  notes: z.string().optional(),
});

router.get('/', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

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
      leaveType: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(encashments.map((e) => ({
    ...e,
    leaveTypeName: e.leaveType.name,
  })));
});

router.get('/:id', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { id } = c.req.param();
  const enc = await prisma.leaveEncashment.findUnique({
    where: { id },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      leaveType: { select: { name: true } },
    },
  });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json({ ...enc, leaveTypeName: enc.leaveType.name });
});

router.put('/:id/approve', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { id } = c.req.param();
  const user = c.get('user');

  const enc = await prisma.leaveEncashment.findUnique({ where: { id } });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (enc.status !== 'PENDING') return c.json({ message: `Cannot approve a ${enc.status} encashment` }, 400);

  await prisma.leaveEncashment.update({ where: { id }, data: { status: 'APPROVED', approvedBy: user.userId } });
  await audit({ c, action: 'LEAVE_ENCASHMENT_APPROVED', resource: 'leave_encashment', resourceId: id });
  return c.json({ message: 'Encashment approved' });
});

router.put('/:id/reject', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { id } = c.req.param();
  const enc = await prisma.leaveEncashment.findUnique({ where: { id } });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (enc.status !== 'PENDING') return c.json({ message: `Cannot reject a ${enc.status} encashment` }, 400);

  await addLedgerEntry({
    employeeId: enc.employeeId,
    leaveTypeId: enc.leaveTypeId,
    transactionType: 'ADJUSTMENT',
    amount: enc.days,
    referenceDocType: 'LeaveEncashment',
    referenceId: enc.id,
    description: 'Encashment rejected — balance restored',
    createdBy: c.get('user')?.userId,
  });

  await prisma.leaveEncashment.update({ where: { id }, data: { status: 'REJECTED' } });
  await audit({ c, action: 'LEAVE_ENCASHMENT_REJECTED', resource: 'leave_encashment', resourceId: id });
  return c.json({ message: 'Encashment rejected and balance restored' });
});

router.post('/:id/process', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { id } = c.req.param();

  const enc = await prisma.leaveEncashment.findUnique({ where: { id } });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (enc.status !== 'APPROVED') return c.json({ message: `Cannot process a ${enc.status} encashment` }, 400);

  await prisma.leaveEncashment.update({ where: { id }, data: { status: 'PROCESSED' } });
  await audit({ c, action: 'LEAVE_ENCASHMENT_PROCESSED', resource: 'leave_encashment', resourceId: id });
  return c.json({ message: 'Encashment processed' });
});

router.post('/', requirePermission('view_leave'), validateBody(createEncashmentSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const body = c.req.valid('json');
  const user = c.get('user');

  let employeeId = body.employeeId;
  if (user.role === 'EMPLOYEE') {
    const emp = await prisma.employee.findUnique({ where: { userId: user.userId }, select: { id: true } });
    if (!emp) return c.json({ message: 'Employee record not found' }, 404);
    employeeId = emp.id;
  }
  if (!employeeId) return c.json({ message: 'employeeId is required' }, 400);

  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true, baseRate: true, currency: true, daysPerPeriod: true } });
  if (!emp || emp.companyId !== companyId) return c.json({ message: 'Employee not found' }, 404);

  const lt = await prisma.leaveType.findUnique({ where: { id: body.leaveTypeId } });
  if (!lt || lt.companyId !== companyId) return c.json({ message: 'Leave type not found' }, 403);

  const policy = await prisma.leavePolicy.findUnique({ where: { companyId_leaveTypeId: { companyId, leaveTypeId: body.leaveTypeId } } });
  if (policy && !policy.encashable) return c.json({ message: `${lt.name} leave is not encashable per policy` }, 400);

  const balance = await getBalance(employeeId, body.leaveTypeId);
  if (balance < body.days) {
    return c.json({ message: `Insufficient leave balance. Available: ${balance}, Requested: ${body.days}` }, 400);
  }

  if (policy && policy.encashCap > 0) {
    const encashed = await prisma.leaveEncashment.aggregate({
      where: { employeeId, leaveTypeId: body.leaveTypeId, status: { in: ['APPROVED', 'PROCESSED'] } },
      _sum: { days: true },
    });
    const totalEncashed = encashed._sum.days ?? 0;
    const remaining = policy.encashCap - totalEncashed;
    if (remaining < body.days) {
      return c.json({ message: `Encashment cap reached. Remaining encashable: ${remaining} days` }, 400);
    }
  }

  const divisor = emp.daysPerPeriod || 22;
  const monthlySalary = emp.baseRate || 0;
  const ratePerDay = monthlySalary > 0 && divisor > 0 ? parseFloat((monthlySalary / divisor).toFixed(2)) : 0;
  const totalAmount = parseFloat((body.days * ratePerDay).toFixed(2));

  let balanceRec: { id: string } | null = null;
  const year = new Date().getFullYear();
  try {
    balanceRec = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId: body.leaveTypeId, year } },
      select: { id: true },
    });
  } catch {
    balanceRec = null;
  }

  const encashment = await prisma.leaveEncashment.create({
    data: {
      employeeId,
      leaveBalanceId: balanceRec?.id ?? '',
      leaveTypeId: body.leaveTypeId,
      companyId,
      days: body.days,
      ratePerDay,
      totalAmount,
      currency: emp.currency || 'USD',
      requestedBy: user.userId,
      notes: body.notes || null,
    },
  });

  await addLedgerEntry({
    employeeId,
    leaveTypeId: body.leaveTypeId,
    transactionType: 'ENCASHMENT',
    amount: -body.days,
    referenceDocType: 'LeaveEncashment',
    referenceId: encashment.id,
    description: `Leave encashment: ${body.days} days at ${ratePerDay}/day`,
    createdBy: user.userId,
  });

  await audit({
    c, action: 'LEAVE_ENCASHMENT_REQUESTED', resource: 'leave_encashment',
    resourceId: encashment.id, details: { employeeId, leaveTypeId: body.leaveTypeId, days: body.days, totalAmount },
  });

  return c.json(encashment, 201);
});

router.put('/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { id } = c.req.param();
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));

  const enc = await prisma.leaveEncashment.findUnique({ where: { id } });
  if (!enc) return c.json({ message: 'Encashment not found' }, 404);
  if (enc.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  if (body.status === 'APPROVED' && enc.status === 'PENDING') {
    const updated = await prisma.leaveEncashment.update({ where: { id }, data: { status: 'APPROVED', approvedBy: user.userId } });
    await audit({ c, action: 'LEAVE_ENCASHMENT_APPROVED', resource: 'leave_encashment', resourceId: id });
    return c.json(updated);
  }

  if (body.status === 'REJECTED' && enc.status === 'PENDING') {
    await addLedgerEntry({
      employeeId: enc.employeeId,
      leaveTypeId: enc.leaveTypeId,
      transactionType: 'ADJUSTMENT',
      amount: enc.days,
      referenceDocType: 'LeaveEncashment',
      referenceId: enc.id,
      description: 'Encashment rejected — balance restored',
      createdBy: c.get('user')?.userId,
    });

    const updated = await prisma.leaveEncashment.update({ where: { id }, data: { status: 'REJECTED', notes: body.reason || null } });
    await audit({ c, action: 'LEAVE_ENCASHMENT_REJECTED', resource: 'leave_encashment', resourceId: id, details: { reason: body.reason } });
    return c.json(updated);
  }

  return c.json({ message: 'Invalid status transition' }, 400);
});

export default router;