import type { Context } from 'hono';

export function denyUnlessCompany(c: Context, resource: { companyId?: string | null } | null, label = 'Resource'): boolean {
  if (!resource) return false;
  const companyId = c.get('companyId');
  if (resource.companyId && !companyId) return false;
  if (companyId && resource.companyId !== companyId) return false;
  return true;
}

export function denyUnlessClient(c: Context, resource: { clientId?: string | null } | null, label = 'Resource'): boolean {
  if (!resource) return false;
  const clientId = c.get('clientId');
  if (resource.clientId && !clientId) return false;
  if (clientId && resource.clientId !== clientId) return false;
  return true;
}
