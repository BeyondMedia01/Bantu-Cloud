import { http } from './http';

export type LoginResponse =
  | { requiresTwoFactor: true; tempToken: string }
  | { requiresTwoFactor?: false; token: string; refreshToken: string; role: string; clientId: string | null; companyId: string | null; employeeId: string | null; name: string };

export const AuthAPI = {
  login: (data: { email: string; password: string }) => http.post<LoginResponse>('/auth/login', data),
  register: (data: { firstName: string; lastName: string; phone?: string; email: string; password: string; licenseToken: string }) =>
    http.post<{ token: string; refreshToken: string; role: string; clientId: string }>('/auth/register', data),
  trialSignup: (data: { firstName: string; lastName: string; companyName: string; email: string; password: string }) =>
    http.post<{ token: string; refreshToken: string; role: string; clientId: string; companyId: string | null; name: string; userId: string; requiresOnboarding?: boolean }>('/auth/trial-signup', data),
  forgotPassword: (email: string) => http.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    http.post('/auth/reset-password', { token, password }),
  refresh: (userId: string, refreshToken: string) =>
    http.post<{ token: string; refreshToken: string }>('/auth/refresh', { userId, refreshToken }),
  logout: (refreshToken: string) => http.post('/auth/logout', { refreshToken }),

  twoFA: {
    authenticate: (tempToken: string, code: string) =>
      http.post<{ token: string; refreshToken: string; role: string; clientId: string | null; companyId: string | null; name: string }>('/auth/2fa/authenticate', { tempToken, code }),
    setup: () => http.post<{ secret: string; uri: string; qr: string }>('/auth/2fa/setup'),
    verify: (code: string) => http.post('/auth/2fa/verify', { code }),
    disable: (password: string, code: string) => http.post('/auth/2fa/disable', { password, code }),
  },
};

export const SetupAPI = {
  check: () => http.get<{ initialized: boolean; mode: string }>('/setup'),
  init: (data: { name: string; email: string; password: string; clientName: string }) =>
    http.post('/setup', data),
  desktopOnboard: (data: {
    licenseToken: string;
    firstName: string;
    lastName: string;
    email: string;
    password: string;
  }) => http.post<{ token: string; role: string; clientId: string; name: string }>('/setup/desktop', data),
};

export const LicenseValidateAPI = {
  validate: (token: string) => http.post('/license/validate', { token }),
};

export const InviteAPI = {
  send: (data: { companyId: string; email: string; roleIds: string[] }) =>
    http.post<any>('/invites', data),
  list: (companyId: string) => http.get<any[]>('/invites', { params: { companyId } }),
  cancel: (id: string) => http.delete(`/invites/${id}`),
  validate: (token: string) => http.get<{ email: string; companyName: string; companyId: string }>(`/invites/validate/${token}`),
  accept: (data: { token: string; firstName: string; lastName: string; password: string }) =>
    http.post<{ token: string; role: string; companyId: string }>('/invites/accept', data),
};

export const RoleAPI = {
  getAll: (companyId: string) => http.get<any[]>('/roles', { params: { companyId } }),
  create: (data: { companyId: string; name: string; description?: string; permissions: { module: string; actions: string[] }[] }) =>
    http.post<any>('/roles', data),
  update: (id: string, data: { name?: string; description?: string; permissions?: { module: string; actions: string[] }[] }) =>
    http.put<any>(`/roles/${id}`, data),
  delete: (id: string) => http.delete(`/roles/${id}`),
  getUsers: (companyId: string) => http.get<any[]>('/roles/users', { params: { companyId } }),
  assignRoles: (data: { userId: string; companyId: string; roleIds: string[] }) =>
    http.post('/roles/assign', data),
};

export interface ReminderItem {
  id: string;
  name: string;
  date: string;
  position: string;
  years?: number;
}

export interface PayrollRunSummary {
  id: string;
  name: string;
  status: string;
  runDate: string;
  currency: string;
}

export interface DashboardSummary {
  employeeCount: number;
  pendingLeave: number;
  activeLoans: number;
  noTinCount: number;
  noBankCount: number;
  noTinEmployees: { id: string; firstName: string; lastName: string }[];
  noBankEmployees: { id: string; firstName: string; lastName: string }[];
  currentRun: PayrollRunSummary | null;
  lastRun: PayrollRunSummary | null;
}

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  year: number;
  country: string;
}

export interface CurrencyRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  effectiveDate: string;
  source?: string;
}

export const DashboardAPI = {
  reminders: () => http.get<{ birthdays: ReminderItem[]; anniversaries: ReminderItem[] }>('/dashboard/reminders'),
};
