# Bantu v2 — Full Cloudflare Migration Design

**Date:** 2026-05-11  
**Strategy:** Build v2 in parallel with v1. Switch over when ready. Decommission Render.

---

## Goals

- Eliminate Render entirely — one platform (Cloudflare) for compute, storage, and networking
- Zero cold starts — Cloudflare Workers run at the edge, always warm
- Consolidate infrastructure — DNS, WAF, storage, cron, compute all in one place
- Clean backend architecture — 12 domain routers, service layer, no logic in route handlers
- No disruption to v1 — trial clients keep working throughout

---

## Architecture: v1 vs v2

```
v1 (current)                        v2 (target)
────────────────────────────────    ────────────────────────────────────────
Render (Express, Node.js)           Cloudflare Workers (Hono)
Supabase Storage                    Cloudflare R2
Nodemailer (raw SMTP)               Resend
node-cron (in-process)              Cloudflare Cron Triggers
Vercel (frontend)                   Vercel (frontend) — unchanged
Neon (Postgres)                     Neon (Postgres) — unchanged
```

---

## Parallel Build Strategy

- v1 stays live and untouched at `api.bantupayroll.com` → Render
- v2 is built at `api-v2.bantupayroll.com` → Cloudflare Workers
- Both point at the **same Neon database** during development
- v2 uses R2 for storage from day one
- Cutover = single DNS change: `api.bantupayroll.com` → Cloudflare Workers
- Render decommissioned after 48h cutover monitoring period

---

## Tech Choices

### Framework: Hono

Hono is the standard for Cloudflare Workers APIs. It is:
- Express-like routing — familiar, minimal learning curve
- Built for Workers runtime — no Node.js polyfills needed
- TypeScript-first
- Supports middleware chains identical to Express

### Database: Prisma + Neon (unchanged)

Prisma works on Cloudflare Workers via `@prisma/adapter-neon` with connection pooling through Neon's serverless driver. No schema changes. Same models.

### Storage: Cloudflare R2

All file operations go through a single `storage` service:
- `upload(key, buffer, contentType)` — stores file in R2
- `getSignedUrl(key, expiresIn)` — generates time-limited download URL
- `delete(key)` — removes file

Files stored: payslip PDFs, bank payment files, statutory exports, employee documents, backups.

### Email: Resend

Replaces Nodemailer. Clean REST API, reliable delivery, domain verification via Cloudflare DNS (one-stop setup). Free tier: 3,000 emails/month.

### Cron: Cloudflare Cron Triggers

Replaces `node-cron` in-process scheduling. Configured in `wrangler.toml`:
- Leave accrual: `5 0 1 * *` (1st of month, 00:05)
- Notifications: `0 7 * * *` (daily, 07:00)

### Secret Management: Cloudflare Workers Secrets

All environment variables stored as Workers secrets via `wrangler secret put`. No `.env` files in production.

---

## v2 Backend Structure

```
backend-v2/
  src/
    index.ts                  — Hono app entry, middleware, route mounting
    routes/
      auth.ts
      employees.ts
      payroll.ts
      leave.ts
      statutory.ts
      documents.ts
      loans.ts
      attendance.ts
      settings.ts
      reports.ts
      admin.ts
      platform.ts
    services/
      auth.service.ts
      payroll.service.ts
      leave.service.ts
      statutory.service.ts
      documents.service.ts
      notifications.service.ts
      storage.service.ts
    lib/
      prisma.ts               — Prisma client with Neon serverless adapter
      auth.ts                 — JWT sign/verify, session middleware
      permissions.ts          — Role + permission checks
      storage.ts              — R2 client (S3-compatible)
      mailer.ts               — Resend client
      validate.ts             — Zod validation middleware
    jobs/
      leaveAccrual.ts         — Cron trigger handler
      notifications.ts        — Cron trigger handler
  wrangler.toml               — Workers config, cron triggers, R2 bindings
  package.json
  tsconfig.json
```

### Route → Service pattern (enforced throughout)

Routes are thin — validate input, call service, return response:

```ts
// routes/employees.ts
router.get('/', zValidator('query', listSchema), async (c) => {
  const employees = await employeeService.list(c.get('companyId'));
  return c.json(employees);
});

// services/employees.service.ts
export const list = async (companyId: string) => {
  return prisma.employee.findMany({ where: { companyId } });
};
```

---

## Domain Routers

| Router | Responsibilities |
|---|---|
| `auth.ts` | Login, register, password reset, session management |
| `employees.ts` | Employees, grades, departments, branches, documents |
| `payroll.ts` | Payroll runs, payslips, inputs, calendar, period end, back pay |
| `leave.ts` | Leave requests, balances, encashments, policies |
| `statutory.ts` | Tax tables, NSSA, NEC, statutory exports, currency rates |
| `documents.ts` | File uploads, payslip exports, bank files |
| `loans.ts` | Loans, repayments |
| `attendance.ts` | Attendance, biometric devices, shifts, roster |
| `settings.ts` | System settings, work period, public holidays, transaction codes |
| `reports.ts` | All report generation |
| `admin.ts` | Platform admin — clients, licenses, subscriptions, audit logs |
| `platform.ts` | Backup, sync, webhooks (Stripe), cron trigger endpoints |

---

## Middleware Chain

```
Request
  → CORS
  → Helmet (security headers)
  → Rate limiting (per route group)
  → authenticateToken (JWT + session check)
  → companyContext (resolve + validate companyId)
  → Route handler
  → Error handler
```

Session validation uses an in-memory cache (60s TTL) to avoid a DB hit on every request.

---

## Cutover Plan

1. v2 passes full smoke test against staging data
2. Update `VITE_DESKTOP_API_URL` and `VITE_API_URL` in frontend env to point at v2
3. Deploy frontend to Vercel
4. Change DNS: `api.bantupayroll.com` CNAME → Cloudflare Workers route
5. Monitor for 48 hours — watch Cloudflare analytics + Neon query logs
6. If all clear: cancel Render subscription, remove Supabase storage bucket
7. Archive v1 backend code in a `v1-archive` branch

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Prisma compatibility on Workers | Use `@prisma/adapter-neon` — officially supported |
| Long-running payroll jobs hitting Workers CPU limits | Workers have 30s CPU limit — payroll processing must be async (queue or chunked) |
| Package incompatibility (Node.js APIs) | Audit each package against Workers runtime before building |
| Data loss during cutover | v1 and v2 share same DB — no data migration, rollback = DNS revert |
| Desktop app pointing at old URL | Update `VITE_DESKTOP_API_URL` before cutover |

---

## Workers CPU Limit — Payroll Processing

Cloudflare Workers have a **30-second CPU time limit** per request. Standard payroll runs for 200 employees may approach this. Solution:

- Break payroll processing into chunks — process in batches of 50 employees
- Return a job ID immediately, poll for completion
- Use **Cloudflare Queues** (free tier) for async processing if batching isn't enough

This is the only architectural difference from the current Express approach and must be designed carefully.

---

## Summary

| Metric | v1 | v2 |
|---|---|---|
| Cold starts | Yes (Render free) | None |
| Hosting platforms | 2 (Render + Vercel) | 2 (Cloudflare + Vercel) |
| Storage providers | 2 (GCS + Supabase) | 1 (R2) |
| Email provider | Nodemailer (SMTP) | Resend |
| Route files | 60+ | 12 |
| Language | JavaScript (CommonJS) | TypeScript (ESM) |
| Monthly fixed cost | ~$7 (Render) | ~$0 (Workers free tier) |
| Framework | Express | Hono |
