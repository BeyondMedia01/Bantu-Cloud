# Bantu Platform Audit Report
**Date:** 2026-03-23
**Status:** IN PROGRESS
**Sweep target:** 191
**Files reviewed:** 22

## Summary

| Severity | Security | Business Logic | Code Quality | Performance | Total |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High | 2 | 0 | 0 | 0 | 2 |
| Medium | 2 | 0 | 0 | 0 | 2 |
| Low | 1 | 0 | 0 | 0 | 1 |
| **Total** | 5 | 0 | 0 | 0 | **5** |

*Update this table after each sweep batch.*

---

## Findings

<!-- Findings are appended below as sweep progresses -->

<!-- Task 2: Auth infrastructure sweep — 2026-03-23 -->

### [High] Biometric route has no authentication or rate limiting
- **File**: `backend/index.js:57`
- **Domain**: Security
- **Issue**: `/api/biometric` is mounted before the global `authenticateToken` middleware and has no rate limiter applied. The comment states devices authenticate via "serial + webhookKey", but this custom auth is entirely inside the route handler — if that check is absent or bypassable, the endpoint is fully open. There is also no rate limiting to prevent brute-force or flooding attacks against the biometric webhook.
- **Fix**: Apply `authLimiter` (or a dedicated device limiter) to `/api/biometric` in `index.js`: `app.use('/api/biometric', deviceLimiter, require('./routes/biometric'));`. Ensure the route handler enforces the serial + webhookKey check on every handler and returns 401 on failure.

### [High] Webhook route has no rate limiting
- **File**: `backend/index.js:18`
- **Domain**: Security
- **Issue**: `/api/webhooks` (Stripe webhooks) is mounted with no rate limiter. While Stripe signs its payloads, an attacker can flood this endpoint with invalid requests, causing unnecessary CPU and DB load or triggering denial-of-service conditions.
- **Fix**: Apply a rate limiter to `/api/webhooks`: `app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookLimiter, require('./routes/webhooks'));`. A generous limit (e.g., 200 req/15 min per IP) is sufficient to protect against floods while not blocking legitimate Stripe delivery retries.

### [Medium] CORS origin falls back to localhost if FRONTEND_URL is unset
- **File**: `backend/index.js:23`
- **Domain**: Security
- **Issue**: `origin: process.env.FRONTEND_URL || 'http://localhost:5173'` means that if `FRONTEND_URL` is not set in a production environment, CORS will only allow `localhost:5173`. While this restricts rather than opens access, a misconfigured deployment would silently break the frontend and an operator might be tempted to switch to `origin: '*'` as a quick fix, which would be critical.
- **Fix**: Add a startup assertion that `FRONTEND_URL` is set in non-development environments: `if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) { console.error('FATAL: FRONTEND_URL must be set in production'); process.exit(1); }`. Tag: `MANUAL` — confirm the correct production URL.

### [Medium] companyContext permits unauthenticated access to req.user properties without guard
- **File**: `backend/middleware/companyContext.js:23`
- **Domain**: Security
- **Issue**: At line 23, `companyContext` destructures `req.user` unconditionally (`const { role, userId } = req.user;`) after checking `companyId` is present — but this block is only reached when `companyId` is set. If `companyContext` is ever inadvertently applied before `authenticateToken` (or on a route where `authenticateToken` is skipped), `req.user` will be `undefined` and the destructure will throw a runtime 500 error rather than returning a clean 401. The comment "Must run AFTER authenticateToken" is documentation-only with no programmatic enforcement.
- **Fix**: Add an explicit guard at the top of the `companyContext` function before accessing `req.user`: `if (!req.user) return res.status(401).json({ message: 'Authentication required' });`

### [Low] authLimiter window is 20 requests per 15 minutes — may be too permissive for login
- **File**: `backend/index.js:37`
- **Domain**: Security
- **Issue**: The `authLimiter` allows 20 attempts per 15-minute window per IP. This limit applies to all `/api/auth` routes (login, register, forgot-password, reset-password) combined. For a dedicated login brute-force scenario, 20 password attempts per 15 minutes (96 per hour) is relatively permissive, especially if an attacker rotates IPs or uses a CDN exit node shared across many users.
- **Fix**: Consider reducing the login limit to 5–10 attempts per 15-minute window, or apply a tighter limiter specifically to `POST /api/auth/login` while keeping the broader limit for other auth routes. `MANUAL` — confirm acceptable threshold with product/ops team.

