import { useQuery } from '@tanstack/react-query';
import {
  ReportsAPI, DashboardAPI, PublicHolidaysAPI, CurrencyRateAPI,
  type DashboardSummary, type CurrencyRate, type ReminderItem, type PublicHoliday,
} from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

// ─── Query key factory ────────────────────────────────────────────────────────

export const dashboardKeys = {
  all: (companyId: string | null) => ['dashboard', companyId] as const,
  summary: (companyId: string | null) => ['dashboard', companyId, 'summary'] as const,
  reminders: (companyId: string | null) => ['dashboard', companyId, 'reminders'] as const,
  trend: (companyId: string | null) => ['dashboard', companyId, 'trend'] as const,
  holidays: (year: number) => ['dashboard', 'holidays', year] as const,
  exchangeRate: () => ['dashboard', 'exchangeRate'] as const,
};

// ─── Individual hooks (exported for targeted invalidation) ────────────────────

export function useDashboardSummary() {
  const companyId = getActiveCompanyId();
  return useQuery<DashboardSummary>({
    queryKey: dashboardKeys.summary(companyId),
    queryFn: () => ReportsAPI.summary().then((r) => r.data),
    enabled: !!companyId,
    staleTime: 60 * 1000,       // fresh for 1 min
    retry: 1,
  });
}

export function useDashboardReminders() {
  const companyId = getActiveCompanyId();
  return useQuery<{ birthdays: ReminderItem[]; anniversaries: ReminderItem[] }>({
    queryKey: dashboardKeys.reminders(companyId),
    queryFn: () => DashboardAPI.reminders().then((r) => r.data),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,   // reminders change infrequently
    retry: 1,
  });
}

export function usePayrollTrend() {
  const companyId = getActiveCompanyId();
  return useQuery<{ name: string; netPay: number; grossPay: number; ctc: number; headcount: number; usdTotal: number; zigTotal: number }[]>({
    queryKey: dashboardKeys.trend(companyId),
    queryFn: () => ReportsAPI.payrollTrend().then((r) => r.data),
    enabled: !!companyId,
    staleTime: 60 * 1000,
    retry: 1,
  });
}

export function usePublicHolidays() {
  const thisYear = new Date().getFullYear();
  return useQuery<PublicHoliday[]>({
    queryKey: dashboardKeys.holidays(thisYear),
    queryFn: () =>
      Promise.all([
        PublicHolidaysAPI.getAll(thisYear),
        PublicHolidaysAPI.getAll(thisYear + 1),
      ]).then(([r1, r2]) => [...r1.data, ...r2.data]),
    staleTime: 24 * 60 * 60 * 1000, // holidays don't change daily
    retry: 1,
  });
}

export function useExchangeRate() {
  const companyId = getActiveCompanyId();
  return useQuery<CurrencyRate | null>({
    queryKey: dashboardKeys.exchangeRate(),
    queryFn: () => CurrencyRateAPI.getLatest().then((r) => r.data ?? null),
    enabled: !!companyId,
    staleTime: 60 * 60 * 1000,
    retry: false,
  });
}

// ─── Composite hook (used by Dashboard.tsx) ───────────────────────────────────

export interface DashboardData {
  summary: DashboardSummary | undefined;
  reminders: { birthdays: ReminderItem[]; anniversaries: ReminderItem[] };
  trend: { name: string; netPay: number; grossPay: number; ctc: number; headcount: number; usdTotal: number; zigTotal: number }[];
  holidays: PublicHoliday[];
  exchangeRate: CurrencyRate | undefined;
  exchangeRateLoading: boolean;
  loading: boolean;        // true while summary | reminders | trend are fetching
  hasCompany: boolean;
}

export function useDashboardData(): DashboardData {
  const summaryQuery = useDashboardSummary();
  const remindersQuery = useDashboardReminders();
  const trendQuery = usePayrollTrend();
  const holidaysQuery = usePublicHolidays();
  const exchangeRateQuery = useExchangeRate();

  const hasCompany = !!getActiveCompanyId();

  // Show skeleton until we have data OR all retries are exhausted.
  // isLoading is false during retries in TanStack Query v5 (status=error, fetchStatus=fetching),
  // so we also check isFetching when data is absent to cover the retry window.
  const loading =
    hasCompany && (
      (!summaryQuery.data   && (summaryQuery.isLoading   || summaryQuery.isFetching))   ||
      (!remindersQuery.data && (remindersQuery.isLoading || remindersQuery.isFetching)) ||
      (!trendQuery.data     && (trendQuery.isLoading     || trendQuery.isFetching))
    );

  return {
    summary: summaryQuery.data,
    reminders: remindersQuery.data ?? { birthdays: [], anniversaries: [] },
    trend: trendQuery.data ?? [],
    holidays: holidaysQuery.data ?? [],
    exchangeRate: exchangeRateQuery.data,
    exchangeRateLoading: exchangeRateQuery.isLoading,
    loading,
    hasCompany,
  };
}
