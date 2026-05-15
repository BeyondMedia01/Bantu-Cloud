# Implementation Plan: Frontend Polish & Organisation

**Spec:** `docs/superpowers/specs/2026-05-11-frontend-polish-design.md`  
**Date:** 2026-05-11  
**Est. total:** 3–4 days

---

## Step 1 — Fix Hardcoded Render URL (15 minutes)

Do this first — it unblocks the Cloudflare migration.

- [ ] Open `frontend/src/api/client.ts`
- [ ] Replace `const DESKTOP_CLOUD_URL = 'https://bantu-cloud.onrender.com/api'`  
  with `const DESKTOP_CLOUD_URL = import.meta.env.VITE_DESKTOP_API_URL as string`
- [ ] Add `VITE_DESKTOP_API_URL=https://bantu-cloud.onrender.com/api` to `frontend/.env`
- [ ] Add `VITE_DESKTOP_API_URL=https://api.bantupayroll.com/api` to `frontend/.env.production`
- [ ] Test desktop login still works

---

## Step 2 — Replace axios with fetch (half day)

- [ ] Create `frontend/src/api/http.ts` — thin fetch wrapper
  - Reads token from `lib/auth`
  - Reads `activeCompanyId` from sessionStorage
  - Attaches `Authorization` and `x-company-id` headers
  - On 401 → calls `logout()` and redirects to `/login`
  - Parses JSON response
  - Throws normalised error with `message` field
- [ ] Run `grep -r "from 'axios'\|from \"axios\"" frontend/src --include="*.ts" --include="*.tsx"` to find all axios imports
- [ ] Replace each axios call with the new `http` client
- [ ] Run `npm uninstall axios` in `frontend/`
- [ ] Run the app, test login + a data fetch page

---

## Step 3 — Split api/client.ts by Domain (1 day)

Work through one domain at a time. For each:
- [ ] Create the domain API file
- [ ] Move relevant functions from `client.ts` into it
- [ ] Update imports in any page that uses those functions
- [ ] Verify the page still works before moving to next domain

**Order:**
1. [ ] `auth.api.ts` — login, register, forgot/reset password
2. [ ] `settings.api.ts` — system settings, work period, public holidays
3. [ ] `admin.api.ts` — clients, licenses, users, audit logs
4. [ ] `loans.api.ts` — loans, repayments
5. [ ] `attendance.api.ts` — attendance, shifts, roster, devices
6. [ ] `reports.api.ts` — all report endpoints
7. [ ] `documents.api.ts` — employee documents, uploads
8. [ ] `statutory.api.ts` — tax tables, NSSA, NEC, statutory exports
9. [ ] `leave.api.ts` — leave, balances, encashments, policies
10. [ ] `employees.api.ts` — employees, grades, departments, branches
11. [ ] `payroll.api.ts` — payroll runs, payslips, inputs, calendar
12. [ ] `subscription.api.ts` — subscription, billing
- [ ] Delete `api/client.ts` once empty
- [ ] Create `api/index.ts` that re-exports the http client for anything that needs it directly

---

## Step 4 — Domain Hooks (1 day)

For each domain, create a hook that wraps TanStack Query:

- [ ] `hooks/useSettings.ts`
- [ ] `hooks/useEmployees.ts`
- [ ] `hooks/usePayroll.ts`
- [ ] `hooks/useLeave.ts`
- [ ] `hooks/useLoans.ts`
- [ ] `hooks/useReports.ts`
- [ ] `hooks/useAttendance.ts`
- [ ] `hooks/useAdmin.ts`

Each hook:
- Uses `useQuery` / `useMutation` from TanStack Query
- Exports named values: `{ data, isLoading, error, refetch }`
- Exports mutation functions: `{ create, update, delete }`
- Has typed return values

Update pages to use hooks instead of direct API calls. Start with the simplest pages (Loans, Grades, CurrencyRates) and work up to the complex ones (Payroll, Employees).

---

## Step 5 — Settings → TanStack Query (half day)

- [ ] Create `hooks/useSettings.ts` using `useQuery`
- [ ] Replace `SettingsContext` provider with `useSettings` hook in all consuming components
- [ ] Remove `SettingsContext.tsx`
- [ ] Remove `<SettingsProvider>` from `App.tsx`
- [ ] Verify settings still load correctly throughout the app

---

## Definition of Done

- [ ] `axios` removed from `frontend/package.json`
- [ ] `api/client.ts` deleted — replaced by 12 domain API files
- [ ] All pages use domain hooks, no direct API calls in page components
- [ ] `SettingsContext` removed
- [ ] Hardcoded Render URL replaced with env var
- [ ] All pages load and function correctly (manual smoke test)
- [ ] TypeScript compiles with no errors (`npm run build`)
