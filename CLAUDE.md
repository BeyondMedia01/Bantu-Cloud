# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend (`/backend`)
```bash
npm run dev          # Start dev server on port 5005 (nodemon)
npm run start        # Production start
npm run worker       # Run background worker
npm run test         # Run tests with Vitest
npm run seed:tcs     # Seed transaction codes
```

### Frontend (`/frontend`)
```bash
npm run dev          # Start Vite dev server on port 5173
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint check
npm run test         # Run tests with Vitest
```

### Run a single test
```bash
# Backend
npx vitest run __tests__/finance.test.js

# Frontend
npx vitest run src/path/to/test.spec.ts
```

## Architecture Overview

This is a **Zimbabwe payroll & HR SaaS** (Bantu-Cloud) with a React/TypeScript frontend and a Node.js/Express backend backed by PostgreSQL via Neon/Prisma.

### Multi-Tenancy Model

Three-level hierarchy enforced on every protected request:

```
Platform Admin → Client → Company → Employee
```

- All protected API routes require a `Bearer` JWT and an `x-company-id` header.
- `backend/middleware/companyContext.js` validates that the requested `companyId` belongs to the authenticated user's `clientId`.
- Frontend stores JWT + company/client IDs in `sessionStorage`; the Axios interceptor (`frontend/src/api/`) attaches them to every request and redirects to `/login` on 401.

### Backend Structure

```
backend/
  index.js            # Entry point: middleware pipeline, route mounting, startup seeds
  lib/
    auth.js           # JWT sign/verify helpers
    prisma.js         # PrismaClient singleton
  middleware/
    auth.js           # JWT verification middleware
    companyContext.js # Multi-tenant company ownership validation
  routes/             # ~40 Express route files mounted at /api/<feature>
  services/           # Business logic (attendance, employee import, back pay)
  jobs/               # Cron jobs (leave accrual fires at 00:05 on the 1st of each month)
  utils/              # Tax, PDF, Excel, YTD, holiday, system-settings helpers
  prisma/
    schema.prisma     # Source of truth for DB schema
```

On startup, `index.js` auto-seeds holidays, transaction codes, and system settings.

### Frontend Structure

```
frontend/src/
  App.tsx             # Router with role-based ProtectedRoute wrappers
  pages/              # ~40 lazy-loaded feature pages (React.lazy + Suspense)
  components/         # Shared UI; AppShell handles the main layout
  api/                # Axios client + per-feature service definitions
  lib/                # auth.ts (JWT parsing), tax, permissions, stripe, companyContext
  hooks/              # useDashboardData, useIdleTimer
  context/            # SettingsContext (theme/locale), ToastContext
  types/              # TypeScript interfaces
```

All server state is managed via **TanStack React Query** (60 s staleTime, 1 retry). Forms use **React Hook Form + Zod**.

### Payroll Engine

- **Transaction Codes** (`EARNING` / `DEDUCTION` / `BENEFIT`) are company-defined with `FIXED`, `PERCENTAGE`, or `FORMULA` calculation types and optional conditional rules (grade, salary threshold, hours).
- Each employee has an **EmployeeTransaction** set (salary structure with effective dating).
- A **Payroll Run** aggregates `PayrollTransaction` rows, applies PAYE/NSSA/AIDS-levy logic, and generates **Payslips**.
- Dual-currency: **USD / ZiG** with configurable split percentages per employee.
- Tax methods: `FDS_AVERAGE`, `FDS_FORECASTING`, `NON_FDS`.
- Zimbabwe-specific statutory: ZIMRA (tax), NSSA, NEC, WCIF, SDF.

### Leave Management

- `LeavePolicy` per company per leave type (accrual rate, max accumulation, carryover).
- `LeaveBalance` tracks `opening + accrued − taken − encashed` per year.
- Automatic monthly accrual via the in-process cron job in `backend/jobs/`.
- Encashment workflow: `PENDING → APPROVED → PROCESSED`.

### Attendance & Biometrics

- Biometric device webhooks (`/api/biometric`) receive punch events → `AttendanceLog`.
- `AttendanceRecord` is derived from logs (daily totals + OT).
- Shifts define hours and OT multipliers; `ShiftAssignment` tracks rosters per employee.

## Key Conventions

- **Public routes**: `/api/auth`, `/api/setup`, `/api/license/validate`, `/api/biometric`.
- **Rate limits**: Auth endpoints (5 req / 15 min), biometric webhooks (200 / 15 min).
- **Stripe webhook** requires raw body — its route is mounted *before* `express.json()`.
- **Path alias**: Frontend uses `@/` mapped to `src/` (configured in `vite.config.ts` and `tsconfig.json`).
- **Unique DB constraints**: `(clientId, code)` for transaction codes; `(clientId, year, month)` for payroll calendars.
- Employment types: `PERMANENT`, `CONTRACT`, `TEMPORARY`, `PART_TIME`.

## Environment Variables

See `backend/.env.example`. Required: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `FRONTEND_URL`, `STRIPE_SECRET_KEY`.
