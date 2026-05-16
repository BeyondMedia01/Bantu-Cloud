# Rebuild Bantu Payroll & HR Platform

Build a full-stack Payroll and Human Resources management SaaS platform for the Zimbabwean market. Handle the complete employee lifecycle — hiring, paying, compliance, and offboarding — with native multi-currency support (USD/ZiG), local statutory integrations (ZIMRA, NSSA, NEC), biometric attendance tracking, and an RBAC permission system.

**Target users:** Payroll bureaus, SMEs (25–500 employees), enterprise HR teams.

**Stack:** TanStack Start (React + TanStack Router + server functions) + Supabase (PostgreSQL + Auth + Storage + Edge Functions) + TailwindCSS v4 + shadcn/ui. Translate all concepts below into this stack — the spec describes what to build, not how to build it on a specific stack.

---

## Multi-Tenancy Model

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

All queries scoped to authenticated company. A user can belong to multiple companies via `user_company_roles` — the sidebar has a company switcher dropdown to switch active context.

---

## Database Schema

### Core Tables

**clients**
- id (uuid, pk)
- name (text)
- enabled_modules (text[] — array of AppModule values)
- subscription_tier (enum: basic | standard | premium | enterprise)
- is_active (boolean, default true)
- created_at (timestamptz)

**companies**
- id (uuid, pk)
- client_id (uuid → clients)
- name (text)
- parent_id (uuid, self-ref for SubCompany)
- created_at

**branches**
- id (uuid, pk)
- company_id (uuid → companies)
- name (text)

**departments**
- id (uuid, pk)
- branch_id (uuid → branches)
- name (text)

**employees**
- id (uuid, pk)
- company_id (uuid → companies)
- department_id (uuid → departments, nullable)
- employee_number (text)
- first_name, last_name (text)
- national_id (text, nullable — Zimbabwe national ID)
- date_of_birth (date, nullable)
- gender (enum: male | female, nullable)
- marital_status (enum: married | single | divorced | widowed, nullable)
- job_title (text, nullable)
- grade_id (uuid → grades, nullable)
- employment_type (enum: permanent | contract | part_time | casual, nullable)
- date_joined (date, nullable)
- date_terminated (date, nullable)
- status (enum: active | terminated | suspended)
- currency (enum: usd | zig | mixed, nullable)
- split_usd_percent (numeric(5,2), nullable — 0–100)
- basic_salary (numeric(12,2), nullable)
- basic_salary_zig (numeric(12,2), nullable)
- banking_name, banking_account, banking_branch (text, nullable)
- user_id (uuid → auth.users, nullable — links to self-service account)
- created_at, updated_at

**grades** (salary grade bands)
- id (uuid, pk)
- company_id (uuid → companies)
- name (text)
- min_salary, max_salary (numeric(12,2))
- nec_grade (text, nullable — links to NEC contribution table)

**transaction_codes** (earning/deduction/benefit definitions)
- id (uuid, pk)
- company_id (uuid → companies)
- code (text — e.g. "BONUS", "PAYE", "NSSA")
- description (text)
- type (enum: earning | deduction | benefit)
- calc_type (enum: fixed | percentage | formula)
- formula (text, nullable — JS expression for calc_type=formula)
- is_active (boolean, default true)
- @@unique(company_id, code)

**transaction_code_rules** (conditional rules on codes)
- id (uuid, pk)
- transaction_code_id (uuid → transaction_codes)
- condition (jsonb — e.g. `{"field": "grade", "op": "gte", "value": "A"}`)
- cap_amount (numeric(12,2), nullable)
- cap_amount_zig (numeric(12,2), nullable)

**payroll_calendars**
- id (uuid, pk)
- company_id (uuid → companies)
- period_start, period_end (date)
- frequency (enum: monthly | fortnightly | weekly)
- is_open (boolean)

**payroll_runs**
- id (uuid, pk)
- company_id (uuid → companies)
- period_start, period_end (date)
- status (enum: preview | submitted | approved | processed)
- currency (enum: usd | zig | mixed, nullable — null = company default)
- processed_at (timestamptz, nullable)
- processed_by (uuid → users, nullable)
- created_at

**payslips**
- id (uuid, pk)
- payroll_run_id (uuid → payroll_runs)
- employee_id (uuid → employees)
- gross_pay, gross_pay_zig (numeric(12,2), zig nullable)
- total_deductions, total_deductions_zig (numeric(12,2), zig nullable)
- net_pay, net_pay_zig (numeric(12,2), zig nullable)
- paye, nssa, nec, aids_levy (numeric(12,2))
- pdf_url (text, nullable)
- created_at

**payslip_line_items**
- id (uuid, pk)
- payslip_id (uuid → payslips)
- code (text)
- description (text)
- type (enum: earning | deduction | benefit)
- amount, amount_zig (numeric(12,2), zig nullable)
- tax_credit (boolean, default false — used for Medical Aid Credit)

**employee_transactions** (per-employee salary structure)
- id (uuid, pk)
- employee_id (uuid → employees)
- transaction_code_id (uuid → transaction_codes)
- amount, amount_zig (numeric(12,2), nullable)
- effective_from (date)
- effective_to (date, nullable)

