import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, cache } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const INCLUDE_RULES = { rules: { orderBy: { priority: 'asc' } } } as const;

const createSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  taxable: z.boolean().optional(),
  pensionable: z.boolean().optional(),
  preTax: z.boolean().optional(),
  calculationType: z.string().optional(),
  defaultValue: z.number().optional(),
  formula: z.string().optional(),
  affectsPaye: z.boolean().optional(),
  affectsNssa: z.boolean().optional(),
  affectsAidsLevy: z.boolean().optional(),
  incomeCategory: z.string().optional(),
  isActive: z.boolean().optional(),
  deemedBenefitPercent: z.number().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: z.string().optional(),
  taxable: z.boolean().optional(),
  pensionable: z.boolean().optional(),
  preTax: z.boolean().optional(),
  calculationType: z.string().optional(),
  defaultValue: z.number().optional(),
  formula: z.string().optional(),
  affectsPaye: z.boolean().optional(),
  affectsNssa: z.boolean().optional(),
  affectsAidsLevy: z.boolean().optional(),
  incomeCategory: z.string().optional(),
  isActive: z.boolean().optional(),
  deemedBenefitPercent: z.number().optional(),
});

function pickFields(body: any) {
  const fields: Record<string, unknown> = {};
  if (body.name !== undefined) fields.name = body.name;
  if (body.description !== undefined) fields.description = body.description || null;
  if (body.type !== undefined) fields.type = body.type;
  if (body.taxable !== undefined) fields.taxable = Boolean(body.taxable);
  if (body.pensionable !== undefined) fields.pensionable = Boolean(body.pensionable);
  if (body.preTax !== undefined) fields.preTax = Boolean(body.preTax);
  if (body.calculationType !== undefined) fields.calculationType = body.calculationType;
  if (body.defaultValue !== undefined) fields.defaultValue = body.defaultValue !== null ? parseFloat(body.defaultValue) : null;
  if (body.formula !== undefined) fields.formula = body.formula || null;
  if (body.affectsPaye !== undefined) fields.affectsPaye = Boolean(body.affectsPaye);
  if (body.affectsNssa !== undefined) fields.affectsNssa = Boolean(body.affectsNssa);
  if (body.affectsAidsLevy !== undefined) fields.affectsAidsLevy = Boolean(body.affectsAidsLevy);
  if (body.incomeCategory !== undefined) fields.incomeCategory = body.incomeCategory || null;
  if (body.isActive !== undefined) fields.isActive = Boolean(body.isActive);
  if (body.deemedBenefitPercent !== undefined) fields.deemedBenefitPercent = body.deemedBenefitPercent !== '' ? parseFloat(body.deemedBenefitPercent) : undefined;
  return fields;
}

