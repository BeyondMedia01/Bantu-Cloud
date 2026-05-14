import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const RATES_KEYS = {
  SDF_RATE: 'SDF_RATE',
  ZIMDEF_RATE: 'ZIMDEF_RATE',
};

const updateRatesSchema = z.object({
  sdfRate: z.number(),
  zimdefRate: z.number(),
});

router.get('/', async (c) => {
  const rows = await prisma.systemSetting.findMany({
    where: {
      settingName: { in: Object.values(RATES_KEYS) },
      isActive: true,
    },
  });

  const byKey = Object.fromEntries(rows.map((r: { settingName: string; settingValue: string }) => [r.settingName, r.settingValue]));

  return c.json({
    sdfRate: parseFloat(byKey[RATES_KEYS.SDF_RATE] ?? '0.005'),
    zimdefRate: parseFloat(byKey[RATES_KEYS.ZIMDEF_RATE] ?? '0.01'),
  });
});

router.put('/', requirePermission('update_settings'), validateBody(updateRatesSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');

  const updates = [
    { key: RATES_KEYS.SDF_RATE, value: String(body.sdfRate), desc: 'Standards Development Fund rate (%)' },
    { key: RATES_KEYS.ZIMDEF_RATE, value: String(body.zimdefRate), desc: 'Zimbabwe Manpower Development Fund rate (%)' },
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
    action: 'STATUTORY_RATES_UPDATED',
    resource: 'system_setting',
    details: { sdfRate: body.sdfRate, zimdefRate: body.zimdefRate },
  });

  return c.json({ message: 'Statutory rates updated' });
});

export default router;
