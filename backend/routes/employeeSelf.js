const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../lib/auth');

const router = express.Router();

// GET /api/employee/profile — EMPLOYEE self-service
router.get('/profile', requireRole('EMPLOYEE'), async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user.userId },
      include: {
        company: { select: { name: true } },
        branch: { select: { name: true } },
        department: { select: { name: true } },
      },
    });
    if (!employee) return res.status(404).json({ message: 'Employee record not found' });
    res.json(employee);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/employee/profile — limited self-update (personal info only)
router.put('/profile', requireRole('EMPLOYEE'), async (req, res) => {
  const { homeAddress, nextOfKin, bankName, accountNumber } = req.body;
  try {
    const employee = await prisma.employee.update({
      where: { userId: req.user.userId },
      data: { homeAddress, nextOfKin, bankName, accountNumber },
    });
    res.json(employee);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Employee record not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/employee/payslips
router.get('/payslips', requireRole('EMPLOYEE'), async (req, res) => {
  try {
    const emp = await prisma.employee.findUnique({ where: { userId: req.user.userId } });
    if (!emp) return res.status(404).json({ message: 'Employee record not found' });

    const payslips = await prisma.payslip.findMany({
      where: { employeeId: emp.id },
      include: { payrollRun: { select: { startDate: true, endDate: true, currency: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(payslips);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/employee/leave
router.get('/leave', requireRole('EMPLOYEE'), async (req, res) => {
  try {
    const emp = await prisma.employee.findUnique({ where: { userId: req.user.userId } });
    if (!emp) return res.status(404).json({ message: 'Employee record not found' });

    const [records, requests] = await Promise.all([
      prisma.leaveRecord.findMany({ where: { employeeId: emp.id }, orderBy: { startDate: 'desc' } }),
      prisma.leaveRequest.findMany({ where: { employeeId: emp.id }, orderBy: { createdAt: 'desc' } }),
    ]);
    res.json({ records, requests });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
