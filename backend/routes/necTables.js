const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/nec-tables
router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.clientId) where.clientId = req.clientId;
    if (req.query.sector) where.sector = req.query.sector;
    if (req.query.currency) where.currency = req.query.currency;

    const tables = await prisma.necTable.findMany({
      where,
      include: {
        grades: { orderBy: { gradeCode: 'asc' } },
        _count: { select: { grades: true } },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    res.json(tables);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/nec-tables
router.post('/', requirePermission('update_settings'), async (req, res) => {
  const { name, sector, currency, effectiveDate, expiryDate } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!name || !sector || !effectiveDate) {
    return res.status(400).json({ message: 'name, sector, effectiveDate are required' });
  }

  try {
    const table = await prisma.necTable.create({
      data: {
        clientId: req.clientId,
        name,
        sector,
        currency: currency || 'USD',
        effectiveDate: new Date(effectiveDate),
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });
    res.status(201).json(table);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/nec-tables/:id
router.get('/:id', async (req, res) => {
  try {
    const table = await prisma.necTable.findUnique({
      where: { id: req.params.id },
      include: { grades: { orderBy: { gradeCode: 'asc' } } },
    });
    if (!table) return res.status(404).json({ message: 'NEC table not found' });
    res.json(table);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/nec-tables/:id
router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  const { name, sector, currency, effectiveDate, expiryDate } = req.body;
  try {
    const table = await prisma.necTable.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(sector && { sector }),
        ...(currency && { currency }),
        ...(effectiveDate && { effectiveDate: new Date(effectiveDate) }),
        ...(expiryDate !== undefined && { expiryDate: expiryDate ? new Date(expiryDate) : null }),
      },
    });
    res.json(table);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'NEC table not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/nec-tables/:id
router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.necTable.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'NEC table not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Grades ────────────────────────────────────────────────────────────────────

// GET /api/nec-tables/:id/grades
router.get('/:id/grades', async (req, res) => {
  try {
    const grades = await prisma.necGrade.findMany({
      where: { necTableId: req.params.id },
      orderBy: { gradeCode: 'asc' },
    });
    res.json(grades);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/nec-tables/:id/grades
router.post('/:id/grades', requirePermission('update_settings'), async (req, res) => {
  const { gradeCode, description, minRate, necLevyRate } = req.body;
  if (!gradeCode || minRate === undefined) {
    return res.status(400).json({ message: 'gradeCode and minRate are required' });
  }

  try {
    const grade = await prisma.necGrade.create({
      data: {
        necTableId: req.params.id,
        gradeCode,
        description: description || null,
        minRate: parseFloat(minRate),
        necLevyRate: necLevyRate !== undefined ? parseFloat(necLevyRate) : 0,
      },
    });
    res.status(201).json(grade);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/nec-tables/:tableId/grades/:gradeId
router.put('/:tableId/grades/:gradeId', requirePermission('update_settings'), async (req, res) => {
  const { gradeCode, description, minRate, necLevyRate } = req.body;
  try {
    const grade = await prisma.necGrade.update({
      where: { id: req.params.gradeId },
      data: {
        ...(gradeCode && { gradeCode }),
        ...(description !== undefined && { description: description || null }),
        ...(minRate !== undefined && { minRate: parseFloat(minRate) }),
        ...(necLevyRate !== undefined && { necLevyRate: parseFloat(necLevyRate) }),
      },
    });
    res.json(grade);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'NEC grade not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/nec-tables/:tableId/grades/:gradeId
router.delete('/:tableId/grades/:gradeId', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.necGrade.delete({ where: { id: req.params.gradeId } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'NEC grade not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
