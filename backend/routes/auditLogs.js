const express = require('express');
const prisma = require('../lib/prisma');
const router = express.Router();
const { authenticateToken } = require('../lib/auth');
const { requirePermission } = require('../lib/permissions');

// All audit log routes require authentication
router.use(authenticateToken);

// GET all Audit Logs for the company
router.get('/', requirePermission('view_reports'), async (req, res) => {
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
    const { employeeId, payPeriod, action, currencyFrom, currencyTo, rateUsed, amountOriginal, amountConverted, notes } = req.body;
    const log = await prisma.multiCurrencyAuditLog.create({
      data: {
        employeeId,
        action,
        currencyFrom,
        currencyTo,
        rateUsed,
        amountOriginal,
        amountConverted,
        notes,
        companyId: req.companyId,
        payPeriod: new Date(payPeriod),
        timestamp: new Date()
      }
    });
    res.json(log);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
