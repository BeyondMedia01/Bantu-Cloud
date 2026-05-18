import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

function uuid() { return crypto.randomUUID(); }

const createCategorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const createAssetSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().min(1),
  serialNumber: z.string().optional(),
  model: z.string().optional(),
  purchaseDate: z.string().optional(),
  purchasePrice: z.number().optional(),
  currency: z.string().optional(),
  condition: z.string().optional(),
  notes: z.string().optional(),
  status: z.string().optional(),
});

const updateAssetSchema = z.object({
  categoryId: z.string().optional(),
  name: z.string().optional(),
  serialNumber: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  purchaseDate: z.string().nullable().optional(),
  purchasePrice: z.number().nullable().optional(),
  currency: z.string().optional(),
  condition: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().optional(),
});

const assignAssetSchema = z.object({
  employeeId: z.string().min(1),
});

// ─── Categories ───────────────────────────────────────────────────────────────

router.get('/categories', requirePermission('view_assets'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const categories = await prisma.assetCategory.findMany({
    where: { companyId },
    include: { _count: { select: { Asset: true } } },
    orderBy: { name: 'asc' },
  });
  return c.json(categories);
});

router.post('/categories', requirePermission('manage_assets'), validateBody(createCategorySchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { name, description } = c.req.valid('json');
  const category = await prisma.assetCategory.create({
    data: { id: uuid(), companyId, name, description },
  });
  return c.json(category, 201);
});

router.delete('/categories/:id', requirePermission('manage_assets'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.assetCategory.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.assetCategory.delete({ where: { id } });
  return c.json({ message: 'Category deleted' });
});

// ─── Assets ────────────────────────────────────────────────────────────────────

router.get('/', requirePermission('view_assets'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { status, categoryId, assignedToId } = c.req.query();
  const where: any = { companyId };
  if (status) where.status = status;
  if (categoryId) where.categoryId = categoryId;
  if (assignedToId) where.assignedToId = assignedToId;

  const assets = await prisma.asset.findMany({
    where,
    include: {
      AssetCategory: { select: { name: true } },
      Employee: { select: { firstName: true, lastName: true, employeeCode: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(assets);
});

router.post('/', requirePermission('manage_assets'), validateBody(createAssetSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { purchaseDate, ...data } = c.req.valid('json');
  const asset = await prisma.asset.create({
    data: {
      id: uuid(),
      companyId,
      ...data,
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
    },
    include: { AssetCategory: { select: { name: true } } },
  });
  await audit({ c, action: 'ASSET_CREATED', resource: 'asset', resourceId: asset.id, details: { name: data.name } });
  return c.json(asset, 201);
});

router.get('/:id', requirePermission('view_assets'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      AssetCategory: { select: { name: true } },
      Employee: { select: { firstName: true, lastName: true, employeeCode: true, email: true } },
    },
  });
  if (!asset) return c.json({ message: 'Not found' }, 404);
  if (asset.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  return c.json(asset);
});

router.put('/:id', requirePermission('manage_assets'), validateBody(updateAssetSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const { purchaseDate, ...data } = c.req.valid('json');
  const asset = await prisma.asset.update({
    where: { id },
    data: {
      ...data,
      ...(purchaseDate !== undefined && { purchaseDate: purchaseDate ? new Date(purchaseDate) : null }),
      updatedAt: new Date(),
    },
    include: {
      AssetCategory: { select: { name: true } },
      Employee: { select: { firstName: true, lastName: true } },
    },
  });
  return c.json(asset);
});

router.delete('/:id', requirePermission('manage_assets'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.asset.delete({ where: { id } });
  return c.json({ message: 'Asset deleted' });
});

// ─── Assign / Return ──────────────────────────────────────────────────────────

router.post('/:id/assign', requirePermission('manage_assets'), validateBody(assignAssetSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const { employeeId } = c.req.valid('json');

  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (existing.status === 'ASSIGNED') return c.json({ message: 'Asset is already assigned' }, 400);

  const asset = await prisma.asset.update({
    where: { id },
    data: { assignedToId: employeeId, assignedAt: new Date(), status: 'ASSIGNED', updatedAt: new Date() },
    include: {
      AssetCategory: { select: { name: true } },
      Employee: { select: { firstName: true, lastName: true, employeeCode: true } },
    },
  });
  await audit({ c, action: 'ASSET_ASSIGNED', resource: 'asset', resourceId: asset.id, details: { employeeId } });
  return c.json(asset);
});

router.post('/:id/return', requirePermission('manage_assets'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const { id } = c.req.param();
  const existing = await prisma.asset.findUnique({ where: { id } });
  if (!existing) return c.json({ message: 'Not found' }, 404);
  if (existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (existing.status !== 'ASSIGNED') return c.json({ message: 'Asset is not assigned' }, 400);

  const asset = await prisma.asset.update({
    where: { id },
    data: { assignedToId: null, assignedAt: null, status: 'AVAILABLE', updatedAt: new Date() },
    include: { AssetCategory: { select: { name: true } } },
  });
  await audit({ c, action: 'ASSET_RETURNED', resource: 'asset', resourceId: asset.id });
  return c.json(asset);
});

// ─── Employees for assignment ─────────────────────────────────────────────────

router.get('/employees/list', requirePermission('view_assets'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  const employees = await prisma.employee.findMany({
    where: { companyId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, departmentId: true },
    orderBy: { firstName: 'asc' },
  });
  return c.json(employees);
});

export default router;
