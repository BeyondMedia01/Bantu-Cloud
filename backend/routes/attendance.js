/**
 * attendance.js
 *
 * Routes:
 *   GET  /api/attendance              — list processed records (with filters)
 *   GET  /api/attendance/logs         — raw punch logs
 *   POST /api/attendance/process      — compute daily records from raw logs for a date range
 *   POST /api/attendance/manual       — create / override a daily record manually
 *   PUT  /api/attendance/:id          — update a record (manual override)
 *   POST /api/attendance/generate-inputs — convert records → PayrollInput rows for a run
 *   GET  /api/attendance/summary      — per-employee summary for a period
 */

'use strict';

const express = require('express');
const prisma   = require('../lib/prisma');
const { requirePermission }            = require('../lib/permissions');
const { processDailyLogs, buildPayrollInputsFromAttendance, toMidnight } = require('../lib/attendanceEngine');

const router = express.Router();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const checkEmployeeLifecycle = async (empId, date) => {
  const emp = await prisma.employee.findUnique({
    where: { id: empId },
    select: { startDate: true, dischargeDate: true }
  });
  if (!emp) return false;
  
  const d = new Date(date);
  if (d < new Date(emp.startDate)) return false;
  if (emp.dischargeDate && d > new Date(emp.dischargeDate)) return false;
  
  return true;
};

// ─── GET /api/attendance/logs ─────────────────────────────────────────────────

