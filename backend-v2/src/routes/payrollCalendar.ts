import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const createSchema = z.object({
  periodType: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().optional(),
  payDay: z.number().int().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

const updateSchema = z.object({
  periodType: z.string().optional(),
  year: z.number().int().optional(),
  month: z.number().int().optional(),
  payDay: z.number().int().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

router.get('/', async (c) => {
  const clientId = c.get('clientId');
  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (c.req.query('year')) where.year = parseInt(c.req.query('year')!);
  if (c.req.query('isClosed') !== undefined) where.isClosed = c.req.query('isClosed') === 'true';

  const calendars = await prisma.payrollCalendar.findMany({
    where,
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  return c.json(calendars);
});

router.post('/', requirePermission('manage_payroll'), validateBody(createSchema), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);
  const body = c.req.valid('json');

  const existing = await prisma.payrollCalendar.findFirst({
    where: { clientId, year: body.year, month: body.month || null },
  });
  if (existing) {
    return c.json({ message: 'A payroll calendar already exists for this year and month' }, 400);
  }

  const d = new Date(body.startDate);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;

  const calendar = await prisma.payrollCalendar.create({
    data: {
      clientId,
      periodType: body.periodType || 'MONTHLY',
      year: y,
      month: m,
      payDay: body.payDay || 25,
      startDate: d,
      endDate: new Date(body.endDate),
    },
  });
  return c.json(calendar, 201);
});

router.get('/:id', async (c) => {
  const calendar = await prisma.payrollCalendar.findUnique({
    where: { id: c.req.param('id') },
    include: { _count: { select: { payrollRuns: true } } },
  });
  if (!calendar) return c.json({ message: 'Payroll calendar not found' }, 404);
  return c.json(calendar);
});

router.put('/:id', requirePermission('manage_payroll'), async (c) => {
  const existing = await prisma.payrollCalendar.findUnique({ where: { id: c.req.param('id') } });
  if (!existing) return c.json({ message: 'Payroll calendar not found' }, 404);
  if (existing.isClosed) return c.json({ message: 'Cannot update a closed payroll calendar' }, 400);

  const body = await c.req.json();
  const data: Record<string, unknown> = {};
  if (body.periodType) data.periodType = body.periodType;
  if (body.year) data.year = parseInt(body.year);
  if (body.month !== undefined) data.month = body.month ? parseInt(body.month) : null;
  if (body.payDay !== undefined) data.payDay = body.payDay ? parseInt(body.payDay) : null;
  if (body.startDate) data.startDate = new Date(body.startDate);
  if (body.endDate) data.endDate = new Date(body.endDate);

  const calendar = await prisma.payrollCalendar.update({
    where: { id: c.req.param('id') },
    data,
  });
  return c.json(calendar);
});

router.post('/:id/close', requirePermission('approve_payroll'), async (c) => {
  const calendar = await prisma.payrollCalendar.findUnique({ where: { id: c.req.param('id') } });
  if (!calendar) return c.json({ message: 'Payroll calendar not found' }, 404);
  if (calendar.isClosed) return c.json({ message: 'Period is already closed' }, 400);

  const updated = await prisma.payrollCalendar.update({
    where: { id: c.req.param('id') },
    data: { isClosed: true },
  });
  return c.json(updated);
});

router.delete('/:id', requirePermission('manage_payroll'), async (c) => {
  const existing = await prisma.payrollCalendar.findUnique({ where: { id: c.req.param('id') } });
  if (!existing) return c.json({ message: 'Payroll calendar not found' }, 404);
  if (existing.isClosed) return c.json({ message: 'Cannot delete a closed payroll calendar' }, 400);

  await prisma.payrollCalendar.delete({ where: { id: c.req.param('id') } });
  return c.body(null, 204);
});

export default router;
