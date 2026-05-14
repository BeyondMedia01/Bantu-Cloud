import { Hono } from 'hono';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { signToken } from '../lib/auth';

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

router.post('/accept', async (c) => {
  const { token, firstName, lastName, password } = await c.req.json();
  if (!token || !firstName || !lastName || !password) {
    return c.json({ message: 'token, firstName, lastName, and password are required' }, 400);
  }
  if (password.length < 8) return c.json({ message: 'Password must be at least 8 characters' }, 400);

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
