const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

/**
 * Derive a sync operation name from the HTTP method and route.
 * Returns null if this request should not be queued.
 */
function deriveOperation(method, path) {
  // Extract entity from path, e.g. /api/employees/123 -> "employees"
  const match = path.match(/^\/api\/([a-z-]+)/i);
  if (!match) return null;

  const entity = match[1].toUpperCase().replace(/-/g, '_');

  const methodMap = {
    POST: 'CREATE',
    PUT: 'UPDATE',
    PATCH: 'UPDATE',
    DELETE: 'DELETE',
  };
  const verb = methodMap[method];
  if (!verb) return null;

  // Singularize simple plural (strip trailing 'IES' -> 'Y', or trailing 'S')
  const singular = entity.replace(/IES$/, 'Y').replace(/S$/, '');

  return `${verb}_${singular}`;
}

/**
 * Middleware that enqueues a SyncQueue entry after successful mutations in desktop mode.
 * Attach this middleware globally in index.js only when APP_MODE === 'desktop'.
 */
function syncQueueMiddleware(req, res, next) {
  // Skip non-mutations
  const mutations = ['POST', 'PUT', 'PATCH', 'DELETE'];
  if (!mutations.includes(req.method)) return next();

  // Override res.json to capture response data
  const originalJson = res.json.bind(res);
  let responseData = null;
  res.json = function (data) {
    responseData = data;
    return originalJson(data);
  };

  res.on('finish', async () => {
    // Only queue successful responses
    if (res.statusCode < 200 || res.statusCode >= 300) return;

    const operation = deriveOperation(req.method, req.path);
    if (!operation) return;

    // Payload: merge request body with response data (response may include server-assigned id)
    const payload = {
      ...req.body,
      ...(responseData && typeof responseData === 'object' ? responseData : {}),
    };

    try {
      await prisma.syncQueue.create({
        data: {
          operation,
          payload: JSON.stringify(payload),
          status: 'pending',
        },
      });
    } catch (err) {
      // Never fail the request because of sync queue errors
      console.error('[SyncQueue] Failed to enqueue operation:', err.message);
    }
  });

  next();
}

module.exports = { syncQueueMiddleware, deriveOperation };
