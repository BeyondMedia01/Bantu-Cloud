const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const RATES_KEYS = {
  SDF_RATE:    'SDF_RATE',
  ZIMDEF_RATE: 'ZIMDEF_RATE',
};

// GET /api/statutory-rates
router.get('/', async (req, res) => {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: {
        settingName: { in: Object.values(RATES_KEYS) },
        isActive: true,
      },
    });

    const byKey = Object.fromEntries(rows.map((r) => [r.settingName, r.settingValue]));

    res.json({
      sdfRate:    parseFloat(byKey[RATES_KEYS.SDF_RATE]    ?? '0.005'),
      zimdefRate: parseFloat(byKey[RATES_KEYS.ZIMDEF_RATE] ?? '0.01'),
    });
  } catch (err) {
    console.error('Statutory rates GET error:', err);
    res.status(500).json({ message: 'Failed to load statutory rates' });
  }
});

// PUT /api/statutory-rates
router.put('/', requirePermission('update_settings'), async (req, res) => {
  const { sdfRate, zimdefRate } = req.body;

  const updates = [
    { key: RATES_KEYS.SDF_RATE,    value: String(sdfRate),    desc: 'Standards Development Fund rate (%)' },
    { key: RATES_KEYS.ZIMDEF_RATE, value: String(zimdefRate), desc: 'Zimbabwe Manpower Development Fund rate (%)' },
  ];

  const user = req.user;

  try {
    for (const { key, value, desc } of updates) {
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
      action: 'STATUTORY_RATES_UPDATED',
      resource: 'system_setting',
      details: { sdfRate, zimdefRate },
    });

    res.json({ message: 'Statutory rates updated' });
  } catch (err) {
    console.error('Statutory rates PUT error:', err);
    res.status(500).json({ message: 'Failed to save statutory rates' });
  }
});

module.exports = router;
