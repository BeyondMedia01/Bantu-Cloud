import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const ALLOWED_OPERATIONS = new Set([
  'CREATE_EMPLOYEE', 'UPDATE_EMPLOYEE', 'DELETE_EMPLOYEE',
  'CREATE_COMPANY', 'UPDATE_COMPANY',
  'CREATE_PAYROLL_RUN', 'UPDATE_PAYROLL_RUN',
  'CREATE_PAYSLIP', 'UPDATE_PAYSLIP',
]);

const syncOperationSchema = z.object({
  operation: z.string().min(1),
  payload: z.record(z.unknown()),
});

router.post('/', requirePermission('manage_payroll'), validateBody(syncOperationSchema), async (c) => {
  const { operation, payload } = c.req.valid('json' as any);
  if (!ALLOWED_OPERATIONS.has(operation)) {
    return c.json({ error: `Unknown operation: ${operation}` }, 400);
  }
  try {
    const { executeOperation } = await import('../sync_queue/operations');
    const result = await executeOperation(operation, payload, prisma);
    return c.json({ success: true, id: result?.id ?? null });
  } catch (err: any) {
    console.error('[Sync] Operation failed:', err.message);
    return c.json({ error: err.message }, 422);
  }
});

router.get('/initial', requirePermission('view_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  if (!companyId && !clientId) return c.json({ error: 'Company context required' }, 400);

  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(500, parseInt(c.req.query('limit') || '100'));
  const skip = (page - 1) * limit;

  const companyWhere = companyId ? { companyId } : { company: { clientId } };
  const runWhere = companyId ? { companyId } : { companyId: { in: await prisma.company.findMany({ where: { clientId: clientId! }, select: { id: true } }).then(cs => cs.map(c => c.id)) } };

  try {
    const [employees, companies, payrollRuns, payslips] = await Promise.all([
      prisma.employee.findMany({ where: companyWhere as any, skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.company.findMany({ where: companyId ? { id: companyId } : { clientId: clientId! }, skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.payrollRun.findMany({ where: runWhere as any, skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.payslip.findMany({ where: { payrollRun: runWhere as any }, skip, take: limit, orderBy: { createdAt: 'asc' } }),
    ]);

    return c.json({ page, limit, data: { employees, companies, payrollRuns, payslips } });
  } catch (err: any) {
    console.error('[Sync] Initial pull failed:', err.message);
    return c.json({ error: 'Failed to fetch initial data' }, 500);
  }
});

router.get('/failed', async (c) => {
  try {
    const failed = await prisma.syncQueue.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'asc' },
    });
    return c.json(
      failed.map((item: any) => ({
        id: item.id,
        operation: item.operation,
        payload: JSON.parse(item.payload),
        error: item.lastError,
        attempts: item.attempts,
      })),
    );
  } catch (err: any) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

router.post('/retry/:id', async (c) => {
  try {
    await prisma.syncQueue.update({
      where: { id: c.req.param('id') },
      data: { status: 'pending', lastError: null },
    });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

router.post('/seed', async (c) => {
  const { employees = [], companies = [], payrollRuns = [], payslips = [] }: {
    employees?: any[];
    companies?: any[];
    payrollRuns?: any[];
    payslips?: any[];
  } = await c.req.json();

  const MAX_BATCH = 500;
  if (employees.length > MAX_BATCH || companies.length > MAX_BATCH ||
      payrollRuns.length > MAX_BATCH || payslips.length > MAX_BATCH) {
    return c.json({ error: `Batch size exceeds maximum of ${MAX_BATCH} records per entity type` }, 400);
  }

  const allRecords = [...employees, ...companies, ...payrollRuns, ...payslips];
  if (allRecords.some(r => !r.id)) {
    return c.json({ error: 'All records must have an id field' }, 400);
  }

  try {
    await Promise.all([
      ...employees.map((e: any) => prisma.employee.upsert({ where: { id: e.id }, create: e, update: e })),
      ...companies.map((c: any) => prisma.company.upsert({ where: { id: c.id }, create: c, update: c })),
      ...payrollRuns.map((r: any) => prisma.payrollRun.upsert({ where: { id: r.id }, create: r, update: r })),
      ...payslips.map((p: any) => prisma.payslip.upsert({ where: { id: p.id }, create: p, update: p })),
    ]);

    return c.json({ seeded: employees.length + companies.length + payrollRuns.length + payslips.length });
  } catch (err: any) {
    console.error('[Seed] Failed:', err.message);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

router.delete('/dismiss/:id', async (c) => {
  try {
    await prisma.syncQueue.delete({ where: { id: c.req.param('id') } });
    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default router;
