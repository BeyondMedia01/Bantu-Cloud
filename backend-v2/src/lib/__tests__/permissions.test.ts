import { describe, it, expect } from 'vitest';
import { hasPermission, hasAllPermissions, hasAnyPermission, getPermissionsForRole } from '../permissions';

describe('hasPermission', () => {
  it('returns true when the role has the permission', () => {
    expect(hasPermission('PLATFORM_ADMIN', 'manage_clients')).toBe(true);
    expect(hasPermission('CLIENT_ADMIN', 'manage_payroll')).toBe(true);
    expect(hasPermission('EMPLOYEE', 'view_leave')).toBe(true);
  });

  it('returns false when the role lacks the permission', () => {
    expect(hasPermission('EMPLOYEE', 'manage_payroll')).toBe(false);
    expect(hasPermission('CLIENT_ADMIN', 'manage_clients')).toBe(false);
  });

  it('returns false for unknown role', () => {
    expect(hasPermission('UNKNOWN_ROLE', 'view_leave')).toBe(false);
  });

  it('returns false for unknown permission', () => {
    expect(hasPermission('PLATFORM_ADMIN', 'nonexistent_permission')).toBe(false);
  });
});

describe('hasAllPermissions', () => {
  it('returns true when all permissions are present', () => {
    expect(hasAllPermissions('PLATFORM_ADMIN', ['manage_clients', 'manage_users'])).toBe(true);
  });

  it('returns false when some permissions are missing', () => {
    expect(hasAllPermissions('EMPLOYEE', ['view_leave', 'manage_payroll'])).toBe(false);
  });

  it('returns true for empty array', () => {
    expect(hasAllPermissions('EMPLOYEE', [])).toBe(true);
  });
});

describe('hasAnyPermission', () => {
  it('returns true when at least one permission matches', () => {
    expect(hasAnyPermission('EMPLOYEE', ['manage_payroll', 'view_leave'])).toBe(true);
  });

  it('returns false when no permissions match', () => {
    expect(hasAnyPermission('CLIENT_ADMIN', ['manage_clients', 'manage_licenses'])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasAnyPermission('EMPLOYEE', [])).toBe(false);
  });
});

describe('getPermissionsForRole', () => {
  it('returns permission array for known role', () => {
    const perms = getPermissionsForRole('PLATFORM_ADMIN');
    expect(perms).toBeDefined();
    expect(Array.isArray(perms)).toBe(true);
    expect(perms).toContain('manage_clients');
  });

  it('returns empty array for unknown role', () => {
    const perms = getPermissionsForRole('UNKNOWN_ROLE');
    expect(perms).toEqual([]);
  });
});
