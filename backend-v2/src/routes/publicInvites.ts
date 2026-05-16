import { Hono } from 'hono';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/auth';
import { validateBody } from '../lib/validate';

const AcceptInviteSchema = z.object({
  token: z.string().min(1),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const router = new Hono();

router.get('/validate/:token', async (c) => {
  try {
    const invite = await prisma.invite.findUnique({
      where: { token: c.req.param('token') },
      include: { Company: { select: { name: true } } },
    });

    if (!invite) return c.json({ message: 'Invite not found' }, 404);
    if (invite.status !== 'PENDING') return c.json({ message: 'Invite already used or cancelled' }, 410);
    if (invite.expiresAt < new Date()) return c.json({ message: 'Invite has expired' }, 410);

    return c.json({ email: invite.email, companyName: invite.Company.name, companyId: invite.companyId });
  } catch (err) {
    console.error('GET /public-invites:', err);
    return c.json({ message: 'Failed to validate invite' }, 500);
  }
});

router.post('/accept', validateBody(AcceptInviteSchema), async (c) => {
  const { token, firstName, lastName, password } = c.req.valid('json' as any);

  try {
    const invite = await prisma.invite.findUnique({ where: { token } });
    if (!invite) return c.json({ message: 'Invite not found' }, 404);
    if (invite.status !== 'PENDING') return c.json({ message: 'Invite already used or cancelled' }, 410);
    if (invite.expiresAt < new Date()) return c.json({ message: 'Invite has expired' }, 410);

    const hashedPassword = await bcrypt.hash(password, 12);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        email: invite.email,
        password: hashedPassword,
        role: 'COMPANY_USER',
      },
    });

    for (const roleId of invite.roleIds) {
      await prisma.userCompanyRole.create({
        data: { id: crypto.randomUUID(), userId: user.id, companyId: invite.companyId, roleId },
      });
    }

    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });

    const jwtToken = await signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      companyId: invite.companyId,
    });

    return c.json({ token: jwtToken, role: user.role, companyId: invite.companyId }, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ message: 'An account with this email already exists' }, 409);
    console.error('POST /public-invites:', err);
    return c.json({ message: 'Failed to accept invite' }, 500);
  }
});

export default router;
