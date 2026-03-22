import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { UserAPI } from '../api/client';

export type Theme = 'light' | 'dark' | 'system';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

interface UserPreferences {
  theme: Theme;
  dateFormat: DateFormat;
  language: string;
}

interface SettingsContextType {
  preferences: UserPreferences;
  updatePreferences: (newPrefs: Partial<UserPreferences>) => Promise<void>;
  loading: boolean;
  formatDate: (date: string | Date) => string;
}

const defaultPreferences: UserPreferences = {
  theme: 'light',
  dateFormat: 'DD/MM/YYYY',
  language: 'en',
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [loading, setLoading] = useState(true);

  // Apply theme to document
  const applyTheme = useCallback((theme: Theme) => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, []);

  // Fetch preferences on load
  useEffect(() => {
    const fetchPrefs = async () => {
      try {
        const res = await UserAPI.me();
        const savedPrefs = res.data.preferences as Partial<UserPreferences>;
        if (savedPrefs) {
          const merged = { ...defaultPreferences, ...savedPrefs };
          setPreferences(merged);
          applyTheme(merged.theme);
        }
      } catch (err) {
        console.error('Failed to fetch settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPrefs();
  }, [applyTheme]);

  // Listen for system theme changes
  useEffect(() => {
    if (preferences.theme !== 'system') return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => applyTheme('system');
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [preferences.theme, applyTheme]);

  const updatePreferences = async (newPrefs: Partial<UserPreferences>) => {
    const merged = { ...preferences, ...newPrefs };
    setPreferences(merged);
    if (newPrefs.theme) applyTheme(newPrefs.theme);
    
    try {
      await UserAPI.update({ preferences: merged });
    } catch (err) {
      console.error('Failed to sync settings to server:', err);
    }
  };

  const formatDate = (dateInput: string | Date): string => {
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
  };

  return (
    <SettingsContext.Provider value={{ preferences, updatePreferences, loading, formatDate }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
