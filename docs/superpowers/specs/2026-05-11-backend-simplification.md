# Backend Simplification & Enterprise Readiness

**Date:** 2026-05-11  
**Scope:** 10–50 clients, Zimbabwe-focused. Architect for regional expansion but don't over-engineer now.

---

## Problem Summary

| Problem | Current State |
|---|---|
| Login lag | Render free tier cold starts (10–30s wake time) |
| Two hosting platforms | API on Render, frontend on Vercel — split ops |
| 60+ route files | No domain organization, logic mixed into routes |
| No service layer | Business logic lives in route handlers |
| Duplicate storage | Google Cloud Storage + Supabase Storage |
| Duplicate packages | Two PDF libs, two Excel libs, two blob SDKs |
| Unreliable email | Nodemailer + raw SMTP lands in spam |
| node-cron on serverless | Silently fails — cron doesn't persist on serverless |

---

## Three Workstreams

### Workstream 1: Infrastructure (Cloudflare + Render)

**Goal:** Eliminate cold start lag, consolidate platforms, secure the edge.

- Point domain DNS nameservers to Cloudflare (free plan)
- Proxy `api.bantupayroll.com` through Cloudflare (orange cloud)
- Add Cache Rule to bypass cache for `/api/*`
- Upgrade Render to paid tier ($7/month) — instance stays warm, never sleeps
- Set up Cloudflare R2 bucket for all file storage (free tier: 10GB, 0 egress fees)
- Remove Supabase Storage and Google Cloud Storage

### Workstream 2: Backend Restructure

**Goal:** 60+ route files → 12 domain routers with a proper service layer.

#### Route Consolidation

| Domain Router | Absorbs |
|---|---|
| `auth.js` | auth, user, employeeSelf |
| `employees.js` | employees, grades, departments, branches, employeeFields |
| `payroll.js` | payroll, payrollCore, payrollInputs, payrollCalendar, payrollLogs, periodEnd, backPay, payIncrease |
| `leave.js` | leave, leaveBalances, leaveEncashments, leavePolicies |
| `statutory.js` | taxTables, taxBands, nssaContributions, nssaSettings, necTables, statutoryExports, statutoryRates, currencyRates |
| `documents.js` | payslips, payslipExports, payslipSummaries, payslipTransactions, bankFiles, download |
| `loans.js` | loans |
| `attendance.js` | attendance, biometric, devices, shifts, roster |
| `settings.js` | systemSettings, setup, workPeriodSettings, publicHolidays, transactionCodes |
| `reports.js` | reports, payrollUsers, payTransactions, employeeTransactions |
| `admin.js` | admin, clients, companies, licenses, subscriptions, auditLogs |
| `platform.js` | sync, desktop, backup, webhooks, cron |

#### Service Layer

Extract all business logic from routes into `services/`:

- `services/auth.service.js` — login, session management, password reset
- `services/payroll.service.js` — payroll run, period end, back pay
- `services/leave.service.js` — leave requests, balances, encashments, accrual
- `services/statutory.service.js` — ZIMRA PAYE, NSSA, NEC calculations
- `services/documents.service.js` — PDF generation, file storage, payslip export
- `services/notifications.service.js` — email triggers
- `services/storage.service.js` — unified R2 file operations

Routes become thin: validate input → call service → return response.

#### Session Cache Fix (login lag)

`authenticateToken` currently hits the DB on every request. Replace with:
- In-memory session cache (60s TTL) using a `Map`
- DB lookup only on cache miss or logout/revocation

### Workstream 3: Package Cleanup

#### Remove

| Package | Reason |
|---|---|
| `@react-pdf/renderer` | `pdfkit` covers server-side PDF generation |
| `xlsx` | CVEs; `exceljs` covers everything |
| `@google-cloud/storage` | Replaced by R2 |
| `esbuild` + `esbuild-register` | Not needed on Node.js CommonJS backend |
| `node-cron` | Use Render native cron jobs instead |
| `nodemailer` | Replace with Resend |

#### Add

| Package | Reason |
|---|---|
| `@aws-sdk/client-s3` | S3-compatible client for Cloudflare R2 |
| `resend` | Reliable transactional email |

#### Keep

`prisma`, `bcryptjs`, `jsonwebtoken`, `helmet`, `express-rate-limit`, `cors`, `multer`, `stripe`, `csv-parse`, `pdf-parse`, `exceljs`, `pdfkit`

---

## Summary

| Metric | Before | After |
|---|---|---|
| Route files | 60+ | 12 |
| Packages | 25 | 19 |
| Storage providers | 2 (GCS + Supabase) | 1 (R2) |
| Email provider | Nodemailer (SMTP) | Resend |
| Cold start | 10–30s | None (Render paid + Cloudflare) |
| DB hits per request | 2 (auth + companyContext) | 1 (session cached) |
| Hosting platforms | 2 (Render + Vercel) | 2 (keep for now, consolidate later) |
