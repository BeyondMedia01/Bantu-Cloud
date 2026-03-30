const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// GET /api/payslips — EMPLOYEE self-service: own payslips
router.get('/', async (req, res) => {
  try {
    const where = {};

    if (req.user.role === 'EMPLOYEE' && req.employeeId) {
      where.employeeId = req.employeeId;
    } else if (req.companyId) {
      where.payrollRun = { companyId: req.companyId };
    } else if (req.clientId) {
      where.payrollRun = { company: { clientId: req.clientId } };
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [payslips, total] = await Promise.all([
      prisma.payslip.findMany({
        where,
        include: {
          employee: { select: { firstName: true, lastName: true, employeeCode: true } },
          payrollRun: { select: { startDate: true, endDate: true, currency: true, status: true } },
        },
        orderBy: { payrollRun: { runDate: 'desc' } },
        skip,
        take: parseInt(limit),
      }),
      prisma.payslip.count({ where }),
    ]);

    res.json({ data: payslips, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/payslips/:id
router.get('/:id', async (req, res) => {
  try {
    const payslip = await prisma.payslip.findUnique({
      where: { id: req.params.id },
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            position: true,
            department: { select: { name: true } },
          },
        },
        payrollRun: {
          include: {
            company: {
              select: {
                id: true,
                name: true,
                registrationNumber: true,
                taxId: true,
                address: true,
              },
            },
          },
        },
      },
    });

    if (!payslip) return res.status(404).json({ message: 'Payslip not found' });

    // EMPLOYEE can only see own payslips
    if (req.user.role === 'EMPLOYEE' && payslip.employeeId !== req.employeeId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Company-scoped access
    if (req.companyId && payslip.payrollRun.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({ data: payslip });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
