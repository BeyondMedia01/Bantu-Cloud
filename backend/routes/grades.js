const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/grades
router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.clientId) where.clientId = req.clientId;

    const grades = await prisma.grade.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    res.json(grades);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/grades
router.post('/', requirePermission('update_settings'), async (req, res) => {
  const { name, description, minSalary, maxSalary } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!name) return res.status(400).json({ message: 'name is required' });

  try {
    const grade = await prisma.grade.create({
      data: {
        clientId: req.clientId,
        name,
        description: description || null,
        minSalary: minSalary !== undefined ? parseFloat(minSalary) : null,
        maxSalary: maxSalary !== undefined ? parseFloat(maxSalary) : null,
      },
    });
    res.status(201).json(grade);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/grades/:id
router.get('/:id', async (req, res) => {
  try {
    const grade = await prisma.grade.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { employees: true } } },
    });
    if (!grade) return res.status(404).json({ message: 'Grade not found' });
    if (req.clientId && grade.clientId !== req.clientId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(grade);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/grades/:id
router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  const { name, description, minSalary, maxSalary } = req.body;
  try {
    const grade = await prisma.grade.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(minSalary !== undefined && { minSalary: minSalary ? parseFloat(minSalary) : null }),
        ...(maxSalary !== undefined && { maxSalary: maxSalary ? parseFloat(maxSalary) : null }),
      },
    });
    res.json(grade);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Grade not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/grades/:id
router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.grade.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Grade not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
