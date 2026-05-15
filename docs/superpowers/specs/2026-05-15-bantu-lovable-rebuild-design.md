# Bantu Platform — Lovable Full-Stack Rebuild Design (v3)

**Date:** 2026-05-15
**Status:** Approved
**Scope:** Full rebuild of Bantu Payroll & HR SaaS using Lovable (React + TanStack Start) + Cloudflare Workers + Supabase Postgres + Resend email

---

## 1. Overview

Bantu is a Zimbabwe-focused Payroll & HR SaaS with native multi-currency support (USD/ZiG), deep statutory integrations (ZIMRA, NSSA, NEC), and a multi-tenant architecture serving payroll bureaus, SMEs, and enterprises.

The rebuild replaces the existing React/Node.js/Prisma stack with:
- **Frontend + Server:** React with TanStack Start — UI and server logic via `createServerFn` / server routes, deployed on Cloudflare Workers
- **Database:** Supabase Postgres with Row Level Security (no Supabase Edge Functions — all server logic runs in Workers)
- **Security:** Cloudflare WAF, rate limiting, DDoS protection
- **PDF generation:** `pdf-lib` (pure JS, runs natively on Workers) for payslip PDFs
- **Email:** Resend for transactional notifications + Supabase Auth built-in for invitations
- **In-app notifications:** Bell icon + unread inbox (Phase 1)
- **Currency rates:** Manual entry by a SETTINGS user (RBZ rate entered per period)
- **Biometric integration:** Deferred to Phase 2

---

## 2. Architecture

```
Browser (React / TanStack Start)
    │
    ▼
Cloudflare Workers (TanStack server functions + API routes)
    ├── Payroll calculations (createServerFn)
    ├── PDF generation (pdf-lib)
    ├── Statutory exports (CSV / XLSX)
    ├── Notification dispatch (Resend)
    └── Leave accrual cron route (/api/cron/accrue-leave — shared secret guard)
    │
    ▼
Supabase Postgres (RLS enforced — Workers connect via service role for mutations,
                   client connects directly for RLS-filtered reads)
```

### Rate Limits (Cloudflare)
- Auth endpoints: 5 requests / 15 min
- API endpoints: 200 requests / 15 min

### PDF Strategy
Payslip PDFs are generated server-side with `pdf-lib` inside a Worker server function. Dual-currency layout (USD + ZiG) is built programmatically. Bulk batch PDFs are Phase 2.

### Leave Accrual Cron
Monthly leave accrual runs via `pg_cron` inside Supabase Postgres at 00:05 on the 1st of each month, paired with a `/api/cron/accrue-leave` Worker route (guarded by a shared secret) for manual triggers and health checks.

---

## 3. Multi-Tenancy Model

```
Client (payroll bureau / org)
  └── Company
        ├── SubCompany (optional)
        ├── Branch
        └── Department
              └── Employee
```

All data is scoped to `company_id`. RLS policies enforce this at the database level for reads. Write operations go through Worker server functions which validate ownership before mutation.

---

## 4. Database Schema

### Multi-Tenancy Tables
| Table | Key Columns |
|-------|-------------|
| `clients` | id, name, subscription_tier, enabled_modules[] |
| `companies` | id, client_id, name, registration_number, tax_id, contact_email, contact_phone, address |
| `sub_companies` | id, company_id, name, description |
| `branches` | id, company_id, name, description |
| `departments` | id, company_id, name, description |

### Auth & Access Tables
| Table | Key Columns |
|-------|-------------|
| `users` | id (= auth.users.id), client_id, company_id (nullable — NULL for PLATFORM_ADMIN and CLIENT_ADMIN who span multiple companies), role (PLATFORM_ADMIN / CLIENT_ADMIN / COMPANY_USER / EMPLOYEE) |
| `roles` | id, company_id, name — named custom roles per company |
| `role_permissions` | id, role_id, module, actions[] — replaces embedded JSONB; migration required from existing `user_roles.permissions` JSONB |
| `user_roles` | user_id, role_id — replaces existing JSONB-based assignment; `usePermissions` hook rewritten to query this 3-table model |
| `licenses` | id, client_id, tier, enabled_modules[], seat_limit, expires_at, grace_period_days (default 14) |

