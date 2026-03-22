const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /api/user/companies — companies accessible to the current user
router.get('/companies', async (req, res) => {
  const { userId, role, clientId } = req.user;

  try {
    if (role === 'PLATFORM_ADMIN') {
      const companies = await prisma.company.findMany({
        include: { client: { select: { name: true } } },
        orderBy: { name: 'asc' },
      });
      return res.json(companies);
    }

    if (role === 'CLIENT_ADMIN') {
      const companies = await prisma.company.findMany({
        where: { clientId },
        orderBy: { name: 'asc' },
      });
      return res.json(companies);
    }

    if (role === 'EMPLOYEE') {
      const emp = await prisma.employee.findUnique({ where: { userId } });
      if (!emp) return res.json([]);
      const company = await prisma.company.findUnique({ where: { id: emp.companyId } });
      return res.json(company ? [company] : []);
    }

    res.json([]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/user/me — current user profile
router.get('/me', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, role: true, createdAt: true, preferences: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/user/me — update current user's profile/preferences
router.put('/me', async (req, res) => {
  const { name, firstName, lastName, phone, preferences } = req.body;

  try {
    const data = {};
    if (firstName !== undefined) {
      data.firstName = firstName.trim();
      data.lastName = (lastName || '').trim();
      data.name = `${data.firstName} ${data.lastName}`.trim();
    } else if (name !== undefined) {
      data.name = name.trim();
    }
    if (phone !== undefined) data.phone = phone?.trim() || null;
    if (preferences !== undefined) data.preferences = preferences;

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data,
      select: { id: true, name: true, firstName: true, lastName: true, phone: true, email: true, role: true, createdAt: true, preferences: true },
    });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/user/change-password — change current user's password
router.put('/change-password', async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: 'Current password and new password are required' });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ message: 'New password must be at least 8 characters' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password);
    if (!valid) return res.status(400).json({ message: 'Current password is incorrect' });

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.user.userId }, data: { password: hashedPassword } });
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
