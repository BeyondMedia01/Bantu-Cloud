import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/auth';
import { issueLicense } from '../lib/license';

const router = new Hono();

const setupSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  clientName: z.string().min(1),
});

router.get('/', async (c) => {
  try {
    const admin = await prisma.user.findFirst({ where: { role: 'PLATFORM_ADMIN' } });
    return c.json({ initialized: !!admin });
  } catch (err) {
    console.error('Setup check error:', err);
    return c.json({ message: 'Failed to check setup status' }, 500);
  }
});

router.post('/', validateBody(setupSchema), async (c) => {
  try {
    const { name, email, password, clientName } = c.req.valid('json');

    const existing = await prisma.user.findFirst({ where: { role: 'PLATFORM_ADMIN' } });
    if (existing) {
      return c.json({ message: 'Platform admin already exists' }, 409);
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const client = await prisma.client.create({
      data: { name: clientName, isActive: true },
    });

    const license = await issueLicense(client.id, 10, 120);

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'PLATFORM_ADMIN' },
    });

    const token = await signToken({ userId: user.id, email: user.email, role: user.role, clientId: undefined });

    return c.json({
      token,
      role: user.role,
      clientId: client.id,
      licenseToken: license.token,
      message: 'Platform setup complete',
    }, 201);
  } catch (err: any) {
    if (err.code === 'P2002') {
      return c.json({ message: 'Email already registered' }, 409);
    }
    console.error('Setup error:', err);
    return c.json({ message: 'Setup failed' }, 500);
  }
});

export default router;
