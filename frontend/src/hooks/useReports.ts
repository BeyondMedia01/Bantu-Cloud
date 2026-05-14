import { useQuery } from '@tanstack/react-query';
import { ReportsAPI } from '../api/reports.api';
import type { DashboardSummary } from '../api/reports.api';

export const reportKeys = {
  summary: () => ['reports', 'summary'] as const,
  trend: () => ['reports', 'payroll-trend'] as const,
};

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: reportKeys.summary(),
    queryFn: () => ReportsAPI.summary().then((r) => r.data),
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function usePayrollTrend() {
  return useQuery<{ name: string; netPay: number; grossPay: number; headcount: number }[]>({
    queryKey: reportKeys.trend(),
    queryFn: () => ReportsAPI.payrollTrend().then((r) => r.data),
    staleTime: 60 * 1000,
    retry: 1,
  });
}
