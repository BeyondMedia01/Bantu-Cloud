import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EmployeeAPI } from '../api/employees.api';
import type { PaginatedResponse } from '../types/common';
import type { Employee } from '../types/employee';

export const employeeKeys = {
  all: () => ['employees'] as const,
  list: (params?: Record<string, string>) => ['employees', 'list', params] as const,
  detail: (id: string) => ['employees', 'detail', id] as const,
};

export function useEmployees(params?: Record<string, string>) {
  return useQuery<PaginatedResponse<Employee>>({
    queryKey: employeeKeys.list(params),
    queryFn: () => EmployeeAPI.getAll(params).then((r) => r.data),
    retry: 1,
  });
}

export function useEmployee(id: string) {
  return useQuery<Employee>({
    queryKey: employeeKeys.detail(id),
    queryFn: () => EmployeeAPI.getById(id).then((r) => r.data),
    enabled: !!id,
    retry: 1,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Employee>) => EmployeeAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.all() });
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Employee> }) =>
      EmployeeAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.all() });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => EmployeeAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.all() });
    },
  });
}
