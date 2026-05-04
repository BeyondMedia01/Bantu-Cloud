import axios from 'axios';
import type { PaginatedResponse, Branch, Department } from '../types/common';
import type {
  TaxBand, SubCompany, Grade, NecTable, NecGrade, TaxTable, TaxBracket,
  TransactionCode, TransactionRule, PayrollRun, Payslip, PayrollInput,
  LeaveRecord, LeaveRequest, LeavePolicy, LeaveBalance, LeaveEncashment,
  Loan, LoanRepayment, Shift, RosterEntry, AttendanceLog, AttendanceSummary,
  Device, SystemSetting, PayrollLog, PayrollUser, NSSAContribution,
  SalaryStructure, Document,
} from '../types/domain';

if (import.meta.env.PROD && !import.meta.env.VITE_API_URL) {
  throw new Error(
    '[api] VITE_API_URL is not set. Set it in your Vercel environment variables before deploying.'
  );
}
const API_BASE_URL = import.meta.env.VITE_API_URL || `http://${window.location.hostname || 'localhost'}:5005/api`;

const api = axios.create({
  baseURL: API_BASE_URL,
});

// ─── Request Interceptor — attach token and companyId ─────────────────────────

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('token');
  const companyId = sessionStorage.getItem('activeCompanyId');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (companyId) config.headers['x-company-id'] = companyId;
  return config;
});

// ─── Response Interceptor — unwrap envelope + handle 401 ─────────────────────
//
// Non-paginated JSON responses now use { data: X } envelopes. This interceptor
// unwraps them so call sites read `response.data` directly (unchanged behaviour).
//
// Paginated responses { data: [...], total, page, limit } are left intact because
// call sites already read `response.data.data` and `response.data.total` for those.
// Blob responses (PDF/CSV downloads) are also passed through untouched.

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (
      body !== null &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      response.config.responseType !== 'blob' &&
      Object.prototype.hasOwnProperty.call(body, 'data') &&
      // Leave paginated envelopes intact — callers already read .data.data / .data.total
      !Object.prototype.hasOwnProperty.call(body, 'total')
    ) {
      response.data = body.data;
    }
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('activeCompanyId');
      sessionStorage.removeItem('activeClientId');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const AuthAPI = {
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  register: (data: { firstName: string; lastName: string; phone?: string; email: string; password: string; licenseToken: string }) =>
    api.post('/auth/register', data),
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string) =>
    api.post('/auth/reset-password', { token, password }),
};

export const SetupAPI = {
  check: () => api.get('/setup'),
  init: (data: { name: string; email: string; password: string; clientName: string }) =>
    api.post('/setup', data),
};

export const LicenseValidateAPI = {
  validate: (token: string) => api.post('/license/validate', { token }),
};

// ─── User ─────────────────────────────────────────────────────────────────────

export const UserAPI = {
  me: () => api.get<{ id: string; name: string; email: string; role: string; preferences?: any }>('/user/me'),
  companies: () => api.get('/user/companies'),
  update: (data: { name?: string; preferences?: any }) => api.put('/user/me', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    api.put('/user/change-password', data),
};

// ─── Dashboard Types ──────────────────────────────────────────────────────────

export interface ReminderItem {
  id: string;
  name: string;
  date: string;
  position: string;
  years?: number;
}

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

export interface PublicHoliday {
  id: string;
  name: string;
  date: string;
}

export interface CurrencyRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number | string;
  effectiveDate: string;
  source?: string;
}

export const DashboardAPI = {
  reminders: () => api.get<{ birthdays: ReminderItem[]; anniversaries: ReminderItem[] }>('/dashboard/reminders'),
};

// ─── Platform — Clients ───────────────────────────────────────────────────────
export interface Client {
  id: string;
  name: string;
  taxId?: string;
  isActive: boolean;
  defaultCurrency: string;
  createdAt: string;
  updatedAt: string;
}

export const ClientAPI = {
  getAll: (params?: Record<string, string>) => api.get<Client[]>('/clients', { params }),
  getById: (id: string) => api.get<Client>(`/clients/${id}`),
  create: (data: Partial<Client>) => api.post<Client>('/clients', data),
  update: (id: string, data: Partial<Client>) => api.put<Client>(`/clients/${id}`, data),
  delete: (id: string) => api.delete(`/clients/${id}`),
};

