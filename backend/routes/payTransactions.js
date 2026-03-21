const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// GET all PayTransaction entries for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const transactions = await prisma.payTransaction.findMany({
      where: { companyId: req.companyId },
      orderBy: { code: 'asc' }
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE a new PayTransaction entry
router.post('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const transaction = await prisma.payTransaction.create({
      data: {
        ...req.body,
        companyId: req.companyId,
      }
    });
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// UPDATE a PayTransaction entry
router.put('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const transaction = await prisma.payTransaction.update({
      where: { id: req.params.id },
      data: req.body
    });
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE a PayTransaction entry
router.delete('/:id', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    await prisma.payTransaction.delete({
      where: { id: req.params.id }
    });
    res.json({ message: 'PayTransaction entry deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
