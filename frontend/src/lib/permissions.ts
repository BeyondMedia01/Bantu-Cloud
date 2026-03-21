type Role = 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'EMPLOYEE';

const PERMISSIONS: Record<Role, string[]> = {
  PLATFORM_ADMIN: [
    'manage_platform', 'manage_clients', 'manage_companies', 'manage_employees',
    'manage_payroll', 'approve_payroll', 'process_payroll', 'manage_leave',
    'approve_leave', 'reject_leave', 'manage_loans', 'approve_loans', 'reject_loans',
    'view_reports', 'export_reports', 'create_reports', 'view_settings', 'update_settings',
    'manage_licenses', 'manage_subscriptions',
  ],
  CLIENT_ADMIN: [
    'manage_companies', 'manage_employees', 'manage_payroll', 'approve_payroll',
    'process_payroll', 'manage_leave', 'approve_leave', 'reject_leave',
    'manage_loans', 'approve_loans', 'reject_loans', 'view_reports',
    'export_reports', 'create_reports', 'view_settings', 'update_settings',
  ],
  EMPLOYEE: [
    'view_employees', 'view_payroll', 'view_leave', 'view_loans', 'view_reports',
  ],
};

export function hasPermission(role: Role | null | undefined, permission: string): boolean {
  if (!role) return false;
  return PERMISSIONS[role]?.includes(permission) ?? false;
}

export function hasAllPermissions(role: Role | null | undefined, permissions: string[]): boolean {
  return permissions.every((p) => hasPermission(role, p));
}

export function hasAnyPermission(role: Role | null | undefined, permissions: string[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

export function getPermissionsForRole(role: Role): string[] {
  return PERMISSIONS[role] ?? [];
}
