const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

// NSSA setting keys stored in SystemSetting
const NSSA_KEYS = {
  EMPLOYEE_RATE: 'NSSA_EMPLOYEE_RATE',
  EMPLOYER_RATE: 'NSSA_EMPLOYER_RATE',
  CEILING_USD:   'NSSA_CEILING_USD',
};

// GET /api/nssa-settings — return current NSSA rates
router.get('/', async (req, res) => {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: {
        settingName: { in: Object.values(NSSA_KEYS) },
        isActive: true,
      },
    });

    const byKey = Object.fromEntries(rows.map((r) => [r.settingName, r.settingValue]));

    res.json({
      employeeRate: parseFloat(byKey[NSSA_KEYS.EMPLOYEE_RATE] ?? '4.5'),
      employerRate: parseFloat(byKey[NSSA_KEYS.EMPLOYER_RATE] ?? '4.5'),
      ceilingUSD:   parseFloat(byKey[NSSA_KEYS.CEILING_USD]   ?? '700'),
    });
  } catch (err) {
    console.error('NSSA settings GET error:', err);
    res.status(500).json({ message: 'Failed to load NSSA settings' });
  }
});

// PUT /api/nssa-settings — upsert the three NSSA values
router.put('/', requirePermission('update_settings'), async (req, res) => {
  const { employeeRate, employerRate, ceilingUSD } = req.body;

  const updates = [
    { key: NSSA_KEYS.EMPLOYEE_RATE, value: String(employeeRate), desc: 'NSSA employee contribution rate (%)' },
    { key: NSSA_KEYS.EMPLOYER_RATE, value: String(employerRate), desc: 'NSSA employer contribution rate (%)' },
    { key: NSSA_KEYS.CEILING_USD,   value: String(ceilingUSD),   desc: 'NSSA maximum insurable earnings ceiling (USD/month)' },
  ];

  const user = req.user;

  try {
    for (const { key, value, desc } of updates) {
      // Deactivate any previous active entry for this key
      await prisma.systemSetting.updateMany({
        where: { settingName: key, isActive: true },
        data:  { isActive: false },
      });

      await prisma.systemSetting.create({
        data: {
          settingName:   key,
          settingValue:  value,
          dataType:      'NUMBER',
          description:   desc,
          isActive:      true,
          effectiveFrom: new Date(),
          lastUpdatedBy: user?.email ?? 'system',
        },
      });
    }

    await audit({
      req,
      action: 'NSSA_SETTINGS_UPDATED',
      resource: 'system_setting',
      details: { employeeRate, employerRate, ceilingUSD },
    });

    res.json({ message: 'NSSA settings updated' });
  } catch (err) {
    console.error('NSSA settings PUT error:', err);
    res.status(500).json({ message: 'Failed to save NSSA settings' });
  }
});

module.exports = router;
