# Implementation Plan: Backend Enterprise Readiness

**Spec:** `docs/superpowers/specs/2026-05-11-backend-simplification.md`  
**Date:** 2026-05-11

---

## Workstream 1: Infrastructure (Est. 1 day)

### Step 1.1 — Cloudflare Setup
- [ ] Create Cloudflare account (free plan)
- [ ] Add domain to Cloudflare — update nameservers at registrar
- [ ] Wait for DNS propagation (up to 24h, usually under 1h)
- [ ] Set `api.bantupayroll.com` A record → Render IP, set to **Proxied** (orange cloud)
- [ ] Add Cache Rule: `api.bantupayroll.com/api/*` → Cache Level: Bypass

### Step 1.2 — Render Upgrade
- [ ] Upgrade Render service from free to **Starter ($7/month)**
- [ ] Confirm instance stays alive (no more sleep after 15 min inactivity)
- [ ] Remove any UptimeRobot/keep-alive hacks if present

### Step 1.3 — Cloudflare R2 Setup
- [ ] Enable R2 in Cloudflare dashboard
- [ ] Create bucket: `bantu-production`
- [ ] Generate R2 API token with Object Read & Write permissions
- [ ] Note: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
- [ ] Add env vars to Render

### Step 1.4 — Render Native Cron Jobs
- [ ] In Render dashboard, create Cron Job: `POST /api/cron/leave-accrue` — schedule `5 0 1 * *`
- [ ] In Render dashboard, create Cron Job: `POST /api/cron/notify` — schedule `0 7 * * *`
- [ ] Set `CRON_SECRET` env var on Render and in cron job headers

---

## Workstream 2: Package Cleanup (Est. half day)

### Step 2.1 — Remove packages
```bash
cd backend
npm uninstall @react-pdf/renderer xlsx @google-cloud/storage esbuild esbuild-register node-cron nodemailer
```

### Step 2.2 — Add packages
```bash
npm install @aws-sdk/client-s3 resend
```

### Step 2.3 — Remove GCP credential bootstrap
- [ ] Remove GCP credentials block from top of `index.js`
- [ ] Remove `esbuild-register` require from `index.js`
- [ ] Remove `node-cron` and in-process cron schedules from `index.js` (now handled by Render)

### Step 2.4 — Remove @react-pdf/renderer usages
- [ ] Audit `utils/payslipDocument.jsx` and `utils/summaryDocument.jsx`
- [ ] Rewrite using `pdfkit` only
- [ ] Delete `.jsx` files — no JSX needed on backend

---

## Workstream 3: Storage Migration to R2 (Est. 1 day)

### Step 3.1 — Create storage service
- [ ] Create `backend/lib/storage.js` — S3-compatible client pointed at R2
```js
// Uses @aws-sdk/client-s3 with R2 endpoint
// Exports: uploadFile(key, buffer, contentType), getFileUrl(key), deleteFile(key)
```

### Step 3.2 — Replace GCS references
- [ ] Search all routes/services for `@google-cloud/storage` usage
- [ ] Replace each with `storage.uploadFile` / `storage.getFileUrl`

### Step 3.3 — Replace Supabase Storage references
- [ ] Search all routes/services for Supabase storage calls
- [ ] Replace each with `storage.uploadFile` / `storage.getFileUrl`

### Step 3.4 — Migrate existing files
- [ ] Write a one-time migration script to copy files from GCS + Supabase → R2
- [ ] Run in staging first, verify, then run in production
- [ ] Remove `lib/supabase.js` storage config (keep auth if used elsewhere)

---

## Workstream 4: Email Migration to Resend (Est. half day)

### Step 4.1 — Resend setup
- [ ] Create Resend account at resend.com (free: 3,000 emails/month)
- [ ] Verify your sending domain in Resend (adds DNS records via Cloudflare — one stop)
- [ ] Get API key, add `RESEND_API_KEY` to Render env vars

### Step 4.2 — Replace mailer
- [ ] Rewrite `backend/lib/mailer.js` to use `resend` SDK
- [ ] Keep the same exported functions (`sendPasswordReset`, `sendNotification`, etc.)
- [ ] No changes needed in calling code

---

## Workstream 5: Backend Restructure (Est. 1 week)

### Step 5.1 — Session cache (quick win, do first)
- [ ] Add in-memory session cache to `backend/lib/auth.js`
- [ ] Cache TTL: 60 seconds
- [ ] On logout: evict from cache + delete from DB
- [ ] Test: login, make 10 requests, confirm only 1 DB session lookup

### Step 5.2 — Create service layer skeleton
Create empty service files:
- [ ] `backend/services/auth.service.js`
- [ ] `backend/services/payroll.service.js`
- [ ] `backend/services/leave.service.js`
- [ ] `backend/services/statutory.service.js`
- [ ] `backend/services/documents.service.js`
- [ ] `backend/services/notifications.service.js`
- [ ] `backend/services/storage.service.js`

### Step 5.3 — Consolidate routes (one domain at a time)

Work through each domain router. For each:
- [ ] Create `backend/routes/v2/<domain>.js`
- [ ] Move route handlers in
- [ ] Extract business logic into the matching `services/<domain>.service.js`
- [ ] Update `index.js` to use new router
- [ ] Delete old route files
- [ ] Test all endpoints in that domain before moving on

**Order (least risky first):**
1. [ ] `settings.js` — systemSettings, setup, workPeriodSettings, publicHolidays, transactionCodes
2. [ ] `admin.js` — admin, clients, companies, licenses, subscriptions, auditLogs
3. [ ] `loans.js` — loans
4. [ ] `attendance.js` — attendance, biometric, devices, shifts, roster
5. [ ] `reports.js` — reports, payrollUsers, payTransactions, employeeTransactions
6. [ ] `leave.js` — leave, leaveBalances, leaveEncashments, leavePolicies
7. [ ] `employees.js` — employees, grades, departments, branches, employeeFields
8. [ ] `statutory.js` — taxTables, taxBands, nssaContributions, nssaSettings, necTables, statutoryExports, statutoryRates, currencyRates
9. [ ] `documents.js` — payslips, payslipExports, payslipSummaries, payslipTransactions, bankFiles, download
10. [ ] `payroll.js` — payroll, payrollCore, payrollInputs, payrollCalendar, payrollLogs, periodEnd, backPay, payIncrease
11. [ ] `auth.js` — auth, user, employeeSelf
12. [ ] `platform.js` — sync, desktop, backup, webhooks, cron

### Step 5.4 — Clean up index.js
- [ ] Remove all individual route requires
- [ ] Replace with 12 domain router requires
- [ ] Remove dead code (seed endpoints can move to admin router)
- [ ] Target: index.js under 100 lines

---

## Definition of Done

- [ ] Login responds in under 2 seconds on first load
- [ ] All 60+ route files replaced by 12 domain routers
- [ ] No business logic in route handlers — services only
- [ ] Single storage provider (R2)
- [ ] Single email provider (Resend)
- [ ] `node-cron` removed — cron jobs run via Render scheduler
- [ ] `index.js` under 100 lines
- [ ] All existing functionality works (manual smoke test per domain)
