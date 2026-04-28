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
    ...(body.deemedBenefitPercent !== undefined && {
      deemedBenefitPercent: body.deemedBenefitPercent !== '' ? parseFloat(body.deemedBenefitPercent) : undefined,
    }),
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

// ─── GET /api/transaction-codes/tarms-check ──────────────────────────────────
// Audits every active transaction code and reports which TaRMS column it will
// land in, plus any mis-configuration issues that would cause wrong reporting.

function getTarmsAllocation(tc) {
  const cat  = tc.incomeCategory;
  const name = (tc.name || '').toUpperCase();
  const code = (tc.code || '').toUpperCase();
  const type = tc.type;

  if (type === 'EARNING' || type === 'BENEFIT') {
    if (cat === 'OVERTIME' || name.includes('OVERTIME') || (type === 'EARNING' && code.includes('OT')))
      return 'Current Overtime';
    if (cat === 'BONUS')      return 'Current Bonus';
    if (cat === 'GRATUITY')   return 'Current Gratuity (No Exemption)';
    if (cat === 'COMMISSION') return 'Current Irregular Commission';
    if (type === 'BENEFIT') {
      if (name.includes('HOUS') || code.includes('HOUS')) return 'Current Housing Benefit';
      if (name.includes('VEH')  || code.includes('VEH'))  return 'Current Vehicle Benefit';
      if (name.includes('EDU')  || code.includes('EDU'))  return 'Current Education Benefit';
      return 'Current Other Benefits';
    }
    if (cat === 'ALLOWANCE') return 'Current Other Irregular Earnings';
    return 'Current Non-Taxable Earnings'; // fallthrough — common source of misreporting
  }

  if (type === 'DEDUCTION') {
    if (cat === 'PENSION' || name.includes('PENSION'))           return 'Current Pension Contributions';
    if (name.includes('RETIREM') || name.includes('ANNUITY'))    return 'Current Retirement Annuity';
    if (name.includes('MED') && name.includes('EXP'))            return 'Current Medical Expenses';
    if (name.includes('BLIND'))                                  return 'Current Blind Persons Credit';
    if (name.includes('DISAB'))                                  return 'Current Disabled Persons Credit';
    if (name.includes('ELDER'))                                  return 'Current Elderly Person Credit';
    if (cat === 'MEDICAL_AID')                                   return 'Medical Aid Credit (via payslip)';
    return 'Current Other Deductions';
  }

  return 'Unknown';
}

function checkTarmsIssues(tc) {
  const issues = [];
  const cat  = tc.incomeCategory;
  const name = (tc.name || '').toUpperCase();
  const code = (tc.code || '').toUpperCase();
  const type = tc.type;

  const EARNING_CATS = ['OVERTIME', 'BONUS', 'GRATUITY', 'COMMISSION', 'ALLOWANCE'];

  if (type === 'EARNING') {
    const hasOvertimeSignal = cat === 'OVERTIME' || name.includes('OVERTIME') || code.includes('OT');
    const hasValidEarningCat = EARNING_CATS.includes(cat);

    // Taxable earning with no valid TaRMS income path → lands in Non-Taxable
    if (tc.taxable && !hasOvertimeSignal && !hasValidEarningCat) {
      issues.push({
        severity: cat ? 'warning' : 'error',
        message: cat
          ? `Income category "${cat}" has no TaRMS bucket for EARNING type — this code will report to "Current Non-Taxable Earnings". Use BONUS, ALLOWANCE, COMMISSION, OVERTIME, or GRATUITY.`
          : 'No income category set. This taxable earning will report to "Current Non-Taxable Earnings" in TaRMS. Assign BONUS, ALLOWANCE, COMMISSION, OVERTIME, or GRATUITY.',
      });
    }

    if (cat === 'MEDICAL_AID') {
      issues.push({
        severity: 'error',
        message: 'MEDICAL_AID on an EARNING type is incorrect — it will fall to "Non-Taxable Earnings". Medical Aid should be a DEDUCTION to trigger the 50% tax credit.',
      });
    }

    if (cat === 'PENSION') {
      issues.push({
        severity: 'warning',
        message: 'PENSION on an EARNING type has no TaRMS bucket — it will land in "Non-Taxable Earnings". Pension contributions belong as DEDUCTION type.',
      });
    }
  }

  // An earning/benefit income category applied to a DEDUCTION is ignored by the categoriser
  if (type === 'DEDUCTION' && EARNING_CATS.includes(cat)) {
    issues.push({
      severity: 'error',
      message: `Income category "${cat}" is designed for EARNING/BENEFIT codes but is set on a DEDUCTION. The TaRMS categoriser routes deductions by name keywords only — this category will be ignored.`,
    });
  }

  // DEDUCTION with MEDICAL_AID: the TaRMS Medical Aid column is populated from the
  // payslip's computed credit (ps.medicalAidCredit), so the transaction code amount
  // itself flows to "Other Deductions" unless the name routes it elsewhere.
  if (type === 'DEDUCTION' && cat === 'MEDICAL_AID') {
    const nameRoutesElsewhere = name.includes('PENSION') || (name.includes('MED') && name.includes('EXP'));
    if (!nameRoutesElsewhere) {
      issues.push({
        severity: 'info',
        message: 'The TaRMS "Medical Aid" column is sourced from the payslip\'s computed 50% credit, not the raw deduction amount. This code is correctly flagged for the tax credit calculation.',
      });
    }
  }

  return issues;
}

router.get('/tarms-check', async (req, res) => {
  try {
    const where = { isActive: true };
    if (req.clientId) where.clientId = req.clientId;

    const codes = await prisma.transactionCode.findMany({
      where,
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
    });

    const results = codes.map((tc) => {
      const tarmsField = getTarmsAllocation(tc);
      const issues     = checkTarmsIssues(tc);
      const severity   = issues.reduce((worst, i) => {
        if (worst === 'error' || i.severity === 'error') return 'error';
        if (worst === 'warning' || i.severity === 'warning') return 'warning';
        return i.severity;
      }, issues.length ? 'info' : 'ok');

      return {
        id: tc.id, code: tc.code, name: tc.name, type: tc.type,
        incomeCategory: tc.incomeCategory, taxable: tc.taxable,
        tarmsField, issues, severity,
      };
    });

    const summary = {
      total:    results.length,
      errors:   results.filter((r) => r.severity === 'error').length,
      warnings: results.filter((r) => r.severity === 'warning').length,
      info:     results.filter((r) => r.severity === 'info').length,
      ok:       results.filter((r) => r.severity === 'ok').length,
    };

    res.json({ summary, codes: results });
  } catch (error) {
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
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        message: 'Cannot delete this transaction code because it is already used in existing payroll records. Please deactivate it instead.' 
      });
    }
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
