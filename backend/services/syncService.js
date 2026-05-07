'use strict';

const prisma = require('../lib/prisma');

/**
 * Order sync queue items by dependency (topological sort).
 * Items with no dependsOn come first.
 * @param {Array} items - SyncQueue records
 * @returns {Array} - Ordered array
 */
function topoSort(items) {
  const map = new Map(items.map(i => [i.id, i]));
  const visited = new Set();
  const result = [];

  function visit(item) {
    if (visited.has(item.id)) return;
    visited.add(item.id);
    if (item.dependsOn && map.has(item.dependsOn)) {
      visit(map.get(item.dependsOn));
    }
    result.push(item);
  }

  items.forEach(visit);
  return result;
}

/**
 * Perform a dry-run: return what would be synced without actually syncing.
 * @returns {Promise<Array>} - Array of { operation, payload } for pending items
 */
async function dryRun() {
  const pending = await prisma.syncQueue.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  return topoSort(pending).map(item => ({
    id: item.id,
    operation: item.operation,
    payload: JSON.parse(item.payload),
  }));
}

/**
 * Execute the sync: send pending items to the web server.
 * @param {string} serverUrl - Base URL of the web server (e.g. "https://app.bantu.com")
 * @param {string} authToken - JWT token for authenticating with the server
 * @returns {Promise<{ synced: number, failed: number, errors: Array }>}
 */
async function sync(serverUrl, authToken) {
  const pending = await prisma.syncQueue.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  const ordered = topoSort(pending);
  let synced = 0;
  let failed = 0;
  const errors = [];

  for (const item of ordered) {
    // Mark as syncing
    await prisma.syncQueue.update({
      where: { id: item.id },
      data: { status: 'syncing', attempts: { increment: 1 } },
    });

    try {
      const response = await fetch(`${serverUrl}/api/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          operation: item.operation,
          payload: JSON.parse(item.payload),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errText}`);
      }

      const result = await response.json();

      // Mark as done
      await prisma.syncQueue.update({
        where: { id: item.id },
        data: { status: 'done' },
      });

      // Log to SyncLog
      await prisma.syncLog.create({
        data: {
          operation: item.operation,
          payload: item.payload,
          status: 'success',
          serverId: result?.id ?? null,
        },
      });

      synced++;
    } catch (err) {
      const errorMessage = err.message;

      // Mark as failed
      await prisma.syncQueue.update({
        where: { id: item.id },
        data: { status: 'failed', lastError: errorMessage },
      });

      // Log to SyncLog
      await prisma.syncLog.create({
        data: {
          operation: item.operation,
          payload: item.payload,
          status: 'failed',
          error: errorMessage,
        },
      });

      errors.push({ id: item.id, operation: item.operation, error: errorMessage });
      failed++;
    }
  }

  // Update SyncMeta
  await prisma.syncMeta.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', lastSyncedAt: new Date() },
    update: { lastSyncedAt: new Date() },
  });

  return { synced, failed, errors };
}

module.exports = { sync, dryRun, topoSort };
