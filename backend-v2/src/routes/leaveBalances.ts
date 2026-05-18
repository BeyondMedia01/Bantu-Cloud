import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { getBalance } from '../services/leaveLedger.service';

const router = new Hono();

const adjustSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  adjustment: z.number(),
  note: z.string().optional(),
});

router.get('/', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const user = c.get('user');
  const employeeIdFromCtx = c.get('employeeId');
  const targetEmployeeId = c.req.query('employeeId');

  const resolvedEmployeeId = user.role === 'EMPLOYEE' ? employeeIdFromCtx : targetEmployeeId;

  const [employees, leaveTypes] = await Promise.all([
    resolvedEmployeeId
      ? prisma.employee.findMany({
          where: { id: resolvedEmployeeId, companyId },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        })
      : prisma.employee.findMany({
          where: { companyId, dischargeDate: null },
          select: { id: true, firstName: true, lastName: true, employeeCode: true },
        }),
    prisma.leaveType.findMany({
      where: { companyId, isActive: true },
      include: { leavePolicies: { where: { isActive: true } } },
    }),
  ]);

  const results = [];
  for (const emp of employees) {
    for (const lt of leaveTypes) {
      const balance = await getBalance(emp.id, lt.id);
      const policy = lt.leavePolicies[0];
      results.push({
        employeeId: emp.id,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        leaveTypeId: lt.id,
        leaveTypeName: lt.name,
        balance,
        policy: policy ? {
          accrualRate: policy.accrualRate,
          maxAccumulation: policy.maxAccumulation,
          carryOverLimit: policy.carryOverLimit,
          encashable: policy.encashable,
          encashCap: policy.encashCap,
        } : null,
      });
    }
  }

  return c.json(results);
});

router.get('/:employeeId', requirePermission('view_leave'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const employeeId = c.req.param('employeeId');
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, companyId: true, firstName: true, lastName: true },
  });
  if (!emp || emp.companyId !== companyId) return c.json({ message: 'Employee not found' }, 404);

  const leaveTypes = await prisma.leaveType.findMany({
    where: { companyId, isActive: true },
    include: { leavePolicies: { where: { isActive: true } } },
  });

  const results = [];
  for (const lt of leaveTypes) {
    const balance = await getBalance(emp.id, lt.id);
    const policy = lt.leavePolicies[0];
    results.push({
      leaveTypeId: lt.id,
      leaveTypeName: lt.name,
      balance,
      accrualType: lt.accrualType,
      entitlementDays: lt.entitlementDays,
      maxAccumulation: lt.maxAccumulation,
      carryForwardDays: lt.carryForwardDays,
      policy: policy ? {
        accrualRate: policy.accrualRate,
        entitlementDays: policy.entitlementDays,
        maxAccumulation: policy.maxAccumulation,
        carryOverLimit: policy.carryOverLimit,
        encashable: policy.encashable,
        encashCap: policy.encashCap,
      } : null,
    });
  }

  return c.json({ employeeName: `${emp.firstName} ${emp.lastName}`, balances: results });
});

router.post('/adjust', requirePermission('manage_leave'), validateBody(adjustSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const body = c.req.valid('json');
  const { employeeId, leaveTypeId, adjustment, note } = body;

  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } });
  if (!emp || emp.companyId !== companyId) return c.json({ message: 'Employee not found' }, 404);

  const lt = await prisma.leaveType.findUnique({ where: { id: leaveTypeId } });
  if (!lt || lt.companyId !== companyId) return c.json({ message: 'Leave type not found' }, 404);

  const { addLedgerEntry } = await import('../services/leaveLedger.service');
  const { newBalance } = await addLedgerEntry({
    employeeId,
    leaveTypeId,
    transactionType: 'ADJUSTMENT',
    amount: adjustment,
    referenceDocType: 'ManualAdjustment',
    description: note || 'Balance adjustment',
    createdBy: c.get('user')?.userId,
  });

  await audit({
    c, action: 'LEAVE_BALANCE_ADJUSTED', resource: 'leave_balance',
    resourceId: `${employeeId}_${leaveTypeId}`,
    details: { adjustment, newBalance, note },
  });

  return c.json({ employeeId, leaveTypeId, newBalance });
});

export default router;