### Licensing Enforcement
- **Seat limit exceeded:** Account enters read-only mode — users can view but not create or edit
- **License expired:** 14-day grace period (full access), then hard block on login
- Enforcement checked in Worker middleware on every protected request

### People Tables
| Table | Key Columns |
|-------|-------------|
| `employees` | id, user_id (FK → users.id, nullable for employees without portal access), company_id, first_name, last_name, national_id, tax_number, nssa_number, date_of_birth, hire_date, termination_date, employment_type, status, department_id, branch_id, grade_id, usd_split, zig_split, tax_method |
| `grades` | id, company_id, name, min_salary_usd, max_salary_usd, nec_linked |
| `employee_documents` | id, employee_id, company_id, type, file_url, expiry_date |
| `employment_history` | id, employee_id, company_id, event_type, effective_date, notes |

### Payroll Tables
| Table | Key Columns |
|-------|-------------|
| `payroll_calendars` | id, company_id, period_year, period_month, cut_off_date, pay_date, is_locked |
| `payroll_runs` | id, company_id, payroll_calendar_id, status (PREVIEW/SUBMITTED/APPROVED/PROCESSED), exchange_rate_id (FK → currency_rates.id — frozen at processing time), tax_table_id (FK → tax_tables.id — frozen at processing time), processed_at |
| `payslips` | id, payroll_run_id, employee_id, gross_usd, gross_zig, paye, nssa, aids_levy, nec, sdf, wcif, zimdef, net_usd, net_zig |
| `payroll_line_items` | id, payslip_id, transaction_code_id, type (EARNING/DEDUCTION/BENEFIT), description, amount_usd, amount_zig |
| `transaction_codes` | id, company_id, code, type (EARNING/DEDUCTION/BENEFIT), calc_type (FIXED/PERCENTAGE/FORMULA), value, conditions (JSONB: `{type: "grade"\|"salary_threshold"\|"hours", operator, value}`) |
| `employee_transactions` | id, employee_id, transaction_code_id, value, effective_date |
| `loans` | id, employee_id, company_id, principal, balance, monthly_repayment, start_date, status |
| `loan_repayments` | id, loan_id, company_id, payroll_run_id, amount |
| `back_pay_entries` | id, company_id, payroll_run_id, employee_id, period_from, period_to, amount_usd, amount_zig, reason — one row per employee per back-pay event |

### Leave & Attendance Tables
| Table | Key Columns |
|-------|-------------|
| `leave_policies` | id, company_id, leave_type, accrual_rate, max_accumulation, carryover_limit |
| `leave_balances` | id, employee_id, company_id, year, leave_type, opening, accrued, taken, encashed |
| `leave_requests` | id, employee_id, company_id, leave_type, start_date, end_date, status (PENDING/APPROVED/REJECTED), approved_by (FK → users.id, nullable) |
| `shifts` | id, company_id, name, start_time, end_time, break_minutes, ot_multiplier_1_5, ot_multiplier_2_0 |
| `shift_assignments` | id, employee_id, company_id, shift_id, effective_date |
| `attendance_records` | id, employee_id, company_id, date, clock_in, clock_out, regular_hours, ot_hours, source (MANUAL/BIOMETRIC) |
| `public_holidays` | id, company_id, date, name |

### Compliance & Settings Tables
| Table | Key Columns |
|-------|-------------|
| `tax_tables` | id, effective_date, brackets (JSONB: `[{from, to, rate, fixed_amount}]`) — resolved at run time by `SELECT ... WHERE effective_date <= run.period_end ORDER BY effective_date DESC LIMIT 1` |
| `currency_rates` | id, date, usd_to_zig — manually entered by SETTINGS user each period |
| `system_settings` | id, company_id, key, value |
| `audit_logs` | id, user_id, company_id, action, entity_type, entity_id, timestamp, before (JSONB full record snapshot), after (JSONB full record snapshot) |

### Notifications Tables
| Table | Key Columns |
|-------|-------------|
| `notifications` | id, user_id, company_id, type, title, body, read_at (nullable), created_at |

---

## 5. Row Level Security Strategy

Three RLS policy patterns cover all four roles. All patterns are applied at the Supabase Postgres layer.

