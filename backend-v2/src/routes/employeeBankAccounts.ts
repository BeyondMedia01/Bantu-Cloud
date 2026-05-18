import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { denyUnlessCompany } from '../lib/ownership';

const router = new Hono();

const createBankAccountSchema = z.object({
  employeeId: z.string().uuid(),
  accountName: z.string().optional(),
  accountNumber: z.string().min(1),
  bankName: z.string().min(1),
  bankBranch: z.string().optional(),
  branchCode: z.string().optional(),
  currency: z.string().default('USD'),
  splitType: z.enum(['REMAINDER', 'FIXED', 'PERCENTAGE']).default('REMAINDER'),
  splitValue: z.number().default(0),
  priority: z.number().int().min(0).default(0),
});

const updateBankAccountSchema = z.object({
  accountName: z.string().nullable().optional(),
  accountNumber: z.string().min(1).optional(),
  bankName: z.string().min(1).optional(),
  bankBranch: z.string().nullable().optional(),
  branchCode: z.string().nullable().optional(),
  currency: z.string().optional(),
  splitType: z.enum(['REMAINDER', 'FIXED', 'PERCENTAGE']).optional(),
  splitValue: z.number().optional(),
  priority: z.number().int().min(0).optional(),
});

router.get('/employee/:employeeId', requirePermission('view_employees'), async (c) => {
  const { employeeId } = c.req.param();
  const companyId = c.get('companyId');

  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } });
  if (!emp) return c.json({ message: 'Employee not found' }, 404);
  if (companyId && emp.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const accounts = await prisma.employeeBankAccount.findMany({
    where: { employeeId },
    orderBy: { priority: 'asc' },
  });
  return c.json(accounts);
});

router.post('/', requirePermission('manage_employees'), validateBody(createBankAccountSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const body = c.req.valid('json');
  const emp = await prisma.employee.findUnique({ where: { id: body.employeeId }, select: { companyId: true } });
  if (!emp) return c.json({ message: 'Employee not found' }, 404);
  if (emp.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const existing = await prisma.employeeBankAccount.count({ where: { employeeId: body.employeeId } });
  const priority = body.priority || existing;

  const account = await prisma.employeeBankAccount.create({
    data: {
      employeeId: body.employeeId,
      accountName: body.accountName || null,
      accountNumber: body.accountNumber,
      bankName: body.bankName,
      bankBranch: body.bankBranch || null,
      branchCode: body.branchCode || null,
      currency: body.currency,
      splitType: body.splitType,
      splitValue: body.splitValue,
      priority,
    },
  });

  await audit({ c, action: 'EMPLOYEE_BANK_ACCOUNT_CREATED', resource: 'employee_bank_account', resourceId: account.id, details: { employeeId: body.employeeId, bankName: body.bankName } });
  return c.json(account, 201);
});

router.put('/:id', requirePermission('manage_employees'), validateBody(updateBankAccountSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.employeeBankAccount.findUnique({
    where: { id },
    include: { employee: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Bank account not found' }, 404);
  if (companyId && existing.employee.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const body = c.req.valid('json');
  const data: Record<string, unknown> = {};
  if (body.accountName !== undefined) data.accountName = body.accountName;
  if (body.accountNumber !== undefined) data.accountNumber = body.accountNumber;
  if (body.bankName !== undefined) data.bankName = body.bankName;
  if (body.bankBranch !== undefined) data.bankBranch = body.bankBranch;
  if (body.branchCode !== undefined) data.branchCode = body.branchCode;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.splitType !== undefined) data.splitType = body.splitType;
  if (body.splitValue !== undefined) data.splitValue = body.splitValue;
  if (body.priority !== undefined) data.priority = body.priority;

  const updated = await prisma.employeeBankAccount.update({ where: { id }, data });
  await audit({ c, action: 'EMPLOYEE_BANK_ACCOUNT_UPDATED', resource: 'employee_bank_account', resourceId: id });
  return c.json(updated);
});

router.delete('/:id', requirePermission('manage_employees'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.employeeBankAccount.findUnique({
    where: { id },
    include: { employee: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Bank account not found' }, 404);
  if (companyId && existing.employee.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.employeeBankAccount.delete({ where: { id } });
  await audit({ c, action: 'EMPLOYEE_BANK_ACCOUNT_DELETED', resource: 'employee_bank_account', resourceId: id });
  return c.body(null, 204);
});

export default router;