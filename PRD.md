# Product Requirements Document: Bantu Payroll & HR Platform

**Version:** 2.0  
**Status:** Draft  
**Date:** 2026-05-14  
**Author:** AI Agent (Big Pickle)  

---

## 1. Executive Summary

**Bantu** is a full-stack Payroll and Human Resources management SaaS platform designed for the Zimbabwean market. It handles the complete employee lifecycle — hiring, paying, compliance, and offboarding — with native multi-currency support (USD/ZiG), deep local statutory integrations (ZIMRA, NSSA, NEC), biometric attendance tracking, and an RBAC permission system. The platform serves payroll bureaus, SMEs, and enterprises across four subscription tiers.

**Vision:** Become the default payroll and HR operating system for African businesses, starting with Zimbabwe.

---

## 2. Problem Statement & Market Opportunity

### Problems Solved

| Problem | How Bantu Solves It |
|---------|---------------------|
| **Multi-currency payroll complexity** | Per-employee USD/ZiG split percentages, dual-currency payslips and bank files |
| **Statutory compliance burden** | Built-in ZIMRA PAYE, NSSA, NEC, SDF, WCIF, AIDS Levy calculations; IT7/P2/P4A export |
| **Manual attendance-to-payroll pipeline** | Biometric device integration (ZKTeco, Hikvision) with auto-pairing and OT calculation |
| **Spreadsheet-driven HR** | Centralized employee database with document management, leave tracking, and loan management |
| **Multi-entity management** | Client → Company → SubCompany → Branch → Department hierarchy for payroll bureaus |
| **Role-based access fragmentation** | Custom role builder with 15 modules × 7 actions per company |

### Target Market

- **Primary:** Zimbabwean SMEs (25–500 employees) and payroll bureaus
- **Secondary:** HR departments, accounting firms, enterprise HR teams
- **Geographic focus:** Zimbabwe (Phase 1), SADC region (Phase 2)

### Competitive Landscape

- **Direct competitors:** Payit, Nssa Online, Zimra e-filing (manual/partial)
- **Indirect competitors:** Sage 300, QuickBooks (not Zimbabwe-localized)
- **Bantu advantage:** Native ZiG/USD, integrated biometrics, all statutory bodies in one system, modern UX

---

## 3. User Personas

### 3.1 Platform Admin
- **Role:** System operator (Bantu internal)
- **Needs:** Client lifecycle management, license issuance, auditing, global settings
- **Modules:** All — full CRUD across every domain

### 3.2 Client Admin (Payroll Bureau / HR Director)
- **Role:** Business owner who manages companies on behalf of clients
- **Needs:** Company setup, employee management, payroll processing, compliance exports, RBAC role builder
- **Permissions:** Bypasses all module checks — full access to enabled modules

### 3.3 Company User (HR / Payroll Officer / Manager)
- **Role:** Staff with limited, role-based access
- **Needs:** Access specific modules based on job function (e.g., Payroll Officer gets PAYROLL+RUN, HR Manager gets PEOPLE+EDIT+TIME_LEAVE+APPROVE)
- **Permissions:** Custom roles with granular module+action combinations

### 3.4 Employee (Self-Service)
- **Role:** Individual worker
- **Needs:** View payslips, submit leave requests, update profile, view attendance records
- **Permissions:** Read-only self-service scoped to their own data

### 3.5 System Roles Summary

| Role | Type | Access Level |
|------|------|-------------|
| PLATFORM_ADMIN | System | All modules, cross-client |
| CLIENT_ADMIN | System | All enabled modules within client |
| COMPANY_USER | Custom | Granular per role+module+action |
| EMPLOYEE | System | Self-service read-only |

---

## 4. Feature Requirements by Module

### 4.1 Tier 1 — Core HR & Payroll

