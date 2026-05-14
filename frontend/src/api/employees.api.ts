import { http } from './http';
import type { PaginatedResponse } from '../types/common';
import type { SalaryStructure } from '../types/domain';
import type { Employee } from '../types/employee';

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

export const EmployeeAPI = {
  getAll: (params?: Record<string, string>) => http.get<PaginatedResponse<Employee>>('/employees', { params }),
  getById: (id: string) => http.get<Employee>(`/employees/${id}`),
  create: (data: Partial<Employee>) => http.post<Employee>('/employees', data),
  update: (id: string, data: Partial<Employee>) => http.put<Employee>(`/employees/${id}`, data),
  delete: (id: string) => http.delete(`/employees/${id}`),
  downloadTemplate: (format: 'csv' | 'xlsx') =>
    http.get(`/employees/import/template?format=${format}`, { responseType: 'blob' }),
  importBulk: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post<{ message: string; created: number; failed: { row: number; name: string; reason: string }[] }>(
      '/employees/import', form,
    );
  },
  getAuditLogs: (id: string) => http.get<AuditLog[]>(`/employees/${id}/audit-logs`),
};

export const EmployeeSalaryStructureAPI = {
  getAll: (empId: string, active?: boolean) =>
    http.get<SalaryStructure[]>(`/employees/${empId}/salary-structure`, {
      params: active !== undefined ? { active: String(active) } : {},
    }),
  create: (empId: string, data: Partial<SalaryStructure>) => http.post<SalaryStructure>(`/employees/${empId}/salary-structure`, data),
  update: (empId: string, id: string, data: Partial<SalaryStructure>) =>
    http.put<SalaryStructure>(`/employees/${empId}/salary-structure/${id}`, data),
  endDate: (empId: string, id: string) =>
    http.delete(`/employees/${empId}/salary-structure/${id}?endDate=true`),
  delete: (empId: string, id: string) =>
    http.delete(`/employees/${empId}/salary-structure/${id}`),
};
