const prisma = require('./prisma')

const ROLE_PERMISSIONS = {
  // Platform-level operations only — no access to client payroll/employee data
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

// ─── Module + Action RBAC ─────────────────────────────────────────────────────

/**
 * Resolves the merged permission set for a user within a specific company.
 * Unions all actions across all roles the user holds in that company.
 * Returns { MODULE: ['VIEW', 'EDIT', ...] }
 */
async function resolvePermissions(userId, companyId) {
  const userRoles = await prisma.userCompanyRole.findMany({
    where: { userId, companyId },
    include: {
      role: {
        include: { permissions: true },
      },
    },
  })

  if (!userRoles.length) return {}

  const merged = {}
  for (const { role } of userRoles) {
    for (const { module, actions } of role.permissions) {
      merged[module] = [...new Set([...(merged[module] ?? []), ...actions])]
    }
  }
  return merged
}

/**
 * Express middleware — requires the user to have access to a module.
 * CLIENT_ADMIN and PLATFORM_ADMIN bypass all checks.
 */
const requireModule = (module) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' })
  if (req.user.isClientAdmin) return next()
  if (!req.user.permissions?.[module]) {
    return res.status(403).json({ message: `Access denied: module ${module} not assigned` })
  }
  next()
}

/**
 * Express middleware — requires a specific action within a module.
 * CLIENT_ADMIN and PLATFORM_ADMIN bypass all checks.
 */
const requireModulePermission = (module, action) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' })
  if (req.user.isClientAdmin) return next()
  if (!req.user.permissions?.[module]?.includes(action)) {
    return res.status(403).json({
      message: `Access denied: requires ${action} on ${module}`,
    })
  }
  next()
}

// ─── Legacy flat-permission → RBAC module+action mapping ─────────────────────
// Allows requirePermission() to check COMPANY_USER RBAC permissions
// without rewriting every route file.

const PERMISSION_TO_RBAC = {
  manage_employees:   { module: 'PEOPLE', action: 'EDIT' },
  manage_payroll:     { module: 'PAYROLL', action: 'EDIT' },
  approve_payroll:    { module: 'PAYROLL', action: 'APPROVE' },
  process_payroll:    { module: 'PAYROLL', action: 'RUN' },
  view_leave:         { module: 'TIME_LEAVE', action: 'VIEW' },
  manage_leave:       { module: 'TIME_LEAVE', action: 'EDIT' },
  approve_leave:      { module: 'TIME_LEAVE', action: 'APPROVE' },
  reject_leave:       { module: 'TIME_LEAVE', action: 'APPROVE' },
  view_loans:         { module: 'PEOPLE', action: 'VIEW' },
  manage_loans:       { module: 'PEOPLE', action: 'EDIT' },
  approve_loans:      { module: 'PEOPLE', action: 'APPROVE' },
  reject_loans:       { module: 'PEOPLE', action: 'APPROVE' },
  view_reports:       { module: 'REPORTS', action: 'VIEW' },
  export_reports:     { module: 'REPORTS', action: 'EXPORT' },
  create_reports:     { module: 'REPORTS', action: 'EDIT' },
  view_settings:      { module: 'SETTINGS', action: 'VIEW' },
  update_settings:    { module: 'SETTINGS', action: 'CONFIGURE' },
  manage_users:       { module: 'SETTINGS', action: 'EDIT' },
  manage_roles:       { module: 'SETTINGS', action: 'CONFIGURE' },
  view_audit_logs:    { module: 'SETTINGS', action: 'VIEW' },
  manage_companies:   { module: 'SETTINGS', action: 'EDIT' },
  manage_clients:     { module: 'SETTINGS', action: 'EDIT' },
  manage_licenses:    { module: 'SETTINGS', action: 'EDIT' },
  view_employees:     { module: 'PEOPLE', action: 'VIEW' },
  view_payroll:       { module: 'PAYROLL', action: 'VIEW' },
}

// ─── Legacy flat-permission helpers (kept for backwards compatibility) ─────────

const ROLE_PERMISSIONS = {
  PLATFORM_ADMIN: [
    'manage_clients', 'manage_licenses', 'manage_companies', 'manage_employees',
    'manage_payroll', 'approve_payroll', 'process_payroll', 'view_leave',
    'manage_leave', 'approve_leave', 'reject_leave', 'view_loans', 'manage_loans',
    'approve_loans', 'reject_loans', 'view_reports', 'export_reports',
    'create_reports', 'view_settings', 'update_settings', 'manage_users',
    'manage_roles', 'view_audit_logs',
  ],
  CLIENT_ADMIN: [
    'manage_companies', 'manage_employees', 'manage_payroll', 'approve_payroll',
    'process_payroll', 'view_leave', 'manage_leave', 'approve_leave', 'reject_leave',
    'view_loans', 'manage_loans', 'approve_loans', 'reject_loans', 'view_reports',
    'export_reports', 'create_reports', 'view_settings', 'update_settings',
  ],
  EMPLOYEE: ['view_employees', 'view_payroll', 'view_leave', 'view_loans', 'view_reports'],
}

const hasPermission = (role, permission) =>
  (ROLE_PERMISSIONS[role] ?? []).includes(permission)

const hasAllPermissions = (role, permissions) =>
  permissions.every((p) => hasPermission(role, p))

const hasAnyPermission = (role, permissions) =>
  permissions.some((p) => hasPermission(role, p))

const getPermissionsForRole = (role) => ROLE_PERMISSIONS[role] || []

// Legacy middleware — checks flat role permissions (used by existing routes)
// Also resolves COMPANY_USER RBAC permissions via PERMISSION_TO_RBAC mapping.
const requirePermission = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' })
  if (req.user.role === 'PLATFORM_ADMIN' || req.user.role === 'CLIENT_ADMIN') return next()

  // COMPANY_USER — check RBAC permissions via the flat-string mapping
  if (req.user.permissions) {
    const rbac = PERMISSION_TO_RBAC[permission]
    if (!rbac) return res.status(403).json({ message: `Access denied: requires ${permission}` })
    if (!req.user.permissions[rbac.module]?.includes(rbac.action)) {
      return res.status(403).json({ message: `Access denied: requires ${permission}` })
    }
    return next()
  }

  // Legacy role-based check (EMPLOYEE etc.)
  if (!hasPermission(req.user.role, permission)) {
    return res.status(403).json({ message: `Access denied: requires ${permission}` })
  }
  next()
}

module.exports = {
  resolvePermissions,
  requireModule,
  requireModulePermission,
  ROLE_PERMISSIONS,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  getPermissionsForRole,
  requirePermission,
}