#### 4.1.1 PEOPLE Module
**Purpose:** Manage the employee master database and organizational structure.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| PPL-01 | Employee CRUD (create, read, update, delete) | P0 | Full lifecycle including termination |
| PPL-02 | Bulk employee import via CSV/Excel | P0 | With validation and error reporting |
| PPL-03 | Organizational hierarchy: Client → Company → SubCompany → Branch → Department | P0 | |
| PPL-04 | Salary grades with min/max rates | P0 | Linked to NEC grade rates |
| PPL-05 | Employee document management | P1 | Contracts, IDs, medical, education |
| PPL-06 | Employee self-service profile | P2 | Limited editable fields |
| PPL-07 | Department headcount reports | P1 | |
| PPL-08 | Employee import template generator | P1 | Download sample CSV |

#### 4.1.2 TIME_LEAVE Module
**Purpose:** Attendance tracking, leave management, and shift scheduling.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| TML-01 | Leave policy configuration per company | P0 | Annual, sick, maternity, paternity, unpaid |
| TML-02 | Automatic monthly leave accrual | P0 | Cron job on 1st of month (00:05) |
| TML-03 | Leave request workflow (submit → approve/reject) | P0 | |
| TML-04 | Leave balance tracking | P0 | Opening + accrued - taken - encashed - forfeited |
| TML-05 | Carry-over limits and max accumulation caps | P0 | |
| TML-06 | Leave encashment workflow (PENDING → APPROVED → PROCESSED) | P1 | |
| TML-07 | Biometric device registration | P0 | IP, port, credentials per device |
| TML-08 | ZKTeco punch integration (TCP/IP pull + ADMS push) | P0 | Port 4370 |
| TML-09 | Hikvision punch integration (ISAPI pull + push) | P0 | HTTP Digest Auth |
| TML-10 | Attendance engine: IN/OUT punch pairing | P0 | Produces daily records |
| TML-11 | Overtime calculation (×1.0, ×1.5, ×2.0 multipliers) | P0 | |
| TML-12 | Shift configuration with break rules | P1 | |
| TML-13 | Roster/Shift assignment per employee | P1 | |
| TML-14 | Manual attendance entry | P1 | For corrections |
| TML-15 | Public holiday management | P1 | |
| TML-16 | Attendance status: PRESENT/ABSENT/HALF_DAY/HOLIDAY/LEAVE | P1 | |

#### 4.1.3 PAYROLL Module
**Purpose:** Full payroll processing engine.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| PRL-01 | Payroll calendar with period management (open/close) | P0 | |
| PRL-02 | Payroll run lifecycle: Preview → Submit → Approve → Process | P0 | |
| PRL-03 | Transaction codes: EARNING/DEDUCTION/BENEFIT types | P0 | |
| PRL-04 | Calculation types: FIXED, PERCENTAGE, FORMULA | P0 | |
| PRL-05 | Conditional rules (grade-based, salary threshold, hours-based) | P0 | With caps |
| PRL-06 | Multi-currency payroll: per-employee USD/ZiG split | P0 | `splitUsdPercent` field |
| PRL-07 | Tax methods: FDS_AVERAGE, FDS_FORECASTING, NON_FDS | P0 | |
| PRL-08 | PAYE tax calculation | P0 | Per ZIMRA bands |
| PRL-09 | AIDS Levy calculation | P0 | Configurable rate |
| PRL-10 | NSSA (employee + employer) calculation | P0 | |
| PRL-11 | NEC levy calculation | P0 | |
| PRL-12 | SDF / WCIF / ZIMDEF deductions | P0 | |
| PRL-13 | Payslip PDF generation with dual-currency breakdown | P0 | HTML-rendered, browser Print→Save as PDF; `?print=1` auto-print param |
| PRL-13a | Medical Aid Credit display | P0 | Shows in Earnings table as informational line, excluded from Running Total |
| PRL-14 | Back pay processing | P1 | |
| PRL-15 | Bulk pay increases | P1 | |
| PRL-16 | Payroll variance reports (run-to-run comparison) | P1 | |
| PRL-17 | Employee loan repayment integration | P1 | Auto-deduct from payslip |

