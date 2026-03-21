const express = require('express');
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
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
