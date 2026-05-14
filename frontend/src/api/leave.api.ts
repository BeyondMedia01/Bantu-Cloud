import { http } from './http';
import type {
  LeaveRecord, LeaveRequest, LeavePolicy, LeaveBalance, LeaveEncashment,
} from '../types/domain';

export const LeaveAPI = {
  getAll: (params?: Record<string, string>) => http.get<{ records: LeaveRecord[]; requests: LeaveRequest[] }>('/leave', { params }),
  getById: (id: string) => http.get<LeaveRecord>(`/leave/${id}`),
  create: (data: Partial<LeaveRecord>) => http.post<LeaveRecord>('/leave', data),
  update: (id: string, data: Partial<LeaveRecord>) => http.put<LeaveRecord>(`/leave/${id}`, data),
  delete: (id: string) => http.delete(`/leave/${id}`),
  approve: (id: string, note?: string) => http.put(`/leave/request/${id}/approve`, { note }),
  reject: (id: string, note?: string) => http.put(`/leave/request/${id}/reject`, { note }),
};

export const LeavePolicyAPI = {
  getAll: () => http.get<LeavePolicy[]>('/leave-policies'),
  create: (data: Partial<LeavePolicy>) => http.post<LeavePolicy>('/leave-policies', data),
  update: (id: string, data: Partial<LeavePolicy>) => http.put<LeavePolicy>(`/leave-policies/${id}`, data),
  delete: (id: string) => http.delete(`/leave-policies/${id}`),
};

export const LeaveBalanceAPI = {
  getAll: (params?: Record<string, string>) => http.get<LeaveBalance[]>('/leave-balances', { params }),
  getForEmployee: (employeeId: string, year?: number) =>
    http.get<LeaveBalance[]>(`/leave-balances/${employeeId}`, { params: year ? { year: String(year) } : undefined }),
  runAccrual: () => http.post('/leave-balances/accrue'),
  runYearEnd: (year?: number) => http.post('/leave-balances/year-end', { year }),
  adjust: (id: string, adjustment: number, note?: string) =>
    http.put(`/leave-balances/${id}/adjust`, { adjustment, note }),
};

export const LeaveEncashmentAPI = {
  getAll: () => http.get<LeaveEncashment[]>('/leave-encashments'),
  create: (data: Partial<LeaveEncashment>) => http.post<LeaveEncashment>('/leave-encashments', data),
  approve: (id: string) => http.put(`/leave-encashments/${id}/approve`),
  reject: (id: string, reason?: string) => http.put(`/leave-encashments/${id}/reject`, { reason }),
  process: (id: string) => http.post(`/leave-encashments/${id}/process`),
};
