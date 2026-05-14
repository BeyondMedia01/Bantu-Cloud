const IS_DESKTOP = typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__;

let _token: string | null = null;
const STORAGE_KEY = 'bantu_auth_token';

export type AppModule = 'PEOPLE' | 'TIME_LEAVE' | 'PAYROLL' | 'COMPLIANCE' | 'REPORTS' | 'SETTINGS' | 'RECRUITMENT' | 'PERFORMANCE' | 'EXPENSES' | 'ONBOARDING' | 'TRAINING' | 'ASSETS' | 'SUCCESSION' | 'SURVEYS' | 'ANALYTICS';
export type ModuleAction = 'VIEW' | 'EDIT' | 'DELETE' | 'APPROVE' | 'EXPORT' | 'RUN' | 'CONFIGURE';
export type ModulePermissions = Partial<Record<AppModule, ModuleAction[]>>;

export interface AuthUser {
  userId: string;
  name: string;
  firstName?: string;
  email: string;
  role: 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'COMPANY_USER' | 'EMPLOYEE';
  clientId?: string;
  companyId?: string;
  employeeId?: string;
  isClientAdmin?: boolean;
  permissions?: ModulePermissions;
  enabledModules?: AppModule[] | null;
  exp?: number;
}

function parseJwt(token: string): AuthUser | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64)) as AuthUser;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return _token;
}

export function getUser(): AuthUser | null {
  const token = getToken();
  if (!token) return null;
  const user = parseJwt(token);
  if (!user) return null;
  if (user.exp && user.exp * 1000 < Date.now()) {
    logout();
    return null;
  }
  return user;
}

export function isAuthenticated(): boolean {
  return getUser() !== null;
}

export function getUserRole(): AuthUser['role'] | null {
  return getUser()?.role ?? null;
}

export function logout(): void {
  _token = null;
  sessionStorage.removeItem('token');
  sessionStorage.removeItem('activeCompanyId');
  sessionStorage.removeItem('activeClientId');
  if (!IS_DESKTOP) {
    localStorage.removeItem(STORAGE_KEY);
  } else {
    import('@tauri-apps/api/core').then(m => m.invoke('clear_license_token')).catch(() => {});
  }
}

export function saveAuthData(token: string, companyId?: string): void {
  _token = token;
  if (companyId) {
    sessionStorage.setItem('activeCompanyId', companyId);
  } else {
    sessionStorage.removeItem('activeCompanyId');
  }
  if (!IS_DESKTOP) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    sessionStorage.setItem('token', token);
    import('@tauri-apps/api/core').then(m => m.invoke('store_license_token', { token })).catch(() => {});
  }
}

export async function loadPersistedToken(): Promise<void> {
  if (_token) return;
  if (!IS_DESKTOP) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const user = parseJwt(stored);
      if (user && (!user.exp || user.exp * 1000 > Date.now())) {
        _token = stored;
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    return;
  }
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const token = await invoke<string | null>('get_license_token');
    if (token) {
      _token = token;
      sessionStorage.setItem('token', token);
    }
  } catch {
    // Tauri not available or command not found
  }
}
