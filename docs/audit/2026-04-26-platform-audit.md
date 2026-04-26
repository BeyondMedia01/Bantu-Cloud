# Bantu Platform Audit — 2026-04-26

**Status:** IN PROGRESS
**Sweep target:** Backend (routes, core, schema) + Frontend (pages, components, API/auth)
**Prior audit:** docs/audit/2026-03-23-platform-audit.md

---

## Summary

| Severity | Security | Business Logic | Code Quality | Performance | Total |
|---|---|---|---|---|---|
| Critical | — | — | — | — | — |
| High | — | — | — | — | — |
| Medium | — | — | — | — | — |
| Low | — | — | — | — | — |
| **Total** | — | — | — | — | — |

*(Populated after all tasks complete)*

---

## March 2026 Fix Verification

| ID | Finding (short title) | Status | Notes |
|---|---|---|---|
| V-001 | Biometric route auth + rate limiting | ✅ Confirmed | `backend/index.js:104-111` mounts `deviceLimiter` on `/api/biometric`; `routes/biometric.js` enforces `webhookKey` on ZKTeco POST, Hikvision and import endpoints. ZKTeco GET handshake remains intentionally open (device discovery). |
| V-002 | Webhook route rate limiting | ✅ Confirmed | `webhookLimiter` (200/15 min) applied at `backend/index.js:44-51` before the webhook router and the raw body parser. |
| V-003 | CORS / FRONTEND_URL fail-fast | ✅ Confirmed | `backend/index.js:28-35` exits 1 if `FRONTEND_URL`, `DATABASE_URL`, or `JWT_SECRET` are missing in production. CORS still uses `localhost:5173` fallback for dev. |
| V-004 | companyContext guards `req.user` | ✅ Confirmed | `backend/middleware/companyContext.js:13` returns 401 before any `req.user` destructure. |
| V-005 | authLimiter tightened to 5 / 15 min | ✅ Confirmed | `backend/index.js:70-76` sets `max: 5, windowMs: 15*60*1000`. Per-account lockout in `routes/auth.js` adds a second layer. |
| V-006 | `payrollLogs` x-company-id bypass | ✅ Confirmed (route now uses `req.companyId`) | `routes/payrollLogs.js:7,42` reads `req.companyId`. **Caveat:** the file is no longer mounted in `index.js` — dead code, see S-018. |
| V-007 | `payslipExports` x-company-id bypass + ownership | ✅ Confirmed | `routes/payslipExports.js` now uses `req.companyId` and the PATCH/DELETE handlers verify `record.companyId === req.companyId`. **Caveat:** also unmounted in `index.js` — see S-018. |
| V-008 | `payslips.js` GET /:id field selection | ✅ Confirmed | `routes/payslips.js:46-70` uses `select` on employee (firstName/lastName/employeeCode/position/department.name) and a tight company `select`. |
| V-009 | `reports.js` `/tax` IDOR via `companyId` query | ✅ Confirmed | `routes/reports/statutory.js:46` uses `req.companyId` only — no query-string fallback. |
| V-010 | `reports.js` `/p2` IDOR via `companyId` query | ✅ Confirmed | `routes/reports/statutory.js:275` uses `req.companyId` only. |
| V-011 | `payslipTransactions` POST mass-assignment + DELETE ownership | ✅ Confirmed | `routes/payslipTransactions.js:32-49` whitelists fields; DELETE verifies `companyId` ownership. **Caveat:** also unmounted — see S-018. |
| V-012 | `payslipSummaries` mass-assignment + ownership | ⚠️ Cannot verify | File `routes/payslipSummaries.js` does not exist in `backend/routes/`; treated as removed. |
| V-013 | `payTransactions` mass-assignment + ownership | ⚠️ Cannot verify | File `routes/payTransactions.js` does not exist in `backend/routes/`; treated as removed. |
| V-014 | `payrollInputs.js` import file-size limit | ✅ Confirmed | `routes/payrollInputs.js:8` sets `limits: { fileSize: 10 * 1024 * 1024 }` (10 MB — looser than the 5 MB suggested but bounded). |
| V-015 | `employees.js` GET / field selection | ⚠️ Partial | List query at `routes/employees.js:158-189` now uses an explicit `select`. **Regression:** `GET /api/employees/:id` at line 350-371 still uses bare `include` with no Employee `select`, so `tin`, `passportNumber`, `socialSecurityNum`, `taxDirective*` are still returned in single-record responses. See S-001. |
| V-016 | `employeeSelf.js` GET /profile field selection | ✅ Confirmed | Fields whitelisted at `routes/employeeSelf.js:12-32`; `tin`, `passportNumber`, `socialSecurityNum` excluded. |
| V-017 | `leave.js` PUT/DELETE ownership | ✅ Confirmed | PUT at line 168-175 and DELETE at line 322-329 both pre-fetch and assert `employee.companyId === req.companyId`. |
| V-018 | `leave.js` approve/reject ownership + idempotency | ✅ Confirmed | Approve handler at line 197-209 pre-fetches, asserts ownership, and 409s if already APPROVED. |
| V-019 | `loans.js` `/repayments/:id` ownership | ✅ Confirmed | PATCH at line 199-207 traverses `loan.employee.companyId` and 403s on mismatch. |
| V-020 | `grades.js` PUT/DELETE ownership | ✅ Confirmed | PUT/DELETE at lines 66-107 pre-fetch and check `clientId`. |
| V-021 | `departments.js` PUT/DELETE ownership | ✅ Confirmed | Both handlers fetch first and assert `existing.companyId === req.companyId`. |
| V-022 | `branches.js` PUT/DELETE ownership | ✅ Confirmed | Both handlers fetch first and assert `existing.companyId === req.companyId`. |
| V-023 | `departments.js` / `branches.js` POST companyId from body | ✅ Confirmed | Both POST handlers force `companyId = req.companyId`; body `companyId` is ignored. |
| V-024 | `leave.js` GET requirePermission | ✅ Confirmed | `requirePermission('view_leave')` applied at line 9. |
| V-025 | `loans.js` POST verifies target employee in caller's company | ✅ Confirmed | `routes/loans.js:45-49` checks `emp.companyId === req.companyId`. |
| V-026 | `employeeSelf.js` PUT /profile field selection | ✅ Confirmed | Update returns only the safe profile projection. |
| V-027 | `leaveBalances.js` GET /:employeeId leavePolicy select | ✅ Confirmed | Tight `select` at line 63. |
| V-028 | `systemSettings.js` auth + permissions | ⚠️ Partial | `authenticateToken` and `requirePermission('update_settings')` are applied, and the file uses the shared `lib/prisma`. **Regression:** GET `/` (line 12) has no permission check — any authenticated user can read every system setting. |
| V-029 | `taxBands.js` auth + permissions | ⚠️ Partial — and dead code | Auth + `requirePermission('update_settings')` are present. PUT body still spread (`...req.body`) bypassing whitelist (S-008). The route is also dead: there is no `TaxBand` Prisma model, so `prisma.taxBand` is `undefined` and every call throws (S-019). |
| V-030 | `auditLogs.js` auth + permissions | ⚠️ Partial — and dead code | GET has `requirePermission('view_reports')`. POST `/` (line 28) has **no** permission check, allowing arbitrary audit log injection by any authenticated user. Also, `auditLogs.js` is no longer mounted in `index.js` — dead code (S-018). |
| V-031 | `payrollUsers.js` auth + permissions | ⚠️ Partial | `authenticateToken` + `requirePermission('manage_users')` on mutation handlers. **Regression:** `GET /` (line 11) has no permission check; any authenticated user can enumerate payroll user accounts. The `manage_users` permission is also only granted to PLATFORM_ADMIN — CLIENT_ADMINs cannot manage their own payroll users (S-013). Also unmounted in `index.js` (S-018). |
| V-032 | `backup.js` /restore mass-assignment | ⚠️ Partial — broken auth | Whitelisted-model check is present. **Regression #1:** model whitelist still passes raw `item` to upsert; an attacker can include `companyId` / `clientId` overrides inside the item to reassign records cross-tenant (S-002). **Regression #2:** the route uses `requirePermission('manage_company')` (singular) — that permission does not exist in `lib/permissions.js`; the call is therefore unreachable for every role (S-014). |
| V-033 | `taxBands` PUT/DELETE ownership | ⚠️ Partial | An ownership check on `clientId` is present, but the `TaxBand` model itself does not exist (S-019), so the check never executes meaningfully. |
| V-034 | `taxTables.js` GET /:id + bracket ownership | ⚠️ Partial | `GET /:id`, `GET /:id/brackets`, bracket PUT/DELETE all fetch and verify `clientId`. **Regression:** `DELETE /api/tax-tables/:id` at line 205-214 has no ownership check — any `update_settings` user can delete any client's tax tables. `POST /:id/brackets` and `POST /:id/brackets/replace` and `POST /:id/upload` also skip the parent-table ownership check on creation (S-007). |
| V-035 | `nssaContributions.js` requirePermission | ✅ Confirmed | `requirePermission('view_reports')` applied at line 13; pagination capped to 500. |
| V-036 | `subCompanies.js` PUT/DELETE ownership | ✅ Confirmed | Both handlers verify `existing.clientId === callerClientId`. |
| V-037 | `payrollCalendar.js` ownership on PUT/DELETE/GET/close | ⚠️ Partial | PUT at line 88, DELETE at line 133 verify `clientId`. **Regression:** `GET /:id` (line 73-85) and `POST /:id/close` (line 117-130) operate on arbitrary IDs with no ownership assertion (S-005). |
| V-038 | `publicHolidays.js` DELETE ownership | ✅ Confirmed | DELETE asserts `req.user.role === 'PLATFORM_ADMIN'`. **Note:** `POST /` and `POST /seed` still create global holidays under `update_settings` only — see S-006. |
| V-039 | `taxBands` POST mass-assignment | ✅ Confirmed | `routes/taxBands.js:25-36` destructures only known fields. |
| V-040 | `auditLogs.js` POST mass-assignment | ✅ Confirmed (whitelisted) — see V-030 caveat | Body destructured. POST is still unprotected by permissions and the router is unmounted. |
| V-041 | `systemSettings.js` PATCH lastUpdatedBy server-derived | ⚠️ Partial | PATCH at line 75 derives `lastUpdatedBy` server-side. **Regression:** POST `/` (line 25-46) still accepts `lastUpdatedBy` directly from `req.body` and passes it to `prisma.systemSetting.create` — audit attribution can still be spoofed on initial creates (S-009). |
| V-042 | `payrollUsers.js` POST createdBy server-derived | ✅ Confirmed | `routes/payrollUsers.js:44` derives `createdBy` from `req.user`. |
| V-043 | `intelligence.js` `companyId` query fallback | ✅ Confirmed | `routes/intelligence.js` reads `req.companyId` only. **Note:** the auth middleware bars PLATFORM_ADMIN (no `clientId`) — see S-016 for a related issue. |
| V-044 | `backup.js` audit before response | ⚠️ Cannot verify cleanly | `audit()` still runs after `res.json(...)` in the export path (line 78 vs 74). Restore now logs after `res.json`. Audit may be silently dropped on transient failures. |
| V-045 | Shared Prisma singleton (taxBands / auditLogs / payrollUsers) | ✅ Confirmed | All three now `require('../lib/prisma')`. |
| V-046 | `licenseValidate.js` try/catch | ✅ Not re-verified in this sweep | Marked FIXED in March audit; not in scope of this task. |
| V-047 | `setup.js` rate limiter | ✅ Confirmed | `setupLimiter` (10 / hour) at `routes/setup.js:10-16`, plus the global `authLimiter` at `index.js:100`. |
| V-048 | `biometric.js` ZKTeco POST shared-secret | ✅ Confirmed | POST `/zkteco` at `routes/biometric.js:71-80` requires `key` parameter and validates against `device.webhookKey`. |
| V-049 | `nssaContributions.js` pagination | ✅ Confirmed | `take`/`skip` with `limit` capped at 500. |
| V-050 | `payslipTransactions.js` shared Prisma singleton | ✅ Confirmed | Uses `require('../lib/prisma')`. |
| V-051 | `payslips.js` field selection on payrollRun.company | ✅ Confirmed | Tight `select` for company at `routes/payslips.js:60-68`. |