```sql
-- Pattern 1: COMPANY_USER — single company (company_id NOT NULL)
CREATE POLICY "company_scoped"
ON employees FOR SELECT
USING (
  company_id = (SELECT company_id FROM users WHERE id = auth.uid())
);

-- Pattern 2: CLIENT_ADMIN — all companies under their client
CREATE POLICY "client_admin_scoped"
ON employees FOR SELECT
USING (
  company_id IN (
    SELECT id FROM companies
    WHERE client_id = (SELECT client_id FROM users WHERE id = auth.uid())
  )
);

-- Pattern 3: EMPLOYEE self-service — own rows only (via employees.user_id FK)
-- NOTE: never compare auth.uid() directly against employee_id —
-- employees.id is not a user UUID. Always resolve via the join.
CREATE POLICY "employee_self_service"
ON payslips FOR SELECT
USING (
  employee_id IN (
    SELECT id FROM employees WHERE user_id = auth.uid()
  )
);
```

Pattern 3 applies to: `payslips`, `leave_requests`, `leave_balances`, `attendance_records`, `employee_documents`. All use the same join via `employees.user_id`.

Access rules by role:
- **PLATFORM_ADMIN:** Connects via service role key inside Worker server functions only — never exposed client-side
- **CLIENT_ADMIN:** Pattern 2 — `company_id` is NULL in `users`; sees all companies under `client_id`
- **COMPANY_USER:** Pattern 1 — company-scoped. Note: Postgres RLS only enforces company boundary; module/action (RBAC) enforcement is done at the Worker server function layer and frontend `usePermissions` check
- **EMPLOYEE:** Pattern 3 — self-service rows only via `employees.user_id` join

---

## 6. User Roles & Navigation

### 6.1 Role Definitions

| Role | Type | Access |
|------|------|--------|
| PLATFORM_ADMIN | System | All modules, cross-client, service role |
| CLIENT_ADMIN | System | All enabled modules within client, bypasses permission checks |
| COMPANY_USER | Custom | Granular per role + module + action (3-table model) |
| EMPLOYEE | System | Self-service read-only scoped to own data |

### 6.2 Migration from Existing JSONB Model

The existing codebase uses `user_roles.permissions` as embedded JSONB. This spec migrates to the `roles` + `role_permissions` + `user_roles` 3-table model:
- Write a migration that reads existing JSONB permissions and inserts corresponding `roles` + `role_permissions` rows
- Rewrite `usePermissions` hook to query the 3-table model
- Rewrite the existing roles editor to the new role builder UI (Prompt 8)
- A default "Full Access" role is seeded per company for CLIENT_ADMIN on creation

### 6.3 RBAC Bootstrapping

The 3-table schema ships in Prompt 1. Prompts 2–7 wire permission checks to it via `usePermissions` (frontend) and server function guards. The role builder UI (to create/edit named roles) ships in Prompt 8.

### 6.4 Navigation by Role

**Platform Admin:** Dashboard · Clients · Users · Licenses · Settings

**Client Admin:** Company switcher + full module nav + Administration section (Roles, Team Members)

**Company User:** Module nav filtered by `can(module)` — hides groups the user has no VIEW permission for

**Employee:** Payslips · Leave · Attendance · Documents · Profile

### 6.5 The 15 Modules

| Module | Phase | Tier |
|--------|-------|------|
| PEOPLE | 1 | 1 |
| TIME_LEAVE | 1 | 1 |
| PAYROLL | 1 | 1 |
| COMPLIANCE | 1 | 1 |
| REPORTS | 1 | 1 |
| SETTINGS | 1 | 1 |
| RECRUITMENT | 2 | 2 |
| PERFORMANCE | 2 | 2 |
| EXPENSES | 2 | 2 |
| ONBOARDING | 3 | 3 |
| TRAINING | 3 | 3 |
| ASSETS | 3 | 3 |
| SUCCESSION | 4 | 4 |
| SURVEYS | 4 | 4 |
| ANALYTICS | 4 | 4 |

Each module supports 7 actions: `VIEW · EDIT · DELETE · APPROVE · EXPORT · RUN · CONFIGURE`

---

## 7. Payroll Engine (Worker Server Functions)

All statutory calculations run server-side in Cloudflare Worker `createServerFn` calls. Core logic ported from existing `backend-v2` TypeScript.