#### 4.1.4 SETTINGS Module
**Purpose:** System configuration and administration.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| SET-01 | System-wide settings (AIDS levy rate, NSSA thresholds, etc.) | P0 | Key-value store |
| SET-02 | Currency rate management (USD/ZiG) | P0 | |
| SET-03 | Public holiday management | P1 | |
| SET-04 | Work period configuration | P1 | "Working days per period" etc. |
| SET-05 | Company-level settings (defaults, preferences) | P1 | |
| SET-06 | Database backup/restore | P2 | |

#### 4.1.5 COMPLIANCE Module
**Purpose:** Statutory and regulatory management.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| CMP-01 | ZIMRA IT7 (P16) annual tax certificates | P0 | |
| CMP-02 | ZIMRA P2 monthly returns | P0 | |
| CMP-03 | NSSA P4A monthly returns | P1 | |
| CMP-04 | Tax table management with effective dates | P0 | |
| CMP-05 | Motor vehicle benefit calculation | P1 | |
| CMP-06 | Tax directive handling | P1 | |

#### 4.1.6 REPORTS Module
**Purpose:** Reporting and data export.

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| RPT-01 | Payslip reports (individual, batch) | P0 | PDF/CSV |
| RPT-02 | Tax reports (ZIMRA format) | P0 | |
| RPT-03 | Leave reports | P1 | |
| RPT-04 | Loan reports | P1 | |
| RPT-05 | Department headcount | P1 | |
| RPT-06 | Journal entries | P1 | |
| RPT-07 | Bank EFT/bulk pay files (CBZ, Stanbic, Fidelity) | P1 | |
| RPT-08 | Pension fund exports | P2 | |
| RPT-09 | Payroll variance analysis | P1 | |
| RPT-10 | Payroll trends | P2 | |
| RPT-11 | NSSA P4A returns | P1 | |

### 4.2 Tier 2 — Extended HR

#### 4.2.1 RECRUITMENT Module
| ID | Requirement | Priority |
|----|-------------|----------|
| REC-01 | Job posting creation and management | P1 |
| REC-02 | Application collection pipeline | P1 |
| REC-03 | Interview scheduling and feedback | P2 |
| REC-04 | Offer letter generation | P2 |

#### 4.2.2 PERFORMANCE Module
| ID | Requirement | Priority |
|----|-------------|----------|
| PRF-01 | Appraisal cycle creation | P2 |
| PRF-02 | KPI/goal setting | P2 |
| PRF-03 | Manager review workflow | P2 |
| PRF-04 | Rating and feedback collection | P2 |

#### 4.2.3 EXPENSES Module
| ID | Requirement | Priority |
|----|-------------|----------|
| EXP-01 | Claim submission | P1 |
| EXP-02 | Approval workflow | P1 |
| EXP-03 | Payroll integration (per diems, fuel) | P1 |

### 4.3 Tier 3 — Workforce Development

#### 4.3.1 ONBOARDING Module
| ID | Requirement | Priority |
|----|-------------|----------|
| OBD-01 | Task checklists for new hires | P2 |
| OBD-02 | Document collection workflow | P2 |
| OBD-03 | Equipment assignment tracking | P2 |

#### 4.3.2 TRAINING Module
| ID | Requirement | Priority |
|----|-------------|----------|
| TRN-01 | Course catalog management | P2 |
| TRN-02 | Certification tracking | P2 |
| TRN-03 | Skills matrix per employee | P2 |

#### 4.3.3 ASSETS Module
| ID | Requirement | Priority |
|----|-------------|----------|
| AST-01 | Asset assignment per employee | P2 |
| AST-02 | Depreciation tracking | P3 |

### 4.4 Tier 4 — Enterprise Intelligence

