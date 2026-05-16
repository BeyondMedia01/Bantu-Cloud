import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import type { TokenPayload } from '../lib/auth';

const router = new Hono();

router.get('/companies', async (c) => {
  const user: TokenPayload = c.get('user');
  const { userId, role, clientId } = user;

  try {
    if (role === 'PLATFORM_ADMIN') {
      const companies = await prisma.company.findMany({
        include: { client: { select: { name: true } } },
        orderBy: { name: 'asc' },
      });
      return c.json(companies);
    }

    if (role === 'CLIENT_ADMIN') {
      const companies = await prisma.company.findMany({
        where: { clientId },
        orderBy: { name: 'asc' },
      });
      return c.json(companies);
    }

    if (role === 'EMPLOYEE') {
      const emp = await prisma.employee.findUnique({ where: { userId } });
      if (!emp) return c.json([]);
      const company = await prisma.company.findUnique({ where: { id: emp.companyId } });
      return c.json(company ? [company] : []);
    }

    return c.json([]);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/me', async (c) => {
  const user: TokenPayload = c.get('user');
  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.userId },
      select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, role: true, createdAt: true, preferences: true },
    });
    if (!dbUser) return c.json({ message: 'User not found' }, 404);
    return c.json(dbUser);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const updateProfileSchema = z.object({
  name: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  phone: z.string().nullable().optional(),
  preferences: z.any().optional(),
});

router.put('/me', validateBody(updateProfileSchema), async (c) => {
  const user: TokenPayload = c.get('user');
  try {
    const body = c.req.valid('json');
    const data: Record<string, unknown> = {};

    if (body.firstName !== undefined) {
      data.firstName = body.firstName.trim();
      data.lastName = (body.lastName || '').trim();
      data.name = `${data.firstName} ${data.lastName}`.trim();
    } else if (body.name !== undefined) {
      data.name = body.name.trim();
    }
    if (body.phone !== undefined) data.phone = body.phone?.trim() || null;
    if (body.preferences !== undefined) data.preferences = body.preferences;

    const updated = await prisma.user.update({
      where: { id: user.userId },
      data,
      select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, role: true, createdAt: true, preferences: true },
    });
    return c.json(updated);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

router.put('/change-password', validateBody(changePasswordSchema), async (c) => {
  const user: TokenPayload = c.get('user');
  try {
    const { currentPassword, newPassword } = c.req.valid('json');
    const dbUser = await prisma.user.findUnique({ where: { id: user.userId } });
    if (!dbUser) return c.json({ message: 'User not found' }, 404);

    const valid = await bcrypt.compare(currentPassword, dbUser.password);
    if (!valid) return c.json({ message: 'Current password is incorrect' }, 400);

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.userId }, data: { password: hashedPassword } });
    await prisma.session.deleteMany({ where: { userId: user.userId } });
    return c.json({ message: 'Password updated successfully. All other sessions have been logged out.' });
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
