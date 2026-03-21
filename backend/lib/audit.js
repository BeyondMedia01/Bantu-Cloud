const prisma = require('./prisma');

/**
 * Record an audit event.
 *
 * @param {object} opts
 * @param {import('express').Request} [opts.req]  - Express request (used to extract user + IP)
 * @param {string} opts.action                    - e.g. PAYROLL_CREATED, EMPLOYEE_DELETED
 * @param {string} opts.resource                  - e.g. payroll_run, employee, leave_request
 * @param {string} [opts.resourceId]
 * @param {object} [opts.details]                 - extra context (snapshotted data, changes)
 */
async function audit({ req, action, resource, resourceId, details }) {
  try {
    const userId   = req?.user?.userId   ?? null;
    const userEmail = req?.user?.email   ?? null;
    const ipAddress = req
      ? (req.headers['x-forwarded-for']?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? null)
      : null;

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action,
        resource,
        resourceId: resourceId ? String(resourceId) : null,
        details: details ?? undefined,
        ipAddress,
      },
    });
  } catch (err) {
    // Audit failures must NEVER crash the main request path
    console.error('[audit] Failed to write audit log:', err.message);
  }
}

module.exports = { audit };