**payroll_inputs** (recurring/periodic adjustments)
- id (uuid, pk)
- company_id (uuid → companies)
- employee_id (uuid → employees)
- transaction_code_id (uuid → transaction_codes)
- amount, amount_zig (numeric(12,2))
- period_id (uuid → payroll_calendars, nullable)

### Leave Management

**leave_policies**
- id (uuid, pk)
- company_id (uuid → companies)
- name (text)
- type (enum: annual | sick | maternity | paternity | unpaid)
- days_per_annum (int)
- carry_over_max (int, default 0)
- max_accumulation (int, nullable)

**leave_balances**
- id (uuid, pk)
- employee_id (uuid → employees)
- policy_id (uuid → leave_policies)
- opening (numeric(8,2))
- accrued (numeric(8,2), default 0)
- taken (numeric(8,2), default 0)
- encashed (numeric(8,2), default 0)
- forfeited (numeric(8,2), default 0)
- @@unique(employee_id, policy_id)

**leave_requests**
- id (uuid, pk)
- employee_id (uuid → employees)
- policy_id (uuid → leave_policies)
- start_date, end_date (date)
- days (numeric(5,1))
- status (enum: pending | approved | rejected | cancelled)
- approved_by (uuid → users, nullable)
- notes (text, nullable)

**leave_encashments**
- id (uuid, pk)
- employee_id (uuid → employees)
- policy_id (uuid → leave_policies)
- days (numeric(5,1))
- amount (numeric(12,2))
- status (enum: pending | approved | processed)
- processed_in_run_id (uuid → payroll_runs, nullable)

### Attendance & Biometrics

**attendance_devices**
- id (uuid, pk)
- company_id (uuid → companies)
- name (text)
- vendor (enum: zkteco | hikvision)
- ip_address, port, username, password (text)
- is_active (boolean, default true)

**attendance_logs** (raw punches from devices)
- id (uuid, pk)
- device_id (uuid → attendance_devices)
- employee_number (text)
- punch_time (timestamptz)
- direction (text, nullable — in | out)
- raw_data (jsonb, nullable)
- synced_by (text — "agent" | "manual")

**attendance_records** (computed daily records)
- id (uuid, pk)
- employee_id (uuid → employees)
- date (date)
- clock_in, clock_out (timestamptz, nullable)
- status (enum: present | absent | half_day | holiday | leave)
- overtime_min (int, default 0)
- @@unique(employee_id, date)

### Loans

**loans**
- id (uuid, pk)
- employee_id (uuid → employees)
- amount (numeric(12,2))
- installment (numeric(12,2) — deduction per payslip)
- total_paid (numeric(12,2), default 0)
- balance (numeric(12,2))
- status (enum: active | paid | written_off)
- issued_at (date)

**loan_repayments**
- id (uuid, pk)
- loan_id (uuid → loans)
- payslip_id (uuid → payslips, nullable)
- amount (numeric(12,2))
- paid_at (timestamptz)

### RBAC

**roles**
- id (uuid, pk)
- company_id (uuid → companies)
- name (text)
- description (text, nullable)
- is_active (boolean, default true)
- @@unique(company_id, name)

**role_module_permissions**
- id (uuid, pk)
- role_id (uuid → roles, cascade delete)
- module (app_module enum)
- actions (text[] — array of module_action values)
- @@unique(role_id, module)

**user_company_roles**
- id (uuid, pk)
- user_id (uuid → auth.users)
- company_id (uuid → companies)
- role_id (uuid → roles)
- @@unique(user_id, company_id)

**invites**
- id (uuid, pk)
- company_id (uuid → companies)
- email (text)
- role_id (uuid → roles)
- token (text, unique)
- expires_at (timestamptz)
- accepted_at (timestamptz, nullable)

### Audit & Compliance

**audit_logs**
- id (uuid, pk)
- company_id (uuid → companies, nullable — null for platform-level)
- user_id (uuid → auth.users)
- action (text — e.g. "payroll.process", "employee.create")
- entity_type (text — e.g. "PayrollRun", "Employee")
- entity_id (text, nullable)
- details (jsonb, nullable — before/after diff)
- ip_address (text, nullable)
- created_at (timestamptz)

### Platform & Billing

**license_tokens**
- id (uuid, pk)
- client_id (uuid → clients)
- key (text, unique)
- seat_limit (int)
- expires_at (date)
- is_active (boolean, default true)

**subscriptions**
- id (uuid, pk)
- client_id (uuid → clients)
- provider (text — "paynow" | "paddle" | "manual")
- provider_subscription_id (text, nullable)
- status (enum: active | past_due | cancelled | expired)
- current_period_start, current_period_end (timestamptz)
- created_at

**system_settings**
- id (uuid, pk)
- key (text)
- value (jsonb)
- updated_at (timestamptz)
- @@unique(key)

