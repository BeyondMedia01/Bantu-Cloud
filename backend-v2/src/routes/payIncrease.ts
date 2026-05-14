import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const payIncreaseSchema = z.object({
  employeeIds: z.array(z.string()).optional(),
  percentage: z.number().optional(),
  amount: z.number().optional(),
  effectiveDate: z.string().min(1),
  filter: z.object({
    departmentId: z.string().optional(),
    branchId: z.string().optional(),
    employmentType: z.string().optional(),
  }).optional(),
});

router.post('/', requirePermission('manage_employees'), validateBody(payIncreaseSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { employeeIds, percentage, amount, effectiveDate, filter = {} } = c.req.valid('json');

  if (percentage === undefined && amount === undefined) {
    return c.json({ message: 'Either percentage or amount is required' }, 400);
  }

  try {
    const where: Record<string, unknown> = { companyId };
    if (employeeIds?.length) where.id = { in: employeeIds };
    if (filter.departmentId) where.departmentId = filter.departmentId;
    if (filter.branchId) where.branchId = filter.branchId;
    if (filter.employmentType) where.employmentType = filter.employmentType;

    const employees = await prisma.employee.findMany({ where, select: { id: true, baseRate: true } });
    if (employees.length === 0) return c.json({ message: 'No matching employees found' }, 400);

    const isFutureDate = new Date(effectiveDate) > new Date();

    const updates = await Promise.all(
      employees.map((emp) => {
        const oldRate = emp.baseRate;
        const newRate = percentage !== undefined
          ? emp.baseRate * (1 + percentage / 100)
          : emp.baseRate + (amount ?? 0);
        const roundedNew = Math.round(newRate * 100) / 100;

        return prisma.employee.update({
          where: { id: emp.id },
          data: { baseRate: roundedNew },
          select: { id: true, baseRate: true, firstName: true, lastName: true, currency: true },
        }).then((updated) => ({ ...updated, oldRate }));
      }),
    );

    await audit({
      c,
      action: 'PAY_INCREASE_APPLIED',
      resource: 'employee',
      details: {
        effectiveDate,
        isFutureEffectiveDate: isFutureDate,
        method: percentage !== undefined ? 'percentage' : 'fixed_amount',
        value: percentage !== undefined ? percentage : amount,
        employees: updates.map((u) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          oldRate: u.oldRate,
          newRate: u.baseRate,
          currency: u.currency,
        })),
      },
    });

    return c.json({
      message: `Pay increase applied to ${updates.length} employee(s)${isFutureDate ? ' — note: effective date is in the future; use Back Pay to recover the gap' : ''}`,
      effectiveDate,
      isFutureEffectiveDate: isFutureDate,
      employees: updates,
    });
  } catch (error: any) {
    console.error(error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
