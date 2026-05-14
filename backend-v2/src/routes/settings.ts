import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, cache } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import * as settingsService from '../services/settings.service';
import { denyUnlessClient } from '../lib/ownership';

const router = new Hono();

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function nthWeekday(year: number, month: number, dayOfWeek: number, nth: number): Date | null {
  const d = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (d.getMonth() === month) {
    if (d.getUTCDay() === dayOfWeek) { count++; if (count === nth) return new Date(d); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

function buildZimbabweHolidays(year: number) {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter); goodFriday.setUTCDate(easter.getUTCDate() - 2);
  const holySaturday = new Date(easter); holySaturday.setUTCDate(easter.getUTCDate() - 1);
  const easterMonday = new Date(easter); easterMonday.setUTCDate(easter.getUTCDate() + 1);
  const heroesDay = nthWeekday(year, 7, 1, 2);
  const defenseDay = nthWeekday(year, 7, 2, 2);

  const base = [
    { name: "New Year's Day", date: new Date(Date.UTC(year, 0, 1)) },
    { name: 'Robert Gabriel Mugabe National Youth Day', date: new Date(Date.UTC(year, 1, 21)) },
    { name: 'Good Friday', date: goodFriday },
    { name: 'Holy Saturday', date: holySaturday },
    { name: 'Easter Monday', date: easterMonday },
    { name: 'Independence Day', date: new Date(Date.UTC(year, 3, 18)) },
    { name: "Workers' Day", date: new Date(Date.UTC(year, 4, 1)) },
    { name: 'Africa Day', date: new Date(Date.UTC(year, 4, 25)) },
    { name: "Heroes' Day", date: heroesDay ?? new Date(Date.UTC(year, 7, 11)) },
    { name: 'Defense Forces Day', date: defenseDay ?? new Date(Date.UTC(year, 7, 12)) },
    { name: 'Unity Day', date: new Date(Date.UTC(year, 11, 22)) },
    { name: 'Christmas Day', date: new Date(Date.UTC(year, 11, 25)) },
    { name: 'Boxing Day', date: new Date(Date.UTC(year, 11, 26)) },
  ].map(h => ({ ...h, year, country: 'ZW' }));

  const all = [...base];
  const existingTimes = new Set(base.map(h => h.date.getTime()));
  for (const h of base) {
    if (h.date.getUTCDay() === 0) {
      const sub = new Date(h.date);
      sub.setUTCDate(sub.getUTCDate() + 1);
      if (existingTimes.has(sub.getTime())) sub.setUTCDate(sub.getUTCDate() + 1);
      all.push({ name: `${h.name} (substitute)`, date: sub, year: sub.getUTCFullYear(), country: 'ZW' });
      existingTimes.add(sub.getTime());
    }
  }
  return all.sort((a, b) => a.date.getTime() - b.date.getTime());
}

router.get('/system-settings', async (c) => {
  try {
    const settings = await settingsService.getAll();
    return c.json(settings);
  } catch (err: any) {
    console.error('[settings GET /system-settings]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const createSettingSchema = z.object({
  settingName: z.string().min(1),
  settingValue: z.string().min(1),
  dataType: z.string().optional(),
  effectiveFrom: z.string().optional(),
  isActive: z.boolean().optional(),
  description: z.string().optional(),
  lastUpdatedBy: z.string().optional(),
});

router.post('/system-settings', requirePermission('update_settings'), validateBody(createSettingSchema), async (c) => {
  try {
    const result = await settingsService.create(c.req.valid('json'));
    return c.json(result, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ error: 'A setting with this name and effective date already exists.' }, 409);
    console.error(err);
    return c.json({ error: 'Failed to create system setting' }, 500);
  }
});

const updateSettingSchema = z.object({
  settingValue: z.string().optional(),
  isActive: z.boolean().optional(),
  description: z.string().optional(),
});

router.patch('/system-settings/:id', requirePermission('update_settings'), validateBody(updateSettingSchema), async (c) => {
  try {
    const id = c.req.param('id')!;
    const user = c.get('user');
    const result = await settingsService.update(id, { ...c.req.valid('json'), lastUpdatedBy: user.email });
    return c.json(result);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ error: 'Setting not found' }, 404);
    console.error(err);
    return c.json({ error: 'Failed to update system setting' }, 500);
  }
});

router.delete('/system-settings/:id', requirePermission('update_settings'), async (c) => {
  try {
    await settingsService.remove(c.req.param('id')!);
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ error: 'Setting not found' }, 404);
    console.error(err);
    return c.json({ error: 'Failed to delete system setting' }, 500);
  }
});

