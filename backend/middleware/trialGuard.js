const prisma = require('../lib/prisma');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function trialGuard(req, res, next) {
  // No clientId: unauthenticated request or public route — pass through.
  // This null-check is load-bearing: trialGuard runs globally (including public routes
  // before auth middleware sets req.clientId), so it must handle undefined gracefully.
  const clientId = req.clientId;
  if (!clientId) return next();

  let trial;
  try {
    trial = await prisma.trial.findUnique({ where: { clientId } });
  } catch (err) {
    console.error('[trialGuard] DB error:', err);
    return next(); // Don't block on guard failure
  }

  if (!trial) return next(); // Paid account — no trial record

  if (trial.status === 'CONVERTED') return next();

  const isExpired = new Date(trial.expiresAt) < new Date();

  if (isExpired) {
    // Lazily mark as EXPIRED in DB (fire-and-forget)
    if (trial.status !== 'EXPIRED') {
      prisma.trial.update({
        where: { clientId },
        data: { status: 'EXPIRED' },
      }).catch((err) => console.error('[trialGuard] failed to mark expired:', err));
    }

    // Allow upgrade-request even when expired.
    // When Express strips the /api/trial prefix, req.path === '/upgrade-request'.
    if (req.path === '/upgrade-request') {
      req.trial = { ...trial, status: 'EXPIRED' };
      return next();
    }

    if (WRITE_METHODS.has(req.method)) {
      return res.status(403).json({
        trialExpired: true,
        message: 'Your trial has ended. Upgrade to continue.',
      });
    }
  }

  req.trial = trial;
  return next();
}

module.exports = trialGuard;
