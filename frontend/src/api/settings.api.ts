import { http } from './http';
import type {
  SystemSetting, TransactionCode, TransactionRule,
  TaxTable, TaxBracket, NecTable, NecGrade, TaxBand,
} from '../types/domain';

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
  year: number;
  country: string;
}

export interface CurrencyRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  effectiveDate: string;
  source?: string;
}

export interface NSSASettings {
  employeeRate: number;
  employerRate: number;
  employeeRateZIG: number;
  employerRateZIG: number;
  ceilingUSD: number;
  ceilingZIG: number;
  wcifRate: number;
}

export const SystemSettingsAPI = {
  seed: () => http.get<{ message: string; settings: SystemSetting[] }>('/seed-settings'),
  getAll: () => http.get<SystemSetting[]>('/system-settings'),
  create: (data: Partial<SystemSetting>) => http.post<SystemSetting>('/system-settings', data),
  update: (id: string, data: Partial<SystemSetting>) => http.patch<SystemSetting>(`/system-settings/${id}`, data),
  delete: (id: string) => http.delete(`/system-settings/${id}`),
};

export const TransactionCodeAPI = {
  getAll: (params?: Record<string, string>) => http.get<TransactionCode[]>('/transaction-codes', { params }),
  getById: (id: string) => http.get<TransactionCode>(`/transaction-codes/${id}`),
  create: (data: Partial<TransactionCode>) => http.post<TransactionCode>('/transaction-codes', data),
  update: (id: string, data: Partial<TransactionCode>) => http.put<TransactionCode>(`/transaction-codes/${id}`, data),
  delete: (id: string) => http.delete(`/transaction-codes/${id}`),
  import: (rows: Partial<TransactionCode>[]) => http.post('/transactions/import', { rows }),
  getRules: (id: string) => http.get<TransactionRule[]>(`/transaction-codes/${id}/rules`),
  createRule: (id: string, data: Partial<TransactionRule>) => http.post<TransactionRule>(`/transaction-codes/${id}/rules`, data),
  updateRule: (tcId: string, ruleId: string, data: Partial<TransactionRule>) => http.put<TransactionRule>(`/transaction-codes/${tcId}/rules/${ruleId}`, data),
  deleteRule: (tcId: string, ruleId: string) => http.delete(`/transaction-codes/${tcId}/rules/${ruleId}`),
  tarmsCheck: () => http.get('/transaction-codes/tarms-check'),
};

export const TaxTableAPI = {
  getAll: (params?: Record<string, string>) => http.get<TaxTable[]>('/tax-tables', { params }),
  getById: (id: string) => http.get<TaxTable>(`/tax-tables/${id}`),
  create: (data: Partial<TaxTable>) => http.post<TaxTable>('/tax-tables', data),
  update: (id: string, data: Partial<TaxTable>) => http.put<TaxTable>(`/tax-tables/${id}`, data),
  delete: (id: string) => http.delete(`/tax-tables/${id}`),
  getBrackets: (id: string) => http.get<TaxBracket[]>(`/tax-tables/${id}/brackets`),
  createBracket: (id: string, data: Partial<TaxBracket>) => http.post<TaxBracket>(`/tax-tables/${id}/brackets`, data),
  updateBracket: (tableId: string, bracketId: string, data: Partial<TaxBracket>) =>
    http.put<TaxBracket>(`/tax-tables/${tableId}/brackets/${bracketId}`, data),
  deleteBracket: (tableId: string, bracketId: string) =>
    http.delete(`/tax-tables/${tableId}/brackets/${bracketId}`),
  activate: (id: string) => http.patch(`/tax-tables/${id}/activate`),
  replaceBrackets: (id: string, brackets: Partial<TaxBracket>[]) =>
    http.post(`/tax-tables/${id}/brackets/replace`, { brackets }),
  upload: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http.post(`/tax-tables/${id}/upload`, form);
  },
};

export const CurrencyRateAPI = {
  getAll: (params?: Record<string, string>) => http.get<any[]>('/currency-rates', { params }),
  getLatest: () => http.get<CurrencyRate>('/currency-rates/latest'),
  create: (data: any) => http.post('/currency-rates', data),
  update: (id: string, data: any) => http.put(`/currency-rates/${id}`, data),
  delete: (id: string) => http.delete(`/currency-rates/${id}`),
};

export const PublicHolidaysAPI = {
  getAll: (year?: number) => http.get<PublicHoliday[]>('/public-holidays', { params: year ? { year: String(year) } : {} }),
  create: (data: { name: string; date: string }) => http.post<PublicHoliday>('/public-holidays', data),
  seed: (year: number) => http.post('/public-holidays/seed', { year }),
  delete: (id: string) => http.delete(`/public-holidays/${id}`),
};

export const NSSASettingsAPI = {
  get: () => http.get<NSSASettings>('/nssa-settings'),
  update: (data: NSSASettings) => http.put<{ message: string }>('/nssa-settings', data),
};

export const StatutoryRatesAPI = {
  get: () => http.get<{ sdfRate: number; zimdefRate: number }>('/statutory-rates'),
  update: (data: { sdfRate: number; zimdefRate: number }) => http.put<{ message: string }>('/statutory-rates', data),
};

export const NecTableAPI = {
  getAll: (params?: Record<string, string>) => http.get<NecTable[]>('/nec-tables', { params }),
  create: (data: Partial<NecTable>) => http.post<NecTable>('/nec-tables', data),
  getById: (id: string) => http.get<NecTable>(`/nec-tables/${id}`),
  update: (id: string, data: Partial<NecTable>) => http.put<NecTable>(`/nec-tables/${id}`, data),
  delete: (id: string) => http.delete(`/nec-tables/${id}`),
  getGrades: (tableId: string) => http.get<NecGrade[]>(`/nec-tables/${tableId}/grades`),
  createGrade: (tableId: string, data: Partial<NecGrade>) => http.post<NecGrade>(`/nec-tables/${tableId}/grades`, data),
  updateGrade: (tableId: string, gradeId: string, data: Partial<NecGrade>) =>
    http.put<NecGrade>(`/nec-tables/${tableId}/grades/${gradeId}`, data),
  deleteGrade: (tableId: string, gradeId: string) =>
    http.delete(`/nec-tables/${tableId}/grades/${gradeId}`),
};

export const TaxBandAPI = {
  getAll: (params?: Record<string, string>) => http.get<TaxBand[]>('/tax-bands', { params }),
  getById: (id: string) => http.get<TaxBand>(`/tax-bands/${id}`),
  create: (data: Partial<TaxBand>) => http.post<TaxBand>('/tax-bands', data),
  update: (id: string, data: Partial<TaxBand>) => http.put<TaxBand>(`/tax-bands/${id}`, data),
  delete: (id: string) => http.delete(`/tax-bands/${id}`),
};

export const WorkPeriodSettingsAPI = {
  get: () => http.get('/work-period-settings'),
  update: (data: Record<string, number>) => http.put('/work-period-settings', data),
};
