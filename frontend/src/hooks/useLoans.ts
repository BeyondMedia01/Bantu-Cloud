import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
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
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: loanKeys.all() });

      const previous = qc.getQueriesData<Loan[]>({ queryKey: loanKeys.all() });

      qc.setQueriesData<Loan[]>({ queryKey: loanKeys.all() }, (old) => {
        if (!old) return old;
        return old.map((l) => (l.id === id ? { ...l, ...data } : l));
      });

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      const { previous } = context as { previous: [QueryKey, Loan[] | undefined][] };
      for (const [key, data] of previous) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all() });
    },
  });
}

export function useDeleteLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LoanAPI.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: loanKeys.all() });

      const previous = qc.getQueriesData<Loan[]>({ queryKey: loanKeys.all() });

      qc.setQueriesData<Loan[]>({ queryKey: loanKeys.all() }, (old) => {
        if (!old) return old;
        return old.filter((l) => l.id !== id);
      });

      return { previous };
    },
    onError: (_err, _id, context) => {
      if (!context) return;
      const { previous } = context as { previous: [QueryKey, Loan[] | undefined][] };
      for (const [key, data] of previous) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: loanKeys.all() });
    },
  });
}
