const express = require('express');
const prisma = require('../lib/prisma');
const router = express.Router();

// GET all PayslipTransaction entries for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(500, parseInt(req.query.limit) || 200);
    const transactions = await prisma.payslipTransaction.findMany({
      where: { companyId: req.companyId },
      include: {
        employee: { select: { fullName: true, employeeID: true } },
        transaction: { select: { description: true, type: true } }
      },
      orderBy: { payPeriod: 'desc' },
      take: limit,
      skip: (page - 1) * limit,
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
    // Destructure only expected fields to prevent mass-assignment
    const { employeeId, transactionId, currency, payPeriod, notes } = req.body;
    const amountOriginal = parseFloat(req.body.amountOriginal);
    const rateToUSD = parseFloat(req.body.rateToUSD);
    const amountInUSD = amountOriginal * rateToUSD;

    const transaction = await prisma.payslipTransaction.create({
      data: {
        companyId: req.companyId,
        employeeId,
        transactionId,
        currency,
        amountOriginal,
        rateToUSD,
        amountInUSD,
        payPeriod: new Date(payPeriod),
        notes,
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