---

## New Findings

### [S-001][High][Security] `GET /api/employees/:id` returns full employee record including TIN, passport, SSN
- **File:** `backend/routes/employees.js:350-371`
- **Issue:** The single-employee endpoint uses `prisma.employee.findUnique({ where: { id }, include: { company: ..., branch: ..., department: ..., grade: ..., bankAccounts: ... } })` with no `select` clause on the Employee model. The full row is returned to anyone who can hit the endpoint, including `tin`, `passportNumber`, `socialSecurityNum`, `taxDirective`, `taxDirectivePerc`, `taxDirectiveAmt`, `nssaNumber`, etc. The list query was hardened in the March sweep (V-015) but the detail handler was missed. EMPLOYEEs with their own ID and any `view_employees` user can therefore extract sensitive PII for any employee in their company.
- **Fix:** Replace the bare `include` with the same `select` projection used by the list endpoint (lines 161-186), adding only the relations the detail view needs (`bankAccounts`, `branch`, `department`, `grade`). Explicitly exclude `tin`, `passportNumber`, `socialSecurityNum`, `taxDirective*` from non-privileged callers — gate exposure of those fields on `req.user.role === 'PLATFORM_ADMIN'` or `manage_employees`.

### [S-002][High][Security] `POST /api/backup/restore` still allows cross-tenant `companyId` reassignment via raw `item` upsert
- **File:** `backend/routes/backup.js:118-126`
- **Issue:** The model-name whitelist added in March prevents arbitrary models from being touched, but `batchUpsert` still passes the entire `item` object straight into `tx[model].upsert({ where: { id: item.id }, update: item, create: item })`. An attacker with `manage_company` permission (see S-014) can supply a backup payload whose Employee/Payslip rows carry a `companyId` or `clientId` field pointing at a tenant they do not control, overwriting or relocating records there. There is no per-record assertion that `item.companyId === req.companyId` (or `clientId === req.clientId` for shared models).
- **Fix:** Before upsert, validate each item against a model-specific field whitelist that drops `id` collisions outside the company, and assert `item.companyId === req.companyId` (or `item.clientId === req.clientId` for `TransactionCode` / `Grade`). Reject the entire restore if any item fails the assertion.

