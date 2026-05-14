import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PayrollAPI } from '../api/payroll.api';
import type { PayrollRun } from '../types/domain';

export const payrollKeys = {
  all: () => ['payroll'] as const,
  list: (params?: Record<string, string>) => ['payroll', 'list', params] as const,
  detail: (id: string) => ['payroll', 'detail', id] as const,
};

export function usePayrollRuns(params?: Record<string, string>) {
  return useQuery<PayrollRun[]>({
    queryKey: payrollKeys.list(params),
    queryFn: () => PayrollAPI.getAll(params).then((r) => r.data),
    retry: 1,
  });
}

export function usePayrollRun(id: string) {
  return useQuery<PayrollRun>({
    queryKey: payrollKeys.detail(id),
    queryFn: () => PayrollAPI.getById(id).then((r) => r.data),
    enabled: !!id,
    retry: 1,
  });
}

export function useCreatePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PayrollRun>) => PayrollAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.all() });
    },
  });
}

export function useProcessPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => PayrollAPI.process(runId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.all() });
    },
  });
}
