import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const INCLUDE = {
  employee: { select: { firstName: true, lastName: true, employeeCode: true } },
  transactionCode: { select: { code: true, name: true, type: true } },
} as const;

const createSchema = z.object({
  employeeId: z.string().min(1),
  payrollRunId: z.string().optional(),
  transactionCodeId: z.string().min(1),
  period: z.string().min(1),
  employeeUSD: z.number().optional(),
  employeeZiG: z.number().optional(),
  employerUSD: z.number().optional(),
  employerZiG: z.number().optional(),
  units: z.number().optional(),
  unitsType: z.string().optional(),
  duration: z.string().optional(),
  balance: z.number().optional(),
  notes: z.string().optional(),
});

function pick(body: any) {
  return {
    employeeUSD: body.employeeUSD !== undefined
      ? parseFloat(body.employeeUSD) || 0
      : (body.amount !== undefined && body.currency !== 'ZiG' ? parseFloat(body.amount) || 0 : undefined),
    employeeZiG: body.employeeZiG !== undefined
      ? parseFloat(body.employeeZiG) || 0
      : (body.amount !== undefined && body.currency === 'ZiG' ? parseFloat(body.amount) || 0 : undefined),
    employerUSD: body.employerUSD !== undefined ? parseFloat(body.employerUSD) || 0 : undefined,
    employerZiG: body.employerZiG !== undefined ? parseFloat(body.employerZiG) || 0 : undefined,
    units: body.units !== undefined && body.units !== '' ? parseFloat(body.units) : null,
    unitsType: body.unitsType !== undefined ? body.unitsType || null : undefined,
    duration: body.duration || 'Indefinite',
    balance: body.balance !== undefined && body.balance !== '' ? parseFloat(body.balance) : 0,
    period: body.period,
    notes: body.notes !== undefined ? body.notes || null : undefined,
  };
}

async function checkPeriodLock(clientId: string, period: string): Promise<{ locked: boolean; message?: string }> {
  const [yyyy, mm] = period.split('-').map(Number);
  if (!yyyy || !mm) return { locked: false };
  const periodEnd = new Date(yyyy, mm, 0, 23, 59, 59);
  const periodStart = new Date(yyyy, mm - 1, 1);
  const locked = await prisma.payrollCalendar.findFirst({
    where: { clientId, isClosed: true, startDate: { lte: periodEnd }, endDate: { gte: periodStart } },
    select: { id: true },
  });
  if (locked) return { locked: true, message: `Period ${period} is locked. Unlock the payroll calendar first.` };
  return { locked: false };
}

