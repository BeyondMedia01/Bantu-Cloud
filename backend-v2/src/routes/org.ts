import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, cache } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

// ─── Branches ─────────────────────────────────────────────────────────────────

const branchCreateSchema = z.object({
  name: z.string().min(1),
  subCompanyId: z.string().optional(),
});

const branchUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  subCompanyId: z.string().optional(),
});

const branches = new Hono();

branches.get('/', requirePermission('view_employees'), async (c) => {
  try {
    const companyId = c.get('companyId');
    if (!companyId) return c.json([]);
    const where: Record<string, unknown> = { companyId };
    const data = await prisma.branch.findMany({ where, orderBy: { name: 'asc' } });
    return c.json(data);
  } catch (err: any) {
    console.error('[branches GET /]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

branches.get('/:id', requirePermission('view_employees'), async (c) => {
  try {
    const companyId = c.get('companyId');
    const entity = await prisma.branch.findUnique({ where: { id: c.req.param('id') } });
    if (!entity) return c.json({ message: 'Branch not found' }, 404);
    if (!companyId || entity.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    return c.json(entity);
  } catch (err: any) {
    console.error('[branches GET /:id]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

branches.post('/', requirePermission('manage_companies'), validateBody(branchCreateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { name, subCompanyId } = c.req.valid('json');
  const data = await prisma.branch.create({
    data: { id: uuid(), companyId, name: name.trim(), subCompanyId: subCompanyId || null },
  });
  return c.json(data, 201);
});

branches.put('/:id', requirePermission('manage_companies'), validateBody(branchUpdateSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const existing = await prisma.branch.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Branch not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const { name, subCompanyId } = c.req.valid('json');
  const data = await prisma.branch.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(subCompanyId !== undefined && { subCompanyId: subCompanyId || null }),
    },
  });
  return c.json(data);
});

branches.delete('/:id', requirePermission('manage_companies'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const existing = await prisma.branch.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Branch not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  await prisma.branch.delete({ where: { id } });
  return c.json({ message: 'Branch deleted' });
});

router.route('/branches', branches);

// ─── Departments ──────────────────────────────────────────────────────────────

const departmentCreateSchema = z.object({
  name: z.string().min(1),
  branchId: z.string().optional(),
});

const departmentUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  branchId: z.string().optional(),
});

const departments = new Hono();

departments.get('/', requirePermission('view_employees'), async (c) => {
  try {
    const companyId = c.get('companyId');
    if (!companyId) return c.json([]);
    const where: Record<string, unknown> = { companyId };
    const data = await prisma.department.findMany({ where, orderBy: { name: 'asc' } });
    return c.json(data);
  } catch (err: any) {
    console.error('[departments GET /]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

departments.get('/:id', requirePermission('view_employees'), async (c) => {
  try {
    const companyId = c.get('companyId');
    const entity = await prisma.department.findUnique({ where: { id: c.req.param('id') } });
    if (!entity) return c.json({ message: 'Department not found' }, 404);
    if (!companyId || entity.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    return c.json(entity);
  } catch (err: any) {
    console.error('[departments GET /:id]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

departments.post('/', requirePermission('manage_companies'), validateBody(departmentCreateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const { name, branchId } = c.req.valid('json');
  const data = await prisma.department.create({
    data: { id: uuid(), companyId, name: name.trim(), branchId: branchId || null },
  });
  return c.json(data, 201);
});

departments.put('/:id', requirePermission('manage_companies'), validateBody(departmentUpdateSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Department not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const { name, branchId } = c.req.valid('json');
  const data = await prisma.department.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(branchId !== undefined && { branchId: branchId || null }),
    },
  });
  return c.json(data);
});

departments.delete('/:id', requirePermission('manage_companies'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const existing = await prisma.department.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Department not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  await prisma.department.delete({ where: { id } });
  return c.json({ message: 'Department deleted' });
});

router.route('/departments', departments);

// ─── Grades ───────────────────────────────────────────────────────────────────

const gradeCreateSchema = z.object({
  name: z.string().min(1),
  minRate: z.number(),
  maxRate: z.number(),
  currency: z.string().optional(),
});

const gradeUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  minRate: z.number().optional(),
  maxRate: z.number().optional(),
  currency: z.string().optional(),
});

const grades = new Hono();

grades.get('/', requirePermission('view_employees'), async (c) => {
  try {
    const clientId = c.get('clientId');
    if (!clientId) return c.json([]);
    const where: Record<string, unknown> = { clientId };
    const data = await prisma.grade.findMany({ where, orderBy: { name: 'asc' } });
    return c.json(data);
  } catch (err: any) {
    console.error('[grades GET /]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

grades.get('/:id', requirePermission('view_employees'), async (c) => {
  try {
    const clientId = c.get('clientId');
    const entity = await prisma.grade.findUnique({ where: { id: c.req.param('id') } });
    if (!entity) return c.json({ message: 'Grade not found' }, 404);
    if (!clientId || entity.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);
    return c.json(entity);
  } catch (err: any) {
    console.error('[grades GET /:id]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

grades.post('/', requirePermission('update_settings'), validateBody(gradeCreateSchema), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);
  const { name, minRate, maxRate, currency } = c.req.valid('json');
  const data = await prisma.grade.create({
    data: { id: uuid(), clientId, name: name.trim(), minRate, maxRate, currency: currency || 'USD' },
  });
  return c.json(data, 201);
});

grades.put('/:id', requirePermission('update_settings'), validateBody(gradeUpdateSchema), async (c) => {
  const { id } = c.req.param();
  const clientId = c.get('clientId');
  const existing = await prisma.grade.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Grade not found' }, 404);
  if (!clientId || existing.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);
  const { name, minRate, maxRate, currency } = c.req.valid('json');
  const data = await prisma.grade.update({
    where: { id },
    data: {
      ...(name !== undefined && { name: name.trim() }),
      ...(minRate !== undefined && { minRate }),
      ...(maxRate !== undefined && { maxRate }),
      ...(currency !== undefined && { currency }),
    },
  });
  return c.json(data);
});

grades.delete('/:id', requirePermission('update_settings'), async (c) => {
  const { id } = c.req.param();
  const clientId = c.get('clientId');
  const existing = await prisma.grade.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Grade not found' }, 404);
  if (!clientId || existing.clientId !== clientId) return c.json({ message: 'Access denied' }, 403);
  await prisma.grade.delete({ where: { id } });
  return c.json({ message: 'Grade deleted' });
});

router.route('/grades', grades);

// ─── Shifts ───────────────────────────────────────────────────────────────────

const shiftCreateSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  breakMinutes: z.number().int().optional(),
  normalHours: z.number().optional(),
  ot0Threshold: z.number().optional(),
  ot1Threshold: z.number().optional(),
  ot0Multiplier: z.number().optional(),
  ot1Multiplier: z.number().optional(),
  ot2Multiplier: z.number().optional(),
  isOvernight: z.boolean().optional(),
});

const shiftUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  breakMinutes: z.number().int().optional(),
  normalHours: z.number().optional(),
  ot0Threshold: z.number().optional(),
  ot1Threshold: z.number().optional(),
  ot0Multiplier: z.number().optional(),
  ot1Multiplier: z.number().optional(),
  ot2Multiplier: z.number().optional(),
  isOvernight: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

const shifts = new Hono();

shifts.get('/', requirePermission('view_employees'), async (c) => {
  try {
    const companyId = c.get('companyId');
    if (!companyId) return c.json({ message: 'Company context required' }, 400);
    const where: any = { companyId };
    if (c.req.query('active') === 'true') where.isActive = true;
    const data = await prisma.shift.findMany({ where, orderBy: { name: 'asc' } });
    return c.json(data);
  } catch (err: any) {
    console.error('[shifts GET /]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

shifts.get('/:id', requirePermission('view_employees'), async (c) => {
  try {
    const companyId = c.get('companyId');
    const entity = await prisma.shift.findUnique({ where: { id: c.req.param('id') } });
    if (!entity) return c.json({ message: 'Shift not found' }, 404);
    if (!companyId || entity.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    return c.json(entity);
  } catch (err: any) {
    console.error('[shifts GET /:id]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

shifts.post('/', requirePermission('manage_employees'), validateBody(shiftCreateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const body = c.req.valid('json');
  const data = await prisma.shift.create({
    data: {
      id: uuid(),
      companyId,
      name: body.name.trim(),
      code: body.code || null,
      startTime: body.startTime,
      endTime: body.endTime,
      breakMinutes: body.breakMinutes ?? 60,
      normalHours: body.normalHours ?? 8,
      ot0Threshold: body.ot0Threshold ?? 0,
      ot1Threshold: body.ot1Threshold ?? 2,
      ot0Multiplier: body.ot0Multiplier ?? 1.0,
      ot1Multiplier: body.ot1Multiplier ?? 1.5,
      ot2Multiplier: body.ot2Multiplier ?? 2.0,
      isOvernight: body.isOvernight ?? false,
    },
  });
  return c.json(data, 201);
});

shifts.put('/:id', requirePermission('manage_employees'), validateBody(shiftUpdateSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Shift not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const body = c.req.valid('json');
  const data = await prisma.shift.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.code !== undefined && { code: body.code || null }),
      ...(body.startTime !== undefined && { startTime: body.startTime }),
      ...(body.endTime !== undefined && { endTime: body.endTime }),
      ...(body.breakMinutes !== undefined && { breakMinutes: body.breakMinutes }),
      ...(body.normalHours !== undefined && { normalHours: body.normalHours }),
      ...(body.ot0Threshold !== undefined && { ot0Threshold: body.ot0Threshold }),
      ...(body.ot1Threshold !== undefined && { ot1Threshold: body.ot1Threshold }),
      ...(body.ot0Multiplier !== undefined && { ot0Multiplier: body.ot0Multiplier }),
      ...(body.ot1Multiplier !== undefined && { ot1Multiplier: body.ot1Multiplier }),
      ...(body.ot2Multiplier !== undefined && { ot2Multiplier: body.ot2Multiplier }),
      ...(body.isOvernight !== undefined && { isOvernight: body.isOvernight }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
    },
  });
  return c.json(data);
});

shifts.delete('/:id', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const existing = await prisma.shift.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Shift not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const count = await prisma.shiftAssignment.count({ where: { shiftId: id } });
  if (count > 0) {
    await prisma.shift.update({ where: { id }, data: { isActive: false } });
    return c.json({ message: 'Shift deactivated (has existing assignments)' });
  }
  await prisma.shift.delete({ where: { id } });
  return c.json({ message: 'Shift deleted' });
});

router.route('/shifts', shifts);

// ─── Devices ──────────────────────────────────────────────────────────────────

const deviceCreateSchema = z.object({
  name: z.string().min(1),
  vendor: z.string().min(1),
  model: z.string().optional(),
  ipAddress: z.string().optional(),
  port: z.number().int().optional(),
  serialNumber: z.string().optional(),
  location: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
});

const deviceUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  vendor: z.string().optional(),
  model: z.string().optional(),
  ipAddress: z.string().optional(),
  port: z.number().int().optional(),
  serialNumber: z.string().optional(),
  location: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  isActive: z.boolean().optional(),
});

function maskPassword(device: any) {
  return { ...device, password: device.password ? '\u2022\u2022\u2022\u2022' : null };
}

const devices = new Hono();

devices.get('/', requirePermission('manage_employees'), async (c) => {
  try {
    const companyId = c.get('companyId');
    if (!companyId) return c.json({ message: 'Company context required' }, 400);
    const data = await prisma.biometricDevice.findMany({ where: { companyId }, orderBy: { name: 'asc' } });
    return c.json(data.map(maskPassword));
  } catch (err: any) {
    console.error('[devices GET /]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

devices.get('/:id', requirePermission('manage_employees'), async (c) => {
  try {
    const companyId = c.get('companyId');
    const device = await prisma.biometricDevice.findUnique({ where: { id: c.req.param('id') } });
    if (!device) return c.json({ message: 'Device not found' }, 404);
    if (!companyId || device.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    return c.json(maskPassword(device));
  } catch (err: any) {
    console.error('[devices GET /:id]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

devices.post('/:id/sync', requirePermission('manage_employees'), async (c) => {
  const companyId = c.get('companyId');
  const device = await prisma.biometricDevice.findUnique({ where: { id: c.req.param('id') } });
  if (!device) return c.json({ message: 'Device not found' }, 404);
  if (!companyId || device.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  let payload: Record<string, unknown> | undefined;
  try { payload = await c.req.json(); } catch { /* no body */ }
  await prisma.biometricDevice.update({ where: { id: device.id }, data: { lastSyncAt: new Date(), lastSyncStatus: 'TRIGGERED' } });
  return c.json({ message: 'Sync triggered', payload });
});

devices.post('/:id/test', requirePermission('manage_employees'), async (c) => {
  const companyId = c.get('companyId');
  const device = await prisma.biometricDevice.findUnique({ where: { id: c.req.param('id') } });
  if (!device) return c.json({ message: 'Device not found' }, 404);
  if (!companyId || device.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json({ status: 'ok', message: `Connection test to ${device.ipAddress || device.name} initiated` });
});

devices.post('/', requirePermission('manage_employees'), validateBody(deviceCreateSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const body = c.req.valid('json');
  const data = await prisma.biometricDevice.create({
    data: {
      id: uuid(),
      companyId,
      name: body.name.trim(),
      vendor: body.vendor.toUpperCase(),
      model: body.model || null,
      ipAddress: body.ipAddress || null,
      port: body.port ?? 4370,
      serialNumber: body.serialNumber || null,
      location: body.location || null,
      username: body.username || null,
      password: body.password || null,
      webhookKey: uuid(),
    },
  });
  return c.json(maskPassword(data), 201);
});

devices.put('/:id', requirePermission('manage_employees'), validateBody(deviceUpdateSchema), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const existing = await prisma.biometricDevice.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Device not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  const body = c.req.valid('json');
  const updateData: Record<string, unknown> = {};
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.vendor !== undefined) updateData.vendor = body.vendor.toUpperCase();
  if (body.model !== undefined) updateData.model = body.model;
  if (body.ipAddress !== undefined) updateData.ipAddress = body.ipAddress;
  if (body.port !== undefined) updateData.port = body.port;
  if (body.serialNumber !== undefined) updateData.serialNumber = body.serialNumber;
  if (body.location !== undefined) updateData.location = body.location;
  if (body.username !== undefined) updateData.username = body.username;
  if (body.password && body.password !== '\u2022\u2022\u2022\u2022') updateData.password = body.password;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  const data = await prisma.biometricDevice.update({ where: { id }, data: updateData });
  return c.json(maskPassword(data));
});

devices.delete('/:id', requirePermission('manage_employees'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const existing = await prisma.biometricDevice.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Device not found' }, 404);
  if (!companyId || existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  await prisma.biometricDevice.delete({ where: { id } });
  return c.json({ message: 'Device deleted' });
});

router.route('/devices', devices);

export default router;
