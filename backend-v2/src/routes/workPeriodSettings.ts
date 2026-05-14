import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const KEYS = ['WORKING_DAYS_PER_PERIOD', 'WORKING_DAYS_PER_MONTH', 'HOURS_PER_DAY', 'DAYS_PER_MONTH'] as const;

const workPeriodSchema = z.object({
  WORKING_DAYS_PER_PERIOD: z.number().optional(),
  WORKING_DAYS_PER_MONTH: z.number().optional(),
  HOURS_PER_DAY: z.number().optional(),
  DAYS_PER_MONTH: z.number().optional(),
});

router.get('/', async (c) => {
  const rows = await prisma.systemSetting.findMany({
    where: { settingName: { in: [...KEYS] }, isActive: true },
    orderBy: { effectiveFrom: 'desc' },
  });

  const map: Record<string, any> = {};
  for (const r of rows) {
    if (!map[r.settingName]) map[r.settingName] = r;
  }

  const result: Record<string, { id: string | null; value: number }> = {};
  for (const key of KEYS) {
    result[key] = map[key]
      ? { id: map[key].id, value: parseFloat(map[key].settingValue) }
      : { id: null, value: 0 };
  }

  return c.json(result);
});

router.put('/', requirePermission('update_settings'), validateBody(workPeriodSchema), async (c) => {
  const body = c.req.valid('json');
  const user = c.get('user');

  for (const [key, val] of Object.entries(body)) {
    if (val === undefined) continue;

    const existing = await prisma.systemSetting.findFirst({
      where: { settingName: key, isActive: true },
      orderBy: { effectiveFrom: 'desc' },
    });

    if (existing) {
      await prisma.systemSetting.update({
        where: { id: existing.id },
        data: { settingValue: String(val), lastUpdatedBy: user?.email || 'admin' },
      });
    } else {
      await prisma.systemSetting.create({
        data: {
          settingName: key,
          settingValue: String(val),
          dataType: 'NUMBER',
          isActive: true,
          effectiveFrom: new Date(),
          lastUpdatedBy: user?.email || 'admin',
        },
      });
    }
  }

  return c.json({ message: 'Work period settings saved' });
});

export default router;
