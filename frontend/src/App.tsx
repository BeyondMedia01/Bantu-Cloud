import React, { Suspense, useMemo, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getToken, getUser, getUserRole } from './lib/auth';

// Layout (eagerly loaded — always needed)
import AppShell from './components/AppShell';

// Public pages (small, eagerly loaded)
import Login from './pages/Login';
import Register from './pages/Register';
import Setup from './pages/Setup';
import Landing from './pages/Landing';
import LicenseExpired from './pages/LicenseExpired';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import DesktopOnboarding from './pages/DesktopOnboarding';
import AcceptInvite from './pages/AcceptInvite';
import TrialSignup from './pages/TrialSignup';
const TrialOnboarding = React.lazy(() => import('./pages/TrialOnboarding'));
const Upgrade = React.lazy(() => import('./pages/Upgrade'));

// ─── Lazy-loaded pages ────────────────────────────────────────────────────────

// Dashboard
const Dashboard = React.lazy(() => import('./pages/Dashboard'));

// Employees
const Employees = React.lazy(() => import('./pages/Employees'));
const EmployeeNew = React.lazy(() => import('./pages/EmployeeNew'));
const EmployeeEdit = React.lazy(() => import('./pages/EmployeeEdit'));
const EmployeeImport = React.lazy(() => import('./pages/EmployeeImport'));

// Payroll
const Payroll = React.lazy(() => import('./pages/Payroll'));
const PayrollNew = React.lazy(() => import('./pages/PayrollNew'));
const Payslips = React.lazy(() => import('./pages/Payslips'));
const PayrollSummary = React.lazy(() => import('./pages/PayrollSummary'));

// Leave
const Leave = React.lazy(() => import('./pages/Leave'));
const LeaveNew = React.lazy(() => import('./pages/LeaveNew'));
const LeaveEdit = React.lazy(() => import('./pages/LeaveEdit'));
const LeavePolicy = React.lazy(() => import('./pages/LeavePolicy'));
const LeaveBalances = React.lazy(() => import('./pages/LeaveBalances'));
const LeaveEncashments = React.lazy(() => import('./pages/LeaveEncashments'));

// Loans
const Loans = React.lazy(() => import('./pages/Loans'));
const LoanNew = React.lazy(() => import('./pages/LoanNew'));
const LoanDetail = React.lazy(() => import('./pages/LoanDetail'));

// Reports
const Reports = React.lazy(() => import('./pages/Reports'));

// Org structure
const ClientAdminStructure = React.lazy(() => import('./pages/ClientAdminStructure'));
const CompanyNew = React.lazy(() => import('./pages/CompanyNew'));
const Companies = React.lazy(() => import('./pages/Companies'));
const ClientSettings = React.lazy(() => import('./pages/ClientSettings'));

// Grades & Currency
const Grades = React.lazy(() => import('./pages/Grades'));
const CurrencyRates = React.lazy(() => import('./pages/CurrencyRates'));

// Payroll Inputs
const PayrollInputs = React.lazy(() => import('./pages/PayrollInputs'));
const PayrollInputGrid = React.lazy(() => import('./pages/PayrollInputGrid'));
const PayslipInput = React.lazy(() => import('./pages/PayslipInput'));

// Subscription & License
const Subscription = React.lazy(() => import('./pages/Subscription'));
const License = React.lazy(() => import('./pages/License'));

// Utilities
const UtilitiesHub = React.lazy(() => import('./pages/utilities/UtilitiesHub'));
const Transactions = React.lazy(() => import('./pages/utilities/Transactions'));
const StatutoryRates = React.lazy(() => import('./pages/utilities/StatutoryRates'));
const WorkPeriodSettings = React.lazy(() => import('./pages/utilities/WorkPeriodSettings'));
const BackPay = React.lazy(() => import('./pages/utilities/BackPay'));
const PayIncrease = React.lazy(() => import('./pages/utilities/PayIncrease'));
const PeriodEnd = React.lazy(() => import('./pages/utilities/PeriodEnd'));
const NSSASettings = React.lazy(() => import('./pages/utilities/NSSASettings'));
const PayrollCalendar = React.lazy(() => import('./pages/utilities/PayrollCalendar'));
const PublicHolidays = React.lazy(() => import('./pages/utilities/PublicHolidays'));
const BackupRestore = React.lazy(() => import('./pages/utilities/BackupRestore'));
const TaxTableSettings = React.lazy(() => import('./pages/TaxTableSettings'));
const NecTables = React.lazy(() => import('./pages/NecTables'));

// Shifts, Roster & Attendance
const Shifts = React.lazy(() => import('./pages/shifts/Shifts'));
const Roster = React.lazy(() => import('./pages/shifts/Roster'));
const Attendance = React.lazy(() => import('./pages/attendance/Attendance'));
const Devices = React.lazy(() => import('./pages/devices/Devices'));

