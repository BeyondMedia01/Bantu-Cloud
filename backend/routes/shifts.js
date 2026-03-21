const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// ─── GET /api/shifts ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });
  try {
    const shifts = await prisma.shift.findMany({
      where: { companyId: req.companyId, ...(req.query.active === 'true' ? { isActive: true } : {}) },
      include: { _count: { select: { assignments: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(shifts);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── GET /api/shifts/:id ─────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const shift = await prisma.shift.findUnique({
      where: { id: req.params.id },
      include: {
        assignments: {
          where: { isActive: true },
          include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        },
      },
    });
    if (!shift || (req.companyId && shift.companyId !== req.companyId)) return res.status(404).json({ message: 'Shift not found' });
    res.json(shift);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── POST /api/shifts ────────────────────────────────────────────────────────

router.post('/', requirePermission('manage_employees'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });
  const { name, code, startTime, endTime, breakMinutes, normalHours, ot1Threshold, isOvernight } = req.body;
  if (!name || !startTime || !endTime) return res.status(400).json({ message: 'name, startTime, and endTime are required' });
  try {
    const shift = await prisma.shift.create({
      data: {
        companyId:    req.companyId,
        name,
        code:         code || null,
        startTime,
        endTime,
        breakMinutes: parseInt(breakMinutes ?? 60),
        normalHours:  parseFloat(normalHours ?? 8),
        ot1Threshold: parseFloat(ot1Threshold ?? 2),
        isOvernight:  isOvernight === true || isOvernight === 'true',
      },
    });
    res.status(201).json(shift);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── PUT /api/shifts/:id ─────────────────────────────────────────────────────

router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!existing || (req.companyId && existing.companyId !== req.companyId)) return res.status(404).json({ message: 'Shift not found' });

    const { name, code, startTime, endTime, breakMinutes, normalHours, ot1Threshold, isOvernight, isActive } = req.body;
    const updated = await prisma.shift.update({
      where: { id: req.params.id },
      data: {
        ...(name         !== undefined && { name }),
        ...(code         !== undefined && { code }),
        ...(startTime    !== undefined && { startTime }),
        ...(endTime      !== undefined && { endTime }),
        ...(breakMinutes !== undefined && { breakMinutes: parseInt(breakMinutes) }),
        ...(normalHours  !== undefined && { normalHours:  parseFloat(normalHours) }),
        ...(ot1Threshold !== undefined && { ot1Threshold: parseFloat(ot1Threshold) }),
        ...(isOvernight  !== undefined && { isOvernight: isOvernight === true || isOvernight === 'true' }),
        ...(isActive     !== undefined && { isActive:    isActive    === true || isActive    === 'true' }),
      },
    });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── DELETE /api/shifts/:id ──────────────────────────────────────────────────

router.delete('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.shift.findUnique({ where: { id: req.params.id } });
    if (!existing || (req.companyId && existing.companyId !== req.companyId)) return res.status(404).json({ message: 'Shift not found' });
    const count = await prisma.shiftAssignment.count({ where: { shiftId: req.params.id } });
    if (count > 0) {
      await prisma.shift.update({ where: { id: req.params.id }, data: { isActive: false } });
      return res.json({ message: 'Shift deactivated (has existing assignments)' });
    }
    await prisma.shift.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

module.exports = router;
