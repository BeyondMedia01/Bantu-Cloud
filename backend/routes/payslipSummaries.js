const express = require('express');
const prisma = require('../lib/prisma');
const router = express.Router();

// GET all PayslipSummary entries for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const summaries = await prisma.payslipSummary.findMany({
      where: { companyId: req.companyId },
      include: {
        employee: { select: { fullName: true, employeeID: true } }
      },
      orderBy: { payPeriod: 'desc' }
    });
    res.json(summaries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE a new PayslipSummary entry
router.post('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const { employeeId, payPeriod, grossSalary, netSalary, totalDeductions, totalEarnings, currency, status, notes } = req.body;
    const summary = await prisma.payslipSummary.create({
      data: {
        employeeId,
        grossSalary,
        netSalary,
        totalDeductions,
        totalEarnings,
        currency,
        status,
        notes,
        companyId: req.companyId,
        payPeriod: new Date(payPeriod)
      }
    });
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a PayslipSummary (e.g., to finalize)
router.put('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const existing = await prisma.payslipSummary.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Summary not found' });
    if (existing.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const { grossSalary, netSalary, totalDeductions, totalEarnings, currency, status, notes } = req.body;
    const summary = await prisma.payslipSummary.update({
      where: { id: req.params.id },
      data: {
        ...(grossSalary !== undefined && { grossSalary }),
        ...(netSalary !== undefined && { netSalary }),
        ...(totalDeductions !== undefined && { totalDeductions }),
        ...(totalEarnings !== undefined && { totalEarnings }),
        ...(currency !== undefined && { currency }),
        ...(status !== undefined && { status }),
        ...(notes !== undefined && { notes }),
      }
    });
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a PayslipSummary entry
router.delete('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    await prisma.payslipSummary.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Summary deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
