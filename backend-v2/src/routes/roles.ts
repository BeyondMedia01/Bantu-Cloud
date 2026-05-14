import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  permissions: z.array(z.object({ module: z.string(), actions: z.array(z.string()) })).optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  permissions: z.array(z.object({ module: z.string(), actions: z.array(z.string()) })).optional(),
});

const assignSchema = z.object({
  userId: z.string().min(1),
  roleIds: z.array(z.string()).min(1),
});

async function assertCompanyOwnership(c: any, companyId: string): Promise<boolean> {
  const user = c.get('user');
  if (user.role === 'PLATFORM_ADMIN') return true;
  const clientId = c.get('clientId');
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { clientId: true },
  });
  if (!company || company.clientId !== clientId) {
    return false;
  }
  return true;
}

router.get('/', async (c) => {
  const companyId = c.req.query('companyId');
  if (!companyId) return c.json({ message: 'companyId is required' }, 400);
  if (!await assertCompanyOwnership(c, companyId)) return c.json({ message: 'Access denied' }, 403);

  const roles = await prisma.role.findMany({
    where: { companyId },
    include: { RoleModulePermission: true, _count: { select: { UserCompanyRole: true } } },
    orderBy: { name: 'asc' },
  });
  return c.json(roles);
});

router.post('/', validateBody(createRoleSchema), async (c) => {
  const { name, description, permissions } = c.req.valid('json');
  const companyId = c.req.query('companyId') || (c.req.header('x-company-id'));
  if (!companyId) return c.json({ message: 'companyId is required' }, 400);
  if (!await assertCompanyOwnership(c, companyId)) return c.json({ message: 'Access denied' }, 403);

  try {
    const role = await prisma.role.create({
      data: {
        id: uuid(),
        companyId,
        name: name.trim(),
        description: description?.trim() || null,
        updatedAt: new Date(),
        RoleModulePermission: permissions?.length
          ? { create: permissions.map(({ module, actions }: { module: string; actions: string[] }) => ({ id: uuid(), module, actions })) }
          : undefined,
      },
      include: { RoleModulePermission: true },
    });
    return c.json(role, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ message: 'A role with that name already exists' }, 409);
    throw err;
  }
});

router.put('/:id', validateBody(updateRoleSchema), async (c) => {
  const { id } = c.req.param();
  const { name, description, permissions } = c.req.valid('json');

  const existing = await prisma.role.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return c.json({ message: 'Role not found' }, 404);
  if (!await assertCompanyOwnership(c, existing.companyId)) return c.json({ message: 'Access denied' }, 403);

  if (permissions !== undefined) {
    await prisma.roleModulePermission.deleteMany({ where: { roleId: id } });
    if (permissions.length > 0) {
      for (const { module, actions } of permissions as { module: string; actions: string[] }[]) {
        await prisma.roleModulePermission.create({ data: { id: uuid(), roleId: id, module: module as any, actions: { set: actions as any[] }, updatedAt: new Date() } });
      }
    }
  }
  await prisma.role.update({
    where: { id },
    data: {
      ...(name && { name: name.trim() }),
      ...(description !== undefined && { description: description?.trim() || null }),
    },
  });
  const role = await prisma.role.findUnique({ where: { id }, include: { RoleModulePermission: true } });
  return c.json(role);
});

router.delete('/:id', async (c) => {
  const { id } = c.req.param();
  const existing = await prisma.role.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return c.json({ message: 'Role not found' }, 404);
  if (!await assertCompanyOwnership(c, existing.companyId)) return c.json({ message: 'Access denied' }, 403);

  await prisma.role.delete({ where: { id } });
  return c.json({ message: 'Role deleted' });
});

router.get('/users', async (c) => {
  const companyId = c.req.query('companyId');
  if (!companyId) return c.json({ message: 'companyId is required' }, 400);
  if (!await assertCompanyOwnership(c, companyId)) return c.json({ message: 'Access denied' }, 403);

  const assignments = await prisma.userCompanyRole.findMany({
    where: { companyId },
    include: {
      User: { select: { id: true, firstName: true, lastName: true, email: true } },
      Role: { select: { id: true, name: true } },
    },
  });

  const byUser: Record<string, any> = {};
  for (const { User, Role } of assignments) {
    if (!byUser[User.id]) byUser[User.id] = { ...User, roles: [] };
    byUser[User.id].roles.push(Role);
  }
  return c.json(Object.values(byUser));
});

router.post('/assign', validateBody(assignSchema), async (c) => {
  const { userId, roleIds } = c.req.valid('json');
  const companyId = c.req.query('companyId') || (c.req.header('x-company-id'));
  if (!companyId) return c.json({ message: 'companyId is required' }, 400);
  if (!await assertCompanyOwnership(c, companyId)) return c.json({ message: 'Access denied' }, 403);

  const validRoles = await prisma.role.findMany({
    where: { id: { in: roleIds }, companyId },
    select: { id: true },
  });
  if (validRoles.length !== roleIds.length) {
    return c.json({ message: 'One or more roleIds are invalid for this company' }, 400);
  }

  await prisma.userCompanyRole.deleteMany({ where: { userId, companyId } });
  for (const roleId of roleIds as string[]) {
    await prisma.userCompanyRole.create({ data: { id: uuid(), userId, companyId, roleId } });
  }
  return c.json({ message: 'Roles assigned' });
});

export default router;
