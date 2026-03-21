const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/sub-companies
router.get('/', async (req, res) => {
  try {
    const clientId = req.clientId || req.user.clientId;
    const subCompanies = await prisma.subCompany.findMany({
      where: clientId ? { clientId } : undefined,
      include: { branches: true },
      orderBy: { name: 'asc' },
    });
    res.json(subCompanies);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/sub-companies
router.post('/', requirePermission('manage_companies'), async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });
  try {
    const ca = await prisma.clientAdmin.findUnique({ where: { userId: req.user.userId } });
    const clientId = ca?.clientId ?? req.user.clientId;
    const sub = await prisma.subCompany.create({ data: { clientId, name } });
    res.status(201).json(sub);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/sub-companies/:id
router.put('/:id', requirePermission('manage_companies'), async (req, res) => {
  const { name } = req.body;
  try {
    const sub = await prisma.subCompany.update({ where: { id: req.params.id }, data: { name } });
    res.json(sub);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'SubCompany not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/sub-companies/:id
router.delete('/:id', requirePermission('manage_companies'), async (req, res) => {
  try {
    await prisma.subCompany.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'SubCompany not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