<!-- Task 3 Batch A: Payroll & Financial routes sweep — 2026-03-23 -->

### [High] `POST /preview` DB call is outside try/catch — unhandled promise rejection on Prisma error
- **File**: `backend/routes/payroll.js:116`
- **Domain**: Code Quality
- **Issue**: The period-lock check at line 116 (`prisma.payrollCalendar.findFirst(...)`) is executed outside the `try` block (which starts at line 133). If Prisma throws (e.g., DB connection failure), the error is an unhandled promise rejection, crashing the process in Node.js versions ≥15 and returning no response to the caller in earlier versions.
- **Fix**: Move the period-lock query inside the `try` block, or wrap the entire handler body in a single top-level try/catch with `next(err)`.

### [High] `payslipExports` GET/POST/PATCH read `x-company-id` header directly instead of `req.companyId` — bypasses `companyContext` middleware
- **File**: `backend/routes/payslipExports.js:8`
- **Domain**: Security
- **Issue**: All three handlers in `payslipExports.js` read `companyId` directly from `req.headers['x-company-id']` rather than from `req.companyId` set by the `companyContext` middleware. This means no cross-tenant ownership validation occurs — any authenticated user can supply an arbitrary `x-company-id` header and read or write export records for a company they do not belong to.
- **Fix**: Replace `req.headers['x-company-id']` with `req.companyId` (populated by `companyContext`) in all handlers. The `PATCH /:id` and `DELETE /:id` handlers also need ownership checks (look up the record and verify `record.companyId === req.companyId` before mutating).

### [High] `payrollLogs` GET/POST read `x-company-id` header directly — same bypass as payslipExports
- **File**: `backend/routes/payrollLogs.js:8`
- **Domain**: Security
- **Issue**: Both handlers read `const companyId = req.headers['x-company-id']` instead of `req.companyId`. An authenticated user from any company can read all audit log entries for any other company by setting a different header value, and can also write spoofed log entries under an arbitrary company ID.
- **Fix**: Replace `req.headers['x-company-id']` with `req.companyId` in both handlers. For the POST handler also consider restricting log creation to server-side internal calls rather than exposing it as a public API endpoint.

### [High] `payslips.js` GET `/:id` returns the full `employee` object (no field selection) — may expose sensitive employee data
- **File**: `backend/routes/payslips.js:49`
- **Domain**: Security
- **Issue**: The `GET /api/payslips/:id` handler uses `include: { employee: true }` with no `select` clause. This returns every column on the Employee record including personal fields such as `idPassport`, `tin`, `socialSecurityNum`, `bankAccountUSD`, `bankAccountZiG`, and potentially any future sensitive fields added to the model, to any authenticated user with access to that payslip.
- **Fix**: Replace `employee: true` with `employee: { select: { firstName: true, lastName: true, employeeCode: true, position: true } }` (add only fields the payslip view requires). Apply the same pattern to `payrollRun: { include: { company: true } }` to avoid leaking the full Company record.

### [High] `reports.js` `GET /tax` accepts arbitrary `companyId` query param — IDOR across companies
- **File**: `backend/routes/reports.js:67`
- **Domain**: Security
- **Issue**: `const targetCompanyId = companyId || req.companyId;` — any user can pass `?companyId=<other-company-id>` and retrieve the full P16 annual tax report for a company they are not authorised for. There is no check that `targetCompanyId` matches `req.companyId` or that the requesting user belongs to that company.
- **Fix**: Remove the `companyId` query parameter entirely and always use `req.companyId`. If cross-company access is needed for CLIENT-role users, add an explicit check: `if (companyId && companyId !== req.companyId) { /* verify req.user belongs to that company or has CLIENT scope */ }`.