router.get('/seed-settings', async (c) => {
  try {
    const result = await settingsService.getSeedSettings();
    return c.json(result);
  } catch (err: any) {
    console.error('[settings GET /seed-settings]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/work-period-settings', async (c) => {
  try {
    const result = await settingsService.getWorkPeriodSettings();
    return c.json(result);
  } catch (err: any) {
    console.error('[settings GET /work-period-settings]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const workPeriodSchema = z.object({
  WORKING_DAYS_PER_PERIOD: z.number().optional(),
  WORKING_DAYS_PER_MONTH: z.number().optional(),
  HOURS_PER_DAY: z.number().optional(),
  DAYS_PER_MONTH: z.number().optional(),
});

router.put('/work-period-settings', requirePermission('update_settings'), validateBody(workPeriodSchema), async (c) => {
  try {
    const user = c.get('user');
    await settingsService.updateWorkPeriodSettings(c.req.valid('json'), user.email);
    return c.json({ message: 'Work period settings saved' });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'Failed to save work period settings' }, 500);
  }
});

router.get('/public-holidays', async (c) => {
  try {
    const year = parseInt(c.req.query('year') || '') || new Date().getFullYear();
    const holidays = await prisma.publicHoliday.findMany({ where: { year, country: 'ZW' }, orderBy: { date: 'asc' } ,
    });
    return c.json(holidays);
  } catch (err: any) {
    console.error('[settings GET /public-holidays]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const createHolidaySchema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
});

router.post('/public-holidays', requirePermission('update_settings'), validateBody(createHolidaySchema), async (c) => {
  try {
    const { name, date } = c.req.valid('json');
    const d = new Date(date);
    const holiday = await prisma.publicHoliday.create({
      data: { name, date: d, year: d.getUTCFullYear(), country: 'ZW' },
    });
    return c.json(holiday, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ message: 'A holiday already exists on this date' }, 409);
    console.error(err);
    return c.json({ message: 'Failed to create holiday' }, 500);
  }
});

const seedHolidaySchema = z.object({
  year: z.number().optional(),
});

router.post('/public-holidays/seed', requirePermission('update_settings'), validateBody(seedHolidaySchema), async (c) => {
  try {
    const year = c.req.valid('json').year || new Date().getFullYear();
    const holidays = buildZimbabweHolidays(year);
    let created = 0, skipped = 0;
    for (const h of holidays) {
      const existing = await prisma.publicHoliday.findFirst({ where: { date: h.date, country: h.country } });
      if (existing) { skipped++; continue; }
      await prisma.publicHoliday.create({ data: h });
      created++;
    }
    return c.json({ message: `Seeded ${created} holidays for ${year} (${skipped} already existed)`, created, skipped });
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Failed to seed holidays' }, 500);
  }
});

router.delete('/public-holidays/:id', requirePermission('update_settings'), async (c) => {
  try {
    const user = c.get('user');
    if (user.role !== 'PLATFORM_ADMIN') {
      return c.json({ message: 'Only platform administrators can delete public holidays' }, 403);
    }
    const holiday = await prisma.publicHoliday.findUnique({ where: { id: c.req.param('id') } });
    if (!holiday) return c.json({ message: 'Holiday not found' }, 404);
    await prisma.publicHoliday.delete({ where: { id: c.req.param('id') } });
    return c.json({ message: 'Holiday deleted' });
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Holiday not found' }, 404);
    return c.json({ message: 'Failed to delete holiday' }, 500);
  }
});

function pickTcFields(body: any) {
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
  if (body.deemedBenefitPercent !== undefined) {
    fields.deemedBenefitPercent = body.deemedBenefitPercent !== '' ? parseFloat(body.deemedBenefitPercent) : undefined;
  }
  return fields;
}

const INCLUDE_RULES = { rules: { orderBy: { priority: 'asc' as const } } };

router.get('/transaction-codes', async (c) => {
  try {
    const clientId = c.get('clientId');
    if (!clientId) return c.json([]);
    const where: Record<string, unknown> = { clientId };
    if (c.req.query('type')) where.type = c.req.query('type');
    if (c.req.query('active') === 'true') where.isActive = true;

    const codes = await prisma.transactionCode.findMany({ where, include: INCLUDE_RULES, orderBy: { code: 'asc' } ,
    });
    return c.json(codes);
  } catch (err: any) {
    console.error('[settings GET /transaction-codes]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/transaction-codes/tarms-check', async (c) => {
  try {
  const clientId = c.get('clientId');
  if (!clientId) return c.json([]);
  const where: Record<string, unknown> = { isActive: true, clientId };

  const codes = await prisma.transactionCode.findMany({
    where, orderBy: [{ type: 'asc' }, { code: 'asc' }],
  });

  const EARNING_CATS = ['OVERTIME', 'BONUS', 'GRATUITY', 'COMMISSION', 'ALLOWANCE'];

  const results = codes.map((tc: any) => {
    const issues: { severity: string; message: string }[] = [];
    const cat = tc.incomeCategory;
    const name = (tc.name || '').toUpperCase();
    const code = (tc.code || '').toUpperCase();
    const type = tc.type;

    if (type === 'EARNING') {
      const hasOvertimeSignal = cat === 'OVERTIME' || name.includes('OVERTIME') || code.includes('OT');
      const hasValidEarningCat = EARNING_CATS.includes(cat);
      if (tc.taxable && !hasOvertimeSignal && !hasValidEarningCat) {
        issues.push({
          severity: cat ? 'warning' : 'error',
          message: cat ? `Income category "${cat}" has no TaRMS bucket for EARNING type` : 'No income category set. This taxable earning will report to "Current Non-Taxable Earnings" in TaRMS.',
        });
      }
    }

    let tarmsField = 'Unknown';
    if (type === 'EARNING' || type === 'BENEFIT') {
      if (cat === 'OVERTIME' || name.includes('OVERTIME') || (type === 'EARNING' && code.includes('OT'))) tarmsField = 'Current Overtime';
      else if (cat === 'BONUS') tarmsField = 'Current Bonus';
      else if (cat === 'GRATUITY') tarmsField = 'Current Gratuity (No Exemption)';
      else if (cat === 'COMMISSION') tarmsField = 'Current Irregular Commission';
      else if (type === 'BENEFIT' && name.includes('HOUS')) tarmsField = 'Current Housing Benefit';
      else if (type === 'BENEFIT' && name.includes('VEH')) tarmsField = 'Current Vehicle Benefit';
      else if (type === 'BENEFIT') tarmsField = 'Current Other Benefits';
      else if (cat === 'ALLOWANCE') tarmsField = 'Current Other Irregular Earnings';
      else tarmsField = 'Current Non-Taxable Earnings';
    }

    const severity = issues.reduce((worst, i) => i.severity === 'error' ? 'error' : worst === 'error' ? 'error' : i.severity === 'warning' ? 'warning' : i.severity, issues.length ? 'info' : 'ok');

    return { id: tc.id, code: tc.code, name: tc.name, type: tc.type, incomeCategory: tc.incomeCategory, taxable: tc.taxable, tarmsField, issues, severity };
  });

  return c.json({
    summary: {
      total: results.length,
      errors: results.filter(r => r.severity === 'error').length,
      warnings: results.filter(r => r.severity === 'warning').length,
      info: results.filter(r => r.severity === 'info').length,
      ok: results.filter(r => r.severity === 'ok').length,
    },
    codes: results,
  });
  } catch (err: any) {
    console.error('[settings GET /transaction-codes/tarms-check]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const createTcSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  taxable: z.boolean().optional(),
  pensionable: z.boolean().optional(),
  preTax: z.boolean().optional(),
  calculationType: z.string().optional(),
  defaultValue: z.number().nullable().optional(),
  formula: z.string().nullable().optional(),
  affectsPaye: z.boolean().optional(),
  affectsNssa: z.boolean().optional(),
  affectsAidsLevy: z.boolean().optional(),
  incomeCategory: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  deemedBenefitPercent: z.number().optional(),
});

router.post('/transaction-codes', requirePermission('update_settings'), validateBody(createTcSchema), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  try {
    const body = c.req.valid('json');
    const tc = await prisma.transactionCode.create({
      data: {
        clientId,
        code: body.code.toUpperCase().replace(/\s+/g, '_'),
        name: body.name,
        ...pickTcFields(body),
      } as any,
      include: INCLUDE_RULES,
    });
    return c.json(tc, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ message: 'Transaction code already exists for this client' }, 409);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/transaction-codes/:id', async (c) => {
  try {
    const tc = await prisma.transactionCode.findUnique({ where: { id: c.req.param('id') }, include: INCLUDE_RULES });
    if (!tc) return c.json({ message: 'Transaction code not found' }, 404);
    if (!denyUnlessClient(c, tc)) return c.json({ message: 'Access denied' }, 403);
    return c.json(tc);
  } catch (err: any) {
    console.error('[settings GET /transaction-codes/:id]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/transaction-codes/:id', requirePermission('update_settings'), async (c) => {
  const existing = await prisma.transactionCode.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'Transaction code not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);
  try {
    const body = await c.req.json();
    await prisma.transactionCode.update({ where: { id: c.req.param('id') }, data: pickTcFields(body) });
    const tc = await prisma.transactionCode.findUnique({ where: { id: c.req.param('id') }, include: INCLUDE_RULES });
    return c.json(tc);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Transaction code not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/transaction-codes/:id', requirePermission('update_settings'), async (c) => {
  const existing = await prisma.transactionCode.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'Transaction code not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);
  try {
    await prisma.transactionCode.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Transaction code not found' }, 404);
    if (err.code === 'P2003') return c.json({ message: 'Cannot delete this transaction code because it is already used in existing payroll records. Please deactivate it instead.' }, 400);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/transaction-codes/:id/rules', async (c) => {
  try {
    const tc = await prisma.transactionCode.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
    if (!tc) return c.json({ message: 'Transaction code not found' }, 404);
    if (!denyUnlessClient(c, tc)) return c.json({ message: 'Access denied' }, 403);
    const rules = await prisma.transactionCodeRule.findMany({
      where: { transactionCodeId: c.req.param('id') },
      orderBy: { priority: 'asc' },
    });
    return c.json(rules);
  } catch (err: any) {
    console.error('[settings GET /transaction-codes/:id/rules]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const createRuleSchema = z.object({
  conditionType: z.string().min(1),
  conditionValue: z.string().optional(),
  calculationOverride: z.string().optional(),
  valueOverride: z.number().optional(),
  formulaOverride: z.string().optional(),
  capAmount: z.number().optional(),
  priority: z.number().optional(),
  description: z.string().optional(),
});

router.post('/transaction-codes/:id/rules', requirePermission('update_settings'), validateBody(createRuleSchema), async (c) => {
  const tc = await prisma.transactionCode.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!tc) return c.json({ message: 'Transaction code not found' }, 404);
  if (!denyUnlessClient(c, tc)) return c.json({ message: 'Access denied' }, 403);
  try {
    const body = c.req.valid('json');
    const rule = await prisma.transactionCodeRule.create({
      data: {
        transactionCodeId: c.req.param('id')!,
        conditionType: body.conditionType,
        conditionValue: body.conditionValue ? String(body.conditionValue) : null,
        calculationOverride: body.calculationOverride || null,
        valueOverride: body.valueOverride !== undefined ? body.valueOverride : null,
        formulaOverride: body.formulaOverride || null,
        capAmount: body.capAmount !== undefined ? body.capAmount : null,
        priority: body.priority !== undefined ? body.priority : 0,
        description: body.description || null,
      },
    });
    return c.json(rule, 201);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/transaction-codes/:tcId/rules/:ruleId', requirePermission('update_settings'), async (c) => {
  const tc = await prisma.transactionCode.findUnique({ where: { id: c.req.param('tcId') }, select: { clientId: true } });
  if (!tc) return c.json({ message: 'Transaction code not found' }, 404);
  if (!denyUnlessClient(c, tc)) return c.json({ message: 'Access denied' }, 403);
  try {
    const body = await c.req.json();
    const data: Record<string, unknown> = {};
    if (body.conditionType !== undefined) data.conditionType = body.conditionType;
    if (body.conditionValue !== undefined) data.conditionValue = String(body.conditionValue);
    if (body.calculationOverride !== undefined) data.calculationOverride = body.calculationOverride || null;
    if (body.valueOverride !== undefined) data.valueOverride = body.valueOverride !== null ? parseFloat(body.valueOverride) : null;
    if (body.formulaOverride !== undefined) data.formulaOverride = body.formulaOverride || null;
    if (body.capAmount !== undefined) data.capAmount = body.capAmount !== null ? parseFloat(body.capAmount) : null;
    if (body.priority !== undefined) data.priority = parseInt(body.priority);
    if (body.description !== undefined) data.description = body.description || null;
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

    const rule = await prisma.transactionCodeRule.update({
      where: { id: c.req.param('ruleId') },
      data,
    });
    return c.json(rule);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Rule not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/transaction-codes/:tcId/rules/:ruleId', requirePermission('update_settings'), async (c) => {
  const tc = await prisma.transactionCode.findUnique({ where: { id: c.req.param('tcId') }, select: { clientId: true } });
  if (!tc) return c.json({ message: 'Transaction code not found' }, 404);
  if (!denyUnlessClient(c, tc)) return c.json({ message: 'Access denied' }, 403);
  try {
    await prisma.transactionCodeRule.delete({ where: { id: c.req.param('ruleId') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Rule not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
