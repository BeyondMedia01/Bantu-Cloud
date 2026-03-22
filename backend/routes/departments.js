const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/departments?companyId=&branchId=
router.get('/', async (req, res) => {
  const { companyId, branchId } = req.query;
  try {
    const where = {};
    if (companyId) where.companyId = companyId;
    else if (req.companyId) where.companyId = req.companyId;
    else if (req.clientId) where.company = { clientId: req.clientId };
    if (branchId) where.branchId = branchId;

    const departments = await prisma.department.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: { _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(departments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/departments
router.post('/', requirePermission('manage_companies'), async (req, res) => {
  const { companyId, branchId, name } = req.body;
  if (!companyId || !name) return res.status(400).json({ message: 'companyId and name are required' });
  try {
    const dept = await prisma.department.create({ data: { companyId, branchId, name } });
    res.status(201).json(dept);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/departments/:id
router.get('/:id', async (req, res) => {
  try {
    const dept = await prisma.department.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { employees: true } } },
    });
    if (!dept) return res.status(404).json({ message: 'Department not found' });
    if (req.companyId && dept.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(dept);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/departments/:id
router.put('/:id', requirePermission('manage_companies'), async (req, res) => {
  const { name, branchId } = req.body;
  try {
    const dept = await prisma.department.update({ where: { id: req.params.id }, data: { name, branchId } });
    res.json(dept);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Department not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', requirePermission('manage_companies'), async (req, res) => {
  try {
    await prisma.department.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Department not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
