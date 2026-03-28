const prisma = require('./prisma');

// In-memory cache with 5-minute TTL — avoids repeated DB hits on every payroll request.
// The cache is invalidated whenever a setting is written (via the admin route or seed).
const CACHE_TTL_MS = 5 * 60 * 1000;
let _cache = null;      // Map<settingName, settingValue>
let _cacheExpiry = 0;

const _loadAll = async () => {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;

  const rows = await prisma.systemSetting.findMany({
    where: { isActive: true },
    orderBy: { effectiveFrom: 'desc' },
  });

  // Deduplicate: keep most-recent value per name
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.settingName)) map.set(r.settingName, r.settingValue);
  }

  _cache = map;
  _cacheExpiry = now + CACHE_TTL_MS;
  return map;
};

/**
 * Invalidate the in-memory cache (call after any write to SystemSetting).
 */
const invalidateSettingsCache = () => {
  _cache = null;
  _cacheExpiry = 0;
};

/**
 * Get the most-recently-effective active setting by name.
 */
const getSetting = async (name) => {
  const map = await _loadAll();
  const value = map.get(name);
  if (value === undefined) return null;
  return { settingName: name, settingValue: value };
};

/**
 * Batch-fetch multiple settings by name. Returns a map of { name: value }.
 */
const getSettings = async (names) => {
  const map = await _loadAll();
  const result = {};
  for (const name of names) {
    if (map.has(name)) result[name] = map.get(name);
  }
  return result;
};

const getSettingAsNumber = async (name, defaultValue = 0) => {
  const s = await getSetting(name);
  if (!s) return defaultValue;
  const n = parseFloat(s.settingValue);
  return isNaN(n) ? defaultValue : n;
};

const getSettingAsBoolean = async (name, defaultValue = false) => {
  const s = await getSetting(name);
  if (!s) return defaultValue;
  return s.settingValue === 'true';
};

const getSettingAsString = async (name, defaultValue = '') => {
  const s = await getSetting(name);
  return s ? s.settingValue : defaultValue;
};

module.exports = {
  getSetting,
  getSettings,
  getSettingAsNumber,
  getSettingAsBoolean,
  getSettingAsString,
  invalidateSettingsCache,
};