**currency_rates**
- id (uuid, pk)
- from_currency (enum: usd | zig)
- to_currency (enum: usd | zig)
- rate (numeric(12,4))
- effective_date (date)
- source (text, default "manual" — future: "rbz")

**public_holidays**
- id (uuid, pk)
- company_id (uuid → companies)
- name (text)
- date (date)
- is_recurring (boolean, default false)
- @@unique(company_id, date)

### Enums

```
user_role:        platform_admin | client_admin | hr_manager | payroll_officer | employee
app_module:       people | time_leave | payroll | compliance | reports | settings | recruitment | performance | expenses | onboarding | training | assets | succession | surveys | analytics
module_action:    view | edit | delete | approve | export | run | configure
currency:         usd | zig | mixed
payroll_status:   preview | submitted | approved | processed
line_item_type:   earning | deduction | benefit
calc_type:        fixed | percentage | formula
leave_type:       annual | sick | maternity | paternity | unpaid
leave_status:     pending | approved | rejected | cancelled
employee_status:  active | terminated | suspended
attendance_status: present | absent | half_day | holiday | leave
device_vendor:    zkteco | hikvision
loan_status:      active | paid | written_off
subscription_status: active | past_due | cancelled | expired
employment_type:  permanent | contract | part_time | casual
gender:           male | female
marital_status:   married | single | divorced | widowed
```

---

## Auth & User Roles

### Auth Provider
Use **Supabase Auth** (email/password built-in). Store additional role data in `auth.users` metadata + `public.user_profiles` table.

**user_profiles table:**
- id (uuid, pk → auth.users)
- role (user_role enum)
- name (text)
- is_active (boolean, default true)
- preferences (jsonb, nullable)

### Role Model

| Role | System | Access Level |
|------|--------|-------------|
| `platform_admin` | Bantu internal | All clients, all modules, supersedes all checks |
| `client_admin` | Client owner | All enabled modules for their client, permission bypass |
| `hr_manager` | Company user | Granular module+action permissions via custom roles |
| `payroll_officer` | Company user | Granular module+action permissions via custom roles |
| `employee` | Self-service | Employee pages only (payslips, leave, profile, attendance) |

A user's role is stored in their profile. `platform_admin` and `client_admin` skip granular permission checks. `hr_manager`, `payroll_officer`, and `employee` are resolved through `user_company_roles` → `role_module_permissions`.

---

## Pages

All route paths and page names. Build exactly these.

### Public (Unauthenticated)
| Page | Route | Purpose |
|------|-------|---------|
| Landing | `/` | Marketing, sign-up CTA |
| Login | `/login` | Supabase Auth sign-in |
| Register | `/register` | Self-service account creation |
| Trial Signup | `/trial-signup` | 14-day free trial |
| Setup | `/setup` | First-time company config after signup |
| Accept Invite | `/accept-invite` | Join existing company via invite token |
| Forgot Password | `/forgot-password` | Reset password flow |
| Reset Password | `/reset-password` | Set new password via token |
| License Expired | `/license-expired` | Notice when subscription lapsed |

