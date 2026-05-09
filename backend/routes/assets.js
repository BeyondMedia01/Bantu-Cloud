const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission, requireModule } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requireModule('ASSETS'));

// ─── Categories ───────────────────────────────────────────────────────────────

router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.assetCategory.findMany({
      where: req.companyId ? { companyId: req.companyId } : {},
      include: { _count: { select: { assets: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ data: categories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/categories', requirePermission('manage_employees'), async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });

  try {
    const category = await prisma.assetCategory.create({
      data: { companyId: req.companyId, name, description },
    });
    res.status(201).json({ data: category });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/categories/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.assetCategory.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.assetCategory.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Assets ────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  const { status, categoryId, assignedToId } = req.query;
  try {
    const where = {
      ...(req.companyId && { companyId: req.companyId }),
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(assignedToId && { assignedToId }),
    };
    const assets = await prisma.asset.findMany({
      where,
      include: {
        category: { select: { name: true } },
        assignedTo: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: assets });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/', requirePermission('manage_employees'), async (req, res) => {
  const { categoryId, name, serialNumber, model, purchaseDate, purchasePrice, currency, condition, notes, status } = req.body;
  if (!categoryId || !name) return res.status(400).json({ message: 'categoryId and name are required' });

  try {
    const asset = await prisma.asset.create({
      data: {
        companyId: req.companyId,
        categoryId, name, serialNumber, model,
        purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
        purchasePrice, currency: currency || 'USD',
        condition, notes,
        status: status || 'AVAILABLE',
      },
      include: { category: { select: { name: true } } },
    });
    await audit({ req, action: 'ASSET_CREATED', resource: 'asset', resourceId: asset.id, details: { name } });
    res.status(201).json({ data: asset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: {
        category: { select: { name: true } },
        assignedTo: { select: { firstName: true, lastName: true, employeeCode: true, email: true } },
      },
    });
    if (!asset) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && asset.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    res.json({ data: asset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  const { categoryId, name, serialNumber, model, purchaseDate, purchasePrice, currency, condition, notes, status } = req.body;
  try {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const data = {};
    if (categoryId) data.categoryId = categoryId;
    if (name) data.name = name;
    if (serialNumber !== undefined) data.serialNumber = serialNumber;
    if (model !== undefined) data.model = model;
    if (purchaseDate !== undefined) data.purchaseDate = purchaseDate ? new Date(purchaseDate) : null;
    if (purchasePrice !== undefined) data.purchasePrice = purchasePrice;
    if (currency) data.currency = currency;
    if (condition !== undefined) data.condition = condition;
    if (notes !== undefined) data.notes = notes;
    if (status) data.status = status;

    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data,
      include: { category: { select: { name: true } }, assignedTo: { select: { firstName: true, lastName: true } } },
    });
    res.json({ data: asset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.asset.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Assign / Return ──────────────────────────────────────────────────────────

router.post('/:id/assign', requirePermission('manage_employees'), async (req, res) => {
  const { employeeId } = req.body;
  if (!employeeId) return res.status(400).json({ message: 'employeeId is required' });

  try {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (existing.status === 'ASSIGNED') return res.status(400).json({ message: 'Asset is already assigned' });

    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: { assignedToId: employeeId, assignedAt: new Date(), status: 'ASSIGNED' },
      include: {
        category: { select: { name: true } },
        assignedTo: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
    });
    await audit({ req, action: 'ASSET_ASSIGNED', resource: 'asset', resourceId: asset.id, details: { employeeId } });
    res.json({ data: asset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.post('/:id/return', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.asset.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (existing.status !== 'ASSIGNED') return res.status(400).json({ message: 'Asset is not assigned' });

    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: { assignedToId: null, assignedAt: null, status: 'AVAILABLE' },
      include: { category: { select: { name: true } } },
    });
    await audit({ req, action: 'ASSET_RETURNED', resource: 'asset', resourceId: asset.id });
    res.json({ data: asset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Employees for assignment ─────────────────────────────────────────────────

router.get('/employees/list', async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      where: req.companyId ? { companyId: req.companyId } : {},
      select: { id: true, firstName: true, lastName: true, employeeCode: true, department: { select: { name: true } } },
      orderBy: { firstName: 'asc' },
    });
    res.json({ data: employees });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
