import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import { prisma } from '../lib/prisma';
import { cacheGet, cacheSet } from '../lib/cache';
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

  // PLATFORM_ADMIN operates without a company context — ignore any x-company-id header
  if (role === 'PLATFORM_ADMIN') {
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
        const cacheKey = `clientAdmin:${userId}`;
        let cached = cacheGet<{ clientId: string }>(cacheKey);
        if (!cached) {
          const ca = await prisma.clientAdmin.findUnique({ where: { userId } });
          if (!ca) return c.json({ message: 'Client admin record not found' }, 403);
          cached = { clientId: ca.clientId };
          cacheSet(cacheKey, cached);
        }
        resolvedClientId = cached.clientId;
      } else {
        resolvedClientId = clientIdFromToken;
      }

      const companyCacheKey = `company:${companyId}`;
      let cachedCompany = cacheGet<{ clientId: string }>(companyCacheKey);
      if (!cachedCompany) {
        const company = await prisma.company.findUnique({
          where: { id: companyId },
          select: { clientId: true },
        });
        if (!company) return c.json({ message: 'Access denied: company does not belong to your client' }, 403);
        cachedCompany = { clientId: company.clientId };
        cacheSet(companyCacheKey, cachedCompany);
      }
      if (cachedCompany.clientId !== resolvedClientId) {
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
        const cacheKey = `employee:${userId}`;
        let cachedEmp = cacheGet<{ companyId: string; clientId: string; id: string }>(cacheKey);
        if (!cachedEmp) {
          const emp = await prisma.employee.findUnique({ where: { userId } });
          if (!emp) return c.json({ message: 'Access denied: employee not found' }, 403);
          cachedEmp = { companyId: emp.companyId, clientId: emp.clientId, id: emp.id };
          cacheSet(cacheKey, cachedEmp);
        }
        if (cachedEmp.companyId !== companyId) {
          return c.json({ message: 'Access denied: not your company' }, 403);
        }
        c.set('clientId', cachedEmp.clientId);
        c.set('employeeId', cachedEmp.id);
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
