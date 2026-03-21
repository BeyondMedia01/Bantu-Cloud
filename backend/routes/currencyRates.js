const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

// GET /api/currency-rates — list all rates for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const { fromCurrency, toCurrency, limit = 90 } = req.query;
    const rates = await prisma.currencyRate.findMany({
      where: {
        companyId: req.companyId,
        ...(fromCurrency && { fromCurrency }),
        ...(toCurrency   && { toCurrency }),
      },
      orderBy: { effectiveDate: 'desc' },
      take: parseInt(limit),
    });
    res.json(rates);
  } catch (error) {
    console.error('Currency rates GET error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/currency-rates/latest — most recent rate for USD→ZiG (used by payroll engine)
router.get('/latest', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  const fromCurrency = req.query.fromCurrency || 'USD';
  const toCurrency   = req.query.toCurrency   || 'ZiG';
  try {
    const rate = await prisma.currencyRate.findFirst({
      where: { companyId: req.companyId, fromCurrency, toCurrency },
      orderBy: { effectiveDate: 'desc' },
    });
    if (!rate) return res.status(404).json({ message: 'No rate found. Add a rate under Currency Rates settings.' });
    res.json(rate);
  } catch (error) {
    console.error('Currency rates latest error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/currency-rates — create a new daily rate entry
router.post('/', requirePermission('update_settings'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  const { fromCurrency = 'USD', toCurrency = 'ZiG', rate, effectiveDate, source = 'MANUAL', notes } = req.body;

  if (!rate || isNaN(parseFloat(rate)) || parseFloat(rate) <= 0) {
    return res.status(400).json({ message: 'rate must be a positive number' });
  }
  if (!effectiveDate) {
    return res.status(400).json({ message: 'effectiveDate is required' });
  }

  try {
    const created = await prisma.currencyRate.create({
      data: {
        companyId: req.companyId,
        fromCurrency,
        toCurrency,
        rate: parseFloat(rate),
        effectiveDate: new Date(effectiveDate),
        source: ['RBZ', 'MANUAL', 'IMPORT'].includes(source) ? source : 'MANUAL',
        notes: notes || null,
        createdBy: req.user?.email || null,
      },
    });

    await audit({
      req,
      action: 'CURRENCY_RATE_CREATED',
      resource: 'currency_rate',
      resourceId: created.id,
      details: { fromCurrency, toCurrency, rate: created.rate, effectiveDate, source },
    });

    res.status(201).json(created);
  } catch (error) {
    console.error('Currency rates POST error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/currency-rates/:id — update an existing rate
router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const existing = await prisma.currencyRate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Currency rate not found' });
    if (existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const { rate, effectiveDate, source, notes } = req.body;
    const updated = await prisma.currencyRate.update({
      where: { id: req.params.id },
      data: {
        ...(rate !== undefined          && { rate: parseFloat(rate) }),
        ...(effectiveDate !== undefined && { effectiveDate: new Date(effectiveDate) }),
        ...(source !== undefined        && { source: ['RBZ', 'MANUAL', 'IMPORT'].includes(source) ? source : 'MANUAL' }),
        ...(notes !== undefined         && { notes: notes || null }),
      },
    });

    await audit({
      req,
      action: 'CURRENCY_RATE_UPDATED',
      resource: 'currency_rate',
      resourceId: updated.id,
      details: { rate: updated.rate, effectiveDate: updated.effectiveDate, source: updated.source },
    });

    res.json(updated);
  } catch (error) {
    console.error('Currency rates PUT error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/currency-rates/:id
router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const existing = await prisma.currencyRate.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Currency rate not found' });
    if (existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.currencyRate.delete({ where: { id: req.params.id } });

    await audit({
      req,
      action: 'CURRENCY_RATE_DELETED',
      resource: 'currency_rate',
      resourceId: req.params.id,
      details: { rate: existing.rate, effectiveDate: existing.effectiveDate },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Currency rates DELETE error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
