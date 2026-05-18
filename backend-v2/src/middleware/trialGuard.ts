import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { prisma } from '../lib/prisma';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const trialGuard = createMiddleware(async (c: Context, next: Next) => {
  if (!MUTATING_METHODS.has(c.req.method)) return next();

  const clientId = c.get('clientId') as string | null;
  if (!clientId) return next();

  const trial = await prisma.$queryRaw<any[]>`
    SELECT "expiresAt", "status" FROM "Trial" WHERE "clientId" = ${clientId} LIMIT 1
  `;

  if (!trial.length) return next();

  const t = trial[0];
  const isExpired = new Date(t.expiresAt) < new Date();

  if (isExpired || t.status !== 'ACTIVE') {
    return c.json({ message: 'Your trial has expired. Please upgrade to continue.' }, 403);
  }

  return next();
});