// ─── Org Structure ────────────────────────────────────────────────────────────
export interface Company {
  id: string;
  clientId: string;
  name: string;
  registrationNumber?: string;
  taxId?: string;
  address?: string;
  contactEmail?: string;
  contactPhone?: string;
  wcifRate?: number | null;
  sdfRate?: number | null;
  zimdefRate?: number | null;
  createdAt: string;
  updatedAt: string;
}

export const CompanyAPI = {
  getAll: (params?: Record<string, string>) => api.get<Company[]>('/companies', { params }),
  getById: (id: string) => api.get<Company>(`/companies/${id}`),
  create: (data: Partial<Company>) => api.post<Company>('/companies', data),
  update: (id: string, data: Partial<Company>) => api.put<Company>(`/companies/${id}`, data),
  delete: (id: string) => api.delete(`/companies/${id}`),
};

export const BranchAPI = {
  getAll: (params?: Record<string, string>) => api.get<Branch[]>('/branches', { params }),
  getById: (id: string) => api.get<Branch>(`/branches/${id}`),
  create: (data: Partial<Branch>) => api.post<Branch>('/branches', data),
  update: (id: string, data: Partial<Branch>) => api.put<Branch>(`/branches/${id}`, data),
  delete: (id: string) => api.delete(`/branches/${id}`),
};

export const DepartmentAPI = {
  getAll: (params?: Record<string, string>) => api.get<Department[]>('/departments', { params }),
  getById: (id: string) => api.get<Department>(`/departments/${id}`),
  create: (data: Partial<Department>) => api.post<Department>('/departments', data),
  update: (id: string, data: Partial<Department>) => api.put<Department>(`/departments/${id}`, data),
  delete: (id: string) => api.delete(`/departments/${id}`),
};

export const SubCompanyAPI = {
  getAll: (params?: Record<string, string>) => api.get<SubCompany[]>('/sub-companies', { params }),
  create: (data: Partial<SubCompany>) => api.post<SubCompany>('/sub-companies', data),
  update: (id: string, data: Partial<SubCompany>) => api.put<SubCompany>(`/sub-companies/${id}`, data),
  delete: (id: string) => api.delete(`/sub-companies/${id}`),
};

import type { Employee } from '../types/employee';

export const EmployeeAPI = {
  getAll: (params?: Record<string, string>) => api.get<PaginatedResponse<Employee>>('/employees', { params }),
  getById: (id: string) => api.get<Employee>(`/employees/${id}`),
  create: (data: Partial<Employee>) => api.post<Employee>('/employees', data),
  update: (id: string, data: Partial<Employee>) => api.put<Employee>(`/employees/${id}`, data),
  delete: (id: string) => api.delete(`/employees/${id}`),
  downloadTemplate: (format: 'csv' | 'xlsx') =>
    api.get(`/employees/import/template?format=${format}`, { responseType: 'blob' }),
  importBulk: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ message: string; created: number; failed: { row: number; name: string; reason: string } [] }> (
      '/employees/import', form,
    );
  },
  getAuditLogs: (id: string) => api.get<AuditLog[]>(`/employees/${id}/audit-logs`),
};

export const EmployeeSalaryStructureAPI = {
  getAll: (empId: string, active?: boolean) =>
    api.get<SalaryStructure[]>(`/employees/${empId}/salary-structure`, {
      params: active !== undefined ? { active: String(active) } : {},
    }),
  create: (empId: string, data: Partial<SalaryStructure>) => api.post<SalaryStructure>(`/employees/${empId}/salary-structure`, data),
  update: (empId: string, id: string, data: Partial<SalaryStructure>) =>
    api.put<SalaryStructure>(`/employees/${empId}/salary-structure/${id}`, data),
  endDate: (empId: string, id: string) =>
    api.delete(`/employees/${empId}/salary-structure/${id}?endDate=true`),
  delete: (empId: string, id: string) =>
    api.delete(`/employees/${empId}/salary-structure/${id}`),
};

export const EmployeeSelfAPI = {
  getProfile: () => api.get('/employee/profile'),
  updateProfile: (data: any) => api.put('/employee/profile', data),
  getPayslips: () => api.get('/employee/payslips'),
  getLeave: () => api.get('/employee/leave'),
};

// ─── Payroll ──────────────────────────────────────────────────────────────────

