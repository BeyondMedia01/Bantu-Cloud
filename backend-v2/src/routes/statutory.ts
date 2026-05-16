import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, cache } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { denyUnlessClient } from '../lib/ownership';

const router = new Hono();

router.get('/tax-tables', async (c) => {
  try {
    const clientId = c.get('clientId');
    if (!clientId) return c.json([]);
    const where: Record<string, unknown> = { clientId };
    const tables = await prisma.taxTable.findMany({ where, include: { brackets: { orderBy: { lowerBound: 'asc' } } }, orderBy: { effectiveDate: 'desc' } });
    return c.json(tables);
  } catch (err: any) {
    console.error('[tax-tables GET]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const createTaxTableSchema = z.object({
  name: z.string().min(1),
  currency: z.string().optional(),
  effectiveDate: z.string().min(1),
  expiryDate: z.string().optional(),
  isAnnual: z.boolean().optional(),
});

const updateTaxTableSchema = createTaxTableSchema.partial();

const BracketSchema = z.object({
  lowerBound: z.number().nonnegative(),
  upperBound: z.number().nonnegative().nullable().optional(),
  rate: z.number().min(0).max(100),
  fixedAmount: z.number().nonnegative().optional().default(0),
});

const ReplaceBracketsSchema = z.object({
  brackets: z.array(BracketSchema).min(1),
});

router.post('/tax-tables', requirePermission('update_settings'), validateBody(createTaxTableSchema), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  const table = await prisma.taxTable.create({
    data: {
      clientId,
      name: c.req.valid('json').name,
      currency: c.req.valid('json').currency || 'USD',
      effectiveDate: new Date(c.req.valid('json').effectiveDate),
      expiryDate: c.req.valid('json').expiryDate ? new Date(c.req.valid('json').expiryDate) : null,
      isAnnual: c.req.valid('json').isAnnual !== false,
    },
  });
  return c.json(table, 201);
});

router.get('/tax-tables/:id', async (c) => {
  const table = await prisma.taxTable.findUnique({
    where: { id: c.req.param('id') },
    include: { brackets: { orderBy: { lowerBound: 'asc' } } },
  });
  if (!table) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  return c.json(table);
});

router.put('/tax-tables/:id', requirePermission('update_settings'), validateBody(updateTaxTableSchema), async (c) => {
  const existing = await prisma.taxTable.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);
  try {
    const body = c.req.valid('json' as any);
    const table = await prisma.taxTable.update({
      where: { id: c.req.param('id') },
      data: {
        ...body,
        effectiveDate: body.effectiveDate ? new Date(body.effectiveDate) : undefined,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined,
      },
    });
    return c.json(table);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Tax table not found' }, 404);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/tax-tables/:id', requirePermission('update_settings'), async (c) => {
  const existing = await prisma.taxTable.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);
  try {
    await prisma.taxTable.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Tax table not found' }, 404);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.patch('/tax-tables/:id/activate', requirePermission('update_settings'), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);
  const existing = await prisma.taxTable.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);
  await prisma.taxTable.updateMany({ where: { clientId }, data: { isActive: false } });
  const table = await prisma.taxTable.update({ where: { id: c.req.param('id') }, data: { isActive: true } });
  return c.json(table);
});

router.get('/tax-tables/:id/brackets', async (c) => {
  const table = await prisma.taxTable.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!table) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  const brackets = await prisma.taxBracket.findMany({
    where: { taxTableId: c.req.param('id') },
    orderBy: { lowerBound: 'asc' },
  });
  return c.json(brackets);
});

