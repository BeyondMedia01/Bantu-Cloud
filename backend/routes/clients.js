const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../lib/auth');
const { issueLicense } = require('../lib/license');

const router = express.Router();
const adminOnly = requireRole('PLATFORM_ADMIN');

// GET /api/clients
router.get('/', adminOnly, async (req, res) => {
  try {
    const clients = await prisma.client.findMany({
      include: {
        license: { select: { active: true, expiresAt: true } },
        _count: { select: { employees: true, companies: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json(clients);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/clients — creates client + auto-issues license
router.post('/', adminOnly, async (req, res) => {
  const { name, taxId, defaultCurrency } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });

  try {
    const client = await prisma.client.create({
      data: { name, taxId, defaultCurrency: defaultCurrency || 'USD' },
    });
    const license = await issueLicense(client.id);
    res.status(201).json({ ...client, licenseToken: license.token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/clients/:id
router.get('/:id', adminOnly, async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        license: true,
        subscription: true,
        companies: true,
        _count: { select: { employees: true } },
      },
    });
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/clients/:id
router.put('/:id', adminOnly, async (req, res) => {
  const { name, taxId, defaultCurrency, isActive } = req.body;
  try {
    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: { name, taxId, defaultCurrency, isActive },
    });
    res.json(client);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Client not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/clients/:id
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    await prisma.client.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Client not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
