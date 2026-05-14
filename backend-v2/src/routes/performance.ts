import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createGoalSchema = z.object({
  employeeId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  notes: z.string().optional(),
});

const updateGoalSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  startDate: z.string().nullable().optional(),
  targetDate: z.string().nullable().optional(),
  status: z.string().optional(),
  progress: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const createReviewSchema = z.object({
  employeeId: z.string().min(1),
  reviewerId: z.string().min(1),
  period: z.string().min(1),
});

const updateReviewSchema = z.object({
  rating: z.number().nullable().optional(),
  summary: z.string().nullable().optional(),
  achievements: z.string().nullable().optional(),
  areasForImprovement: z.string().nullable().optional(),
  employeeComments: z.string().nullable().optional(),
  status: z.string().optional(),
  skills: z.array(z.object({
    name: z.string(),
    rating: z.number().nullable().optional(),
    notes: z.string().nullable().optional(),
  })).optional(),
});

// ─── Goals ────────────────────────────────────────────────────────────────────

router.get('/goals', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { employeeId, status } = c.req.query();
  const where: any = { companyId };
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  const goals = await prisma.performanceGoal.findMany({
    where,
    include: { Employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(goals);
});

router.post('/goals', requirePermission('manage_employees'), validateBody(createGoalSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { startDate, targetDate, ...data } = c.req.valid('json');
  const goal = await prisma.performanceGoal.create({
    data: {
      id: uuid(),
      companyId,
      ...data,
      startDate: startDate ? new Date(startDate) : null,
      targetDate: targetDate ? new Date(targetDate) : null,
      updatedAt: new Date(),
    },
    include: { Employee: { select: { firstName: true, lastName: true } } },
  });
  await audit({ c, action: 'GOAL_CREATED', resource: 'performanceGoal', resourceId: goal.id, details: { employeeId: data.employeeId, title: data.title } });
  return c.json(goal, 201);
});

router.put('/goals/:id', requirePermission('manage_employees'), validateBody(updateGoalSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.performanceGoal.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const { startDate, targetDate, ...data } = c.req.valid('json');
  const goal = await prisma.performanceGoal.update({
    where: { id },
    data: {
      ...data,
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(targetDate !== undefined && { targetDate: targetDate ? new Date(targetDate) : null }),
      updatedAt: new Date(),
    },
    include: { Employee: { select: { firstName: true, lastName: true } } },
  });
  return c.json(goal);
});

router.delete('/goals/:id', requirePermission('manage_employees'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.performanceGoal.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.performanceGoal.delete({ where: { id } });
  return c.json({ message: 'Goal deleted' });
});

// ─── Reviews ──────────────────────────────────────────────────────────────────

router.get('/reviews', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { employeeId, status } = c.req.query();
  const where: any = { companyId };
  if (employeeId) where.employeeId = employeeId;
  if (status) where.status = status;

  const reviews = await prisma.performanceReview.findMany({
    where,
    include: {
      Employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      User: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(reviews);
});

router.post('/reviews', requirePermission('manage_employees'), validateBody(createReviewSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const data = c.req.valid('json');
  const review = await prisma.performanceReview.create({
    data: {
      id: uuid(),
      companyId,
      ...data,
      updatedAt: new Date(),
    },
    include: {
      Employee: { select: { firstName: true, lastName: true } },
      User: { select: { name: true } },
    },
  });
  await audit({ c, action: 'REVIEW_CREATED', resource: 'performanceReview', resourceId: review.id, details: { employeeId: data.employeeId, period: data.period } });
  return c.json(review, 201);
});

router.get('/reviews/:id', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const review = await prisma.performanceReview.findUnique({
    where: { id },
    include: {
      Employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      User: { select: { name: true, email: true } },
      ReviewSkill: { orderBy: { name: 'asc' } },
    },
  });
  if (!review) return c.json({ message: 'Not found' }, 404);
  if (review.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json(review);
});

router.put('/reviews/:id', requirePermission('manage_employees'), validateBody(updateReviewSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.performanceReview.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const { skills, status, ...body } = c.req.valid('json');
  const data: any = { ...body, updatedAt: new Date() };
  if (status) {
    data.status = status;
    if (status === 'SUBMITTED') data.submittedAt = new Date();
    if (status === 'COMPLETED') data.completedAt = new Date();
  }

  if (skills !== undefined) {
    await prisma.reviewSkill.deleteMany({ where: { reviewId: id } });
    if (skills.length > 0) {
      for (const s of skills as any[]) {
        await prisma.reviewSkill.create({ data: { id: uuid(), reviewId: id, name: s.name, rating: s.rating ?? null, notes: s.notes ?? null } });
      }
    }
  }

  const review = await prisma.performanceReview.update({
    where: { id },
    data,
    include: {
      Employee: { select: { firstName: true, lastName: true } },
      User: { select: { name: true } },
      ReviewSkill: { orderBy: { name: 'asc' } },
    },
  });
  await audit({ c, action: 'REVIEW_UPDATED', resource: 'performanceReview', resourceId: review.id, details: { status } });
  return c.json(review);
});

router.delete('/reviews/:id', requirePermission('manage_employees'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.performanceReview.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.performanceReview.delete({ where: { id } });
  return c.json({ message: 'Review deleted' });
});

// ─── Employees + Reviewers ────────────────────────────────────────────────────

router.get('/employees/list', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
    orderBy: { firstName: 'asc' },
  });
  return c.json(employees);
});

router.get('/reviewers/list', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const reviewers = await prisma.user.findMany({
    where: { UserCompanyRole: { some: { companyId } } },
    select: { id: true, name: true, email: true },
    orderBy: { name: 'asc' },
  });
  return c.json(reviewers);
});

router.get('/', async (c) => {
  return c.json({ message: 'Performance API. Use /goals, /reviews, /employees/list sub-routes.' });
});

export default router;
