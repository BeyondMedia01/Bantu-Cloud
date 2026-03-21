const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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
    const summary = await prisma.payslipSummary.create({
      data: {
        ...req.body,
        companyId: req.companyId,
        payPeriod: new Date(req.body.payPeriod)
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
    const summary = await prisma.payslipSummary.update({
      where: { id: req.params.id },
      data: req.body
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
