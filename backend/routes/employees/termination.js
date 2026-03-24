'use strict';

const express = require('express');
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/permissions');
const { getSettingAsNumber } = require('../../lib/systemSettings');

const router = express.Router({ mergeParams: true });

// ─── GET /api/employees/:id/termination — calculate termination amounts ───────
/**
 * Returns a break-down of all amounts payable on termination:
 *   proRataSalary, noticePay, leavePayment, totalGross, taxEstimate, netEstimate
 *
 * Query params:
 *   terminationDate  — ISO date (defaults to today)
 *   noticeDays       — days notice owed (default 30)
 *   noticeGiven      — 'true' if employee worked their notice (no notice pay due)
 *   currency         — 'USD' | 'ZiG' (defaults to employee currency)
 */
router.get('/', requirePermission('manage_employees'), async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { leaveBalances: { where: { leaveType: 'ANNUAL' }, orderBy: { year: 'desc' }, take: 1 } },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const terminationDate = req.query.terminationDate
      ? new Date(req.query.terminationDate)
      : new Date();
    const noticeDays   = parseInt(req.query.noticeDays || '30');
    const noticeGiven  = req.query.noticeGiven === 'true';
    const currency     = req.query.currency || employee.currency || 'USD';

    // Last drawn salary: use most recent completed payslip gross, fall back to baseRate
    const lastPayslip = await prisma.payslip.findFirst({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });
    const lastGross  = lastPayslip?.gross ?? employee.baseRate;
    const monthlyPay = lastGross; // assume gross = full monthly salary

    // Pro-rata salary for partial month of work
    const termDay         = terminationDate.getDate();
    const daysInTermMonth = new Date(
      terminationDate.getFullYear(), terminationDate.getMonth() + 1, 0
    ).getDate();
    const proRataSalary   = monthlyPay * (termDay / daysInTermMonth);

    // Configurable calendar constants from SystemSettings
    const daysPerMonth      = await getSettingAsNumber('DAYS_PER_MONTH', 30);
    const workingDaysPerMonth = await getSettingAsNumber('WORKING_DAYS_PER_MONTH', 22);

    // Notice pay — only if employee did NOT work out notice period
    // Formula: noticeDays × (monthlyPay / daysPerMonth) — per Zimbabwe Labour Act for monthly-paid employees
    // For daily-paid: noticeDays × baseRate; for hourly: noticeDays × hoursPerDay × baseRate
    let noticePay = 0;
    if (!noticeGiven) {
      if (employee.paymentBasis === 'DAILY') {
        noticePay = noticeDays * employee.baseRate;
      } else if (employee.paymentBasis === 'HOURLY') {
        const hoursPerDay = employee.hoursPerPeriod ? employee.hoursPerPeriod / (employee.daysPerPeriod || workingDaysPerMonth) : 8;
        noticePay = noticeDays * hoursPerDay * employee.baseRate;
      } else {
        noticePay = noticeDays * (monthlyPay / daysPerMonth);
      }
    }

    // Accrued leave pay
    const leaveBalance   = employee.leaveBalances?.[0]?.balance ?? employee.leaveBalance ?? 0;
    const dailyRate      = monthlyPay / daysPerMonth;
    const leavePayment   = leaveBalance * dailyRate;

    // Years of service (for information)
    const yearsOfService = Math.max(0,
      (terminationDate - new Date(employee.startDate)) / (1000 * 60 * 60 * 24 * 365.25)
    );

    const totalGross = proRataSalary + noticePay + leavePayment;

    res.json({ data: {
      employeeId:      employee.id,
      name:            `${employee.firstName} ${employee.lastName}`,
      employeeCode:    employee.employeeCode,
      currency,
      terminationDate: terminationDate.toISOString().slice(0, 10),
      yearsOfService:  parseFloat(yearsOfService.toFixed(2)),
      lastGross,
      monthlyPay,
      proRataSalary:   parseFloat(proRataSalary.toFixed(2)),
      noticeDays,
      noticeGiven,
      noticePay:       parseFloat(noticePay.toFixed(2)),
      leaveBalance:    parseFloat(leaveBalance.toFixed(2)),
      leavePayment:    parseFloat(leavePayment.toFixed(2)),
      totalGross:      parseFloat(totalGross.toFixed(2)),
      note: 'Tax on termination payments should be computed in the payroll run using the SEVERANCE transaction code.',
    } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
