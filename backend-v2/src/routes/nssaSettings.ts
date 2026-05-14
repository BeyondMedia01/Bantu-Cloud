import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const NSSA_KEYS = {
  EMPLOYEE_RATE: 'NSSA_EMPLOYEE_RATE',
  EMPLOYER_RATE: 'NSSA_EMPLOYER_RATE',
  EMPLOYEE_RATE_ZIG: 'NSSA_EMPLOYEE_RATE_ZIG',
  EMPLOYER_RATE_ZIG: 'NSSA_EMPLOYER_RATE_ZIG',
  CEILING_USD: 'NSSA_CEILING_USD',
  CEILING_ZIG: 'NSSA_CEILING_ZIG',
  WCIF_RATE: 'WCIF_RATE',
};

const updateNssaSchema = z.object({
  employeeRate: z.number(),
  employerRate: z.number(),
  employeeRateZIG: z.number().optional(),
  employerRateZIG: z.number().optional(),
  ceilingUSD: z.number(),
  ceilingZIG: z.number().optional(),
  wcifRate: z.number(),
});

router.get('/', async (c) => {
  const rows = await prisma.systemSetting.findMany({
    where: {
      settingName: { in: Object.values(NSSA_KEYS) },
      isActive: true,
    },
  });

  const byKey = Object.fromEntries(rows.map((r: { settingName: string; settingValue: string }) => [r.settingName, r.settingValue]));

  const usdEmpRate = parseFloat(byKey[NSSA_KEYS.EMPLOYEE_RATE] ?? '4.5');
  const usdEmprRate = parseFloat(byKey[NSSA_KEYS.EMPLOYER_RATE] ?? '4.5');

  return c.json({
    employeeRate: usdEmpRate,
    employerRate: usdEmprRate,
    employeeRateZIG: parseFloat(byKey[NSSA_KEYS.EMPLOYEE_RATE_ZIG] ?? String(usdEmpRate)),
    employerRateZIG: parseFloat(byKey[NSSA_KEYS.EMPLOYER_RATE_ZIG] ?? String(usdEmprRate)),
    ceilingUSD: parseFloat(byKey[NSSA_KEYS.CEILING_USD] ?? '700'),
    ceilingZIG: parseFloat(byKey[NSSA_KEYS.CEILING_ZIG] ?? '18000'),
    wcifRate: parseFloat(byKey[NSSA_KEYS.WCIF_RATE] ?? '0.01'),
  });
});

router.put('/', requirePermission('update_settings'), validateBody(updateNssaSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');

  const updates = [
    { key: NSSA_KEYS.EMPLOYEE_RATE, value: String(body.employeeRate), desc: 'NSSA employee contribution rate for USD payrolls (%)' },
    { key: NSSA_KEYS.EMPLOYER_RATE, value: String(body.employerRate), desc: 'NSSA employer contribution rate for USD payrolls (%)' },
    { key: NSSA_KEYS.EMPLOYEE_RATE_ZIG, value: String(body.employeeRateZIG ?? body.employeeRate), desc: 'NSSA employee contribution rate for ZiG payrolls (%)' },
    { key: NSSA_KEYS.EMPLOYER_RATE_ZIG, value: String(body.employerRateZIG ?? body.employerRate), desc: 'NSSA employer contribution rate for ZiG payrolls (%)' },
    { key: NSSA_KEYS.CEILING_USD, value: String(body.ceilingUSD), desc: 'NSSA maximum insurable earnings ceiling (USD/month)' },
    { key: NSSA_KEYS.CEILING_ZIG, value: String(body.ceilingZIG ?? 18000), desc: 'NSSA maximum insurable earnings ceiling (ZiG/month)' },
    { key: NSSA_KEYS.WCIF_RATE, value: String(body.wcifRate), desc: 'Workmans Compensation Insurance Fund rate (%)' },
  ];

  for (const { key, value, desc } of updates) {
    await prisma.systemSetting.updateMany({
      where: { settingName: key, isActive: true },
      data: { isActive: false },
    });

    await prisma.systemSetting.create({
      data: {
        settingName: key,
        settingValue: value,
        dataType: 'NUMBER',
        description: desc,
        isActive: true,
        effectiveFrom: new Date(),
        lastUpdatedBy: user?.email ?? 'system',
      },
    });
  }

  await audit({
    c,
    action: 'NSSA_SETTINGS_UPDATED',
    resource: 'system_setting',
    details: {
      employeeRate: body.employeeRate,
      employerRate: body.employerRate,
      employeeRateZIG: body.employeeRateZIG,
      employerRateZIG: body.employerRateZIG,
      ceilingUSD: body.ceilingUSD,
      ceilingZIG: body.ceilingZIG,
      wcifRate: body.wcifRate,
    },
  });

  return c.json({ message: 'NSSA settings updated' });
});

export default router;