router.get('/', async (c) => {
  try {
    const clientId = c.get('clientId');
    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;
    if (c.req.query('type')) where.type = c.req.query('type');
    if (c.req.query('active') === 'true') where.isActive = true;

    const codes = await prisma.transactionCode.findMany({ where, include: INCLUDE_RULES, orderBy: { code: 'asc' } ,
    });
    return c.json(codes);
  } catch (err: any) {
    console.error('[transactionCodes GET /]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/tarms-check', async (c) => {
  try {
    const clientId = c.get('clientId');
    const where: Record<string, unknown> = { isActive: true };
    if (clientId) where.clientId = clientId;

    const codes = await prisma.transactionCode.findMany({ where, orderBy: [{ type: 'asc' }, { code: 'asc' }] ,
    });

    const results = codes.map((tc: any) => {
      const tarmsField = getTarmsAllocation(tc);
      const issues = checkTarmsIssues(tc);
      return {
        id: tc.id, code: tc.code, name: tc.name, type: tc.type,
        incomeCategory: tc.incomeCategory, taxable: tc.taxable,
        tarmsField, issues,
      };
    });

    return c.json(results);
  } catch (err: any) {
    console.error('[transactionCodes GET /tarms-check]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/', requirePermission('update_settings'), validateBody(createSchema), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);
  const body = c.req.valid('json');
  if (!body.code || !body.name || !body.type) {
    return c.json({ message: 'code, name, type are required' }, 400);
  }
  try {
    const tc = await prisma.transactionCode.create({
      data: {
        clientId,
        code: body.code.toUpperCase().replace(/\s+/g, '_'),
        name: body.name,
        type: body.type,
        ...pickFields(body),
      },
      include: INCLUDE_RULES,
    });
    return c.json(tc, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ message: 'Transaction code already exists for this client' }, 409);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/:id', async (c) => {
  try {
    const tc = await prisma.transactionCode.findUnique({
      where: { id: c.req.param('id') },
      include: INCLUDE_RULES,
    });
    if (!tc) return c.json({ message: 'Transaction code not found' }, 404);
    return c.json(tc);
  } catch (err: any) {
    console.error('[transactionCodes GET /:id]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:id', requirePermission('update_settings'), async (c) => {
  try {
    const body = await c.req.json();
    await prisma.transactionCode.update({ where: { id: c.req.param('id') }, data: pickFields(body) });
    const tc = await prisma.transactionCode.findUnique({ where: { id: c.req.param('id') }, include: INCLUDE_RULES });
    return c.json(tc);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Transaction code not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/:id', requirePermission('update_settings'), async (c) => {
  try {
    await prisma.transactionCode.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Transaction code not found' }, 404);
    if (err.code === 'P2003') {
      return c.json({ message: 'Cannot delete this transaction code because it is already used in existing payroll records. Please deactivate it instead.' }, 400);
    }
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/:id/rules', async (c) => {
  try {
    const rules = await prisma.transactionCodeRule.findMany({
      where: { transactionCodeId: c.req.param('id') },
      orderBy: { priority: 'asc' },
    });
    return c.json(rules);
  } catch (err: any) {
    console.error('[transactionCodes GET /:id/rules]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const ruleCreateSchema = z.object({
  conditionType: z.string().min(1),
  conditionValue: z.string().optional(),
  calculationOverride: z.string().optional(),
  valueOverride: z.number().optional(),
  formulaOverride: z.string().optional(),
  capAmount: z.number().optional(),
  priority: z.number().optional(),
  description: z.string().optional(),
});

router.post('/:id/rules', requirePermission('update_settings'), validateBody(ruleCreateSchema), async (c) => {
  const body = c.req.valid('json');
  const rule = await prisma.transactionCodeRule.create({
    data: {
      transactionCodeId: c.req.param('id'),
      conditionType: body.conditionType,
      conditionValue: body.conditionValue ? String(body.conditionValue) : null,
      calculationOverride: body.calculationOverride || null,
      valueOverride: body.valueOverride !== undefined ? parseFloat(body.valueOverride) : null,
      formulaOverride: body.formulaOverride || null,
      capAmount: body.capAmount !== undefined ? parseFloat(body.capAmount) : null,
      priority: body.priority !== undefined ? body.priority : 0,
      description: body.description || null,
    } as any,
  });
  return c.json(rule, 201);
});

const ruleUpdateSchema = z.object({
  conditionType: z.string().optional(),
  conditionValue: z.string().optional(),
  calculationOverride: z.string().optional(),
  valueOverride: z.number().optional(),
  formulaOverride: z.string().optional(),
  capAmount: z.number().optional(),
  priority: z.number().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

router.put('/:tcId/rules/:ruleId', requirePermission('update_settings'), async (c) => {
  const body = await c.req.json();
  const data: Record<string, unknown> = {};
  if (body.conditionType !== undefined) data.conditionType = body.conditionType;
  if (body.conditionValue !== undefined) data.conditionValue = String(body.conditionValue);
  if (body.calculationOverride !== undefined) data.calculationOverride = body.calculationOverride || null;
  if (body.valueOverride !== undefined) data.valueOverride = body.valueOverride !== null ? parseFloat(body.valueOverride) : null;
  if (body.formulaOverride !== undefined) data.formulaOverride = body.formulaOverride || null;
  if (body.capAmount !== undefined) data.capAmount = body.capAmount !== null ? parseFloat(body.capAmount) : null;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  try {
    const rule = await prisma.transactionCodeRule.update({ where: { id: c.req.param('ruleId') }, data });
    return c.json(rule);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Rule not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/:tcId/rules/:ruleId', requirePermission('update_settings'), async (c) => {
  try {
    await prisma.transactionCodeRule.delete({ where: { id: c.req.param('ruleId') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Rule not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

function getTarmsAllocation(tc: any) {
  const cat = tc.incomeCategory;
  const name = (tc.name || '').toUpperCase();
  const code = (tc.code || '').toUpperCase();
  const type = tc.type;

  if (type === 'EARNING' || type === 'BENEFIT') {
    if (cat === 'OVERTIME' || name.includes('OVERTIME') || (type === 'EARNING' && code.includes('OT'))) return 'Current Overtime';
    if (cat === 'BONUS') return 'Current Bonus';
    if (cat === 'GRATUITY') return 'Current Gratuity (No Exemption)';
    if (cat === 'COMMISSION') return 'Current Irregular Commission';
    if (type === 'BENEFIT') {
      if (name.includes('HOUS') || code.includes('HOUS')) return 'Current Housing Benefit';
      if (name.includes('VEH') || code.includes('VEH')) return 'Current Vehicle Benefit';
      if (name.includes('EDU') || code.includes('EDU')) return 'Current Education Benefit';
      return 'Current Other Benefits';
    }
    if (cat === 'ALLOWANCE') return 'Current Other Irregular Earnings';
    return 'Current Non-Taxable Earnings';
  }

  if (type === 'DEDUCTION') {
    if (cat === 'PENSION' || name.includes('PENSION')) return 'Current Pension Contributions';
    if (name.includes('RETIREM') || name.includes('ANNUITY')) return 'Current Retirement Annuity';
    if (name.includes('MED') && name.includes('EXP')) return 'Current Medical Expenses';
    if (name.includes('BLIND')) return 'Current Blind Persons Credit';
    if (name.includes('DISAB')) return 'Current Disabled Persons Credit';
    if (name.includes('ELDER')) return 'Current Elderly Person Credit';
    if (cat === 'MEDICAL_AID') return 'Medical Aid Credit (via payslip)';
    return 'Current Other Deductions';
  }
  return 'Unknown';
}

function checkTarmsIssues(tc: any) {
  const issues: Array<{ severity: string; message: string }> = [];
  const cat = tc.incomeCategory;
  const name = (tc.name || '').toUpperCase();
  const code = (tc.code || '').toUpperCase();
  const type = tc.type;
  const EARNING_CATS = ['OVERTIME', 'BONUS', 'GRATUITY', 'COMMISSION', 'ALLOWANCE'];

  if (type === 'EARNING') {
    const hasOvertimeSignal = cat === 'OVERTIME' || name.includes('OVERTIME') || code.includes('OT');
    const hasValidEarningCat = EARNING_CATS.includes(cat);
    if (tc.taxable && !hasOvertimeSignal && !hasValidEarningCat) {
      issues.push({
        severity: cat ? 'warning' : 'error',
        message: cat
          ? `Income category "${cat}" has no TaRMS bucket for EARNING type. Use BONUS, ALLOWANCE, COMMISSION, OVERTIME, or GRATUITY.`
          : 'No income category set. This taxable earning will report to "Current Non-Taxable Earnings" in TaRMS.',
      });
    }
    if (cat === 'MEDICAL_AID') {
      issues.push({ severity: 'error', message: 'MEDICAL_AID on an EARNING type is incorrect. Medical Aid should be a DEDUCTION.' });
    }
    if (cat === 'PENSION') {
      issues.push({ severity: 'warning', message: 'PENSION on an EARNING type has no TaRMS bucket. Pension contributions belong as DEDUCTION type.' });
    }
  }
  if (type === 'DEDUCTION' && EARNING_CATS.includes(cat)) {
    issues.push({ severity: 'error', message: `Income category "${cat}" is designed for EARNING/BENEFIT codes.` });
  }
  if (type === 'DEDUCTION' && cat === 'MEDICAL_AID') {
    const nameRoutesElsewhere = name.includes('PENSION') || (name.includes('MED') && name.includes('EXP'));
    if (!nameRoutesElsewhere) {
      issues.push({ severity: 'info', message: 'The TaRMS "Medical Aid" column is sourced from the payslip\'s computed 50% credit, not the raw deduction amount.' });
    }
  }
  return issues;
}

router.post('/import', requirePermission('process_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const fd = await c.req.formData();
  const file = fd.get('file');
  if (!file || typeof (file as any).text !== 'function') return c.json({ message: 'CSV file is required' }, 400);
  const text = await (file as any).text();
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
  if (lines.length < 2) return c.json({ message: 'CSV must have header + data rows' }, 400);
  const headers = lines[0].split(',');
  const codeIdx = headers.findIndex((h: string) => /code/i.test(h));
  const nameIdx = headers.findIndex((h: string) => /name/i.test(h));
  const typeIdx = headers.findIndex((h: string) => /type/i.test(h));
  if (codeIdx < 0 || nameIdx < 0) return c.json({ message: 'CSV must have columns: code, name' }, 400);
  let imported = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((s: string) => s.trim());
    const code = cols[codeIdx];
    const name = cols[nameIdx];
    if (!code || !name) continue;
    const existing = await prisma.transactionCode.findFirst({ where: { clientId: clientId!, code: code! } });
    if (existing) continue;
    await prisma.transactionCode.create({
      data: { clientId: clientId!, code: code!, name: name!, type: typeIdx >= 0 ? (cols[typeIdx].toUpperCase() as any) : 'EARNING' },
    });
    imported++;
  }
  return c.json({ imported });
});

export default router;
