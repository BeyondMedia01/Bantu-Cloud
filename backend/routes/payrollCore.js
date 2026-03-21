const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/payroll-core
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const cores = await prisma.payrollCore.findMany({
      where: { companyId: req.companyId },
      include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      orderBy: { startDate: 'desc' },
    });
    res.json(cores);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/payroll-core
router.post('/', requirePermission('manage_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  const {
    employeeId, fullName, employeeCode, jobTitle,
    basicSalaryZiG, basicSalaryUSD, preferredCurrencySplit,
    paymentFrequency, bankName, bankBranch, accountNumber, startDate,
  } = req.body;

  if (!employeeId || !fullName || !employeeCode || !startDate) {
    return res.status(400).json({ message: 'employeeId, fullName, employeeCode, startDate are required' });
  }

  try {
    // Verify employee belongs to this company
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { companyId: true },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (employee.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const core = await prisma.payrollCore.create({
      data: {
        companyId: req.companyId,
        employeeId,
        fullName,
        employeeCode,
        jobTitle: jobTitle || null,
        basicSalaryZiG: parseFloat(basicSalaryZiG || 0),
        basicSalaryUSD: parseFloat(basicSalaryUSD || 0),
        preferredCurrencySplit: preferredCurrencySplit || null,
        paymentFrequency: paymentFrequency || 'MONTHLY',
        bankName: bankName || null,
        bankBranch: bankBranch || null,
        accountNumber: accountNumber || null,
        startDate: new Date(startDate),
      },
    });
    res.status(201).json(core);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/payroll-core/:id
router.put('/:id', requirePermission('manage_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  const {
    fullName, jobTitle, basicSalaryZiG, basicSalaryUSD,
    preferredCurrencySplit, paymentFrequency, bankName, bankBranch, accountNumber, startDate,
  } = req.body;

  try {
    const existing = await prisma.payrollCore.findUnique({
      where: { id: req.params.id },
      select: { companyId: true },
    });
    if (!existing) return res.status(404).json({ message: 'PayrollCore entry not found' });
    if (existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const core = await prisma.payrollCore.update({
      where: { id: req.params.id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(jobTitle !== undefined && { jobTitle }),
        ...(basicSalaryZiG !== undefined && { basicSalaryZiG: parseFloat(basicSalaryZiG) }),
        ...(basicSalaryUSD !== undefined && { basicSalaryUSD: parseFloat(basicSalaryUSD) }),
        ...(preferredCurrencySplit !== undefined && { preferredCurrencySplit }),
        ...(paymentFrequency !== undefined && { paymentFrequency }),
        ...(bankName !== undefined && { bankName }),
        ...(bankBranch !== undefined && { bankBranch }),
        ...(accountNumber !== undefined && { accountNumber }),
        ...(startDate !== undefined && { startDate: new Date(startDate) }),
      },
    });
    res.json(core);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/payroll-core/:id
router.delete('/:id', requirePermission('manage_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const existing = await prisma.payrollCore.findUnique({
      where: { id: req.params.id },
      select: { companyId: true },
    });
    if (!existing) return res.status(404).json({ message: 'PayrollCore entry not found' });
    if (existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    await prisma.payrollCore.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
