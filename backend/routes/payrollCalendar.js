const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// GET /api/payroll-calendar
router.get('/', async (req, res) => {
  try {
    const where = {};
    if (req.clientId) where.clientId = req.clientId;
    if (req.query.year) where.year = parseInt(req.query.year);
    if (req.query.isClosed !== undefined) where.isClosed = req.query.isClosed === 'true';

    const calendars = await prisma.payrollCalendar.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    res.json(calendars);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/payroll-calendar
router.post('/', requirePermission('manage_payroll'), async (req, res) => {
  const { periodType, year, month, payDay, startDate, endDate } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!periodType || !year || !startDate || !endDate) {
    return res.status(400).json({ message: 'periodType, year, startDate, endDate are required' });
  }

  try {
    const existing = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: req.clientId,
        year: parseInt(year),
        month: month ? parseInt(month) : null,
      },
    });

    if (existing) {
      return res.status(400).json({ message: 'A payroll calendar already exists for this year and month' });
    }

    const d = new Date(startDate);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;

    const calendar = await prisma.payrollCalendar.create({
      data: {
        clientId: req.clientId,
        periodType: periodType || 'MONTHLY',
        year: y,
        month: m,
        payDay: parseInt(payDay || 25),
        startDate: d,
        endDate: new Date(endDate),
      },
    });
    res.status(201).json(calendar);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ message: 'A payroll calendar already exists for this year and month' });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/payroll-calendar/:id
router.get('/:id', async (req, res) => {
  try {
    const calendar = await prisma.payrollCalendar.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { payrollRuns: true } } },
    });
    if (!calendar) return res.status(404).json({ message: 'Payroll calendar not found' });
    res.json(calendar);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/payroll-calendar/:id
router.put('/:id', requirePermission('manage_payroll'), async (req, res) => {
  const { periodType, year, month, payDay, startDate, endDate } = req.body;
  try {
    const existing = await prisma.payrollCalendar.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Payroll calendar not found' });
    if (req.clientId && existing.clientId !== req.clientId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (existing.isClosed) return res.status(400).json({ message: 'Cannot update a closed payroll calendar' });

    const calendar = await prisma.payrollCalendar.update({
      where: { id: req.params.id },
      data: {
        ...(periodType && { periodType }),
        ...(year && { year: parseInt(year) }),
        ...(month !== undefined && { month: month ? parseInt(month) : null }),
        ...(payDay !== undefined && { payDay: payDay ? parseInt(payDay) : null }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
      },
    });
    res.json(calendar);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Payroll calendar not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/payroll-calendar/:id/close
router.post('/:id/close', requirePermission('approve_payroll'), async (req, res) => {
  try {
    const calendar = await prisma.payrollCalendar.update({
      where: { id: req.params.id },
      data: { isClosed: true },
    });
    res.json(calendar);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Payroll calendar not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/payroll-calendar/:id
router.delete('/:id', requirePermission('manage_payroll'), async (req, res) => {
  try {
    const existing = await prisma.payrollCalendar.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Payroll calendar not found' });
    if (req.clientId && existing.clientId !== req.clientId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    if (existing.isClosed) return res.status(400).json({ message: 'Cannot delete a closed payroll calendar' });

    await prisma.payrollCalendar.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Payroll calendar not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
