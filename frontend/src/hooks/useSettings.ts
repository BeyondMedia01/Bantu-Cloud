import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SystemSettingsAPI } from '../api/settings.api';
import type { SystemSetting } from '../types/domain';

export const settingsKeys = {
  all: () => ['system-settings'] as const,
};

export function useSystemSettings() {
  return useQuery<SystemSetting[]>({
    queryKey: settingsKeys.all(),
    queryFn: () => SystemSettingsAPI.getAll().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

export function useCreateSystemSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<SystemSetting>) => SystemSettingsAPI.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all() });
    },
  });
}

export function useUpdateSystemSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<SystemSetting> }) =>
      SystemSettingsAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all() });
    },
  });
}

export function useDeleteSystemSetting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => SystemSettingsAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: settingsKeys.all() });
    },
  });
}
