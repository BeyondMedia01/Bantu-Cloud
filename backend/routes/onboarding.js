const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();


// ─── Templates ────────────────────────────────────────────────────────────────

router.get('/templates', async (req, res) => {
  try {
    const templates = await prisma.onboardingTemplate.findMany({
      where: req.companyId ? { companyId: req.companyId } : {},
      include: { tasks: { orderBy: { order: 'asc' } }, _count: { select: { onboardings: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: templates });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/templates', requirePermission('manage_employees'), async (req, res) => {
  const { name, description, tasks } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });

  try {
    const template = await prisma.onboardingTemplate.create({
      data: {
        companyId: req.companyId,
        name, description,
        tasks: tasks ? { create: tasks.map((t, i) => ({ ...t, order: t.order ?? i })) } : undefined,
      },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });
    await audit({ req, action: 'ONBOARDING_TEMPLATE_CREATED', resource: 'onboardingTemplate', resourceId: template.id, details: { name } });
    res.status(201).json({ data: template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/templates/:id', requirePermission('manage_employees'), async (req, res) => {
  const { name, description, tasks } = req.body;
  try {
    const existing = await prisma.onboardingTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    if (tasks) {
      await prisma.onboardingTemplateTask.deleteMany({ where: { templateId: req.params.id } });
      await prisma.onboardingTemplateTask.createMany({
        data: tasks.map((t, i) => ({ templateId: req.params.id, ...t, order: t.order ?? i })),
      });
    }

    const template = await prisma.onboardingTemplate.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }) },
      include: { tasks: { orderBy: { order: 'asc' } } },
    });
    res.json({ data: template });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/templates/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.onboardingTemplate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.onboardingTemplate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Onboarding Records ───────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { status } = req.query;
  try {
    const where = {
      ...(req.companyId && { companyId: req.companyId }),
      ...(status && { status }),
    };
    const records = await prisma.onboarding.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        template: { select: { name: true } },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const recordsWithCounts = await Promise.all(records.map(async r => {
      const completedTasks = await prisma.onboardingTask.count({ where: { onboardingId: r.id, completed: true } });
      return { ...r, completedTasks };
    }));

    res.json({ data: recordsWithCounts });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', requirePermission('manage_employees'), async (req, res) => {
  const { employeeId, templateId, startDate, buddyId, notes } = req.body;
  if (!employeeId || !startDate) return res.status(400).json({ message: 'employeeId and startDate are required' });

  try {
    const template = templateId ? await prisma.onboardingTemplate.findUnique({
      where: { id: templateId },
      include: { tasks: { orderBy: { order: 'asc' } } },
    }) : null;

    const record = await prisma.onboarding.create({
      data: {
        companyId: req.companyId,
        employeeId, templateId: templateId || null,
        startDate: new Date(startDate),
        buddyId: buddyId || null, notes,
        status: 'IN_PROGRESS',
        tasks: template ? {
          create: template.tasks.map(t => ({
            title: t.title, description: t.description,
            assigneeId: null, order: t.order,
            dueDate: t.dueDaysFromStart ? new Date(Date.now() + t.dueDaysFromStart * 86400000) : null,
          })),
        } : undefined,
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        template: { select: { name: true } },
        tasks: { orderBy: { order: 'asc' } },
      },
    });
    await audit({ req, action: 'ONBOARDING_CREATED', resource: 'onboarding', resourceId: record.id, details: { employeeId, templateId } });
    res.status(201).json({ data: record });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await prisma.onboarding.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true, email: true } },
        template: { select: { name: true } },
        tasks: { orderBy: { order: 'asc' } },
      },
    });
    if (!record) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && record.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    res.json({ data: record });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  const { buddyId, notes, status } = req.body;
  try {
    const existing = await prisma.onboarding.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const data = {};
    if (buddyId !== undefined) data.buddyId = buddyId;
    if (notes !== undefined) data.notes = notes;
    if (status) {
      data.status = status;
      if (status === 'COMPLETED') data.completedAt = new Date();
    }

    const record = await prisma.onboarding.update({
      where: { id: req.params.id },
      data,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        template: { select: { name: true } },
        tasks: { orderBy: { order: 'asc' } },
      },
    });
    res.json({ data: record });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Tasks ────────────────────────────────────────────────────────────────────

router.put('/:id/tasks/:taskId', requirePermission('manage_employees'), async (req, res) => {
  const { title, completed, assigneeId, dueDate, notes, description } = req.body;
  try {
    const existing = await prisma.onboardingTask.findUnique({
      where: { id: req.params.taskId },
      include: { onboarding: { select: { companyId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Task not found' });
    if (req.companyId && existing.onboarding.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const data = {};
    if (title !== undefined) data.title = title;
    if (completed !== undefined) {
      data.completed = completed;
      data.completedAt = completed ? new Date() : null;
    }
    if (assigneeId !== undefined) data.assigneeId = assigneeId;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (notes !== undefined) data.notes = notes;
    if (description !== undefined) data.description = description;

    const task = await prisma.onboardingTask.update({
      where: { id: req.params.taskId },
      data,
    });
    await audit({ req, action: 'ONBOARDING_TASK_UPDATED', resource: 'onboardingTask', resourceId: task.id, details: { completed } });
    res.json({ data: task });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET employees for selection
router.get('/employees/list', async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: req.companyId ? { companyId: req.companyId } : {},
      select: { id: true, firstName: true, lastName: true, employeeCode: true },
      orderBy: { firstName: 'asc' },
    });
    res.json({ data: employees });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
