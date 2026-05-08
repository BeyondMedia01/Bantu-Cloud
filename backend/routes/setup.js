const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const prisma = require('../lib/prisma');
const { signToken } = require('../lib/auth');
const { issueLicense, validateLicense } = require('../lib/license');

const router = express.Router();

const setupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many setup attempts, please try again later.' },
});

// GET /api/setup — Check if setup is required.
// Desktop: looks for a CLIENT_ADMIN (the only role that exists on the desktop app).
// Cloud:   looks for a PLATFORM_ADMIN.
router.get('/', async (req, res) => {
  try {
    const role = process.env.APP_MODE === 'desktop' ? 'CLIENT_ADMIN' : 'PLATFORM_ADMIN';
    const admin = await prisma.user.findFirst({ where: { role } });
    res.json({ initialized: !!admin, mode: process.env.APP_MODE === 'desktop' ? 'desktop' : 'cloud' });
  } catch (error) {
    console.error('Setup check error:', error);
    res.status(500).json({ message: 'Failed to check setup status' });
  }
});

// POST /api/setup — One-time PLATFORM_ADMIN creation.
// Fails if a PLATFORM_ADMIN already exists.
router.post('/', setupLimiter, async (req, res) => {
  const { name, email, password, clientName } = req.body;

  if (!name || !email || !password || !clientName) {
    return res.status(400).json({ message: 'name, email, password, and clientName are required' });
  }

  try {
    const existing = await prisma.user.findFirst({ where: { role: 'PLATFORM_ADMIN' } });
    if (existing) {
      return res.status(409).json({ message: 'Platform admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const client = await prisma.client.create({
      data: { name: clientName, isActive: true },
    });

    const license = await issueLicense(client.id, clientName, 10, 120); // 10-year, 10-employee internal license

    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword, role: 'PLATFORM_ADMIN' },
    });

    const token = await signToken({ userId: user.id, role: user.role, clientId: null });
    res.status(201).json({
      token,
      role: user.role,
      clientId: client.id,
      licenseToken: license.token,
      message: 'Platform setup complete',
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    console.error('Setup error:', error);
    res.status(500).json({ message: 'Setup failed' });
  }
});

// POST /api/setup/desktop — Desktop-only first-time onboarding.
// Validates a tb_ license token offline, then creates the CLIENT_ADMIN account
// and Client record so the user can start working immediately without internet.
// Blocked if any CLIENT_ADMIN already exists (one-time only).
router.post('/desktop', async (req, res) => {
  if (process.env.APP_MODE !== 'desktop') {
    return res.status(404).json({ message: 'Not found' });
  }

  const { licenseToken, firstName, lastName, email, password } = req.body;

  if (!licenseToken || !firstName || !lastName || !email || !password) {
    return res.status(400).json({ message: 'licenseToken, firstName, lastName, email, and password are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  // One-time only
  const existing = await prisma.user.findFirst({ where: { role: 'CLIENT_ADMIN' } });
  if (existing) {
    return res.status(409).json({ message: 'This app is already set up. Please log in.' });
  }

  // Validate tb_ token offline — reads employeeCap + clientId from the JWT itself
  const { valid, license, reason } = await validateLicense(licenseToken);
  if (!valid) return res.status(400).json({ message: reason });

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    // Ensure Client record exists locally (clientId comes from the token)
    await prisma.client.upsert({
      where: { id: license.clientId },
      update: {},
      create: { id: license.clientId, name: license.clientName || fullName },
    });

    // Create CLIENT_ADMIN user with the ClientAdmin relation in one transaction
    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: fullName,
        email,
        password: hashedPassword,
        role: 'CLIENT_ADMIN',
        clientAdmin: { create: { clientId: license.clientId } },
      },
    });

    const token = await signToken({
      userId: user.id,
      role: 'CLIENT_ADMIN',
      clientId: license.clientId,
    });

    res.status(201).json({
      token,
      role: 'CLIENT_ADMIN',
      clientId: license.clientId,
      name: user.name,
    });
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({ message: 'Email already registered' });
    }
    console.error('Desktop setup error:', error);
    res.status(500).json({ message: 'Setup failed' });
  }
});

module.exports = router;