### [High] `reports.js` `GET /p2` same IDOR — arbitrary `companyId` accepted in query string
- **File**: `backend/routes/reports.js:370`
- **Domain**: Security
- **Issue**: Same pattern as `/tax`: `const targetCompanyId = companyId || req.companyId` with no ownership validation. The P2 return contains gross salary, PAYE, and AIDS levy figures for every employee in the target company — highly sensitive payroll financial data.
- **Fix**: Same fix as `/tax` — drop the `companyId` query param and enforce `req.companyId`.

### [Medium] `payslipTransactions.js` POST spreads `req.body` directly into Prisma `create` — mass-assignment risk
- **File**: `backend/routes/payslipTransactions.js:33`
- **Domain**: Security
- **Issue**: `data: { ...req.body, companyId: req.companyId, ... }` passes the entire request body to `prisma.payslipTransaction.create`. An attacker can inject unexpected fields (e.g., `id`, `companyId` overrides, internal flags) that Prisma will attempt to write if they exist on the model. The supplied `companyId` override at the end partially mitigates this for `companyId`, but all other fields are uncontrolled.
- **Fix**: Destructure only the expected fields from `req.body` and build the `data` object explicitly, matching the pattern used in `payrollCore.js`.

### [Medium] `payslipSummaries.js` POST/PUT spread `req.body` directly — mass-assignment risk
- **File**: `backend/routes/payslipSummaries.js:28`
- **Domain**: Security
- **Issue**: `POST` uses `data: { ...req.body, companyId, payPeriod }` and `PUT` uses `data: req.body` with no field filtering. The `PUT /:id` handler additionally performs no ownership check — any authenticated user with `companyId` header can update any `PayslipSummary` record by ID regardless of which company it belongs to.
- **Fix**: Whitelist fields in both handlers. Add an ownership lookup in `PUT /:id`: fetch the record, verify `record.companyId === req.companyId`, and return 403 if not.

### [Medium] `payTransactions.js` POST/PUT spread `req.body` with no validation — mass-assignment risk
- **File**: `backend/routes/payTransactions.js:26`
- **Domain**: Security
- **Issue**: `POST` uses `data: { ...req.body, companyId }` and `PUT /:id` uses `data: req.body` with no field whitelist. The `PUT` also has no ownership check — any company user can overwrite any `PayTransaction` record by ID. The `DELETE /:id` also has no ownership check.
- **Fix**: Whitelist permitted fields for both mutation handlers. Add ownership checks in `PUT /:id` and `DELETE /:id` (fetch record, assert `record.companyId === req.companyId`).

### [Medium] `payslipExports.js` PATCH and DELETE have no ownership checks
- **File**: `backend/routes/payslipExports.js:77`
- **Domain**: Security
- **Issue**: `PATCH /:id` and `DELETE /:id` do not verify that the targeted `PayslipExport` record belongs to the requesting company. Any authenticated user (with any company context) can mutate or delete another company's export record if they know its ID.
- **Fix**: Before updating/deleting, look up the record and assert `record.companyId === req.companyId`, returning 403 on mismatch.

### [Medium] `payslipExports.js` GET returns `bankAccountUSD` and `bankAccountZiG` for all employees in the list
- **File**: `backend/routes/payslipExports.js:17`
- **Domain**: Security
- **Issue**: The list endpoint returns `employee.bankAccountUSD` and `employee.bankAccountZiG` as part of every export record. Full bank account numbers should not be returned in a list API response; they should be masked or excluded unless specifically needed for a detail view.
- **Fix**: Remove `bankAccountUSD` and `bankAccountZiG` from the `select` in the list query, or replace with masked values (last 4 digits only).

### [Low] `payrollInputs.js` import endpoint does not validate file size — potential memory exhaustion
- **File**: `backend/routes/payrollInputs.js:207`
- **Domain**: Security
- **Issue**: `multer({ storage: multer.memoryStorage() })` stores the entire uploaded file in memory with no size limit. An attacker (or misconfigured client) can upload a very large file to the `/api/payroll-inputs/import` endpoint, causing the process to consume excessive heap memory.
- **Fix**: Add a `limits` option to multer: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })` (5 MB is generous for a CSV/XLSX import).
