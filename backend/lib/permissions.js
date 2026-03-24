const ROLE_PERMISSIONS = {
  PLATFORM_ADMIN: [
    'manage_clients',
    'manage_licenses',
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
    'view_reports',
    'export_reports',
    'create_reports',
    'view_settings',
    'update_settings',
    'manage_users',
    'manage_roles',
    'view_audit_logs',
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

const hasPermission = (role, permission) => {
  const permissions = ROLE_PERMISSIONS[role];
  return permissions ? permissions.includes(permission) : false;
};

const hasAllPermissions = (role, permissions) =>
  permissions.every((p) => hasPermission(role, p));

const hasAnyPermission = (role, permissions) =>
  permissions.some((p) => hasPermission(role, p));

const getPermissionsForRole = (role) => ROLE_PERMISSIONS[role] || [];

/**
 * Express middleware factory — requires the user to have a specific permission.
 * Must be used after authenticateToken.
 */
const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  if (!hasPermission(req.user.role, permission)) {
    return res.status(403).json({ message: `Access denied: requires ${permission}` });
  }
  next();
};

module.exports = {
  ROLE_PERMISSIONS,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissionsForRole,
  requirePermission,
};
