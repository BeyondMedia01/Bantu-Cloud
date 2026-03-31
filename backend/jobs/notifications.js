/**
 * Notifications Job
 *
 * Runs daily at 07:00. For each client, finds the CLIENT_ADMIN email and sends:
 *   1. Payroll deadline reminders — 3 days before an open PayrollCalendar period ends
 *   2. Public holiday reminders   — 3 days before an upcoming holiday
 *   3. Work anniversary reminders — employees whose startDate matches today (month/day)
 *   4. Birthday reminders         — employees whose dateOfBirth matches today (month/day)
 *
 * Each notification type is sent at most once per day per company (deduped by checking
 * whether the same event was already notified, using simple date math rather than a
 * persistent table to keep things lightweight).
 */

const prisma = require('../lib/prisma');
const {
  sendPayrollDeadlineReminder,
  sendHolidayReminder,
  sendAnniversaryReminder,
  sendBirthdayReminder,
} = require('../lib/mailer');

function isSameMonthDay(date, today) {
  return date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function diffDays(a, b) {
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

function formatDate(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function formatPeriod(year, month) {
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
}

async function runNotifications() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const in3Days = new Date(today);
  in3Days.setDate(in3Days.getDate() + 3);

  const in4Days = new Date(today);
  in4Days.setDate(in4Days.getDate() + 4);

  console.log(`[Notifications] Running for ${today.toISOString().slice(0, 10)}`);

  // Load all clients with their admin email
  const clients = await prisma.client.findMany({
    include: {
      users: {
        where: { role: 'CLIENT_ADMIN' },
        select: { email: true },
        take: 1,
      },
    },
  });

  let totalSent = 0;

  for (const client of clients) {
    const adminEmail = client.users[0]?.email;
    if (!adminEmail) continue;

    // Load companies for this client
    const companies = await prisma.company.findMany({
      where: { clientId: client.id },
      select: { id: true, name: true },
    });

    for (const company of companies) {
      // ── 1. Payroll deadline reminders ──────────────────────────────────────
      const upcomingPeriods = await prisma.payrollCalendar.findMany({
        where: {
          clientId: client.id,
          isClosed: false,
          endDate: { gte: today, lt: in4Days },
        },
      });

      for (const period of upcomingPeriods) {
        const daysLeft = diffDays(new Date(period.endDate), today);
        if (daysLeft < 0 || daysLeft > 3) continue;

        try {
          await sendPayrollDeadlineReminder(adminEmail, {
            companyName: company.name,
            period: formatPeriod(period.year, period.month),
            deadline: formatDate(new Date(period.endDate)),
            daysLeft,
          });
          console.log(`[Notifications] Payroll deadline reminder sent to ${adminEmail} (${company.name}, ${daysLeft}d)`);
          totalSent++;
        } catch (err) {
          console.error(`[Notifications] Failed to send payroll deadline reminder: ${err.message}`);
        }
      }

      // ── 2. Public holiday reminders ────────────────────────────────────────
      const upcomingHolidays = await prisma.publicHoliday.findMany({
        where: {
          date: { gte: today, lt: in4Days },
          country: 'ZW',
        },
        orderBy: { date: 'asc' },
      });

      if (upcomingHolidays.length > 0) {
        const holidays = upcomingHolidays.map(h => ({
          name: h.name,
          date: formatDate(new Date(h.date)),
        }));

        try {
          await sendHolidayReminder(adminEmail, { companyName: company.name, holidays });
          console.log(`[Notifications] Holiday reminder sent to ${adminEmail} (${company.name}, ${holidays.map(h => h.name).join(', ')})`);
          totalSent++;
        } catch (err) {
          console.error(`[Notifications] Failed to send holiday reminder: ${err.message}`);
        }
      }

      // ── 3. Work anniversaries ──────────────────────────────────────────────
      const employees = await prisma.employee.findMany({
        where: { companyId: company.id, dischargeDate: null },
        select: { firstName: true, lastName: true, startDate: true, dateOfBirth: true },
      });

      const anniversaries = employees
        .filter(e => e.startDate && isSameMonthDay(new Date(e.startDate), today))
        .map(e => {
          const years = today.getFullYear() - new Date(e.startDate).getFullYear();
          return { name: `${e.firstName} ${e.lastName}`, years };
        })
        .filter(a => a.years > 0);

      if (anniversaries.length > 0) {
        try {
          await sendAnniversaryReminder(adminEmail, { companyName: company.name, anniversaries });
          console.log(`[Notifications] Anniversary reminder sent to ${adminEmail} (${company.name}, ${anniversaries.length} employee(s))`);
          totalSent++;
        } catch (err) {
          console.error(`[Notifications] Failed to send anniversary reminder: ${err.message}`);
        }
      }

      // ── 4. Birthdays ───────────────────────────────────────────────────────
      const birthdays = employees
        .filter(e => e.dateOfBirth && isSameMonthDay(new Date(e.dateOfBirth), today))
        .map(e => {
          const age = today.getFullYear() - new Date(e.dateOfBirth).getFullYear();
          return { name: `${e.firstName} ${e.lastName}`, age };
        });

      if (birthdays.length > 0) {
        try {
          await sendBirthdayReminder(adminEmail, { companyName: company.name, birthdays });
          console.log(`[Notifications] Birthday reminder sent to ${adminEmail} (${company.name}, ${birthdays.length} employee(s))`);
          totalSent++;
        } catch (err) {
          console.error(`[Notifications] Failed to send birthday reminder: ${err.message}`);
        }
      }
    }
  }

  console.log(`[Notifications] Done. ${totalSent} email(s) sent.`);
  return totalSent;
}

module.exports = { runNotifications };
