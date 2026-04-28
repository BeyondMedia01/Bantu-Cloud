const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

// NSSA setting keys stored in SystemSetting
const NSSA_KEYS = {
  EMPLOYEE_RATE:     'NSSA_EMPLOYEE_RATE',
  EMPLOYER_RATE:     'NSSA_EMPLOYER_RATE',
  EMPLOYEE_RATE_ZIG: 'NSSA_EMPLOYEE_RATE_ZIG',
  EMPLOYER_RATE_ZIG: 'NSSA_EMPLOYER_RATE_ZIG',
  CEILING_USD:       'NSSA_CEILING_USD',
  CEILING_ZIG:       'NSSA_CEILING_ZIG',
  WCIF_RATE:         'WCIF_RATE',
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

    const usdEmpRate = parseFloat(byKey[NSSA_KEYS.EMPLOYEE_RATE] ?? '4.5');
    const usdEmprRate = parseFloat(byKey[NSSA_KEYS.EMPLOYER_RATE] ?? '4.5');
    res.json({
      employeeRate:    usdEmpRate,
      employerRate:    usdEmprRate,
      employeeRateZIG: parseFloat(byKey[NSSA_KEYS.EMPLOYEE_RATE_ZIG] ?? String(usdEmpRate)),
      employerRateZIG: parseFloat(byKey[NSSA_KEYS.EMPLOYER_RATE_ZIG] ?? String(usdEmprRate)),
      ceilingUSD:      parseFloat(byKey[NSSA_KEYS.CEILING_USD]       ?? '700'),
      ceilingZIG:      parseFloat(byKey[NSSA_KEYS.CEILING_ZIG]       ?? '18000'),
      wcifRate:        parseFloat(byKey[NSSA_KEYS.WCIF_RATE]         ?? '0.01'),
    });
  } catch (err) {
    console.error('NSSA settings GET error:', err);
    res.status(500).json({ message: 'Failed to load NSSA settings' });
  }
});

// PUT /api/nssa-settings — upsert NSSA values
router.put('/', requirePermission('update_settings'), async (req, res) => {
  const { employeeRate, employerRate, employeeRateZIG, employerRateZIG, ceilingUSD, ceilingZIG, wcifRate } = req.body;

  const updates = [
    { key: NSSA_KEYS.EMPLOYEE_RATE,     value: String(employeeRate),                desc: 'NSSA employee contribution rate for USD payrolls (%)' },
    { key: NSSA_KEYS.EMPLOYER_RATE,     value: String(employerRate),                desc: 'NSSA employer contribution rate for USD payrolls (%)' },
    { key: NSSA_KEYS.EMPLOYEE_RATE_ZIG, value: String(employeeRateZIG ?? employeeRate), desc: 'NSSA employee contribution rate for ZiG payrolls (%)' },
    { key: NSSA_KEYS.EMPLOYER_RATE_ZIG, value: String(employerRateZIG ?? employerRate), desc: 'NSSA employer contribution rate for ZiG payrolls (%)' },
    { key: NSSA_KEYS.CEILING_USD,       value: String(ceilingUSD),                  desc: 'NSSA maximum insurable earnings ceiling (USD/month)' },
    { key: NSSA_KEYS.CEILING_ZIG,       value: String(ceilingZIG ?? 18000),         desc: 'NSSA maximum insurable earnings ceiling (ZiG/month)' },
    { key: NSSA_KEYS.WCIF_RATE,         value: String(wcifRate),                    desc: 'Workmans Compensation Insurance Fund rate (%)' },
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
      details: { employeeRate, employerRate, employeeRateZIG, employerRateZIG, ceilingUSD, ceilingZIG, wcifRate },
    });

    res.json({ message: 'NSSA settings updated' });
  } catch (err) {
    console.error('NSSA settings PUT error:', err);
    res.status(500).json({ message: 'Failed to save NSSA settings' });
  }
});

module.exports = router;
