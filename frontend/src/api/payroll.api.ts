import { http } from './http';
import type { PaginatedResponse } from '../types/common';
import type {
  PayrollRun, Payslip, PayrollInput, PayrollLog, PayrollUser,
} from '../types/domain';

const IS_DESKTOP = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
const DESKTOP_CLOUD_URL = import.meta.env.VITE_DESKTOP_API_URL as string || 'https://api.payroll.thinkbantu.com/api';
const WEB_BASE_URL = import.meta.env.VITE_API_URL as string || 'https://api.payroll.thinkbantu.com';
const API_BASE_URL = IS_DESKTOP
  ? DESKTOP_CLOUD_URL
  : WEB_BASE_URL.replace(/\/api\/?$/, '').replace(/\/+$/, '') + '/api';

export const PayrollAPI = {
  getAll: (params?: Record<string, string>) => http.get<PayrollRun[]>('/payroll', { params }),
  getById: (id: string) => http.get<PayrollRun>(`/payroll/${id}`),
  create: (data: Partial<PayrollRun>) => http.post<PayrollRun>('/payroll', data),
  update: (id: string, data: Partial<PayrollRun>) => http.put<PayrollRun>(`/payroll/${id}`, data),
  delete: (id: string) => http.delete(`/payroll/${id}`),
  submit: (runId: string) => http.post(`/payroll/${runId}/submit`),
  approve: (runId: string) => http.post(`/payroll/${runId}/approve`),
  process: (runId: string) => http.post(`/payroll/${runId}/process`),
  getPayslips: (runId: string) => http.get<Payslip[]>(`/payroll/${runId}/payslips`),
  exportCsv: (runId: string) =>
    http.get(`/payroll/${runId}/export`, { responseType: 'blob' }),
  downloadSummaryPdf: (runId: string) =>
    http.get('/reports/summary/pdf', { params: { runId }, responseType: 'blob' }),
  downloadPayslipSummaryPdf: (runId: string) =>
    http.get('/reports/payslip-summary', { params: { runId }, responseType: 'blob' }),
  downloadPayslipPdf: (runId: string, payslipId: string) =>
    http.get(`/payroll/${runId}/payslips/${payslipId}/pdf`, { responseType: 'blob' }),
  sendPayslip: (runId: string, payslipId: string) =>
    http.post<{ message: string; to: string }>(`/payroll/${runId}/payslips/${payslipId}/send`),
  sendAllPayslips: (runId: string) =>
    http.post<{ message: string; count: number }>(`/payroll/${runId}/send-all`),
  preview: (data: { inputs: any[]; currency?: string; period?: string }) =>
    http.post<any[]>('/payroll/preview', data),
  getPayslipPdfUrl: (runId: string, id: string) =>
    `${API_BASE_URL}/payroll/${runId}/payslips/${id}/pdf`,
};

export const StatutoryExportAPI = {
  downloadZimraPaye: (runId: string) =>
    http.get(`/statutory-exports/zimra-paye/${runId}`, { responseType: 'blob' }),
  downloadNssa: (runId: string) =>
    http.get(`/statutory-exports/nssa/${runId}`, { responseType: 'blob' }),
};

export const BankFileAPI = {
  download: (format: 'cbz' | 'stanbic' | 'fidelity', runId: string) =>
    http.get(`/bank-files/${format}/${runId}`, { responseType: 'blob' }),
};

export const PayslipAPI = {
  getAll: (params?: Record<string, string>) => http.get<PaginatedResponse<Payslip>>('/payslips', { params }),
  getById: (id: string) => http.get<Payslip>(`/payslips/${id}`),
};

export const PayrollCalendarAPI = {
  getAll: (params?: Record<string, string>) => http.get<any[]>('/payroll-calendar', { params }),
  getById: (id: string) => http.get(`/payroll-calendar/${id}`),
  create: (data: any) => http.post('/payroll-calendar', data),
  update: (id: string, data: any) => http.put(`/payroll-calendar/${id}`, data),
  close: (id: string) => http.post(`/payroll-calendar/${id}/close`),
  delete: (id: string) => http.delete(`/payroll-calendar/${id}`),
};

export const PayrollInputAPI = {
  getAll: (params?: Record<string, string>) => http.get<PayrollInput[]>('/payroll-inputs', { params }),
  create: (data: Partial<PayrollInput>) => http.post<PayrollInput>('/payroll-inputs', data),
  update: (id: string, data: Partial<PayrollInput>) => http.put<PayrollInput>(`/payroll-inputs/${id}`, data),
  delete: (id: string) => http.delete(`/payroll-inputs/${id}`),
  clearProcessed: () => http.delete('/payroll-inputs/processed'),
  importBulk: (file: File, period?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (period) form.append('period', period);
    return http.post<{ created: number; failed: { row: number; reason: string }[] }>(
      '/payroll-inputs/import', form,
    );
  },
};

export const PayrollCoreAPI = {
  getAll: () => http.get<any[]>('/payroll-core'),
  create: (data: any) => http.post('/payroll-core', data),
  update: (id: string, data: any) => http.put(`/payroll-core/${id}`, data),
  delete: (id: string) => http.delete(`/payroll-core/${id}`),
};

export const PayrollLogAPI = {
  getAll: (params?: Record<string, string>) => http.get<PayrollLog[]>('/payroll-logs', { params }),
  getById: (id: string) => http.get<PayrollLog>(`/payroll-logs/${id}`),
};

export const PayrollUserAPI = {
  getAll: (params?: Record<string, string>) => http.get<PayrollUser[]>('/payroll-users', { params }),
  getById: (id: string) => http.get<PayrollUser>(`/payroll-users/${id}`),
  create: (data: Partial<PayrollUser>) => http.post<PayrollUser>('/payroll-users', data),
  update: (id: string, data: Partial<PayrollUser>) => http.put<PayrollUser>(`/payroll-users/${id}`, data),
  delete: (id: string) => http.delete(`/payroll-users/${id}`),
};

export const UtilitiesAPI = {
  payIncrease: (data: any) => http.post('/payincrease', data),
  backPay: (data: any) => http.post('/backpay', data),
  backPayCommit: (data: any) => http.post('/backpay/commit', data),
  periodEndStatus: (payrollCalendarId: string) =>
    http.get('/period-end/status', { params: { payrollCalendarId } }),
  periodEnd: (payrollCalendarId: string) =>
    http.post('/period-end', { payrollCalendarId }),
  unClosePeriod: (payrollCalendarId: string) =>
    http.post('/period-end/un-close', { payrollCalendarId }),
};
