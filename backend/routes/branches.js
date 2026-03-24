const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/branches?companyId=
router.get('/', async (req, res) => {
  const { companyId } = req.query;
  try {
    const where = {};
    if (companyId) where.companyId = companyId;
    else if (req.companyId) where.companyId = req.companyId;
    else if (req.clientId) where.company = { clientId: req.clientId };

    const branches = await prisma.branch.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      include: { departments: true, _count: { select: { employees: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ data: branches });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/branches
router.post('/', requirePermission('manage_companies'), async (req, res) => {
  const { subCompanyId, name } = req.body;
  const companyId = req.companyId;
  if (!companyId) return res.status(400).json({ message: 'Company context required' });
  if (!name) return res.status(400).json({ message: 'name is required' });
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
    res.json({ data: branch });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/branches/:id
router.put('/:id', requirePermission('manage_companies'), async (req, res) => {
  const { name, subCompanyId } = req.body;
  try {
    const existing = await prisma.branch.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Branch not found' });
    if (req.companyId && existing.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const branch = await prisma.branch.update({ where: { id: req.params.id }, data: { name, subCompanyId } });
    res.json({ data: branch });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Branch not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/branches/:id
router.delete('/:id', requirePermission('manage_companies'), async (req, res) => {
  try {
    const existing = await prisma.branch.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Branch not found' });
    if (req.companyId && existing.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await prisma.branch.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Branch not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
