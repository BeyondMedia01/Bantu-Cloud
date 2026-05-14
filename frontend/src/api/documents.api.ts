import { http } from './http';
import type { Expense, ExpenseCategory } from '../types/domain';

export const DocumentsAPI = {
  getByEmployee: (employeeId: string) => http.get(`/documents/employee/${employeeId}`),
  upload: (data: FormData) => http.post('/documents/upload', data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  delete: (id: string) => http.delete(`/documents/${id}`),
};

export const ExpenseAPI = {
  getAll: (params?: Record<string, string>) => http.get<{ data: Expense[] }>('/expenses', { params }),
  getCategories: () => http.get<{ data: ExpenseCategory[] }>('/expenses/categories'),
  getById: (id: string) => http.get<{ data: Expense }>(`/expenses/${id}`),
  create: (data: Partial<Expense>) => http.post<Expense>('/expenses', data),
  update: (id: string, data: Partial<Expense>) => http.put<{ data: Expense }>(`/expenses/${id}`, data),
  delete: (id: string) => http.delete(`/expenses/${id}`),
  approve: (id: string) => http.put<{ data: Expense }>(`/expenses/${id}/approve`),
  reject: (id: string, reason?: string) => http.put<{ data: Expense }>(`/expenses/${id}/reject`, { reason }),
  process: (id: string, payrollRunId?: string) => http.post<{ data: Expense }>(`/expenses/${id}/process`, { payrollRunId }),
};
