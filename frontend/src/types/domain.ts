// Domain entity types for the Bantu payroll platform

// ─── Tax Bands (PAYE progressive bands, separate from TaxTable brackets) ──────

export interface TaxBand {
  id: string;
  bandNumber: number;
  description?: string | null;
  lowerLimitUSD: number;
  upperLimitUSD?: number | null;
  taxRatePercent: number;
  fixedAmountUSD: number;
  effectiveFrom?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Org Structure ────────────────────────────────────────────────────────────

export interface SubCompany {
  id: string;
  name: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Grade ────────────────────────────────────────────────────────────────────

export interface Grade {
  id: string;
  clientId: string;
  companyId?: string | null;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── NEC Tables ───────────────────────────────────────────────────────────────

export interface NecGrade {
  id: string;
  necTableId: string;
  gradeCode: string;
  description?: string | null;
  minWage?: number | null;
  createdAt: string;
  updatedAt: string;
  tableName?: string; // injected client-side when flattening tables
}

export interface NecTable {
  id: string;
  name: string;
  effectiveFrom?: string | null;
  grades: NecGrade[];
  createdAt: string;
  updatedAt: string;
}

// ─── Tax Tables ───────────────────────────────────────────────────────────────

export interface TaxBracket {
  id: string;
  taxTableId: string;
  lowerBound: number;
  upperBound?: number | null;
  rate: number;
  fixedAmount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxTable {
  id: string;
  name: string;
  currency: string;
  isActive: boolean;
  effectiveFrom?: string | null;
  brackets?: TaxBracket[];
  createdAt: string;
  updatedAt: string;
}

// ─── Transaction Codes ────────────────────────────────────────────────────────

export interface TransactionRule {
  id: string;
  transactionCodeId: string;
  name: string;
  condition?: string | null;
  formula?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionCode {
  id: string;
  clientId: string;
  code: string;
  name: string;
  type: string;
  calculationType: string;
  defaultValue?: number | null;
  incomeCategory?: string | null;
  affectsGross?: boolean;
  affectsNssa?: boolean;
  affectsPension?: boolean;
  isActive?: boolean;
  rules?: TransactionRule[];
  createdAt: string;
  updatedAt: string;
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export interface PayrollRun {
  id: string;
  clientId: string;
  companyId: string;
  name: string;
  period: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PROCESSED' | 'CLOSED';
  currency?: string | null;
  totalGross?: number | null;
  totalNet?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  gross?: number;
  grossUSD?: number | null;
  grossZIG?: number | null;
  paye?: number;
  netPay?: number;
  netPayUSD?: number | null;
  currency?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollInput {
  id: string;
  payrollRunId: string;
  employeeId: string;
  transactionCodeId: string;
  value: number;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export interface LeaveRecord {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeavePolicy {
  id: string;
  clientId: string;
  leaveType: string;
  entitlementDays: number;
  carryOverDays?: number | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveType: string;
  year: number;
  entitled: number;
  taken: number;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveEncashment {
  id: string;
  employeeId: string;
  leaveType: string;
  days: number;
  amount?: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Loans ────────────────────────────────────────────────────────────────────

export interface LoanRepayment {
  id: string;
  loanId: string;
  dueDate: string;
  amount: number;
  paid: boolean;
  paidDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  employeeId: string;
  amount: number;
  balance: number;
  monthlyInstalment?: number | null;
  startDate: string;
  status: 'ACTIVE' | 'PAID_OFF' | 'WRITTEN_OFF';
  notes?: string | null;
  repayments?: LoanRepayment[];
  createdAt: string;
  updatedAt: string;
}

// ─── Shifts & Roster ──────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  clientId: string;
  name: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface RosterEntry {
  id: string;
  employeeId: string;
  shiftId: string;
  date: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceLog {
  id: string;
  employeeId: string;
  deviceId?: string | null;
  timestamp: string;
  type: 'IN' | 'OUT';
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceSummary {
  employeeId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  hoursWorked?: number | null;
  overtime?: number | null;
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface Device {
  id: string;
  clientId: string;
  name: string;
  ipAddress?: string | null;
  port?: number | null;
  serialNumber?: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR';
  lastSync?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── System ───────────────────────────────────────────────────────────────────

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollLog {
  id: string;
  payrollRunId: string;
  action: string;
  message?: string | null;
  userId?: string | null;
  createdAt: string;
}

export interface PayrollUser {
  id: string;
  clientId: string;
  userId: string;
  role: string;
  companyIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NSSAContribution {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeContribution: number;
  employerContribution: number;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryStructure {
  id: string;
  employeeId: string;
  transactionCodeId: string;
  value: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  employeeId: string;
  name: string;
  type?: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}
