const prisma = require('../lib/prisma');

/**
 * Ensures that critical system settings exist in the database with default values.
 * This handles cases where a developer adds a new setting dependency but the 
 * setting hasn't been manually created in the database yet.
 */
async function autoSeedSystemSettings() {
  console.log('[Seed] Checking for missing system settings...');
  
  const defaults = [
    {
      settingName: 'WORKING_DAYS_PER_MONTH',
      settingValue: '22',
      dataType: 'NUMBER',
      description: 'Legacy monthly working days fallback. See WORKING_DAYS_PER_PERIOD.',
      isActive: true
    },
    {
      settingName: 'WORKING_DAYS_PER_PERIOD',
      settingValue: '22',
      dataType: 'NUMBER',
      description: 'Default number of working days in a payroll period. Used for pro-rating, short-time, and daily rate calculations when not specified on the employee profile.',
      isActive: true
    },
    {
        settingName: 'LOAN_PRESCRIBED_RATE_USD',
        settingValue: '15',
        dataType: 'NUMBER',
        description: 'ZIMRA prescribed interest rate for USD loans (for Deemed Interest calculation).',
        isActive: true
    },
    {
        settingName: 'LOAN_PRESCRIBED_RATE_ZIG',
        settingValue: '150',
        dataType: 'NUMBER',
        description: 'ZIMRA prescribed interest rate for ZiG loans (for Deemed Interest calculation).',
        isActive: true
    }
  ];

  for (const item of defaults) {
    const existing = await prisma.systemSetting.findFirst({
      where: { settingName: item.settingName }
    });

    if (!existing) {
      console.log(`[Seed] Creating missing setting: ${item.settingName} = ${item.settingValue}`);
      await prisma.systemSetting.create({
        data: {
          ...item,
          effectiveFrom: new Date('2024-01-01'),
          lastUpdatedBy: 'System Auto-Seed'
        }
      });
    }
  }
}

module.exports = { autoSeedSystemSettings };
