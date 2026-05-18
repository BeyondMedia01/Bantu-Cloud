// Re-exports from domain-specific API files.
// Pages can continue importing from '../api/client' — nothing breaks.

export { AuthAPI, SetupAPI, LicenseValidateAPI, InviteAPI, RoleAPI, DashboardAPI } from './auth.api';
export type { ReminderItem, PayrollRunSummary, DashboardSummary } from './auth.api';

export { UserAPI, EmployeeSelfAPI } from './user.api';

export { CompanyAPI, BranchAPI, DepartmentAPI, SubCompanyAPI, GradeAPI } from './org.api';

export { EmployeeAPI, EmployeeSalaryStructureAPI, BankAccountAPI } from './employees.api';

export {
  PayrollAPI, PayrollCalendarAPI, PayrollInputAPI, PayrollCoreAPI,
  PayrollLogAPI, PayrollUserAPI, StatutoryExportAPI, BankFileAPI,
  PayslipAPI, UtilitiesAPI,
} from './payroll.api';

export { LeaveAPI, LeavePolicyAPI, LeaveBalanceAPI, LeaveEncashmentAPI, LeaveTransactionAPI, LeaveAllocationAPI } from './leave.api';
export { LoanAPI } from './loans.api';
export { AttendanceAPI, ShiftAPI, RosterAPI, DeviceAPI } from './attendance.api';

export {
  SystemSettingsAPI, TransactionCodeAPI, TaxTableAPI, CurrencyRateAPI,
  PublicHolidaysAPI, NSSASettingsAPI, StatutoryRatesAPI, NecTableAPI,
  TaxBandAPI, TradeUnionSettingsAPI,
} from './settings.api';
export type { PublicHoliday, CurrencyRate, NSSASettings, TradeUnionSettings } from './settings.api';

export { ReportsAPI, AuditLogAPI } from './reports.api';

export { AdminAPI, ClientAPI, LicenseAPI, SubscriptionAPI, BackupAPI, NSSAContributionAPI } from './admin.api';
export type { AuditLog, Client } from './admin.api';

export { DocumentsAPI, ExpenseAPI } from './documents.api';

export {
  RecruitmentAPI, OnboardingAPI, AssetAPI, TrainingAPI, PerformanceAPI,
  SuccessionAPI, SurveyAPI, AnalyticsAPI, PayslipExportAPI, PayslipSummaryAPI,
  PayslipTransactionAPI,
} from './advanced.api';

export { IntelligenceAPI } from './platform.api';

export { TrialAPI } from './trial.api';
export type { TrialStatus, TrialStatusResponse } from './trial.api';