router.get('/', async (c) => {
  const { payrollRunId, employeeId, processed, period } = c.req.query();
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  const where: Record<string, unknown> = {};
  if (payrollRunId) where.payrollRunId = payrollRunId;
  if (employeeId) where.employeeId = employeeId;
  if (processed !== undefined && processed !== '') where.processed = processed === 'true';
  if (period) {
    where.OR = [{ period }, { period: { lte: period }, duration: 'Indefinite' }];
  }
  if (companyId) where.employee = { companyId };
  else if (clientId) where.employee = { clientId };

  const inputs = await prisma.payrollInput.findMany({
    where,
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return c.json(inputs);
});

router.post('/import', requirePermission('process_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const fd = await c.req.formData();
  const file = fd.get('file');
  if (!file || typeof (file as any).text !== 'function') return c.json({ message: 'CSV file is required' }, 400);
  const text = await (file as any).text();
  const lines = text.split('\n').map((l: string) => l.trim()).filter(Boolean);
  if (lines.length < 2) return c.json({ message: 'CSV must have header + data rows' }, 400);
  const headers = lines[0].split(',');
  const codeIdx = headers.findIndex((h: string) => /code/i.test(h));
  const empIdx = headers.findIndex((h: string) => /employee|emp/i.test(h));
  const periodIdx = headers.findIndex((h: string) => /period/i.test(h));
  const usdIdx = headers.findIndex((h: string) => /usd|amount/i.test(h));
  const zigIdx = headers.findIndex((h: string) => /zig/i.test(h));
  if (codeIdx < 0 || empIdx < 0 || periodIdx < 0 || usdIdx < 0) return c.json({ message: 'CSV must have columns: employee, code, period, amount' }, 400);
  const allCodes = await prisma.transactionCode.findMany({ where: { clientId: clientId! }, select: { id: true, code: true } });
  const codeMap = new Map(allCodes.map((tc: any) => [tc.code, tc.id]));
  let imported = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((s: string) => s.trim());
    const code = cols[codeIdx];
    const txCodeId = codeMap.get(code);
    if (!txCodeId) continue;
    const employeeIdentifier = cols[empIdx];
    const emp = await prisma.employee.findFirst({ where: { companyId, OR: [{ employeeCode: employeeIdentifier }, { id: employeeIdentifier }] }, select: { id: true } });
    if (!emp) continue;
    await prisma.payrollInput.create({
      data: { employeeId: emp.id, transactionCodeId: txCodeId, period: cols[periodIdx], employeeUSD: parseFloat(cols[usdIdx]) || 0, employeeZiG: zigIdx >= 0 ? parseFloat(cols[zigIdx]) || 0 : 0 },
    });
    imported++;
  }
  return c.json({ imported });
});

router.post('/', requirePermission('process_payroll'), validateBody(createSchema), async (c) => {
  const body = c.req.valid('json');
  const companyId = c.get('companyId');

  if (body.period && companyId) {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { clientId: true } });
    if (company) {
      const lock = await checkPeriodLock(company.clientId, body.period);
      if (lock.locked) return c.json({ message: lock.message }, 423);
    }
  }

  const data = pick(body);
  (Object.keys(data) as (keyof typeof data)[]).forEach(k => data[k] === undefined && delete data[k]);
  const input = await prisma.payrollInput.create({
    data: {
      employeeId: body.employeeId,
      payrollRunId: body.payrollRunId || null,
      transactionCodeId: body.transactionCodeId,
      ...data,
    },
    include: INCLUDE,
  });
  return c.json(input, 201);
});

router.put('/:id', requirePermission('process_payroll'), async (c) => {
  const existing = await prisma.payrollInput.findUnique({
    where: { id: c.req.param('id') },
    include: { employee: { select: { companyId: true, clientId: true } } },
  });
  if (!existing) return c.json({ message: 'Payroll input not found' }, 404);
  if (existing.processed) return c.json({ message: 'Cannot edit a processed input' }, 400);

  const lock = await checkPeriodLock(existing.employee.clientId, existing.period);
  if (lock.locked) return c.json({ message: lock.message }, 423);

  const body = await c.req.json();
  const { transactionCodeId } = body;
  const data = pick(body);
  (Object.keys(data) as (keyof typeof data)[]).forEach(k => data[k] === undefined && delete data[k]);

  const input = await prisma.payrollInput.update({
    where: { id: c.req.param('id') },
    data: { ...(transactionCodeId && { transactionCodeId }), ...data },
    include: INCLUDE,
  });
  return c.json(input);
});

router.delete('/processed', requirePermission('process_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  const where: Record<string, unknown> = { processed: true };
  if (companyId) where.employee = { companyId };
  else if (clientId) where.employee = { clientId };
  const { count } = await prisma.payrollInput.deleteMany({ where });
  return c.json({ deleted: count });
});

router.delete('/:id', requirePermission('process_payroll'), async (c) => {
  const input = await prisma.payrollInput.findUnique({
    where: { id: c.req.param('id') },
    include: { employee: { select: { clientId: true } } },
  });
  if (!input) return c.json({ message: 'Payroll input not found' }, 404);
  if (input.processed) return c.json({ message: 'Cannot delete a processed input' }, 400);

  const lock = await checkPeriodLock(input.employee.clientId, input.period);
  if (lock.locked) return c.json({ message: lock.message }, 423);

  await prisma.payrollInput.delete({ where: { id: c.req.param('id') } });
  return c.body(null, 204);
});

export default router;
