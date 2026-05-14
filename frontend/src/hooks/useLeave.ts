import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { LeaveAPI } from '../api/leave.api';
import type { LeaveRecord, LeaveRequest } from '../types/domain';

export const leaveKeys = {
  all: () => ['leave'] as const,
  list: (params?: Record<string, string>) => ['leave', 'list', params] as const,
};

export function useLeave(params?: Record<string, string>) {
  return useQuery<{ records: LeaveRecord[]; requests: LeaveRequest[] }>({
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.all() });
    },
  });
}

export function useRejectLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      LeaveAPI.reject(id, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.all() });
    },
  });
}

export function useDeleteLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => LeaveAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: leaveKeys.all() });
    },
  });
}
