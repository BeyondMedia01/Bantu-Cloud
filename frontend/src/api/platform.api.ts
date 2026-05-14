import { http } from './http';

export const IntelligenceAPI = {
  getAlerts: (companyId: string) => http.get<{ alerts: any[] }>('/intelligence/alerts', { params: { companyId } }),
  getFraud: (companyId: string, skip = 0, take = 500) =>
    http.get<{ flags: any[] }>('/intelligence/fraud', { params: { companyId, skip: String(skip), take: String(take) } }),
  getCashflow: (companyId: string) => http.get<any>('/intelligence/cashflow', { params: { companyId } }),
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

export const InviteAPI = {
  send: (data: { companyId: string; email: string; roleIds: string[] }) =>
    http.post<any>('/invites', data),
  list: (companyId: string) => http.get<any[]>('/invites', { params: { companyId } }),
  cancel: (id: string) => http.delete(`/invites/${id}`),
  validate: (token: string) => http.get<{ email: string; companyName: string; companyId: string }>(`/invites/validate/${token}`),
  accept: (data: { token: string; firstName: string; lastName: string; password: string }) =>
    http.post<{ token: string; role: string; companyId: string }>('/invites/accept', data),
};
