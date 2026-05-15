import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, getSql } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const adjustBalanceSchema = z.object({
  adjustment: z.number(),
  note: z.string().optional(),
});

router.get('/', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const user = c.get('user');
  const employeeIdFromCtx = c.get('employeeId');
  const year = parseInt(c.req.query('year') || '') || new Date().getFullYear();
  const employeeId = c.req.query('employeeId') || undefined;

  const resolvedEmployeeId = user.role === 'EMPLOYEE' ? employeeIdFromCtx : employeeId;

  const sql = getSql();
  const rawBalances = resolvedEmployeeId
    ? await sql`
        SELECT lb.*, e."firstName", e."lastName", e."employeeCode",
          lp."accrualRate", lp."maxAccumulation", lp."carryOverLimit", lp."encashable"
        FROM "LeaveBalance" lb
        JOIN "Employee" e ON e.id = lb."employeeId"
        LEFT JOIN "LeavePolicy" lp ON lp.id = lb."leavePolicyId"
        WHERE lb."companyId" = ${companyId} AND lb.year = ${year} AND lb."employeeId" = ${resolvedEmployeeId}
        ORDER BY lb."employeeId" ASC, lb."leaveType" ASC
      `
    : await sql`
        SELECT lb.*, e."firstName", e."lastName", e."employeeCode",
          lp."accrualRate", lp."maxAccumulation", lp."carryOverLimit", lp."encashable"
        FROM "LeaveBalance" lb
        JOIN "Employee" e ON e.id = lb."employeeId"
        LEFT JOIN "LeavePolicy" lp ON lp.id = lb."leavePolicyId"
        WHERE lb."companyId" = ${companyId} AND lb.year = ${year}
        ORDER BY lb."employeeId" ASC, lb."leaveType" ASC
      `;
  const balances = (rawBalances as any[]).map(r => ({
    ...r,
    employee: { firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode },
    leavePolicy: r.accrualRate !== undefined ? { accrualRate: r.accrualRate, maxAccumulation: r.maxAccumulation, carryOverLimit: r.carryOverLimit, encashable: r.encashable } : null,
  }));
  return c.json(balances);
});

router.get('/:employeeId', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const employeeId = c.req.param('employeeId');
  const year = parseInt(c.req.query('year') || '') || new Date().getFullYear();
  const sql = getSql();
  const rawBalances = await sql`
    SELECT lb.*, lp."accrualRate", lp."maxAccumulation", lp."carryOverLimit", lp."encashable"
    FROM "LeaveBalance" lb
    LEFT JOIN "LeavePolicy" lp ON lp.id = lb."leavePolicyId"
    WHERE lb."companyId" = ${companyId} AND lb."employeeId" = ${employeeId} AND lb.year = ${year}
    ORDER BY lb."leaveType" ASC
  `;
  const balances = (rawBalances as any[]).map(r => ({
    ...r,
    leavePolicy: r.accrualRate !== undefined ? { accrualRate: r.accrualRate, maxAccumulation: r.maxAccumulation, carryOverLimit: r.carryOverLimit, encashable: r.encashable } : null,
  }));
  return c.json(balances);
});

router.post('/accrue', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const policies = await prisma.leavePolicy.findMany({ where: { companyId, isActive: true } });
  const now = new Date();
  const year = now.getFullYear();
  let accrued = 0;
  for (const policy of policies) {
    const accrualCutoff = new Date(year, now.getMonth(), 1).toISOString();
    const sql = getSql();
    const rawBalances = await sql`
      SELECT lb.*, e."employmentType"
      FROM "LeaveBalance" lb
      JOIN "Employee" e ON e.id = lb."employeeId"
      WHERE lb."leavePolicyId" = ${policy.id}
        AND lb.year = ${year}
        AND (lb."lastAccrualDate" IS NULL OR lb."lastAccrualDate" < ${accrualCutoff}::timestamptz)
        AND e."dischargeDate" IS NULL
    `;
    const balances = (rawBalances as any[]).map(r => ({ ...r, employee: { employmentType: r.employmentType } }));
    for (const bal of balances) {
      const rate = bal.employee.employmentType === 'PART_TIME' ? policy.accrualRate / 2 : policy.accrualRate;
      const newAccrued = bal.accrued + rate;
      const cap = policy.maxAccumulation > 0 ? Math.min(bal.openingBalance + newAccrued - bal.taken - bal.encashed - bal.forfeited, policy.maxAccumulation) : bal.openingBalance + newAccrued - bal.taken - bal.encashed - bal.forfeited;
      await prisma.leaveBalance.update({ where: { id: bal.id }, data: { accrued: newAccrued, balance: cap, lastAccrualDate: now } });
      accrued++;
    }
  }
  return c.json({ message: `Accrual run complete`, accrued });
});