### Employee Self-Service
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/employee` | Personal KPI summary, upcoming leave, recent payslips |
| My Payslips | `/employee/payslips` | View/download personal payslips |
| My Profile | `/employee/profile` | Edit limited personal details |
| My Leave | `/employee/leave` | Submit leave request, view balance + history |
| My Attendance | `/employee/attendance` | View personal attendance records |
| My Documents | `/employee/documents` | View personal documents uploaded by HR |

### Client Admin / Company User (Core)
| Page | Route | Purpose |
|------|-------|---------|
| Dashboard | `/dashboard` | Company KPI: headcount, pending leaves, recent payroll runs, alerts |
| Employees | `/employees` | Employee list with search, filter, sort, bulk actions |
| Add Employee | `/employees/new` | Create employee (personal, employment, salary, banking) |
| Edit Employee | `/employees/:id/edit` | Full employee record management |
| Import Employees | `/employees/import` | Bulk CSV upload with column mapping, validation preview |
| Payroll Runs | `/payroll` | Payroll calendar showing past/pending runs, period open/close |
| New Payroll Run | `/payroll/new` | Choose period, select employees, configure currency, create run |
| Payroll Detail | `/payroll/:runId` | Run totals, employee breakdown, lifecycle state machine |
| Payslips | `/payroll/:runId/payslips` | Per-employee payslip list, preview HTML, download PDF, send email |
| Leave | `/leave` | All leave requests with status filter |
| New Leave | `/leave/new` | Submit leave for an employee |
| Loans | `/loans` | Employee loan register with repayment tracking |
| New Loan | `/loans/new` | Issue loan: amount, installment, repayment schedule |
| Loan Detail | `/loans/:id` | Amortisation schedule, payment history, current balance |
| Reports | `/reports` | All report types, date range picker, format selector |
| Subscription | `/subscription` | Plan details, billing history, seat count, upgrade CTA |
| Licence | `/license` | Current license key, expiry date, active seats/total |

### Client Admin Only
| Page | Route | Purpose |
|------|-------|---------|
| Org Structure | `/client-admin/structure` | Visual hierarchy editor (branch/department tree) |
| Settings | `/client-admin/settings` | Company defaults: currency, tax method, payroll preferences |
| Role Builder | `/client-admin/roles` | Create/edit/delete custom roles: 15 modules × 7 actions per role |
| User Management | `/client-admin/users` | View users, invite new, assign roles, revoke access |

### Utilities
| Page | Route | Purpose |
|------|-------|---------|
| Utilities Hub | `/utilities` | Card grid of all utility tools |
| Transaction Codes | `/utilities/transactions` | CRUD transaction codes, configure calc types and rules |
| Back Pay | `/utilites/back-pay` | Select employee, period, amount — adjusts next payroll run |
| Import Earnings | `/utilities/import-earnings` | Upload CSV of one-time earnings/deductions (bonuses, penalties) |
| Pay Increase | `/utilities/pay-increase` | Mass salary change: filter employees, set % or fixed, effective date |
| Period End | `/utilities/period-end` | Close current period, validate all runs processed, open next |
| Biometric Devices | `/utilities/devices` | Register/manage ZKTeco/Hikvision devices, test connection |
| Payroll Calendar | `/utilities/payroll-calendar` | Define periods (monthly/fortnightly/weekly), auto-generate dates |
| Currency Rates | `/utilities/currency-rates` | Manual USD/ZiG rate entry with effective dating |
| Holidays | `/utilities/holidays` | Manage public holidays (used for attendance OT rules) |

### Platform Admin (Bantu Internal)
| Page | Route | Purpose |
|------|-------|---------|
| Admin Dashboard | `/admin` | Global metrics: total clients, users, active licenses, revenue |
| Users | `/admin/users` | All users, search, disable, view activity |
| Clients | `/admin/clients` | Client lifecycle: create, suspend, configure modules |
| Licences | `/admin/licenses` | Generate license keys, set seat limits, manage expiry |
| Roles | `/admin/roles` | Global role templates available to all clients |
| Audit Logs | `/admin/logs` | System-wide searchable audit trail with filters |
| System Settings | `/admin/settings` | Default tax rates, NSSA thresholds, system-wide config |

---

## Module & Sidebar Design

### 15 Modules in 4 Tiers

**Tier 1 (Core — all plans):** PEOPLE, TIME_LEAVE, PAYROLL, COMPLIANCE, REPORTS, SETTINGS
**Tier 2 (Standard+):** RECRUITMENT, PERFORMANCE, EXPENSES
**Tier 3 (Premium+):** ONBOARDING, TRAINING, ASSETS
**Tier 4 (Enterprise):** SUCCESSION, SURVEYS, ANALYTICS

### 7 Actions
`VIEW`, `EDIT`, `DELETE`, `APPROVE`, `EXPORT`, `RUN`, `CONFIGURE`

### 3-Layer Access

1. **Subscription licensing** — client's `enabled_modules` column determines paid modules
2. **Role bypass** — `platform_admin` sees everything; `client_admin` sees all enabled modules without individual perm checks
3. **Granular perms** — `hr_manager` / `payroll_officer` resolve through `role_module_permissions` table

Implementation:
```typescript
function can(module, action?) {
  if (user.role === 'platform_admin') return true
  if (user.role === 'client_admin') return enabledModules.includes(module)
  if (!enabledModules.includes(module)) return false
  if (!action) return !!permissions[module]
  return permissions[module]?.includes(action)
}
```

### Sidebar Structure

**Company user layout** (grouped, module-filtered):
```
Dashboard                                          [flat link]
▼ People          → Employees, Grades, Company Structure, Recruitment, Onboarding, Succession
▼ Time & Leave    → Leave, Shifts & Roster, Attendance
▼ Payroll & Finance → Payroll, Payslip Input, Loans, Expenses, Assets
▼ Performance     → Performance, Training, Surveys
▼ Insights        → Reports, Analytics
▼ Settings        → Utilities, Settings
─── Administration ───                              [CLIENT_ADMIN only]
  Companies, Roles, Team Members, Subscription
