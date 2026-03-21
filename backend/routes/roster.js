const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// ─── GET /api/roster/calendar ─────────────────────────────────────────────────
// Must be declared BEFORE /:id to prevent "calendar" being treated as an id.
// Returns: { employees, dates, grid: { empId: { 'YYYY-MM-DD': { shiftId, code, startTime, endTime } } } }

router.get('/calendar', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required' });

  const start = new Date(startDate);
  const end   = new Date(endDate);
  if (end <= start) return res.status(400).json({ message: 'endDate must be after startDate' });

  try {
    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        companyId: req.companyId,
        isActive:  true,
        startDate: { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
      include: {
        shift:    { select: { id: true, name: true, code: true, startTime: true, endTime: true } },
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
    });

    // Build date array
    const dates = [];
    const cur = new Date(start);
    while (cur <= end) {
      dates.push(cur.toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }

    const employees = [];
    const empSeen = new Set();
    const grid = {};

    for (const asgn of assignments) {
      const empId = asgn.employee.id;
      if (!empSeen.has(empId)) { empSeen.add(empId); employees.push(asgn.employee); }
      if (!grid[empId]) grid[empId] = {};

      const days      = JSON.parse(asgn.daysOfWeek || '[1,2,3,4,5]');
      const asgnStart = new Date(asgn.startDate);
      const asgnEnd   = asgn.endDate ? new Date(asgn.endDate) : null;

      for (const dateStr of dates) {
        const d = new Date(dateStr);
        if (d < asgnStart || (asgnEnd && d > asgnEnd)) continue;
        if (days.includes(d.getDay())) {
          grid[empId][dateStr] = {
            shiftId:   asgn.shift.id,
            code:      asgn.shift.code || asgn.shift.name,
            startTime: asgn.shift.startTime,
            endTime:   asgn.shift.endTime,
          };
        }
      }
    }

    res.json({ employees, dates, grid });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── GET /api/roster ─────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { startDate, endDate, employeeId, shiftId } = req.query;
  try {
    const where = {
      companyId: req.companyId,
      isActive:  true,
      ...(employeeId && { employeeId }),
      ...(shiftId    && { shiftId }),
    };
    if (startDate || endDate) {
      where.OR = [{ endDate: null }, { endDate: { gte: startDate ? new Date(startDate) : new Date() } }];
      if (endDate) where.startDate = { lte: new Date(endDate) };
    }
    const assignments = await prisma.shiftAssignment.findMany({
      where,
      include: {
        shift:    { select: { id: true, name: true, code: true, startTime: true, endTime: true } },
        employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { startDate: 'desc' },
    });
    res.json(assignments);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── POST /api/roster — assign employee(s) to a shift ────────────────────────

router.post('/', requirePermission('manage_employees'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { employeeIds, shiftId, startDate, endDate, daysOfWeek, notes } = req.body;
  if (!employeeIds?.length || !shiftId || !startDate) {
    return res.status(400).json({ message: 'employeeIds, shiftId, and startDate are required' });
  }
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, companyId: req.companyId } });
  if (!shift) return res.status(404).json({ message: 'Shift not found' });

  const days = daysOfWeek ? JSON.stringify(daysOfWeek) : JSON.stringify([1, 2, 3, 4, 5]);

  try {
    const created = await prisma.$transaction(
      employeeIds.map((empId) =>
        prisma.shiftAssignment.create({
          data: {
            employeeId: empId,
            shiftId,
            companyId:  req.companyId,
            startDate:  new Date(startDate),
            endDate:    endDate ? new Date(endDate) : null,
            daysOfWeek: days,
            notes:      notes || null,
          },
        })
      )
    );
    res.status(201).json(created);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── PUT /api/roster/:id ─────────────────────────────────────────────────────

router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.shiftAssignment.findUnique({ where: { id: req.params.id } });
    if (!existing || (req.companyId && existing.companyId !== req.companyId)) return res.status(404).json({ message: 'Not found' });
    const { endDate, daysOfWeek, notes, isActive } = req.body;
    const updated = await prisma.shiftAssignment.update({
      where: { id: req.params.id },
      data: {
        ...(endDate    !== undefined && { endDate:    endDate ? new Date(endDate) : null }),
        ...(daysOfWeek !== undefined && { daysOfWeek: JSON.stringify(daysOfWeek) }),
        ...(notes      !== undefined && { notes }),
        ...(isActive   !== undefined && { isActive: isActive === true || isActive === 'true' }),
      },
      include: {
        shift:    { select: { id: true, name: true, startTime: true, endTime: true } },
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── DELETE /api/roster/:id ──────────────────────────────────────────────────

router.delete('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.shiftAssignment.findUnique({ where: { id: req.params.id } });
    if (!existing || (req.companyId && existing.companyId !== req.companyId)) return res.status(404).json({ message: 'Not found' });
    await prisma.shiftAssignment.delete({ where: { id: req.params.id } });
    res.json({ message: 'Deleted' });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

module.exports = router;
