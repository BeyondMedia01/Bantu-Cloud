const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { requireRole } = require('../lib/auth');
const { getSettingAsString } = require('../lib/systemSettings');

const router = express.Router();
const adminOnly = requireRole('PLATFORM_ADMIN');

// ── Users ──────────────────────────────────────────────────────────────────────

// GET /api/admin/users
router.get('/users', adminOnly, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/admin/users
router.post('/users', adminOnly, async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!email || !password || !role) return res.status(400).json({ message: 'email, password, role are required' });

  const validRoles = ['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'EMPLOYEE'];
  if (!validRoles.includes(role)) return res.status(400).json({ message: `role must be one of: ${validRoles.join(', ')}` });

  try {
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashed, role },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    res.status(201).json(user);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'Email already registered' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', adminOnly, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/admin/users/:id
router.put('/users/:id', adminOnly, async (req, res) => {
  const { name, email } = req.body;
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { name, email },
      select: { id: true, name: true, email: true, role: true },
    });
    res.json(user);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/admin/users/:id/role
router.post('/users/:id/role', adminOnly, async (req, res) => {
  const { role } = req.body;
  const validRoles = ['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'EMPLOYEE'];
  if (!validRoles.includes(role)) return res.status(400).json({ message: `Invalid role` });

  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role },
      select: { id: true, role: true },
    });
    res.json(user);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminOnly, async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'User not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── System Settings ────────────────────────────────────────────────────────────

// GET /api/admin/settings
router.get('/settings', adminOnly, async (req, res) => {
  try {
    const settings = await prisma.systemSetting.findMany({
      where: { isActive: true },
      orderBy: [{ settingName: 'asc' }, { effectiveFrom: 'desc' }],
    });
    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/admin/settings
router.put('/settings', adminOnly, async (req, res) => {
  const { settingName, settingValue, dataType, description } = req.body;
  if (!settingName || settingValue === undefined) {
    return res.status(400).json({ message: 'settingName and settingValue are required' });
  }

  try {
    // Deactivate previous version
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
        lastUpdatedBy: req.user.userId,
        isActive: true,
      },
    });
    res.json(setting);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/admin/stats — system-wide metrics
router.get('/stats', adminOnly, async (req, res) => {
  try {
    const [clients, users, employees] = await Promise.all([
      prisma.client.count(),
      prisma.user.count(),
      prisma.employee.count(),
    ]);
    const aidsLevyRate = await getSettingAsString('AIDS_LEVY_RATE');
    res.json({ clients, users, employees, aidsLevyRate });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ── Audit Logs ─────────────────────────────────────────────────────────────────

// GET /api/admin/logs
router.get('/logs', adminOnly, async (req, res) => {
  const { action, resource, userEmail, dateFrom, dateTo, page = '1', limit = '50' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {};
  if (action)    where.action    = { contains: action, mode: 'insensitive' };
  if (resource)  where.resource  = { contains: resource, mode: 'insensitive' };
  if (req.query.resourceId) where.resourceId = req.query.resourceId;
  if (userEmail) where.userEmail = { contains: userEmail, mode: 'insensitive' };
  if (dateFrom || dateTo) {
    where.createdAt = {};
    if (dateFrom) where.createdAt.gte = new Date(dateFrom);
    if (dateTo)   where.createdAt.lte = new Date(dateTo);
  }

  try {
    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.auditLog.count({ where }),
    ]);
    res.json({ logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
