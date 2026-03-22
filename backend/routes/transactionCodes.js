const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// ─── helpers ─────────────────────────────────────────────────────────────────

const INCLUDE_RULES = { rules: { orderBy: { priority: 'asc' } } };

function pickTcFields(body) {
  const {
    name, description, type,
    taxable, pensionable, preTax,
    calculationType, defaultValue, formula,
    affectsPaye, affectsNssa, affectsAidsLevy,
    incomeCategory,
    isActive,
  } = body;
  return {
    ...(name !== undefined && { name }),
    ...(description !== undefined && { description: description || null }),
    ...(type !== undefined && { type }),
    ...(taxable !== undefined && { taxable: Boolean(taxable) }),
    ...(pensionable !== undefined && { pensionable: Boolean(pensionable) }),
    ...(preTax !== undefined && { preTax: Boolean(preTax) }),
    ...(calculationType !== undefined && { calculationType }),
    ...(defaultValue !== undefined && { defaultValue: defaultValue !== null ? parseFloat(defaultValue) : null }),
    ...(formula !== undefined && { formula: formula || null }),
    ...(affectsPaye !== undefined && { affectsPaye: Boolean(affectsPaye) }),
    ...(affectsNssa !== undefined && { affectsNssa: Boolean(affectsNssa) }),
    ...(affectsAidsLevy !== undefined && { affectsAidsLevy: Boolean(affectsAidsLevy) }),
    ...(incomeCategory !== undefined && { incomeCategory: incomeCategory || null }),
    ...(isActive !== undefined && { isActive: Boolean(isActive) }),
  };
}

// ─── GET /api/transaction-codes ──────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.clientId) where.clientId = req.clientId;
    if (req.query.type) where.type = req.query.type;
    if (req.query.active === 'true') where.isActive = true;

    const codes = await prisma.transactionCode.findMany({
      where,
      include: INCLUDE_RULES,
      orderBy: { code: 'asc' },
    });
    res.json(codes);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/transaction-codes ─────────────────────────────────────────────

router.post('/', requirePermission('update_settings'), async (req, res) => {
  const { code, name, type } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!code || !name || !type) return res.status(400).json({ message: 'code, name, type are required' });

  try {
    const tc = await prisma.transactionCode.create({
      data: {
        clientId: req.clientId,
        code: code.toUpperCase().replace(/\s+/g, '_'),
        ...pickTcFields(req.body),
        name,
        type,
      },
      include: INCLUDE_RULES,
    });
    res.status(201).json(tc);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'Transaction code already exists for this client' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/transaction-codes/:id ──────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const tc = await prisma.transactionCode.findUnique({
      where: { id: req.params.id },
      include: INCLUDE_RULES,
    });
    if (!tc) return res.status(404).json({ message: 'Transaction code not found' });
    res.json(tc);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/transaction-codes/:id ──────────────────────────────────────────

router.put('/:id', requirePermission('update_settings'), async (req, res) => {
  try {
    const tc = await prisma.transactionCode.update({
      where: { id: req.params.id },
      data: pickTcFields(req.body),
      include: INCLUDE_RULES,
    });
    res.json(tc);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Transaction code not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── DELETE /api/transaction-codes/:id ───────────────────────────────────────

router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.transactionCode.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Transaction code not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Rules sub-resource ───────────────────────────────────────────────────────

// GET /api/transaction-codes/:id/rules
router.get('/:id/rules', async (req, res) => {
  try {
    const rules = await prisma.transactionCodeRule.findMany({
      where: { transactionCodeId: req.params.id },
      orderBy: { priority: 'asc' },
    });
    res.json(rules);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/transaction-codes/:id/rules
router.post('/:id/rules', requirePermission('update_settings'), async (req, res) => {
  const { conditionType, conditionValue, calculationOverride, valueOverride, formulaOverride, capAmount, priority, description } = req.body;
  if (!conditionType) return res.status(400).json({ message: 'conditionType is required' });

  try {
    const rule = await prisma.transactionCodeRule.create({
      data: {
        transactionCodeId: req.params.id,
        conditionType,
        conditionValue: conditionValue ? String(conditionValue) : null,
        calculationOverride: calculationOverride || null,
        valueOverride: valueOverride !== undefined ? parseFloat(valueOverride) : null,
        formulaOverride: formulaOverride || null,
        capAmount: capAmount !== undefined ? parseFloat(capAmount) : null,
        priority: priority !== undefined ? parseInt(priority) : 0,
        description: description || null,
      },
    });
    res.status(201).json(rule);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/transaction-codes/:tcId/rules/:ruleId
router.put('/:tcId/rules/:ruleId', requirePermission('update_settings'), async (req, res) => {
  const { conditionType, conditionValue, calculationOverride, valueOverride, formulaOverride, capAmount, priority, description, isActive } = req.body;
  try {
    const rule = await prisma.transactionCodeRule.update({
      where: { id: req.params.ruleId },
      data: {
        ...(conditionType !== undefined && { conditionType }),
        ...(conditionValue !== undefined && { conditionValue: String(conditionValue) }),
        ...(calculationOverride !== undefined && { calculationOverride: calculationOverride || null }),
        ...(valueOverride !== undefined && { valueOverride: valueOverride !== null ? parseFloat(valueOverride) : null }),
        ...(formulaOverride !== undefined && { formulaOverride: formulaOverride || null }),
        ...(capAmount !== undefined && { capAmount: capAmount !== null ? parseFloat(capAmount) : null }),
        ...(priority !== undefined && { priority: parseInt(priority) }),
        ...(description !== undefined && { description: description || null }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });
    res.json(rule);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Rule not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/transaction-codes/:tcId/rules/:ruleId
router.delete('/:tcId/rules/:ruleId', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.transactionCodeRule.delete({ where: { id: req.params.ruleId } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Rule not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
