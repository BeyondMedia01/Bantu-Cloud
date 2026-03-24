const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// GET all PayslipTransaction entries for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const transactions = await prisma.payslipTransaction.findMany({
      where: { companyId: req.companyId },
      include: {
        employee: { select: { fullName: true, employeeID: true } },
        transaction: { select: { description: true, type: true } }
      },
      orderBy: { payPeriod: 'desc' }
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE a new PayslipTransaction entry
router.post('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const amountOriginal = parseFloat(req.body.amountOriginal);
    const rateToUSD = parseFloat(req.body.rateToUSD);
    const amountInUSD = amountOriginal * rateToUSD;

    const transaction = await prisma.payslipTransaction.create({
      data: {
        ...req.body,
        companyId: req.companyId,
        amountOriginal,
        rateToUSD,
        amountInUSD,
        payPeriod: new Date(req.body.payPeriod)
      }
    });
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a PayslipTransaction entry
router.delete('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const existing = await prisma.payslipTransaction.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Transaction not found' });
    if (existing.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await prisma.payslipTransaction.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