### [S-003][High][Security] `/uploads/documents/*` is served by `express.static` with no authentication
- **File:** `backend/index.js:61` (static mount), `backend/routes/documents.js`
- **Issue:** `app.use('/uploads', express.static(path.join(__dirname, 'uploads')))` is registered before the `authenticateToken` middleware (line 115), so any anonymous HTTP request can fetch `/uploads/documents/<filename>` directly. The upload route writes files with predictable names: `file-<timestamp>-<6-digit-rand>.<ext>` (`routes/documents.js:18-21`). With ~10⁷ filename combinations per second-window the namespace is enumerable, and the URL is also stored unhashed in `EmployeeDocument.fileUrl`, which is itself returned by `GET /api/documents/employee/:employeeId`. Employee documents typically include national ID copies, contracts, and payslips — all sensitive PII.
- **Fix:** Remove the global `express.static('/uploads')` mount and replace with an authenticated download handler at `GET /api/documents/:id/download` that verifies `req.companyId` ownership before streaming the file. At minimum, move uploads to private storage (S3 with signed URLs, or a non-public folder) and serve via a guarded route. Also use `crypto.randomUUID()` instead of timestamp+`Math.random` for filenames.

### [S-004][High][Security] `/api/period-end` POST cross-tenant data corruption — `loanRepayment.updateMany` not scoped to client
- **File:** `backend/routes/periodEnd.js:49-58`
- **Issue:** Inside the period-end transaction the handler runs `tx.loanRepayment.updateMany({ where: { status: 'UNPAID', dueDate: { gte: calendar.startDate, lte: calendar.endDate } }, data: { status: 'OVERDUE' } })` with **no `companyId` / `clientId` filter**. Any authenticated `approve_payroll` user closing their own period will mark every other tenant's UNPAID repayments in the same date window as OVERDUE — both data corruption and a noisy cross-tenant side-effect.
- **Fix:** Scope the update via the loan relation: `where: { status: 'UNPAID', dueDate: { gte: ..., lte: ... }, loan: { employee: { companyId: { in: clientCompanyIds } } } }`. Pre-resolve `clientCompanyIds` from `prisma.company.findMany({ where: { clientId: req.clientId } })` and reuse the same list for any other relational `updateMany` calls in this handler.

