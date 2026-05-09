const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission, requireModule } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requireModule('PERFORMANCE'));

// ─── Goals ────────────────────────────────────────────────────────────────────

router.get('/goals', async (req, res) => {
  const { employeeId, status } = req.query;
  try {
    const where = {
      ...(req.companyId && { companyId: req.companyId }),
      ...(employeeId && { employeeId }),
      ...(status && { status }),
    };
    const goals = await prisma.performanceGoal.findMany({
      where,
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: goals });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/goals', requirePermission('manage_employees'), async (req, res) => {
  const { employeeId, title, description, category, startDate, targetDate, notes } = req.body;
  if (!employeeId || !title) return res.status(400).json({ message: 'employeeId and title are required' });

  try {
    const goal = await prisma.performanceGoal.create({
      data: {
        companyId: req.companyId, employeeId, title, description, category,
        startDate: startDate ? new Date(startDate) : null,
        targetDate: targetDate ? new Date(targetDate) : null, notes,
      },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    await audit({ req, action: 'GOAL_CREATED', resource: 'performanceGoal', resourceId: goal.id, details: { employeeId, title } });
    res.status(201).json({ data: goal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/goals/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.performanceGoal.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const allowed = ['title', 'description', 'category', 'startDate', 'targetDate', 'status', 'progress', 'notes'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        if (key === 'startDate' || key === 'targetDate') data[key] = req.body[key] ? new Date(req.body[key]) : null;
        else data[key] = req.body[key];
      }
    }

    const goal = await prisma.performanceGoal.update({
      where: { id: req.params.id },
      data,
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    res.json({ data: goal });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/goals/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.performanceGoal.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.performanceGoal.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Reviews ──────────────────────────────────────────────────────────────────

router.get('/reviews', async (req, res) => {
  const { employeeId, status } = req.query;
  try {
    const where = {
      ...(req.companyId && { companyId: req.companyId }),
      ...(employeeId && { employeeId }),
      ...(status && { status }),
    };
    const reviews = await prisma.performanceReview.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        reviewer: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: reviews });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/reviews', requirePermission('manage_employees'), async (req, res) => {
  const { employeeId, reviewerId, period } = req.body;
  if (!employeeId || !reviewerId || !period) {
    return res.status(400).json({ message: 'employeeId, reviewerId, and period are required' });
  }

  try {
    const review = await prisma.performanceReview.create({
      data: { companyId: req.companyId, employeeId, reviewerId, period },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        reviewer: { select: { name: true } },
      },
    });
    await audit({ req, action: 'REVIEW_CREATED', resource: 'performanceReview', resourceId: review.id, details: { employeeId, period } });
    res.status(201).json({ data: review });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/reviews/:id', async (req, res) => {
  try {
    const review = await prisma.performanceReview.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        reviewer: { select: { name: true, email: true } },
        skills: { orderBy: { name: 'asc' } },
      },
    });
    if (!review) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && review.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    res.json({ data: review });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/reviews/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.performanceReview.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const allowed = ['rating', 'summary', 'achievements', 'areasForImprovement', 'employeeComments', 'status'];
    const data = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        data[key] = req.body[key];
        if (key === 'status') {
          if (req.body[key] === 'SUBMITTED') data.submittedAt = new Date();
          if (req.body[key] === 'COMPLETED') data.completedAt = new Date();
        }
      }
    }

    // Upsert skills
    if (req.body.skills) {
      await prisma.reviewSkill.deleteMany({ where: { reviewId: req.params.id } });
      if (req.body.skills.length > 0) {
        await prisma.reviewSkill.createMany({
          data: req.body.skills.map(s => ({ reviewId: req.params.id, name: s.name, rating: s.rating, notes: s.notes })),
        });
      }
    }

    const review = await prisma.performanceReview.update({
      where: { id: req.params.id },
      data,
      include: {
        employee: { select: { firstName: true, lastName: true } },
        reviewer: { select: { name: true } },
        skills: { orderBy: { name: 'asc' } },
      },
    });
    await audit({ req, action: 'REVIEW_UPDATED', resource: 'performanceReview', resourceId: review.id, details: { status } });
    res.json({ data: review });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/reviews/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.performanceReview.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.performanceReview.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Employees + Reviewers ────────────────────────────────────────────────────

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

router.get('/reviewers/list', async (req, res) => {
  try {
    const reviewers = await prisma.user.findMany({
      where: req.companyId ? { companyUsers: { some: { companyId: req.companyId } } } : {},
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    });
    res.json({ data: reviewers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
