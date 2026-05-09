const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const bcrypt = require('bcryptjs');
const { signToken } = require('../lib/auth');

// ── Validate invite token (public) ───────────────────────────────────────────

router.get('/:token', async (req, res) => {
  try {
    const invite = await prisma.invite.findUnique({
      where: { token: req.params.token },
      include: { company: { select: { name: true } } },
    });

    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.status !== 'PENDING') return res.status(410).json({ message: 'Invite already used or cancelled' });
    if (invite.expiresAt < new Date()) return res.status(410).json({ message: 'Invite has expired' });

    res.json({ email: invite.email, companyName: invite.company.name, companyId: invite.companyId });
  } catch (err) {
    console.error('GET /public-invites/validate:', err);
    res.status(500).json({ message: 'Failed to validate invite' });
  }
});

// ── Accept invite — set password and create user account (public) ─────────────

router.post('/', async (req, res) => {
  const { token, firstName, lastName, password } = req.body;
  if (!token || !firstName || !lastName || !password) {
    return res.status(400).json({ message: 'token, firstName, lastName, and password are required' });
  }
  if (password.length < 8) return res.status(400).json({ message: 'Password must be at least 8 characters' });

  try {
    const invite = await prisma.invite.findUnique({ where: { token } });

    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (invite.status !== 'PENDING') return res.status(410).json({ message: 'Invite already used or cancelled' });
    if (invite.expiresAt < new Date()) return res.status(410).json({ message: 'Invite has expired' });

    const hashedPassword = await bcrypt.hash(password, 12);

    const { user } = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`,
          email: invite.email,
          password: hashedPassword,
          role: 'COMPANY_USER',
        },
      });

      await tx.userCompanyRole.createMany({
        data: invite.roleIds.map((roleId) => ({
          userId: user.id,
          companyId: invite.companyId,
          roleId,
        })),
      });

      await tx.invite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });

      return { user };
    });

    const jwtToken = await signToken({
      userId: user.id,
      role: user.role,
      companyId: invite.companyId,
    });

    res.status(201).json({ token: jwtToken, role: user.role, companyId: invite.companyId });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'An account with this email already exists' });
    console.error('POST /public-invites/accept:', err);
    res.status(500).json({ message: 'Failed to accept invite' });
  }
});

module.exports = router;
