# Technical Requirements Document: Bantu Payroll & HR Platform

**Version:** 2.0  
**Status:** Draft  
**Date:** 2026-05-14  
**Author:** AI Agent (Big Pickle)  

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Technology Stack](#2-technology-stack)
3. [Data Architecture](#3-data-architecture)
4. [API Architecture](#4-api-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [RBAC & Permissions System](#6-rbac--permissions-system)
7. [Payroll Engine](#7-payroll-engine)
8. [Attendance & Biometrics](#8-attendance--biometrics)
9. [Desktop Application](#9-desktop-application)
10. [Deployment Architecture](#10-deployment-architecture)
11. [Security Architecture](#11-security-architecture)
12. [Performance Requirements](#12-performance-requirements)
13. [Testing Strategy](#13-testing-strategy)
14. [Monitoring & Observability](#14-monitoring--observability)

---

## 1. System Architecture

### 1.1 High-Level Architecture

```
                         ┌──────────────────────┐
                         │    DNS / CDN (CF)     │
                         └────┬────────────┬─────┘
                              │            │
                    ┌─────────┘            └─────────┐
                    ▼                                 ▼
          ┌──────────────────┐           ┌──────────────────────┐
          │  Vercel (SPA)    │           │  Cloudflare Workers  │
          │  React 19 + Vite │           │  Hono API (v2)       │
          │  bantu-cloud     │           │  api.payroll.think-  │
          │  .vercel.app     │           │  bantu.com           │
          └────────┬─────────┘           └──────────┬───────────┘
                   │                                │
                   │ HTTPS / JSON                   │ HTTPS / JSON
                   ▼                                ▼
          ┌──────────────────────────────────────────────────────┐
          │              Backend v1 (Express 5)                  │
          │              Render / Fly.io / Vercel                │
          │              83 route files, 19 libs, 12 utils      │
          └────────┬───────────────────────────────────┬────────┘
                   │                                   │
                   ▼                                   ▼
          ┌──────────────────┐              ┌──────────────────┐
          │   PostgreSQL     │              │  Cloudflare R2   │
          │   (Neon)         │              │  File Storage    │
          │   Serverless PG  │              │                  │
          └──────────────────┘              └──────────────────┘
```

### 1.2 Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                              BANTU PLATFORM                                     │
├────────────────┬───────────────────┬───────────────────┬────────────────────────┤
│   FRONTEND     │   BACKEND V1      │   BACKEND V2      │    DESKTOP (Tauri)     │
│   (React SPA)  │   (Express 5)     │   (Hono CF)       │    (macOS/Windows)     │
│                │                   │                   │                        │
│  AppShell      │  Middleware       │  Domain Classes   │  Native Shell          │
│  ├─Sidebar     │  ├─helmet         │  ├─auth.domain    │  ├─WebView (SPA)       │
│  └─NavFilter   │  ├─cors           │  ├─employees      │  ├─Tray Icon           │
│                │  ├─rate-limit     │  ├─payroll        │  ├─Offline Sync        │
│  Pages (70+)   │  ├─auth JWT       │  ├─leave          │  └─Auto-Updater        │
│  ├─Dashboard   │  ├─companyContext │  ├─loans          │                        │
│  ├─Employees   │  └─errorHandler   │  ├─attendance     │  Embedded Backend      │
│  ├─Payroll     │                   │  ├─statutory      │  ├─pkg-compiled bin    │
│  ├─Leave       │  83 Route Files   │  ├─documents      │  └─SQLite database     │
│  ├─Reports     │  ┌──────────────┐ │  ├─settings       │                        │
│  ├─Admin       │  │  auth, emp,  │ │  └─admin          │  INTEGRATIONS          │
│  └─Utilities   │  │  pay, leave,│ │                   │  ├─Stripe              │
│                │  │  loans, ... │ │  ~80 routes        │  ├─Resend/Nodemailer   │
│  Shared Libs   │  └──────────────┘ │  (mirror v1)      │  ├─ZKTeco Biometric    │
│  ├─react-query │                   │                   │  └─Hikvision Biometric │
│  ├─react-hook  │  Cron Jobs        │  CF Cron Triggers │                        │
│  │  -form      │  ├─1st 00:05     │  ├─1st 00:05      │  CI/CD                 │
│  └─zod         │  │  leave accrual │  │  leave accrual │  ├─GH Actions Release  │
│                │  └─daily 07:00   │  └─daily 07:00    │  └─GH Actions Test     │
│  UI Kit        │    notifications  │    notifications  │                        │
│  ├─shadcn/ui   │                   │                   │  MCP                   │
│  ├─Tailwind v4 │  Prisma ORM       │  Prisma + Neon    │  └─TestSprite         │
│  └─lucide      │  └─PostgreSQL     │  └─PostgreSQL     │                        │
└────────────────┴───────────────────┴───────────────────┴────────────────────────┘
```

### 1.3 Data Flow — Payroll Run (Critical Path)

```
User clicks "Process Payroll"
  → Frontend: POST /api/payroll (TanStack Query mutation)
  → Backend: authenticateToken middleware (JWT verify)
  → Backend: companyContext middleware (x-company-id scoping)
  → Backend: requireModulePermission('PAYROLL', 'RUN') middleware
  → Route handler: payroll.runController()
    1. Validate payroll calendar period is open
    2. Fetch all active employees for company
    3. Fetch active transaction codes with rules
    4. For each employee:
       a. Calculate basic salary (USD/ZiG split)
       b. Apply EARNING/DEDUCTION/BENEFIT transactions
       c. Calculate PAYE (taxEngine.js)
       d. Calculate NSSA (employee + employer)
       e. Calculate AIDS Levy
       f. Calculate NEC levy
       g. Calculate SDF/WCIF/ZIMDEF
       h. Apply loan deductions
       i. Generate Payslip record
    5. Update PayrollRun status to COMPLETED
    6. Return summary to frontend
  → Frontend: Invalidate payroll query, show success toast
```

---

## 2. Technology Stack

### 2.1 Frontend

| Technology | Version | Purpose | Configuration |
|-----------|---------|---------|---------------|
| React | ^19.2.0 | UI framework | JSX, hooks, server components (future) |
| TypeScript | ~5.9.3 | Type safety | strict mode |
| Vite | ^7.3.1 | Bundler/dev server | HMR, code splitting |
| TailwindCSS | ^4.2.1 | Utility CSS | `@tailwindcss/vite` plugin |
| shadcn/ui | ^4.1.0 | Component library | CLI-managed, `@/components/ui` |
| React Router | ^7.13.1 | Client routing | Lazy routes, `ProtectedRoute` wrappers |
| TanStack Query | ^5.90.21 | Server state | 60s stale time, 1 retry, optimistic updates |
| React Hook Form | ^7.72.0 | Forms | `@hookform/resolvers/zod` |
| Zod | ^4.3.6 | Schema validation | Shared types frontend↔backend |
| Recharts | ^3.8.0 | Charts | Dashboard widgets |
| Lucide React | ^0.577.0 | Icons | Tree-shakeable |
| Sonner | ^2.0.7 | Toasts | Error notifications |
| Sentry | ^10.53.0 | Error monitoring | `@sentry/react` |

**Vite Config:**
```typescript
// vite.config.ts
resolve: { alias: { '@': './src' } }
test: { environment: 'jsdom', globals: true }
```

### 2.2 Backend v1 (Express)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 20+ | Runtime |
| Express | ^5.2.1 | Web framework (v5, ESM-ready) |
| Prisma | ^6.19.2 | ORM with migrations |
| PostgreSQL (Neon) | — | Serverless database |
| JWT (jsonwebtoken) | ^9.0.3 | Auth tokens |
| bcryptjs | ^3.0.3 | Password hashing |
| Stripe | ^22.1.1 | Subscription billing |
| Nodemailer | ^8.0.2 | Email |
| node-cron | ^4.2.1 | Scheduled jobs |
| Multer | ^2.1.1 | File uploads |
| Helmet | ^8.1.0 | Security headers |
| express-rate-limit | ^8.3.1 | Rate limiting |
| @react-pdf/renderer | ^4.3.2 | PDF generation (JSX) |
| PDFKit | ^0.17.2 | PDF generation (fallback) |
| exceljs | ^4.4.0 | Excel export |
| csv-parse | ^6.1.0 | CSV import |
| xlsx | ^0.18.5 | Excel parsing |
| mammoth | ^1.12.0 | DOCX→HTML |
| @google-cloud/storage | ^7.19.0 | GCP Cloud Storage (legacy) |

### 2.3 Backend v2 (Cloudflare Workers)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Hono | ^4.6.0 | Web framework (ESM-native, edge) |
| TypeScript | ^5.5.0 | Type safety |
| Prisma | ^6.19.2 | ORM |
| @prisma/adapter-neon | ^7.8.0 | Neon serverless adapter |
| @neondatabase/serverless | ^1.1.0 | Neon driver |
| @aws-sdk/client-s3 | ^3.600.0 | R2/S3 file storage |
| Resend | ^4.0.0 | Email |
| Zod + @hono/zod-validator | ^0.4.0 | Request validation |
| Sentry | ^10.53.0 | Error monitoring |
| Wrangler | ^4.90.0 | Deployment CLI |

### 2.4 Desktop (Tauri 2.0)

| Technology | Version | Purpose |
|-----------|---------|---------|
| Rust | 2021 edition | Native shell |
| Tauri | ^2.6.1 | Desktop framework |
| tauri-plugin-shell | 2 | Shell access |
| tauri-plugin-updater | 2 | Auto-update |
| tauri-plugin-stronghold | 2 | Secure storage |
| reqwest | 0.12 | HTTP client (Rust) |
| serde | 1 | Serialization |

### 2.5 Infrastructure & DevOps

| Tool | Purpose |
|------|---------|
| Vercel | Frontend hosting + serverless functions |
| Cloudflare Workers | API v2 hosting |
| Neon (PostgreSQL) | Serverless database |
| Cloudflare R2 | File/object storage |
| GitHub Actions | CI/CD (desktop build/test) |
| Sentry | Error monitoring |
| TestSprite (MCP) | AI-powered testing |
| Stripe | Payment processing |

---

## 3. Data Architecture

### 3.1 Entity-Relationship Diagram (Core)

```
User ──1:1──> ClientAdmin ──N:1──> Client ──1:N──> Company ──1:N──> Employee
  │                                    │             │               │
  │                                    │             │               ├── PayrollTransaction
  │                                    │             │               ├── Payslip
  │                                    │             │               ├── LeaveRecord
  │                                    │             │               ├── LeaveBalance
  │                                    │             │               ├── Loan
  │                                    │             │               └── AttendanceRecord
  │                                    │             │
  │                                    │             ├── Branch ──1:N──> Department
  │                                    │             ├── PayrollRun ──1:N──> Payslip
  │                                    │             ├── LeavePolicy
  │                                    │             ├── Shift
  │                                    │             └── BiometricDevice
  │                                    │
  │                                    ├── PayrollCalendar
  │                                    ├── TransactionCode
  │                                    ├── LicenseToken
  │                                    └── Subscription
  │
  └── UserCompanyRole ──N:1──> Role ──1:N──> RoleModulePermission
```

### 3.2 Complete Model List (54 models)

**Auth & Tenancy (4):** User, Session, Client, ClientAdmin
**RBAC (4):** Role, RoleModulePermission, UserCompanyRole, Invite
**Org Structure (4):** Company, SubCompany, Branch, Department
**Employee (4):** Employee, EmployeeBankAccount, EmployeeDocument, PayrollCore
**Payroll (7):** PayrollCalendar, PayrollRun, PayrollTransaction, PayrollInput, Payslip, TransactionCode, TransactionCodeRule
**Tax (2):** TaxTable, TaxBracket
**Grades (3):** Grade, NecTable, NecGrade
**Shift & Attendance (5):** Shift, ShiftAssignment, BiometricDevice, AttendanceLog, AttendanceRecord
**Leave (5):** LeavePolicy, LeaveBalance, LeaveEncashment, LeaveRecord, LeaveRequest
**Loans (2):** Loan, LoanRepayment
**Employee Salary (1):** EmployeeTransaction
**License & Subscription (2):** LicenseToken, Subscription
**System (3):** SystemSetting, CurrencyRate, PublicHoliday
**Audit & Jobs (2):** AuditLog, Job
**Sync (3, SQLite only):** SyncQueue, SyncLog, SyncMeta
**Expenses (2):** ExpenseCategory, Expense
**Training (3):** TrainingCourse, TrainingEnrollment, TrainingCertificate
**Performance (3):** PerformanceGoal, PerformanceReview, ReviewSkill
**Recruitment (5):** JobPosting, JobApplication, CandidateSkill, CandidateExperience, CandidateEducation
**Onboarding (4):** OnboardingTemplate, OnboardingTemplateTask, Onboarding, OnboardingTask
**Assets (2):** AssetCategory, Asset
**Succession (2):** SuccessionPlan, SuccessionCandidate
**Surveys (4):** Survey, SurveyQuestion, SurveyResponse, SurveyAnswer
**Desktop (1):** DesktopLicense

### 3.3 Key Enums (34)

```typescript
enum UserRole { PLATFORM_ADMIN, CLIENT_ADMIN, COMPANY_USER, EMPLOYEE }

enum AppModule {
  PEOPLE, TIME_LEAVE, PAYROLL, COMPLIANCE, REPORTS, SETTINGS,
  RECRUITMENT, PERFORMANCE, EXPENSES,
  ONBOARDING, TRAINING, ASSETS,
  SUCCESSION, SURVEYS, ANALYTICS
}

enum ModuleAction { VIEW, EDIT, DELETE, APPROVE, EXPORT, RUN, CONFIGURE }

enum PayrollStatus { DRAFT, PROCESSING, COMPLETED, ERROR }
enum TransactionType { EARNING, DEDUCTION, BENEFIT }
enum TaxMethod { FDS_AVERAGE, FDS_FORECASTING, NON_FDS }
enum EmploymentType { PERMANENT, CONTRACT, TEMPORARY, PART_TIME }
enum PaymentMethod { BANK, CASH }
enum PaymentBasis { MONTHLY, DAILY, HOURLY }
enum PlanType { BASIC, STANDARD, PREMIUM, ENTERPRISE }

enum Gender { MALE, FEMALE, OTHER }
enum MaritalStatus { SINGLE, MARRIED, DIVORCED, WIDOWED }
enum LeaveStatus { PENDING, APPROVED, REJECTED, CANCELLED }
enum LoanStatus { ACTIVE, CLOSED, DEFAULTED }
enum RepaymentStatus { UNPAID, PAID, WAIVED }
```

### 3.4 Polymorphism & Patterns

**System Settings (Key-Value Store):**
```prisma
model SystemSetting {
  clientId      String?    // null = global, set = per-client
  settingName   String
  settingValue  String
  dataType      DataType   // TEXT, NUMBER, BOOLEAN, DATE
  effectiveFrom DateTime
  isActive      Boolean    @default(true)
  description   String?
  lastUpdatedBy String?
  @@index([settingName, isActive, effectiveFrom])
}
```

**Multi-Currency Pattern:**
```prisma
model Employee {
  splitUsdPercent  Float?         // e.g. 60 = 60% USD / 40% ZiG
  splitZigMode     SplitZigMode?  // options: percentage-based
}

model Payslip {
  netPayUSD  Float
  netPayZIG  Float
  grossUSD   Float
  grossZIG   Float
  payeUSD    Float
  payeZIG    Float
  // ... per-currency breakdowns for every statutory deduction
}
```

**Module Licensing (PostgreSQL Array):**
```prisma
model Client {
  enabledModules AppModule[]  // PostgreSQL native array
}
```

---

## 4. API Architecture

### 4.1 Backend v1 (Express) — Middleware Pipeline

```
Request
  │
  ├── Stripe Webhook Route
  │     └─ express.raw({ type: 'application/json' })
  │     └─ rate-limit: 200/15min
  │
  ├── helmet() — security headers
  ├── cors() — dynamic origin allowlist
  ├── express.json() — body parser
  ├── Request Logger (ISO timestamp + method + URL)
  │
  ├── [Desktop Mode] syncQueueMiddleware
  │
  ├── Public Routes (no auth)
  │     └─ /health, /, /api/auth, /api/setup, /api/license/validate
  │     └─ /api/invites/validate, /api/invites/accept
  │     └─ /api/biometric (rate-limit: 500/15min)
  │     └─ /api/desktop (desktop download)
  │
  ├── authenticateToken — JWT verification
  │     └─ Extracts user from Authorization: Bearer <token>
  │     └─ Re-resolves permissions from DB (fresh every request)
  │     └─ Attaches req.user = { id, email, role, permissions, ... }
  │
  ├── companyContext — Multi-tenant scoping
  │     └─ Reads x-company-id header
  │     └─ Validates user has access to company
  │     └─ Attaches req.company = { id, clientId, ... }
  │
  ├── Protected Routes (83 files)
  │     └─ Per-route guards: requireModule() / requireModulePermission()
  │
  └── Global Error Handler → 500 JSON response
```

### 4.2 Backend v1 — Route Table (83 route files)

| Prefix | Auth | Module Guard | Description |
|--------|------|-------------|-------------|
| `/api/webhooks` | No | None | Stripe webhooks |
| `/health` | No | None | Health check |
| `/api/auth` | No | None | Login, register |
| `/api/setup` | No | None | First-time platform setup |
| `/api/license/validate` | No | None | License token validation |
| `/api/invites/validate` | No | None | Public invite token |
| `/api/invites/accept` | No | None | Accept invite |
| `/api/biometric` | No | None | Device push endpoint |
| `/api/desktop` | No | None | Desktop download |
| `/api/user` | Yes | None | Current user profile |
| `/api/dashboard` | Yes | None | Dashboard data |
| `/api/roles` | Yes | None | RBAC role management |
| `/api/invites` | Yes | None | Invite management |
| `/api/clients` | Yes | None | Client CRUD |
| `/api/companies` | Yes | None | Company CRUD |
| `/api/branches` | Yes | PEOPLE | Branch CRUD |
| `/api/departments` | Yes | PEOPLE | Department CRUD |
| `/api/sub-companies` | Yes | None | Sub-company CRUD |
| `/api/employees` | Yes | PEOPLE | Employee CRUD |
| `/api/employee` | Yes | None | Self-service |
| `/api/documents` | Yes | PEOPLE | Employee documents |
| `/api/payroll` | Yes | PAYROLL | Payroll runs |
| `/api/payroll-core` | Yes | PAYROLL | Core payroll data |
| `/api/payslips` | Yes | PAYROLL | Payslip access |
| `/api/payroll-calendar` | Yes | PAYROLL | Calendar management |
| `/api/payroll-inputs` | Yes | PAYROLL | Pre-run inputs |
| `/api/transaction-codes` | Yes | PAYROLL | Transaction code CRUD |
| `/api/transactions` | Yes | PAYROLL | Transaction management |
| `/api/tax-tables` | Yes | COMPLIANCE | Tax table management |
| `/api/tax-bands` | Yes | COMPLIANCE | Tax bracket CRUD |
| `/api/grades` | Yes | PEOPLE | Salary grades |
| `/api/leave` | Yes | TIME_LEAVE | Leave records |
| `/api/leave-policies` | Yes | TIME_LEAVE | Leave policy config |
| `/api/leave-balances` | Yes | TIME_LEAVE | Balance tracking |
| `/api/leave-encashments` | Yes | TIME_LEAVE | Encashment workflow |
| `/api/loans` | Yes | PEOPLE | Loan management |
| `/api/license` | Yes | None | License CRUD |
| `/api/admin` | Yes | None | Platform admin |
| `/api/reports` | Yes | REPORTS | Report generation |
| `/api/statutory-exports` | Yes | COMPLIANCE | ZIMRA/NSSA exports |
| `/api/bank-files` | Yes | PAYROLL | Bank EFT generation |
| `/api/subscription` | Yes | None | Subscription management |
| `/api/system-settings` | Yes | SETTINGS | System config |
| `/api/currency-rates` | Yes | SETTINGS | USD/ZiG rates |
| `/api/public-holidays` | Yes | SETTINGS | Holiday management |
| `/api/nec-tables` | Yes | COMPLIANCE | NEC grade tables |
| `/api/nssa-settings` | Yes | COMPLIANCE | NSSA configuration |
| `/api/statutory-rates` | Yes | COMPLIANCE | Statutory rate config |
| `/api/work-period-settings` | Yes | SETTINGS | Work period config |
| `/api/nssa-contributions` | Yes | COMPLIANCE | NSSA contribution tracking |
| `/api/shifts` | Yes | TIME_LEAVE | Shift configuration |
| `/api/roster` | Yes | TIME_LEAVE | Roster planning |
| `/api/attendance` | Yes | TIME_LEAVE | Attendance records |
| `/api/devices` | Yes | TIME_LEAVE | Biometric device mgmt |
| `/api/payincrease` | Yes | PAYROLL | Bulk pay increases |
| `/api/backpay` | Yes | PAYROLL | Back pay processing |
| `/api/period-end` | Yes | PAYROLL | Period-end close |
| `/api/sync` | Yes | None | Desktop sync |
| `/api/intelligence` | Yes | None | AI features |
| `/api/cron` | Yes | None | Cron job triggers |
| `/api/backup` | Yes | SETTINGS | Database backup |
| `/api/debug-paye` | Yes* | None | Debug endpoint (conditional) |
| `/api/recruitment` | Yes | SETTINGS | Tier 2 |
| `/api/performance` | Yes | SETTINGS | Tier 2 |
| `/api/expenses` | Yes | SETTINGS | Tier 2 |
| `/api/onboarding` | Yes | SETTINGS | Tier 3 |
| `/api/training` | Yes | SETTINGS | Tier 3 |
| `/api/assets` | Yes | SETTINGS | Tier 3 |
| `/api/succession` | Yes | SETTINGS | Tier 4 |
| `/api/surveys` | Yes | SETTINGS | Tier 4 |
| `/api/analytics` | Yes | SETTINGS | Tier 4 |

### 4.3 Backend v2 (Hono) — Route Structure

```typescript
// Entry: backend-v2/src/index.ts
const app = new Hono<{ Bindings: Bindings }>();

// Global middleware
app.use('*', initPrisma, initAuth, initMailer, initStorage, cors, secureHeaders, logger);

// Public
app.route('/api', authDomain);        // Login, register, token refresh

// Auth-only (no company context)
const userApi = new Hono();
userApi.use('*', authenticateToken);
userApi.route('/', userDomain);       // Session, profile
app.route('/api', userApi);

// Protected (auth + company context)
const api = new Hono();
api.use('*', authenticateToken);
api.use('*', companyContext);
api.route('/', employeesDomain);
api.route('/', payrollDomain);
api.route('/', leaveDomain);
api.route('/', loansDomain);
api.route('/', attendanceDomain);
api.route('/', settingsDomain);
api.route('/', statutoryDomain);
api.route('/', documentsDomain);
api.route('/', adminDomain);
api.route('/', advancedDomain);
app.route('/api', api);
```

### 4.4 Authentication Flow

```
Login
  │
  POST /api/auth
  │  { email, password }
  │
  ├── Lookup User by email
  ├── bcrypt.compare(password, user.password)
  ├── Resolve permissions from DB (if COMPANY_USER)
  ├── Generate JWT payload:
  │     {
  │       id, email, role,
  │       clientId, companyIds,
  │       enabledModules: AppModule[],
  │       permissions: { MODULE: ['ACTION', ...] },  // COMPANY_USER only
  │       isClientAdmin: boolean
  │     }
  ├── Sign JWT (24h expiry, HS256)
  │
  └── Response: { token, user }
```

### 4.5 Scheduled Jobs

| Job | Schedule | Function | Description |
|-----|----------|----------|-------------|
| Leave Accrual | `5 0 1 * *` (monthly) | `runLeaveAccrual()` | Accrues leave for all active policies; part-time = 50% rate |
| Notifications | `0 7 * * *` (daily) | `runNotifications()` | Emails CLIENT_ADMINs about pending leave requests |
| System Seeding | On server start | Seed | Auto-seeds holidays, default transaction codes, system settings |

---

## 5. Frontend Architecture

### 5.1 Route Structure

```typescript
// App.tsx — ~70 lazy-loaded pages
<Routes>
  {/* Public */}
  <Route path="/" element={<LandingPage />} />
  <Route path="/login" element={<Login />} />
  <Route path="/register" element={<Register />} />
  <Route path="/setup" element={<Setup />} />
  <Route path="/accept-invite" element={<AcceptInvite />} />
  <Route path="/license-expired" element={<LicenseExpired />} />

  {/* Protected — Employee Self-Service */}
  <Route element={<ProtectedRoute role="EMPLOYEE" />}>
    <Route path="/employee" element={<EmployeeDashboard />} />
    <Route path="/employee/payslips" element={<EmployeePayslips />} />
    <Route path="/employee/profile" element={<EmployeeProfile />} />
    <Route path="/employee/leave" element={<EmployeeLeave />} />
  </Route>

  {/* Protected — Client Admin / Company User */}
  <Route element={<ProtectedRoute role="CLIENT_ADMIN | COMPANY_USER" />}>
    <Route element={<AppShell />}>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/employees" element={<EmployeeList />} />
      <Route path="/employees/new" element={<EmployeeCreate />} />
      <Route path="/employees/:id/edit" element={<EmployeeEdit />} />
      <Route path="/employees/import" element={<EmployeeImport />} />
      <Route path="/payroll" element={<PayrollList />} />
      <Route path="/payroll/new" element={<PayrollCreate />} />
      <Route path="/payroll/:runId" element={<PayrollDetail />} />
      <Route path="/payroll/:runId/payslips" element={<PayslipList />} />
      <Route path="/leave" element={<LeaveList />} />
      <Route path="/leave/new" element={<LeaveCreate />} />
      <Route path="/loans" element={<LoanList />} />
      <Route path="/loans/new" element={<LoanCreate />} />
      <Route path="/loans/:id" element={<LoanDetail />} />
      <Route path="/reports" element={<Reports />} />
      <Route path="/subscription" element={<Subscription />} />
      <Route path="/license" element={<License />} />

      {/* Client Admin Only */}
      <Route element={<ProtectedRoute role="CLIENT_ADMIN" />}>
        <Route path="/client-admin/structure" element={<OrgStructure />} />
        <Route path="/client-admin/settings" element={<ClientSettings />} />
        <Route path="/client-admin/roles" element={<RoleBuilder />} />
        <Route path="/client-admin/users" element={<UserManagement />} />
      </Route>

      {/* Utilities */}
      <Route path="/utilities" element={<UtilitiesHub />} />
      <Route path="/utilities/transactions" element={<TransactionCodes />} />
      <Route path="/utilities/back-pay" element={<BackPay />} />
      <Route path="/utilities/import-earnings" element={<ImportEarnings />} />
      <Route path="/utilities/pay-increase" element={<PayIncrease />} />
      <Route path="/utilities/period-end" element={<PeriodEnd />} />
      <Route path="/utilities/devices" element={<Devices />} />
      <Route path="/utilities/payroll-calendar" element={<PayrollCalendar />} />
      <Route path="/utilities/currency-rates" element={<CurrencyRates />} />
      <Route path="/utilities/holidays" element={<Holidays />} />
    </Route>
  </Route>

  {/* Protected — Platform Admin Only */}
  <Route element={<ProtectedRoute role="PLATFORM_ADMIN" />}>
    <Route element={<AppShell />}>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/admin/users" element={<AdminUsers />} />
      <Route path="/admin/clients" element={<AdminClients />} />
      <Route path="/admin/licenses" element={<AdminLicenses />} />
      <Route path="/admin/roles" element={<AdminRoles />} />
      <Route path="/admin/logs" element={<AuditLogs />} />
      <Route path="/admin/settings" element={<SystemSettings />} />
    </Route>
  </Route>
</Routes>
```

### 5.2 Component Tree (AppShell Layout)

```typescript
<AppShell>
  <Sidebar>
    <Logo />
    <NavItems>       // Dynamically filtered by permissions
      <Dashboard />
      <People />     // if can('PEOPLE')
      <TimeLeave />  // if can('TIME_LEAVE')
      <Payroll />    // if can('PAYROLL')
      <Reports />    // if can('REPORTS')
      <Settings />   // if can('SETTINGS')
      <Admin />      // if PLATFORM_ADMIN
    </NavItems>
  </Sidebar>
  <main>
    <TopBar>
      <Breadcrumb />
      <CompanySwitcher />
      <UserMenu />
    </TopBar>
    <Outlet />       // Active page
  </main>
</AppShell>
```

### 5.3 State Management Strategy

| State Type | Solution | Details |
|-----------|----------|---------|
| Server state | TanStack Query | All API data, 60s staleTime, 1 retry, `keepPreviousData` |
| Auth state | JWT decode + Context | `useAuth()` from decoded token payload |
| Permissions | JWT decode | `usePermissions()` reads embedded permissions |
| Company context | Context + header | `x-company-id` from `CompanySwitcher` |
| Form state | React Hook Form + Zod | Validation schemas per form |
| Toast/UI state | Sonner + local state | Ephemeral UI notifications |
| Theme/Settings | SettingsContext | System-wide preferences |

### 5.4 API Client Layer

```typescript
// frontend/src/api/client.ts
// Axios instance with:
//   - baseURL: import.meta.env.VITE_API_URL
//   - Authorization header from auth token
//   - x-company-id header from context
//   - 401 interceptor: auto-logout
//   - 403 interceptor: permission denied toast
//   - Error interceptor: Sentry capture

// Per-module API files (16 files):
// employees.api.ts, payroll.api.ts, leave.api.ts, loans.api.ts,
// reports.api.ts, settings.api.ts, admin.api.ts, auth.api.ts,
// devices.api.ts, attendance.api.ts, shifts.api.ts, roster.api.ts,
// companies.api.ts, branches.api.ts, departments.api.ts, utils.api.ts
```

---

## 6. RBAC & Permissions System

### 6.1 Data Model

```prisma
model Role {
  id            String                  @id @default(cuid())
  companyId     String
  name          String
  description   String?
  isActive      Boolean                 @default(true)
  company       Company                 @relation(fields: [companyId], references: [id])
  permissions   RoleModulePermission[]
  userRoles     UserCompanyRole[]
  @@unique([companyId, name])
}

model RoleModulePermission {
  id      String        @id @default(cuid())
  roleId  String
  module  AppModule
  actions ModuleAction[]
  role    Role          @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@unique([roleId, module])
}

model UserCompanyRole {
  id        String  @id @default(cuid())
  userId    String
  companyId String
  roleId    String
  user      User    @relation(fields: [userId], references: [id])
  company   Company @relation(fields: [companyId], references: [id])
  role      Role    @relation(fields: [roleId], references: [id])
  @@unique([userId, companyId, roleId])
}
```

### 6.2 Permission Resolution Flow

```
JWT Creation (login)
  │
  ├── PLATFORM_ADMIN → JWT contains { role: PLATFORM_ADMIN, isClientAdmin: true }
  │     → All permissions bypassed (backend guards skip check)
  │
  ├── CLIENT_ADMIN → JWT contains { role: CLIENT_ADMIN, isClientAdmin: true }
  │     → All module permissions bypassed (backend guards skip check)
  │     → Limited by client's enabledModules (frontend nav filtering)
  │
  └── COMPANY_USER → JWT contains:
        {
          role: COMPANY_USER,
          permissions: {
            PEOPLE: ['VIEW', 'EDIT'],
            PAYROLL: ['VIEW', 'RUN'],
            ...
          }
        }

Backend per-request re-resolution:
  1. auth middleware: look up UserCompanyRole + RoleModulePermission
  2. Fresh permissions from DB → req.user.permissions
  3. Guards check req.user.permissions[MODULE]?.includes(ACTION)

Frontend JWT decode:
  usePermissions() reads from stored JWT payload
  └── can(module, action?) → boolean
  └── isClientAdmin → boolean
```

### 6.3 Middleware Guards

```javascript
// Module-level guard (router-level)
router.use(requireModule('PEOPLE'));
// → USER must have ANY permission for PEOPLE module

// Action-level guard (route-level)
router.post('/', requireModulePermission('PEOPLE', 'EDIT'), handler);
// → USER must have EDIT action on PEOPLE module

// Legacy bridge
// requirePermission('manage_employees') → PERMISSION_TO_RBAC map
// → resolves to PEOPLE+EDIT and PEOPLE+DELETE
```

### 6.4 Frontend Guard Pattern

```typescript
// Component-level
const { can, isClientAdmin } = usePermissions();

{can('PAYROLL', 'RUN') && <ProcessPayrollButton />}
{can('PEOPLE', 'EDIT') && <AddEmployeeButton />}
{can('TIME_LEAVE', 'APPROVE') && <ApproveLeaveButton />}

// Navigation-level (AppShell sidebar)
// Sidebar items dynamically filtered: user sees only modules they can access
// CLIENT_ADMIN sees all enabled modules + Roles + Team Members links

// Route-level
<ProtectedRoute requiredPermissions={[{ module: 'PEOPLE', action: 'VIEW' }]}>
  <EmployeeList />
</ProtectedRoute>
```

---

## 7. Payroll Engine

### 7.1 Tax Calculation Flow (taxEngine.js)

```
calculatePaye(grossPay: number, options: TaxOptions) → TaxResult
  │
  ├── 1. Determine Tax Method
  │     ├── FDS_AVERAGE  → Average monthly income over assessment period
  │     ├── FDS_FORECASTING → Forecast annual income from current month
  │     └── NON_FDS      → Direct annual projection
  │
  ├── 2. Apply Gross-Up Adjustments
  │     ├── Add motor vehicle benefit (based on engine category)
  │     ├── Add deemed benefits from transaction codes
  │     └── Subtract exempt bonuses/salary components
  │
  ├── 3. Apply Tax Credits
  │     ├── Medical aid credits
  │     ├── Tax directives (from ZIMRA)
  │     └── Pension/insurance credits
  │
  ├── 4. Calculate Taxable Income
  │     ├── Annualize: gross × (12 / monthsWorked)
  │     ├── Apply ZIMRA tax brackets (configurable TaxBracket table)
  │     └── De-annualize back to monthly
  │
  ├── 5. Calculate AIDS Levy
  │     ├── AIDS Levy = PAYE × AIDS_LEVY_RATE (configurable SystemSetting)
  │     └── Applied on the PAYE amount, not gross
  │
  ├── 6. Calculate NSSA
  │     ├── Employee: NSSA_EMPLOYEE_RATE × gross (up to ceiling)
  │     ├── Employer: NSSA_EMPLOYER_RATE × gross (up to ceiling)
  │     └── Configurable thresholds per SystemSettings
  │
  ├── 7. Calculate NEC Levy
  │     ├── From linked NecGrade.necLevyRate
  │     └── Applied as percentage of gross
  │
  ├── 8. Calculate SDF / WCIF / ZIMDEF (employer portions)
  │     ├── From Company settings (sdfRate, wcifRate, zimdefRate)
  │     ├── Applied as percentage of gross payroll
  │     └── Employer-borne only
  │
  └── 9. Return TaxResult
        {
          grossPay, taxableIncome, paye, aidsLevy,
          nssaEmployee, nssaEmployer,
          necLevy, necEmployer,
          sdfContribution, wcifEmployer, zimdefEmployer,
          medicalAidCredit, taxCreditsApplied,
          // Dual-currency breakdowns:
          grossUSD, grossZIG, payeUSD, payeZIG,
          nssaUSD, nssaZIG, aidsLevyUSD, aidsLevyZIG
        }
```

### 7.2 Multi-Currency Split Logic

```
Employee.splitUsdPercent = 60
→ 60% USD / 40% ZiG

For each payslip component:
  1. AmountUSD = TotalAmount × (splitUsdPercent / 100)
  2. AmountZiG = TotalAmount × (1 - splitUsdPercent / 100)

PayrollRun specifies:
  - currency: 'USD' (base)
  - exchangeRate: USD→ZiG rate (e.g., 25.5)

Output:
  - Payslip shows dual-currency column breakdown
  - Bank files split per currency
  - Statutory exports report in appropriate currency
```

### 7.3 Transaction Code Processing

```typescript
interface TransactionCodeRule {
  conditionType: 'GRADE' | 'THRESHOLD' | 'HOURS' | 'ALWAYS';
  conditionValue: string;  // e.g., grade ID, salary threshold
  calculationOverride: 'FIXED' | 'PERCENTAGE' | 'FORMULA';
  valueOverride: number;
  formulaOverride: string;  // Evaluated expression
  capAmount: number;        // optional cap
  priority: number;
}

// Processing order:
// 1. Sort rules by priority
// 2. For each rule, check condition
// 3. Apply matching rule's calculation
// 4. Apply cap if exceeded
// 5. Flag: taxable, pensionable, preTax, affectsPaye, affectsNssa, affectsAidsLevy
```

### 7.4 Payroll Run Lifecycle

```
DRAFT ──→ PROCESSING ──→ COMPLETED ──→ (archived)
  │           │              │
  │           │              └── Export payslips, bank files, statutory
  │           │
  │           └── Error → ERROR (rollback)
  │
  └── Edit inputs → Preview → Submit
```

---

## 8. Attendance & Biometrics

### 8.1 Device Integration Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      BANTU ATTENDANCE SYSTEM                     │
├────────────────────┬──────────────────────┬──────────────────────┤
│   ZKTeco Devices   │   Hikvision Devices  │   Manual Entry       │
│                     │                      │                      │
│  ┌─────────────┐   │  ┌───────────────┐   │  ┌──────────────┐   │
│  │ TCP Pull    │   │  │ ISAPI Pull    │   │  │ Web Form     │   │
│  │ (port 4370) │   │  │ (HTTP Digest) │   │  │ (React Form) │   │
│  └──────┬──────┘   │  └───────┬───────┘   │  └──────┬───────┘   │
│         │          │          │            │         │           │
│  ┌──────┴──────┐   │  ┌───────┴───────┐   │         │           │
│  │ ADMS Push   │   │  │ Webhook Push  │   │         │           │
│  │ (HTTP POST) │   │  │ (HTTP POST)   │   │         │           │
│  └──────┬──────┘   │  └───────┬───────┘   │         │           │
│         │          │          │            │         │           │
└─────────┴──────────┴──────────┴────────────┴─────────┴───────────┘
          │                     │                     │
          └─────────────────────┴─────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │   AttendanceLog       │
                    │   (raw punch events)  │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   AttendanceEngine    │
                    │   (IN/OUT pairing)    │
                    │   (OT calculation)    │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   AttendanceRecord    │
                    │   (daily summary)     │
                    └───────────┬───────────┘
                                │
                    ┌───────────▼───────────┐
                    │   Payroll Integration │
                    │   (OT pay, leave      │
                    │    deductions, etc.)  │
                    └───────────────────────┘
```

### 8.2 Attendance Engine Logic

```
Pair IN/OUT punches for a given day:
  1. Fetch all AttendanceLog entries for employee on date
  2. Sort by punchTime ascending
  3. Pair consecutive IN → OUT
  4. Handle edge cases:
     - Multiple INs → first IN, last OUT
     - Missing OUT → auto-clockout at shift end
     - Missing IN → flagged as ABSENT (if expected)
  5. Calculate:
     - totalMinutes = OUT - IN
     - breakMinutes = from Shift config
     - normalMinutes = min(totalMinutes - breakMinutes, Shift.normalHours × 60)
     - ot0Minutes = overtime at ×1.0 (up to threshold)
     - ot1Minutes = overtime at ×1.5
     - ot2Minutes = overtime at ×2.0
```

### 8.3 OT Multiplier Tiers

```
Based on Shift configuration:
  - normalHours: 8 (standard workday)
  - ot0Threshold: 2 (first 2h OT at ×1.0)
  - ot1Threshold: 4 (next 2h OT at ×1.5)
  - ot2Multiplier: ×2.0 (beyond 4h OT)
  - isOvernight: false (shift spans midnight)
```

---

## 9. Desktop Application

### 9.1 Tauri Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   Tauri 2.0 Shell (Rust)                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │              WebView (System Native)                │  │
│  │         ┌──────────────────────────────┐            │  │
│  │         │    React SPA (frontend/dist) │            │  │
│  │         │    - Dashboard               │            │  │
│  │         │    - Payroll                  │            │  │
│  │         │    - Employee Management      │            │  │
│  │         │    - Leave & Attendance       │            │  │
│  │         └──────────────────────────────┘            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Tauri Plugins:                                          │
│  ├── tauri-plugin-updater  → Auto-update pipeline       │
│  ├── tauri-plugin-stronghold → Secure credential storage │
│  ├── tauri-plugin-shell    → Spawn backend sidecar      │
│  └── tray-icon             → System tray with menu      │
│                                                          │
│  Embedded Backend Sidecar (compiled via pkg):            │
│  ┌────────────────────────────────────────────────────┐  │
│  │  backend binary (Express server on localhost:5005) │  │
│  │  - Full API surface (83 route files)               │  │
│  │  - SQLite database (template.db)                   │  │
│  │  - Sync queue engine                               │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 9.2 Offline Sync Engine

```
┌──────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│  User Action     │────→│  SyncQueue (SQLite)│────→│  Server (online) │
│  (e.g., create   │     │                   │     │                  │
│   employee)      │     │  { operation,     │     │  Process queue   │
│                  │     │    payload,       │     │  entries in      │
│                  │     │    status: PENDING}│     │  FIFO order      │
└──────────────────┘     └───────────────────┘     └──────────────────┘
                                │                           │
                                │ Reconnect →               │
                                │ Process queue              │
                                ▼                           ▼
                        ┌────────────────────┐    ┌──────────────────┐
                        │  Conflict resolved │    │  Server response │
                        │  via "last write   │    │  stored in       │
                        │  wins" strategy    │    │  SyncLog         │
                        └────────────────────┘    └──────────────────┘
```

### 9.3 Desktop Build Pipeline

```
Git tag: desktop-v*

GitHub Actions:
  1. Checkout code
  2. Setup Node.js 22 + Rust toolchain
  3. npm ci (frontend, backend, desktop)
  4. scripts/build-desktop.sh:
     a. esbuild bundles backend/index.js → dist/ncc/index.js
        - Minified, CJS, external: prisma, @prisma/client
     b. @yao-pkg/pkg compiles to native binary
        - Output: desktop/src-tauri/binaries/backend-{target}
        - Targets: macos-arm64, macos-x64, win-x64
     c. Prisma migrate against SQLite
        - Output: desktop/src-tauri/resources/template.db
  5. tauri-action:
     - Builds .dmg/.pkg (macOS) or .exe/.msi (Windows)
     - Creates GitHub Release with binary artifacts
     - Requires TAURI_SIGNING_PRIVATE_KEY
```

---

## 10. Deployment Architecture

### 10.1 Production Environment

```
┌──────────────────────────────────────────────────────────────────┐
│                        PRODUCTION                                 │
├──────────────────────┬───────────────────────────────────────────┤
│  Vercel              │  https://payroll.thinkbantu.com            │
│  Frontend SPA        │  Build: frontend/dist                     │
│                      │  SPA rewrites: /* → /index.html           │
├──────────────────────┼───────────────────────────────────────────┤
│  Cloudflare Workers  │  https://api.payroll.thinkbantu.com        │
│  Backend v2 (future) │  Hono + Prisma + Neon                     │
├──────────────────────┼───────────────────────────────────────────┤
│  Render / Vercel     │  Backend v1 (Express)                      │
│  Backend v1          │  Env: DATABASE_URL, JWT_SECRET, etc.      │
├──────────────────────┼───────────────────────────────────────────┤
│  Neon PostgreSQL     │  Serverless Postgres                       │
├──────────────────────┼───────────────────────────────────────────┤
│  Cloudflare R2       │  bantu-production bucket                   │
│  File Storage        │  Employee documents, payslip PDFs         │
├──────────────────────┼───────────────────────────────────────────┤
│  Stripe              │  Subscription billing                      │
├──────────────────────┼───────────────────────────────────────────┤
│  Resend              │  Transactional email                       │
├──────────────────────┼───────────────────────────────────────────┤
│  Sentry              │  Error monitoring (frontend + backend)    │
└──────────────────────┴───────────────────────────────────────────┘
```

### 10.2 Environment Variables

| Variable | Scope | Required | Source |
|----------|-------|----------|--------|
| `DATABASE_URL` | Backend v1/v2 | Yes | Neon |
| `JWT_SECRET` | Backend v1/v2 | Yes | Generated |
| `FRONTEND_URL` | Backend v1 | Yes | Vercel domain |
| `STRIPE_SECRET_KEY` | Backend v1 | Yes | Stripe |
| `RESEND_API_KEY` | Backend v2 | Yes | Resend |
| `R2_ACCOUNT_ID` | Backend v2 | Yes | Cloudflare |
| `R2_ACCESS_KEY_ID` | Backend v2 | Yes | Cloudflare |
| `R2_SECRET_ACCESS_KEY` | Backend v2 | Yes | Cloudflare |
| `SENTRY_DSN` | Both | No | Sentry |
| `CRON_SECRET` | Backend v1 | No | Generated |
| `ENABLE_DEBUG_PAYE` | Backend v1 | No | Flag |
| `NODE_ENV` | Both | Yes | production |

### 10.3 Rate Limiting

| Endpoint Group | Limit | Window |
|---------------|-------|--------|
| Auth routes | 5 requests | 15 minutes |
| Biometric push | 500 requests | 15 minutes |
| Webhooks | 200 requests | 15 minutes |
| General API | 100 requests | 15 minutes |

---

## 11. Security Architecture

### 11.1 Authentication

```
Password Storage:
  - bcrypt with salt rounds (default: 10)
  - Never store plaintext

JWT:
  - Algorithm: HS256
  - Expiry: 24 hours
  - Payload: id, email, role, permissions, clientId, companyIds
  - Transport: Authorization: Bearer <token>
  - No refresh token (re-login on expiry)

Session:
  - Server-side session table for token tracking
  - Session cleanup on expiry
```

### 11.2 Authorization

```
Every protected request:
  1. authenticateToken middleware:
     - Extracts token from header
     - Verifies JWT signature and expiry
     - Looks up user from DB
     - Re-resolves permissions fresh from DB
     - Attaches req.user

  2. companyContext middleware:
     - Reads x-company-id header
     - Validates user has access to company
     - Validates company belongs to user's client
     - Attaches req.company

  3. Module guards:
     - requireModule('MODULE') → any permission on module
     - requireModulePermission('MODULE', 'ACTION') → specific action
     - CLIENT_ADMIN / PLATFORM_ADMIN bypass checks
```

### 11.3 Data Isolation

```
Multi-tenant isolation via companyContext middleware:
  - All queries scoped to req.company.id
  - Prisma: where: { companyId: req.company.id }
  - Cross-company access is a security violation
  - PLATFORM_ADMIN can bypass (cross-client queries)

Employee isolation:
  - EMPLOYEE role: queries scoped to own employee record
  - employeeSelf routes: req.user.employeeId filter
```

### 11.4 Audit Logging

```
All state-changing operations logged to AuditLog:
  - userId, userEmail
  - action (CREATE, UPDATE, DELETE, APPROVE, etc.)
  - resource (Employee, PayrollRun, LeaveRecord, etc.)
  - resourceId
  - details (JSON — old/new values diff)
  - ipAddress
  - timestamp
```

### 11.5 CORS & Security Headers

```javascript
helmet()  // Standard security headers
cors({
  origin: ['http://localhost:5173', 'https://payroll.thinkbantu.com', 'tauri://localhost'],
  credentials: true
})

// CSP explicitly null/disabled in desktop mode
```

---

## 12. Performance Requirements

### 12.1 SLAs

| Metric | Target | Measurement |
|--------|--------|-------------|
| API response time (p50) | < 200ms | Server-side metrics |
| API response time (p95) | < 500ms | Server-side metrics |
| API response time (p99) | < 2s | Server-side metrics |
| Payroll run (100 employees) | < 10s | End-to-end |
| Payroll run (500 employees) | < 30s | End-to-end |
| Page load (initial) | < 2s | Lighthouse |
| Page load (subsequent) | < 500ms | Client-side |
| Uptime | 99.5% | External monitoring |
| Biometric punch → record | < 5s | End-to-end |

### 12.2 Caching Strategy

```typescript
// TanStack Query defaults
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,       // 60s before refetch
      retry: 1,                // 1 retry on failure
      refetchOnWindowFocus: false,
      keepPreviousData: true,  // Pagination
    },
  },
});

// Specific cache overrides:
// - /api/employees → 30s stale time (frequently changes)
// - /api/system-settings → 5min stale time (rarely changes)
// - /api/grades → 5min stale time (stable data)
// - /api/payroll/:id/payslips → 2min stale time (processing window)
```

### 12.3 Database Optimization

```
Critical indexes (beyond Prisma defaults):
  - Employee: [companyId, departmentId]
  - Employee: [companyId, employeeCode]
  - PayrollTransaction: [payrollRunId, employeeId]
  - Payslip: [payrollRunId, employeeId]
  - AttendanceLog: [employeeId, punchTime]
  - AttendanceRecord: [employeeId, date]
  - LeaveBalance: [employeeId, year, leavePolicyId]
  - AuditLog: [userId, createdAt]

Connection pooling:
  - Backend v1: pg Pool with max 10 connections
  - Backend v2: Neon serverless (auto-scaling)
```

---

## 13. Testing Strategy

### 13.1 Test Pyramid

```
          ╱╲
         ╱  ╲          E2E (future) — Playwright / TestSprite
        ╱    ╲
       ╱────────╲
      ╱          ╲     Integration (current) — Supertest + test DB
     ╱            ╲
    ╱────────────────╲
   ╱                  ╲  Unit (current) — Vitest
  ╱                    ╲
 ╱────────────────────────╲
```

### 13.2 Current Test Coverage

```bash
# Backend v1 tests
cd backend && npx vitest run

# Test files:
backend/__tests__/
  - taxEngine.test.js         # PAYE, NSSA, AIDS Levy calculations
  - (more to be added)

# Frontend tests
cd frontend && npx vitest run
# jsdom environment, @testing-library/react
```

### 13.3 Testing Requirements

| Area | Tool | Requirement |
|------|------|-------------|
| Tax engine | Vitest | 100% coverage of tax bracket combinations, NSSA thresholds, multi-currency |
| Payroll processing | Supertest + test DB | Full payroll run lifecycle (DRAFT→COMPLETED) with known output |
| API endpoints | Supertest | Every route: 200, 401, 403, 404, 422 |
| RBAC | Integration | All permission combinations, role inheritance |
| Biometric integration | Mock | ZKTeco + Hikvision protocol handlers |
| Frontend components | Vitest + jsdom | Rendering, user interactions, form validation |
| Sync engine | Unit | Queue operations, conflict resolution |

---

## 14. Monitoring & Observability

### 14.1 Error Tracking (Sentry)

```typescript
// Frontend: @sentry/react
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,  // 10% sampling in production
});

// Backend v2: @sentry/cloudflare
// Captures unhandled exceptions, API errors, cron failures
```

### 14.2 Audit Trail

```typescript
// All state changes logged to AuditLog table:
interface AuditEntry {
  userId: string;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'RUN' | 'EXPORT';
  resource: 'Employee' | 'PayrollRun' | 'LeaveRecord' | 'Loan' | ...;
  resourceId: string;
  details: { before: any, after: any };  // JSON diff
  ipAddress: string;
  createdAt: DateTime;
}
```

### 14.3 Health Check

```http
GET /health
→ 200 { status: 'ok' }

// Backend v2 CF Worker:
app.get('/health', (c) => c.json({ status: 'ok' }));
// Used for uptime monitoring
```

### 14.4 Desktop Update Channel

```
Updater endpoint: https://bantu-cloud.onrender.com/api/desktop/updates
  ?target={{target}}          // e.g., darwin, windows
  &arch={{arch}}              // e.g., aarch64, x86_64
  &current_version={{version}}

→ Returns latest version metadata from GitHub Release
→ Tauri updater plugin handles download + install
```

---

## 15. Appendices

### A. Key File Reference

| File | Purpose | Lines |
|------|---------|-------|
| `backend/index.js` | Express entry point, middleware, route registration, cron | 329 |
| `backend/prisma/schema.prisma` | Complete data model (~54 models, ~34 enums) | 1886 |
| `backend/lib/auth.js` | JWT sign/verify, RBAC resolution | — |
| `backend/lib/permissions.js` | Permission checking, legacy bridge | — |
| `backend/lib/companyContext.js` | Multi-tenant scoping middleware | — |
| `backend/lib/taxEngine.js` | PAYE/NSSA/AIDS Levy calculations | 409 |
| `backend/lib/attendanceEngine.js` | Punch pairing, OT calculation | — |
| `backend/lib/hikvisionClient.js` | Hikvision ISAPI integration | — |
| `backend/lib/zktecoClient.js` | ZKTeco TCP/ADMS integration | — |
| `frontend/src/App.tsx` | Route definitions, ~70 lazy pages | — |
| `frontend/src/api/client.ts` | Axios instance with auth interceptors | — |
| `frontend/src/hooks/usePermissions.ts` | Frontend RBAC hook | — |
| `backend-v2/src/index.ts` | CF Worker entry, Hono setup, cron | 247 |
| `desktop/src-tauri/Cargo.toml` | Tauri Rust dependencies | — |

### B. Module ↔ Route File Mapping

| Module | Route Files |
|--------|------------|
| PEOPLE | employees, employeeTransactions, employeeSelf, documents, grades, branches, departments |
| TIME_LEAVE | leave, leavePolicies, leaveBalances, leaveEncashments, shifts, roster, attendance, devices |
| PAYROLL | payroll, payrollCore, payslips, payrollCalendar, payrollInputs, transactionCodes, transactions, bankFiles, payIncrease, backPay, periodEnd |
| COMPLIANCE | taxTables, taxBands, statutoryExports, nssaSettings, statutoryRates, nssaContributions, necTables |
| REPORTS | reports |
| SETTINGS | systemSettings, currencyRates, publicHolidays, workPeriodSettings, backup |
| RECRUITMENT | recruitment |
| PERFORMANCE | performance |
| EXPENSES | expenses |
| ONBOARDING | onboarding |
| TRAINING | training |
| ASSETS | assets |
| SUCCESSION | succession |
| SURVEYS | surveys |
| ANALYTICS | analytics |

### C. Known Technical Debt

| Issue | Impact | Priority | Mitigation |
|-------|--------|----------|------------|
| ZiG rounding artifact (`2,999.99` vs `3,000.00`) | Payslip display | Medium | Fix floating-point math in payroll engine |
| `Working Days Per Period` config required | Pro-rata accuracy | High | Document prominently, add validation |
| Legacy `requirePermission` bridge | Maintenance overhead | Low | Migrate fully to RBAC module guards |
| Backend v1/v2 dual maintenance | Feature parity effort | High | Migrate v1 routes to v2, deprecate v1 |
| No E2E test suite | Regression risk | High | Add Playwright + TestSprite tests |
| Template.db shipping with desktop app | Data freshness | Medium | Add post-install migration step |

### D. Glossary

| Term | Definition |
|------|------------|
| PAYE | Pay As You Earn — Zimbabwe income tax deducted at source |
| NSSA | National Social Security Authority — pension/social security |
| NEC | National Employment Council — industry-specific bargaining council |
| SDF | Skills Development Fund — employer training levy |
| WCIF | Workers Compensation Insurance Fund — workplace injury insurance |
| ZIMDEF | Zimbabwe Manpower Development Fund — skills development |
| ZiG | Zimbabwe Gold — local currency (replaced RTGS) |
| FDS | Fiscal Data Summary — ZIMRA tax averaging method for variable-income employees |
| ISAPI | Integration Security API — Hikvision's HTTP-based device protocol |
| ADMS | Access Door Management System — ZKTeco's web-based management protocol |
| RBAC | Role-Based Access Control |
| TanStack Query | Server state management library (formerly React Query) |
| shadcn/ui | Copy-paste component library built on Radix UI primitives |