export const PayrollAPI = {
  getAll: (params?: Record<string, string>) => api.get<PayrollRun[]>('/payroll', { params }),
  getById: (id: string) => api.get<PayrollRun>(`/payroll/${id}`),
  create: (data: Partial<PayrollRun>) => api.post<PayrollRun>('/payroll', data),
  update: (id: string, data: Partial<PayrollRun>) => api.put<PayrollRun>(`/payroll/${id}`, data),
  delete: (id: string) => api.delete(`/payroll/${id}`),
  submit: (runId: string) => api.post(`/payroll/${runId}/submit`),
  approve: (runId: string) => api.post(`/payroll/${runId}/approve`),
  process: (runId: string) => api.post(`/payroll/${runId}/process`),
  getPayslips: (runId: string) => api.get<Payslip[]>(`/payroll/${runId}/payslips`),
  exportCsv: (runId: string) =>
    api.get(`/payroll/${runId}/export`, { responseType: 'blob' }),
  downloadSummaryPdf: (runId: string) =>
    api.get(`/payroll/${runId}/summary/pdf`, { responseType: 'blob' }),
  downloadPayslipSummaryPdf: (runId: string) =>
    api.get(`/payroll/${runId}/payslip-summary`, { responseType: 'blob' }),
  downloadPayslipPdf: (runId: string, payslipId: string) =>
    api.get(`/payroll/${runId}/payslips/${payslipId}/pdf`, { responseType: 'blob' }),
  sendPayslip: (runId: string, payslipId: string) =>
    api.post<{ message: string; to: string }>(`/payroll/${runId}/payslips/${payslipId}/send`),
  sendAllPayslips: (runId: string) =>
    api.post<{ message: string; count: number }>(`/payroll/${runId}/send-all`),
  preview: (data: { inputs: any[]; currency?: string; period?: string }) =>
    api.post<any[]>('/payroll/preview', data),
  getPayslipPdfUrl: (runId: string, id: string) =>
    `${api.defaults.baseURL}/payroll/${runId}/payslips/${id}/pdf`,
};

export const StatutoryExportAPI = {
  downloadZimraPaye: (runId: string) =>
    api.get(`/statutory-exports/zimra-paye/${runId}`, { responseType: 'blob' }),
  downloadNssa: (runId: string) =>
    api.get(`/statutory-exports/nssa/${runId}`, { responseType: 'blob' }),
};

export const BankFileAPI = {
  download: (format: 'cbz' | 'stanbic' | 'fidelity', runId: string) =>
    api.get(`/bank-files/${format}/${runId}`, { responseType: 'blob' }),
};

export const PayslipAPI = {
  getAll: (params?: Record<string, string>) => api.get<PaginatedResponse<Payslip>>('/payslips', { params }),
  getById: (id: string) => api.get<Payslip>(`/payslips/${id}`),
};

export const PayrollCalendarAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/payroll-calendar', { params }),
  getById: (id: string) => api.get(`/payroll-calendar/${id}`),
  create: (data: any) => api.post('/payroll-calendar', data),
  update: (id: string, data: any) => api.put(`/payroll-calendar/${id}`, data),
  close: (id: string) => api.post(`/payroll-calendar/${id}/close`),
  delete: (id: string) => api.delete(`/payroll-calendar/${id}`),
};

export const PayrollInputAPI = {
  getAll: (params?: Record<string, string>) => api.get<PayrollInput[]>('/payroll-inputs', { params }),
  create: (data: Partial<PayrollInput>) => api.post<PayrollInput>('/payroll-inputs', data),
  update: (id: string, data: Partial<PayrollInput>) => api.put<PayrollInput>(`/payroll-inputs/${id}`, data),
  delete: (id: string) => api.delete(`/payroll-inputs/${id}`),
  clearProcessed: () => api.delete('/payroll-inputs/processed'),
  importBulk: (file: File, period?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (period) form.append('period', period);
    return api.post<{ created: number; failed: { row: number; reason: string }[] }>(
      '/payroll-inputs/import', form,
    );
  },
};

