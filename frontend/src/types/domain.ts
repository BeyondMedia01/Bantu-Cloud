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
  minSalary?: number | null;
  maxSalary?: number | null;
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
  minRate?: number | null;
  necLevyRate?: number | null;
  createdAt: string;
  updatedAt: string;
  tableName?: string; // injected client-side when flattening tables
}

export interface NecTable {
  id: string;
  name: string;
  sector?: string | null;
  currency?: string | null;
  effectiveFrom?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
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
  clientId?: string;
  name: string;
  currency: string;
  isActive: boolean;
  isAnnual?: boolean;
  effectiveFrom?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
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
  valueOverride?: number | null;
  capAmount?: number | null;
  description?: string | null;
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
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PROCESSED' | 'CLOSED' | 'COMPLETED';
  currency?: string | null;
  totalGross?: number | null;
  totalNet?: number | null;
  exchangeRate?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  data?: PayrollRun[];
  total?: number;
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
  amount?: number | null;
  period?: string | null;
  units?: number | null;
  currency?: string | null;
  employeeUSD?: number | null;
  employeeZiG?: number | null;
  employerUSD?: number | null;
  employerZiG?: number | null;
  unitsType?: string | null;
  duration?: string | null;
  balance?: number | null;
  processed?: boolean;
  notes?: string | null;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
  transactionCode?: { code?: string; name?: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ─── System Settings ──────────────────────────────────────────────────────────

export interface SystemSetting {
  id: string;
  key?: string;
  value?: string;
  settingName?: string;
  settingValue?: string;
  dataType?: string;
  isActive?: boolean;
  effectiveFrom?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export interface LeaveRecord {
  id: string;
  employeeId: string;
  leaveType: string;
  type?: string;
  startDate: string;
  endDate: string;
  days: number;
  totalDays?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  notes?: string | null;
  reason?: string | null;
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
  carryOverLimit?: number | null;
  accrualRate?: number | null;
  maxAccumulation?: number | null;
  encashable?: boolean;
  encashCap?: number | null;
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
  accrued?: number | null;
  leavePolicy?: LeavePolicy | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveEncashment {
  id: string;
  employeeId: string;
  leaveType: string;
  days: number;
  amount?: number | null;
  currency?: string | null;
  totalAmount?: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Loans ────────────────────────────────────────────────────────────────────

export interface LoanRepayment {
  id: string;
  loanId: string;
  dueDate: string;
  amount: number;
  status?: string;
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
  interestRate?: number | null;
  termMonths?: number | null;
  description?: string | null;
  startDate: string;
  status: 'ACTIVE' | 'PAID_OFF' | 'WRITTEN_OFF';
  notes?: string | null;
  employee?: { firstName?: string; lastName?: string } | null;
  repayments?: LoanRepayment[];
  createdAt: string;
  updatedAt: string;
}

// ─── Shifts & Roster ──────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  clientId: string;
  name: string;
  code?: string | null;
  startTime: string;
  endTime: string;
  breakMinutes?: number | null;
  normalHours?: number | null;
  ot0Threshold?: number | null;
  ot1Threshold?: number | null;
  ot0Multiplier?: number | null;
  ot1Multiplier?: number | null;
  ot2Multiplier?: number | null;
  isOvernight?: boolean;
  isActive?: boolean;
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
  deviceUserId?: string | null;
  timestamp: string;
  punchTime?: string | null;
  punchType?: string | null;
  type?: 'IN' | 'OUT' | string;
  source?: string | null;
  processed?: boolean;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceSummary {
  id?: string;
  employeeId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  clockIn?: string | null;
  clockOut?: string | null;
  hoursWorked?: number | null;
  overtime?: number | null;
  breakMinutes?: number | null;
  normalMinutes?: number | null;
  ot0Minutes?: number | null;
  ot1Minutes?: number | null;
  ot2Minutes?: number | null;
  status?: string | null;
  isManualOverride?: boolean;
  isPublicHoliday?: boolean;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface Device {
  id: string;
  clientId: string;
  name: string;
  vendor?: string | null;
  ipAddress?: string | null;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  location?: string | null;
  serialNumber?: string | null;
  webhookKey?: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR' | string;
  isActive?: boolean;
  lastSync?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  _count?: { logs?: number } | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Payroll Support ──────────────────────────────────────────────────────────

export interface PayrollLog {
  id: string;
  payrollRunId: string;
  action: string;
  message?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
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
  submittedToNSSA?: boolean;
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

// ─── Documents (renamed to avoid conflict with browser DOM Document) ──────────

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  name: string;
  type?: string | null;
  url: string;
  fileUrl?: string | null;
  size?: number | null;
  createdAt: string;
  updatedAt: string;
}

// Alias for backwards compatibility
export type Document = EmployeeDocument;
