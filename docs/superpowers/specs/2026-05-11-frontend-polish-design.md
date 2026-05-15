# Frontend Polish & Organisation

**Date:** 2026-05-11  
**Scope:** Organise and polish the existing frontend — no rewrites, no design changes, no new features.

---

## Problem Summary

| Problem | Current State |
|---|---|
| God-file API client | All API calls for every domain live in one `api/client.ts` |
| No domain hooks | Pages fetch directly, logic is not reusable |
| axios dependency | Native fetch covers everything axios does; unnecessary bundle weight |
| Hardcoded Render URL | `DESKTOP_CLOUD_URL` hardcoded — breaks when moving to Cloudflare domain |
| Settings in custom context | `SettingsContext` is a custom provider for data that should be a TanStack Query cache |

---

## What Is Not Changing

- Component library (shadcn/ui) — untouched
- Visual design, fonts, colours — untouched
- Routing structure — untouched
- TanStack Query setup — untouched
- Lazy loading — untouched
- Auth flow — untouched

---

## Changes

### 1. Split `api/client.ts` by Domain

Break the single god-file into focused API modules:

```
frontend/src/api/
  index.ts              — re-exports axios instance / fetch client
  auth.api.ts           — login, register, reset password
  employees.api.ts      — employees, grades, departments, branches
  payroll.api.ts        — payroll runs, payslips, inputs, calendar
  leave.api.ts          — leave, balances, encashments, policies
  loans.api.ts          — loans, repayments
  statutory.api.ts      — tax tables, NSSA, NEC, statutory exports
  documents.api.ts      — employee documents, file uploads
  reports.api.ts        — all report endpoints
  settings.api.ts       — system settings, work period, public holidays
  admin.api.ts          — clients, licenses, users, audit logs
  attendance.api.ts     — attendance, shifts, roster, devices
  subscription.api.ts   — subscription, billing
```

Each file exports typed async functions. No logic — just the HTTP calls.

### 2. Domain Hooks

One custom hook per domain wraps TanStack Query:

```
frontend/src/hooks/
  useEmployees.ts
  usePayroll.ts
  useLeave.ts
  useLoans.ts
  useReports.ts
  useAttendance.ts
  useSettings.ts
  useAdmin.ts
```

Pages import the hook, destructure what they need. No direct API calls in pages.

**Before:**
```tsx
const [employees, setEmployees] = useState([]);
useEffect(() => { api.get('/employees').then(...) }, []);
```

**After:**
```tsx
const { employees, isLoading } = useEmployees();
```

### 3. axios → fetch

Replace `axios` with native `fetch` wrapped in a thin client utility:

```
frontend/src/api/http.ts — fetch wrapper with:
  - Auth header injection
  - x-company-id header injection
  - 401 → logout redirect
  - JSON parsing
  - Error normalisation
```

Removes `axios` from dependencies. Saves ~13KB from the production bundle.

### 4. Fix Hardcoded Render URL

Move `DESKTOP_CLOUD_URL` out of source code into an environment variable:

```
VITE_DESKTOP_API_URL=https://api.bantupayroll.com/api
```

Required before Cloudflare domain migration. Single-line change with large operational impact.

### 5. Settings → TanStack Query

Replace `SettingsContext` custom provider with a `useSettings` hook backed by TanStack Query:

- Settings are fetched once, cached, and revalidated in the background
- No manual state management
- Consistent with how every other data fetch works in the app

---

## Principles

- **Pages are dumb** — layout, user interaction, and hook calls only
- **Hooks own data fetching** — one hook per domain, wraps TanStack Query
- **API files own HTTP** — typed functions, no logic, no state
- **No visual changes** — this is purely structural
