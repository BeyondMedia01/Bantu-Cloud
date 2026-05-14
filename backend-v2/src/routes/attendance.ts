import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json([]);
  const where: Record<string, unknown> = { companyId };

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, shift: true },
    orderBy: { date: 'desc' },
  });
  return c.json(records);
});

router.get('/logs', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json([]);
  const where: Record<string, unknown> = { companyId };

  const logs = await prisma.attendanceLog.findMany({
    where,
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, device: true },
    orderBy: { punchTime: 'desc' },
  });
  return c.json(logs);
});

router.get('/summary', async (c) => {
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const companyId = c.get('companyId');
  if (!companyId) return c.json([]);

  const where: Record<string, unknown> = { companyId };
  if (startDate) where.date = { gte: new Date(startDate) };
  if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate);

  const records = await prisma.attendanceRecord.findMany({
    where,
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    orderBy: [{ employeeId: 'asc' }, { date: 'asc' }],
  });
  return c.json(records);
});

router.put('/:id', async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { id } = c.req.param();
  const existing = await prisma.attendanceRecord.findUnique({ where: { id }, select: { companyId: true } });
  if (!existing) return c.json({ message: 'Attendance record not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const body = await c.req.json();
  const updated = await prisma.attendanceRecord.update({ where: { id }, data: { ...body, isManualOverride: true } });
  return c.json(updated);
});

const processSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  employeeIds: z.array(z.string()).optional(),
});

router.post('/process', requirePermission('process_payroll'), validateBody(processSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { startDate, endDate, employeeIds } = c.req.valid('json');
  const logWhere: Record<string, unknown> = {
    companyId,
    processed: false,
    punchTime: { gte: new Date(startDate), lte: new Date(endDate) },
  };
  if (employeeIds && employeeIds.length > 0) logWhere.employeeId = { in: employeeIds };
  const logs = await prisma.attendanceLog.findMany({
    where: logWhere as any,
    orderBy: { punchTime: 'asc' },
  });
  const grouped: Record<string, { date: string; clockIn?: Date; clockOut?: Date }> = {};
  for (const log of logs) {
    if (!log.employeeId) continue;
    const key = `${log.employeeId}_${log.punchTime.toISOString().slice(0, 10)}`;
    if (!grouped[key]) grouped[key] = { date: log.punchTime.toISOString().slice(0, 10) };
    if (!grouped[key].clockIn || log.punchTime < grouped[key].clockIn!) grouped[key].clockIn = log.punchTime;
    if (!grouped[key].clockOut || log.punchTime > grouped[key].clockOut!) grouped[key].clockOut = log.punchTime;
  }
  let created = 0;
  for (const [key, val] of Object.entries(grouped)) {
    const [employeeId] = key.split('_');
    const minutes = val.clockIn && val.clockOut ? Math.round((val.clockOut.getTime() - val.clockIn.getTime()) / 60000) : 0;
    const normalMinutes = Math.min(minutes, 480);
    const otMinutes = Math.max(0, minutes - 480);
    await prisma.attendanceRecord.upsert({
      where: { employeeId_date: { employeeId, date: new Date(val.date) } },
      update: { clockIn: val.clockIn, clockOut: val.clockOut, totalMinutes: minutes, normalMinutes, ot0Minutes: otMinutes, isManualOverride: false },
      create: { employeeId, companyId, date: new Date(val.date), clockIn: val.clockIn, clockOut: val.clockOut, totalMinutes: minutes, normalMinutes, ot0Minutes: otMinutes },
    });
    created++;
  }
  const updateWhere: Record<string, unknown> = {
    companyId,
    processed: false,
    punchTime: { gte: new Date(startDate), lte: new Date(endDate) },
  };
  if (employeeIds && employeeIds.length > 0) updateWhere.employeeId = { in: employeeIds };
  await prisma.attendanceLog.updateMany({ where: updateWhere as any, data: { processed: true } });
  return c.json({ message: `Processed ${created} attendance records from ${logs.length} logs` });
});

const manualLogSchema = z.object({
  employeeId: z.string().min(1),
  timestamp: z.string().min(1),
  punchType: z.string().optional(),
  deviceId: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/manual', requirePermission('manage_employees'), validateBody(manualLogSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const body = c.req.valid('json');
  const log = await prisma.attendanceLog.create({
    data: {
      companyId,
      employeeId: body.employeeId,
      deviceId: body.deviceId || null,
      punchTime: new Date(body.timestamp),
      punchType: body.punchType || 'MANUAL',
      source: body.source || 'MANUAL',
      processed: true,
    },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, device: true },
  });
  return c.json(log, 201);
});

const generateInputsSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  period: z.string().min(1),
  normalTcId: z.string().optional(),
  ot0TcId: z.string().optional(),
  ot1TcId: z.string().optional(),
  ot2TcId: z.string().optional(),
  payrollRunId: z.string().optional(),
  employeeIds: z.array(z.string()).optional(),
});

router.post('/generate-inputs', requirePermission('process_payroll'), validateBody(generateInputsSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { startDate, endDate, period, normalTcId, ot0TcId, ot1TcId, ot2TcId, payrollRunId, employeeIds } = c.req.valid('json');

  const recordWhere: Record<string, unknown> = {
    companyId,
    date: { gte: new Date(startDate), lte: new Date(endDate) },
  };
  if (employeeIds && employeeIds.length > 0) recordWhere.employeeId = { in: employeeIds };

  const records = await prisma.attendanceRecord.findMany({
    where: recordWhere as any,
  });

  let created = 0;
  for (const rec of records) {
    const entries: { tcId: string; minutes: number; label: string }[] = [];
    if (normalTcId) entries.push({ tcId: normalTcId, minutes: rec.normalMinutes, label: 'Normal' });
    if (ot0TcId) entries.push({ tcId: ot0TcId, minutes: rec.ot0Minutes, label: 'OT0' });
    if (ot1TcId) entries.push({ tcId: ot1TcId, minutes: rec.ot1Minutes, label: 'OT1' });
    if (ot2TcId) entries.push({ tcId: ot2TcId, minutes: rec.ot2Minutes, label: 'OT2' });
    for (const { tcId, minutes, label } of entries) {
      if (minutes <= 0) continue;
      const existing = await prisma.payrollInput.findFirst({
        where: { employeeId: rec.employeeId, transactionCodeId: tcId, period },
      });
      if (existing) continue;
      await prisma.payrollInput.create({
        data: {
          employeeId: rec.employeeId,
          payrollRunId: payrollRunId || null,
          transactionCodeId: tcId,
          period,
          employeeUSD: 0,
          employeeZiG: 0,
          units: minutes / 60,
          unitsType: 'HOURS',
          notes: `Auto-generated from attendance (${label}) ${startDate} to ${endDate}`,
        },
      });
      created++;
    }
  }
  return c.json({ message: `Generated ${created} payroll inputs from ${records.length} attendance records` });
});

export default router;