```

**Employee layout** (flat links): Dashboard, Payslips, Leave, Attendance, Documents, Profile

**Platform admin layout** (flat links): Dashboard, Users, Clients, Licenses, Settings, Audit Logs

Groups are collapsible (persisted to localStorage). Group containing active route auto-expands. Items filtered by `can(module)`. Empty groups removed.

**Company switcher** — dropdown at top of sidebar showing all companies the user belongs to. Switching re-fetches all data scoped to new company.

---

## Feature Requirements

### PEOPLE Module
- Employee CRUD (create, read, update, delete, terminate)
- Bulk CSV import: columns = employee_number, first_name, last_name, national_id, date_of_birth, gender, marital_status, job_title, employment_type, date_joined, basic_salary, basic_salary_zig, currency, split_usd_percent, banking_name, banking_account, banking_branch, department
- Downloadable blank CSV template matching the import columns
- Org hierarchy tree editor (branch/department CRUD, re-parenting)
- Salary grade bands with NEC grade links
- Employee document upload (contract, IDs, medical, education — stored in Supabase Storage, bucket: `employee-documents`)
- Employee self-service profile (limited edit: phone, address, emergency contact, banking)
- Mass pay increase: filter by department/grade/employment_type, set % or fixed amount, preview affected employees, apply with effective date

### TIME_LEAVE Module
- Leave policy CRUD per company (annual, sick, maternity, paternity, unpaid)
- Automatic monthly leave accrual: `pg_cron` on 1st of month at 00:05, for each employee update `leave_balances.accrued += policy.days_per_annum / 12`
- Leave request submit → approve/reject workflow (notifications sent on status change)
- Leave balance visible on employee profile and leave request form (opening + accrued - taken - encashed - forfeited)
- Carry-over limits enforced on balance calculation (max carried forward = policy.carry_over_max)
- Leave encashment: HR initiates, goes through PENDING→APPROVED→PROCESSED workflow (PROCESSED links to a payroll deduction)
- Biometric device CRUD: ZKTeco (TCP/IP port 4370) and Hikvision (ISAPI HTTP Digest Auth)
- **IMPORTANT:** Biometric device communication cannot run in serverless. Must be handled by an **on-prem agent** (desktop app or Docker container) that polls devices and pushes punches to the API at `/api/attendance/punch`. Design the API for this: devices register via API, agent authenticates, agent pushes `AttendanceLog` records.
- Attendance engine: receive raw punches → pair IN/OUT by employee+date → produce `AttendanceRecord` (clock_in, clock_out, status, overtime_min)
- Overtime: if clock_out > shift_end + grace_period, calculate OT minutes. Multiplier tiers: ×1.0 (regular OT), ×1.5 (after 8hrs), ×2.0 (public holiday)
- Shift CRUD with break rules, assign to employees
- Public holiday calendar (holidays override OT multipliers to ×2.0)
- Manual attendance entry for corrections (admin override)

### PAYROLL Module
- Payroll calendar: define periods with open/close — closed periods block new runs
- Payroll run lifecycle as a state machine:
  - `PREVIEW`: creates draft payslips, no mutations allowed to source data
  - `SUBMITTED`: locks the run for review, no further edits to payroll inputs
  - `APPROVED`: authorizes for processing, requires different user than submitter
  - `PROCESSED`: final — generates PDFs, updates leave balances, records loan repayments, decrements balances
- Transaction codes: EARNING (adds to gross), DEDUCTION (subtracts from gross), BENEFIT (non-cash, informational)
- Calculation types: FIXED (amount), PERCENTAGE (`{ base: "basic" | "gross", pct: number }`), FORMULA (e.g. `max(0, basic * 0.05 - 100)`)
- Conditional rules: `{ field: "grade_id" | "salary" | "hours", op: "gte" | "lte" | "eq", value: any, cap: { amount, amount_zig } }`
- Multi-currency: per-employee `split_usd_percent` (0 = 100% ZiG, 100 = 100% USD). Run currency determines default.
- **Tax methods:**
  - **NON_FDS** (Non-Free-of-Deed-Standard, simple): PAYE = taxableIncome × topMarginalRate — cumulativeSubtractions. Simplest, no YTD averaging.
  - **FDS_AVERAGE** (Free-of-Deed-Standard Average): Calculate cumulative tax to date, subtract tax already paid. Formula: `totalTax = Σ(bracket_rate × bracket_portion for each bracket) over YTD cumulative income × periods.periodsRemaining ÷ periods.total`. Prevents spikes from bonuses.
  - **FDS_FORECASTING**: Project annualized taxable income from YTD + remaining periods, calculate annual tax, divide back to current period. More accurate for variable pay.

**Tax calculation order (CZIMF — Consolidated Zimbabwe Integrated Model Framework):**
1. Compute gross pay: basic salary + sum of all EARNING line items + BENEFIT cash equivalents
2. Split by currency if mixed run (USD portion / ZiG portion)
3. Apply NSSA employee deduction: lesser of (gross × nssa_rate) and nssa_cap — separate for USD/ZiG
4. Apply Pension/other tax-exempt deductions (from transaction codes flagged `taxExempt: true`)
5. Taxable income = gross — NSSA — pension — taxExempt deductions
6. Apply PAYE via selected tax method against ZIMRA bands (separate USD and ZiG band schedules)
7. AIDS Levy = PAYE × aids_levy_rate (default 3%, configurable in system_settings)
8. Apply NEC levy (from NEC grade table, fixed per grade per month)
9. SDF / WCIF / ZIMDEF deductions (configured via transaction codes, percentage-based)
10. Other non-tax deductions: loan repayments, savings, advances, garnishees
11. Medical Aid Credit: displayed as EARNING line item with `taxCredit: true` — shown in payslip earnings list but excluded from running totals
12. Net pay each currency = gross — total_deductions

**ZIMRA PAYE bands (seed values, configurable):**
```
USD bands (2025/26 FY):
  0 – 500       → 0%
  501 – 1,000   → 20%
  1,001 – 3,000 → 25%
  3,001 – 6,000 → 30%
  6,001 – 12,000→ 35%
  12,001+       → 40%

