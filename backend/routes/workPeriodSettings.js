const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../lib/auth');
const { requirePermission } = require('../lib/permissions');

router.use(authenticateToken);

const KEYS = ['WORKING_DAYS_PER_PERIOD', 'WORKING_DAYS_PER_MONTH', 'HOURS_PER_DAY', 'DAYS_PER_MONTH'];

// GET /api/work-period-settings
router.get('/', async (req, res) => {
  try {
    const rows = await prisma.systemSetting.findMany({
      where: { settingName: { in: KEYS }, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });
    // deduplicate: keep most recent per key
    const map = {};
    for (const r of rows) {
      if (!map[r.settingName]) map[r.settingName] = r;
    }
    const result = {};
    for (const key of KEYS) {
      result[key] = map[key] ? { id: map[key].id, value: parseFloat(map[key].settingValue) } : { id: null, value: 0 };
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch work period settings' });
  }
});

// PUT /api/work-period-settings
router.put('/', requirePermission('update_settings'), async (req, res) => {
  const { WORKING_DAYS_PER_PERIOD, WORKING_DAYS_PER_MONTH, HOURS_PER_DAY, DAYS_PER_MONTH } = req.body;
  const updates = { WORKING_DAYS_PER_PERIOD, WORKING_DAYS_PER_MONTH, HOURS_PER_DAY, DAYS_PER_MONTH };

  try {
    for (const [key, val] of Object.entries(updates)) {
      if (val === undefined) continue;
      const existing = await prisma.systemSetting.findFirst({
        where: { settingName: key, isActive: true },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (existing) {
        await prisma.systemSetting.update({
          where: { id: existing.id },
          data: { settingValue: String(val), lastUpdatedBy: req.user?.email || 'admin' },
        });
      } else {
        await prisma.systemSetting.create({
          data: {
            settingName: key,
            settingValue: String(val),
            dataType: 'NUMBER',
            isActive: true,
            effectiveFrom: new Date(),
            lastUpdatedBy: req.user?.email || 'admin',
          },
        });
      }
    }
    res.json({ message: 'Work period settings saved' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save work period settings' });
  }
});

module.exports = router;
