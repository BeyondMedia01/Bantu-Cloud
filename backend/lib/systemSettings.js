const prisma = require('./prisma');

/**
 * Get the most-recently-effective active setting by name.
 */
const getSetting = async (name) => {
  return prisma.systemSetting.findFirst({
    where: { settingName: name, isActive: true },
    orderBy: { effectiveFrom: 'desc' },
  });
};

/**
 * Batch-fetch multiple settings by name. Returns a map of { name: value }.
 */
const getSettings = async (names) => {
  const settings = await prisma.systemSetting.findMany({
    where: { settingName: { in: names }, isActive: true },
    orderBy: { effectiveFrom: 'desc' },
  });

  // deduplicate: keep most recent for each name
  const map = {};
  for (const s of settings) {
    if (!map[s.settingName]) map[s.settingName] = s.settingValue;
  }
  return map;
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
};
