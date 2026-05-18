import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const SETTING_KEY = 'TRADE_UNION_RATES';

const unionSchema = z.object({
  unions: z.array(z.object({
    name: z.string().min(1),
    rate: z.number().min(0).max(100),
    fixedAmount: z.number().min(0).optional(),
    currency: z.enum(['USD', 'ZiG']).optional(),
  })),
});

router.get('/', async (c) => {
  const clientId = c.get('clientId');
  const row = await prisma.systemSetting.findFirst({
    where: { settingName: SETTING_KEY, clientId: clientId ?? undefined, isActive: true },
  });
  const unions = row ? JSON.parse(row.settingValue) : [];
  return c.json({ unions });
});

router.put('/', requirePermission('update_settings'), validateBody(unionSchema), async (c) => {
  const clientId = c.get('clientId');
  const user = c.get('user');
  const { unions } = c.req.valid('json');

  await prisma.systemSetting.updateMany({
    where: { settingName: SETTING_KEY, clientId: clientId ?? undefined, isActive: true },
    data: { isActive: false },
  });

  await prisma.systemSetting.create({
    data: {
      settingName: SETTING_KEY,
      settingValue: JSON.stringify(unions),
      dataType: 'JSON',
      clientId: clientId ?? undefined,
      description: 'Trade union subscription rates',
      isActive: true,
      effectiveFrom: new Date(),
      lastUpdatedBy: user?.email ?? 'system',
    },
  });

  return c.json({ message: 'Trade union rates saved', unions });
});

export default router;
