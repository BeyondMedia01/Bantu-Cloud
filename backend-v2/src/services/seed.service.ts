import { DataType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { getSeedSettings } from './settings.service';

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function nthWeekday(year: number, month: number, dayOfWeek: number, nth: number): Date | null {
  const d = new Date(Date.UTC(year, month, 1));
  let count = 0;
  while (d.getMonth() === month) {
    if (d.getUTCDay() === dayOfWeek) { count++; if (count === nth) return new Date(d); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return null;
}

function buildZimbabweHolidays(year: number) {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter); goodFriday.setUTCDate(easter.getUTCDate() - 2);
  const holySaturday = new Date(easter); holySaturday.setUTCDate(easter.getUTCDate() - 1);
  const easterMonday = new Date(easter); easterMonday.setUTCDate(easter.getUTCDate() + 1);
  const heroesDay = nthWeekday(year, 7, 1, 2);
  const defenseDay = nthWeekday(year, 7, 2, 2);

  const base = [
    { name: "New Year's Day", date: new Date(Date.UTC(year, 0, 1)) },
    { name: 'Robert Gabriel Mugabe National Youth Day', date: new Date(Date.UTC(year, 1, 21)) },
    { name: 'Good Friday', date: goodFriday },
    { name: 'Holy Saturday', date: holySaturday },
    { name: 'Easter Monday', date: easterMonday },
    { name: 'Independence Day', date: new Date(Date.UTC(year, 3, 18)) },
    { name: "Workers' Day", date: new Date(Date.UTC(year, 4, 1)) },
    { name: 'Africa Day', date: new Date(Date.UTC(year, 4, 25)) },
    { name: "Heroes' Day", date: heroesDay ?? new Date(Date.UTC(year, 7, 11)) },
    { name: 'Defense Forces Day', date: defenseDay ?? new Date(Date.UTC(year, 7, 12)) },
    { name: 'Unity Day', date: new Date(Date.UTC(year, 11, 22)) },
    { name: 'Christmas Day', date: new Date(Date.UTC(year, 11, 25)) },
    { name: 'Boxing Day', date: new Date(Date.UTC(year, 11, 26)) },
  ].map(h => ({ ...h, year, country: 'ZW' }));

  const all = [...base];
  const existingTimes = new Set(base.map(h => h.date.getTime()));
  for (const h of base) {
    if (h.date.getUTCDay() === 0) {
      const sub = new Date(h.date);
      sub.setUTCDate(sub.getUTCDate() + 1);
      if (existingTimes.has(sub.getTime())) sub.setUTCDate(sub.getUTCDate() + 1);
      all.push({ name: `${h.name} (substitute)`, date: sub, year: sub.getUTCFullYear(), country: 'ZW' });
      existingTimes.add(sub.getTime());
    }
  }
  return all.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export async function seedSettings() {
  return getSeedSettings();
}

export async function seedHolidays(year?: number) {
  const targetYear = year || new Date().getFullYear();
  const holidays = buildZimbabweHolidays(targetYear);
  let created = 0, skipped = 0;
  for (const h of holidays) {
    const existing = await prisma.publicHoliday.findFirst({ where: { date: h.date, country: h.country } });
    if (existing) { skipped++; continue; }
    await prisma.publicHoliday.create({ data: h });
    created++;
  }
  return { message: `Seeded ${created} holidays for ${targetYear} (${skipped} already existed)`, created, skipped, year: targetYear };
}

export async function seedAll(options?: { holidayYear?: number }) {
  const settings = await seedSettings();
  const holidays = await seedHolidays(options?.holidayYear);
  return { settings, holidays };
}
