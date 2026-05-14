import type { Context } from 'hono';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import type { TokenPayload } from './auth';

export async function audit(opts: {
  c?: Context;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  required?: boolean;
}) {
  try {
    const user: TokenPayload | undefined = opts.c?.get('user');
    const userId = user?.userId ?? null;
    const userEmail = user?.email ?? null;
    const ipAddress = opts.c
      ? opts.c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? null
      : null;

    await prisma.auditLog.create({
      data: {
        userId,
        userEmail,
        action: opts.action,
        resource: opts.resource,
        resourceId: opts.resourceId ? String(opts.resourceId) : null,
        details: opts.details as Prisma.InputJsonValue ?? undefined,
        ipAddress,
      },
    });
  } catch (err) {
    console.error('[audit] Failed to write audit log:', (err as Error).message);
    if (opts.required) throw err;
  }
}
