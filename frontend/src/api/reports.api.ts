import { http } from './http';
import type { PaginatedResponse } from '../types/common';

export interface PayrollRunSummary {
  id: string;
  name: string;
  status: string;
  runDate: string;
  currency: string;
}

export interface DashboardSummary {
  employeeCount: number;
  pendingLeave: number;
  activeLoans: number;
  noTinCount: number;
  noBankCount: number;
  currentRun: PayrollRunSummary | null;
  lastRun: PayrollRunSummary | null;
}

export interface AuditLog {
  id: string;
  userId: string | null;
  userEmail: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, any> | null;
  ipAddress: string | null;
  createdAt: string;
}

export const ReportsAPI = {
  payslips: (params: Record<string, string>) => http.get('/reports/payslips', { params, responseType: 'blob' }),
  tax: (params: Record<string, string>) => http.get('/reports/tax', { params, responseType: 'blob' }),
  p2: (params: { month: string; year: string; companyId?: string }) =>
    http.get('/reports/p2', { params, responseType: 'blob' }),
  nssaP4a: (params: { month: string; year: string; companyId?: string }) =>
    http.get('/reports/nssa-p4a', { params, responseType: 'blob' }),
  nssaP4aExcel: (params: { month: string; year: string }) =>
    http.get('/reports/nssa-p4a-excel', { params, responseType: 'blob' }),
  tarmsPayeExcel: (params: { month: string; year: string }) =>
    http.get('/reports/tarms-paye-excel', { params, responseType: 'blob' }),
  eft: (params: { runId: string }) =>
    http.get('/reports/eft', { params, responseType: 'blob' }),
  leave: (params?: Record<string, string>) => http.get('/reports/leave', { params, responseType: 'blob' }),
  loans: (params?: Record<string, string>) => http.get('/reports/loans', { params, responseType: 'blob' }),
  departments: () => http.get('/reports/departments', { responseType: 'blob' }),
  journals: (params: Record<string, string>) => http.get('/reports/journals', { params, responseType: 'blob' }),
  summary: () => http.get<DashboardSummary>('/reports/summary'),
  payrollTrend: () => http.get<{ name: string; netPay: number; grossPay: number; ctc: number; headcount: number; usdTotal: number; zigTotal: number }[]>('/reports/payroll-trend'),
  it7: (employeeId: string, year: number) =>
    http.get(`/reports/it7/${employeeId}/${year}`, { responseType: 'blob' }),
  pensionExport: (params: { month: string; type: string; companyId?: string }) =>
    http.get('/reports/pension-export', { params, responseType: 'blob' }),
  itf16: (params: { year: string }) =>
    http.get('/reports/itf16', { params, responseType: 'blob' }),
  payeReport: (params: { year: string; format: string }) =>
    http.get('/reports/tax', { params, responseType: 'blob' }),
  nssaReport: (params: { month: string; year: string }) =>
    http.get('/reports/nssa-p4a', { params, responseType: 'blob' }),
  totalJournal: (params: { runId: string }) =>
    http.get('/reports/total-journal', { params, responseType: 'blob' }),
  departmentJournal: (params: { runId: string }) =>
    http.get('/reports/department-journal', { params, responseType: 'blob' }),
  medicalAidReport: (params: { runId: string }) =>
    http.get('/reports/medical-aid', { params, responseType: 'blob' }),
  overtimeReport: (params: { runId: string }) =>
    http.get('/reports/overtime', { params, responseType: 'blob' }),
  salaryAdvance: () =>
    http.get('/reports/salary-advance', { responseType: 'blob' }),
  leaveProvision: () =>
    http.get('/reports/leave-provision', { responseType: 'blob' }),
  employeeListing: () =>
    http.get('/reports/employee-listing', { responseType: 'blob' }),
};

export const AuditLogAPI = {
  getAll: (params?: Record<string, string>) => http.get<PaginatedResponse<AuditLog>>('/admin/logs', { params }),
};