export const TransactionCodeAPI = {
  getAll: (params?: Record<string, string>) => api.get<TransactionCode[]>('/transaction-codes', { params }),
  getById: (id: string) => api.get<TransactionCode>(`/transaction-codes/${id}`),
  create: (data: Partial<TransactionCode>) => api.post<TransactionCode>('/transaction-codes', data),
  update: (id: string, data: Partial<TransactionCode>) => api.put<TransactionCode>(`/transaction-codes/${id}`, data),
  delete: (id: string) => api.delete(`/transaction-codes/${id}`),
  import: (rows: Partial<TransactionCode>[]) => api.post('/transactions/import', { rows }),
  getRules: (id: string) => api.get<TransactionRule[]>(`/transaction-codes/${id}/rules`),
  createRule: (id: string, data: Partial<TransactionRule>) => api.post<TransactionRule>(`/transaction-codes/${id}/rules`, data),
  updateRule: (tcId: string, ruleId: string, data: Partial<TransactionRule>) => api.put<TransactionRule>(`/transaction-codes/${tcId}/rules/${ruleId}`, data),
  deleteRule: (tcId: string, ruleId: string) => api.delete(`/transaction-codes/${tcId}/rules/${ruleId}`),
  tarmsCheck: () => api.get('/transaction-codes/tarms-check'),
};