router.post('/tax-tables/:id/brackets', requirePermission('update_settings'), validateBody(BracketSchema), async (c) => {
  const taxTableId = c.req.param('id')!;
  const table = await prisma.taxTable.findUnique({ where: { id: taxTableId }, select: { clientId: true } });
  if (!table) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  try {
    const { lowerBound, upperBound, rate, fixedAmount } = c.req.valid('json' as any);
    const bracket = await prisma.taxBracket.create({
      data: { taxTableId, lowerBound, upperBound: upperBound ?? null, rate, fixedAmount: fixedAmount || 0 },
    });
    return c.json(bracket, 201);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/tax-tables/:id/brackets/:bracketId', requirePermission('update_settings'), validateBody(BracketSchema), async (c) => {
  const table = await prisma.taxTable.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!table) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  try {
    const { lowerBound, upperBound, rate, fixedAmount } = c.req.valid('json' as any);
    const bracket = await prisma.taxBracket.update({
      where: { id: c.req.param('bracketId') },
      data: { lowerBound, upperBound: upperBound ?? null, rate, fixedAmount: fixedAmount || 0 },
    });
    return c.json(bracket);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Bracket not found' }, 404);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/tax-tables/:id/brackets/:bracketId', requirePermission('update_settings'), async (c) => {
  const table = await prisma.taxTable.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!table) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  try {
    await prisma.taxBracket.delete({ where: { id: c.req.param('bracketId') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Bracket not found' }, 404);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/tax-tables/:id/upload', requirePermission('update_settings'), async (c) => {
  const id = c.req.param('id');
  if (!id) return c.json({ message: 'Tax table ID required' }, 400);
  const table = await prisma.taxTable.findUnique({ where: { id }, select: { clientId: true } });
  if (!table) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  try {
    const fd = await c.req.formData();
    const file = fd.get('file');
    if (!file || typeof (file as any).text !== 'function') return c.json({ message: 'File is required' }, 400);

    const text: string = await (file as any).text();
    const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
    if (lines.length < 2) return c.json({ message: 'CSV must have a header row and at least one data row' }, 400);

    const brackets = lines.slice(1).map((line: string) => {
      const cols = line.split(',').map((s: string) => s.trim());
      return {
        lowerBound: parseFloat(cols[0]),
        upperBound: cols[1] ? parseFloat(cols[1]) : null,
        rate: parseFloat(cols[2]),
        fixedAmount: cols[3] ? parseFloat(cols[3]) : 0,
      };
    }).filter((b: { lowerBound: number; rate: number }) => !isNaN(b.lowerBound) && !isNaN(b.rate));

    if (brackets.length === 0) return c.json({ message: 'No valid brackets found in file. Expected columns: lowerBound, upperBound, rate, fixedAmount' }, 400);

    await prisma.taxBracket.deleteMany({ where: { taxTableId: id } });
    for (const b of brackets as { lowerBound: number; upperBound: number | null; rate: number; fixedAmount: number }[]) {
      await prisma.taxBracket.create({ data: { taxTableId: id, ...b } });
    }
    return c.json({ imported: brackets.length });
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/tax-tables/:id/brackets/replace', requirePermission('update_settings'), validateBody(ReplaceBracketsSchema), async (c) => {
  const table = await prisma.taxTable.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!table) return c.json({ message: 'Tax table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  const taxTableId = c.req.param('id')!;
  try {
    const { brackets } = c.req.valid('json' as any);
    await prisma.taxBracket.deleteMany({ where: { taxTableId } });
    for (const b of brackets) {
      await prisma.taxBracket.create({ data: { taxTableId, lowerBound: b.lowerBound, upperBound: b.upperBound ?? null, rate: b.rate, fixedAmount: b.fixedAmount || 0 } });
    }
    const all = await prisma.taxBracket.findMany({ where: { taxTableId }, orderBy: { lowerBound: 'asc' } });
    return c.json(all);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/current-rate', async (c) => {
  const companyId = c.get('companyId');
  const where: Record<string, unknown> = {};
  if (companyId) where.companyId = companyId;
  const rate = await prisma.currencyRate.findFirst({ where, orderBy: { effectiveDate: 'desc' } });
  if (!rate && companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (company) {
      const existing = await prisma.currencyRate.findFirst({ orderBy: { effectiveDate: 'desc' } });
      return c.json(existing || null);
    }
  }
  return c.json(rate || null);
});

export default router;
