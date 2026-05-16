import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { EmployeeAPI } from '../api/employees.api';
import type { PaginatedResponse } from '../types/common';
import type { Employee } from '../types/employee';

export const employeeKeys = {
  all: () => ['employees'] as const,
  list: (params?: Record<string, string>) => ['employees', 'list', params] as const,
  detail: (id: string) => ['employees', 'detail', id] as const,
};

type EmployeeList = PaginatedResponse<Employee>;

export function useEmployees(params?: Record<string, string>) {
  return useQuery<EmployeeList>({
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
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: employeeKeys.all() });

      const previousList = qc.getQueriesData<EmployeeList>({ queryKey: employeeKeys.list() });
      const previousDetail = qc.getQueryData<Employee>(employeeKeys.detail(id));

      qc.setQueriesData<EmployeeList>({ queryKey: employeeKeys.list() }, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.map((e) => (e.id === id ? { ...e, ...data } : e)) };
      });
      qc.setQueryData<Employee>(employeeKeys.detail(id), (old) => {
        if (!old) return old;
        return { ...old, ...data };
      });

      return { previousList, previousDetail };
    },
    onError: (_err, { id }, context) => {
      if (!context) return;
      const { previousList, previousDetail } = context as {
        previousList: [unknown, EmployeeList | undefined][];
        previousDetail: Employee | undefined;
      };
      for (const [key, data] of previousList) {
        qc.setQueryData(key, data);
      }
      if (previousDetail) {
        qc.setQueryData(employeeKeys.detail(id), previousDetail);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.all() });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => EmployeeAPI.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: employeeKeys.all() });

      const previousList = qc.getQueriesData<EmployeeList>({ queryKey: employeeKeys.list() });
      const previousDetail = qc.getQueryData<Employee>(employeeKeys.detail(id));

      qc.setQueriesData<EmployeeList>({ queryKey: employeeKeys.list() }, (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((e) => e.id !== id) };
      });
      qc.removeQueries({ queryKey: employeeKeys.detail(id) });

      return { previousList, previousDetail };
    },
    onError: (_err, id, context) => {
      if (!context) return;
      const { previousList, previousDetail } = context as {
        previousList: [unknown, EmployeeList | undefined][];
        previousDetail: Employee | undefined;
      };
      for (const [key, data] of previousList) {
        qc.setQueryData(key, data);
      }
      if (previousDetail) {
        qc.setQueryData(employeeKeys.detail(id), previousDetail);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: employeeKeys.all() });
    },
  });
}
