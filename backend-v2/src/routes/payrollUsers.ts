import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { denyUnlessCompany } from '../lib/ownership';
import { validateBody } from '../lib/validate';

const router = new Hono();

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ data: [] });
  const users = await prisma.payrollUser.findMany({
    where: { companyId },
    orderBy: { fullName: 'asc' },
  });
  return c.json({ data: users });
});

const createSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(['ADMIN', 'PAYROLL_OFFICER', 'AUDITOR', 'VIEWER']).default('VIEWER'),
  canProcessPayroll: z.boolean().default(false),
  canEditEmployees: z.boolean().default(false),
  canViewReports: z.boolean().default(false),
  canExportData: z.boolean().default(false),
});

const updateSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(['ADMIN', 'PAYROLL_OFFICER', 'AUDITOR', 'VIEWER']).optional(),
  canProcessPayroll: z.boolean().optional(),
  canEditEmployees: z.boolean().optional(),
  canViewReports: z.boolean().optional(),
  canExportData: z.boolean().optional(),
});

router.post('/', requirePermission('manage_employees'), validateBody(createSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const parsed = c.req.valid('json' as any);
  const existing = await prisma.payrollUser.findFirst({
    where: { companyId, email: parsed.email },
  });
  if (existing) return c.json({ message: 'A user with this email already exists' }, 409);
  const isAdmin = parsed.role === 'ADMIN';
  const user = await prisma.payrollUser.create({
    data: {
      companyId,
      fullName: parsed.fullName,
      email: parsed.email,
      role: parsed.role,
      canProcessPayroll: isAdmin || parsed.canProcessPayroll,
      canEditEmployees: isAdmin || parsed.canEditEmployees,
      canViewReports: isAdmin || parsed.canViewReports,
      canExportData: isAdmin || parsed.canExportData,
    },
  });
  return c.json(user, 201);
});

router.patch('/:id', requirePermission('manage_employees'), validateBody(updateSchema), async (c) => {
  const existing = await prisma.payrollUser.findUnique({ where: { id: c.req.param('id') } });
  if (!existing) return c.json({ message: 'User not found' }, 404);
  if (!denyUnlessCompany(c, existing)) return c.json({ message: 'Access denied' }, 403);

  const parsed = c.req.valid('json' as any);
  const isAdmin = parsed.role === 'ADMIN';
  const data = {
    ...parsed,
    ...(isAdmin && { canProcessPayroll: true, canEditEmployees: true, canViewReports: true, canExportData: true }),
  };
  const user = await prisma.payrollUser.update({ where: { id: c.req.param('id') }, data });
  return c.json(user);
});

router.delete('/:id', requirePermission('manage_employees'), async (c) => {
  const companyId = c.get('companyId');
  const existing = await prisma.payrollUser.findUnique({ where: { id: c.req.param('id') } });
  if (!existing) return c.json({ message: 'User not found' }, 404);
  if (!denyUnlessCompany(c, existing)) return c.json({ message: 'Access denied' }, 403);
  await prisma.payrollUser.delete({ where: { id: c.req.param('id') } });
  return c.body(null, 204);
});

export default router;
