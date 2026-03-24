'use strict';

const prisma = require('../lib/prisma');
const { processDailyLogs, toMidnight } = require('../lib/attendanceEngine');

/**
 * Process raw AttendanceLogs into AttendanceRecords for a date range.
 *
 * @param {object} params
 * @param {string}   params.companyId
 * @param {Date}     params.start          — range start (inclusive)
 * @param {Date}     params.end            — range end (inclusive)
 * @param {string[]|undefined} params.employeeIds — optional subset of employees
 * @returns {{ processed: number }}
 */
async function processAttendanceLogs({ companyId, start, end, employeeIds }) {
  // Fetch all unprocessed logs in range
  const logs = await prisma.attendanceLog.findMany({
    where: {
      companyId,
      processed: false,
      punchTime: { gte: start, lte: end },
      employeeId: { not: null },
      ...(employeeIds?.length && { employeeId: { in: employeeIds } }),
    },
    orderBy: { punchTime: 'asc' },
  });

  if (logs.length === 0) return { processed: 0 };

  // Fetch active shift assignments for employees in range
  const empIds = [...new Set(logs.map((l) => l.employeeId))];
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      employeeId: { in: empIds },
      companyId,
      isActive: true,
      startDate: { lte: end },
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

    await prisma.attendanceRecord.upsert({
      where:  { employeeId_date: { employeeId: empId, date } },
      update: {
        clockIn:       result.clockIn,
        clockOut:      result.clockOut,
        breakMinutes:  result.breakMinutes,
        totalMinutes:  result.totalMinutes,
        normalMinutes: result.normalMinutes,
        ot1Minutes:    result.ot1Minutes,
        ot2Minutes:    result.ot2Minutes,
        status:        result.status,
        shiftId:       shift?.id || null,
        isManualOverride: false,
      },
      create: {
        employeeId:    empId,
        companyId,
        date,
        clockIn:       result.clockIn,
        clockOut:      result.clockOut,
        breakMinutes:  result.breakMinutes,
        totalMinutes:  result.totalMinutes,
        normalMinutes: result.normalMinutes,
        ot1Minutes:    result.ot1Minutes,
        ot2Minutes:    result.ot2Minutes,
        status:        result.status,
        shiftId:       shift?.id || null,
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

  return { processed: processedCount };
}

module.exports = { processAttendanceLogs };
