import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LoanAPI } from '../api/loans.api';
import type { Loan } from '../types/domain';

export const loanKeys = {
  all: () => ['loans'] as const,
  list: (params?: Record<string, string>) => ['loans', 'list', params] as const,
};

export function useLoans(params?: Record<string, string>) {
  return useQuery<Loan[]>({
    queryKey: loanKeys.list(params),
    queryFn: () => LoanAPI.getAll(params).then((r) => r.data),
    retry: 1,
  });
}

export function useCreateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Loan>) => LoanAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all() });
    },
  });
}

export function useUpdateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Loan> }) =>
      LoanAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all() });
    },
  });
}

export function useDeleteLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LoanAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all() });
    },
  });
}
