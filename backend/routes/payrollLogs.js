const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// Get all payroll logs for a company (read-only, with optional filters)
router.get('/', async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  const { actionType, status, entityAffected, startDate, endDate, userId } = req.query;

  try {
    const logs = await prisma.payrollLog.findMany({
      where: {
        companyId,
        ...(actionType && { actionType }),
        ...(status && { status }),
        ...(entityAffected && { entityAffected: { contains: entityAffected } }),
        ...(userId && { userId }),
        ...(startDate || endDate ? {
          actionTimestamp: {
            ...(startDate && { gte: new Date(startDate) }),
            ...(endDate && { lte: new Date(endDate) })
          }
        } : {})
      },
      include: {
        payrollUser: { select: { fullName: true, email: true, role: true } }
      },
      orderBy: { actionTimestamp: 'desc' },
      take: 500 // cap at 500 most recent for performance
    });
    res.json(logs);
  } catch (error) {
    console.error('Failed to fetch payroll logs:', error);
    res.status(500).json({ error: 'Failed to fetch payroll logs' });
  }
});

// Create a new log entry (append-only — no edit or delete exposed)
router.post('/', async (req, res) => {
  const companyId = req.companyId;
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  const {
    userId,
    actionType,
    entityAffected,
    entityId,
    oldValue,
    newValue,
    ipAddress,
    status,
    errorMessage,
    notes
  } = req.body;

  if (!actionType || !entityAffected) {
    return res.status(400).json({ error: 'actionType and entityAffected are required' });
  }

  try {
    const newLog = await prisma.payrollLog.create({
      data: {
        companyId,
        userId: userId || null,
        actionType,
        entityAffected,
        entityId: entityId || null,
        oldValue: oldValue ? (typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue)) : null,
        newValue: newValue ? (typeof newValue === 'string' ? newValue : JSON.stringify(newValue)) : null,
        ipAddress: ipAddress || null,
        status: status || 'SUCCESS',
        errorMessage: errorMessage || null,
        notes: notes || null
      }
    });
    res.status(201).json(newLog);
  } catch (error) {
    console.error('Failed to create payroll log:', error);
    res.status(500).json({ error: 'Failed to create payroll log' });
  }
});

// NO PATCH or DELETE routes — logs are immutable by design

module.exports = router;
