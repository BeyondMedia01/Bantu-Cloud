# Implementation Plan: Bantu v2 — Full Cloudflare Migration

**Spec:** `docs/superpowers/specs/2026-05-11-v2-cloudflare-migration-design.md`  
**Date:** 2026-05-11  
**Est. total:** 3–4 weeks  
**v1 stays live throughout — no disruption to trial clients**

---

## Phase 1: Cloudflare Setup (Day 1)

### Step 1.1 — Cloudflare Account & Domain
- [ ] Create Cloudflare account (free plan)
- [ ] Add domain to Cloudflare — update nameservers at registrar
- [ ] Wait for DNS propagation
- [ ] Set existing Render backend (`api.bantupayroll.com`) as proxied A record → keeps v1 working through Cloudflare

### Step 1.2 — Cloudflare R2
- [ ] Enable R2 in Cloudflare dashboard
- [ ] Create bucket: `bantu-production`
- [ ] Create bucket: `bantu-staging` (for v2 development)
- [ ] Generate R2 API token with Object Read & Write permissions
- [ ] Note credentials: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`

### Step 1.3 — Cloudflare WAF (free rules)
- [ ] Enable managed ruleset (blocks SQLi, XSS, common attacks)
- [ ] Add rate limit rule: `/api/auth/*` → 10 requests/minute per IP
- [ ] Verify existing v1 traffic still flows correctly

### Step 1.4 — Resend Account
- [ ] Create account at resend.com
- [ ] Add and verify sending domain (adds DNS records via Cloudflare)
- [ ] Note `RESEND_API_KEY`

### Step 1.5 — Fix Frontend Hardcoded URL (15 min)
- [ ] Replace hardcoded Render URL in `frontend/src/api/client.ts` with `import.meta.env.VITE_DESKTOP_API_URL`
- [ ] Add `VITE_DESKTOP_API_URL=https://bantu-cloud.onrender.com/api` to `frontend/.env`
- [ ] Deploy frontend to Vercel — v1 still works, URL now configurable

---

## Phase 2: v2 Project Scaffold (Day 2)

### Step 2.1 — Create backend-v2 directory
- [ ] Create `backend-v2/` at repo root (alongside existing `backend/`)
- [ ] Init: `npm init -y`
- [ ] Install core deps:
  ```bash
  npm install hono @hono/zod-validator zod
  npm install @prisma/client @prisma/adapter-neon @neondatabase/serverless
  npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
  npm install resend
  npm install jsonwebtoken bcryptjs
  npm install -D wrangler typescript @types/node prisma
  ```

### Step 2.2 — Wrangler config
- [ ] Create `backend-v2/wrangler.toml`:
  ```toml
  name = "bantu-api-v2"
  main = "src/index.ts"
  compatibility_date = "2024-01-01"
  compatibility_flags = ["nodejs_compat"]

  [[r2_buckets]]
  binding = "STORAGE"
  bucket_name = "bantu-production"

  [triggers]
  crons = ["5 0 1 * *", "0 7 * * *"]
  ```

### Step 2.3 — Copy and adapt Prisma schema
- [ ] Copy `backend/prisma/schema.prisma` to `backend-v2/prisma/schema.prisma`
- [ ] Update generator to use `@prisma/adapter-neon`
- [ ] Run `npx prisma generate`

### Step 2.4 — Core lib files
- [ ] `src/lib/prisma.ts` — Neon serverless adapter
- [ ] `src/lib/auth.ts` — JWT sign/verify, session middleware, in-memory session cache
- [ ] `src/lib/permissions.ts` — copy and convert to TypeScript
- [ ] `src/lib/storage.ts` — R2 client (`upload`, `getSignedUrl`, `delete`)
- [ ] `src/lib/mailer.ts` — Resend client (`sendPasswordReset`, `sendNotification`)
- [ ] `src/lib/validate.ts` — Zod middleware helper

### Step 2.5 — Main entry point
- [ ] `src/index.ts` — Hono app, global middleware, route mounting, error handler, cron handler

---

## Phase 3: Domain Routers + Services (Week 1–2)

Build one domain at a time. For each domain:
1. Create the service file with all business logic
2. Create the route file (thin — validate, call service, respond)
3. Mount on the Hono app in `index.ts`
4. Test against the shared Neon DB

**Order (least complex → most complex):**

### Step 3.1 — Auth domain
- [ ] `src/services/auth.service.ts` — login, register, password reset, session management
- [ ] `src/routes/auth.ts`
- [ ] Test: login returns JWT, invalid credentials return 401, lockout works

### Step 3.2 — Settings domain
- [ ] `src/services/settings.service.ts`
- [ ] `src/routes/settings.ts` — systemSettings, workPeriod, publicHolidays, transactionCodes
- [ ] Test: settings load, updates persist

### Step 3.3 — Admin domain
- [ ] `src/services/admin.service.ts`
- [ ] `src/routes/admin.ts` — clients, licenses, subscriptions, auditLogs
- [ ] Test: PLATFORM_ADMIN can list clients, CLIENT_ADMIN gets 403

### Step 3.4 — Loans domain
- [ ] `src/services/loans.service.ts`
- [ ] `src/routes/loans.ts`
- [ ] Test: create loan, repayment schedules generate correctly

### Step 3.5 — Attendance domain
- [ ] `src/services/attendance.service.ts`
- [ ] `src/routes/attendance.ts` — attendance, biometric, devices, shifts, roster
- [ ] Test: attendance logs load per company

### Step 3.6 — Storage service (before documents domain)
- [ ] `src/services/storage.service.ts` — wraps `lib/storage.ts`
- [ ] Test: upload a file to `bantu-staging` R2 bucket, retrieve signed URL

### Step 3.7 — Documents domain
- [ ] `src/services/documents.service.ts` — file uploads → R2, payslip exports, bank files
- [ ] `src/routes/documents.ts`
- [ ] Switch from `multer.diskStorage` to `multer.memoryStorage` + R2 upload
- [ ] Test: upload employee document, retrieve via signed URL

### Step 3.8 — Reports domain
- [ ] `src/services/reports.service.ts`
- [ ] `src/routes/reports.ts`
- [ ] Test: key reports return correct data

### Step 3.9 — Leave domain
- [ ] `src/services/leave.service.ts` — requests, balances, encashments, policies, accrual
- [ ] `src/routes/leave.ts`
- [ ] Test: submit leave request, balance deducts correctly

### Step 3.10 — Statutory domain
- [ ] `src/services/statutory.service.ts` — ZIMRA PAYE, NSSA, NEC, tax tables, exports
- [ ] `src/routes/statutory.ts`
- [ ] Test: known salary inputs produce correct PAYE and NSSA deductions

### Step 3.11 — Employees domain
- [ ] `src/services/employees.service.ts`
- [ ] `src/routes/employees.ts` — employees, grades, departments, branches
- [ ] Test: create employee, appears in list, scoped to correct company

### Step 3.12 — Payroll domain (most complex)
- [ ] `src/services/payroll.service.ts` — payroll run, period end, back pay, pay increase
- [ ] Design chunked processing (batches of 50 employees) to stay under Workers 30s CPU limit
- [ ] `src/routes/payroll.ts`
- [ ] Test: run payroll for 10 employees, payslips generate correctly, statutory deductions match v1

### Step 3.13 — Platform domain
- [ ] `src/routes/platform.ts` — backup (→ R2), webhooks (Stripe), cron endpoints, sync
- [ ] `src/jobs/leaveAccrual.ts` — cron trigger handler
- [ ] `src/jobs/notifications.ts` — cron trigger handler
- [ ] Test: Stripe webhook verifies signature, cron handlers run without error

---

## Phase 4: Frontend Polish (Week 3)

Run this in parallel with Phase 3 testing. Reference plan:
`docs/superpowers/plans/2026-05-11-frontend-polish.md`

- [ ] Replace axios with fetch (`src/api/http.ts`)
- [ ] Split `api/client.ts` into 12 domain API files
- [ ] Create domain hooks
- [ ] Settings → TanStack Query
- [ ] Point frontend at v2 staging URL for testing

---

## Phase 5: Staging Validation (2–3 days)

- [ ] Deploy v2 Workers to `api-v2.bantupayroll.com`
- [ ] Run full smoke test against production Neon DB (read-only paths first)
- [ ] Run payroll for a test company end-to-end
- [ ] Verify statutory calculations match v1 output exactly
- [ ] Verify file uploads/downloads via R2 signed URLs
- [ ] Verify email delivery via Resend
- [ ] Verify cron triggers fire correctly
- [ ] Verify Stripe webhook processes correctly
- [ ] Load test: simulate 50 concurrent users

---

## Phase 6: Cutover (Day 1)

- [ ] Update `VITE_DESKTOP_API_URL` and `VITE_API_URL` to `https://api.bantupayroll.com`
- [ ] Deploy frontend to Vercel
- [ ] Change DNS: `api.bantupayroll.com` → Cloudflare Workers route
- [ ] Verify login works on web and desktop
- [ ] Verify payroll, leave, reports load correctly
- [ ] Monitor Cloudflare analytics + Neon query logs for 48 hours

---

## Phase 7: Decommission (48h after cutover)

- [ ] Confirm no traffic hitting Render (check Render dashboard)
- [ ] Cancel Render subscription
- [ ] Delete Supabase storage bucket (after confirming all files migrated to R2)
- [ ] Remove GCS credentials from all env configs
- [ ] Archive v1: `git checkout -b v1-archive && git push origin v1-archive`
- [ ] Delete `backend/` directory from main branch
- [ ] Update README

---

## Definition of Done

- [ ] `api.bantupayroll.com` serves Cloudflare Workers (Hono)
- [ ] Render subscription cancelled
- [ ] All file storage on R2
- [ ] All email via Resend
- [ ] Cron jobs run via Cloudflare Cron Triggers
- [ ] Frontend uses domain API files + hooks, no axios
- [ ] Statutory calculations match v1 output exactly
- [ ] Login response under 500ms
- [ ] Zero cold starts
- [ ] v1 code archived on `v1-archive` branch

---

## File Reference

| Doc | Path |
|---|---|
| v2 migration spec | `docs/superpowers/specs/2026-05-11-v2-cloudflare-migration-design.md` |
| Backend simplification spec | `docs/superpowers/specs/2026-05-11-backend-simplification.md` |
| Frontend polish spec | `docs/superpowers/specs/2026-05-11-frontend-polish-design.md` |
| Frontend polish plan | `docs/superpowers/plans/2026-05-11-frontend-polish.md` |