Each payroll run snapshots `exchange_rate_id` and `tax_table_id` at processing time — frozen into the run record for audit immutability.

### Statutory Calculations
- **PAYE:** ZIMRA tax bands from `tax_tables`, 3 methods: `FDS_AVERAGE`, `FDS_FORECASTING`, `NON_FDS` *(exact band values, formula per method, NEC %, SDF/WCIF/ZIMDEF rates to be pinned before Prompt 4 — source from backend-v2)*
- **AIDS Levy:** 3% of PAYE
- **NSSA:** Employee + employer contributions with insurable earnings cap *(cap value to be pinned before Prompt 4)*
- **NEC:** Industry council levies *(% per industry to be pinned before Prompt 4)*
- **SDF / WCIF / ZIMDEF:** Additional statutory contributions
- **Dual-currency:** Per-employee USD/ZiG split percentages applied to gross and net
- **Medical Aid Credit:** Informational display only, excluded from totals

### Server Functions / Routes
| Function | Prompt | Purpose |
|----------|--------|---------|
| `calculatePayroll` (createServerFn) | 4 | Full run calculation, writes payslips + line items. Idempotent: deletes existing payslips/line_items for the run before recalculating. Only callable when run status is PREVIEW or SUBMITTED. |
| `generatePayslipPdf` (createServerFn) | 5 | pdf-lib dual-currency payslip. Payslip reads (list/view) use Supabase client directly — no server function needed for reads. |
| `exportBankEft` (createServerFn) | 6 | CBZ / Stanbic / Fidelity EFT formats *(file specs to be pinned before Prompt 6)* |
| `exportZimraP2` (createServerFn) | 6 | ZIMRA monthly return (includes ZIMDEF) |
| `exportNssaP4a` (createServerFn) | 6 | NSSA monthly return |
| `exportZimraIt7` (createServerFn) | 6 | Annual IT7 (P16) certificates |
| `sendNotification` (createServerFn) | 1 | Email via Resend + writes to `notifications` table. Built once in Prompt 1, called by Prompts 3+ for leave/payroll/system events. |
| `POST /api/cron/accrue-leave` | 3 | Worker route guarded by shared secret, triggered by `pg_cron` at 00:05 on 1st of each month |

---

## 8. Notifications

### In-App (Phase 1)
- Bell icon in nav with unread count badge
- Dropdown inbox showing recent notifications (title, body, timestamp, read/unread)
- Mark as read on open; mark all read action
- Stored in `notifications` table, RLS-scoped to `user_id`

### Email (Phase 1)
- Sent via Resend through `sendNotification` server function
- Triggers: leave request submitted, leave approved/rejected, payroll run status changes, user invitation
- Email domain DNS must be configured in Resend before Prompt 1 sends real mail

---

## 9. Lovable Prompt Sequence

### Prompt 1 — Foundation
**Delivers:** Working login + empty role-correct dashboard for all 4 roles + notification infrastructure

Covers: Supabase project setup · Full DB schema (all tables + RLS, all 3 policy patterns) · 4-role auth flow (login, invite, company switcher) · Navigation shell with role-based sidebar · 3-table RBAC schema with default "Full Access" role seeded · License enforcement middleware (grace period + read-only mode) · `sendNotification` server function (Resend + `notifications` table) built once here · In-app notification bell + inbox · Cloudflare Workers config

### Prompt 2 — People Module
**Delivers:** Full employee database

Covers: Employee CRUD (full lifecycle + termination, all statutory ID fields) · Bulk CSV import *(column spec to be pinned before Prompt 2)* · Org hierarchy (sub-company, branch, department) · Salary grades + NEC min/max · Document management · Migration from existing JSONB `user_roles.permissions` to 3-table model

### Prompt 3 — Time & Leave Module
**Delivers:** Full leave + attendance (no biometrics)

Covers: Leave policy config · Leave request workflow (submit → approve → reject) · Email + in-app notification on status change via `sendNotification` · Leave balance tracking · Monthly accrual via `pg_cron` + `/api/cron/accrue-leave` route · Shift configuration · Manual attendance entry · Public holiday management

### Prompt 4 — Payroll Engine
**Delivers:** End-to-end payroll run with statutory deductions + line item breakdown

