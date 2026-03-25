/**
 * attendanceEngine.js
 *
 * Converts raw AttendanceLogs into structured daily AttendanceRecords.
 *
 * Overtime rules (Zimbabwe standard):
 *   Weekday       : first `normalHours` hrs @ ×1.0, next `ot1Threshold` hrs @ ×1.5, remainder @ ×2.0
 *   Saturday      : all hours @ ×1.5
 *   Sunday        : all hours @ ×2.0
 *   Public holiday: all hours @ ×2.0
 */

'use strict';

/**
 * Parse "HH:MM" into { h, m } integers.
 */
function parseTime(str) {
  const [h, m] = (str || '00:00').split(':').map(Number);
  return { h: h || 0, m: m || 0 };
}

/**
 * Return midnight (local) for a given Date object.
 */
function toMidnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Given raw AttendanceLogs for a single employee on a single date,
 * plus shift configuration, compute the DailyResult.
 *
 * @param {object[]} logs          — Array of AttendanceLog rows for this emp+date
 * @param {object|null} shift      — Shift record (normalHours, ot1Threshold, breakMinutes, etc.)
 * @param {Date} date              — The work date (midnight)
 * @param {object} [options]
 * @param {boolean} [options.isPublicHoliday] — Override: treat day as PH
 * @returns DailyResult | null
 */
function processDailyLogs(logs, shift, date, options = {}) {
  if (!logs || logs.length === 0) return null;

  const sorted = [...logs].sort((a, b) => new Date(a.punchTime) - new Date(b.punchTime));

  // Separate by punch type
  const ins        = sorted.filter((l) => l.punchType === 'IN');
  const outs       = sorted.filter((l) => l.punchType === 'OUT');
  const breakIns   = sorted.filter((l) => l.punchType === 'BREAK_IN');
  const breakOuts  = sorted.filter((l) => l.punchType === 'BREAK_OUT');

  if (ins.length === 0) return null; // no clock-in = no record

  const clockIn  = new Date(ins[0].punchTime);
  const clockOut = outs.length > 0 ? new Date(outs[outs.length - 1].punchTime) : null;

  if (!clockOut) {
    // Clocked in but not out — record presence with 0 hours
    return {
      clockIn,
      clockOut: null,
      breakMinutes: 0,
      totalMinutes: 0,
      normalMinutes: 0,
      ot1Minutes: 0,
      ot2Minutes: 0,
      status: 'PRESENT',
    };
  }

  // Gross minutes between first-in and last-out
  const grossMinutes = Math.max(0, Math.floor((clockOut - clockIn) / 60000));

  // Break time: sum matched BREAK_IN → BREAK_OUT pairs
  let actualBreakMinutes = 0;
  const breakPairs = Math.min(breakIns.length, breakOuts.length);
  for (let i = 0; i < breakPairs; i++) {
    const bi = new Date(breakIns[i].punchTime);
    const bo = new Date(breakOuts[i].punchTime);
    if (bo > bi) actualBreakMinutes += Math.floor((bo - bi) / 60000);
  }
  // If no explicit break punches, use shift.breakMinutes as a deduction
  const breakDeduction = actualBreakMinutes > 0
    ? actualBreakMinutes
    : (shift?.breakMinutes ?? 0);

  const workMinutes = Math.max(0, grossMinutes - breakDeduction);

  // Overtime rules
  const dayOfWeek = date.getDay(); // 0=Sun, 6=Sat
  const isSaturday     = dayOfWeek === 6;
  const isSunday       = dayOfWeek === 0;
  const isPublicHoliday = options.isPublicHoliday || false;

  const normalHours    = shift?.normalHours    ?? 8;
  const ot1Threshold   = shift?.ot1Threshold   ?? 2;
  const normalLimit    = normalHours  * 60;
  const ot1Limit       = ot1Threshold * 60;

  let normalMinutes = 0;
  let ot1Minutes    = 0;
  let ot2Minutes    = 0;

  if (isSunday || isPublicHoliday) {
    ot2Minutes = workMinutes;
  } else if (isSaturday) {
    ot1Minutes = workMinutes;
  } else {
    normalMinutes = Math.min(workMinutes, normalLimit);
    const remainder = Math.max(0, workMinutes - normalLimit);
    ot1Minutes = Math.min(remainder, ot1Limit);
    ot2Minutes = Math.max(0, remainder - ot1Limit);
  }

  return {
    clockIn,
    clockOut,
    breakMinutes: breakDeduction,
    totalMinutes: workMinutes,
    normalMinutes,
    ot1Minutes,
    ot2Minutes,
    status: workMinutes > 0 ? 'PRESENT' : 'ABSENT',
  };
}

