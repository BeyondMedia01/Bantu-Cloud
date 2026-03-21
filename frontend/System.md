# Payroll Management System — Platform Documentation

## Table of Contents
1. [Roles & Permissions](#roles--permissions)
2. [Screens & Pages](#screens--pages)
3. [API Routes](#api-routes)
4. [Database Models](#database-models)
5. [Key Libraries](#key-libraries)

---

## Roles & Permissions

### Roles
| Role | Description |
|------|-------------|
| `PLATFORM_ADMIN` | Full system access — manages clients, licenses, users, and global settings |
| `CLIENT_ADMIN` | Manages a single client's companies, employees, payroll, leave, and loans |
| `EMPLOYEE` | Read-only self-service access to own payslips, leave, and profile |

### Permissions by Role

#### PLATFORM_ADMIN (all permissions)
Users, Licenses, Clients, Companies, Employees, Payroll, Leave, Loans, Reports, Settings, Audit Logs

#### CLIENT_ADMIN
`manage_companies`, `manage_employees`, `manage_payroll`, `approve_payroll`, `process_payroll`, `manage_leave`, `approve_leave`, `reject_leave`, `manage_loans`, `approve_loans`, `reject_loans`, `view_reports`, `export_reports`, `create_reports`, `view_settings`, `update_settings`

#### EMPLOYEE
`view_employees`, `view_payroll`, `view_leave`, `view_loans`, `view_reports`

---

## Screens & Pages

### Auth Screens

| Screen | Route | Description |
|--------|-------|-------------|
| Login | `/login` | Email + password login with NextAuth credentials provider |
| Register | `/register` | Create a CLIENT_ADMIN account using a license token |
| Setup | `/setup` | First-time setup — creates the PLATFORM_ADMIN user and initial Client |
| License Expired | `/license-expired` | Shown when client's license has expired |

---

### Marketing

| Screen | Route | Description |
|--------|-------|-------------|
| Landing Page | `/` | Public-facing marketing page with features, pricing, and CTA |

---

### Dashboard (CLIENT_ADMIN & PLATFORM_ADMIN)

| Screen | Route | Description |
|--------|-------|-------------|
| Dashboard | `/dashboard` | Role-based overview: system metrics for PLATFORM_ADMIN; company/employee stats for CLIENT_ADMIN |
| Employees | `/employees` | Employee list with filtering by branch, department, and employment type |
| Add Employee | `/employees/new` | Multi-field form to create a new employee (personal, work, pay, tax info) |
| Edit Employee | `/employees/[id]/edit` | Edit existing employee details |
| Payroll | `/payroll` | List payroll runs with status (Draft, Processing, Completed, Error) |
| New Payroll Run | `/payroll/new` | Configure and create a new payroll run |
| Payslips | `/payroll/[runId]/payslips` | View all payslips generated for a specific payroll run |
| Leave | `/leave` | List and manage employee leave requests (approve / reject) |
| New Leave | `/leave/new` | Submit a new leave request |
| Edit Leave | `/leave/[id]/edit` | Edit an existing leave request |
| Loans | `/loans` | List all employee loans with status tracking |
| New Loan | `/loans/new` | Create a loan with repayment schedule |
| Loan Detail | `/loans/[id]` | View full loan details and repayment history |
| Edit Loan | `/loans/[id]/edit` | Edit loan details |
| Reports | `/reports` | Generate and export payroll, tax, leave, loan, and journal reports |
| Subscription | `/subscription` | View and manage current subscription plan and Stripe billing |
| License | `/license` | View and manage license token status |

#### Utilities

| Screen | Route | Description |
|--------|-------|-------------|
| Utilities Hub | `/utilities` | Navigation hub for all utility tools |
| Transaction Codes | `/utilities/transactions` | Manage earning/deduction/benefit transaction codes |
| New Transaction Code | `/utilities/transactions/new` | Create a new transaction code |
| Edit Transaction Code | `/utilities/transactions/[id]/edit` | Edit an existing transaction code |
| Back Pay | `/utilities/back-pay` | Calculate and process back pay for employees |
| Import Earnings | `/utilities/import-earnings` | Bulk-import earnings data |
| Pay Increase | `/utilities/pay-increase` | Apply pay increases to a group of employees |
| Period End | `/utilities/period-end` | Run period-end processing |

#### Client Admin Structure

| Screen | Route | Description |
|--------|-------|-------------|
| Structure | `/client-admin/structure` | View organisational structure (client, companies, branches, departments) |
| New Branch | `/client-admin/structure/branch/new` | Create a new branch under a company |
| New Department | `/client-admin/structure/department/new` | Create a new department under a branch |
| New Sub-company | `/client-admin/structure/sub-company/new` | Create a sub-company under the client |
| Settings | `/client-admin/settings` | Client-level settings (currency, defaults, etc.) |

---

### Admin Panel (PLATFORM_ADMIN only)

| Screen | Route | Description |
|--------|-------|-------------|
| Admin Dashboard | `/admin` | System-wide metrics: clients, licenses, employees, revenue |
| Users | `/admin/users` | Manage all platform users — view, create, edit, delete |
| New User | `/admin/users/new` | Create a new user and assign a role |
| Edit User | `/admin/users/[id]/edit` | Edit user details and role |
| Clients | `/admin/clients` | Manage all clients — view license status and employee counts |
| Licenses | `/admin/licenses` | Issue, revoke, and reactivate client licenses |
| Roles | `/admin/roles` | View roles and their permission sets |
| Audit Logs | `/admin/logs` | View system-wide audit trail |
| System Settings | `/admin/settings` | Global settings (AIDS levy rate, base currency, NSSA threshold, etc.) |

---

### Employee Self-Service (EMPLOYEE only)

| Screen | Route | Description |
|--------|-------|-------------|
| Employee Dashboard | `/employee` | Personal dashboard: leave balance, latest payslip, pending requests |
| Payslips | `/employee/payslips` | View and download past payslips |
| Profile | `/employee/profile` | View and update personal profile information |
| Leave | `/employee/leave` | Submit and track leave requests |

---

## API Routes

### Authentication
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/register` | Register a new CLIENT_ADMIN; validates license token, links to client |
| GET/POST | `/api/auth/[...nextauth]` | NextAuth endpoints (session, CSRF, sign-in, sign-out) |
| POST | `/api/setup` | First-time setup — creates PLATFORM_ADMIN and default client |

### Employees
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/employees` | List employees (paginated, filtered by branch/department/search) |
| POST | `/api/employees` | Create new employee |
| GET/PUT/DELETE | `/api/employees/[id]` | Get, update, or delete a specific employee |
| GET/PUT | `/api/employee/profile` | Employee self-service: get/update own profile |

### Payroll
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/payroll` | List payroll runs; create and run a payroll (calculates PAYE, applies transactions) |
| GET/PUT/DELETE | `/api/payroll/[runId]` | Get, update, or delete a payroll run |
| GET | `/api/payroll/[runId]/payslips` | Get all payslips for a run |
| GET | `/api/payroll/[runId]/payslips/[id]/pdf` | Generate payslip PDF |
| GET | `/api/payroll/[runId]/export` | Export payroll run data (CSV) |
| GET | `/api/payslips` | Get all payslips for the current user/company |

### Leave
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/leave` | List leave records; create leave record |
| GET/PUT/DELETE | `/api/leave/[id]` | Get, update, or delete a leave record |

### Loans
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/loans` | List loans with filters; create loan with repayment schedule |
| GET/PUT/DELETE | `/api/loans/[id]` | Get, update, or delete a loan |

### Clients & Companies
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/clients` | List all clients (PLATFORM_ADMIN only); create client |
| GET/POST | `/api/companies` | List companies (role-scoped); create company |
| GET/POST | `/api/branches` | List/create branches |
| GET/POST | `/api/departments` | List/create departments |
| GET | `/api/user/companies` | Get companies accessible to the current user |

### Transactions & Utilities
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/transaction-codes` | List/create transaction codes (earnings, deductions, benefits) |
| GET/PUT/DELETE | `/api/transaction-codes/[id]` | Get, update, or delete a transaction code |
| POST | `/api/transactions/import` | Bulk-import transaction data |
| POST | `/api/payincrease` | Apply bulk pay increases |
| POST | `/api/backpay` | Process back pay calculations |
| GET/POST | `/api/grades` | List/create salary grades |

### Licenses
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/license/issue` | Issue a new license token to a client |
| POST | `/api/license/revoke` | Revoke a client's license |
| POST | `/api/license/reactivate` | Reactivate a revoked license |
| POST | `/api/license/validate` | Validate a license token |

### Admin
| Method | Route | Description |
|--------|-------|-------------|
| GET/POST | `/api/admin/users` | List all users; create user |
| GET/PUT/DELETE | `/api/admin/users/[id]` | Get, update, or delete a user |
| POST | `/api/admin/users/[id]/role` | Change a user's role |
| GET/POST | `/api/admin/settings` | Get/update global system settings |

### Reports
| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/reports/payslips` | Payslip report (PDF/CSV) |
| GET | `/api/reports/tax` | Tax report |
| GET | `/api/reports/leave` | Leave report |
| GET | `/api/reports/loans` | Loan report |
| GET | `/api/reports/departments` | Department headcount report |
| GET | `/api/reports/journals` | Journal entries report |

### Subscriptions
| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/subscription/create` | Create Stripe checkout session |
| POST | `/api/subscription/upgrade` | Upgrade subscription plan |
| GET | `/api/subscription/usage` | Get employee count vs. subscription cap |
| GET | `/api/subscription/portal` | Get Stripe customer portal URL |
| POST | `/api/subscription/webhook` | Handle Stripe webhook events |

---

## Database Models

### Enums
| Enum | Values |
|------|--------|
| `UserRole` | PLATFORM_ADMIN, CLIENT_ADMIN, EMPLOYEE |
| `DataType` | TEXT, NUMBER, BOOLEAN, DATE |
| `Gender` | MALE, FEMALE, OTHER |
| `MaritalStatus` | SINGLE, MARRIED, DIVORCED, WIDOWED |
| `EmploymentType` | PERMANENT, CONTRACT, TEMPORARY, PART_TIME |
| `PaymentMethod` | BANK, CASH |
| `PaymentBasis` | MONTHLY, DAILY, HOURLY |
| `RateSource` | NEC_GRADE, MANUAL |
| `TaxMethod` | FDS_AVERAGE, FORECASTING, STANDARD_PAYE |
| `PayrollStatus` | DRAFT, PROCESSING, COMPLETED, ERROR |
| `PlanType` | BASIC, STANDARD, PREMIUM, ENTERPRISE |
| `BillingCycle` | MONTHLY, QUARTERLY, ANNUALLY |

### Models

#### User
Core identity record.
- `id`, `name`, `email` (unique), `password` (hashed)
- `role` (UserRole, default: EMPLOYEE)
- `emailVerified`, `image`
- Relations → Employee, ClientAdmin, Sessions

#### Client
Top-level tenant/payroll bureau.
- `id`, `name`, `taxId`, `licenseToken` (unique), `licenseExpiry`
- `isActive` (default: true), `defaultCurrency`
- Relations → Companies, ClientAdmins, Employees, PayrollCalendar, TaxTables, TransactionCodes, License, Subscription

#### ClientAdmin
Links a User to a Client as administrator.
- `userId` (unique FK → User), `clientId` (FK → Client)

#### Company
A company under a client.
- `id`, `name`, `registrationNumber`, `taxId`, `address`, `contactEmail`, `contactPhone`
- `clientId` (FK → Client)
- Relations → Branches, Departments, Employees, PayrollRuns

#### SubCompany
A subsidiary under a client.
- `id`, `name`, `clientId`
- Relations → Branches

#### Branch
A physical location under a Company or SubCompany.
- `id`, `name`, `companyId`, `subCompanyId`
- Relations → Departments, Employees

#### Department
A department within a Branch/Company.
- `id`, `name`, `branchId`, `companyId`
- Relations → Employees

#### Employee
Full employee record including personal, work, pay, and tax details.
- **Personal**: firstName, lastName, dateOfBirth, gender, maritalStatus, nationality, idPassport, homeAddress, nextOfKin
- **Work**: employeeCode, title, position, departmentId, branchId, employmentType, startDate
- **Pay**: baseRate, currency, paymentMethod, paymentBasis, bankName, accountNumber
- **Tax**: taxMethod, taxTable, taxDirective, tin, motorVehicleBenefit
- **Balances**: leaveBalance, leaveTaken
- Relations → PayrollTransactions, Payslips, LeaveRecords, LeaveRequests, Loans, PayrollInputs

#### PayrollCalendar
Defines the payroll schedule for a client.
- `clientId` (unique FK), periodType, periods, year, month, payDay, startDate, endDate, isClosed

#### PayrollRun
A single payroll execution.
- `payrollCalendarId`, `companyId`, runDate, startDate, endDate, currency, exchangeRate (default: 1)
- `status` (PayrollStatus, default: DRAFT)
- Relations → Transactions, Payslips, PayrollInputs

#### PayrollTransaction
A transaction generated during a payroll run.
- `employeeId`, `payrollRunId`, `transactionCodeId`, amount, currency, description

#### PayrollInput
Pre-entered transactions staged before a payroll run.
- `employeeId`, `payrollRunId`, `transactionCodeId`, amount, period, `processed` (default: false)

#### Payslip
The output payslip for an employee in a payroll run.
- `employeeId`, `payrollRunId`, gross, paye, netPay, pdfUrl

#### TransactionCode
Reusable earning/deduction/benefit codes.
- `clientId`, code, name, description, type (EARNING/DEDUCTION/BENEFIT)
- `taxable` (default: true), `pensionable` (default: true)

#### TaxTable / TaxBracket
Tax configuration per client.
- TaxTable: clientId, name, currency, effectiveDate, expiryDate
- TaxBracket: lowerBound, upperBound, rate

#### LeaveRecord
Leave taken by an employee.
- `employeeId`, type, startDate, endDate, totalDays, reason, status (default: PENDING)

#### LeaveRequest
Leave request submitted by an employee (self-service).
- `employeeId`, startDate, endDate, days, status (default: PENDING), reason

#### Loan / LoanRepayment
Employee loans and their repayment schedules.
- Loan: employeeId, amount, interestRate, termMonths, startDate, repaymentMethod, status
- LoanRepayment: loanId, amount, dueDate, status (default: UNPAID)

#### Currency
- `code` (unique), name, symbol

#### LicenseToken
Per-client license management.
- `clientId` (unique), token (unique), expiresAt, `active` (default: true)

#### Subscription
Stripe subscription per client.
- `clientId` (unique), stripeSubId (unique), plan (PlanType), pricePerEmp, billingCycle, employeeCap, isActive, startDate, endDate

#### SystemSettings
Global key-value configuration store.
- settingName, settingValue, dataType (DataType), effectiveFrom, isActive, description, lastUpdatedBy
- Indexed by: settingName + isActive + effectiveFrom (most recent effective value wins)
- Keys: `AidsLevyRate`, `BaseCurrency`, `DecimalPrecision`, `NSSAThresholdUSD`, `TaxFreeBonusUSD`, `EnableSplitPAYE`

---

## Key Libraries

### `lib/auth.ts`
- `getCurrentUser()` — returns session user (id, email, name, role)
- `requireAuth()` — redirects to /login if not authenticated
- `requireRole(roles[])` — redirects to /dashboard if role not in list

### `lib/permissions.ts`
- `hasPermission(role, permission)` — single permission check
- `hasAllPermissions(role, permissions[])` — all-of check
- `hasAnyPermission(role, permissions[])` — any-of check
- `getPermissionsForRole(role)` — full permission list for a role

### `lib/tax.ts`
- `calculatePAYE(income, taxBrackets, options)` — calculates PAYE using STANDARD_PAYE, FDS_AVERAGE, or FORECASTING method
- Handles AIDS levy, motor vehicle benefit, currency conversion, and exchange rate application
- Configurable via `aidsLevyRate` and `baseCurrency` pulled from SystemSettings

### `lib/stripe.ts`
- `createCheckoutSession(plan)` — creates a Stripe checkout session, reusing existing product
- `updateSubscription(plan)` — updates active subscription, reusing product from current price
- `getCustomerPortalUrl()` — returns Stripe billing portal URL

### `lib/system-settings.ts`
- `getSetting(name)` — single setting (most recent effective value)
- `getSettings(names[])` — batch fetch
- `getSettingAsNumber/Boolean/String(name, default)` — typed getters

### `lib/company-context.ts`
- `getCompanyContext()` — resolves the active Company for the current user:
  - PLATFORM_ADMIN → first company
  - CLIENT_ADMIN → first company under their client
  - EMPLOYEE → company from their employee record

### `lib/license.ts`
- `generateLicenseToken()` — generates a cryptographically secure token
- `validateLicense(clientId, token)` — checks active and non-expired license
- `issueLicense / revokeLicense / reactivateLicense` — license lifecycle management
- `checkEmployeeCap(clientId)` — validates employee count against subscription cap

### `lib/prisma.ts`
- Singleton PrismaClient with `@prisma/adapter-pg` (Prisma 7 driver adapter pattern)
- Global caching in development to prevent connection exhaustion on hot reload

---

## Biometric Device Integration

The platform supports hardware-level attendance tracking through direct integration with biometric devices.

### Supported Vendors
| Vendor | Protocol | Method |
|--------|----------|--------|
| **Hikvision** | ISAPI (JSON/XML) | **Pull**: Server polls device via Digest Auth; **Push**: Device POSTs to `/api/biometric/hikvision` |
| **ZKTeco** | ADMS / SDK | **Push**: Device connects to `/api/biometric/zkteco` via ADMS; **Pull**: Direct TCP/IP on port 4370 |

### Setup Flow
1. **Device Registration**: Add the device under `Utilities > Biometric Devices` with its IP, Port, and Credentials.
2. **Employee Mapping**: Ensure the `employeeCode` in Bantu matches the `Enroll ID` or `Employee No.` on the physical device.
3. **Data Sync**:
   - For **Push** (Recommended): Configure the "Cloud Server" or "EHome" URL on the device to point to your Bantu instance's `/api/biometric` endpoint.
   - For **Pull**: Ensure the Bantu server has network line-of-sight to the device's IP. 

### Data Processing
Raw "punches" are stored in the `AttendanceLog` table. A background process (or manual trigger) runs the **Attendance Engine** to pair IN/OUT punches into `AttendanceRecord` entries, calculating daily normal and overtime minutes.
