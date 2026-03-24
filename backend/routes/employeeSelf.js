const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../lib/auth');

const router = express.Router();

// GET /api/employee/profile — EMPLOYEE self-service
router.get('/profile', requireRole('EMPLOYEE'), async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { userId: req.user.userId },
      select: {
        id: true, employeeCode: true, title: true,
        firstName: true, lastName: true, maidenName: true,
        email: true, phone: true,
        nationality: true, nationalId: true,
        dateOfBirth: true, gender: true, maritalStatus: true,
        homeAddress: true, postalAddress: true,
        nextOfKin: true, nextOfKinName: true, nextOfKinContact: true,
        occupation: true, position: true, employmentType: true,
        startDate: true,
        paymentMethod: true, paymentBasis: true, baseRate: true,
        currency: true, bankName: true, bankBranch: true, accountNumber: true,
        taxMethod: true,
        leaveBalance: true, leaveTaken: true, leaveEntitlement: true,
        companyId: true, branchId: true, departmentId: true,
        createdAt: true, updatedAt: true,
        company: { select: { name: true } },
        branch: { select: { name: true } },
        department: { select: { name: true } },
        // Excluded: tin, idPassport, socialSecurityNum, bankAccountUSD, bankAccountZiG, bankRoutingUSD, bankRoutingZiG
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
      select: {
        id: true, firstName: true, lastName: true, employeeCode: true,
        homeAddress: true, nextOfKin: true,
        bankName: true, accountNumber: true,
        updatedAt: true,
      },
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
