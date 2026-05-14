import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { prisma } from '../lib/prisma';
import type { TokenPayload } from '../lib/auth';

declare module 'hono' {
  interface ContextVariableMap {
    user: TokenPayload;
    companyId: string | null;
    clientId: string | null;
    employeeId: string | null;
  }
}

export const companyContext = createMiddleware(async (c: Context, next: Next) => {
  const user: TokenPayload | undefined = c.get('user');
  if (!user) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const companyId = c.req.header('x-company-id');
  const { role, userId } = user;

  if (!userId) {
    return c.json({ message: 'Session expired, please log in again' }, 401);
  }

  // PLATFORM_ADMIN operates without a company context
  if (role === 'PLATFORM_ADMIN') {
    if (companyId) return c.json({ message: 'Platform administrators cannot access client company data' }, 403);
    c.set('companyId', null);
    c.set('clientId', null);
    c.set('employeeId', null);
    return next();
  }

  // All other roles must supply x-company-id
  if (!companyId) {
    return c.json({ message: 'x-company-id header is required' }, 400);
  }

  try {
    if (role === 'CLIENT_ADMIN') {
      const clientIdFromToken = user.clientId;
      let resolvedClientId: string;

      if (!clientIdFromToken) {
        const ca = await prisma.clientAdmin.findUnique({ where: { userId } });
        if (!ca) return c.json({ message: 'Client admin record not found' }, 403);
        resolvedClientId = ca.clientId;
      } else {
        resolvedClientId = clientIdFromToken;
      }

      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { clientId: true },
      });

      if (!company || company.clientId !== resolvedClientId) {
        return c.json({ message: 'Access denied: company does not belong to your client' }, 403);
      }

      c.set('clientId', resolvedClientId);
      c.set('companyId', companyId);
      c.set('employeeId', null);
      return next();
    }

    if (role === 'EMPLOYEE') {
      const tokenCompanyId = user.companyId;
      if (tokenCompanyId && tokenCompanyId !== companyId) {
        return c.json({ message: 'Access denied: not your company' }, 403);
      }
      if (!tokenCompanyId) {
        const emp = await prisma.employee.findUnique({ where: { userId } });
        if (!emp || emp.companyId !== companyId) {
          return c.json({ message: 'Access denied: not your company' }, 403);
        }
        c.set('clientId', emp.clientId);
        c.set('employeeId', emp.id);
      } else {
        c.set('clientId', user.clientId ?? null);
        c.set('employeeId', user.employeeId ?? null);
      }

      c.set('companyId', companyId);
      return next();
    }

    return c.json({ message: 'Access denied' }, 403);
  } catch (error) {
    console.error('[companyContext] CATCH:', (error as Error)?.message, (error as Error)?.stack?.split('\n')[0]);
    return c.json({ message: 'Internal server error', error: (error as Error)?.message }, 500);
  }
});
