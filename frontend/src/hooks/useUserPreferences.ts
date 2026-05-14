import { useCallback, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserAPI } from '../api/client';

export type Theme = 'light' | 'dark' | 'system';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

interface UserPreferences {
  theme: Theme;
  dateFormat: DateFormat;
  language: string;
}

const defaultPreferences: UserPreferences = {
  theme: 'light',
  dateFormat: 'DD/MM/YYYY',
  language: 'en',
};

const PREFERENCES_QUERY_KEY = ['user', 'preferences'] as const;

function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem('token');
  } catch {
    return null;
  }
}

function applyThemeToDocument(theme: Theme) {
  const root = window.document.documentElement;
  root.classList.remove('light', 'dark');
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.add(prefersDark ? 'dark' : 'light');
  } else {
    root.classList.add(theme);
  }
}

export function useUserPreferences() {
  const queryClient = useQueryClient();
  const token = getStoredToken();

  const {
    data: preferences = defaultPreferences,
    isLoading,
  } = useQuery({
    queryKey: PREFERENCES_QUERY_KEY,
    queryFn: async () => {
      const res = await UserAPI.me();
      const savedPrefs = res.data.preferences as Partial<UserPreferences> | undefined;
      return savedPrefs ? { ...defaultPreferences, ...savedPrefs } : defaultPreferences;
    },
    enabled: !!token,
    staleTime: 60 * 1000,
  });

  const { mutateAsync: updatePreferences } = useMutation({
    mutationFn: async (newPrefs: Partial<UserPreferences>) => {
      const current = queryClient.getQueryData<UserPreferences>(PREFERENCES_QUERY_KEY) ?? defaultPreferences;
      await UserAPI.update({ preferences: { ...current, ...newPrefs } });
    },
    onMutate: async (newPrefs) => {
      await queryClient.cancelQueries({ queryKey: PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<UserPreferences>(PREFERENCES_QUERY_KEY);
      const merged = { ...(previous ?? defaultPreferences), ...newPrefs };
      queryClient.setQueryData(PREFERENCES_QUERY_KEY, merged);
      if (newPrefs.theme) applyThemeToDocument(newPrefs.theme);
      return { previous };
    },
    onError: (_err, _newPrefs, context) => {
      if (context?.previous) {
        queryClient.setQueryData(PREFERENCES_QUERY_KEY, context.previous);
        applyThemeToDocument(context.previous.theme);
      }
    },
  });

  useEffect(() => {
    if (!token) return;
    applyThemeToDocument(preferences.theme);
  }, [preferences.theme, token]);

  useEffect(() => {
    if (preferences.theme !== 'system' || !token) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyThemeToDocument('system');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preferences.theme, token]);

  const formatDate = useCallback((dateInput: string | Date): string => {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    switch (preferences.dateFormat) {
      case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
      case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
      case 'DD/MM/YYYY':
      default: return `${day}/${month}/${year}`;
    }
  }, [preferences.dateFormat]);

  return useMemo(() => ({
    preferences,
    updatePreferences,
    loading: isLoading && !!token,
    formatDate,
  }), [preferences, updatePreferences, isLoading, token, formatDate]);
}
