import { DataType } from '@prisma/client';
import { prisma, cache } from '../lib/prisma';

const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache: Map<string, string> | null = null;
let _cacheExpiry = 0;

async function loadAll(): Promise<Map<string, string>> {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;

  try {
    const rows = await prisma.systemSetting.findMany({
      where: { isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    const map = new Map<string, string>();
    for (const r of rows) {
      if (!map.has(r.settingName)) map.set(r.settingName, r.settingValue);
    }

    _cache = map;
    _cacheExpiry = now + CACHE_TTL_MS;
    return map;
  } catch (err) {
    console.error('[settings] Failed to load settings:', (err as Error).message);
    return _cache || new Map();
  }
}

export function invalidateCache() {
  _cache = null;
  _cacheExpiry = 0;
}

export async function getSetting(name: string) {
  const map = await loadAll();
  const value = map.get(name);
  return value === undefined ? null : { settingName: name, settingValue: value };
}

export async function getSettings(names: string[]): Promise<Record<string, string>> {
  const map = await loadAll();
  const result: Record<string, string> = {};
  for (const name of names) {
    if (map.has(name)) result[name] = map.get(name)!;
  }
  return result;
}

export async function getSettingAsNumber(name: string, defaultValue = 0): Promise<number> {
  const s = await getSetting(name);
  if (!s) return defaultValue;
  const n = parseFloat(s.settingValue);
  return isNaN(n) ? defaultValue : n;
}

export async function getSettingAsBoolean(name: string, defaultValue = false): Promise<boolean> {
  const s = await getSetting(name);
  if (!s) return defaultValue;
  return s.settingValue === 'true';
}

export async function getSettingAsString(name: string, defaultValue = ''): Promise<string> {
  const s = await getSetting(name);
  return s ? s.settingValue : defaultValue;
}

export async function getAll() {
  // @ts-expect-error - Accelerate cache strategy
  return prisma.systemSetting.findMany({ orderBy: { settingName: 'asc' } }, { cacheStrategy: cache.short });
}

export async function create(data: {
  settingName: string;
  settingValue: string;
  dataType?: string;
  effectiveFrom?: string;
  isActive?: boolean;
  description?: string;
  lastUpdatedBy?: string;
}) {
  const result = await prisma.systemSetting.create({
    data: {
      settingName: data.settingName,
      settingValue: String(data.settingValue),
      dataType: (data.dataType || 'TEXT') as DataType,
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : new Date(),
      isActive: data.isActive !== undefined ? data.isActive : true,
      description: data.description,
      lastUpdatedBy: data.lastUpdatedBy,
    },
  });
  invalidateCache();
  return result;
}

export async function update(id: string, data: {
  settingValue?: string;
  isActive?: boolean;
  description?: string;
  lastUpdatedBy?: string;
}) {
  const lastUpdatedBy = data.lastUpdatedBy || 'system';
  const result = await prisma.systemSetting.update({
    where: { id },
    data: {
      ...(data.settingValue !== undefined && { settingValue: String(data.settingValue) }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.description !== undefined && { description: data.description }),
      lastUpdatedBy,
    },
  });
  invalidateCache();
  return result;
}

export async function remove(id: string) {
  await prisma.systemSetting.delete({ where: { id } });
  invalidateCache();
}

export async function getWorkPeriodSettings() {
  const KEYS = ['WORKING_DAYS_PER_PERIOD', 'WORKING_DAYS_PER_MONTH', 'HOURS_PER_DAY', 'DAYS_PER_MONTH'];
  const rows = await prisma.systemSetting.findMany({
    where: { settingName: { in: KEYS }, isActive: true },
    orderBy: { effectiveFrom: 'desc' },
  });

  const map: Record<string, { id: string; value: number }> = {};
  for (const r of rows) {
    if (!map[r.settingName]) {
      map[r.settingName] = { id: r.id, value: parseFloat(r.settingValue) };
    }
  }

  const result: Record<string, { id: string | null; value: number }> = {};
  for (const key of KEYS) {
    result[key] = map[key] || { id: null, value: 0 };
  }
  return result;
}

export async function updateWorkPeriodSettings(data: Record<string, number>, userId?: string) {
  const KEYS = ['WORKING_DAYS_PER_PERIOD', 'WORKING_DAYS_PER_MONTH', 'HOURS_PER_DAY', 'DAYS_PER_MONTH'];

  for (const [key, val] of Object.entries(data)) {
    if (val === undefined || !KEYS.includes(key)) continue;

    const existing = await prisma.systemSetting.findFirst({
      where: { settingName: key, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (existing) {
      await prisma.systemSetting.update({
        where: { id: existing.id },
        data: { settingValue: String(val), lastUpdatedBy: userId || 'admin' },
      });
    } else {
      await prisma.systemSetting.create({
        data: {
          settingName: key,
          settingValue: String(val),
          dataType: 'NUMBER' as DataType,
          isActive: true,
          effectiveFrom: new Date(),
          lastUpdatedBy: userId || 'admin',
        },
      });
    }
  }

  invalidateCache();
}

export async function getSeedSettings() {
  const count = await prisma.systemSetting.count();
  if (count === 0) {
    const defaults = [
      { settingName: 'COMPANY_NAME', settingValue: 'Bantu Payroll', dataType: 'TEXT' },
      { settingName: 'WORKING_DAYS_PER_PERIOD', settingValue: '22', dataType: 'NUMBER' },
      { settingName: 'HOURS_PER_DAY', settingValue: '8', dataType: 'NUMBER' },
      { settingName: 'DAYS_PER_MONTH', settingValue: '30', dataType: 'NUMBER' },
      { settingName: 'NSSA_EMPLOYEE_RATE', settingValue: '0.045', dataType: 'NUMBER' },
      { settingName: 'NSSA_EMPLOYER_RATE', settingValue: '0.045', dataType: 'NUMBER' },
      { settingName: 'NSSA_CEILING_USD', settingValue: '700', dataType: 'NUMBER' },
      { settingName: 'AIDS_LEVY_RATE', settingValue: '0.03', dataType: 'NUMBER' },
    ];

    for (const s of defaults) {
      await prisma.systemSetting.create({ data: { ...s, dataType: s.dataType as DataType, effectiveFrom: new Date(), isActive: true } });
    }

    invalidateCache();
    return { message: 'Settings seeded', settings: await getAll() };
  }

  return { message: 'Settings already exist', settings: await getAll() };
}