#### 4.4.1 SUCCESSION Module
| ID | Requirement | Priority |
|----|-------------|----------|
| SUC-01 | Career path planning | P3 |
| SUC-02 | Talent pool identification | P3 |

#### 4.4.2 SURVEYS Module
| ID | Requirement | Priority |
|----|-------------|----------|
| SRV-01 | Engagement survey creation | P3 |
| SRV-02 | Exit interview collection | P3 |

#### 4.4.3 ANALYTICS Module
| ID | Requirement | Priority |
|----|-------------|----------|
| ANL-01 | Headcount forecasting | P3 |
| ANL-02 | Turnover trend analysis | P3 |
| ANL-03 | Workforce BI dashboard | P3 |

---

## 5. Non-Functional Requirements

### 5.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-01 | Payroll run for 500 employees | < 30 seconds |
| NFR-02 | Page load time (initial) | < 2 seconds |
| NFR-03 | API response time (p95) | < 500ms |
| NFR-04 | Concurrent users per client | 50+ |
| NFR-05 | Biometric punch processing latency | < 5 seconds |

### 5.2 Security

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-06 | Authentication | JWT (Bearer) with 24h expiry |
| NFR-07 | Authorization | RBAC with per-request resolution |
| NFR-08 | Data isolation | Multi-tenant via x-company-id middleware |
| NFR-09 | Password hashing | bcrypt |
| NFR-10 | API rate limiting | Configurable per endpoint |
| NFR-11 | Audit logging | All state-changing operations |
| NFR-12 | CORS | Whitelist-only origins |

### 5.3 Reliability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-13 | Uptime (production) | 99.5% |
| NFR-14 | Payroll run atomicity | All-or-nothing per run |
| NFR-15 | Data backup | Daily automated |
| NFR-16 | Error recovery | Graceful degradation with user-facing messages |

### 5.4 Scalability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-17 | Vertical scaling | Support multi-CF Worker architecture |
| NFR-18 | Database | Serverless PostgreSQL (Neon), connection pooling |
| NFR-19 | File storage | Cloudflare R2 for documents |
| NFR-20 | Employee capacity | 10,000+ per client |

### 5.5 Usability

| ID | Requirement | Target |
|----|-------------|--------|
| NFR-21 | Mobile responsiveness | Tablet + mobile views |
| NFR-22 | Offline support (desktop) | SQLite sync engine |
| NFR-23 | Accessibility | WCAG 2.1 AA |
| NFR-24 | Loading states | Skeleton screens for all data tables |

---

## 6. Technical Architecture

### 6.1 System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (React SPA)                   │
│          Vite + TypeScript + TailwindCSS + shadcn/ui      │
│                    Hosted on Vercel                        │
└────────────────────┬────────────────────────────────────┘
                     │ HTTPS / JWT + x-company-id
          ┌──────────┴──────────┐
          ▼                     ▼
┌──────────────────┐  ┌──────────────────┐
│  Backend v1       │  │  Backend v2       │
│  Express (Node.js)│  │  Hono (CF Worker) │
│  CommonJS         │  │  TypeScript/ESM   │
│  Render/Vercel    │  │  Cloudflare       │
└──────┬───────────┘  └──────┬───────────┘
       │                      │
       └──────────┬──────────┘
                  ▼
       ┌──────────────────┐
       │   PostgreSQL      │
       │   (Neon)          │
       │   Prisma ORM      │
       └──────────────────┘
```

### 6.2 Multi-Tenancy Model

```
Platform Admin
  └── Client (payroll bureau / business)
        └── Company
              ├── SubCompany
              │     └── Branch
              └── Branch
                    └── Department
                          └── Employee
