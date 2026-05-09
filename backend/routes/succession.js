const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission, requireModule } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requireModule('SUCCESSION'));

// ─── Plans ────────────────────────────────────────────────────────────────────

router.get('/plans', async (req, res) => {
  const { status } = req.query;
  try {
    const plans = await prisma.successionPlan.findMany({
      where: { ...(req.companyId && { companyId: req.companyId }), ...(status && { status }) },
      include: {
        _count: { select: { candidates: true } },
        candidates: {
          select: { id: true, readiness: true, rating: true, order: true, employee: { select: { firstName: true, lastName: true } } },
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: plans });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/plans', requirePermission('manage_employees'), async (req, res) => {
  const { positionTitle, department, description, riskLevel } = req.body;
  if (!positionTitle) return res.status(400).json({ message: 'positionTitle is required' });

  try {
    const plan = await prisma.successionPlan.create({
      data: { companyId: req.companyId, positionTitle, department, description, riskLevel },
      include: { candidates: { include: { employee: { select: { firstName: true, lastName: true } } } } },
    });
    await audit({ req, action: 'SUCCESSION_PLAN_CREATED', resource: 'successionPlan', resourceId: plan.id, details: { positionTitle } });
    res.status(201).json({ data: plan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/plans/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.successionPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const allowed = ['positionTitle', 'department', 'description', 'status', 'riskLevel'];
    const data = {};
    for (const key of allowed) if (req.body[key] !== undefined) data[key] = req.body[key];

    const plan = await prisma.successionPlan.update({
      where: { id: req.params.id },
      data,
      include: { candidates: { include: { employee: { select: { firstName: true, lastName: true } } } } },
    });
    res.json({ data: plan });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/plans/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.successionPlan.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    await prisma.successionPlan.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Candidates ───────────────────────────────────────────────────────────────

router.post('/plans/:id/candidates', requirePermission('manage_employees'), async (req, res) => {
  const { employeeId, readiness, rating, notes, strengths, areasForGrowth } = req.body;
  if (!employeeId) return res.status(400).json({ message: 'employeeId is required' });

  try {
    const plan = await prisma.successionPlan.findUnique({ where: { id: req.params.id } });
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    if (req.companyId && plan.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const maxOrder = await prisma.successionCandidate.findFirst({ where: { planId: req.params.id }, orderBy: { order: 'desc' }, select: { order: true } });
    const candidate = await prisma.successionCandidate.create({
      data: {
        planId: req.params.id, employeeId, readiness, rating, notes, strengths, areasForGrowth,
        order: (maxOrder?.order ?? 0) + 1,
      },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    });
    await audit({ req, action: 'SUCCESSION_CANDIDATE_ADDED', resource: 'successionPlan', resourceId: req.params.id, details: { employeeId } });
    res.status(201).json({ data: candidate });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/candidates/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.successionCandidate.findUnique({ where: { id: req.params.id }, include: { plan: { select: { companyId: true } } } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.plan.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const allowed = ['readiness', 'rating', 'notes', 'strengths', 'areasForGrowth', 'order'];
    const data = {};
    for (const key of allowed) if (req.body[key] !== undefined) data[key] = req.body[key];

    const candidate = await prisma.successionCandidate.update({
      where: { id: req.params.id },
      data,
      include: { employee: { select: { firstName: true, lastName: true } } },
    });
    res.json({ data: candidate });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/candidates/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.successionCandidate.findUnique({ where: { id: req.params.id }, include: { plan: { select: { companyId: true } } } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.plan.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    await prisma.successionCandidate.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Employees ────────────────────────────────────────────────────────────────

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
