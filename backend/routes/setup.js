const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { signToken } = require('../lib/auth');
const { issueLicense } = require('../lib/license');

const router = express.Router();

// GET /api/setup — Check if platform setup is required.
router.get('/', async (req, res) => {
  try {
    const admin = await prisma.user.findFirst({ where: { role: 'PLATFORM_ADMIN' } });
    res.json({ initialized: !!admin });
  } catch (error) {
    console.error('Setup check error:', error);
    res.status(500).json({ message: 'Failed to check setup status' });
  }
});

// POST /api/setup — One-time PLATFORM_ADMIN creation.
// Fails if a PLATFORM_ADMIN already exists.
router.post('/', async (req, res) => {
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

    const license = await issueLicense(client.id, 10, 120); // 10-year internal license, 10-employee cap

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

module.exports = router;
