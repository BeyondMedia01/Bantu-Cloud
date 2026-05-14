import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const VALID_SOURCES = ['RBZ', 'MANUAL', 'IMPORT'] as const;

const createRateSchema = z.object({
  fromCurrency: z.string().default('USD'),
  toCurrency: z.string().default('ZiG'),
  rate: z.number().positive(),
  effectiveDate: z.string().min(1),
  source: z.enum(VALID_SOURCES).default('MANUAL'),
  notes: z.string().optional(),
});

const updateRateSchema = z.object({
  rate: z.number().positive().optional(),
  effectiveDate: z.string().optional(),
  source: z.enum(VALID_SOURCES).optional(),
  notes: z.string().nullable().optional(),
});

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const fromCurrency = c.req.query('fromCurrency');
  const toCurrency = c.req.query('toCurrency');
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') || '90') || 90));

  const where: Record<string, unknown> = { companyId };
  if (fromCurrency) where.fromCurrency = fromCurrency;
  if (toCurrency) where.toCurrency = toCurrency;

  const rates = await prisma.currencyRate.findMany({
    where,
    orderBy: { effectiveDate: 'desc' },
    take: limit,
  });
  return c.json(rates);
});

router.get('/latest', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const fromCurrency = c.req.query('fromCurrency') || 'USD';
  const toCurrency = c.req.query('toCurrency') || 'ZiG';

  const rate = await prisma.currencyRate.findFirst({
    where: { companyId, fromCurrency, toCurrency },
    orderBy: { effectiveDate: 'desc' },
  });
  if (!rate) return c.json({ message: 'No rate found. Add a rate under Currency Rates settings.' }, 404);
  return c.json(rate);
});

router.post('/', requirePermission('update_settings'), validateBody(createRateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const body = c.req.valid('json');
  const user = c.get('user');

  const created = await prisma.currencyRate.create({
    data: {
      companyId,
      fromCurrency: body.fromCurrency,
      toCurrency: body.toCurrency,
      rate: body.rate,
      effectiveDate: new Date(body.effectiveDate),
      source: body.source,
      notes: body.notes || null,
      createdBy: user?.email || null,
    },
  });

  await audit({
    c,
    action: 'CURRENCY_RATE_CREATED',
    resource: 'currency_rate',
    resourceId: created.id,
    details: { fromCurrency: body.fromCurrency, toCurrency: body.toCurrency, rate: body.rate, effectiveDate: body.effectiveDate, source: body.source },
  });

  return c.json(created, 201);
});

router.put('/:id', requirePermission('update_settings'), validateBody(updateRateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.currencyRate.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Currency rate not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const body = c.req.valid('json');
  const data: Record<string, unknown> = {};
  if (body.rate !== undefined) data.rate = body.rate;
  if (body.effectiveDate !== undefined) data.effectiveDate = new Date(body.effectiveDate);
  if (body.source !== undefined) data.source = body.source;
  if (body.notes !== undefined) data.notes = body.notes || null;

  const updated = await prisma.currencyRate.update({ where: { id }, data });

  await audit({
    c,
    action: 'CURRENCY_RATE_UPDATED',
    resource: 'currency_rate',
    resourceId: updated.id,
    details: { rate: updated.rate, effectiveDate: updated.effectiveDate, source: updated.source },
  });

  return c.json(updated);
});

router.delete('/:id', requirePermission('update_settings'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.currencyRate.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Currency rate not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.currencyRate.delete({ where: { id } });

  await audit({
    c,
    action: 'CURRENCY_RATE_DELETED',
    resource: 'currency_rate',
    resourceId: id,
    details: { rate: existing.rate, effectiveDate: existing.effectiveDate },
  });

  return c.body(null, 204);
});

export default router;
