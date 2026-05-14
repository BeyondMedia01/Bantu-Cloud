import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const createPayrollCoreSchema = z.object({
  employeeId: z.string().min(1),
  fullName: z.string().min(1),
  employeeCode: z.string().min(1),
  jobTitle: z.string().optional(),
  basicSalaryZiG: z.number().optional(),
  basicSalaryUSD: z.number().optional(),
  preferredCurrencySplit: z.any().optional(),
  paymentFrequency: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  accountNumber: z.string().optional(),
  startDate: z.string().min(1),
});

const updatePayrollCoreSchema = z.object({
  fullName: z.string().min(1).optional(),
  jobTitle: z.string().optional(),
  basicSalaryZiG: z.number().optional(),
  basicSalaryUSD: z.number().optional(),
  preferredCurrencySplit: z.any().optional(),
  paymentFrequency: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  accountNumber: z.string().optional(),
  startDate: z.string().optional(),
});

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const cores = await prisma.payrollCore.findMany({
    where: { companyId },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { startDate: 'desc' },
  });
  return c.json(cores);
});

router.post('/', requirePermission('manage_payroll'), validateBody(createPayrollCoreSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const body = c.req.valid('json');

  const employee = await prisma.employee.findUnique({
    where: { id: body.employeeId },
    select: { companyId: true },
  });
  if (!employee) return c.json({ message: 'Employee not found' }, 404);
  if (employee.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const core = await prisma.payrollCore.create({
    data: {
      companyId,
      employeeId: body.employeeId,
      fullName: body.fullName,
      employeeCode: body.employeeCode,
      jobTitle: body.jobTitle || null,
      basicSalaryZiG: body.basicSalaryZiG ?? 0,
      basicSalaryUSD: body.basicSalaryUSD ?? 0,
      preferredCurrencySplit: body.preferredCurrencySplit ?? null,
      paymentFrequency: body.paymentFrequency || 'MONTHLY',
      bankName: body.bankName || null,
      bankBranch: body.bankBranch || null,
      accountNumber: body.accountNumber || null,
      startDate: new Date(body.startDate),
    },
  });
  return c.json(core, 201);
});

router.put('/:id', requirePermission('manage_payroll'), validateBody(updatePayrollCoreSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.payrollCore.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!existing) return c.json({ message: 'PayrollCore entry not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const body = c.req.valid('json');
  const data: Record<string, unknown> = {};
  if (body.fullName !== undefined) data.fullName = body.fullName;
  if (body.jobTitle !== undefined) data.jobTitle = body.jobTitle;
  if (body.basicSalaryZiG !== undefined) data.basicSalaryZiG = body.basicSalaryZiG;
  if (body.basicSalaryUSD !== undefined) data.basicSalaryUSD = body.basicSalaryUSD;
  if (body.preferredCurrencySplit !== undefined) data.preferredCurrencySplit = body.preferredCurrencySplit;
  if (body.paymentFrequency !== undefined) data.paymentFrequency = body.paymentFrequency;
  if (body.bankName !== undefined) data.bankName = body.bankName;
  if (body.bankBranch !== undefined) data.bankBranch = body.bankBranch;
  if (body.accountNumber !== undefined) data.accountNumber = body.accountNumber;
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);

  const core = await prisma.payrollCore.update({ where: { id }, data });
  return c.json(core);
});

router.delete('/:id', requirePermission('manage_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.payrollCore.findUnique({
    where: { id },
    select: { companyId: true },
  });
  if (!existing) return c.json({ message: 'PayrollCore entry not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.payrollCore.delete({ where: { id } });
  return c.body(null, 204);
});

export default router;