### [S-005][High][Security] `payrollCalendar.js` `GET /:id` and `POST /:id/close` lack ownership checks
- **File:** `backend/routes/payrollCalendar.js:73-85, 117-130`
- **Issue:** `GET /:id` returns any payroll calendar by ID with no `clientId` assertion, leaking client structure (calendar dates, periodType, payDay, runs count). `POST /:id/close` is more serious: it takes a calendar ID and immediately calls `prisma.payrollCalendar.update({ where: { id }, data: { isClosed: true } })` with no fetch and no client check. Any user with `approve_payroll` permission at any client can close another client's payroll calendar by guessing/enumerating IDs, which blocks that client from creating or processing payroll for the period (denial-of-service).
- **Fix:** In both handlers, fetch the calendar first and assert `cal.clientId === req.clientId` before responding/mutating. The close handler should also verify `cal.isClosed === false` and emit an audit log.

### [S-006][Medium][Security] `publicHolidays.js` `POST /` and `POST /seed` allow CLIENT_ADMINs to write global holidays
- **File:** `backend/routes/publicHolidays.js:25-65`
- **Issue:** Public holidays are global (`country: 'ZW'`, no `clientId`), and the file's own DELETE handler explicitly restricts to PLATFORM_ADMIN. But `POST /` (line 51) and `POST /seed` (line 25) only require `update_settings` — a permission held by every CLIENT_ADMIN. A CLIENT_ADMIN at one tenant can therefore add or seed holidays that affect every tenant's payroll calendar, attendance, and overtime calculations.
- **Fix:** Add the same `req.user.role !== 'PLATFORM_ADMIN'` gate (or `requireRole('PLATFORM_ADMIN')`) to both POST handlers, mirroring the DELETE handler at line 73-75.

