import { useQuery } from '@tanstack/react-query';
import {
    ReportsAPI, DashboardAPI, PublicHolidaysAPI, CurrencyRateAPI,
} from '../api/client';
import { getActiveCompanyId } from '../lib/companyContext';

export const useDashboardData = () => {
    const companyId = getActiveCompanyId();
    const isEnabled = !!companyId;

    // 1. Dashboard Summary Stats
    const summaryQuery = useQuery({
        queryKey: ['dashboard', 'summary', companyId],
        queryFn: () => ReportsAPI.summary().then(res => res.data),
        enabled: isEnabled,
    });

    // 2. Reminders (Birthdays/Anniversaries)
    const remindersQuery = useQuery({
        queryKey: ['dashboard', 'reminders', companyId],
        queryFn: () => DashboardAPI.reminders().then(res => res.data),
        enabled: isEnabled,
        initialData: { birthdays: [], anniversaries: [] },
    });

    // 3. Payroll Trend Graph
    const trendQuery = useQuery({
        queryKey: ['dashboard', 'trend', companyId],
        queryFn: () => ReportsAPI.payrollTrend().then(res => res.data),
        enabled: isEnabled,
        initialData: [],
    });

    // 4. Public Holidays (Global, not company specific)
    const holidaysQuery = useQuery({
        queryKey: ['publicHolidays', new Date().getFullYear()],
        queryFn: async () => {
            const thisYear = new Date().getFullYear();
            const [r1, r2] = await Promise.all([
                PublicHolidaysAPI.getAll(thisYear),
                PublicHolidaysAPI.getAll(thisYear + 1),
            ]);
            return [...r1.data, ...r2.data];
        },
        staleTime: 24 * 60 * 60 * 1000, // Very stable data
        initialData: [],
    });

    // 5. Exchange Rate
    const exchangeRateQuery = useQuery({
        queryKey: ['exchangeRate', 'latest', companyId],
        queryFn: () => CurrencyRateAPI.getLatest().then(res => res.data),
        enabled: isEnabled,
    });

    return {
        summary: summaryQuery.data || null,
        reminders: remindersQuery.data,
        trend: trendQuery.data,
        holidays: holidaysQuery.data,
        exchangeRate: exchangeRateQuery.data || null,
        exchangeRateLoading: exchangeRateQuery.isLoading,
        loading: summaryQuery.isLoading || trendQuery.isLoading,
    };
};