ZiG bands (2025/26 FY):
  0 – 750       → 0%
  751 – 1,500   → 20%
  1,501 – 4,500 → 25%
  4,501 – 9,000 → 30%
  9,001 – 18,000→ 35%
  18,001+       → 40%
```
Store in `tax_tables` with effective_from date. Current FY bands are the default seed.

**NSSA:** employee contribution = lesser of (gross × 0.045, ZiW 700/month equivalent). Employer = same. Cap stored in `system_settings` key `nssa_cap`.

**NEC levy:** per NEC grade, monthly flat rate. Store in `nec_tables` with foreign key link from `grades.nec_grade`.

- Dual-currency payslip PDF:
  - **For interactive/browser use:** Server-rendered HTML opened in new tab, user clicks browser Print→Save as PDF (`?print=1` triggers `window.print()`)
  - **For batch/scheduled/email:** Use a server-side HTML→PDF renderer (e.g., a Supabase Edge Function running Puppeteer/chromium or a dedicated PDF microservice). This is required for: bulk payslip batch export, email attachments, ZIMRA IT7 certificates.
- Medical Aid Credit: flagged `taxCredit: true` on the line item. Render in Earnings list on payslip but exclude from all running totals (gross, deductions, net).
- Employee loan repayment: on PROCESSED run, for each employee with active loan, create loan deduction line item, update `loan_repayments`, decrement `loan.balance`. If balance reaches 0, set `loan.status = 'paid'`.
- Back pay: create an off-cycle payroll run linked to a past period. Retroactively calculated at current rates.
- Pay increase utility (see PEOPLE section above).

### COMPLIANCE Module
- ZIMRA IT7 (P16): annual tax certificate per employee — YTD earnings, PAYE, AIDS Levy. Format: HTML→PDF (server-rendered).
- ZIMRA P2: monthly employer return — aggregate PAYE, AIDS Levy, total employees. CSV/PDF export.
- NSSA P4A: monthly NSSA return — employee name, national_id, NSSA number, gross earnings, employee/employer contributions. CSV.
- Tax tables CRUD with `effective_from` dates — system uses nearest table ≤ run period end.
- Motor vehicle benefit: formula = `(cost × prescribed_rate × months_used) / 12`. Configurable rate in `system_settings`.
- Tax directives: store per employee, override normal PAYE calculation (replaces calculated PAYE with directive amount).

### REPORTS Module
Exact 20 report types. Build these:

| # | Report | Output Formats | Purpose |
|---|--------|---------------|---------|
| 1 | Payslip Batch | HTML→PDF, CSV | Per-employee payslips for a run |
| 2 | Payslip Summary | HTML→PDF | One-page totals per employee |
| 3 | Cash Summary | CSV | Gross, deductions, net per currency |
| 4 | Total Journal | HTML→PDF, CSV | Debit/credit accounting entries |
| 5 | EFT Export (CBZ) | CSV | CBZ bank file format |
| 6 | EFT Export (Stanbic) | CSV | Stanbic bank file format |
| 7 | EFT Export (Fidelity) | CSV | Fidelity bank file format |
| 8 | ZIMRA P2 Return | CSV | Monthly employer PAYE return |
| 9 | ZIMRA IT7 Cert | HTML→PDF | Annual per-employee tax certificate |
| 10 | NSSA P4A Return | CSV | Monthly NSSA schedule |
| 11 | Pension Export | CSV | Pension fund contribution schedule |
| 12 | Leave Report | CSV | All leave taken in period |
| 13 | Leave Balances | CSV | Current leave balances snapshot |
| 14 | Loan Report | CSV | Loan register + repayment status |
| 15 | Overtime Report | HTML→PDF, CSV | OT hours and cost per employee |
| 16 | Medical Aid Report | HTML→PDF, CSV | Medical aid contributions |
| 17 | Department Headcount | CSV | Employee count by department |
| 18 | Payroll Variance | CSV | Run-to-run comparison of totals |
| 19 | Payroll Trends | CSV | Multi-run trend (3, 6, 12 months) |
| 20 | Bank Summary | CSV | Net pay per employee for bank upload |

All reports take `company_id`, `payroll_run_id` (or date range), and `format` parameter.

**EFT/bank file formats** — these are industry-specific CSV layouts that each bank requires. Implement with the format exported as a CSV with the column layout matching each bank's specification. Accept that column layout may need adjustment per bank. Mark this in the UI as "Beta — verify format before upload."

### SETTINGS Module
- System settings key-value store (`system_settings` table)
- Currency rate management: manual entry (USD→ZiG, effective dating). Future: RBZ interbank rate feed via cron job.
- Public holiday CRUD
- Work period configuration: "working days per period" (default 22) — used for pro-rata calculations
- Company-level defaults: default currency, default tax method, default NSSA/NEC settings
- Database backup/restore: desktop only, not applicable to cloud

### PLATFORM (Administration)
- Client lifecycle: create client → assign license → configure enabled modules → company auto-created
- License key generation: UUID-based, stored in `license_tokens` with seat_limit and expires_at
- Seat enforcement: on login, count active users for client. If count ≥ seat_limit, block new logins and show `/license-expired` with upgrade CTA
- License expiry: daily cron checks `license_tokens.expires_at`. If expired, set `clients.is_active = false`. All API calls for inactive clients return 403 with "License expired."
- RBAC role builder UI: grid of 15 modules × 7 actions with checkbox per cell
- User invitation: generate invite token → send email via Resend with accept link → on accept, create `user_company_role`
- Audit log: middleware automatically logs all state-changing API calls to `audit_logs` table. Admin UI has search, filter by action/entity/user, date range.

---

## Key Architecture Decisions & Edge Cases

### 1. Payslip PDF Strategy (Dual Mode)
- **Interactive:** Server-generated HTML page opened in browser new tab. `?print=1` query param triggers `setTimeout(() => window.print(), 500)`. User does browser Print→Save as PDF. No blob URLs in page footers.
- **Batch/Automated:** Server-side HTML→PDF rendering via a Supabase Edge Function or dedicated PDF service. Required for: bulk payslip batch export, email attachments (via Resend), ZIMRA IT7 generation. Accepts HTML template and returns PDF buffer.

### 2. Biometric On-Prem Agent
ZKTeco (TCP/IP SDK) and Hikvision (ISAPI HTTP Digest Auth) cannot run in serverless. Architecture:
```
Biometric Devices
      ↓ (TCP/HTTP, on local network)