```

Enforced via JWT authentication + `x-company-id` header middleware. All queries scoped to the authenticated company.

### 6.3 Data Model (Core Entities)

- **User** — Authentication identity, linked to Role and Employee
- **Client** — Top-level tenant, holds license, subscription, enabled modules
- **Company** — Business entity under Client
- **Employee** — Full record: personal, work, pay, tax fields
- **PayrollRun** — Single payroll execution with status lifecycle
- **Payslip** — Per-employee payroll output with PDF
- **LeavePolicy / LeaveBalance / LeaveRequest** — Leave management
- **AttendanceLog / AttendanceRecord** — Biometric punch data
- **Loan / LoanRepayment** — Employee loan management
- **TransactionCode** — Reusable earning/deduction/benefit definitions
- **Role / RoleModulePermission / UserCompanyRole** — RBAC

### 6.4 RBAC & Permissions

- **4 system roles:** PLATFORM_ADMIN, CLIENT_ADMIN, COMPANY_USER, EMPLOYEE
- **15 modules** across 4 tiers
- **7 actions per module:** VIEW, EDIT, DELETE, APPROVE, EXPORT, RUN, CONFIGURE
- **Custom roles per company** with granular permission sets
- **Module licensing per client** gated by subscription plan
- Permissions embedded in JWT and re-resolved per request

### 6.5 Subscription Tiers

| Plan | Price | Employee Cap | Modules |
|------|-------|--------------|---------|
| Basic | $29/mo | 25 | PEOPLE, TIME_LEAVE, PAYROLL, SETTINGS |
| Standard | $79/mo | 100 | Basic + COMPLIANCE, REPORTS, LOANS, ONBOARDING, EXPENSES |
| Premium | $149/mo | 500 | Standard + multi-company, API, RECRUITMENT, PERFORMANCE, TRAINING, ASSETS |
| Enterprise | Custom | Unlimited | Premium + SUCCESSION, SURVEYS, ANALYTICS, dedicated support |

### 6.6 Desktop Application (Tauri 2.0)

- Native macOS/Windows wrapper around web SPA
- Offline sync engine (SQLite-based operations queue)
- Hardware biometric unlock (TouchID/FaceID)
- Native notifications (payroll approved, leave requests, fraud alerts)
- Auto-update via GitHub Actions pipeline

---

## 7. API Design

### 7.1 Backend v1 (Express)

~80 route files organized by domain under `backend/routes/`. Key patterns:
- `router.use(requireModule('MODULE'))` for module gating
- `requireModulePermission('MODULE', 'ACTION')` for action-level gating
- Legacy bridge via `PERMISSION_TO_RBAC` mapping

### 7.2 Backend v2 (Cloudflare Workers)

12 domain modules composing Hono route groups:
- `auth.domain.ts` — Login, register, token refresh (public)
- `user.domain.ts` — Session, profile (auth-only, no company)
- `employees.domain.ts` — Employee CRUD, import
- `payroll.domain.ts` — Payroll runs, payslips, bank files
- `leave.domain.ts` — Leave policies, requests, balances, accrual
- `loans.domain.ts` — Loan management, repayments
- `attendance.domain.ts` — Biometric devices, punches, records
- `settings.domain.ts` — System and company settings
- `statutory.domain.ts` — ZIMRA, NSSA, NEC exports
- `documents.domain.ts` — File upload/download via R2
- `admin.domain.ts` — Platform admin operations
- `advanced.domain.ts` — Extended HR modules

### 7.3 Scheduled Jobs (Cron)
- **1st of month 00:05:** Leave accrual, system seeding
- **Daily 07:00:** Pending leave request notifications

---

## 8. Frontend Architecture

### 8.1 Tech Stack
- React 19 + TypeScript
- Vite (build tool)
- TailwindCSS v4 + shadcn/ui
- React Router v7
- TanStack Query (server state, 60s stale time, 1 retry)
- React Hook Form + Zod (forms + validation)
- Axios (HTTP client with auth interceptors)

### 8.2 Page Directory

#### Public (Unauthenticated)

| Page | Route | Purpose |
|------|-------|---------|
| Landing | `/` | Marketing site, product overview, sign-up CTA |
| Login | `/login` | Email/password authentication with company-scoped access |
| Register | `/register` | Self-service account creation for new clients |
| Setup | `/setup` | First-time company configuration after registration |
| Accept Invite | `/accept-invite` | Accept user invitation to join an existing company |
| License Expired | `/license-expired` | Notification page when subscription has lapsed |

#### Employee Self-Service

| Page | Route | Purpose | Module |
|------|-------|---------|--------|
| Dashboard | `/employee` | Personal summary: upcoming leave, recent payslips, profile status | PEOPLE, PAYROLL, TIME_LEAVE |
| My Payslips | `/employee/payslips` | View/download personal payslips (historical) | PAYROLL |
| My Profile | `/employee/profile` | View/edit limited personal details (banking, contact, dependants) | PEOPLE |
| My Leave | `/employee/leave` | Submit leave requests, view balance and history | TIME_LEAVE |

#### Client Admin / Company User (Core Operations)

| Page | Route | Purpose | Module |
|------|-------|---------|--------|
| Dashboard | `/dashboard` | KPI overview: employee count, pending leaves, recent payroll runs, alerts | CROSS-MODULE |
| Employees | `/employees` | Employee master list with search, filter, sorting; quick actions | PEOPLE |
| Add Employee | `/employees/new` | Create new employee record (personal, employment, salary, banking) | PEOPLE |
| Edit Employee | `/employees/:id/edit` | Full employee record management | PEOPLE |
| Import Employees | `/employees/import` | Bulk upload CSV/Excel with column mapping, validation, error preview | PEOPLE |
| Payroll Runs | `/payroll` | Payroll calendar: list of past/pending runs, period open/close | PAYROLL |
| New Payroll Run | `/payroll/new` | Configure and initiate a payroll run (period, employees, currency split) | PAYROLL |
| Payroll Detail | `/payroll/:runId` | Run summary: totals, breakdowns, preview → submit → approve → process lifecycle | PAYROLL |
| Payslips | `/payroll/:runId/payslips` | Per-employee payslips within a run: preview, download PDF, send | PAYROLL |
| Leave | `/leave` | Leave requests list with status (pending/approved/rejected) | TIME_LEAVE |
| New Leave | `/leave/new` | Submit leave request for an employee | TIME_LEAVE |
| Loans | `/loans` | Employee loan register with repayment tracking | PAYROLL |
| New Loan | `/loans/new` | Issue a new loan (amount, repayment terms, deduction schedule) | PAYROLL |
| Loan Detail | `/loans/:id` | Loan amortisation schedule, payment history, balance | PAYROLL |
| Reports | `/reports` | 20+ report types: payslips, journals, EFT, tax returns, leave, loans, exports | REPORTS |
| Subscription | `/subscription` | Plan management, billing history, seat count | PLATFORM |
| Licence | `/license` | Current license details, expiry, active user count | PLATFORM |

#### Client Admin Only (Administration)

| Page | Route | Purpose | Module |
|------|-------|---------|--------|
| Org Structure | `/client-admin/structure` | Company hierarchy editor: Branches, Departments, SubCompanies | PEOPLE |
| Settings | `/client-admin/settings` | Company-level defaults: currency, tax methods, payroll preferences | SETTINGS |
| Role Builder | `/client-admin/roles` | Custom RBAC role creation: 15 modules × 7 actions per role | PLATFORM |
| User Management | `/client-admin/users` | Invite/manage company users, assign roles | PLATFORM |

#### Utilities

| Page | Route | Purpose | Module |
|------|-------|---------|--------|
| Utilities Hub | `/utilities` | Overview/index of all utility tools | VARIOUS |
| Transaction Codes | `/utilities/transactions` | Define EARNING/DEDUCTION/BENEFIT codes with calculation rules | PAYROLL |
| Back Pay | `/utilities/back-pay` | Retroactive pay adjustments for previous periods | PAYROLL |
| Import Earnings | `/utilities/import-earnings` | Bulk import one-time earnings/deductions (bonuses, penalties) | PAYROLL |
| Pay Increase | `/utilities/pay-increase` | Mass salary adjustment: % or fixed amount, effective date | PEOPLE |
| Period End | `/utilities/period-end` | Close current payroll period, open next; enforces cut-off | PAYROLL |
| Biometric Devices | `/utilities/devices` | Register/manage ZKTeco/Hikvision devices, test connection | TIME_LEAVE |
| Payroll Calendar | `/utilities/payroll-calendar` | Define pay periods, frequencies, and run schedules | PAYROLL |
| Currency Rates | `/utilities/currency-rates` | Manage USD/ZiG exchange rates with effective dating | SETTINGS |
| Holidays | `/utilities/holidays` | Manage public holiday calendar for attendance/OT rules | TIME_LEAVE |

#### Platform Admin (Bantu Internal)

| Page | Route | Purpose | Module |
|------|-------|---------|--------|
| Admin Dashboard | `/admin` | Global metrics: total clients, users, licenses, system health | PLATFORM |
| Users | `/admin/users` | All users across all clients; search, disable, impersonate | PLATFORM |
| Clients | `/admin/clients` | Client lifecycle: create, suspend, configure, view activity | PLATFORM |
| Licences | `/admin/licenses` | License keys, seat counts, expiry management, provisioning | PLATFORM |
| Roles | `/admin/roles` | Global role templates available to all clients | PLATFORM |
| Audit Logs | `/admin/logs` | System-wide audit trail of state-changing operations | PLATFORM |
| System Settings | `/admin/settings` | Global configuration: tax rates, NSSA thresholds, system defaults | SETTINGS |

### 8.3 Key Components
- `AppShell.tsx` — Main layout with dynamic sidebar nav (filtered by permissions)
- `ProtectedRoute` — Role-based route guard
- `IdleTimerModal` — Session timeout handling
- `ErrorBoundary` — Graceful error recovery

---

## 9. Integration Points

| Integration | Direction | Protocol | Details |
|-------------|-----------|----------|---------|
| ZKTeco Biometric | Inbound | TCP (4370) / ADMS HTTP | Pull and push models |
| Hikvision Biometric | Inbound | ISAPI (HTTP Digest) | Pull and push via `/api/biometric` |
| Stripe | Outbound | REST API | Subscription billing, customer portal |
| Resend | Outbound | REST API | Transactional emails |
| Cloudflare R2 | Outbound | S3-compatible API | File/document storage |
| Bank EFT (CBZ, Stanbic, Fidelity) | Outbound | File export | Payroll bank file generation |

---

## 10. Roadmap & Phases

### Phase 1: Core Payroll & HR (Current — v2.0)
- All Tier 1 modules (PEOPLE, TIME_LEAVE, PAYROLL, COMPLIANCE, REPORTS, SETTINGS)
- Backend v1 (Express) stable
- Backend v2 (CF Workers) in parallel
- Biometric device integration
- RBAC system with custom role builder
- Subscription and licensing
- Employee self-service portal

### Phase 2: Extended HR (Next)
- Tier 2 modules (RECRUITMENT, PERFORMANCE, EXPENSES)
- Tier 3 modules (ONBOARDING, TRAINING, ASSETS)
- Advanced reporting suite
- Mobile app (React Native)
- API marketplace for third-party integrations

### Phase 3: Desktop & Intelligence
- Tauri desktop app with offline sync
- Tier 4 modules (SUCCESSION, SURVEYS, ANALYTICS)
- AI-powered insights (payroll anomalies, turnover prediction)
- SADC regional expansion (Zambia, Botswana, South Africa)
- Real-time payroll processing

### Phase 4: Platform Ecosystem
- Open API for third-party developers
- Marketplace for payroll add-ons
- Multi-country payroll engine
- Enterprise-grade SSO (SAML/OIDC)
- Advanced BI with custom dashboards

---

## 11. Success Metrics

### 11.1 Business Metrics

| Metric | Current Baseline | Target (12 mo) |
|--------|-----------------|----------------|
| Active clients | TBD | 200+ |
| Employees managed | TBD | 25,000+ |
| Monthly payroll volume | TBD | $10M+ |
| Subscription revenue | TBD | $200K+ ARR |
| Client retention | TBD | 95%+ |
| NPS score | TBD | 50+ |

### 11.2 Technical Metrics

| Metric | Target |
|--------|--------|
| Payroll run completion rate | 99.9% |
| Biometric punch capture rate | 99.5% |
| API uptime | 99.5% |
| Page load time (p95) | < 2s |
| Payroll run time (500 emp) | < 30s |
| Bug response time | < 4h (P0), < 24h (P1) |

---

## 12. Constraints & Risks

### Constraints
- **Geographic specificity:** Zimbabwe tax and labor laws (must stay current with ZIMRA/NSSA changes)
- **Multi-currency:** ZiG volatility requires frequent rate updates
- **Biometric hardware:** Must support multiple vendor protocols; some devices may have limited API capabilities
- **Internet reliability:** Offline capability important for desktop app
- **Regulatory compliance:** Data sovereignty, labor law adherence

### Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| ZIMRA tax table changes | High | Configurable tax bands, rapid patch capability |
| Currency volatility | Medium | Daily rate updates, real-time ZiG/USD feed |
| Biometric device incompatibility | Medium | Abstraction layer per vendor, push model preferred |
| Data loss during payroll | Critical | Atomic transactions, run rollback capability |
| Security breach | Critical | RBAC, audit logging, encryption at rest, CORS hardening |
| Subscription churn | High | Flexible tiering, annual discounts, feature gating |

---

## 13. Glossary

| Term | Definition |
|------|------------|
| PAYE | Pay As You Earn — Zimbabwe income tax |
| NSSA | National Social Security Authority |
| NEC | National Employment Council |
| SDF | Skills Development Fund |
| WCIF | Workers Compensation Insurance Fund |
| ZIMDEF | Zimbabwe Manpower Development Fund |
| ZiG | Zimbabwe Gold — local currency |
| FDS | Fiscal Data Summary — tax averaging method |
| ISAPI | Integration Security API — Hikvision protocol |
| ADMS | Access Door Management System — ZKTeco protocol |
| RBAC | Role-Based Access Control |
| IT7 / P16 | Annual tax certificate (equivalent) |
| P2 | Monthly ZIMRA tax return |

---

## 14. Appendices

### A. Reference Documents
- `docs/RBAC_ARCHITECTURE.md` — Full RBAC design
- `docs/split-module-architecture.md` — Module licensing design
- `desktop.md` — Desktop vision document
- `frontend/System.md` — Platform system documentation
- `AGENTS.md` — 3-layer architecture for AI agents
- `memory.md` — Persistent agent context

### B. Known Issues
- ZiG basic salary may display rounding artifacts (e.g., `2,999.99` vs `3,000.00`) due to floating-point math in payroll engine
- "Working Days Per Period" configuration is critical for pro-rata calculations
- Neon/Prisma WebSocket adapter may throw "memory access out of bounds" on CF Workers with `compatibility_date` older than `2025-01-01` — fixed by updating compat date

### C. File Organization
```
Bantu/
├── frontend/           # React SPA
├── backend/            # Express API (v1)
├── backend-v2/         # Cloudflare Workers API (v2)
├── desktop/            # Tauri 2.0 native app
├── directives/         # AI agent SOPs (Markdown)
├── execution/          # Deterministic Python scripts
├── docs/               # Architecture & documentation
├── scripts/            # Build & utility scripts
└── .tmp/               # Intermediate processing files
```
