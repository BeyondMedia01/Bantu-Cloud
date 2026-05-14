import { http } from './http';
import type { Branch, Department } from '../types/common';
import type { SubCompany, Grade } from '../types/domain';

export interface Company {
  id: string;
  clientId: string;
  name: string;
  registrationNumber?: string;
  taxId?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  wcifRate?: number | null;
  sdfRate?: number | null;
  zimdefRate?: number | null;
  createdAt: string;
  updatedAt: string;
}

export const CompanyAPI = {
  getAll: (params?: Record<string, string>) => http.get<Company[]>('/companies', { params }),
  getById: (id: string) => http.get<Company>(`/companies/${id}`),
  create: (data: Partial<Company>) => http.post<Company>('/companies', data),
  update: (id: string, data: Partial<Company>) => http.put<Company>(`/companies/${id}`, data),
  delete: (id: string) => http.delete(`/companies/${id}`),
};

export const BranchAPI = {
  getAll: (params?: Record<string, string>) => http.get<Branch[]>('/branches', { params }),
  getById: (id: string) => http.get<Branch>(`/branches/${id}`),
  create: (data: Partial<Branch>) => http.post<Branch>('/branches', data),
  update: (id: string, data: Partial<Branch>) => http.put<Branch>(`/branches/${id}`, data),
  delete: (id: string) => http.delete(`/branches/${id}`),
};

export const DepartmentAPI = {
  getAll: (params?: Record<string, string>) => http.get<Department[]>('/departments', { params }),
  getById: (id: string) => http.get<Department>(`/departments/${id}`),
  create: (data: Partial<Department>) => http.post<Department>('/departments', data),
  update: (id: string, data: Partial<Department>) => http.put<Department>(`/departments/${id}`, data),
  delete: (id: string) => http.delete(`/departments/${id}`),
};

export const SubCompanyAPI = {
  getAll: (params?: Record<string, string>) => http.get<SubCompany[]>('/sub-companies', { params }),
  create: (data: Partial<SubCompany>) => http.post<SubCompany>('/sub-companies', data),
  update: (id: string, data: Partial<SubCompany>) => http.put<SubCompany>(`/sub-companies/${id}`, data),
  delete: (id: string) => http.delete(`/sub-companies/${id}`),
};

export const GradeAPI = {
  getAll: (params?: Record<string, string>) => http.get<Grade[]>('/grades', { params }),
  getById: (id: string) => http.get<Grade>(`/grades/${id}`),
  create: (data: Partial<Grade>) => http.post<Grade>('/grades', data),
  update: (id: string, data: Partial<Grade>) => http.put<Grade>(`/grades/${id}`, data),
  delete: (id: string) => http.delete(`/grades/${id}`),
};
