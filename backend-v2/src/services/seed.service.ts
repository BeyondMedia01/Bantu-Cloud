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

const DEFAULT_TRANSACTION_CODES = [
  { code: '101', name: 'Basic Salary',               type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: true,  affectsPaye: true,  affectsNssa: true,  preTax: false, incomeCategory: 'BASIC_SALARY' },
  { code: '112', name: 'Housing Allowance',           type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'ALLOWANCE' },
  { code: '113', name: 'Airtime Allowance',           type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'ALLOWANCE' },
  { code: '114', name: 'Overtime 1.5x',               type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'OVERTIME',    defaultValue: 1.5 },
  { code: '119', name: 'Overtime 2.0x',               type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'OVERTIME',    defaultValue: 2.0 },
  { code: '122', name: 'Overtime 1.0x',               type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'OVERTIME',    defaultValue: 1.0 },
  { code: '115', name: 'Commission',                  type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'COMMISSION' },
  { code: '116', name: 'Gratuity',                    type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'GRATUITY' },
  { code: '117', name: 'Back Pay',                    type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'BASIC_SALARY' },
  { code: '118', name: 'Responsibility Allowance',    type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'ALLOWANCE' },
  { code: '123', name: 'Incentive',                   type: 'EARNING',    calculationType: 'fixed', taxable: true,  pensionable: false, affectsPaye: true,  affectsNssa: false, preTax: false, incomeCategory: 'ALLOWANCE' },
  { code: '201', name: 'Shorttime (days/hours)',      type: 'DEDUCTION',  calculationType: 'fixed', taxable: true,  pensionable: true,  affectsPaye: true,  affectsNssa: true,  preTax: true,  incomeCategory: 'BASIC_SALARY' },
  { code: '301', name: 'Medical Aid',                 type: 'DEDUCTION',  calculationType: 'fixed', taxable: false, pensionable: false, affectsPaye: false, affectsNssa: false, preTax: false, incomeCategory: 'MEDICAL_AID' },
  { code: '302', name: 'Cimas Medical Aid',           type: 'DEDUCTION',  calculationType: 'fixed', taxable: false, pensionable: false, affectsPaye: false, affectsNssa: false, preTax: false, incomeCategory: 'MEDICAL_AID' },
  { code: '303', name: 'Funeral Policy',              type: 'DEDUCTION',  calculationType: 'fixed', taxable: false, pensionable: false, affectsPaye: false, affectsNssa: false, preTax: false, incomeCategory: null },
] as const;

const DEFAULT_TAX_TABLES = [
  {
    name: 'USD 2026',
    currency: 'USD',
    effectiveDate: new Date('2026-01-01'),
    isActive: true,
    isAnnual: true,
    brackets: [
      { lowerBound: 0,        upperBound: 1200,        rate: 0,    fixedAmount: 0 },
      { lowerBound: 1201,     upperBound: 3600,        rate: 0.20, fixedAmount: 240 },
      { lowerBound: 3601,     upperBound: 12000,       rate: 0.25, fixedAmount: 420 },
      { lowerBound: 12001,    upperBound: 24000,       rate: 0.30, fixedAmount: 1020 },
      { lowerBound: 24001,    upperBound: 36000,       rate: 0.35, fixedAmount: 2220 },
      { lowerBound: 36001,    upperBound: 99999999999, rate: 0.40, fixedAmount: 4020 },
    ],
  },
  {
    name: 'ZiG 2026',
    currency: 'ZiG',
    effectiveDate: new Date('2026-01-01'),
    isActive: true,
    isAnnual: true,
    brackets: [
      { lowerBound: 0,        upperBound: 33600,       rate: 0,    fixedAmount: 0 },
      { lowerBound: 33601,    upperBound: 100800,      rate: 0.20, fixedAmount: 6720 },
      { lowerBound: 100801,   upperBound: 336000,      rate: 0.25, fixedAmount: 11760 },
      { lowerBound: 336001,   upperBound: 672000,      rate: 0.30, fixedAmount: 28560 },
      { lowerBound: 672001,   upperBound: 1008000,     rate: 0.35, fixedAmount: 62160 },
      { lowerBound: 1008001,  upperBound: 9999999999,  rate: 0.40, fixedAmount: 112560 },
    ],
  },
];

export async function seedClientDefaults(clientId: string) {
  // Transaction codes — skip any that already exist for this client
  const existingCodes = await prisma.transactionCode.findMany({
    where: { clientId },
    select: { code: true },
  });
  const existingSet = new Set(existingCodes.map((c) => c.code));

  const codesToCreate = DEFAULT_TRANSACTION_CODES.filter((tc) => !existingSet.has(tc.code));
  if (codesToCreate.length > 0) {
    await prisma.transactionCode.createMany({
      data: codesToCreate.map((tc) => ({ ...tc, clientId, incomeCategory: tc.incomeCategory as any, defaultValue: (tc as any).defaultValue ?? null })),
      skipDuplicates: true,
    });
  }

  // Tax tables — skip if client already has any
  const existingTables = await prisma.taxTable.count({ where: { clientId } });
  if (existingTables === 0) {
    for (const table of DEFAULT_TAX_TABLES) {
      const { brackets, ...tableData } = table;
      const created = await prisma.taxTable.create({
        data: { ...tableData, clientId },
      });
      await prisma.taxBracket.createMany({
        data: brackets.map((b) => ({ ...b, taxTableId: created.id })),
      });
    }
  }
}
