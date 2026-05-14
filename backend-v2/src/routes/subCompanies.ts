import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createSubCompanySchema = z.object({
  name: z.string().min(1),
});

const updateSubCompanySchema = z.object({
  name: z.string().min(1).optional(),
});

router.get('/', async (c) => {
  const clientId = c.get('clientId');
  const subCompanies = await prisma.subCompany.findMany({
    where: clientId ? { clientId } : undefined,
    include: { branches: true },
    orderBy: { name: 'asc' },
  });
  return c.json(subCompanies);
});

router.post('/', requirePermission('manage_companies'), validateBody(createSubCompanySchema), async (c) => {
  const { name } = c.req.valid('json');
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client not found' }, 400);

  const sub = await prisma.subCompany.create({
    data: { id: uuid(), clientId, name: name.trim() },
  });
  return c.json(sub, 201);
});

router.put('/:id', requirePermission('manage_companies'), validateBody(updateSubCompanySchema), async (c) => {
  const { id } = c.req.param();
  const { name } = c.req.valid('json');
  const clientId = c.get('clientId');

  const existing = await prisma.subCompany.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'SubCompany not found' }, 404);
  if (clientId && existing.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);

  const sub = await prisma.subCompany.update({
    where: { id },
    data: { ...(name && { name: name.trim() }) },
  });
  return c.json(sub);
});

router.delete('/:id', requirePermission('manage_companies'), async (c) => {
  const { id } = c.req.param();
  const clientId = c.get('clientId');

  const existing = await prisma.subCompany.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'SubCompany not found' }, 404);
  if (clientId && existing.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);

  await prisma.subCompany.delete({ where: { id } });
  return c.json({ message: 'SubCompany deleted' });
});

export default router;
