import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AdminAPI } from '../api/admin.api';

export const adminKeys = {
  users: (params?: Record<string, string>) => ['admin', 'users', params] as const,
  stats: () => ['admin', 'stats'] as const,
};

export function useAdminUsers(params?: Record<string, string>) {
  return useQuery({
    queryKey: adminKeys.users(params),
    queryFn: () => AdminAPI.getUsers(params).then((r) => r.data),
    retry: 1,
  });
}

export function useAdminStats() {
  return useQuery({
    queryKey: adminKeys.stats(),
    queryFn: () => AdminAPI.getStats().then((r) => r.data),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => AdminAPI.createUser(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      AdminAPI.updateUser(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}

export function useDeleteAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => AdminAPI.deleteUser(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });
}