// Admin
const AdminDashboard = React.lazy(() => import('./pages/admin/AdminDashboard'));
const AdminUsers = React.lazy(() => import('./pages/admin/Users'));
const AdminClients = React.lazy(() => import('./pages/admin/Clients'));
const AdminLicenses = React.lazy(() => import('./pages/admin/Licenses'));
const SystemSettings = React.lazy(() => import('./pages/admin/SystemSettings'));
const AuditLogs = React.lazy(() => import('./pages/admin/AuditLogs'));

// Tier 2 — Recruitment, Performance, Expenses
const Recruitment = React.lazy(() => import('./pages/Recruitment'));
const Performance = React.lazy(() => import('./pages/Performance'));
const Expenses = React.lazy(() => import('./pages/Expenses'));

// Tier 3 — Onboarding, Training, Assets
const Onboarding = React.lazy(() => import('./pages/Onboarding'));
const Training = React.lazy(() => import('./pages/Training'));
const Assets = React.lazy(() => import('./pages/Assets'));

// Tier 4 — Succession, Surveys, Analytics
const Succession = React.lazy(() => import('./pages/Succession'));
const Surveys = React.lazy(() => import('./pages/Surveys'));
const Analytics = React.lazy(() => import('./pages/Analytics'));

// Profile & Settings
const ProfileSettings = React.lazy(() => import('./pages/ProfileSettings'));
const Settings = React.lazy(() => import('./pages/Settings'));

// Client Admin — RBAC
const RoleBuilder = React.lazy(() => import('./pages/client-admin/RoleBuilder'));
const UserManagement = React.lazy(() => import('./pages/client-admin/UserManagement'));

// Employee self-service
const EmployeeDashboard = React.lazy(() => import('./pages/employee/EmployeeDashboard'));
const EmployeePayslips = React.lazy(() => import('./pages/employee/Payslips'));
const EmployeeProfile = React.lazy(() => import('./pages/employee/Profile'));
const EmployeeLeave = React.lazy(() => import('./pages/employee/Leave'));
const EmployeeAttendance = React.lazy(() => import('./pages/employee/Attendance'));
const EmployeeDocuments = React.lazy(() => import('./pages/employee/Documents'));

// ─── ProtectedRoute ───────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: Array<'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'COMPANY_USER' | 'EMPLOYEE'>;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  if (roles) {
    const user = getUser();
    if (!user || !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
};

// ─── App ──────────────────────────────────────────────────────────────────────

import { ToastProvider } from './context/ToastContext';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { QueryErrorBanner } from './components/common/QueryErrorBanner';
import { Toaster } from './components/ui/sonner';

// Minimal fallback while lazy chunks load
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-[40vh]">
    <div role="status" aria-label="Loading page">
      <div className="w-6 h-6 border-2 border-border border-t-foreground rounded-full animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading...</span>
    </div>
  </div>
);