Covers: Transaction codes (with structured conditions schema) · Payroll calendar (cut-off + pay date + period locking) · Run lifecycle (Preview → Submit → Approve → Process) · Exchange rate + tax table snapshot frozen into run · Dual-currency USD/ZiG · `calculatePayroll` server function (PAYE + AIDS Levy + NSSA + NEC + SDF + WCIF + ZIMDEF) · `payroll_line_items` written per run · Loan repayment auto-deduction · Payroll run status email + in-app notification

### Prompt 5 — Payslips & Loans
**Delivers:** Payslips employees can view and download as PDF

Covers: `generatePayslipPdf` server function (pdf-lib, dual-currency layout) · Employee self-service payslip view · Loan management (create, repayment schedule) · Back pay processing (`back_pay_entries`)

### Prompt 6 — Compliance & Statutory Exports
**Delivers:** Full statutory compliance exports

Covers: `exportZimraP2`, `exportNssaP4a`, `exportZimraIt7`, `exportBankEft` server functions · Tax table management with effective dates · Motor vehicle benefit · Currency rate manual entry UI

### Prompt 7 — Reports Module
**Delivers:** Full reporting suite (20+ report types)

Covers: CSV / PDF / XLSX export · Payroll variance (uses `payroll_line_items`) · Leave reports · Loan reports · Headcount · Journal entries · Pension exports · Payroll trends

### Prompt 8 — RBAC, Platform Admin & Settings
**Delivers:** Full admin + platform control plane + role builder UI

Covers: Custom role builder UI (15 modules × 7 actions, writes to `roles` + `role_permissions`) · User invitation + management · License key management + seat tracking · Audit log viewer (before/after snapshots) · System settings (NSSA thresholds, holidays, system-wide defaults) · Platform admin: client lifecycle + global config

---

## 10. Items to Pin Before Building

These must be resolved before the relevant prompt — they cannot be invented by Lovable:

| Item | Needed By | Source |
|------|-----------|--------|
| ZIMRA PAYE bands (USD + ZiG) | Prompt 4 | Extract from backend-v2 tax utils |
| FDS_AVERAGE / FDS_FORECASTING / NON_FDS formulas | Prompt 4 | Extract from backend-v2 |
| NSSA insurable earnings cap | Prompt 4 | Extract from backend-v2 |
| NEC % per industry | Prompt 4 | Extract from backend-v2 |
| SDF / WCIF / ZIMDEF rates | Prompt 4 | Extract from backend-v2 |
| CBZ / Stanbic / Fidelity EFT file specs | Prompt 6 | Extract from backend-v2 export utils |
| Employee CSV import column spec | Prompt 2 | Define based on existing import template |
| Resend email domain DNS | Prompt 1 | Configure in Resend dashboard before first run |
| License billing provider | Prompt 8 | Stripe doesn't operate in Zimbabwe — pick Paddle / Paynow / manual invoicing |

---

## 11. Deferred to Phase 2

- Biometric device integration (ZKTeco, Hikvision webhook receiver)
- RBZ rate scraper (currently manual entry)
- Bulk batch payslip PDF generation (currently single payslip only)
- Recruitment, Performance, Expenses modules
- Mobile app / PWA

---

## 12. Success Criteria

- All 4 user roles can log in and see their correct navigation
- A CLIENT_ADMIN managing 10 companies sees all via company switcher; a COMPANY_USER sees only their own
- A COMPANY_USER without PAYROLL permission cannot access the payroll run page (frontend `usePermissions` guard + Worker server function rejection — note: Postgres RLS for COMPANY_USER is company-scoped only; module/action enforcement is application-layer)
- A full payroll run produces correct PAYE, NSSA, AIDS Levy, ZIMDEF for a dual-currency employee and writes one `payroll_line_item` row per transaction code
- Payslips are downloadable as PDF (pdf-lib) with correct USD and ZiG figures
- ZIMRA P2 and NSSA P4A exports match the required statutory format
- RLS cross-tenant test: a seed script queries company B's data using company A's JWT and receives 0 rows
- Payroll run for 500 employees completes within 30 seconds
- Expired license (past grace period) blocks login; seat-limit-exceeded account enters read-only mode
- Leave approval triggers both an email (Resend) and an in-app notification
