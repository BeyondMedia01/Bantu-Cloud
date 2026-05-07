'use strict';

const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { executeOperation } = require('../sync_queue/operations.js');
const { dryRun, sync: executeSync } = require('../services/syncService.js');

// Only mount this router when APP_MODE !== 'desktop'
// (index.js handles the conditional mounting)

/**
 * POST /api/sync
 * Receives a single named operation from the desktop client and applies it.
 * Body: { operation: string, payload: object }
 */
router.post('/', async (req, res) => {
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
router.get('/initial', async (req, res) => {
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
router.get('/dry-run', async (_req, res) => {
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
router.post('/execute', async (req, res) => {
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
router.get('/failed', async (req, res) => {
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
router.post('/retry/:id', async (req, res) => {
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

// DELETE /api/sync/dismiss/:id — remove a failed item (user chooses not to sync it)
router.delete('/dismiss/:id', async (req, res) => {
  try {
    await prisma.syncQueue.delete({ where: { id: req.params.id } });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
