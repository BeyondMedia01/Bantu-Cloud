const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

/**
 * GET /api/dashboard/reminders
 * Returns upcoming birthdays and work anniversaries within the next 30 days.
 */
router.get('/reminders', requirePermission('view_reports'), async (req, res) => {
  try {
    const companyId = req.companyId;
    if (!companyId) {
      return res.status(400).json({ message: 'Company context required' });
    }

    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    // Fetch all active employees for the company
    // We filter in JS because complex date logic (matching month/day only) 
    // is tricky across different databases in Prisma without raw queries.
    const employees = await prisma.employee.findMany({
      where: {
        companyId,
        dischargeDate: null,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        startDate: true,
        position: true,
      },
    });

    const isWithinNext30Days = (date) => {
      if (!date) return false;
      const d = new Date(date);
      const m = d.getMonth();
      const day = d.getDate();

      // Check current year
      const thisYearDate = new Date(today.getFullYear(), m, day);
      // Check next year (for cases like December -> January)
      const nextYearDate = new Date(today.getFullYear() + 1, m, day);

      return (thisYearDate >= today && thisYearDate <= thirtyDaysFromNow) ||
             (nextYearDate >= today && nextYearDate <= thirtyDaysFromNow);
    };

    const upcomingBirthdays = employees
      .filter(emp => isWithinNext30Days(emp.dateOfBirth))
      .map(emp => ({
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        date: emp.dateOfBirth,
        type: 'BIRTHDAY',
        position: emp.position,
      }));

    const upcomingAnniversaries = employees
      .filter(emp => isWithinNext30Days(emp.startDate))
      .map(emp => ({
        id: emp.id,
        name: `${emp.firstName} ${emp.lastName}`,
        date: emp.startDate,
        years: (() => {
          const start = new Date(emp.startDate);
          const anniversaryThisYear = new Date(today.getFullYear(), start.getMonth(), start.getDate());
          const fullYears = today.getFullYear() - start.getFullYear();
          return anniversaryThisYear <= today ? fullYears : fullYears - 1;
        })(),
        type: 'ANNIVERSARY',
        position: emp.position,
      }));

    // Sort by day/month relative to today
    const sortReminders = (a, b) => {
      const getDist = (date) => {
        const d = new Date(date);
        let target = new Date(today.getFullYear(), d.getMonth(), d.getDate());
        if (target < today) target.setFullYear(today.getFullYear() + 1);
        return target.getTime() - today.getTime();
      };
      return getDist(a.date) - getDist(b.date);
    };

    res.json({
      birthdays: upcomingBirthdays.sort(sortReminders),
      anniversaries: upcomingAnniversaries.sort(sortReminders),
    });
  } catch (error) {
    console.error('Failed to fetch dashboard reminders:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
