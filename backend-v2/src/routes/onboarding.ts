import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createTemplateSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  tasks: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    assigneeRole: z.string().optional(),
    dueDaysFromStart: z.number().int().optional(),
    order: z.number().int().optional(),
  })).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  tasks: z.array(z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    assigneeRole: z.string().optional(),
    dueDaysFromStart: z.number().int().optional(),
    order: z.number().int().optional(),
  })).optional(),
});

const createOnboardingSchema = z.object({
  employeeId: z.string().min(1),
  templateId: z.string().optional(),
  startDate: z.string().min(1),
  buddyId: z.string().optional(),
  notes: z.string().optional(),
});

const updateOnboardingSchema = z.object({
  buddyId: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
});

const updateTaskSchema = z.object({
  title: z.string().optional(),
  completed: z.boolean().optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  description: z.string().optional(),
});

const templates = new Hono();

templates.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ data: [] });
  const where: Record<string, unknown> = { companyId };

  const data = await prisma.onboardingTemplate.findMany({
    where,
    include: {
      OnboardingTemplateTask: { orderBy: { order: 'asc' } },
      _count: { select: { Onboarding: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json({ data });
});

templates.post('/', requirePermission('manage_employees'), validateBody(createTemplateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const body = c.req.valid('json');

  const template = await prisma.onboardingTemplate.create({
    data: {
      id: uuid(),
      companyId,
      updatedAt: new Date(),
      name: body.name,
      description: body.description || null,
      OnboardingTemplateTask: body.tasks?.length
        ? { create: body.tasks.map((t: any, i: number) => ({
            id: uuid(),
            title: t.title,
            description: t.description || null,
            assigneeRole: t.assigneeRole || null,
            dueDaysFromStart: t.dueDaysFromStart ?? null,
            order: t.order ?? i,
          })) }
        : undefined,
    },
    include: { OnboardingTemplateTask: { orderBy: { order: 'asc' } } },
  });

  await audit({ c, action: 'ONBOARDING_TEMPLATE_CREATED', resource: 'onboardingTemplate', resourceId: template.id, details: { name: body.name } });
  return c.json({ data: template }, 201);
});

templates.put('/:id', requirePermission('manage_employees'), validateBody(updateTemplateSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const body = c.req.valid('json');

  const existing = await prisma.onboardingTemplate.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  if (body.tasks) {
    await prisma.onboardingTemplateTask.deleteMany({ where: { templateId: id } });
    for (const [i, t] of (body.tasks as any[]).entries()) {
      await prisma.onboardingTemplateTask.create({ data: { id: uuid(), templateId: id, title: t.title, description: t.description || null, assigneeRole: t.assigneeRole || null, dueDaysFromStart: t.dueDaysFromStart ?? null, order: t.order ?? i } });
    }
  }

  const template = await prisma.onboardingTemplate.update({
    where: { id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.description !== undefined && { description: body.description || null }),
    },
    include: { OnboardingTemplateTask: { orderBy: { order: 'asc' } } },
  });
  return c.json({ data: template });
});

templates.delete('/:id', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const existing = await prisma.onboardingTemplate.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.onboardingTemplate.delete({ where: { id } });
  return c.json({ message: 'Template deleted' });
});

router.get('/employees/list', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ data: [] });
  const where: Record<string, unknown> = { companyId };

  const employees = await prisma.employee.findMany({
    where,
    select: { id: true, firstName: true, lastName: true, employeeCode: true },
    orderBy: { firstName: 'asc' },
  });
  return c.json({ data: employees });
});

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ data: [] });
  const status = c.req.query('status');

  const where: Record<string, unknown> = { companyId };
  if (status) where.status = status;

  const records = await prisma.onboarding.findMany({
    where,
    include: {
      Employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      OnboardingTemplate: { select: { name: true } },
      _count: { select: { OnboardingTask: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const recordsWithCounts = await Promise.all(records.map(async (r) => {
    const completedTasks = await prisma.onboardingTask.count({
      where: { onboardingId: r.id, completed: true },
    });
    return { ...r, completedTasks };
  }));

  return c.json({ data: recordsWithCounts });
});

router.post('/', requirePermission('manage_employees'), validateBody(createOnboardingSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const body = c.req.valid('json');

  const template = body.templateId
    ? await prisma.onboardingTemplate.findUnique({
        where: { id: body.templateId },
        include: { OnboardingTemplateTask: { orderBy: { order: 'asc' } } },
      })
    : null;

  const record = await prisma.onboarding.create({
    data: {
      id: uuid(),
      companyId,
      updatedAt: new Date(),
      employeeId: body.employeeId,
      templateId: body.templateId || null,
      startDate: new Date(body.startDate),
      buddyId: body.buddyId || null,
      notes: body.notes || null,
      status: 'IN_PROGRESS',
      OnboardingTask: template?.OnboardingTemplateTask
        ? {
            create: template.OnboardingTemplateTask.map((t: any) => ({
              id: uuid(),
              updatedAt: new Date(),
              title: t.title,
              description: t.description || null,
              assigneeId: null,
              order: t.order,
              dueDate: t.dueDaysFromStart
                ? new Date(Date.now() + t.dueDaysFromStart * 86400000)
                : null,
            })),
          }
        : undefined,
    },
    include: {
      Employee: { select: { firstName: true, lastName: true } },
      OnboardingTemplate: { select: { name: true } },
      OnboardingTask: { orderBy: { order: 'asc' } },
    },
  });

  await audit({ c, action: 'ONBOARDING_CREATED', resource: 'onboarding', resourceId: record.id, details: { employeeId: body.employeeId, templateId: body.templateId } });
  return c.json({ data: record }, 201);
});

router.get('/:id', async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  const record = await prisma.onboarding.findUnique({
    where: { id },
    include: {
      Employee: { select: { firstName: true, lastName: true, employeeCode: true, email: true } },
      OnboardingTemplate: { select: { name: true } },
      OnboardingTask: { orderBy: { order: 'asc' } },
    },
  });
  if (!record) return c.json({ message: 'Not found' }, 404);
  if (!companyId || record.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json({ data: record });
});

router.put('/:id', requirePermission('manage_employees'), validateBody(updateOnboardingSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const body = c.req.valid('json');

  const existing = await prisma.onboarding.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const data: Record<string, unknown> = {};
  if (body.buddyId !== undefined) data.buddyId = body.buddyId;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.status) {
    data.status = body.status;
    if (body.status === 'COMPLETED') data.completedAt = new Date();
  }

  const record = await prisma.onboarding.update({
    where: { id },
    data,
    include: {
      Employee: { select: { firstName: true, lastName: true } },
      OnboardingTemplate: { select: { name: true } },
      OnboardingTask: { orderBy: { order: 'asc' } },
    },
  });
  return c.json({ data: record });
});

router.put('/:id/tasks/:taskId', requirePermission('manage_employees'), validateBody(updateTaskSchema), async (c) => {
  const { id, taskId } = c.req.param();
  const companyId = c.get('companyId');
  const body = c.req.valid('json');

  const existing = await prisma.onboardingTask.findUnique({
    where: { id: taskId },
    include: { Onboarding: { select: { companyId: true } } },
  });
  if (!existing) return c.json({ message: 'Task not found' }, 404);
  if (!companyId || existing.Onboarding.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) data.title = body.title;
  if (body.completed !== undefined) {
    data.completed = body.completed;
    data.completedAt = body.completed ? new Date() : null;
  }
  if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId;
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.description !== undefined) data.description = body.description;

  const task = await prisma.onboardingTask.update({
    where: { id: taskId },
    data,
  });

  await audit({ c, action: 'ONBOARDING_TASK_UPDATED', resource: 'onboardingTask', resourceId: task.id, details: { completed: body.completed } });
  return c.json({ data: task });
});

router.route('/templates', templates);

export default router;
