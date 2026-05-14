import { Hono } from 'hono';
import { prisma } from '../lib/prisma';

const router = new Hono();

router.post('/', async (c) => {
  try {
    const { operation, payload } = await c.req.json();
    if (!operation || !payload) {
      return c.json({ error: 'operation and payload are required' }, 400);
    }

    const { executeOperation } = await import('../sync_queue/operations');
    const result = await executeOperation(operation, payload, prisma);
    return c.json({ success: true, id: result?.id ?? null });
  } catch (err: any) {
    console.error('[Sync] Operation failed:', err.message);
    return c.json({ error: err.message }, 422);
  }
});

router.get('/initial', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1'));
  const limit = Math.min(500, parseInt(c.req.query('limit') || '100'));
  const skip = (page - 1) * limit;

  try {
    const [employees, companies, payrollRuns, payslips] = await Promise.all([
      prisma.employee.findMany({ skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.company.findMany({ skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.payrollRun.findMany({ skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.payslip.findMany({ skip, take: limit, orderBy: { createdAt: 'asc' } }),
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
