const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

const getClientId = async (req) => {
  if (req.user.role === 'PLATFORM_ADMIN') return null;
  return req.clientId;
};

// GET /api/companies
router.get('/', async (req, res) => {
  try {
    const clientId = await getClientId(req);
    const where = clientId ? { clientId } : {};
    const companies = await prisma.company.findMany({
      where,
      include: { _count: { select: { employees: true, branches: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ data: companies });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/companies
router.post('/', requirePermission('manage_companies'), async (req, res) => {
  const { name, registrationNumber, taxId, address, contactEmail, contactPhone, nssaNumber } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });

  try {
    const ca = await prisma.clientAdmin.findUnique({ where: { userId: req.user.userId } });
    const clientId = ca?.clientId;
    if (!clientId) return res.status(400).json({ message: 'Client not found for user' });

    const company = await prisma.company.create({
      data: {
        clientId, name, registrationNumber, taxId, address, contactEmail, contactPhone, nssaNumber,
        ...(req.body.wcifRate !== undefined && { wcifRate: req.body.wcifRate === null ? null : parseFloat(req.body.wcifRate) }),
        ...(req.body.sdfRate  !== undefined && { sdfRate:  req.body.sdfRate  === null ? null : parseFloat(req.body.sdfRate) }),
        ...(req.body.zimdefRate !== undefined && { zimdefRate: req.body.zimdefRate === null ? null : parseFloat(req.body.zimdefRate) }),
      },
    });
    res.status(201).json(company);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/companies/:id
router.get('/:id', async (req, res) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        branches: { include: { departments: true } },
        _count: { select: { employees: true } },
      },
    });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    if (req.user.role !== 'PLATFORM_ADMIN') {
      const clientId = await getClientId(req);
      if (company.clientId !== clientId) return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ data: company });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/companies/:id
router.put('/:id', requirePermission('manage_companies'), async (req, res) => {
  const { name, registrationNumber, taxId, address, contactEmail, contactPhone, wcifRate, sdfRate, nssaNumber } = req.body;
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { clientId: true } });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    if (req.user.role !== 'PLATFORM_ADMIN') {
      const clientId = await getClientId(req);
      if (company.clientId !== clientId) return res.status(403).json({ message: 'Access denied' });
    }

    const updated = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        name, registrationNumber, taxId, address, contactEmail, contactPhone, nssaNumber,
        ...(wcifRate !== undefined && { wcifRate: wcifRate === null ? null : parseFloat(wcifRate) }),
        ...(sdfRate  !== undefined && { sdfRate:  sdfRate  === null ? null : parseFloat(sdfRate) }),
        ...(req.body.zimdefRate !== undefined && { zimdefRate: req.body.zimdefRate === null ? null : parseFloat(req.body.zimdefRate) }),
      },
    });
    res.json({ data: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/companies/:id
router.delete('/:id', requirePermission('manage_companies'), async (req, res) => {
  try {
    const company = await prisma.company.findUnique({ where: { id: req.params.id }, select: { clientId: true } });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    if (req.user.role !== 'PLATFORM_ADMIN') {
      const clientId = await getClientId(req);
      if (company.clientId !== clientId) return res.status(403).json({ message: 'Access denied' });
    }

    await prisma.company.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Company not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