export const TaxTableAPI = {
  getAll: (params?: Record<string, string>) => api.get<TaxTable[]>('/tax-tables', { params }),
  getById: (id: string) => api.get<TaxTable>(`/tax-tables/${id}`),
  create: (data: Partial<TaxTable>) => api.post<TaxTable>('/tax-tables', data),
  update: (id: string, data: Partial<TaxTable>) => api.put<TaxTable>(`/tax-tables/${id}`, data),
  delete: (id: string) => api.delete(`/tax-tables/${id}`),
  getBrackets: (id: string) => api.get<TaxBracket[]>(`/tax-tables/${id}/brackets`),
  createBracket: (id: string, data: Partial<TaxBracket>) => api.post<TaxBracket>(`/tax-tables/${id}/brackets`, data),
  updateBracket: (tableId: string, bracketId: string, data: Partial<TaxBracket>) =>
    api.put<TaxBracket>(`/tax-tables/${tableId}/brackets/${bracketId}`, data),
  deleteBracket: (tableId: string, bracketId: string) =>
    api.delete(`/tax-tables/${tableId}/brackets/${bracketId}`),
  activate: (id: string) => api.patch(`/tax-tables/${id}/activate`),
  replaceBrackets: (id: string, brackets: Partial<TaxBracket>[]) =>
    api.post(`/tax-tables/${id}/brackets/replace`, { brackets }),
  upload: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/tax-tables/${id}/upload`, form);
  },
};

export const SystemSettingsAPI = {
  seed: () => api.get<{ message: string; settings: SystemSetting[] }>('/seed-settings'),
  getAll: () => api.get<SystemSetting[]>('/system-settings'),
  create: (data: Partial<SystemSetting>) => api.post<SystemSetting>('/system-settings', data),
  update: (id: string, data: Partial<SystemSetting>) => api.patch<SystemSetting>(`/system-settings/${id}`, data),
  delete: (id: string) => api.delete(`/system-settings/${id}`),
};

export const GradeAPI = {
  getAll: (params?: Record<string, string>) => api.get<Grade[]>('/grades', { params }),
  getById: (id: string) => api.get<Grade>(`/grades/${id}`),
  create: (data: Partial<Grade>) => api.post<Grade>('/grades', data),
  update: (id: string, data: Partial<Grade>) => api.put<Grade>(`/grades/${id}`, data),
  delete: (id: string) => api.delete(`/grades/${id}`),
};

// ─── Leave ────────────────────────────────────────────────────────────────────

export const LeaveAPI = {
  getAll: (params?: Record<string, string>) => api.get<{ records: LeaveRecord[]; requests: LeaveRequest[] }>('/leave', { params }),
  getById: (id: string) => api.get<LeaveRecord>(`/leave/${id}`),
  create: (data: Partial<LeaveRecord>) => api.post<LeaveRecord>('/leave', data),
  update: (id: string, data: Partial<LeaveRecord>) => api.put<LeaveRecord>(`/leave/${id}`, data),
  delete: (id: string) => api.delete(`/leave/${id}`),
  approve: (id: string, note?: string) => api.put(`/leave/request/${id}/approve`, { note }),
  reject: (id: string, note?: string) => api.put(`/leave/request/${id}/reject`, { note }),
};

// ─── Leave Policies ───────────────────────────────────────────────────────────

export const LeavePolicyAPI = {
  getAll: () => api.get<LeavePolicy[]>('/leave-policies'),
  create: (data: Partial<LeavePolicy>) => api.post<LeavePolicy>('/leave-policies', data),
  update: (id: string, data: Partial<LeavePolicy>) => api.put<LeavePolicy>(`/leave-policies/${id}`, data),
  delete: (id: string) => api.delete(`/leave-policies/${id}`),
};

// ─── Leave Balances ───────────────────────────────────────────────────────────

export const LeaveBalanceAPI = {
  getAll: (params?: Record<string, string>) => api.get<LeaveBalance[]>('/leave-balances', { params }),
  getForEmployee: (employeeId: string, year?: number) =>
    api.get<LeaveBalance[]>(`/leave-balances/${employeeId}`, { params: year ? { year: String(year) } : undefined }),
  runAccrual: () => api.post('/leave-balances/accrue'),
  runYearEnd: (year?: number) => api.post('/leave-balances/year-end', { year }),
  adjust: (id: string, adjustment: number, note?: string) =>
    api.put(`/leave-balances/${id}/adjust`, { adjustment, note }),
};

// ─── Leave Encashments ────────────────────────────────────────────────────────

export const LeaveEncashmentAPI = {
  getAll: () => api.get<LeaveEncashment[]>('/leave-encashments'),
  create: (data: Partial<LeaveEncashment>) => api.post<LeaveEncashment>('/leave-encashments', data),
  approve: (id: string) => api.put(`/leave-encashments/${id}/approve`),
  reject: (id: string, reason?: string) => api.put(`/leave-encashments/${id}/reject`, { reason }),
  process: (id: string) => api.post(`/leave-encashments/${id}/process`),
};

// ─── Loans ────────────────────────────────────────────────────────────────────

export const LoanAPI = {
  getAll: (params?: Record<string, string>) => api.get<Loan[]>('/loans', { params }),
  getById: (id: string) => api.get<Loan>(`/loans/${id}`),
  create: (data: Partial<Loan>) => api.post<Loan>('/loans', data),
  update: (id: string, data: Partial<Loan>) => api.put<Loan>(`/loans/${id}`, data),
  delete: (id: string) => api.delete(`/loans/${id}`),
  getRepayments: (id: string) => api.get<LoanRepayment[]>(`/loans/${id}/repayments`),
  markRepaymentPaid: (repaymentId: string) =>
    api.patch(`/loans/repayments/${repaymentId}`),
};

// ─── License Management ───────────────────────────────────────────────────────

export const LicenseAPI = {
  getAll: () => api.get('/license'),
  issue: (clientId: string, expiryMonths?: number) =>
    api.post('/license/issue', { clientId, expiryMonths }),
  revoke: (clientId: string) => api.post('/license/revoke', { clientId }),
  reactivate: (clientId: string, expiryMonths?: number) =>
    api.post('/license/reactivate', { clientId, expiryMonths }),
};

// ─── Admin ────────────────────────────────────────────────────────────────────

export const AdminAPI = {
  getUsers: (params?: Record<string, string>) => api.get('/admin/users', { params }),
  getUserById: (id: string) => api.get(`/admin/users/${id}`),
  createUser: (data: any) => api.post('/admin/users', data),
  updateUser: (id: string, data: any) => api.put(`/admin/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`),
  changeRole: (id: string, role: string) => api.post(`/admin/users/${id}/role`, { role }),
  getSettings: () => api.get('/admin/settings'),
  updateSetting: (settingName: string, settingValue: string) =>
    api.put('/admin/settings', { settingName, settingValue }),
  getStats: () => api.get('/admin/stats'),
  getLogs: (params?: Record<string, string>) =>
    api.get<{ logs: AuditLog[]; total: number; page: number; limit: number }>('/admin/logs', { params }),
};

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

// ─── Reports ──────────────────────────────────────────────────────────────────

export const ReportsAPI = {
  payslips: (params: Record<string, string>) => api.get('/reports/payslips', { params, responseType: 'blob' }),
  tax: (params: Record<string, string>) => api.get('/reports/tax', { params, responseType: 'blob' }),
  p2: (params: { month: string; year: string; companyId?: string }) =>
    api.get('/reports/p2', { params, responseType: 'blob' }),
  nssaP4a: (params: { month: string; year: string; companyId?: string }) =>
    api.get('/reports/nssa-p4a', { params, responseType: 'blob' }),
  nssaP4aExcel: (params: { month: string; year: string }) =>
    api.get('/reports/nssa-p4a-excel', { params, responseType: 'blob' }),
  tarmsPayeExcel: (params: { month: string; year: string }) =>
    api.get('/reports/tarms-paye-excel', { params, responseType: 'blob' }),
  eft: (params: { runId: string }) =>
    api.get('/reports/eft', { params, responseType: 'blob' }),
  leave: (params?: Record<string, string>) => api.get('/reports/leave', { params, responseType: 'blob' }),
  loans: (params?: Record<string, string>) => api.get('/reports/loans', { params, responseType: 'blob' }),
  departments: () => api.get('/reports/departments', { responseType: 'blob' }),
  journals: (params: Record<string, string>) => api.get('/reports/journals', { params, responseType: 'blob' }),
  summary: () => api.get<DashboardSummary>('/reports/summary'),
  payrollTrend: () => api.get<{ name: string; netPay: number; grossPay: number; headcount: number }[]>('/reports/payroll-trend'),
  it7: (employeeId: string, year: number) => 
    api.get(`/reports/it7/${employeeId}/${year}`, { responseType: 'blob' }),
  pensionExport: (params: { month: string; type: string; companyId?: string }) =>
    api.get('/reports/pension-export', { params, responseType: 'blob' }),
  itf16: (params: { year: string }) =>
    api.get('/reports/itf16', { params, responseType: 'blob' }),
};

export const DocumentsAPI = {
  getByEmployee: (employeeId: string) => api.get(`/documents/employee/${employeeId}`),
  upload: (data: FormData) => api.post('/documents/upload', data, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  delete: (id: string) => api.delete(`/documents/${id}`),
};

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const SubscriptionAPI = {
  get: () => api.get('/subscription'),
  usage: () => api.get('/subscription/usage'),
  create: (plan: string, billingCycle?: string) =>
    api.post('/subscription/create', { plan, billingCycle }),
  upgrade: (plan: string) => api.post('/subscription/upgrade', { plan }),
  portal: () => api.get('/subscription/portal'),
};

// ─── NSSA Settings ────────────────────────────────────────────────────────────

export interface NSSASettings {
  employeeRate: number;
  employerRate: number;
  employeeRateZIG: number;
  employerRateZIG: number;
  ceilingUSD: number;
  ceilingZIG: number;
  wcifRate: number;
}

export const NSSASettingsAPI = {
  get: () => api.get<NSSASettings>('/nssa-settings'),
  update: (data: NSSASettings) => api.put<{ message: string }>('/nssa-settings', data),
};

export const StatutoryRatesAPI = {
  get: () => api.get<{ sdfRate: number; zimdefRate: number }>('/statutory-rates'),
  update: (data: { sdfRate: number; zimdefRate: number }) => api.put<{ message: string }>('/statutory-rates', data),
};

// ─── Currency Rates ───────────────────────────────────────────────────────────

export const CurrencyRateAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/currency-rates', { params }),
  getLatest: () => api.get<CurrencyRate>('/currency-rates/latest'),
  create: (data: any) => api.post('/currency-rates', data),
  update: (id: string, data: any) => api.put(`/currency-rates/${id}`, data),
  delete: (id: string) => api.delete(`/currency-rates/${id}`),
};

// ─── NEC Tables ───────────────────────────────────────────────────────────────

export const NecTableAPI = {
  getAll: (params?: Record<string, string>) => api.get<NecTable[]>('/nec-tables', { params }),
  create: (data: Partial<NecTable>) => api.post<NecTable>('/nec-tables', data),
  getById: (id: string) => api.get<NecTable>(`/nec-tables/${id}`),
  update: (id: string, data: Partial<NecTable>) => api.put<NecTable>(`/nec-tables/${id}`, data),
  delete: (id: string) => api.delete(`/nec-tables/${id}`),
  getGrades: (tableId: string) => api.get<NecGrade[]>(`/nec-tables/${tableId}/grades`),
  createGrade: (tableId: string, data: Partial<NecGrade>) => api.post<NecGrade>(`/nec-tables/${tableId}/grades`, data),
  updateGrade: (tableId: string, gradeId: string, data: Partial<NecGrade>) =>
    api.put<NecGrade>(`/nec-tables/${tableId}/grades/${gradeId}`, data),
  deleteGrade: (tableId: string, gradeId: string) =>
    api.delete(`/nec-tables/${tableId}/grades/${gradeId}`),
};

// ─── Utilities ────────────────────────────────────────────────────────────────

export const UtilitiesAPI = {
  payIncrease: (data: any) => api.post('/payincrease', data),
  backPay: (data: any) => api.post('/backpay', data),
  backPayCommit: (data: any) => api.post('/backpay/commit', data),
  periodEndStatus: (payrollCalendarId: string) =>
    api.get('/period-end/status', { params: { payrollCalendarId } }),
  periodEnd: (payrollCalendarId: string) =>
    api.post('/period-end', { payrollCalendarId }),
  unClosePeriod: (payrollCalendarId: string) =>
    api.post('/period-end/un-close', { payrollCalendarId }),
};

// ─── Payroll Core ─────────────────────────────────────────────────────────────

export const PayrollCoreAPI = {
  getAll: () => api.get<any[]>('/payroll-core'),
  create: (data: any) => api.post('/payroll-core', data),
  update: (id: string, data: any) => api.put(`/payroll-core/${id}`, data),
  delete: (id: string) => api.delete(`/payroll-core/${id}`),
};

// ─── Intelligence ─────────────────────────────────────────────────────────────

export const IntelligenceAPI = {
  getAlerts: (companyId: string) => api.get<{ alerts: any[] }>('/intelligence/alerts', { params: { companyId } }),
  getFraud: (companyId: string, skip = 0, take = 500) =>
    api.get<{ flags: any[] }>('/intelligence/fraud', { params: { companyId, skip, take } }),
  getCashflow: (companyId: string) => api.get<any>('/intelligence/cashflow', { params: { companyId } }),
};

// ─── Shifts ───────────────────────────────────────────────────────────────────

export const ShiftAPI = {
  getAll: (params?: Record<string, string>) => api.get<Shift[]>('/shifts', { params }),
  getById: (id: string) => api.get<Shift>(`/shifts/${id}`),
  create: (data: Partial<Shift>) => api.post<Shift>('/shifts', data),
  update: (id: string, data: Partial<Shift>) => api.put<Shift>(`/shifts/${id}`, data),
  delete: (id: string) => api.delete(`/shifts/${id}`),
};

// ─── Roster ───────────────────────────────────────────────────────────────────

export const RosterAPI = {
  getAll: (params?: Record<string, string>) => api.get<RosterEntry[]>('/roster', { params }),
  getCalendar: (startDate: string, endDate: string) =>
    api.get<Record<string, RosterEntry[]>>('/roster/calendar', { params: { startDate, endDate } }),
  assign: (data: { employeeIds: string[]; shiftId: string; startDate: string; endDate?: string; daysOfWeek?: number[]; notes?: string }) =>
    api.post('/roster', data),
  update: (id: string, data: Partial<RosterEntry>) => api.put<RosterEntry>(`/roster/${id}`, data),
  delete: (id: string) => api.delete(`/roster/${id}`),
};

// ─── Attendance ───────────────────────────────────────────────────────────────

export const AttendanceAPI = {
  getAll: (params?: Record<string, string>) => api.get<{ logs: AttendanceLog[]; total: number }>('/attendance', { params }),
  getLogs: (params?: Record<string, string>) => api.get<{ logs: AttendanceLog[]; total: number }>('/attendance/logs', { params }),
  getSummary: (startDate: string, endDate: string) =>
    api.get<AttendanceSummary[]>('/attendance/summary', { params: { startDate, endDate } }),
  process: (data: { startDate: string; endDate: string; employeeIds?: string[] }) =>
    api.post('/attendance/process', data),
  manual: (data: Partial<AttendanceLog>) => api.post<AttendanceLog>('/attendance/manual', data),
  update: (id: string, data: Partial<AttendanceLog>) => api.put<AttendanceLog>(`/attendance/${id}`, data),
    generateInputs: (data: {
    startDate: string; endDate: string; period: string;
    normalTcId?: string; ot0TcId?: string; ot1TcId?: string; ot2TcId?: string;
    payrollRunId?: string; employeeIds?: string[];
  }) => api.post('/attendance/generate-inputs', data),
};

// ─── Biometric Devices ────────────────────────────────────────────────────────

export const DeviceAPI = {
  getAll: (params?: Record<string, string>) => api.get<Device[]>('/devices', { params }),
  getById: (id: string) => api.get<Device>(`/devices/${id}`),
  create: (data: Partial<Device>) => api.post<Device>('/devices', data),
  update: (id: string, data: Partial<Device>) => api.put<Device>(`/devices/${id}`, data),
  delete: (id: string) => api.delete(`/devices/${id}`),
  sync: (id: string, data?: Record<string, unknown>) => api.post(`/devices/${id}/sync`, data),
  test: (id: string) => api.post(`/devices/${id}/test`),
};

// ─── Public Holidays ──────────────────────────────────────────────────────────

export const PublicHolidaysAPI = {
  getAll: (year?: number) => api.get<PublicHoliday[]>('/public-holidays', { params: year ? { year: String(year) } : {} }),
  create: (data: { name: string; date: string }) => api.post<PublicHoliday>('/public-holidays', data),
  seed: (year: number) => api.post('/public-holidays/seed', { year }),
  delete: (id: string) => api.delete(`/public-holidays/${id}`),
};

export const BackupAPI = {
  export: () => api.get('/backup/export'),
  restore: (backupData: any) => api.post('/backup/restore', { backupData }),
};

export const AuditLogAPI = {
  getAll: (params?: Record<string, string>) => api.get<PaginatedResponse<AuditLog>>('/admin/logs', { params }),
};

export const NSSAContributionAPI = {
  getAll: (params?: Record<string, string>) => api.get<NSSAContribution[]>('/nssa-contributions', { params }),
  getById: (id: string) => api.get<NSSAContribution>(`/nssa-contributions/${id}`),
  create: (data: Partial<NSSAContribution>) => api.post<NSSAContribution>('/nssa-contributions', data),
  update: (id: string, data: Partial<NSSAContribution>) => api.put<NSSAContribution>(`/nssa-contributions/${id}`, data),
  delete: (id: string) => api.delete(`/nssa-contributions/${id}`),
};

export const PayrollLogAPI = {
  getAll: (params?: Record<string, string>) => api.get<PayrollLog[]>('/payroll-logs', { params }),
  getById: (id: string) => api.get<PayrollLog>(`/payroll-logs/${id}`),
};

export const PayrollUserAPI = {
  getAll: (params?: Record<string, string>) => api.get<PayrollUser[]>('/payroll-users', { params }),
  getById: (id: string) => api.get<PayrollUser>(`/payroll-users/${id}`),
  create: (data: Partial<PayrollUser>) => api.post<PayrollUser>('/payroll-users', data),
  update: (id: string, data: Partial<PayrollUser>) => api.put<PayrollUser>(`/payroll-users/${id}`, data),
  delete: (id: string) => api.delete(`/payroll-users/${id}`),
};

export const PayslipExportAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/payslip-exports', { params }),
  getById: (id: string) => api.get<any>(`/payslip-exports/${id}`),
  create: (data: any) => api.post('/payslip-exports', data),
  delete: (id: string) => api.delete(`/payslip-exports/${id}`),
};

export const PayslipSummaryAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/payslip-summaries', { params }),
  getById: (id: string) => api.get<any>(`/payslip-summaries/${id}`),
  create: (data: any) => api.post('/payslip-summaries', data),
  update: (id: string, data: any) => api.put(`/payslip-summaries/${id}`, data),
  delete: (id: string) => api.delete(`/payslip-summaries/${id}`),
};

export const PayslipTransactionAPI = {
  getAll: (params?: Record<string, string>) => api.get<any[]>('/payslip-transactions', { params }),
  getById: (id: string) => api.get<any>(`/payslip-transactions/${id}`),
  create: (data: any) => api.post('/payslip-transactions', data),
  update: (id: string, data: any) => api.put(`/payslip-transactions/${id}`, data),
  delete: (id: string) => api.delete(`/payslip-transactions/${id}`),
};

export const TaxBandAPI = {
  getAll: (params?: Record<string, string>) => api.get<TaxBand[]>('/tax-bands', { params }),
  getById: (id: string) => api.get<TaxBand>(`/tax-bands/${id}`),
  create: (data: Partial<TaxBand>) => api.post<TaxBand>('/tax-bands', data),
  update: (id: string, data: Partial<TaxBand>) => api.put<TaxBand>(`/tax-bands/${id}`, data),
  delete: (id: string) => api.delete(`/tax-bands/${id}`),
};

export default api;
