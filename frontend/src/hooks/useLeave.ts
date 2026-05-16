import { useQuery, useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { LeaveAPI } from '../api/leave.api';
import type { LeaveRecord, LeaveRequest } from '../types/domain';

export const leaveKeys = {
  all: () => ['leave'] as const,
  list: (params?: Record<string, string>) => ['leave', 'list', params] as const,
};

type LeaveData = { records: LeaveRecord[]; requests: LeaveRequest[] };

export function useLeave(params?: Record<string, string>) {
  return useQuery<LeaveData>({
    queryKey: leaveKeys.list(params),
    queryFn: () => LeaveAPI.getAll(params).then((r) => r.data),
    retry: 1,
  });
}

export function useCreateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<LeaveRecord>) => LeaveAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.all() });
    },
  });
}

export function useApproveLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      LeaveAPI.approve(id, note),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: leaveKeys.all() });
      const previous = qc.getQueriesData<LeaveData>({ queryKey: leaveKeys.all() });
      qc.setQueriesData<LeaveData>({ queryKey: leaveKeys.all() }, (old) => {
        if (!old) return old;
        return { ...old, requests: old.requests.map((r) => (r.id === id ? { ...r, status: 'APPROVED' } : r)) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      const { previous } = context as { previous: [QueryKey, LeaveData | undefined][] };
      for (const [key, data] of previous) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.all() });
    },
  });
}

export function useRejectLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      LeaveAPI.reject(id, note),
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: leaveKeys.all() });
      const previous = qc.getQueriesData<LeaveData>({ queryKey: leaveKeys.all() });
      qc.setQueriesData<LeaveData>({ queryKey: leaveKeys.all() }, (old) => {
        if (!old) return old;
        return { ...old, requests: old.requests.map((r) => (r.id === id ? { ...r, status: 'REJECTED' } : r)) };
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (!context) return;
      const { previous } = context as { previous: [QueryKey, LeaveData | undefined][] };
      for (const [key, data] of previous) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.all() });
    },
  });
}

export function useDeleteLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LeaveAPI.delete(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: leaveKeys.all() });
      const previous = qc.getQueriesData<LeaveData>({ queryKey: leaveKeys.all() });
      qc.setQueriesData<LeaveData>({ queryKey: leaveKeys.all() }, (old) => {
        if (!old) return old;
        return {
          records: old.records.filter((r) => r.id !== id),
          requests: old.requests.filter((r) => r.id !== id),
        };
      });
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (!context) return;
      const { previous } = context as { previous: [QueryKey, LeaveData | undefined][] };
      for (const [key, data] of previous) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.all() });
    },
  });
}
