import { getUser } from '../lib/auth';
import type { AppModule, ModuleAction } from '../lib/auth';

const ALL_MODULES: AppModule[] = [
  'PEOPLE', 'TIME_LEAVE', 'PAYROLL', 'COMPLIANCE', 'REPORTS', 'SETTINGS',
  'RECRUITMENT', 'PERFORMANCE', 'EXPENSES', 'ONBOARDING', 'TRAINING', 'ASSETS',
  'SUCCESSION', 'SURVEYS', 'ANALYTICS',
];

export function usePermissions() {
  const user = getUser();

  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';
  const isClientAdmin = !!(user?.isClientAdmin || user?.role === 'CLIENT_ADMIN' || isPlatformAdmin);

  // Modules this client is licensed for. null/empty means all (PLATFORM_ADMIN or no restriction set).
  const licensedModules: AppModule[] | null =
    isPlatformAdmin ? null : (user?.enabledModules?.length ? user.enabledModules : null);

  const isModuleLicensed = (module: AppModule): boolean => {
    if (licensedModules === null) return true;
    return licensedModules.includes(module);
  };

  const canAccessModule = (module: AppModule): boolean => {
    if (!isModuleLicensed(module)) return false;
    if (isClientAdmin) return true;
    return !!(user?.permissions?.[module]?.length);
  };

  const can = (module: AppModule, action?: ModuleAction): boolean => {
    if (!isModuleLicensed(module)) return false;
    if (isClientAdmin) return true;
    if (!action) return canAccessModule(module);
    return !!(user?.permissions?.[module]?.includes(action));
  };

  const accessibleModules = (): AppModule[] => {
    const base = licensedModules ?? ALL_MODULES;
    if (isClientAdmin) return base;
    return base.filter((m) => !!(user?.permissions?.[m]?.length));
  };

  return { can, canAccessModule, accessibleModules, isClientAdmin };
}
