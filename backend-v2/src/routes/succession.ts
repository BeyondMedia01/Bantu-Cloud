import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createPlanSchema = z.object({
  positionTitle: z.string().min(1),
  department: z.string().optional(),
  description: z.string().optional(),
  riskLevel: z.string().optional(),
});

const updatePlanSchema = z.object({
  positionTitle: z.string().optional(),
  department: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  riskLevel: z.string().optional(),
});

const createCandidateSchema = z.object({
  employeeId: z.string().min(1),
  readiness: z.string().optional(),
  rating: z.number().optional(),
  notes: z.string().optional(),
  strengths: z.string().optional(),
  areasForGrowth: z.string().optional(),
});

const updateCandidateSchema = z.object({
  readiness: z.string().optional(),
  rating: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  strengths: z.string().nullable().optional(),
  areasForGrowth: z.string().nullable().optional(),
  order: z.number().optional(),
});

// ─── Plans ────────────────────────────────────────────────────────────────────

router.get('/plans', requirePermission('view_succession'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { status } = c.req.query();
  const where: any = { companyId };
  if (status) where.status = status;

  const plans = await prisma.successionPlan.findMany({
    where,
    include: {
      _count: { select: { candidates: true } },
      candidates: {
        select: {
          id: true,
          readiness: true,
          rating: true,
          order: true,
          Employee: { select: { firstName: true, lastName: true } },
        },
        orderBy: { order: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(plans);
});

router.post('/plans', requirePermission('manage_succession'), validateBody(createPlanSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const data = c.req.valid('json');
  const plan = await prisma.successionPlan.create({
    data: { id: uuid(), companyId, ...data },
    include: { candidates: { include: { Employee: { select: { firstName: true, lastName: true } } } } },
  });
  await audit({ c, action: 'SUCCESSION_PLAN_CREATED', resource: 'successionPlan', resourceId: plan.id, details: { positionTitle: data.positionTitle } });
  return c.json(plan, 201);
});

router.put('/plans/:id', requirePermission('manage_succession'), validateBody(updatePlanSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.successionPlan.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const data = c.req.valid('json');
  const plan = await prisma.successionPlan.update({
    where: { id },
    data,
    include: { candidates: { include: { Employee: { select: { firstName: true, lastName: true } } } } },
  });
  return c.json(plan);
});

router.delete('/plans/:id', requirePermission('manage_succession'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.successionPlan.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.successionPlan.delete({ where: { id } });
  return c.json({ message: 'Plan deleted' });
});

// ─── Candidates ───────────────────────────────────────────────────────────────

router.post('/plans/:id/candidates', requirePermission('manage_succession'), validateBody(createCandidateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const plan = await prisma.successionPlan.findUnique({ where: { id } });
  if (!plan) return c.json({ message: 'Plan not found' }, 404);
  if (plan.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const { employeeId, ...rest } = c.req.valid('json');
  const maxOrder = await prisma.successionCandidate.findFirst({
    where: { planId: id },
    orderBy: { order: 'desc' },
    select: { order: true },
  });
  const candidate = await prisma.successionCandidate.create({
    data: {
      id: uuid(),
      planId: id,
      employeeId,
      ...rest,
      order: (maxOrder?.order ?? 0) + 1,
    },
    include: { Employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
  });
  await audit({ c, action: 'SUCCESSION_CANDIDATE_ADDED', resource: 'successionPlan', resourceId: id, details: { employeeId } });
  return c.json(candidate, 201);
});

router.put('/candidates/:id', requirePermission('manage_succession'), validateBody(updateCandidateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.successionCandidate.findUnique({
    where: { id },
    include: { SuccessionPlan: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.SuccessionPlan.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const data = c.req.valid('json');
  const candidate = await prisma.successionCandidate.update({
    where: { id },
    data,
    include: { Employee: { select: { firstName: true, lastName: true } } },
  });
  return c.json(candidate);
});

router.delete('/candidates/:id', requirePermission('manage_succession'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.successionCandidate.findUnique({
    where: { id },
    include: { SuccessionPlan: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.SuccessionPlan.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.successionCandidate.delete({ where: { id } });
  return c.json({ message: 'Candidate deleted' });
});

// ─── Employees ────────────────────────────────────────────────────────────────

router.get('/employees/list', requirePermission('view_succession'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
    orderBy: { firstName: 'asc' },
  });
  return c.json(employees);
});

router.get('/', async (c) => {
  return c.json({ message: 'Succession API. Use /plans, /candidates, /employees/list sub-routes.' });
});

export default router;
