import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, cache } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { denyUnlessClient } from '../lib/ownership';

const router = new Hono();

const createNecTableSchema = z.object({
  name: z.string().min(1),
  sector: z.string().min(1),
  currency: z.string().optional(),
  effectiveDate: z.string().min(1),
  expiryDate: z.string().optional(),
});

const updateNecTableSchema = z.object({
  name: z.string().min(1).optional(),
  sector: z.string().min(1).optional(),
  currency: z.string().optional(),
  effectiveDate: z.string().optional(),
  expiryDate: z.string().nullable().optional(),
});

const createGradeSchema = z.object({
  gradeCode: z.string().min(1),
  description: z.string().optional(),
  minRate: z.number(),
  necLevyRate: z.number().optional(),
});

const updateGradeSchema = z.object({
  gradeCode: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  minRate: z.number().optional(),
  necLevyRate: z.number().optional(),
});

router.get('/', async (c) => {
  try {
    const clientId = c.get('clientId');
    if (!clientId) return c.json([]);
    const where: Record<string, unknown> = { clientId };
    if (c.req.query('sector')) where.sector = c.req.query('sector');
    if (c.req.query('currency')) where.currency = c.req.query('currency');
    const tables = await prisma.necTable.findMany({ where, include: { grades: { orderBy: { gradeCode: 'asc' } }, _count: { select: { grades: true } } }, orderBy: { effectiveDate: 'desc' } });
    return c.json(tables);
  } catch (err: any) {
    console.error('[nec-tables GET]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/:id', async (c) => {
  const { id } = c.req.param();
  const table = await prisma.necTable.findUnique({
    where: { id },
    include: { grades: { orderBy: { gradeCode: 'asc' } } },
  });
  if (!table) return c.json({ message: 'NEC table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  return c.json(table);
});

router.post('/', requirePermission('update_settings'), validateBody(createNecTableSchema), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  const body = c.req.valid('json');
  const table = await prisma.necTable.create({
    data: {
      clientId,
      name: body.name,
      sector: body.sector,
      currency: body.currency || 'USD',
      effectiveDate: new Date(body.effectiveDate),
      expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
    },
  });
  return c.json(table, 201);
});

router.put('/:id', requirePermission('update_settings'), validateBody(updateNecTableSchema), async (c) => {
  const { id } = c.req.param();
  const existing = await prisma.necTable.findUnique({ where: { id }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'NEC table not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);

  const body = c.req.valid('json');
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.sector !== undefined) data.sector = body.sector;
  if (body.currency !== undefined) data.currency = body.currency;
  if (body.effectiveDate !== undefined) data.effectiveDate = new Date(body.effectiveDate);
  if (body.expiryDate !== undefined) data.expiryDate = body.expiryDate ? new Date(body.expiryDate) : null;

  try {
    const table = await prisma.necTable.update({ where: { id }, data });
    return c.json(table);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'NEC table not found' }, 404);
    throw err;
  }
});

router.delete('/:id', requirePermission('update_settings'), async (c) => {
  const { id } = c.req.param();
  const existing = await prisma.necTable.findUnique({ where: { id }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'NEC table not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);
  try {
    await prisma.necTable.delete({ where: { id } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'NEC table not found' }, 404);
    throw err;
  }
});

router.get('/:id/grades', async (c) => {
  const { id } = c.req.param();
  const table = await prisma.necTable.findUnique({ where: { id }, select: { clientId: true } });
  if (!table) return c.json({ message: 'NEC table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  const grades = await prisma.necGrade.findMany({
    where: { necTableId: id },
    orderBy: { gradeCode: 'asc' },
  });
  return c.json(grades);
});

router.post('/:id/grades', requirePermission('update_settings'), validateBody(createGradeSchema), async (c) => {
  const { id } = c.req.param();
  const table = await prisma.necTable.findUnique({ where: { id }, select: { clientId: true } });
  if (!table) return c.json({ message: 'NEC table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  const body = c.req.valid('json');
  const grade = await prisma.necGrade.create({
    data: {
      necTableId: id,
      gradeCode: body.gradeCode,
      description: body.description || null,
      minRate: body.minRate,
      necLevyRate: body.necLevyRate ?? 0,
    },
  });
  return c.json(grade, 201);
});

router.put('/:tableId/grades/:gradeId', requirePermission('update_settings'), validateBody(updateGradeSchema), async (c) => {
  const { tableId, gradeId } = c.req.param();
  const table = await prisma.necTable.findUnique({ where: { id: tableId }, select: { clientId: true } });
  if (!table) return c.json({ message: 'NEC table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  const body = c.req.valid('json');
  const data: Record<string, unknown> = {};
  if (body.gradeCode !== undefined) data.gradeCode = body.gradeCode;
  if (body.description !== undefined) data.description = body.description || null;
  if (body.minRate !== undefined) data.minRate = body.minRate;
  if (body.necLevyRate !== undefined) data.necLevyRate = body.necLevyRate;

  try {
    const grade = await prisma.necGrade.update({ where: { id: gradeId }, data });
    return c.json(grade);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'NEC grade not found' }, 404);
    throw err;
  }
});

router.delete('/:tableId/grades/:gradeId', requirePermission('update_settings'), async (c) => {
  const { tableId, gradeId } = c.req.param();
  const table = await prisma.necTable.findUnique({ where: { id: tableId }, select: { clientId: true } });
  if (!table) return c.json({ message: 'NEC table not found' }, 404);
  if (!denyUnlessClient(c, table)) return c.json({ message: 'Access denied' }, 403);
  try {
    await prisma.necGrade.delete({ where: { id: gradeId } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'NEC grade not found' }, 404);
    throw err;
  }
});

export default router;