On-Prem Agent (Docker container or Tauri desktop app)
      ↓ (HTTPS, authenticated with API key)
Supabase / API
      ↓
attendance_logs table
```
Agent responsibilities: poll devices every 30s, push new punches to `POST /api/attendance/punch`, handle reconnection, report device health.

### 3. Company Switcher
A user can belong to multiple companies via `user_company_roles`. The sidebar has a company dropdown. Switching company:
- Updates `x-company-id` context (stored in TanStack Query context)
- Refetches all scoped queries
- Navigates to dashboard
- If user has only 1 company, hide the switcher

### 4. Currency Rate Source
Phase 1: manual entry only. Admin enters USD→ZiG rate with effective date. Rate used in payroll = rate with latest `effective_date` ≤ period end.

### 5. Notification Channels
Two channels:
- **Email** (via Resend): leave request submitted/approved/rejected, payroll run processed, payslip available, password reset, invite
- **In-app** (toast/notification bell): use a `notifications` table, polled by frontend. Store: userId, title, body, link, read_at, created_at

### 6. CSV Import Template
**Employee import** expects these columns:
```
employee_number, first_name, last_name, national_id, date_of_birth,
gender, marital_status, job_title, employment_type, date_joined,
basic_salary, basic_salary_zig, currency, split_usd_percent,
banking_name, banking_account, banking_branch, department_name
```

**Earnings import** expects:
```
employee_number, transaction_code, amount, amount_zig, effective_from, notes
```

Provide a downloadable template button on each import page.

### 7. Audit Log Implementation
Middleware pattern: in every server function/mutation that changes state, after success:
```typescript
await supabase.from('audit_logs').insert({
  company_id: context.companyId,
  user_id: context.user.id,
  action: 'payroll.process',
  entity_type: 'PayrollRun',
  entity_id: runId,
  details: { before: prevStatus, after: 'PROCESSED' },
  ip_address: request.headers.get('x-forwarded-for'),
})
```

No need to log GET requests or browse actions. Log all POST/PUT/PATCH/DELETE that change data.

### 8. License Enforcement Gate
On every server function call:
```typescript
const { data: client } = await supabase.from('clients').select('is_active, enabled_modules').eq('id', clientId).single()
if (!client.is_active) throw new Error('License expired')