### [S-007][Medium][Security] `taxTables.js` DELETE and bracket-create endpoints lack parent ownership checks
- **File:** `backend/routes/taxTables.js:205-214, 239-260, 308-336, 338-386`
- **Issue:** `DELETE /:id` calls `prisma.taxTable.delete({ where: { id: req.params.id } })` without first fetching the table to assert `table.clientId === req.clientId`. Any `update_settings` user can delete any client's tax tables. Similarly `POST /:id/brackets`, `POST /:id/brackets/replace`, and `POST /:id/upload` operate on the parent `:id` without verifying its `clientId`, allowing cross-client bracket injection / overwrite. The `GET /:id/brackets`, `PUT /:tableId/brackets/:bracketId`, and `DELETE /:tableId/brackets/:bracketId` endpoints already do verify the parent — these are the inconsistent siblings.
- **Fix:** Add the same `parentTable.clientId === req.clientId` pre-check as in the bracket GET/PUT/DELETE handlers (line 222-226) to all four endpoints listed.

### [S-008][Medium][Security] `taxBands.js` PUT spreads `req.body` directly into Prisma update
- **File:** `backend/routes/taxBands.js:54-58`
- **Issue:** Even though POST was tightened to whitelist fields, PUT still does `data: { ...req.body, effectiveFrom: ... }`. A caller can set arbitrary `TaxBand` fields, including any internal flags or relations that may be added to the model. The fact that the model itself does not exist (S-019) means this never reaches the DB — but that will silently change the moment someone re-introduces the model.
- **Fix:** Destructure only the expected fields (`bandNumber`, `description`, `lowerLimit`, `upperLimit`, `rate`, `fixedAmount`, `effectiveFrom`) from `req.body` before constructing the `data` object, matching the POST handler.