const App: React.FC = () => {
  const role = getUserRole();
  const [queryError, setQueryError] = useState<string | null>(null);

  const queryClient = useMemo(
    () =>
      new QueryClient({
        queryCache: new QueryCache({
          onError: (error) => {
            if (error instanceof Error && 'status' in error && (error as any).status === 401) return;
            setQueryError(error instanceof Error ? error.message : 'API request failed');
          },
        }),
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      }),
    [],
  );

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <QueryErrorBanner error={queryError} onDismiss={() => setQueryError(null)} />
          <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Public */}
              <Route path="/" element={
                typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__
                  ? <Navigate to="/login" replace />
                  : <Landing />
              } />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/activate" element={<DesktopOnboarding />} />
              <Route path="/license-expired" element={<LicenseExpired />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/accept-invite" element={<AcceptInvite />} />
              <Route path="/trial-signup" element={<TrialSignup />} />
              <Route path="/trial-onboarding" element={<React.Suspense fallback={null}><TrialOnboarding /></React.Suspense>} />

              {/* Protected — CLIENT_ADMIN + PLATFORM_ADMIN + COMPANY_USER */}
              <Route element={
                <ProtectedRoute roles={['CLIENT_ADMIN', 'PLATFORM_ADMIN', 'COMPANY_USER']}>
                  <AppShell />
                </ProtectedRoute>
              }>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/upgrade" element={<React.Suspense fallback={null}><Upgrade /></React.Suspense>} />

                <Route path="/employees" element={<Employees />} />
                <Route path="/employees/new" element={<EmployeeNew />} />
                <Route path="/employees/import" element={<EmployeeImport />} />
                <Route path="/employees/:id/edit" element={<EmployeeEdit />} />

                <Route path="/payroll" element={<Payroll />} />
                <Route path="/payroll/new" element={<PayrollNew />} />
                <Route path="/payroll/:runId/payslips" element={<Payslips />} />
                <Route path="/payroll/:runId/summary" element={<PayrollSummary />} />

                <Route path="/leave" element={<Leave />} />
                <Route path="/leave/new" element={<LeaveNew />} />
                <Route path="/leave/:id/edit" element={<LeaveEdit />} />
                <Route path="/leave/policies" element={<LeavePolicy />} />
                <Route path="/leave/balances" element={<LeaveBalances />} />
                <Route path="/leave/encashments" element={<LeaveEncashments />} />

                <Route path="/loans" element={<Loans />} />
                <Route path="/loans/new" element={<LoanNew />} />
                <Route path="/loans/:id" element={<LoanDetail />} />

                <Route path="/reports" element={<Reports />} />

                <Route path="/companies" element={<Companies />} />
                <Route path="/companies/new" element={<CompanyNew />} />
                <Route path="/client-admin/structure" element={<ClientAdminStructure />} />
                <Route path="/client-admin/settings" element={<ClientSettings />} />
                <Route path="/client-admin/roles" element={<RoleBuilder />} />
                <Route path="/client-admin/users" element={<UserManagement />} />

                <Route path="/grades" element={<Grades />} />
                <Route path="/currency-rates" element={<CurrencyRates />} />
                <Route path="/payroll/inputs" element={<PayrollInputs />} />
                <Route path="/payroll/grid" element={<PayrollInputGrid />} />
                <Route path="/payslip-input" element={<PayslipInput />} />

                <Route path="/subscription" element={<Subscription />} />
                <Route path="/license" element={<License />} />

                <Route path="/utilities" element={<UtilitiesHub />} />
                <Route path="/utilities/transactions" element={<Transactions />} />
                <Route path="/utilities/back-pay" element={<BackPay />} />
                <Route path="/utilities/pay-increase" element={<PayIncrease />} />
                <Route path="/utilities/period-end" element={<PeriodEnd />} />
                <Route path="/utilities/tax-tables" element={<TaxTableSettings />} />
                <Route path="/utilities/statutory-rates" element={<StatutoryRates />} />
                <Route path="/utilities/work-period" element={<WorkPeriodSettings />} />
                <Route path="/utilities/nec-tables" element={<NecTables />} />
                <Route path="/utilities/nssa" element={<NSSASettings />} />
                <Route path="/utilities/payroll-calendar" element={<PayrollCalendar />} />
                <Route path="/utilities/public-holidays" element={<PublicHolidays />} />
                <Route path="/shifts" element={<Shifts />} />
                <Route path="/shifts/roster" element={<Roster />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/devices" element={<Devices />} />

                <Route path="/recruitment" element={<Recruitment />} />
                <Route path="/performance" element={<Performance />} />
                <Route path="/expenses" element={<Expenses />} />
                <Route path="/onboarding" element={<Onboarding />} />
                <Route path="/training" element={<Training />} />
                <Route path="/assets" element={<Assets />} />
                <Route path="/succession" element={<Succession />} />
                <Route path="/surveys" element={<Surveys />} />
                <Route path="/analytics" element={<Analytics />} />

                <Route path="/profile" element={<ProfileSettings />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Admin (PLATFORM_ADMIN only) */}
              <Route element={
                <ProtectedRoute roles={['PLATFORM_ADMIN']}>
                  <AppShell />
                </ProtectedRoute>
              }>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/users" element={<AdminUsers />} />
                <Route path="/admin/clients" element={<AdminClients />} />
                <Route path="/admin/licenses" element={<AdminLicenses />} />
                <Route path="/admin/settings" element={<SystemSettings />} />
                <Route path="/admin/logs" element={<AuditLogs />} />
                <Route path="/admin/backup" element={<BackupRestore />} />
                <Route path="/profile" element={<ProfileSettings />} />
              </Route>

              {/* Employee self-service */}
              <Route element={
                <ProtectedRoute roles={['EMPLOYEE']}>
                  <AppShell />
                </ProtectedRoute>
              }>
                <Route path="/employee" element={<EmployeeDashboard />} />
                <Route path="/employee/payslips" element={<EmployeePayslips />} />
                <Route path="/employee/profile" element={<EmployeeProfile />} />
                <Route path="/employee/leave" element={<EmployeeLeave />} />
                <Route path="/employee/attendance" element={<EmployeeAttendance />} />
                <Route path="/employee/documents" element={<EmployeeDocuments />} />
                <Route path="/profile" element={<ProfileSettings />} />
              </Route>

              {/* Default redirect — check token first to avoid parsing JWT for unauthenticated users */}
              <Route path="*" element={
                !getToken() ? <Navigate to="/login" replace />
                  : role === 'PLATFORM_ADMIN' ? <Navigate to="/admin" replace />
                    : role === 'CLIENT_ADMIN' ? <Navigate to="/dashboard" replace />
                      : role === 'COMPANY_USER' ? <Navigate to="/dashboard" replace />
                        : role === 'EMPLOYEE' ? <Navigate to="/employee" replace />
                          : <Navigate to="/login" replace />
              } />
            </Routes>
          </Suspense>
          </BrowserRouter>
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