const { count } = await supabase.from('user_company_roles').select('user_id', { count: 'exact', head: true }).eq('company_id', companyId)
if (count >= licenseSeatLimit) throw new Error('Seat limit reached')
```
Performance: cache client status in memory/session for 5 minutes. Bust cache on license change.

---

## Payment Provider

Stripe does not operate in Zimbabwe. Use one of:
- **Paynow** (Zimbabwean, supports EcoCash + mobile money + RTGS) — preferred for local users
- **Paddle** (global, supports ZW via reseller model) — preferred for international billing
- **Manual invoicing** (generate invoice, mark as paid on receipt)

Store provider choice in `subscriptions.provider`. Webhook endpoint at `/api/webhooks/payments` handles payment events.

---

## Not in Scope for v1

Build in v2+, do not build now:
- Tauri desktop app (native shell, offline sync, tray icon)
- Biometric on-prem agent (build the API contract + mock data, postpone the agent itself)
- RBAC role builder UI (build the backend + seeded "view only" / "full access" roles, postpone the drag-and-drop grid)
- Advanced analytics BI dashboard
- Recruitment, performance, expense, onboarding, training, asset, succession, survey modules (build their data models if needed, postpone UI)
- RBZ automatic currency rate feed (manual entry only for v1)
- Integration with accounting software (Xero, Sage)
- EFT file format verification tool

---

## Build Order (Recommended Milestones)

### Milestone 1: Auth + Tenancy (days 1–2)
- [ ] Supabase Auth email/password setup
- [ ] user_profiles, clients, companies, branches, departments tables
- [ ] Login, Register, Trial Signup, Accept Invite pages
- [ ] Company switcher + session context
- [ ] Acceptance: user can register, create company, invite another user, switch companies

### Milestone 2: People (days 3–5)
- [ ] Employee CRUD + table
- [ ] Employee import CSV + template download
- [ ] Org structure editor (branch/department tree)
- [ ] Grades table
- [ ] Employee pages (list, create, edit, detail)
- [ ] Acceptance: create employee via form, import 10 via CSV, organize into departments

### Milestone 3: Payroll Engine (days 6–12)
- [ ] Transaction codes + rules
- [ ] Payroll calendar + period management
- [ ] Payroll run state machine
- [ ] Tax calculation (PAYE with ZIMRA bands, AIDS Levy, NSSA, NEC)
- [ ] Multi-currency split
- [ ] Payslip generation + HTML preview
- [ ] Interactive payslip PDF (Print→Save as PDF)
- [ ] Batch payslip PDF (server-side renderer)
- [ ] Payslip pages (run detail, per-employee payslip, PDF download)
- [ ] Acceptance: run goes PREVIEW→SUBMIT→APPROVE→PROCESS, generates dual-currency payslips with correct tax, Medical Aid Credit shows but excluded from total, PDF downloads

### Milestone 4: Leave (days 13–15)
- [ ] Leave policies CRUD
- [ ] Leave balance tracking
- [ ] Leave request workflow
- [ ] Monthly accrual cron (pg_cron)
- [ ] Leave pages (list, create, detail)
- [ ] Acceptance: employee submits leave, HR approves, balance updates, payslip shows leave deduction

### Milestone 5: Loans (days 16–17)
- [ ] Loan + repayment tables
- [ ] Loan CRUD pages
- [ ] Auto-deduction on payroll PROCESS
- [ ] Acceptance: issue loan, run payroll, loan deducted from payslip, balance decreases

### Milestone 6: Reports (days 18–21)
- [ ] Report API (parameterized, multi-format)
- [ ] Top 5 report types (Payslip Summary, Cash Summary, EFT, P2, Leave Report)
- [ ] Reports page with date picker + format selector
- [ ] Acceptance: select period, choose "Payslip Summary" → CSV, get valid file with correct data

### Milestone 7: Compliance (days 22–24)
- [ ] IT7 certificate generation
- [ ] P2 monthly return
- [ ] NSSA P4A return
- [ ] Tax tables CRUD
- [ ] Acceptance: generate IT7 for an employee, matches YTD payslip totals

### Milestone 8: Billing + Polish (days 25–28)
- [ ] Subscription plans + Paynow/Paddle integration
- [ ] License key generation + seat enforcement
- [ ] Payment webhook handling
- [ ] Dashboard KPI widgets
- [ ] Notification system (email + in-app)
- [ ] Audit log viewer
- [ ] Acceptance: client hits seat limit, new login blocked, upgrade page shown

### Milestone 9: Edge Cases + Hardening (days 29–30)
- [ ] FDS_AVERAGE/FDS_FORECASTING tax methods
- [ ] Back pay processing
- [ ] Pay increase utility
- [ ] Leave encashment workflow
- [ ] Remaining 15 report types
- [ ] Performance testing (500 employee payroll run < 30s)
- [ ] Error states: network failure mid-run, partial data, concurrent edits

---

## Subscription & Licensing

| Plan | Price | Employee Cap | Modules |
|------|-------|--------------|---------|
| Basic | $29/mo | 25 | PEOPLE, TIME_LEAVE, PAYROLL, SETTINGS |
| Standard | $79/mo | 100 | Basic + COMPLIANCE, REPORTS, LOANS, ONBOARDING, EXPENSES |
| Premium | $149/mo | 500 | Standard + multi-company, RECRUITMENT, PERFORMANCE, TRAINING, ASSETS |
| Enterprise | Custom | Unlimited | Premium + SUCCESSION, SURVEYS, ANALYTICS, dedicated support |

---

## Final Instructions

1. Use TanStack Start (React + TanStack Router + server functions) as the full-stack framework
2. Use Supabase for PostgreSQL, Auth, Storage, and Edge Functions
3. Use Tailwind CSS v4 + shadcn/ui for all UI components
4. Use lucide-react for all icons
5. Build every page listed in the Pages Directory with exactly the specified routes
6. Implement the sidebar with 3 layout modes and module filtering as described
7. Implement the 3-layer RBAC system exactly as specified
8. Payroll must support dual-currency (USD/ZiG) per employee, mixed runs, and the full tax pipeline
9. All financial values must use `numeric` columns — never floats
10. Use Resend for transactional email (invites, notifications, payslip attachments)
11. Use Paynow (or Paddle) for payment processing, not Stripe
12. Every state-changing operation must be audit-logged
13. License/seat enforcement must gate all API access
