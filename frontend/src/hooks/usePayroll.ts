import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
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
    onMutate: async (runId) => {
      await qc.cancelQueries({ queryKey: payrollKeys.all() });

      const previousList = qc.getQueriesData<PayrollRun[]>({ queryKey: payrollKeys.list() });
      const previousDetail = qc.getQueryData<PayrollRun>(payrollKeys.detail(runId));

      qc.setQueriesData<PayrollRun[]>({ queryKey: payrollKeys.list() }, (old) => {
        if (!old) return old;
        return old.map((r) => (r.id === runId ? { ...r, status: 'PROCESSED' } : r));
      });
      qc.setQueryData<PayrollRun>(payrollKeys.detail(runId), (old) => {
        if (!old) return old;
        return { ...old, status: 'PROCESSED' };
      });

      return { previousList, previousDetail };
    },
    onError: (_err, runId, context) => {
      if (!context) return;
      const { previousList, previousDetail } = context as {
        previousList: [QueryKey, PayrollRun[] | undefined][];
        previousDetail: PayrollRun | undefined;
      };
      for (const [key, data] of previousList) {
        qc.setQueryData(key, data);
      }
      if (previousDetail) {
        qc.setQueryData(payrollKeys.detail(runId), previousDetail);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: payrollKeys.all() });
    },
  });
}
