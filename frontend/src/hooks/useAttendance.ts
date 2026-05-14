import { useQuery } from '@tanstack/react-query';
import { AttendanceAPI } from '../api/attendance.api';
import type { AttendanceSummary } from '../types/domain';

export const attendanceKeys = {
  all: () => ['attendance'] as const,
  list: (params?: Record<string, string>) => ['attendance', 'list', params] as const,
  summary: (startDate: string, endDate: string) =>
    ['attendance', 'summary', startDate, endDate] as const,
};

export function useAttendance(params?: Record<string, string>) {
  return useQuery({
    queryKey: attendanceKeys.list(params),
    queryFn: () => AttendanceAPI.getAll(params).then((r) => r.data),
    retry: 1,
  });
}

export function useAttendanceSummary(startDate: string, endDate: string) {
  return useQuery<AttendanceSummary[]>({
    queryKey: attendanceKeys.summary(startDate, endDate),
    queryFn: () => AttendanceAPI.getSummary(startDate, endDate).then((r) => r.data),
    enabled: !!startDate && !!endDate,
    retry: 1,
  });
}
