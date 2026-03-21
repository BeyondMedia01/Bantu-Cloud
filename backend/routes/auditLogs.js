const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const router = express.Router();

// GET all Audit Logs for the company
router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const logs = await prisma.multiCurrencyAuditLog.findMany({
      where: { companyId: req.companyId },
      include: {
        employee: { select: { fullName: true, employeeID: true } }
      },
      orderBy: { timestamp: 'desc' }
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE a new Audit Log entry (Internal use mainly)
router.post('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const log = await prisma.multiCurrencyAuditLog.create({
      data: {
        ...req.body,
        companyId: req.companyId,
        payPeriod: new Date(req.body.payPeriod),
        timestamp: new Date()
      }
    });
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
