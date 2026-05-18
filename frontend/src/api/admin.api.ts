import { http } from './http';
import type { NSSAContribution } from '../types/domain';

export interface Client {
  id: string;
  name: string;
  taxId?: string;
  isActive: boolean;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

export const AdminAPI = {
  getUsers: (params?: Record<string, string>) => http.get('/admin/users', { params }),
  getUserById: (id: string) => http.get(`/admin/users/${id}`),
  createUser: (data: any) => http.post('/admin/users', data),
  updateUser: (id: string, data: any) => http.put(`/admin/users/${id}`, data),
  deleteUser: (id: string) => http.delete(`/admin/users/${id}`),
  changeRole: (id: string, role: string) => http.post(`/admin/users/${id}/role`, { role }),
  getSettings: () => http.get('/admin/settings'),
  updateSetting: (settingName: string, settingValue: string) =>
    http.put('/admin/settings', { settingName, settingValue }),
  getStats: () => http.get('/admin/stats'),
  getLogs: (params?: Record<string, string>) =>
    http.get<{ logs: AuditLog[]; total: number; page: number; limit: number }>('/admin/logs', { params }),
};

export const ClientAPI = {
  getAll: (params?: Record<string, string>) => http.get<Client[]>('/clients', { params }),
  getById: (id: string) => http.get<Client>(`/clients/${id}`),
  create: (data: Partial<Client>) => http.post<Client>('/clients', data),
  update: (id: string, data: Partial<Client>) => http.put<Client>(`/clients/${id}`, data),
  delete: (id: string) => http.delete(`/clients/${id}`),
  updateModules: (id: string, modules: string[]) => http.patch(`/clients/${id}/modules`, { modules }),
};

export const LicenseAPI = {
  getAll: () => http.get('/admin/licenses'),
  issue: (clientId: string, expiryMonths?: number) =>
    http.post('/license/issue', { clientId, expiryMonths }),
  revoke: (clientId: string) => http.post('/license/revoke', { clientId }),
  reactivate: (clientId: string, expiryMonths?: number) =>
    http.post('/license/reactivate', { clientId, expiryMonths }),
};

export const SubscriptionAPI = {
  get: () => http.get('/subscription'),
  usage: () => http.get('/subscription/usage'),
  create: (plan: string, billingCycle?: string) =>
    http.post('/subscription/create', { plan, billingCycle }),
  upgrade: (plan: string) => http.post('/subscription/upgrade', { plan }),
  portal: () => http.get('/subscription/portal'),
};

export const BackupAPI = {
  export: () => http.get('/backup/export'),
  restore: (backupData: any) => http.post('/backup/restore', { backupData }),
};

export const NSSAContributionAPI = {
  getAll: (params?: Record<string, string>) => http.get<NSSAContribution[]>('/nssa-contributions', { params }),
  getById: (id: string) => http.get<NSSAContribution>(`/nssa-contributions/${id}`),
  create: (data: Partial<NSSAContribution>) => http.post<NSSAContribution>('/nssa-contributions', data),
  update: (id: string, data: Partial<NSSAContribution>) => http.put<NSSAContribution>(`/nssa-contributions/${id}`, data),
  delete: (id: string) => http.delete(`/nssa-contributions/${id}`),
};
