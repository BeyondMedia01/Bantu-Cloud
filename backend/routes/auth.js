const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../lib/prisma');
const { signToken } = require('../lib/auth');
const { validateLicense } = require('../lib/license');
const { sendPasswordReset } = require('../lib/mailer');

const router = express.Router();

// POST /api/auth/register — CLIENT_ADMIN registration with license token
router.post('/register', async (req, res) => {
  const { name, email, password, licenseToken } = req.body;

  if (!name || !email || !password || !licenseToken) {
    return res.status(400).json({ message: 'name, email, password, and licenseToken are required' });
  }

  // Point #11: Add email format validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  // Point #2: Add password length/complexity check
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  const { valid, license, reason } = await validateLicense(licenseToken);
  if (!valid) return res.status(400).json({ message: `Invalid license: ${reason}` });

  // Point #6: Prevent license token reuse for multiple registrations
  const existingAdmin = await prisma.clientAdmin.findFirst({ where: { clientId: license.clientId } });
  if (existingAdmin) return res.status(403).json({ message: 'A client admin already exists for this license' });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: 'CLIENT_ADMIN',
        clientAdmin: { create: { clientId: license.clientId } },
      },
    });

    const token = await signToken({ userId: user.id, role: user.role, clientId: license.clientId });
    res.status(201).json({ token, role: user.role, clientId: license.clientId });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        clientAdmin: true,
        employee: { select: { id: true, companyId: true, clientId: true } },
      },
    });

    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    const clientId = user.clientAdmin?.clientId ?? user.employee?.clientId ?? null;
    const companyId = user.employee?.companyId ?? null;
    const employeeId = user.employee?.id ?? null;

    const token = await signToken({ userId: user.id, role: user.role, clientId });
    // Point #12: Null-guard for user.name
    res.json({ token, role: user.role, clientId, companyId, employeeId, name: user.name ?? 'User' });
  } catch (error) {
    console.error('Login error details:', {
      message: error.message,
      code: error.code,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
    res.status(500).json({ message: 'Login failed' });
  }
});

// POST /api/auth/forgot-password
// Generates a reset token and emails a link. Always returns 200 to prevent
// email enumeration — callers can't tell if the address exists or not.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'email is required' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      // Point #5: Store hashed reset token
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: hashedToken, passwordResetExpiry: expiry },
      });

      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${rawToken}`;
      await sendPasswordReset(email, resetUrl);
    }
    res.json({ message: 'If that email is registered, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Failed to process request' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ message: 'token and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    // Point #5: Hash incoming token to compare
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await prisma.user.findUnique({ where: { passwordResetToken: hashedToken } });

    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
          passwordResetToken: null,
          passwordResetExpiry: null,
        },
      }),
      // Point #3: Invalidate all existing sessions (revokes existing JWTs)
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    res.json({ message: 'Password updated successfully. All other devices have been logged out. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

module.exports = router;
