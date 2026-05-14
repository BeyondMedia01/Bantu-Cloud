import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { requireRole } from '../lib/auth';
import * as seedService from '../services/seed.service';

const router = new Hono();

const holidaySeedSchema = z.object({
  year: z.number().optional(),
});

router.post('/', requireRole('PLATFORM_ADMIN'), async (c) => {
  try {
    const result = await seedService.seedAll();
    return c.json(result);
  } catch (err: any) {
    console.error('[Seed] seedAll failed:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

router.post('/settings', requireRole('PLATFORM_ADMIN'), async (c) => {
  try {
    const result = await seedService.seedSettings();
    return c.json(result);
  } catch (err: any) {
    console.error('[Seed] seedSettings failed:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

router.post('/holidays', requireRole('PLATFORM_ADMIN'), validateBody(holidaySeedSchema), async (c) => {
  try {
    const { year } = c.req.valid('json');
    const result = await seedService.seedHolidays(year);
    return c.json(result);
  } catch (err: any) {
    console.error('[Seed] seedHolidays failed:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;