router.get('/logs', requirePermission('manage_employees'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { employeeId, deviceId, startDate, endDate, unmatched, page = '1', limit = '100' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where = {
      companyId: req.companyId,
      ...(employeeId                   && { employeeId }),
      ...(deviceId                     && { deviceId }),
      ...(unmatched === 'true'         && { employeeId: null }),
      ...(startDate || endDate) && {
        punchTime: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate   && { lte: new Date(endDate) }),
        },
      },
    };

    const [logs, total] = await Promise.all([
      prisma.attendanceLog.findMany({
        where, skip, take: parseInt(limit),
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          device:   { select: { id: true, name: true, vendor: true } },
        },
        orderBy: { punchTime: 'desc' },
      }),
      prisma.attendanceLog.count({ where }),
    ]);

    res.json({ data: logs, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── GET /api/attendance ──────────────────────────────────────────────────────

router.get('/', requirePermission('manage_employees'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { employeeId, startDate, endDate, status, page = '1', limit = '50' } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  try {
    const where = {
      companyId: req.companyId,
      ...(employeeId && { employeeId }),
      ...(status     && { status }),
      ...(startDate || endDate) && {
        date: {
          ...(startDate && { gte: new Date(startDate) }),
          ...(endDate   && { lte: new Date(endDate) }),
        },
      },
    };

    const [records, total] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where, skip, take: parseInt(limit),
        include: {
          employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          shift:    { select: { id: true, name: true, code: true, startTime: true, endTime: true } },
        },
        orderBy: [{ date: 'desc' }, { employee: { lastName: 'asc' } }],
      }),
      prisma.attendanceRecord.count({ where }),
    ]);

    res.json({ data: records, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── GET /api/attendance/summary ─────────────────────────────────────────────
// Returns per-employee totals for a period (normal hrs, OT1 hrs, OT2 hrs, days present)

router.get('/summary', requirePermission('manage_employees'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate required' });

  try {
    const records = await prisma.attendanceRecord.findMany({
      where: {
        companyId: req.companyId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true, baseRate: true, currency: true, hoursPerPeriod: true, daysPerPeriod: true } } },
    });

    const byEmployee = {};
    for (const r of records) {
      if (!byEmployee[r.employeeId]) {
        byEmployee[r.employeeId] = {
          employee: r.employee,
          daysPresent: 0, daysAbsent: 0,
          normalHours: 0, ot1Hours: 0, ot2Hours: 0, totalHours: 0,
        };
      }
      const s = byEmployee[r.employeeId];
      if (r.status === 'PRESENT') s.daysPresent++;
      else s.daysAbsent++;
      s.normalHours += r.normalMinutes / 60;
      s.ot1Hours    += r.ot1Minutes    / 60;
      s.ot2Hours    += r.ot2Minutes    / 60;
      s.totalHours  += r.totalMinutes  / 60;
    }

    // Calculate OT pay estimate
    const summary = Object.values(byEmployee).map((s) => {
      const emp = s.employee;
      const stdHours  = emp.hoursPerPeriod ?? (emp.daysPerPeriod ? emp.daysPerPeriod * 8 : 160);
      const hourly    = emp.baseRate / stdHours;
      const normalPay = s.normalHours * hourly;
      const ot1Pay    = s.ot1Hours    * hourly * 1.5;
      const ot2Pay    = s.ot2Hours    * hourly * 2.0;
      return {
        ...s,
        normalHours: parseFloat(s.normalHours.toFixed(2)),
        ot1Hours:    parseFloat(s.ot1Hours.toFixed(2)),
        ot2Hours:    parseFloat(s.ot2Hours.toFixed(2)),
        totalHours:  parseFloat(s.totalHours.toFixed(2)),
        estimatedPay: parseFloat((normalPay + ot1Pay + ot2Pay).toFixed(2)),
        currency:    emp.currency || 'USD',
      };
    });

    res.json(summary);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── POST /api/attendance/process ─────────────────────────────────────────────
// Process raw AttendanceLogs → AttendanceRecords for a date range.
// Body: { startDate, endDate, employeeIds? (array, optional) }

router.post('/process', requirePermission('process_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { startDate, endDate, employeeIds } = req.body;
  if (!startDate || !endDate) return res.status(400).json({ message: 'startDate and endDate are required' });

  const start = new Date(startDate);
  const end   = new Date(endDate);

  try {
    // Fetch all unprocessed logs in range
    const logs = await prisma.attendanceLog.findMany({
      where: {
        companyId: req.companyId,
        processed: false,
        punchTime: { gte: start, lte: end },
        employeeId: { not: null },
        ...(employeeIds?.length && { employeeId: { in: employeeIds } }),
      },
      orderBy: { punchTime: 'asc' },
    });

    if (logs.length === 0) return res.json({ message: 'No unprocessed logs in range', processed: 0 });

    // Fetch active shift assignments for employees in range (to determine shift times)
    const empIds = [...new Set(logs.map((l) => l.employeeId))];
    const assignments = await prisma.shiftAssignment.findMany({
      where: {
        employeeId: { in: empIds },
        companyId:  req.companyId,
        isActive:   true,
        startDate:  { lte: end },
        OR: [{ endDate: null }, { endDate: { gte: start } }],
      },
      include: { shift: true },
    });

    // Group logs by employee → by date
    const grouped = {};
    for (const log of logs) {
      const empId = log.employeeId;
      const date  = toMidnight(new Date(log.punchTime)).toISOString();
      const key   = `${empId}::${date}`;
      (grouped[key] = grouped[key] || { empId, date: new Date(date), logs: [] }).logs.push(log);
    }

    // Helper: find the applicable shift for an employee on a date
    const findShift = (empId, date) => {
      const dayOfWeek = date.getDay();
      for (const asgn of assignments) {
        if (asgn.employeeId !== empId) continue;
        if (new Date(asgn.startDate) > date) continue;
        if (asgn.endDate && new Date(asgn.endDate) < date) continue;
        const days = JSON.parse(asgn.daysOfWeek || '[1,2,3,4,5]');
        if (days.includes(dayOfWeek)) return asgn.shift;
      }
      return null;
    };

    let processedCount = 0;
    const processedLogIds = [];

    for (const { empId, date, logs: dayLogs } of Object.values(grouped)) {
      const shift  = findShift(empId, date);
      const result = processDailyLogs(dayLogs, shift, date, {});
      if (!result) continue;

      // Upsert the attendance record
      await prisma.attendanceRecord.upsert({
        where:  { employeeId_date: { employeeId: empId, date } },
        update: {
          clockIn:      result.clockIn,
          clockOut:     result.clockOut,
          breakMinutes: result.breakMinutes,
          totalMinutes: result.totalMinutes,
          normalMinutes: result.normalMinutes,
          ot1Minutes:   result.ot1Minutes,
          ot2Minutes:   result.ot2Minutes,
          status:       result.status,
          shiftId:      shift?.id || null,
          isManualOverride: false,
        },
        create: {
          employeeId:   empId,
          companyId:    req.companyId,
          date,
          clockIn:      result.clockIn,
          clockOut:     result.clockOut,
          breakMinutes: result.breakMinutes,
          totalMinutes: result.totalMinutes,
          normalMinutes: result.normalMinutes,
          ot1Minutes:   result.ot1Minutes,
          ot2Minutes:   result.ot2Minutes,
          status:       result.status,
          shiftId:      shift?.id || null,
        },
      });

      dayLogs.forEach((l) => processedLogIds.push(l.id));
      processedCount++;
    }

    // Mark logs as processed
    if (processedLogIds.length > 0) {
      await prisma.attendanceLog.updateMany({
        where: { id: { in: processedLogIds } },
        data:  { processed: true },
      });
    }

    res.json({ message: `Processed ${processedCount} employee-day records`, processed: processedCount });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── POST /api/attendance/manual ──────────────────────────────────────────────
// Manually create or override a daily attendance record.

router.post('/manual', requirePermission('manage_employees'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { employeeId, date, clockIn, clockOut, status, notes, isPublicHoliday, shiftId } = req.body;
  if (!employeeId || !date) return res.status(400).json({ message: 'employeeId and date are required' });

  try {
    const emp = await prisma.employee.findFirst({ where: { id: employeeId, companyId: req.companyId } });
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    const day = toMidnight(new Date(date));
    if (!(await checkEmployeeLifecycle(employeeId, day))) {
      return res.status(400).json({ message: 'Attendance date is outside employee lifecycle (start/discharge)' });
    }

    const shift = shiftId ? await prisma.shift.findUnique({ where: { id: shiftId } }) : null;

    let result = { clockIn: null, clockOut: null, breakMinutes: 0, totalMinutes: 0, normalMinutes: 0, ot1Minutes: 0, ot2Minutes: 0 };

    if (clockIn && clockOut) {
      const fakeLogs = [
        { punchTime: new Date(clockIn),  punchType: 'IN' },
        { punchTime: new Date(clockOut), punchType: 'OUT' },
      ];
      result = processDailyLogs(fakeLogs, shift, day, { isPublicHoliday: isPublicHoliday === true }) || result;
    }

    const record = await prisma.attendanceRecord.upsert({
      where:  { employeeId_date: { employeeId, date: day } },
      update: { ...result, status: status || result.status || 'PRESENT', notes: notes || null, shiftId: shiftId || null, isPublicHoliday: isPublicHoliday === true, isManualOverride: true },
      create: { employeeId, companyId: req.companyId, date: day, ...result, status: status || result.status || 'PRESENT', notes: notes || null, shiftId: shiftId || null, isPublicHoliday: isPublicHoliday === true, isManualOverride: true },
    });

    res.status(201).json(record);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── PUT /api/attendance/:id ──────────────────────────────────────────────────

router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.attendanceRecord.findUnique({ where: { id: req.params.id } });
    if (!existing || (req.companyId && existing.companyId !== req.companyId)) return res.status(404).json({ message: 'Record not found' });

    const { status, notes, isPublicHoliday, clockIn, clockOut, shiftId } = req.body;
    
    if (existing.date && !(await checkEmployeeLifecycle(existing.employeeId, existing.date))) {
       // This shouldn't happen if validation is in place, but good for cleanup
       return res.status(400).json({ message: 'Cannot update record outside employee lifecycle' });
    }

    const shift = shiftId ? await prisma.shift.findUnique({ where: { id: shiftId } }) : null;

    let computed = {};
    if (clockIn && clockOut) {
      const fakeLogs = [
        { punchTime: new Date(clockIn),  punchType: 'IN' },
        { punchTime: new Date(clockOut), punchType: 'OUT' },
      ];
      const res2 = processDailyLogs(fakeLogs, shift || null, new Date(existing.date), { isPublicHoliday: isPublicHoliday ?? existing.isPublicHoliday });
      if (res2) computed = res2;
    }

    const updated = await prisma.attendanceRecord.update({
      where: { id: req.params.id },
      data: {
        ...(clockIn      !== undefined && computed.clockIn      !== undefined && { clockIn: computed.clockIn }),
        ...(clockOut     !== undefined && computed.clockOut     !== undefined && { clockOut: computed.clockOut }),
        ...(computed.totalMinutes !== undefined && {
          breakMinutes: computed.breakMinutes,
          totalMinutes: computed.totalMinutes,
          normalMinutes: computed.normalMinutes,
          ot1Minutes:   computed.ot1Minutes,
          ot2Minutes:   computed.ot2Minutes,
        }),
        ...(status          !== undefined && { status }),
        ...(notes           !== undefined && { notes }),
        ...(isPublicHoliday !== undefined && { isPublicHoliday }),
        ...(shiftId         !== undefined && { shiftId }),
        isManualOverride: true,
      },
    });

    res.json(updated);
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

// ─── POST /api/attendance/generate-inputs ─────────────────────────────────────
// Convert processed AttendanceRecords → PayrollInput rows.
// Body: { startDate, endDate, period (YYYY-MM), payrollRunId?, normalTcId, ot1TcId, ot2TcId, employeeIds? }

router.post('/generate-inputs', requirePermission('process_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id required' });
  const { startDate, endDate, period, payrollRunId, normalTcId, ot1TcId, ot2TcId, employeeIds } = req.body;
  if (!startDate || !endDate || !period) return res.status(400).json({ message: 'startDate, endDate, and period are required' });

  try {
    const records = await prisma.attendanceRecord.findMany({
      where: {
        companyId: req.companyId,
        date: { gte: new Date(startDate), lte: new Date(endDate) },
        status: 'PRESENT',
        ...(employeeIds?.length && { employeeId: { in: employeeIds } }),
      },
      include: { employee: { select: { id: true, baseRate: true, currency: true, hoursPerPeriod: true, daysPerPeriod: true } } },
    });

    if (records.length === 0) return res.json({ message: 'No attendance records found', created: 0 });

    const tcs = { normalTcId, ot1TcId, ot2TcId };
    const inputs = buildPayrollInputsFromAttendance(records, tcs, period, payrollRunId || null);

    let created = 0;
    for (const inp of inputs) {
      await prisma.payrollInput.create({ data: inp });
      created++;
    }

    res.json({ message: `Created ${created} payroll inputs from attendance`, created });
  } catch (e) { console.error(e); res.status(500).json({ message: 'Internal server error' }); }
});

module.exports = router;
