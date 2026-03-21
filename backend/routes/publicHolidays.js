const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

// ─── Zimbabwe Public Holidays Generator ───────────────────────────────────────

/**
 * Calculates Easter Sunday for a given year using the Anonymous Gregorian algorithm.
 */
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 1-based
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * Returns the Nth occurrence of a weekday (0=Sun..6=Sat) in a given month/year.
 * e.g. nthWeekday(2025, 7, 1, 2) = 2nd Monday of August 2025.
 */
function nthWeekday(year, month, dayOfWeek, nth) {
  const d = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (d.getMonth() === month) {
    if (d.getUTCDay() === dayOfWeek) {
      count++;
      if (count === nth) return new Date(d);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

/**
 * When a statutory holiday falls on a Sunday, the following Monday is observed
 * as a substitute public holiday (standard Zimbabwean practice).
 * If the Monday is already a holiday, the substitute shifts to Tuesday.
 */
function addSubstitutes(holidays) {
  const all = [...holidays];
  const existingTimes = new Set(holidays.map((h) => h.date.getTime()));

  for (const h of holidays) {
    if (h.date.getUTCDay() === 0) { // Sunday
      const sub = new Date(h.date);
      sub.setUTCDate(sub.getUTCDate() + 1); // Monday
      if (existingTimes.has(sub.getTime())) {
        sub.setUTCDate(sub.getUTCDate() + 1); // shift to Tuesday if Monday taken
      }
      const subHoliday = {
        name: `${h.name} (substitute)`,
        date: sub,
        year: sub.getUTCFullYear(),
        country: 'ZW',
      };
      all.push(subHoliday);
      existingTimes.add(sub.getTime());
    }
  }

  return all.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function buildZimbabweHolidays(year) {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter); goodFriday.setUTCDate(easter.getUTCDate() - 2);
  const holySaturday = new Date(easter); holySaturday.setUTCDate(easter.getUTCDate() - 1);
  const easterMonday = new Date(easter); easterMonday.setUTCDate(easter.getUTCDate() + 1);
  const heroesDay = nthWeekday(year, 7, 1, 2);      // 2nd Monday of August
  const defenseDay = nthWeekday(year, 7, 2, 2);     // 2nd Tuesday of August

  const base = [
    { name: "New Year's Day",                         date: new Date(Date.UTC(year, 0, 1)) },
    { name: 'Robert Gabriel Mugabe National Youth Day', date: new Date(Date.UTC(year, 1, 21)) },
    { name: 'Good Friday',                            date: goodFriday },
    { name: 'Holy Saturday',                          date: holySaturday },
    { name: 'Easter Monday',                          date: easterMonday },
    { name: 'Independence Day',                       date: new Date(Date.UTC(year, 3, 18)) },
    { name: "Workers' Day",                           date: new Date(Date.UTC(year, 4, 1)) },
    { name: 'Africa Day',                             date: new Date(Date.UTC(year, 4, 25)) },
    { name: "Heroes' Day",                            date: heroesDay },
    { name: 'Defense Forces Day',                     date: defenseDay },
    { name: 'Unity Day',                              date: new Date(Date.UTC(year, 11, 22)) },
    { name: 'Christmas Day',                          date: new Date(Date.UTC(year, 11, 25)) },
    { name: 'Boxing Day',                             date: new Date(Date.UTC(year, 11, 26)) },
  ].map((h) => ({ ...h, year, country: 'ZW' }));

  return addSubstitutes(base);
}

// ─── GET /api/public-holidays ─────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const year = req.query.year ? parseInt(req.query.year) : new Date().getFullYear();
    const holidays = await prisma.publicHoliday.findMany({
      where: { year, country: 'ZW' },
      orderBy: { date: 'asc' },
    });
    res.json(holidays);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load holidays' });
  }
});

// ─── POST /api/public-holidays/seed ──────────────────────────────────────────

router.post('/seed', requirePermission('update_settings'), async (req, res) => {
  try {
    const year = req.body.year ? parseInt(req.body.year) : new Date().getFullYear();
    const holidays = buildZimbabweHolidays(year);

    let created = 0;
    let skipped = 0;

    for (const h of holidays) {
      const existing = await prisma.publicHoliday.findFirst({
        where: { date: h.date, country: h.country },
      });
      if (existing) { skipped++; continue; }
      await prisma.publicHoliday.create({ data: h });
      created++;
    }

    res.json({ message: `Seeded ${created} holidays for ${year} (${skipped} already existed)`, created, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to seed holidays' });
  }
});

// ─── POST /api/public-holidays ────────────────────────────────────────────────

router.post('/', requirePermission('update_settings'), async (req, res) => {
  try {
    const { name, date } = req.body;
    if (!name || !date) return res.status(400).json({ message: 'name and date are required' });
    const d = new Date(date);
    const year = d.getUTCFullYear();
    const holiday = await prisma.publicHoliday.create({
      data: { name, date: d, year, country: 'ZW' },
    });
    res.status(201).json(holiday);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ message: 'A holiday already exists on this date' });
    res.status(500).json({ message: 'Failed to create holiday' });
  }
});

// ─── DELETE /api/public-holidays/:id ─────────────────────────────────────────

router.delete('/:id', requirePermission('update_settings'), async (req, res) => {
  try {
    await prisma.publicHoliday.delete({ where: { id: req.params.id } });
    res.json({ message: 'Holiday deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Holiday not found' });
    res.status(500).json({ message: 'Failed to delete holiday' });
  }
});

module.exports = router;