/**
 * Build PayrollInput rows from a set of AttendanceRecords.
 *
 * Looks up (or accepts) three TransactionCodes:
 *   normalTcId  — "BASIC_HOURS" or similar EARNING TC
 *   ot1TcId     — "OT_1_5" (×1.5) EARNING TC
 *   ot2TcId     — "OT_2_0" (×2.0) EARNING TC
 *
 * Rate calculation: employee.baseRate / normalHoursPerPeriod = hourly rate
 *
 * @param {object[]} records        — AttendanceRecord rows with employee joined
 * @param {object} tcs              — { normalTcId, ot1TcId, ot2TcId }
 * @param {string} period           — "YYYY-MM"
 * @param {string|null} payrollRunId
 * @returns PayrollInput-shaped objects (no DB ids)
 */
function buildPayrollInputsFromAttendance(records, tcs, period, payrollRunId) {
  const { normalTcId, ot1TcId, ot2TcId } = tcs;
  const inputs = [];

  // Group by employee
  const byEmployee = {};
  for (const r of records) {
    (byEmployee[r.employeeId] = byEmployee[r.employeeId] || []).push(r);
  }

  for (const [empId, empRecords] of Object.entries(byEmployee)) {
    const emp = empRecords[0].employee;
    const normalHoursPerPeriod = emp.hoursPerPeriod ?? (emp.daysPerPeriod ? emp.daysPerPeriod * 8 : 160);
    const hourlyRate = emp.baseRate / normalHoursPerPeriod;

    let totalNormalHours    = 0;
    let totalNormalEarnings = 0;
    let totalOt1Hours       = 0;
    let totalOt1Earnings    = 0;
    let totalOt2Hours       = 0;
    let totalOt2Earnings    = 0;

    for (const r of empRecords) {
      const shiftOt1Mult = r.shift?.ot1Multiplier ?? 1.5;
      const shiftOt2Mult = r.shift?.ot2Multiplier ?? 2.0;

      const normHrs = r.normalMinutes / 60;
      const ot1Hrs  = r.ot1Minutes / 60;
      const ot2Hrs  = r.ot2Minutes / 60;

      totalNormalHours    += normHrs;
      totalNormalEarnings += hourlyRate * normHrs;
      
      totalOt1Hours    += ot1Hrs;
      totalOt1Earnings += hourlyRate * shiftOt1Mult * ot1Hrs;

      totalOt2Hours    += ot2Hrs;
      totalOt2Earnings += hourlyRate * shiftOt2Mult * ot2Hrs;
    }

    const currency = emp.currency || 'USD';

    if (normalTcId && totalNormalHours > 0) {
      inputs.push({
        employeeId: empId, transactionCodeId: normalTcId, period, payrollRunId: payrollRunId || null,
        [currency === 'ZiG' ? 'employeeZiG' : 'employeeUSD']: parseFloat(totalNormalEarnings.toFixed(2)),
        units: parseFloat(totalNormalHours.toFixed(2)), unitsType: 'hrs',
        notes: `Normal time: ${totalNormalHours.toFixed(2)} hrs`,
      });
    }
    if (ot1TcId && totalOt1Hours > 0) {
      inputs.push({
        employeeId: empId, transactionCodeId: ot1TcId, period, payrollRunId: payrollRunId || null,
        [currency === 'ZiG' ? 'employeeZiG' : 'employeeUSD']: parseFloat(totalOt1Earnings.toFixed(2)),
        units: parseFloat(totalOt1Hours.toFixed(2)), unitsType: 'hrs',
        notes: `OT 1: ${totalOt1Hours.toFixed(2)} hrs`,
      });
    }
    if (ot2TcId && totalOt2Hours > 0) {
      inputs.push({
        employeeId: empId, transactionCodeId: ot2TcId, period, payrollRunId: payrollRunId || null,
        [currency === 'ZiG' ? 'employeeZiG' : 'employeeUSD']: parseFloat(totalOt2Earnings.toFixed(2)),
        units: parseFloat(totalOt2Hours.toFixed(2)), unitsType: 'hrs',
        notes: `OT 2: ${totalOt2Hours.toFixed(2)} hrs`,
      });
    }
  }

  return inputs;
}

/**
 * Match a device user PIN to an Employee in the company.
 * Tries: employeeCode, then socialSecurityNum, then exact PIN match.
 */
async function matchEmployeeByPin(prisma, companyId, pin) {
  if (!pin) return null;
  const where = { companyId };
  try {
    // Try employeeCode first
    let emp = await prisma.employee.findFirst({ where: { ...where, employeeCode: pin } });
    if (emp) return emp;
    // Try pin as a string in socialSecurityNum
    emp = await prisma.employee.findFirst({ where: { ...where, socialSecurityNum: pin } });
    return emp || null;
  } catch (err) {
    console.error(`[attendanceEngine] matchEmployeeByPin failed (companyId=${companyId}, pin=${pin}):`, err);
    return null;
  }
}

module.exports = { processDailyLogs, buildPayrollInputsFromAttendance, matchEmployeeByPin, toMidnight };
