import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { validateBody } from '../lib/validate';

const CreateClientSchema = z.object({
  name: z.string().min(1),
  taxId: z.string().optional(),
  defaultCurrency: z.enum(['USD', 'ZiG']).default('USD'),
});

const UpdateClientSchema = z.object({
  name: z.string().min(1).optional(),
  taxId: z.string().optional(),
  defaultCurrency: z.enum(['USD', 'ZiG']).optional(),
  isActive: z.boolean().optional(),
});

const ModulesSchema = z.object({
  modules: z.array(z.string()),
});

const router = new Hono();

function requirePlatformAdmin() {
  return async (c: any, next: any) => {
    const user = c.get('user');
    if (user.role !== 'PLATFORM_ADMIN') return c.json({ message: 'Access denied' }, 403);
    await next();
  };
}

router.get('/', requirePlatformAdmin(), async (c) => {
  const clients = await prisma.client.findMany({
    include: {
      license: { select: { active: true, expiresAt: true } },
      _count: { select: { employees: true, companies: true } },
    },
    orderBy: { name: 'asc' },
  });
  return c.json(clients);
});

router.post('/', requirePlatformAdmin(), validateBody(CreateClientSchema), async (c) => {
  const { name, taxId, defaultCurrency } = c.req.valid('json' as any);
  const client = await prisma.client.create({
    data: { name, taxId, defaultCurrency },
  });
  return c.json(client, 201);
});

router.get('/:id', requirePlatformAdmin(), async (c) => {
  const client = await prisma.client.findUnique({
    where: { id: c.req.param('id') },
    include: { license: true, subscription: true, companies: true, _count: { select: { employees: true } } },
  });
  if (!client) return c.json({ message: 'Client not found' }, 404);
  return c.json(client);
});

router.put('/:id', requirePlatformAdmin(), validateBody(UpdateClientSchema), async (c) => {
  const { name, taxId, defaultCurrency, isActive } = c.req.valid('json' as any);
  try {
    const client = await prisma.client.update({
      where: { id: c.req.param('id') },
      data: { name, taxId, defaultCurrency, isActive },
    });
    return c.json(client);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Client not found' }, 404);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.patch('/:id/modules', requirePlatformAdmin(), validateBody(ModulesSchema), async (c) => {
  const { modules } = c.req.valid('json' as any);
  const client = await prisma.client.update({
    where: { id: c.req.param('id') },
    data: { enabledModules: modules },
    select: { id: true, name: true, enabledModules: true },
  });
  return c.json(client);
});

router.delete('/:id', requirePlatformAdmin(), async (c) => {
  try {
    await prisma.client.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Client not found' }, 404);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
