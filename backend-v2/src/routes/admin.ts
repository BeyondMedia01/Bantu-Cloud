import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requireRole } from '../lib/auth';
import { getSettingAsString } from '../services/settings.service';

const router = new Hono();
const adminOnly = requireRole('PLATFORM_ADMIN');

const createUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'EMPLOYEE']),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
});

const updateUserRoleSchema = z.object({
  role: z.enum(['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'EMPLOYEE']),
});

const updateSettingSchema = z.object({
  settingName: z.string().min(1).max(100),
  settingValue: z.union([z.string(), z.number(), z.boolean()]),
  dataType: z.enum(['TEXT', 'NUMBER', 'BOOLEAN', 'JSON']).optional(),
  description: z.string().max(500).optional(),
});

router.get('/my-role', async (c) => {
  const user = c.get('user') as any;
  return c.json({ userId: user?.userId, role: user?.role });
});

router.get('/debug-role', async (c) => {
  const email = c.req.query('email');
  if (!email) return c.json({ error: 'email required' }, 400);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
  return c.json(user || { notFound: true });
});

router.post('/check-email', async (c) => {
  const { email } = await c.req.json();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });
  return c.json(user || { notFound: true });
});


router.get('/users', adminOnly, async (c) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(users);
});

router.post('/users', adminOnly, validateBody(createUserSchema), async (c) => {
  try {
    const { name, email, password, role } = c.req.valid('json');
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return c.json(user, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ message: 'Email already registered' }, 409);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/users/:id', adminOnly, async (c) => {
  const user = await prisma.user.findUnique({
    where: { id: c.req.param('id') },
    select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
  });
  if (!user) return c.json({ message: 'User not found' }, 404);
  return c.json(user);
});

router.put('/users/:id', adminOnly, validateBody(updateUserSchema), async (c) => {
  try {
    const { name, email } = c.req.valid('json');
    const user = await prisma.user.update({
      where: { id: c.req.param('id') },
      data: { name, email },
      select: { id: true, name: true, email: true, role: true },
    });
    return c.json(user);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'User not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/users/:id/role', adminOnly, validateBody(updateUserRoleSchema), async (c) => {
  try {
    const { role } = c.req.valid('json');
    const user = await prisma.user.update({
      where: { id: c.req.param('id') },
      data: { role },
      select: { id: true, role: true },
    });
    return c.json(user);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'User not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/users/:id', adminOnly, async (c) => {
  try {
    await prisma.user.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'User not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/settings', adminOnly, async (c) => {
  const settings = await prisma.systemSetting.findMany({
    where: { isActive: true },
    orderBy: [{ settingName: 'asc' }, { effectiveFrom: 'desc' }],
  });
  return c.json(settings);
});

router.put('/settings', adminOnly, validateBody(updateSettingSchema), async (c) => {
  try {
    const { settingName, settingValue, dataType, description } = c.req.valid('json');

    const user = c.get('user');
    await prisma.systemSetting.updateMany({
      where: { settingName, isActive: true },
      data: { isActive: false },
    });

    const setting = await prisma.systemSetting.create({
      data: {
        settingName,
        settingValue: String(settingValue),
        dataType: dataType || 'TEXT',
        description,
        lastUpdatedBy: user.userId,
        isActive: true,
      },
    });
    return c.json(setting);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/stats', adminOnly, async (c) => {
  const [clientCount, userCount, employeeCount, activeLicenseCount, settingCount] = await Promise.all([
    prisma.client.count(),
    prisma.user.count(),
    prisma.employee.count(),
    prisma.licenseToken.count({ where: { active: true } }),
    prisma.systemSetting.count(),
  ]);
  const aidsLevyRate = await getSettingAsString('AIDS_LEVY_RATE');
  return c.json({ clientCount, userCount, employeeCount, activeLicenseCount, settingCount, aidsLevyRate });
});

router.get('/logs', adminOnly, async (c) => {
  const action = c.req.query('action');
  const resource = c.req.query('resource');
  const resourceId = c.req.query('resourceId');
  const userEmail = c.req.query('userEmail');
  const dateFrom = c.req.query('dateFrom');
  const dateTo = c.req.query('dateTo');
  const page = Math.max(1, parseInt(c.req.query('page') || '1') || 1);
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') || '50') || 50));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  if (action) where.action = { contains: action, mode: 'insensitive' };
  if (resource) where.resource = { contains: resource, mode: 'insensitive' };
  if (resourceId) where.resourceId = resourceId;
  if (userEmail) where.userEmail = { contains: userEmail, mode: 'insensitive' };
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) (where.createdAt as Record<string, unknown>).gte = new Date(dateFrom);
    if (dateTo) (where.createdAt as Record<string, unknown>).lte = new Date(dateTo);
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: limit }),
    prisma.auditLog.count({ where }),
  ]);
  return c.json({ logs, total, page, limit });
});


router.get('/licenses', adminOnly, async (c) => {
  const licenses = await prisma.licenseToken.findMany({
    include: { client: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(licenses);
});

export default router;
