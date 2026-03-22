import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { getUser, getUserRole } from './lib/auth';

// Layout
import AppShell from './components/AppShell';

// Public pages
import Login from './pages/Login';
import Register from './pages/Register';
import Setup from './pages/Setup';
import Landing from './pages/Landing';
import LicenseExpired from './pages/LicenseExpired';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

// Dashboard
import Dashboard from './pages/Dashboard';

// Employees
import Employees from './pages/Employees';
import EmployeeNew from './pages/EmployeeNew';
import EmployeeEdit from './pages/EmployeeEdit';
import EmployeeImport from './pages/EmployeeImport';

// Payroll
import Payroll from './pages/Payroll';
import PayrollNew from './pages/PayrollNew';
import Payslips from './pages/Payslips';
import PayrollSummary from './pages/PayrollSummary';

// Leave
import Leave from './pages/Leave';
import LeaveNew from './pages/LeaveNew';
import LeaveEdit from './pages/LeaveEdit';
import LeavePolicy from './pages/LeavePolicy';
import LeaveBalances from './pages/LeaveBalances';
import LeaveEncashments from './pages/LeaveEncashments';

// Loans
import Loans from './pages/Loans';
import LoanNew from './pages/LoanNew';
import LoanDetail from './pages/LoanDetail';

// Reports
import Reports from './pages/Reports';

// Org structure
import ClientAdminStructure from './pages/ClientAdminStructure';
import CompanyNew from './pages/CompanyNew';
import Companies from './pages/Companies';
import ClientSettings from './pages/ClientSettings';

// Grades & Currency
import Grades from './pages/Grades';
import CurrencyRates from './pages/CurrencyRates';

// Payroll Inputs
import PayrollInputs from './pages/PayrollInputs';
import PayrollInputGrid from './pages/PayrollInputGrid';
import PayslipInput from './pages/PayslipInput';

// Subscription & License
import Subscription from './pages/Subscription';
import License from './pages/License';

// Utilities
import UtilitiesHub from './pages/utilities/UtilitiesHub';
import Transactions from './pages/utilities/Transactions';
import StatutoryRates from './pages/utilities/StatutoryRates';
import BackPay from './pages/utilities/BackPay';
import PayIncrease from './pages/utilities/PayIncrease';
import PeriodEnd from './pages/utilities/PeriodEnd';
import NSSASettings from './pages/utilities/NSSASettings';
import PayrollCalendar from './pages/utilities/PayrollCalendar';
import PublicHolidays from './pages/utilities/PublicHolidays';

// Shifts, Roster & Attendance
import Shifts from './pages/shifts/Shifts';
import Roster from './pages/shifts/Roster';
import Attendance from './pages/attendance/Attendance';
import Devices from './pages/devices/Devices';

// Admin (PLATFORM_ADMIN)
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/Users';
import AdminClients from './pages/admin/Clients';
import AdminLicenses from './pages/admin/Licenses';
import SystemSettings from './pages/admin/SystemSettings';
import AuditLogs from './pages/admin/AuditLogs';
import TaxTableSettings from './pages/TaxTableSettings';
import NecTables from './pages/NecTables';

// Profile Settings
import ProfileSettings from './pages/ProfileSettings';

// Employee self-service
import EmployeeDashboard from './pages/employee/EmployeeDashboard';
import EmployeePayslips from './pages/employee/Payslips';
import EmployeeProfile from './pages/employee/Profile';
import EmployeeLeave from './pages/employee/Leave';

// ─── ProtectedRoute ───────────────────────────────────────────────────────────

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: Array<'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'EMPLOYEE'>;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, roles }) => {
  const user = getUser();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

// ─── App ─────────────────────────────────────────────────────────────────────

import { ToastProvider } from './context/ToastContext';

const App: React.FC = () => {
  const role = getUserRole();

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/license-expired" element={<LicenseExpired />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Protected — CLIENT_ADMIN + PLATFORM_ADMIN */}
        <Route element={
          <ProtectedRoute roles={['CLIENT_ADMIN', 'PLATFORM_ADMIN']}>
            <AppShell />
          </ProtectedRoute>
        }>
          <Route path="/dashboard" element={<Dashboard />} />

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
          <Route path="/utilities/nec-tables" element={<NecTables />} />
          <Route path="/utilities/nssa" element={<NSSASettings />} />
          <Route path="/utilities/payroll-calendar" element={<PayrollCalendar />} />
          <Route path="/utilities/public-holidays" element={<PublicHolidays />} />

          {/* Shifts, Roster & Attendance */}
          <Route path="/shifts" element={<Shifts />} />
          <Route path="/shifts/roster" element={<Roster />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/devices" element={<Devices />} />

          <Route path="/profile" element={<ProfileSettings />} />
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
          <Route path="/profile" element={<ProfileSettings />} />
        </Route>

        {/* Default redirect based on role */}
        <Route path="*" element={
          role === 'PLATFORM_ADMIN' ? <Navigate to="/admin" replace />
          : role === 'CLIENT_ADMIN' ? <Navigate to="/dashboard" replace />
          : role === 'EMPLOYEE' ? <Navigate to="/employee" replace />
          : <Navigate to="/login" replace />
        } />
      </Routes>
    </BrowserRouter>
  </ToastProvider>
);
};

export default App;
