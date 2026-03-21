const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/branches?companyId=
router.get('/', async (req, res) => {
  const { companyId } = req.query;
  try {
    const branches = await prisma.branch.findMany({
      where: companyId ? { companyId } : undefined,
      include: { departments: true, _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(branches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/branches
router.post('/', requirePermission('manage_companies'), async (req, res) => {
  const { companyId, subCompanyId, name } = req.body;
  if (!companyId || !name) return res.status(400).json({ message: 'companyId and name are required' });
  try {
    const branch = await prisma.branch.create({ data: { companyId, subCompanyId, name } });
    res.status(201).json(branch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/branches/:id
router.get('/:id', async (req, res) => {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: { departments: true, employees: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!branch) return res.status(404).json({ message: 'Branch not found' });
    if (req.companyId && branch.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(branch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/branches/:id
router.put('/:id', requirePermission('manage_companies'), async (req, res) => {
  const { name, subCompanyId } = req.body;
  try {
    const branch = await prisma.branch.update({ where: { id: req.params.id }, data: { name, subCompanyId } });
    res.json(branch);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Branch not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/branches/:id
router.delete('/:id', requirePermission('manage_companies'), async (req, res) => {
  try {
    await prisma.branch.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Branch not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