### [S-009][Medium][Security] `systemSettings.js` POST accepts `lastUpdatedBy` from request body — audit spoof on first-create
- **File:** `backend/routes/systemSettings.js:25-46`
- **Issue:** PATCH was fixed to derive `lastUpdatedBy` server-side, but POST `/` still extracts `lastUpdatedBy` from `req.body` (line 33) and writes it directly. Any authenticated user with `update_settings` can create a new SystemSetting record with `lastUpdatedBy` set to an arbitrary string (a different user's email, a fictitious "system" identity, etc.), poisoning the audit trail.
- **Fix:** Replace the destructured value with `lastUpdatedBy = req.user?.email || req.user?.userId || 'system'`, mirroring the PATCH handler.

### [S-010][Medium][Security] `systemSettings.js` GET / has no permission check — every authenticated user can read all settings
- **File:** `backend/routes/systemSettings.js:12-22`
- **Issue:** The router-level `authenticateToken` is applied, but `GET /` itself has no `requirePermission`. SystemSetting rows include rates and feature flags that drive the payroll engine — exposing the full table to EMPLOYEE-role users (and any custom non-admin role) leaks operational configuration, e.g., NSSA / AIDS levy rates, vehicle benefit deemed amounts, and any custom toggles the operator adds.
- **Fix:** Add `requirePermission('view_settings')` (or `update_settings`) to the GET handler, consistent with the mutation handlers.

### [S-011][Medium][Security] `payrollInputs.js` POST does not verify target employee in caller's company
- **File:** `backend/routes/payrollInputs.js:73-121`
- **Issue:** The handler accepts `employeeId` from the body and creates a `PayrollInput` against it without verifying that employee belongs to `req.companyId`. The period-lock check operates on the calendar belonging to `req.companyId`'s client, but the inserted `payrollInput.employeeId` is not validated. Any user with `process_payroll` permission can create payroll inputs targeting employees in other companies/clients (the FK constraint will accept any valid Employee row). Same gap on `/import` (line 207-321), which trusts the `Employee Code → empId` lookup but does not assert that the resolved employee row belongs to `scopedCompanyId` if employee codes happen to overlap or are guessed.
- **Fix:** Before the create, fetch `prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } })` and assert `emp.companyId === req.companyId`. For `/import`, the empMap is already scoped via `companyId`, so the failure mode there is just "code not found" — but the post-lookup `emp.companyId` invariant is still worth re-asserting to defend against future regressions.

### [S-012][Medium][Security] `payIncrease.js` POST applies `employeeIds` array without per-ID company validation when `req.companyId` is unset
- **File:** `backend/routes/payIncrease.js:29-36`
- **Issue:** The where clause is `{ ...(req.companyId && { companyId }), ...(employeeIds?.length && { id: { in: employeeIds } }) }`. If a PLATFORM_ADMIN (no `req.companyId` header) calls this with `employeeIds`, the filter degenerates to `{ id: { in: employeeIds } }` and the bulk increase fires across every client. CLIENT_ADMINs are mostly safe because Prisma applies both filters with AND, but the absence of an explicit per-ID assertion means a future regression that drops the companyId filter (e.g., filter typo) would re-open this. There is also no audit-trail confirmation that all targeted employees are within the expected scope before the update.
- **Fix:** After resolving `where`, run `prisma.employee.findMany({ where, select: { companyId: true } })` and assert every returned row's `companyId` matches `req.companyId` (or, for PLATFORM_ADMIN, that all rows share the same companyId provided in a required `companyId` body param). Reject the request otherwise.

### [S-013][Medium][Security] `payrollUsers.js` `manage_users` permission absent from CLIENT_ADMIN — endpoints unusable for tenant admins
- **File:** `backend/lib/permissions.js:27-46`, `backend/routes/payrollUsers.js:28,76,124`
- **Issue:** All mutation endpoints in `payrollUsers.js` require `manage_users`, but `manage_users` only appears in the PLATFORM_ADMIN permissions list (`lib/permissions.js:23`). CLIENT_ADMIN cannot currently invite, edit, or delete a payroll user inside their own tenant. The combination is also a security risk: by the time someone realises and "fixes" the permission map by adding `manage_users` to CLIENT_ADMIN, any cross-tenant guard on these handlers becomes load-bearing — the file needs ownership checks (it does verify `existing.companyId === companyId`) but `GET /` (line 11) has none.
- **Fix:** (a) Add `manage_users` to `CLIENT_ADMIN` in `ROLE_PERMISSIONS`. (b) Add `requirePermission('manage_users')` to `GET /` to prevent EMPLOYEE-role enumeration of payroll users. (c) Re-mount the route in `index.js` (currently absent — see S-018).

### [S-014][Medium][Security] `backup.js` uses non-existent `manage_company` permission — endpoints are unreachable
- **File:** `backend/routes/backup.js:9, 97`
- **Issue:** `requirePermission('manage_company')` is applied to both `/export` and `/restore`. The actual permission name is `manage_companies` (plural) in `lib/permissions.js`. Because `hasPermission` does a strict array `includes` check, no role can ever pass this check — the route always returns 403. This is silently hiding the auditable concerns in S-002: the restore handler is dead code as configured. If somebody fixes the typo without addressing S-002, the `companyId`/`clientId` overwrite vector becomes live.
- **Fix:** Rename to `manage_companies` and concurrently apply S-002.

### [S-015][Medium][Security] `/api/cron/*` mounted behind global `authenticateToken` — Render cron service cannot trigger
- **File:** `backend/index.js:115, 198`, `backend/routes/cron.js`
- **Issue:** `authenticateToken` is registered at line 115, then `/api/cron` is mounted at line 198. A POST from Render's cron service carrying only `x-cron-secret` (and no JWT) will be rejected at the JWT step with 401 before `verifyCronSecret` ever runs. The leave accrual and notifications jobs that the audit trail expects to run via this path are silently broken on production. This also means the in-process `cron.schedule('0 7 * * *', ...)` block at line 215 is the only thing keeping notifications running — and it relies on the web process staying up across restarts. This is a regression introduced when the cron router was moved inside the protected section.
- **Fix:** Mount `/api/cron` **before** `app.use(authenticateToken)`; the route's `verifyCronSecret` middleware already enforces the shared secret.

### [S-016][Medium][Security] `intelligence.js` middleware blocks PLATFORM_ADMIN and exposes endpoints to EMPLOYEE
- **File:** `backend/routes/intelligence.js:6-11`
- **Issue:** The router-level guard is `if (!req.user || !req.user.clientId) return res.status(403)`. PLATFORM_ADMIN tokens carry `clientId: null`, so platform admins are denied access to fraud, cashflow, and alerts views. Conversely, EMPLOYEE tokens carry `clientId`, so employees who can guess a `companyId` they do not belong to are gated only by `req.companyId` (set by `companyContext`) — but no positive `requirePermission('view_reports')` is ever applied. Employees can therefore call `/intelligence/cashflow` and `/intelligence/fraud` for their own company.
- **Fix:** Change the guard to allow PLATFORM_ADMIN through (`if (!req.user) return 401; if (req.user.role !== 'PLATFORM_ADMIN' && !req.user.clientId) return 403`). Add `requirePermission('view_reports')` (or a dedicated `view_intelligence` permission) to the three handlers.

### [S-017][Medium][Security] `PUT /api/user/change-password` does not invalidate other sessions
- **File:** `backend/routes/user.js:86-108`
- **Issue:** The reset-password flow in `routes/auth.js:176-187` correctly deletes all existing sessions inside the transaction so that other devices cannot reuse the old JWT. The voluntary password-change handler at `routes/user.js:101` only updates the password — every existing JWT issued by `signToken` remains valid until expiry (8h). A user who realises an attacker has stolen their cookie cannot terminate that attacker's session by changing their password.
- **Fix:** Inside `change-password`, wrap the password update and `prisma.session.deleteMany({ where: { userId: req.user.userId, NOT: { id: req.user.sessionId } } })` (preserving the caller's own session) in a transaction. Optionally apply `authLimiter` to this route as well, since brute-force of `currentPassword` is currently uncapped.

### [S-018][Low][Security] Six route files retained in repo but never mounted in `index.js`
- **File:** `backend/routes/payrollLogs.js`, `backend/routes/payslipExports.js`, `backend/routes/payslipTransactions.js`, `backend/routes/auditLogs.js`, `backend/routes/payrollUsers.js`, plus the missing `payslipSummaries.js`/`payTransactions.js` referenced in V-012/V-013
- **Issue:** Several routers were hardened in the March sweep (auth, ownership checks, mass-assignment fixes) but are not registered in `index.js`. They contribute zero attack surface today, but they are also untested — any future re-mount will reintroduce whichever issues are still latent in them (e.g., `payrollUsers.js` GET still has no permission check; `auditLogs.js` POST still has no permission check). Dead route files are also a legibility hazard: a reader expects a route file to be active.
- **Fix:** Either delete the unused route files (preferred — keep the repo's surface area honest) or re-mount them in `index.js` and finish hardening (apply S-013, audit POST permission gates, etc.). At minimum, add a short banner comment at the top of each unmounted file: `// NOT MOUNTED IN index.js — kept for reference only.`

### [S-019][Low][Security] `routes/taxBands.js` references `prisma.taxBand` but no `TaxBand` model exists in the schema
- **File:** `backend/routes/taxBands.js:13,26,46,68,74`, `backend/prisma/schema.prisma`
- **Issue:** `prisma.taxBand` is `undefined` because the schema does not declare a `TaxBand` model (only `TaxTable` and `TaxBracket`). Every call to this router will throw a TypeError, returning a 500. The router is mounted at `index.js:146` (`/api/tax-bands`), so the failure is reachable. This is functionally the same as the route being broken, but it surfaces in production logs as runtime errors rather than 404s. A future regression that adds a `TaxBand` model under, say, `clientId: undefined` would also expose every band globally because the GET handler has no `clientId` filter.
- **Fix:** Either remove `routes/taxBands.js` and unmount it from `index.js`, or migrate to use `TaxBracket` directly with proper `clientId` scoping via the parent `TaxTable`.

### [S-020][Low][Security] `admin.js` POST/PUT for users skips email format validation, allowing operator typos to lock out the platform
- **File:** `backend/routes/admin.js:27-46, 64-78`
- **Issue:** The platform admin user-creation and update endpoints accept `email` from the body without any `^[^\s@]+@[^\s@]+\.[^\s@]+$` check (the registration handler in `routes/auth.js:20-23` does this). If a PLATFORM_ADMIN typoes their own email when updating their record, password reset emails will silently misfire (or be delivered to an attacker who registered the typoed domain). Combined with no second factor, this is a meaningful path to lockout / takeover.
- **Fix:** Apply the same `emailRegex` test used in `routes/auth.js`. Optionally also enforce `password.length >= 8` consistency on the user-creation handler (currently only registration enforces it).

### [S-021][Low][Security] `auditLogs.js` POST `/` accepts any authenticated user — log-injection vector if re-mounted
- **File:** `backend/routes/auditLogs.js:28-51`
- **Issue:** The POST handler has no `requirePermission` or role gate; any authenticated user can write a `MultiCurrencyAuditLog` row attributed to their `req.companyId`. Today the route is unmounted, but re-mounting (S-018) would re-expose it. Audit logs that downstream auditors trust as ground-truth become forgeable.
- **Fix:** Add `requirePermission('view_audit_logs')` or restrict the route to internal application code only by removing the public POST entirely — `MultiCurrencyAuditLog` rows should be created by server-side helpers, not by an HTTP API.

### [S-022][Low][Security] `transactionCodes.js` `GET /:id`, PUT, DELETE, and rules sub-routes lack `clientId` ownership assertions
- **File:** `backend/routes/transactionCodes.js:90-219`
- **Issue:** `GET /:id` (line 90), `PUT /:id` (line 106), `DELETE /:id` (line 123), `GET /:id/rules` (line 142), `POST /:id/rules` (line 156), `PUT /:tcId/rules/:ruleId` (line 182), `DELETE /:tcId/rules/:ruleId` (line 208) all operate by ID with no `tc.clientId === req.clientId` check. CLIENT_ADMIN at client A can read or mutate any transaction code at client B by guessing the UUID. The list endpoint at line 43 already filters by `req.clientId`, so this is the same IDOR pattern repeatedly observed across the codebase.
- **Fix:** Pre-fetch the transaction code (and for rules, traverse to the parent `TransactionCode.clientId`) and 403 on mismatch before the operation.

### [S-023][Low][Security] Per-account login lockout map is in-process memory — no protection against multi-instance brute-force
- **File:** `backend/routes/auth.js:64-101`
- **Issue:** `loginFailures` is a `new Map()` held in module-level state. In a Render setup with multiple worker processes (or a future horizontal scale-out), an attacker can rotate among instances to amortise the 3-attempt limit per process. There is also no eviction policy, so the map can grow unbounded if many distinct emails attempt invalid logins.
- **Fix:** Move lockout state to a shared store (Redis or the existing `Session`/`User` table — e.g., add `failedLoginCount` and `lockedUntil` columns to `User`). Enforce eviction via a TTL or a periodic cleanup. The IP-level `authLimiter` partly mitigates this, but per-account state should not be process-local.

### [S-024][Low][Security] CORS `origin` falls through to `localhost:5173` in non-production environments — startup fail-fast only checks production
- **File:** `backend/index.js:28-35, 56-59`
- **Issue:** The fail-fast assertion only runs when `NODE_ENV === 'production'`. Staging and preview environments where `NODE_ENV !== 'production'` will silently default to `origin: 'http://localhost:5173'` if `FRONTEND_URL` is unset, and CORS will then quietly reject requests from the staging frontend. This is what the March audit's V-003 was meant to prevent in production; the same misconfiguration risk applies to non-prod environments where it's harder to notice.
- **Fix:** Tighten the fail-fast to require `FRONTEND_URL` whenever `NODE_ENV !== 'development'`. Alternatively, log a `console.warn` at startup whenever `FRONTEND_URL` is unset regardless of environment.
