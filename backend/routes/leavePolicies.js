const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/leave-policies
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const policies = await prisma.leavePolicy.findMany({
      where: { companyId: req.companyId },
      orderBy: { leaveType: 'asc' },
    });
    res.json(policies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/leave-policies
router.post('/', requirePermission('manage_leave'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  const { leaveType, accrualRate, maxAccumulation, carryOverLimit, encashable, encashCap } = req.body;

  if (!leaveType) return res.status(400).json({ message: 'leaveType is required' });

  try {
    const policy = await prisma.leavePolicy.upsert({
      where: { companyId_leaveType: { companyId: req.companyId, leaveType } },
      create: {
        companyId: req.companyId,
        leaveType,
        accrualRate: parseFloat(accrualRate ?? 2.5),
        maxAccumulation: parseFloat(maxAccumulation ?? 90),
        carryOverLimit: parseFloat(carryOverLimit ?? 30),
        encashable: encashable !== false,
        encashCap: parseFloat(encashCap ?? 0),
      },
      update: {
        accrualRate: parseFloat(accrualRate ?? 2.5),
        maxAccumulation: parseFloat(maxAccumulation ?? 90),
        carryOverLimit: parseFloat(carryOverLimit ?? 30),
        encashable: encashable !== false,
        encashCap: parseFloat(encashCap ?? 0),
      },
    });
    res.status(201).json(policy);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/leave-policies/:id
router.put('/:id', requirePermission('manage_leave'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  const { accrualRate, maxAccumulation, carryOverLimit, encashable, encashCap, isActive } = req.body;

  try {
    const existing = await prisma.leavePolicy.findUnique({ where: { id: req.params.id }, select: { companyId: true } });
    if (!existing) return res.status(404).json({ message: 'Leave policy not found' });
    if (existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const policy = await prisma.leavePolicy.update({
      where: { id: req.params.id },
      data: {
        ...(accrualRate !== undefined && { accrualRate: parseFloat(accrualRate) }),
        ...(maxAccumulation !== undefined && { maxAccumulation: parseFloat(maxAccumulation) }),
        ...(carryOverLimit !== undefined && { carryOverLimit: parseFloat(carryOverLimit) }),
        ...(encashable !== undefined && { encashable }),
        ...(encashCap !== undefined && { encashCap: parseFloat(encashCap) }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json(policy);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Leave policy not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/leave-policies/:id
router.delete('/:id', requirePermission('manage_leave'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const existing = await prisma.leavePolicy.findUnique({ where: { id: req.params.id }, select: { companyId: true } });
    if (!existing) return res.status(404).json({ message: 'Leave policy not found' });
    if (existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.leavePolicy.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Leave policy not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
