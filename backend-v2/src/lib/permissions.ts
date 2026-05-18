import type { Context, Next } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { TokenPayload } from './auth';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  PLATFORM_ADMIN: [
    'manage_clients',
    'manage_licenses',
    'manage_users',
    'manage_roles',
    'view_audit_logs',
    'view_settings',
    'update_settings',
  ],
  CLIENT_ADMIN: [
    'manage_companies',
    'manage_employees',
    'manage_payroll',
    'approve_payroll',
    'process_payroll',
    'view_leave',
    'manage_leave',
    'approve_leave',
    'reject_leave',
    'view_loans',
    'manage_loans',
    'approve_loans',
    'reject_loans',
    'view_expenses',
    'manage_expenses',
    'view_assets',
    'manage_assets',
    'view_training',
    'manage_training',
    'view_performance',
    'manage_performance',
    'view_recruitment',
    'manage_recruitment',
    'view_onboarding',
    'manage_onboarding',
    'view_succession',
    'manage_succession',
    'view_surveys',
    'manage_surveys',
    'view_employees',
    'view_reports',
    'export_reports',
    'create_reports',
    'view_settings',
    'update_settings',
  ],
  EMPLOYEE: [
    'view_employees',
    'view_payroll',
    'view_leave',
    'view_loans',
    'view_reports',
  ],
};

export function hasPermission(role: string, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  return perms ? perms.includes(permission) : false;
}

export function hasAllPermissions(role: string, permissions: string[]): boolean {
  return permissions.every(p => hasPermission(role, p));
}

export function hasAnyPermission(role: string, permissions: string[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function getPermissionsForRole(role: string): string[] {
  return ROLE_PERMISSIONS[role] || [];
}

export function requirePermission(permission: string) {
  return createMiddleware(async (c: Context, next: Next) => {
    const user: TokenPayload | undefined = c.get('user');
    if (!user) {
      return c.json({ message: 'Unauthorized' }, 401);
    }
    if (!hasPermission(user.role, permission)) {
      return c.json({ message: `Access denied: requires ${permission}` }, 403);
    }
    await next();
  });
}
