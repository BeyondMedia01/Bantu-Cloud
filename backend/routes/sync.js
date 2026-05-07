'use strict';

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { executeOperation } = require('../sync_queue/operations.js');
const { dryRun, sync: executeSync } = require('../services/syncService.js');

const isDesktopMode = () => process.env.APP_MODE === 'desktop';

const desktopOnly = (_req, res, next) => {
  if (!isDesktopMode()) {
    return res.status(404).json({ error: 'Desktop sync route is not available in web-server mode' });
  }
  next();
};

const webOnly = (_req, res, next) => {
  if (isDesktopMode()) {
    return res.status(404).json({ error: 'Inbound sync route is not available in desktop mode' });
  }
  next();
};

/**
 * POST /api/sync
 * Receives a single named operation from the desktop client and applies it.
 * Body: { operation: string, payload: object }
 */
router.post('/', webOnly, async (req, res) => {
  const { operation, payload } = req.body;

  if (!operation || !payload) {
    return res.status(400).json({ error: 'operation and payload are required' });
  }

  try {
    const result = await executeOperation(operation, payload, prisma);
    return res.status(200).json({ success: true, id: result?.id ?? null });
  } catch (err) {
    console.error('[Sync] Operation failed:', err.message);
    return res.status(422).json({ error: err.message });
  }
});

/**
 * GET /api/sync/initial
 * Returns paginated initial data pull for new desktop clients.
 * Query params: page (default 1), limit (default 100)
 * Returns all entities the desktop needs: employees, companies, payrollRuns, payslips
 */
router.get('/initial', webOnly, async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(500, parseInt(req.query.limit) || 100);
  const skip = (page - 1) * limit;

  try {
    const [employees, companies, payrollRuns, payslips] = await Promise.all([
      prisma.employee.findMany({ skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.company.findMany({ skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.payrollRun.findMany({ skip, take: limit, orderBy: { createdAt: 'asc' } }),
      prisma.payslip.findMany({ skip, take: limit, orderBy: { createdAt: 'asc' } }),
    ]);

    return res.json({
      page,
      limit,
      data: { employees, companies, payrollRuns, payslips },
    });
  } catch (err) {
    console.error('[Sync] Initial pull failed:', err.message);
    return res.status(500).json({ error: 'Failed to fetch initial data' });
  }
});

/**
 * GET /api/sync/dry-run — desktop only
 * Returns the list of pending sync operations without executing them.
 */
router.get('/dry-run', desktopOnly, async (_req, res) => {
  try {
    const items = await dryRun();
    return res.json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/sync/execute — desktop only
 * Executes the pending sync operations against the remote server.
 * Body: { serverUrl: string, authToken: string }
 */
router.post('/execute', desktopOnly, async (req, res) => {
  const { serverUrl, authToken } = req.body;
  if (!serverUrl || !authToken) {
    return res.status(400).json({ error: 'serverUrl and authToken are required' });
  }
  try {
    const result = await executeSync(serverUrl, authToken);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/sync/failed — returns failed items from SyncQueue
router.get('/failed', desktopOnly, async (_req, res) => {
  try {
    const failed = await prisma.syncQueue.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'asc' },
    });
    return res.json(failed.map(item => ({
      id: item.id,
      operation: item.operation,
      payload: JSON.parse(item.payload),
      error: item.lastError,
      attempts: item.attempts,
    })));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/retry/:id — reset a failed item to pending so it will retry
router.post('/retry/:id', desktopOnly, async (req, res) => {
  try {
    await prisma.syncQueue.update({
      where: { id: req.params.id },
      data: { status: 'pending', lastError: null },
    });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/sync/seed — receives batches of initial data and writes to local DB
router.post('/seed', desktopOnly, async (req, res) => {
  const { employees = [], companies = [], payrollRuns = [], payslips = [] } = req.body;

  const MAX_BATCH = 500;
  if (employees.length > MAX_BATCH || companies.length > MAX_BATCH ||
      payrollRuns.length > MAX_BATCH || payslips.length > MAX_BATCH) {
    return res.status(400).json({ error: `Batch size exceeds maximum of ${MAX_BATCH} records per entity type` });
  }

  const allRecords = [...employees, ...companies, ...payrollRuns, ...payslips];
  if (allRecords.some(r => !r.id)) {
    return res.status(400).json({ error: 'All records must have an id field' });
  }

  try {
    // Upsert all entities
    await Promise.all([
      ...employees.map(e => prisma.employee.upsert({
        where: { id: e.id }, create: e, update: e,
      })),
      ...companies.map(c => prisma.company.upsert({
        where: { id: c.id }, create: c, update: c,
      })),
      ...payrollRuns.map(r => prisma.payrollRun.upsert({
        where: { id: r.id }, create: r, update: r,
      })),
      ...payslips.map(p => prisma.payslip.upsert({
        where: { id: p.id }, create: p, update: p,
      })),
    ]);

    return res.json({ seeded: employees.length + companies.length + payrollRuns.length + payslips.length });
  } catch (err) {
    console.error('[Seed] Failed:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/sync/dismiss/:id — remove a failed item (user chooses not to sync it)
router.delete('/dismiss/:id', desktopOnly, async (req, res) => {
  try {
    await prisma.syncQueue.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
