import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { denyUnlessClient } from '../lib/ownership';

const router = new Hono();

const createSchema = z.object({
  lowerBound: z.number(),
  upperBound: z.number().nullable().optional(),
  rate: z.number(),
  fixedAmount: z.number().optional(),
});

const updateSchema = z.object({
  lowerBound: z.number().optional(),
  upperBound: z.number().nullable().optional(),
  rate: z.number().optional(),
  fixedAmount: z.number().optional(),
});

router.get('/', async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json([]);
  const where: Record<string, unknown> = { taxTable: { clientId } };
  const bands = await prisma.taxBracket.findMany({
    where,
    orderBy: { lowerBound: 'asc' },
  });
  return c.json(bands);
});

router.post('/', requirePermission('update_settings'), validateBody(createSchema), async (c) => {
  const body = c.req.valid('json');
  const band = await prisma.taxBracket.create({
    data: { ...body, fixedAmount: body.fixedAmount || 0 },
  });
  return c.json(band, 201);
});

router.put('/:id', requirePermission('update_settings'), validateBody(updateSchema), async (c) => {
  const { id } = c.req.param();
  const existing = await prisma.taxBracket.findUnique({
    where: { id },
    include: { taxTable: { select: { clientId: true } } },
  });
  if (!existing) return c.json({ message: 'Tax band not found' }, 404);
  if (!denyUnlessClient(c, existing.taxTable)) return c.json({ message: 'Access denied' }, 403);
  const band = await prisma.taxBracket.update({ where: { id }, data: c.req.valid('json') });
  return c.json(band);
});

router.delete('/:id', requirePermission('update_settings'), async (c) => {
  const { id } = c.req.param();
  const existing = await prisma.taxBracket.findUnique({
    where: { id },
    include: { taxTable: { select: { clientId: true } } },
  });
  if (!existing) return c.json({ message: 'Tax band not found' }, 404);
  if (!denyUnlessClient(c, existing.taxTable)) return c.json({ message: 'Access denied' }, 403);
  await prisma.taxBracket.delete({ where: { id } });
  return c.json({ message: 'Tax band deleted' });
});

export default router;