router.post('/year-end', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const year = parseInt(c.req.query('year') || '') || new Date().getFullYear();
  const nextYear = year + 1;
  const sql = getSql();
  const rawYeBalances = await sql`
    SELECT lb.*, lp.id AS lp_id, lp."carryOverLimit", lp."leaveType" AS lp_leave_type,
      lp."accrualRate", lp."maxAccumulation", lp."encashable"
    FROM "LeaveBalance" lb
    LEFT JOIN "LeavePolicy" lp ON lp.id = lb."leavePolicyId"
    WHERE lb."companyId" = ${companyId} AND lb.year = ${year}
  `;
  const balances = (rawYeBalances as any[]).map(r => ({
    ...r,
    leavePolicy: r.lp_id ? { id: r.lp_id, carryOverLimit: r.carryOverLimit, leaveType: r.lp_leave_type, accrualRate: r.accrualRate, maxAccumulation: r.maxAccumulation, encashable: r.encashable } : null,
  }));
  let created = 0;
  for (const bal of balances) {
    const carryOverLimit = bal.leavePolicy?.carryOverLimit ?? 30;
    const carryOver = Math.min(bal.balance, carryOverLimit);
    await prisma.leaveBalance.upsert({
      where: { employeeId_leaveType_year: { employeeId: bal.employeeId, leaveType: bal.leaveType, year: nextYear } },
      update: { openingBalance: carryOver },
      create: { employeeId: bal.employeeId, companyId, leavePolicyId: bal.leavePolicyId, leaveType: bal.leaveType, year: nextYear, openingBalance: carryOver },
    });
    await prisma.leaveBalance.update({ where: { id: bal.id }, data: { forfeited: { increment: bal.balance - carryOver } } });
    created++;
  }
  return c.json({ message: `Year-end processed for ${created} balances` });
});

router.put('/:id/adjust', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const existing = await prisma.leaveBalance.findUnique({ where: { id }, select: { companyId: true, balance: true } });
  if (!existing) return c.json({ message: 'Leave balance not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const body = await c.req.json();
  const adjustment = body.adjustment;
  if (adjustment === undefined) return c.json({ message: 'adjustment is required' }, 400);
  if (existing.balance + adjustment < 0) return c.json({ message: `Adjustment would result in a negative balance` }, 400);
  const updated = await prisma.leaveBalance.update({ where: { id }, data: { accrued: { increment: adjustment }, balance: { increment: adjustment } } });
  await audit({ c, action: 'LEAVE_BALANCE_ADJUSTED', resource: 'leave_balance', resourceId: id, details: { adjustment, newBalance: updated.balance, note: body.note } });
  return c.json(updated);
});

router.post('/', requirePermission('manage_leave'), validateBody(adjustBalanceSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const body = c.req.valid('json');
  const { employeeId, leaveType, year, adjustment, note } = body as any;

  if (!employeeId || !leaveType || !year) {
    return c.json({ message: 'employeeId, leaveType, and year are required' }, 400);
  }

  try {
    const existing = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveType_year: { employeeId, leaveType, year } },
    });
    if (!existing) return c.json({ message: 'Leave balance not found' }, 404);
    if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    if (existing.balance + adjustment < 0) {
      return c.json({ message: `Adjustment would result in a negative balance. Current balance: ${existing.balance}, adjustment: ${adjustment}` }, 400);
    }

    const updated = await prisma.leaveBalance.update({
      where: { id: existing.id },
      data: {
        accrued: { increment: adjustment },
        balance: { increment: adjustment },
      },
    });

    await audit({
      c, action: 'LEAVE_BALANCE_ADJUSTED', resource: 'leave_balance',
      resourceId: existing.id, details: { adjustment, newBalance: updated.balance, note },
    });

    return c.json(updated);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Leave balance not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:id', requirePermission('manage_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();

  try {
    const existing = await prisma.leaveBalance.findUnique({
      where: { id },
      select: { companyId: true, balance: true },
    });
    if (!existing) return c.json({ message: 'Leave balance not found' }, 404);
    if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

    const body = await c.req.json();
    const adjustment = body.adjustment;
    if (adjustment === undefined) return c.json({ message: 'adjustment is required' }, 400);

    if (existing.balance + adjustment < 0) {
      return c.json({ message: `Adjustment would result in a negative balance. Current balance: ${existing.balance}, adjustment: ${adjustment}` }, 400);
    }

    const updated = await prisma.leaveBalance.update({
      where: { id },
      data: {
        accrued: { increment: adjustment },
        balance: { increment: adjustment },
      },
    });

    await audit({
      c, action: 'LEAVE_BALANCE_ADJUSTED', resource: 'leave_balance',
      resourceId: id, details: { adjustment, newBalance: updated.balance, note: body.note },
    });

    return c.json(updated);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Leave balance not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
