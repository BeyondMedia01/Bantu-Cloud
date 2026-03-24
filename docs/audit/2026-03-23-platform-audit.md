# Bantu Platform Audit Report
**Date:** 2026-03-23
**Status:** SWEEP COMPLETE — AWAITING REVIEW
**Sweep target:** 191
**Files reviewed:** 191

## Summary

| Severity | Security | Business Logic | Code Quality | Performance | Total |
|---|---|---|---|---|---|
| Critical | 1 | 0 | 0 | 0 | 1 |
| High | 30 | 4 | 1 | 4 | 39 |
| Medium | 17 | 3 | 19 | 17 | 56 |
| Low | 7 | 2 | 17 | 2 | 28 |
| **Total** | 55 | 9 | 37 | 23 | **124** |

---

## Findings

<!-- Findings are appended below as sweep progresses -->

<!-- Task 2: Auth infrastructure sweep — 2026-03-23 -->

### [High][FIXED] Biometric route has no authentication or rate limiting
- **File**: `backend/index.js:57`
- **Domain**: Security
- **Issue**: `/api/biometric` is mounted before the global `authenticateToken` middleware and has no rate limiter applied. The comment states devices authenticate via "serial + webhookKey", but this custom auth is entirely inside the route handler — if that check is absent or bypassable, the endpoint is fully open. There is also no rate limiting to prevent brute-force or flooding attacks against the biometric webhook.
- **Fix**: Apply `authLimiter` (or a dedicated device limiter) to `/api/biometric` in `index.js`: `app.use('/api/biometric', deviceLimiter, require('./routes/biometric'));`. Ensure the route handler enforces the serial + webhookKey check on every handler and returns 401 on failure.

### [High][FIXED] Webhook route has no rate limiting
- **File**: `backend/index.js:18`
- **Domain**: Security
- **Issue**: `/api/webhooks` (Stripe webhooks) is mounted with no rate limiter. While Stripe signs its payloads, an attacker can flood this endpoint with invalid requests, causing unnecessary CPU and DB load or triggering denial-of-service conditions.
- **Fix**: Apply a rate limiter to `/api/webhooks`: `app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookLimiter, require('./routes/webhooks'));`. A generous limit (e.g., 200 req/15 min per IP) is sufficient to protect against floods while not blocking legitimate Stripe delivery retries.

### [Medium][FIXED] CORS origin falls back to localhost if FRONTEND_URL is unset
- **File**: `backend/index.js:23`
- **Domain**: Security
- **Issue**: `origin: process.env.FRONTEND_URL || 'http://localhost:5173'` means that if `FRONTEND_URL` is not set in a production environment, CORS will only allow `localhost:5173`. While this restricts rather than opens access, a misconfigured deployment would silently break the frontend and an operator might be tempted to switch to `origin: '*'` as a quick fix, which would be critical.
- **Fix**: Add a startup assertion that `FRONTEND_URL` is set in non-development environments: `if (process.env.NODE_ENV === 'production' && !process.env.FRONTEND_URL) { console.error('FATAL: FRONTEND_URL must be set in production'); process.exit(1); }`. Tag: `MANUAL` — confirm the correct production URL.

### [Medium][FIXED] companyContext permits unauthenticated access to req.user properties without guard
- **File**: `backend/middleware/companyContext.js:23`
- **Domain**: Security
- **Issue**: At line 23, `companyContext` destructures `req.user` unconditionally (`const { role, userId } = req.user;`) after checking `companyId` is present — but this block is only reached when `companyId` is set. If `companyContext` is ever inadvertently applied before `authenticateToken` (or on a route where `authenticateToken` is skipped), `req.user` will be `undefined` and the destructure will throw a runtime 500 error rather than returning a clean 401. The comment "Must run AFTER authenticateToken" is documentation-only with no programmatic enforcement.
- **Fix**: Add an explicit guard at the top of the `companyContext` function before accessing `req.user`: `if (!req.user) return res.status(401).json({ message: 'Authentication required' });`

### [Low][FIXED] authLimiter window is 5 requests per 15 minutes — tightened for login
- **File**: `backend/index.js:45-51`
- **Domain**: Security
- **Issue**: The `authLimiter` was set to 20 attempts per 15-minute window per IP. This limit applies to all `/api/auth` routes (login, register, forgot-password, reset-password) combined. For a dedicated login brute-force scenario, 20 password attempts per 15 minutes (96 per hour) was relatively permissive.
- **Fix**: Reduced the login limit to 5 attempts per 15-minute window per IP. This tightens the rate limit and prevents brute-force attacks more effectively while maintaining usability for legitimate users.

<!-- Task 3 Batch A: Payroll & Financial routes sweep — 2026-03-23 -->

### [High][FIXED] `POST /preview` DB call is outside try/catch — unhandled promise rejection on Prisma error
- **File**: `backend/routes/payroll.js:116`
- **Domain**: Code Quality
- **Issue**: The period-lock check at line 116 (`prisma.payrollCalendar.findFirst(...)`) is executed outside the `try` block (which starts at line 133). If Prisma throws (e.g., DB connection failure), the error is an unhandled promise rejection, crashing the process in Node.js versions ≥15 and returning no response to the caller in earlier versions.
- **Fix**: Move the period-lock query inside the `try` block, or wrap the entire handler body in a single top-level try/catch with `next(err)`.

### [High][FIXED] `payslipExports` GET/POST/PATCH read `x-company-id` header directly instead of `req.companyId` — bypasses `companyContext` middleware
- **File**: `backend/routes/payslipExports.js:8`
- **Domain**: Security
- **Issue**: All three handlers in `payslipExports.js` read `companyId` directly from `req.headers['x-company-id']` rather than from `req.companyId` set by the `companyContext` middleware. This means no cross-tenant ownership validation occurs — any authenticated user can supply an arbitrary `x-company-id` header and read or write export records for a company they do not belong to.
- **Fix**: Replace `req.headers['x-company-id']` with `req.companyId` (populated by `companyContext`) in all handlers. The `PATCH /:id` and `DELETE /:id` handlers also need ownership checks (look up the record and verify `record.companyId === req.companyId` before mutating).

### [High][FIXED] `payrollLogs` GET/POST read `x-company-id` header directly — same bypass as payslipExports
- **File**: `backend/routes/payrollLogs.js:8`
- **Domain**: Security
- **Issue**: Both handlers read `const companyId = req.headers['x-company-id']` instead of `req.companyId`. An authenticated user from any company can read all audit log entries for any other company by setting a different header value, and can also write spoofed log entries under an arbitrary company ID.
- **Fix**: Replace `req.headers['x-company-id']` with `req.companyId` in both handlers. For the POST handler also consider restricting log creation to server-side internal calls rather than exposing it as a public API endpoint.

### [High][FIXED] `payslips.js` GET `/:id` returns the full `employee` object (no field selection) — may expose sensitive employee data
- **File**: `backend/routes/payslips.js:49`
- **Domain**: Security
- **Issue**: The `GET /api/payslips/:id` handler uses `include: { employee: true }` with no `select` clause. This returns every column on the Employee record including personal fields such as `idPassport`, `tin`, `socialSecurityNum`, `bankAccountUSD`, `bankAccountZiG`, and potentially any future sensitive fields added to the model, to any authenticated user with access to that payslip.
- **Fix**: Replace `employee: true` with `employee: { select: { firstName: true, lastName: true, employeeCode: true, position: true } }` (add only fields the payslip view requires). Apply the same pattern to `payrollRun: { include: { company: true } }` to avoid leaking the full Company record.

### [High][FIXED] `reports.js` `GET /tax` accepts arbitrary `companyId` query param — IDOR across companies
- **File**: `backend/routes/reports.js:67`
- **Domain**: Security
- **Issue**: `const targetCompanyId = companyId || req.companyId;` — any user can pass `?companyId=<other-company-id>` and retrieve the full P16 annual tax report for a company they are not authorised for. There is no check that `targetCompanyId` matches `req.companyId` or that the requesting user belongs to that company.
- **Fix**: Remove the `companyId` query parameter entirely and always use `req.companyId`. If cross-company access is needed for CLIENT-role users, add an explicit check: `if (companyId && companyId !== req.companyId) { /* verify req.user belongs to that company or has CLIENT scope */ }`.

### [High][FIXED] `reports.js` `GET /p2` same IDOR — arbitrary `companyId` accepted in query string
- **File**: `backend/routes/reports.js:370`
- **Domain**: Security
- **Issue**: Same pattern as `/tax`: `const targetCompanyId = companyId || req.companyId` with no ownership validation. The P2 return contains gross salary, PAYE, and AIDS levy figures for every employee in the target company — highly sensitive payroll financial data.
- **Fix**: Same fix as `/tax` — drop the `companyId` query param and enforce `req.companyId`.

### [Medium][FIXED] `payslipTransactions.js` POST spreads `req.body` directly into Prisma `create` — mass-assignment risk
<!-- [included in higher tier — see [High] finding in Task 5: payslipTransactions.js POST mass-assignment] -->
- **File**: `backend/routes/payslipTransactions.js:33`
- **Domain**: Security
- **Issue**: `data: { ...req.body, companyId: req.companyId, ... }` passes the entire request body to `prisma.payslipTransaction.create`. An attacker can inject unexpected fields (e.g., `id`, `companyId` overrides, internal flags) that Prisma will attempt to write if they exist on the model. The supplied `companyId` override at the end partially mitigates this for `companyId`, but all other fields are uncontrolled.
- **Fix**: Destructure only the expected fields from `req.body` and build the `data` object explicitly, matching the pattern used in `payrollCore.js`.

### [Medium][FIXED] `payslipSummaries.js` POST/PUT spread `req.body` directly — mass-assignment risk
- **File**: `backend/routes/payslipSummaries.js:28`
- **Domain**: Security
- **Issue**: `POST` uses `data: { ...req.body, companyId, payPeriod }` and `PUT` uses `data: req.body` with no field filtering. The `PUT /:id` handler additionally performs no ownership check — any authenticated user with `companyId` header can update any `PayslipSummary` record by ID regardless of which company it belongs to.
- **Fix**: Whitelist fields in both handlers. Add an ownership lookup in `PUT /:id`: fetch the record, verify `record.companyId === req.companyId`, and return 403 if not.

### [Medium][FIXED] `payTransactions.js` POST/PUT spread `req.body` with no validation — mass-assignment risk
- **File**: `backend/routes/payTransactions.js:26`
- **Domain**: Security
- **Issue**: `POST` uses `data: { ...req.body, companyId }` and `PUT /:id` uses `data: req.body` with no field whitelist. The `PUT` also has no ownership check — any company user can overwrite any `PayTransaction` record by ID. The `DELETE /:id` also has no ownership check.
- **Fix**: Whitelist permitted fields for both mutation handlers. Add ownership checks in `PUT /:id` and `DELETE /:id` (fetch record, assert `record.companyId === req.companyId`).

### [Medium][FIXED] `payslipExports.js` PATCH and DELETE have no ownership checks
<!-- [included in higher tier — see [High] finding above: payslipExports GET/POST/PATCH bypass companyContext middleware] -->
- **File**: `backend/routes/payslipExports.js:77`
- **Domain**: Security
- **Issue**: `PATCH /:id` and `DELETE /:id` do not verify that the targeted `PayslipExport` record belongs to the requesting company. Any authenticated user (with any company context) can mutate or delete another company's export record if they know its ID.
- **Fix**: Before updating/deleting, look up the record and assert `record.companyId === req.companyId`, returning 403 on mismatch.

### [Medium][FIXED] `payslipExports.js` GET returns `bankAccountUSD` and `bankAccountZiG` for all employees in the list
<!-- [included in higher tier — see [High] finding above: payslipExports GET/POST/PATCH bypass companyContext middleware] -->
- **File**: `backend/routes/payslipExports.js:17`
- **Domain**: Security
- **Issue**: The list endpoint returns `employee.bankAccountUSD` and `employee.bankAccountZiG` as part of every export record. Full bank account numbers should not be returned in a list API response; they should be masked or excluded unless specifically needed for a detail view.
- **Fix**: Remove `bankAccountUSD` and `bankAccountZiG` from the `select` in the list query, or replace with masked values (last 4 digits only).

### [Low][FIXED] `payrollInputs.js` import endpoint does not validate file size — potential memory exhaustion
- **File**: `backend/routes/payrollInputs.js:207`
- **Domain**: Security
- **Issue**: `multer({ storage: multer.memoryStorage() })` stores the entire uploaded file in memory with no size limit. An attacker (or misconfigured client) can upload a very large file to the `/api/payroll-inputs/import` endpoint, causing the process to consume excessive heap memory.
- **Fix**: Add a `limits` option to multer: `multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })` (5 MB is generous for a CSV/XLSX import).

<!-- Task 3 Batch B: Employee & HR routes sweep — 2026-03-23 -->

### [High][FIXED] `GET /api/employees` and `GET /api/employees/:id` return full employee records including TIN, passport number, bank details, and SSN without field selection
- **File**: `backend/routes/employees.js:186`
- **Domain**: Security
- **Issue**: Both the list query (`findMany`) and the single-record query (`findUnique`) use no `select` clause, returning the entire Employee row. This includes highly sensitive PII fields: `tin`, `passportNumber`, `nationalId`, `socialSecurityNum`, `accountNumber`, `bankName`, `bankBranch`, `taxDirective`, `taxDirectivePerc`, and any future columns added to the model. The employee self-service path at line 148 also returns all fields for the requesting employee.
- **Fix**: Add explicit `select` or use a safe projection helper in all employee read queries. Fields such as `tin`, `passportNumber`, `socialSecurityNum`, `taxDirective*` should be excluded from list responses and only returned in the individual profile endpoint when the requester has `manage_employees` permission. `MANUAL` — confirm which fields each consumer requires.

### [High][FIXED] `GET /api/employee/profile` (employeeSelf.js) returns the full employee record including TIN, passport, bank details, and SSN
- **File**: `backend/routes/employeeSelf.js:10`
- **Domain**: Security
- **Issue**: `prisma.employee.findUnique({ where: { userId: req.user.userId }, include: { company: ..., branch: ..., department: ... } })` has no `select` clause on the Employee model itself, so the full row is returned including `tin`, `passportNumber`, `nationalId`, `socialSecurityNum`, `accountNumber`, `taxDirective`, and all salary fields. While an employee may legitimately see their own profile, returning raw TIN and full bank account numbers in an API response without masking increases exposure if the channel is compromised.
- **Fix**: Add a `select` clause that returns only the fields needed by the self-service UI. Mask `accountNumber` (show last 4 digits). Consider omitting `tin` from this endpoint entirely. `MANUAL` — agree on safe field list with product team.

### [High][FIXED] `PUT /api/leave/:id` has no ownership check — any company user can update any leave record by ID
- **File**: `backend/routes/leave.js:148`
- **Domain**: Security
- **Issue**: The `PUT /:id` handler calls `prisma.leaveRecord.update({ where: { id: req.params.id }, data: {...} })` directly without first fetching the record to verify `record.employee.companyId === req.companyId`. An authenticated user from Company A who knows a leave record ID belonging to Company B can modify that record's status, dates, or reason.
- **Fix**: Before the update, fetch the record with `include: { employee: { select: { companyId: true } } }` and assert ownership: `if (req.companyId && record.employee.companyId !== req.companyId) return res.status(403).json(...)`.

### [High][FIXED] `PUT /api/leave/request/:id/approve` and `PUT /api/leave/request/:id/reject` have no ownership check on the leave request
- **File**: `backend/routes/leave.js:171`
- **Domain**: Security
- **Issue**: Both approval and rejection handlers call `prisma.leaveRequest.update({ where: { id: req.params.id }, ... })` without first verifying the request belongs to the caller's company. Any `approve_leave` / `reject_leave` user at any company can approve or reject another company's employees' leave requests by guessing a request ID, and the subsequent balance deduction will affect that other company's employee.
- **Fix**: Fetch the leave request first (with `include: { employee: { select: { companyId: true } } }`), assert `employee.companyId === req.companyId`, and return 403 on mismatch before proceeding with the update and financial transaction.

### [High][FIXED] `DELETE /api/leave/:id` has no ownership check — cross-company leave record deletion possible
- **File**: `backend/routes/leave.js:276`
- **Domain**: Security
- **Issue**: `prisma.leaveRecord.delete({ where: { id: req.params.id } })` is called without an ownership check. Any user with `manage_leave` permission at any company can delete a leave record belonging to another company.
- **Fix**: Fetch the record first with `include: { employee: { select: { companyId: true } } }` and assert `employee.companyId === req.companyId` before deleting.

### [High][FIXED] `PATCH /api/loans/repayments/:id` has no ownership check — any company can mark any repayment as paid
- **File**: `backend/routes/loans.js:188`
- **Domain**: Security
- **Issue**: The `PATCH /repayments/:id` handler directly updates a `LoanRepayment` record without first verifying it belongs to the caller's company. An attacker with `manage_loans` permission at any company can mark any loan repayment as paid by guessing or enumerating its ID.
- **Fix**: Fetch the repayment including its loan and the loan's employee (`include: { loan: { include: { employee: { select: { companyId: true } } } } }`), assert `companyId === req.companyId`, and return 403 on mismatch.

### [High][FIXED] `PUT /api/grades/:id` and `DELETE /api/grades/:id` have no ownership check
- **File**: `backend/routes/grades.js:66`
- **Domain**: Security
- **Issue**: Both `PUT /:id` and `DELETE /:id` call `prisma.grade.update/delete({ where: { id: req.params.id } })` without first verifying the grade's `clientId` matches `req.clientId`. Any user with `update_settings` permission at any client can modify or delete another client's grade definitions.
- **Fix**: Fetch the grade first, assert `grade.clientId === req.clientId`, and return 403 on mismatch before mutating.

### [High][FIXED] `PUT /api/departments/:id` has no ownership check — cross-company department modification possible
- **File**: `backend/routes/departments.js:61`
- **Domain**: Security
- **Issue**: `prisma.department.update({ where: { id: req.params.id }, data: { name, branchId } })` is called without fetching the record to verify ownership. Any `manage_companies` user can rename or reassign any department at any company by knowing its ID. `DELETE /:id` has the same problem.
- **Fix**: Fetch the department first, assert `dept.companyId === req.companyId`, return 403 on mismatch. Apply the same pattern to `DELETE /:id`.

### [High][FIXED] `PUT /api/branches/:id` and `DELETE /api/branches/:id` have no ownership checks
- **File**: `backend/routes/branches.js:60`
- **Domain**: Security
- **Issue**: Both mutation handlers call Prisma directly by ID without a prior ownership check, allowing any `manage_companies` user to rename or delete a branch belonging to any other company.
- **Fix**: Fetch the branch first, assert `branch.companyId === req.companyId`, return 403 on mismatch before mutating.

### [Medium][FIXED] `POST /api/departments` and `POST /api/branches` accept `companyId` from `req.body` without validating it matches `req.companyId`
- **File**: `backend/routes/departments.js:30`, `backend/routes/branches.js:29`
- **Domain**: Security
- **Issue**: Both creation handlers take `companyId` directly from the request body: `const { companyId, ... } = req.body` and then pass it straight to `prisma.department.create({ data: { companyId, ... } })`. An authenticated user with `manage_companies` permission can supply any `companyId` and create departments or branches under a company they do not belong to.
- **Fix**: Ignore the body `companyId` and always use `req.companyId` (from `companyContext` middleware): `const companyId = req.companyId;`. Return 400 if `req.companyId` is not set.

### [Medium][FIXED] `GET /api/leave` has no `requirePermission` guard — any authenticated user can list all leave records for their company
- **File**: `backend/routes/leave.js:9`
- **Domain**: Security
- **Issue**: The `GET /` handler has no `requirePermission` middleware. Employees are filtered by the `EMPLOYEE` role check inside the handler, but users with non-EMPLOYEE roles (e.g., `VIEWER` or custom roles without `manage_leave`) can see all leave records and requests across the entire company unfiltered.
- **Fix**: Add `requirePermission('view_leave')` (or equivalent) as route middleware, or at minimum document that read access is intentionally unrestricted. `MANUAL` — confirm intended access control model.

### [Medium][FIXED] `POST /api/loans` does not verify the target `employeeId` belongs to the caller's company
- **File**: `backend/routes/loans.js:36`
- **Domain**: Security
- **Issue**: The loan creation handler validates presence of `employeeId` but does not look up the employee to confirm they belong to `req.companyId`. An attacker with `manage_loans` permission can create a loan record against an employee in a different company.
- **Fix**: After extracting `employeeId` from the body, fetch `prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } })` and assert `employee.companyId === req.companyId` before creating the loan.

### [Medium][FIXED] `employeeSelf.js` `PUT /profile` response returns the full employee row including sensitive fields
- **File**: `backend/routes/employeeSelf.js:30`
- **Domain**: Security
- **Issue**: `prisma.employee.update(...)` is called with no `select` clause, so the response includes all employee fields — TIN, passport number, SSN, full salary data, tax configuration, etc. — even though the handler is only meant to update personal contact details.
- **Fix**: Add `select: { id: true, homeAddress: true, nextOfKin: true, bankName: true, accountNumber: true }` (or a safe profile projection) to the `update` call.

### [Medium][FIXED] `leaveBalances.js` `GET /:employeeId` exposes the full `leavePolicy` object via `include: { leavePolicy: true }`
- **File**: `backend/routes/leaveBalances.js:63`
- **Domain**: Security
- **Issue**: The employee-specific balance endpoint uses `include: { leavePolicy: true }` with no `select`, returning all columns of the linked LeavePolicy record. While the policy itself is not highly sensitive, this is inconsistent with the list endpoint (which does use a limited `select`) and could expose internal policy IDs and configuration fields to employee-role users.
- **Fix**: Replace `include: { leavePolicy: true }` with `include: { leavePolicy: { select: { leaveType: true, accrualRate: true, maxAccumulation: true, carryOverLimit: true, encashable: true, encashCap: true } } }`.

### [Low][FIXED] `employeeTransactions.js` `GET /:empId/salary-structure` — ownership check is outside try/catch, async crash not handled
- **File**: `backend/routes/employeeTransactions.js:31`
- **Domain**: Code Quality
- **Issue**: `const emp = await getEmployee(empId, req.companyId)` on line 35 is called outside the `try` block that starts on line 38. If `getEmployee` throws (e.g., DB connection failure), the error is unhandled and will crash the process or leave the request hanging.
- **Fix**: Move the `getEmployee` call inside the `try` block, or wrap the entire handler in a single try/catch.

### [Low][FIXED] `leave.js` `POST /` — no `requirePermission` guard on CLIENT_ADMIN direct-create path; relies on role check inside handler
- **File**: `backend/routes/leave.js:46`
- **Domain**: Security
- **Issue**: The `POST /` handler applies no middleware-level permission check. Admin-side direct creation of a `LeaveRecord` is gated only by `req.user.role !== 'EMPLOYEE'` inside the handler. A user with a non-standard role that is not `EMPLOYEE` but also lacks explicit leave management rights can create leave records directly.
- **Fix**: Add `requirePermission('manage_leave')` to the route or restructure into separate endpoints: one for `EMPLOYEE` self-service (no permission needed beyond `requireRole('EMPLOYEE')`) and one for admins (`requirePermission('manage_leave')`).

### [Low][FIXED] `loans.js` `GET /` — no `requirePermission` guard; any authenticated user can list all company loans
- **File**: `backend/routes/loans.js:9`
- **Domain**: Security
- **Issue**: The `GET /` list endpoint has no `requirePermission` call. Employee filtering is applied inside the handler for the `EMPLOYEE` role, but users with non-EMPLOYEE roles (e.g., HR viewer with no `manage_loans` permission) can enumerate all loan records across the company.
- **Fix**: Add `requirePermission('view_loans')` (or `manage_loans`) as route middleware, consistent with the `POST`, `PUT`, and `DELETE` handlers on the same router. `MANUAL` — confirm intended access model.

<!-- Task 4: Tax engine and payroll logic sweep — 2026-03-23 -->

### [High][MANUAL][FIXED] YTD boundary uses calendar year (January 1) instead of Zimbabwe tax year (April 1)
- **File**: `backend/utils/payslipFormatter.js:96`, `backend/routes/payroll.js:618`
- **Domain**: Business Logic
- **Issue**: The YTD accumulation window is anchored to `new Date(year, 0, 1)` — January 1 of the calendar year — in both `payslipFormatter.js` (YTD on printed payslips) and `payroll.js` (FDS_AVERAGE gross accumulation). Zimbabwe's tax year runs April 1 – March 31. Using a January 1 reset means Q1 payslips (Jan–Mar) carry forward tax-year amounts from the prior April–December into the new calendar year's YTD, and FDS_AVERAGE employees' running average resets three months early. This produces incorrect cumulative PAYE figures on payslips and an incorrect average PAYE base for FDS_AVERAGE employees in January–March.
- **Fix**: Replace `new Date(year, 0, 1)` with a helper that computes the Zimbabwe tax year start: if the run month is January–March, the tax year started April 1 of the previous year; otherwise April 1 of the current year. Apply the same fix to both call sites. `MANUAL` — confirm with client whether any companies operate under a non-April tax year (ZIMRA allows alternate fiscal year applications).
- **Resolution (2026-03-24)**: Added `getYtdStartDate(payrollRunDate, companyFirstPayrollDate)` to `ytdCalculator.js`. YTD window = MAX(April 1 of current Zimbabwe tax year, company's earliest payroll run date). Applied to both `payslipFormatter.js` (payslip YTD) and the FDS_AVERAGE accumulation in `payroll.js` `/process` route.

### [High][MANUAL][FIXED] NSSA ceiling hardcoded fallback in `taxEngine.js` — no external config enforced at engine level
- **File**: `backend/utils/taxEngine.js:18`
- **Domain**: Business Logic
- **Issue**: `DEFAULT_NSSA_CEILING = { USD: 700, ZiG: 20000 }` is hardcoded in the engine as a last-resort fallback. If a caller omits `nssaCeiling` (e.g., a future integration or unit test that does not pass all SystemSettings values), the engine silently uses the hardcoded value regardless of the current statutory ceiling. The `payroll.js` process route does correctly read `NSSA_CEILING_USD`/`NSSA_CEILING_ZIG` from SystemSettings and pass them through, but the preview route (`/preview`) only reads `NSSA_CEILING_USD` and passes no ZiG ceiling. If a ZiG preview is run, the engine falls back to the hardcoded 20,000 ZiG ceiling.
- **Fix**: In the `/preview` handler, also read `NSSA_CEILING_ZIG` from SystemSettings and pass the appropriate value based on `currency`. For the engine default, document prominently that `DEFAULT_NSSA_CEILING` must be updated whenever ZIMRA revises the ceiling. `MANUAL` — verify current statutory NSSA ceiling values against latest ZIMRA circular.
- **Resolution (2026-03-24)**: In the `/preview` route, ZiG NSSA ceiling is now computed dynamically as `NSSA_CEILING_USD × most recent USD→ZiG rate` from the `CurrencyRate` table (for the company, ordered by `effectiveDate` desc). Falls back to the `NSSA_CEILING_ZIG` SystemSetting if no rate record exists. Hardcoded 20,000 ZiG value is no longer used in preview.

### [Medium][FIXED] Tax engine applies no rounding to PAYE, AIDS levy, or NSSA outputs — floating-point drift accumulates across employees
- **File**: `backend/utils/taxEngine.js:171-224`
- **Domain**: Business Logic
- **Issue**: `calculatePaye` performs all intermediate and final calculations in raw floating-point with no `Math.round` applied to any output field (`nssaEmployee`, `payeBeforeLevy`, `aidsLevy`, `totalPaye`, `netSalary`, etc.). The `payroll.js` process route applies `round2` only to currency-conversion results, not to the tax engine outputs before they are stored. ZIMRA requires figures to 2 decimal places per the FDS specification (noted in a comment at line 471 of `payroll.js`). Accumulated float errors across a large headcount can produce payslip values like `123.450000000001` and small discrepancies between individual payslip totals and payroll run summations.
- **Fix**: Apply `round2` (or equivalent) to all returned monetary fields inside `calculatePaye` before the return statement, or apply rounding in the caller immediately after `calculatePaye` returns and before writing to `payslipData`. Ensure rounding strategy is consistent (banker's rounding, as already used in `round2`).

### [Low][FIXED] `normaliseBrackets` silently returns an empty array when `taxBrackets` is null or empty — zero PAYE with no warning
- **File**: `backend/utils/taxEngine.js:117`
- **Domain**: Business Logic
- **Issue**: `const bands = (taxBrackets && taxBrackets.length > 0) ? normaliseBrackets(taxBrackets) : [];` — if no tax brackets are supplied, `bands` is `[]`, the loop produces zero PAYE, and the function returns normally with `totalPaye: 0`. The process route (`payroll.js:396`) now guards against this with an HTTP 422 response, but the `/preview` route does not perform the same guard and will silently return zero PAYE if the active tax table has no brackets.
- **Fix**: Add the same missing-bracket guard to the `/preview` handler that already exists in the `/process` handler (`payroll.js:396-405`): if `taxBrackets.length === 0` return an error rather than silently computing zero PAYE.

<!-- Task 3 Batches C-E: Statutory, Admin, Supporting routes sweep — 2026-03-23 -->

### [Critical][FIXED] `systemSettings.js` — all routes have no `authenticateToken` or permission guard
- **File**: `backend/routes/systemSettings.js:7`
- **Domain**: Security
- **Issue**: `systemSettings.js` instantiates its own `new PrismaClient()` and registers four routes (`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`) with zero authentication or authorisation middleware. Any unauthenticated HTTP request can read all system settings, create new settings, mutate existing ones (including rate values and flags used by the payroll engine), or delete them outright. This is the most critical finding in the codebase — a fully open admin data endpoint.
- **Fix**: Add `authenticateToken` and `requireRole('PLATFORM_ADMIN')` (or at minimum `requirePermission('update_settings')`) to all four handlers, matching the pattern in `admin.js`. Also replace the local `new PrismaClient()` instance with the shared `require('../lib/prisma')` singleton.

### [High][FIXED] `taxBands.js` — all routes have no authentication or authorisation middleware
- **File**: `backend/routes/taxBands.js:7`
- **Domain**: Security
- **Issue**: All four handlers (`GET /`, `POST /`, `PUT /:id`, `DELETE /:id`) are registered with no `authenticateToken` or permission check. Any unauthenticated caller can read, create, update, or delete tax band configuration that directly feeds the payroll tax engine. The file also instantiates its own `new PrismaClient()` rather than the shared singleton.
- **Fix**: Add `authenticateToken` at router level and `requirePermission('update_settings')` on the mutation handlers, consistent with `taxTables.js`. Replace `new PrismaClient()` with `require('../lib/prisma')`.

### [High][FIXED] `auditLogs.js` — all routes have no authentication or authorisation middleware
- **File**: `backend/routes/auditLogs.js:7`
- **Domain**: Security
- **Issue**: Both `GET /` and `POST /` handlers have no `authenticateToken` or permission middleware. Any unauthenticated caller can read all multi-currency audit log entries for any company (by supplying `x-company-id` header), or inject arbitrary audit log records. The file also creates its own `new PrismaClient()` instance.
- **Fix**: Add `authenticateToken` and at minimum `requirePermission('view_reports')` on `GET /`. Restrict or remove `POST /` from the public API surface — audit entries should only be created internally by the application.

### [High][FIXED] `payrollUsers.js` — all routes have no authentication or authorisation middleware
- **File**: `backend/routes/payrollUsers.js:7`
- **Domain**: Security
- **Issue**: All four handlers (`GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`) have no `authenticateToken` or permission check. Any unauthenticated caller can enumerate payroll user accounts for any company, create new payroll users with ADMIN role and all permissions, or delete existing users. The file uses its own `new PrismaClient()` instance.
- **Fix**: Add `authenticateToken` at router level and `requirePermission('manage_companies')` (or equivalent) on all mutation handlers. Replace the local `new PrismaClient()` instance with the shared singleton.

### [High][FIXED] `backup.js` `POST /restore` — upserts entire payload directly from `req.body` with no field validation, enabling overwrite of arbitrary records across models
- **File**: `backend/routes/backup.js:87`
- **Domain**: Security
- **Issue**: The restore handler iterates over models in `backupData.data` and calls `tx[model].upsert({ where: { id: item.id }, update: item, create: item })` — passing each item directly from the client-supplied JSON payload with no field whitelisting or schema validation. An attacker with `manage_company` permission can supply a crafted backup JSON that creates or overwrites Employee records, PayrollRun records, Payslips, or any other linked model with arbitrary field values (including `companyId` reassignment). There is also no check that the IDs being restored actually belong to the requesting company.
- **Fix**: Validate every item against a strict schema before upsert. Assert that each record's `companyId` (or `clientId`) matches `req.companyId`/`req.clientId`. Do not pass raw `item` objects directly — whitelist permitted fields for each model type.

### [High][FIXED] `taxBands.js` `PUT /:id` and `DELETE /:id` — no ownership check; any authenticated user can modify any tax band
- **File**: `backend/routes/taxBands.js:34`
- **Domain**: Security
- **Issue**: Same IDOR pattern as employees.js: `PUT /:id` and `DELETE /:id` operate directly by ID with no check that the band belongs to the caller's client scope.
- **Fix**: After adding auth (see Critical finding above), fetch the band first and assert ownership before mutating.

### [High][FIXED] `taxTables.js` `GET /:id` and bracket sub-routes — no ownership check
- **File**: `backend/routes/taxTables.js:82`
- **Domain**: Security
- **Issue**: `GET /:id` fetches any tax table by ID with no `clientId` assertion. The bracket endpoints (`GET /:id/brackets`, `PUT /:tableId/brackets/:bracketId`, `DELETE /:tableId/brackets/:bracketId`) similarly operate on arbitrary IDs. `PUT /:tableId/brackets/:bracketId` and `DELETE /:tableId/brackets/:bracketId` do not verify the bracket's parent table belongs to the caller.
- **Fix**: For `GET /:id`, assert `table.clientId === req.clientId`. For bracket mutation endpoints, first look up the bracket, traverse to its `taxTableId`, verify that table's `clientId` matches.

### [High][FIXED] `nssaContributions.js` — no `authenticateToken` middleware visible
- **File**: `backend/routes/nssaContributions.js:12`
- **Domain**: Security
- **Issue**: The single `GET /` route handler uses `req.companyId` (which implies `companyContext` middleware) but no `requirePermission` call is present. Depending on how the router is mounted, any authenticated user — including EMPLOYEE role — can enumerate NSSA contribution amounts, employee names, and gross salary data for every employee in the company.
- **Fix**: Add `requirePermission('view_reports')` to the `GET /` handler.

### [High][FIXED] `subCompanies.js` `PUT /:id` and `DELETE /:id` — no ownership check
- **File**: `backend/routes/subCompanies.js:39`
- **Domain**: Security
- **Issue**: Same IDOR pattern as employees.js: both mutation handlers operate directly on ID without verifying the sub-company's `clientId` matches `req.clientId`.
- **Fix**: Fetch the record first, assert `sub.clientId === req.clientId`, return 403 on mismatch.

### [High][FIXED] `payrollCalendar.js` `PUT /:id` and `DELETE /:id` — no ownership check
- **File**: `backend/routes/payrollCalendar.js:88`
- **Domain**: Security
- **Issue**: Same IDOR pattern: `PUT /:id` fetches the existing calendar for the closed-check but does not assert `calendar.clientId === req.clientId`. `DELETE /:id` does the same. `GET /:id` (line 73) also has no ownership check. `POST /:id/close` (line 115) has no ownership check either.
- **Fix**: Assert `calendar.clientId === req.clientId` in all four handlers before proceeding.

### [High][FIXED] `publicHolidays.js` `DELETE /:id` — no ownership check
- **File**: `backend/routes/publicHolidays.js:69`
- **Domain**: Security
- **Issue**: `prisma.publicHoliday.delete({ where: { id: req.params.id } })` is called without verifying the holiday record belongs to the caller's scope. Any `update_settings` user can delete any public holiday record.
- **Fix**: Fetch the holiday first and verify it before deleting. If public holidays are global (not per-client), add a `PLATFORM_ADMIN` guard instead.

### [Medium][FIXED] `taxBands.js` `POST /` spreads `req.body` into Prisma `create` — mass-assignment
<!-- [included in higher tier — see [High] finding above: taxBands.js all routes have no authentication or authorisation middleware] -->
- **File**: `backend/routes/taxBands.js:21`
- **Domain**: Security
- **Issue**: `data: { ...req.body, effectiveFrom: ... }` passes the entire body to `prisma.taxBand.create`. Any field on the `TaxBand` model (including internal IDs or flags) can be set by the caller.
- **Fix**: Destructure only the expected fields (`bandNumber`, `description`, `lowerLimit`, `upperLimit`, `rate`, `fixedAmount`, `effectiveFrom`) from `req.body`.

### [Medium][FIXED] `auditLogs.js` `POST /` spreads `req.body` into Prisma `create` — mass-assignment
<!-- [included in higher tier — see [High] finding above: auditLogs.js all routes have no authentication or authorisation middleware] -->
- **File**: `backend/routes/auditLogs.js:27`
- **Domain**: Security
- **Issue**: `data: { ...req.body, companyId, payPeriod, timestamp }` — the full request body is spread in, meaning a caller can set arbitrary `MultiCurrencyAuditLog` fields including internal relations.
- **Fix**: Whitelist the expected fields from `req.body` before creating. Ideally remove this public `POST /` endpoint entirely and create audit log entries only from server-side logic.

### [Medium][FIXED] `systemSettings.js` `PATCH /:id` accepts `lastUpdatedBy` from `req.body` — caller can spoof audit attribution
<!-- [included in higher tier — see [Critical] finding above: systemSettings.js all routes have no authenticateToken or permission guard] -->
- **File**: `backend/routes/systemSettings.js:55`
- **Domain**: Security
- **Issue**: `lastUpdatedBy` is read directly from `req.body` and written to the record. Any caller (even unauthenticated, given the lack of auth middleware) can set this field to an arbitrary string, spoofing the attribution of the change in the audit trail.
- **Fix**: Derive `lastUpdatedBy` from `req.user?.email || req.user?.userId` (server-side), never from the request body.

### [Medium][FIXED] `payrollUsers.js` `POST /` — `createdBy` field accepted from `req.body`, enabling audit spoofing
<!-- [included in higher tier — see [High] finding above: payrollUsers.js all routes have no authentication or authorisation middleware] -->
- **File**: `backend/routes/payrollUsers.js:38`
- **Domain**: Security
- **Issue**: `createdBy` is extracted from `req.body` and written directly to the new `PayrollUser` record. Even if auth were added, a caller could supply any string as the creator identity.
- **Fix**: Derive `createdBy` from `req.user?.email || req.user?.userId` server-side.

### [Medium][FIXED] `intelligence.js` middleware checks `req.user.clientId` but individual handlers allow `companyId` override via query string
- **File**: `backend/routes/intelligence.js:35`
- **Domain**: Security
- **Issue**: The `/fraud` and `/cashflow` handlers use `req.companyId || req.query.companyId` — the query string fallback bypasses the `companyContext` middleware's validated company binding, allowing any authenticated user with a `clientId` to query fraud flags and cashflow forecasts for a company they do not belong to by supplying `?companyId=<other-id>`.
- **Fix**: Remove the `req.query.companyId` fallback from all three handlers. Enforce `req.companyId` exclusively, which is already validated by `companyContext`.

### [Medium][FIXED] `backup.js` export sends response before logging the audit event, meaning the audit write may be skipped on error
<!-- [included in higher tier — see [High] finding above: backup.js POST /restore upserts entire payload from req.body] -->
- **File**: `backend/routes/backup.js:74`
- **Domain**: Code Quality
- **Issue**: `res.json(backupData)` is called at line 74, and then `await audit(...)` is called at line 76 — after the response is already sent. If the `audit()` call throws, the error is caught by the outer `catch` block but the response has already been flushed. The same pattern occurs in the restore handler (line 163/165). The audit write is effectively fire-and-forget with no guarantee.
- **Fix**: Move the `audit()` call before `res.json(...)`, or handle audit failures separately without silently swallowing them.

### [Low][FIXED] `taxBands.js` / `auditLogs.js` / `payrollUsers.js` — each instantiates its own `new PrismaClient()` instead of using the shared singleton
- **File**: `backend/routes/taxBands.js:3`, `backend/routes/auditLogs.js:2`, `backend/routes/payrollUsers.js:3`
- **Domain**: Code Quality
- **Issue**: Creating a new `PrismaClient` per module leads to multiple connection pools, increasing database connection overhead and potentially exhausting pool limits under load.
- **Fix**: Replace `new PrismaClient()` with `const prisma = require('../lib/prisma')` in all three files.

### [Low][FIXED] `licenseValidate.js` — async handler has no try/catch; `validateLicense` throwing would cause unhandled rejection
- **File**: `backend/routes/licenseValidate.js:7`
- **Domain**: Code Quality
- **Issue**: The `POST /` handler calls `await validateLicense(token)` with no `try/catch`. If `validateLicense` throws (e.g., DB error), the promise rejection is unhandled and will crash the process in Node ≥ 15.
- **Fix**: Wrap the handler body in `try { ... } catch (err) { res.status(500).json({ message: 'Internal server error' }); }`.

### [Low][FIXED] `setup.js` — public `POST /api/setup` is not rate-limited; susceptible to enumeration or timing attacks
- **File**: `backend/routes/setup.js:22`
- **Domain**: Security
- **Issue**: The one-time setup endpoint is publicly accessible with no rate limiter. While it only creates an admin if none exists, repeated requests can be used to probe the initialization state of the platform, and the endpoint itself accepts and hashes passwords — a target for timing-based reconnaissance.
- **Fix**: Apply a strict rate limiter (e.g., 5 requests per hour per IP) to `POST /api/setup` in `index.js`, and/or disable the route after setup is complete.

### [Low][FIXED] `biometric.js` `POST /zkteco` — device lookup uses unverified `SN` query parameter; no secret validation on ZKTeco push
- **File**: `backend/routes/biometric.js:71`
- **Domain**: Security
- **Issue**: The ZKTeco ADMS push handler (`POST /zkteco`) only looks up the device by serial number (`SN`) from the query string with no shared-secret verification. Any caller who knows or guesses a device serial number can inject arbitrary attendance log entries for any company. The `webhookKey` authentication that protects the Hikvision and import endpoints is absent for ZKTeco.
- **Fix**: Require a `key` query parameter or HTTP header on the ZKTeco endpoints and validate it against `device.webhookKey`, matching the Hikvision authentication model. Return 401/403 if the key is missing or invalid.

### [Low][FIXED] `nssaContributions.js` — payslip `findMany` returns employee `firstName`/`lastName` in list without pagination, potential PII bulk-export
- **File**: `backend/routes/nssaContributions.js:26`
- **Domain**: Security
- **Issue**: The `findMany` query fetches all payslips for a company for an entire year with no `take`/`skip` pagination. For large companies this could be a significant payload of salary and employee name data. Combined with the missing `requirePermission` guard, this represents a bulk PII export risk.
- **Fix**: Add `requirePermission('view_reports')`, and add pagination parameters (`page`, `limit`) to the query.

<!-- Task 5: Payslip mapping and leave logic sweep — 2026-03-23 -->

### [High][FIXED] `pdfService.js` `_drawPayslip` — `data.companyName.toUpperCase()` will throw if `companyName` is undefined
- **File**: `backend/utils/pdfService.js:63`
- **Domain**: Business Logic
- **Issue**: `data.companyName.toUpperCase()` is called unconditionally. `companyName` is populated in `payslipFormatter.js` from `payslip.payrollRun.company.name` with no null guard. If the company record has no name (or the relation is not loaded), this call throws `TypeError: Cannot read properties of undefined (reading 'toUpperCase')`, crashing the PDF generation promise and leaving the employee without a payslip.
- **Fix**: Replace with `(data.companyName || 'Unknown Company').toUpperCase()` in `_drawPayslip`, or assert `companyName` is present before calling `generatePayslipBuffer` in `payslipFormatter.js`.

### [High][FIXED] `payslipTransactions.js` `DELETE /:id` — no ownership check; any company user can delete any transaction by ID
- **File**: `backend/routes/payslipTransactions.js:49`
- **Domain**: Security
- **Issue**: `prisma.payslipTransaction.delete({ where: { id: req.params.id } })` is called with only a `companyId` guard on the route-level check (`if (!req.companyId)`), but the actual delete is performed without verifying that the target `payslipTransaction` record belongs to `req.companyId`. A user from Company A who knows a transaction UUID from Company B can delete it.
- **Fix**: Change the delete to `prisma.payslipTransaction.deleteMany({ where: { id: req.params.id, companyId: req.companyId } })` and return 404 if count is 0, or fetch the record first and assert ownership.

### [High][FIXED] `payslipTransactions.js` `POST /` — `req.body` spread into Prisma `create` allows mass-assignment; caller can override `companyId`
- **File**: `backend/routes/payslipTransactions.js:32`
- **Domain**: Security
- **Issue**: `data: { ...req.body, companyId: req.companyId, ... }` spreads the full request body before the trusted fields. Because object spread merges left-to-right, the `companyId` override at the end does correctly win — but all other `PayslipTransaction` model fields (including internal relations like `employeeId`, `transactionId`, `payPeriod`, and any internal flags) can be set to arbitrary values by the caller with no validation.
- **Fix**: Destructure only the expected fields from `req.body` (`employeeId`, `transactionId`, `amountOriginal`, `rateToUSD`, `currency`, `payPeriod`, `notes`) before creating the record.

### [High][FIXED] `leave.js` `PUT /:id` — no ownership check on update; any `manage_leave` user can update leave records from other companies
<!-- [included in higher tier — see [High] finding in Task 3 Batch B: PUT /api/leave/:id has no ownership check] -->
- **File**: `backend/routes/leave.js:148`
- **Domain**: Security
- **Issue**: `PUT /:id` calls `prisma.leaveRecord.update({ where: { id: req.params.id }, data: ... })` with no prior fetch to verify the record belongs to `req.companyId`. A `manage_leave` user from Company A who knows a `LeaveRecord` UUID from Company B can modify that record's dates, type, totalDays, or status.
- **Fix**: Before the update, fetch `prisma.leaveRecord.findUnique({ where: { id: req.params.id }, select: { employee: { select: { companyId: true } } } })` and assert `employee.companyId === req.companyId`, returning 403 on mismatch.

### [High][FIXED] `leave.js` `DELETE /:id` — no ownership check on delete; same IDOR as PUT
<!-- [included in higher tier — see [High] finding in Task 3 Batch B: DELETE /api/leave/:id has no ownership check] -->
- **File**: `backend/routes/leave.js:276`
- **Domain**: Security
- **Issue**: `prisma.leaveRecord.delete({ where: { id: req.params.id } })` is called without verifying the record belongs to the requesting company. Identical IDOR exposure as the `PUT /:id` handler.
- **Fix**: Apply the same ownership pre-fetch and company assertion as recommended for `PUT /:id` before executing the delete.

### [High][FIXED] `leave.js` `POST /` — negative balance possible via `Employee.leaveBalance` legacy fallback; no floor guard
- **File**: `backend/routes/leave.js:86`
- **Domain**: Business Logic
- **Issue**: The balance check uses `availableBalance < days_f` and rejects insufficient balance — but only before the transaction. Inside `$transaction`, `employee.leaveBalance` is decremented with `{ decrement: days_f }` with no DB-level floor constraint. If two concurrent requests race (both pass the pre-check with the same balance), both decrements commit and `leaveBalance` goes negative. The `LeaveBalance` model path has the same race condition. A negative balance is not caught anywhere downstream and will render as a negative number on the payslip leave section.
- **Fix**: Add a DB-level check constraint on `Employee.leaveBalance >= 0`, or use a `WHERE leaveBalance >= days_f` condition in the update and check `count` to detect the race. At minimum, guard the payslip display with `Math.max(0, leaveBal?.balance ?? ...)`.

### [Medium][FIXED] `leave.js` approval flow re-approves an already-approved request without idempotency check
<!-- [included in higher tier — see [High] finding above: PUT /api/leave/request/:id/approve and reject have no ownership check] -->
- **File**: `backend/routes/leave.js:171`
- **Domain**: Business Logic
- **Issue**: `PUT /request/:id/approve` calls `prisma.leaveRequest.update(...)` to set status `APPROVED` unconditionally, then creates a new `LeaveRecord` and decrements the balance. If the endpoint is called twice for the same request (double-click, retry), a second `LeaveRecord` is created and the balance is decremented a second time. There is no check that `request.status !== 'APPROVED'` before proceeding.
- **Fix**: After fetching the updated request, check `if (request.status === 'APPROVED' && alreadyProcessed)` — or more robustly, move the status update inside the transaction and add a pre-check: fetch the request first, return 409 if it is already `APPROVED`.

### [Medium][FIXED] `leaveBalances.js` accrual — `credit` value uses raw float `policy.accrualRate` with no rounding, accumulates drift across months
- **File**: `backend/routes/leaveBalances.js:114`
- **Domain**: Business Logic
- **Issue**: `const credit = Math.min(policy.accrualRate, room)` uses the raw accrual rate (e.g. `1.6667` days/month) with no rounding before incrementing `accrued` and `balance`. After 12 months a balance of `20.0004` or similar can appear on payslips instead of the expected `20.0`. Leave balance rounding is inconsistent — `leave.js` uses plain `parseFloat` arithmetic, while the accrual engine applies no rounding at all.
- **Fix**: Apply `Math.round(credit * 100) / 100` (2dp) before the update, and standardise all leave arithmetic to the same rounding strategy. Leave rounding is **mixed** (no consistent `Math.floor`, `Math.round`, or similar applied across the codebase).

### [Low][FIXED] `payslipFormatter.js` — `payslip.employee.leaveBalance` and `leaveTaken` fallbacks read deprecated `Employee` fields; could silently return 0 if field removed
- **File**: `backend/utils/payslipFormatter.js:151`
- **Domain**: Business Logic
- **Issue**: `leaveBalance: leaveBal?.balance ?? (payslip.employee.leaveBalance || 0)` and `leaveTaken: leaveBal?.taken ?? (payslip.employee.leaveTaken || 0)` fall back to legacy `Employee` columns. If the migration to `LeaveBalance` is complete and the legacy columns are eventually removed from the schema, this fallback silently returns `0` rather than signalling a missing balance. The payslip would then show `0.0 days` leave balance without any error.
- **Fix**: Once `LeaveBalance` is the sole source of truth, remove the legacy fallbacks and instead log a warning (or surface an error to the caller) when `leaveBal` is null, so missing balance records are detected at generation time.

### [Low][FIXED] `payslipTransactions.js` uses a separate `new PrismaClient()` instance instead of the shared singleton
- **File**: `backend/routes/payslipTransactions.js:2`
- **Domain**: Code Quality
- **Issue**: `const { PrismaClient } = require('@prisma/client'); const prisma = new PrismaClient();` creates an additional connection pool, inconsistent with the rest of the codebase which uses `require('../lib/prisma')`.
- **Fix**: Replace with `const prisma = require('../lib/prisma');`.

<!-- Task 6: Backend code quality sweep — 2026-03-23 -->

### [Medium][FIXED] `payroll.js` is a critical split candidate at 2143 lines
- **File**: `backend/routes/payroll.js` (2143 lines)
- **Domain**: Code Quality
- **Issue**: At 2143 lines, `payroll.js` is the largest file in the codebase by a wide margin — more than double the next largest route file (`reports.js` at 936 lines). It mixes payroll run lifecycle (CRUD, submit, approve, process), payslip PDF generation, email dispatch, variance reporting, statutory exports, and reconciliation into a single module. This makes the file hard to navigate, test, or modify without risk of unintended side effects.
- **Fix**: Split into at minimum four sub-modules: `payrollRuns.js` (CRUD + lifecycle), `payrollProcessing.js` (preview + process engine calls), `payslips.js` (PDF + email endpoints), and `payrollReports.js` (variance, reconciliation, export). Register each sub-router under `/api/payroll` in `index.js`.

### [Medium][FIXED] `reports.js` exceeds the 300-line route threshold at 936 lines
- **File**: `backend/routes/reports.js` (936 lines)
- **Domain**: Code Quality
- **Issue**: `reports.js` at 936 lines bundles employee lists, payslip history, loan summaries, department roll-ups, statutory transaction exports, and a custom headcount/dashboard summary endpoint into a single file. Each report type has distinct query logic and pagination handling, making this module a maintenance liability and a frequent merge-conflict source.
- **Fix**: Break into domain-focused report files: `reports/payroll.js`, `reports/employees.js`, `reports/loans.js`, `reports/statutory.js`. A thin `reports/index.js` can re-export them under the same prefix.

### [Medium][FIXED] `employees.js` exceeds the 300-line route threshold at 814 lines
- **File**: `backend/routes/employees.js` (814 lines)
- **Domain**: Code Quality
- **Issue**: Employee CRUD, CSV/XLSX bulk import (with its own column mapping and validation logic), termination handling, and audit-log retrieval all live in one 814-line file. The import handler alone spans ~160 lines (lines 359–519) and contains business logic (column normalisation, field defaults, `checkEmployeeCap`) that belongs in a service layer.
- **Fix**: Extract the bulk import logic into `services/employeeImport.js` (or `utils/employeeImport.js`), and split termination into its own `routes/employeeTermination.js`. This brings `employees.js` under 400 lines.

### [Medium][FIXED] `backPay.js` exceeds the 300-line route threshold at 461 lines
- **File**: `backend/routes/backPay.js` (461 lines)
- **Domain**: Code Quality
- **Issue**: Back-pay calculation, approval workflow, and payroll-input generation are all handled inline within route handlers rather than in a dedicated service. The file is above the 300-line flag threshold and the core calculation at lines ~80–292 is business logic embedded inside a request handler.
- **Fix**: Extract the back-pay calculation and payroll-input generation into `services/backPayService.js`, leaving the route file as a thin HTTP adapter.

### [Medium][FIXED] `attendance.js` exceeds the 300-line route threshold at 411 lines
- **File**: `backend/routes/attendance.js` (411 lines)
- **Domain**: Code Quality
- **Issue**: The route file contains multi-step attendance processing logic (fetch → group by employee/date → call `attendanceEngine` → upsert records) inline from lines 195–283. This is orchestration logic that belongs in a service layer, not a route handler.
- **Fix**: Move the processing pipeline into `services/attendanceService.js` and reduce the route handler to input validation, service invocation, and response serialisation.

### [Medium][FIXED] Inconsistent response envelope shapes across routes — more than 2 distinct shapes in use
- **File**: `backend/routes/*.js`
- **Domain**: Code Quality
- **Issue**: Routes return at least five structurally distinct JSON shapes: (1) raw model object (`res.json(user)`), (2) raw array (`res.json(employees)`), (3) `{ data, total, page, limit }` paginated envelope (attendance), (4) named root key without pagination (`{ clients, users, employees, aidsLevyRate }`), (5) `{ message }` plain string responses. Frontend consumers must handle each shape individually, and adding a new consumer (e.g., a mobile app or public API) requires reverse-engineering the contract for every endpoint. Shapes 3–5 represent three distinct variants beyond the first two, qualifying as a Medium finding each; consolidated here as one finding.
- **Fix**: Adopted a single envelope contract: `{ data }` for single resources and non-paginated lists, `{ data, total, page, limit }` for paginated lists, `{ success: true }` for DELETE mutations. Updated 12 priority route files (`employees`, `payroll`, `payslips`, `leave`, `loans`, `reports`, `companies`, `departments`, `branches`, `grades`, `transactions`, `dashboard`). Added an axios response interceptor in `frontend/src/api/client.ts` that automatically unwraps `{ data: X }` envelopes so all existing call sites remain unchanged.
- **Note**: `MANUAL` — Changing envelope shapes is a breaking change — requires coordinated frontend+backend update.

### [Medium][FIXED] `jobProcessor.js` — no try/catch around async operations; errors propagate unhandled to the worker caller
- **File**: `backend/lib/jobProcessor.js`
- **Domain**: Code Quality
- **Issue**: `processJob` and `processEmailPayslip` are async functions with no try/catch. Any error from `payslipToBuffer` or `mailer.sendPayslip` (network failure, PDF generation crash, missing Prisma record) will throw an unhandled rejection that propagates to the worker. Whether the worker catches it depends entirely on the call site. If the job queue worker lacks a top-level catch, the Node process will emit an `unhandledRejection` and the job will be silently retried or dropped depending on the queue implementation.
- **Fix**: Wrap the body of `processJob` (or each `process*` helper) in try/catch. On catch, log the error with `job.id` and rethrow a structured error so the queue can mark the job as failed and apply retry/dead-letter logic.

### [Low] `hikvisionClient.js` — `getDeviceInfo` and `fetchAttendanceEvents` have no try/catch; network errors are unguarded
- **File**: `backend/lib/hikvisionClient.js`
- **Domain**: Code Quality
- **Issue**: Both `getDeviceInfo` (line 118) and `fetchAttendanceEvents` (line 138) are async functions that `await digestGet(...)` with no surrounding try/catch. If the device is unreachable, returns an unexpected status, or the JSON parse fails, the error bubbles up raw to the calling route handler. The route handlers in `devices.js` and `biometric.js` do have their own try/catch, but `attendanceEngine` callers may not, so the guard is call-site-dependent rather than enforced at the library level.
- **Fix**: Wrap the `digestGet` calls in try/catch inside each exported function, enrich the error message with device IP and path context, then rethrow. This makes the library self-documenting about what can fail.

### [Low][FIXED] `attendanceEngine.js` — `matchEmployeeByPin` is async with no try/catch; Prisma errors surface as unhandled rejections at call sites
- **File**: `backend/lib/attendanceEngine.js` (line 205)
- **Domain**: Code Quality
- **Issue**: `matchEmployeeByPin` performs two sequential `prisma.employee.findFirst` calls with no error handling. Any Prisma connectivity or query error will throw at the call site. The sync functions `processDailyLogs` and `buildPayrollInputsFromAttendance` are pure computation and are correctly unguarded, but the async DB lookup should be self-protecting.
- **Fix**: Add a try/catch to `matchEmployeeByPin` that catches Prisma errors, logs them with `pin` and `companyId` context, and returns `null` so callers degrade gracefully rather than crashing the processing loop.

<!-- Task 8: Backend performance sweep — 2026-03-23 -->

### [High][FIXED] N+1: leaveBalances accrual loop issues individual UPDATE per employee×policy
- **File**: `backend/routes/leaveBalances.js:99`
- **Domain**: Performance
- **Issue**: The `POST /api/leave-balances/accrue` handler fetches all active employees and all policies, then in a nested `for (emp) / for (policy)` loop calls `getOrCreateBalance(...)` (which itself issues a `findUnique` + optional `create`) and then `prisma.leaveBalance.update(...)` individually. For a company with 200 employees and 5 policies that is 2,000 Prisma round-trips per accrual run.
- **Fix**: Pre-fetch all existing balances for the company/year in one `findMany`, build an in-memory map, then use `prisma.$transaction([...])` with a single batched `createMany` / `updateMany` or a chunked `Promise.all`. Remove the inner per-row DB calls.

### [High][FIXED] N+1: leaveBalances year-end issues individual upsert per balance row
- **File**: `backend/routes/leaveBalances.js:164`
- **Domain**: Performance
- **Issue**: The `POST /api/leave-balances/year-end` handler iterates over every balance for the closing year, issuing a `prisma.leaveBalance.update` and (conditionally) a `prisma.leaveBalance.upsert` for each row — 2× DB calls per balance, unbounded by employee count.
- **Fix**: Batch the updates using `prisma.$transaction`. Collect all update payloads and new-year upsert payloads in arrays, then execute them together or via `updateMany` with matching `where` clauses.

### [High][FIXED] N+1: backup restore issues individual upsert per record across 12+ models
- **File**: `backend/routes/backup.js:104`
- **Domain**: Performance
- **Issue**: The restore path iterates over `TransactionCode`, `Grade`, `Branch`, `Department`, `Employee`, `PayrollRun`, and then 12 relational tables in `RELATIONAL_TABLES`, issuing one `tx.*.upsert(...)` per record. A company backup with 300 employees, 12 months of payroll, and associated transactions can easily produce 5,000–10,000 sequential upserts inside a single transaction, causing multi-minute lock times and risk of transaction timeout.
- **Fix**: Replace the per-record upsert loops with chunked `createMany(..., { skipDuplicates: true })` followed by targeted updates, or use PostgreSQL `ON CONFLICT DO UPDATE` via raw SQL for large tables. Split the transaction into per-model sub-transactions to limit lock scope.

### [High][FIXED] N+1: transactionCodes seed issues individual upsert per TC per client
- **File**: `backend/utils/transactionCodes.js:105`
- **Domain**: Performance
- **Issue**: `autoSeedTransactionCodes` fetches all clients with `findMany()` (no `select`, returning all columns), then for each client iterates over 8 transaction codes issuing one `prisma.transactionCode.upsert` per iteration — O(clients × 8) sequential round-trips. This runs at startup, adding latency proportional to client count.
- **Fix**: Add `select: { id: true }` to the `client.findMany()` call. Collect all upsert payloads and execute them in a `prisma.$transaction([...])` batch, or use `createMany` with `skipDuplicates: true` for the creates and a single update pass only when needed.

### [Medium][FIXED] findMany without select on Employee model — payroll run
- **File**: `backend/routes/payroll.js:459`
- **Domain**: Performance
- **Issue**: `prisma.employee.findMany({ where: { companyId: run.companyId }, include: { necGrade: true } })` returns all ~40 columns of `Employee` plus the related `NecGrade` for every employee. The payroll engine only uses a subset of these fields (baseRate, taxMethod, currency, etc.) but hydrates the full model on every payroll run.
- **Fix**: Add a `select` clause scoped to the fields actually consumed by the payroll calculation loop (e.g. `id`, `baseRate`, `currency`, `taxMethod`, `taxDirectivePerc`, `taxDirectiveAmt`, `hoursPerPeriod`, `daysPerPeriod`, `paymentBasis`, `rateSource`, `necGradeId`, `gradeId`, `splitUsdPercent`, `motorVehicleBenefit`, plus `necGrade: { select: { minRate, necLevyRate } }`).

### [Medium][FIXED] findMany without select on Employee model — dashboard
- **File**: `backend/routes/dashboard.js:25`
- **Domain**: Performance
- **Issue**: `prisma.employee.findMany(...)` with no `select` clause returns all columns of the `Employee` model for every active employee, used only to derive counts and aggregated stats for the dashboard.
- **Fix**: Add `select: { id: true, status: true, departmentId: true, branchId: true, baseRate: true, currency: true }` (or whatever subset the dashboard logic actually reads).

### [Medium][FIXED] findMany without select on Payslip model — reports (multiple)
- **File**: `backend/routes/reports.js:26`, `backend/routes/reports.js:72`, `backend/routes/reports.js:377`, `backend/routes/reports.js:440`, `backend/routes/reports.js:501`
- **Domain**: Performance
- **Issue**: Multiple report endpoints call `prisma.payslip.findMany(...)` without a `select` clause. The `Payslip` model has ~30 columns including several nullable dual-currency Float fields. Report endpoints that only aggregate totals (PAYE, NSSA, gross, net) hydrate far more data than needed.
- **Fix**: Add `select` clauses limited to the columns read by each report. For example the payroll summary report only needs `{ gross, paye, aidsLevy, nssaEmployee, nssaEmployer, netPay, employeeId, payrollRunId }`.

### [Medium][FIXED] Unbounded findMany on PayslipTransaction — no take/skip
- **File**: `backend/routes/payslipTransactions.js:10`
- **Domain**: Performance
- **Issue**: `prisma.payslipTransaction.findMany({ where: { companyId } })` has no `take` or `skip`. This is a GET list endpoint that could return unbounded rows as transaction history grows.
- **Fix**: Add `take` defaulting to 200 (or a pagination pattern) and expose `page`/`limit` query params. Return `total` alongside `data` for the client to paginate.

### [Medium][FIXED] Unbounded findMany on AuditLog — admin endpoint
- **File**: `backend/routes/admin.js:195`
- **Domain**: Performance
- **Issue**: `prisma.auditLog.findMany(...)` inside the admin audit-log endpoint has no `take` / pagination guard visible in the surrounding lines. AuditLog rows accumulate indefinitely and this endpoint will degrade with scale.
- **Fix**: Add `take: parseInt(limit) || 100` and `skip` / `cursor`-based pagination. Return `total` count from a parallel `prisma.auditLog.count({ where })`.

### [Medium/MANUAL][FIXED] Unindexed FK: `Session.userId`
- **File**: `backend/prisma/schema.prisma` — model `Session`
- **Domain**: Performance
- **Issue**: `Session.userId` references `User` and is used in auth lookups (find session by token, then access user), but has no `@@index([userId])`. Queries filtering by `userId` (e.g. "list all sessions for this user") perform a full table scan.
- **Fix**: Add `@@index([userId])` to the `Session` model. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `ClientAdmin.clientId`
- **File**: `backend/prisma/schema.prisma` — model `ClientAdmin`
- **Domain**: Performance
- **Issue**: `ClientAdmin.clientId` has no `@@index`. Lookups like "find admins for this client" scan the full table.
- **Fix**: Add `@@index([clientId])` to `ClientAdmin`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `Employee.clientId`, `Employee.companyId`, `Employee.branchId`, `Employee.departmentId`, `Employee.gradeId`, `Employee.necGradeId`
- **File**: `backend/prisma/schema.prisma` — model `Employee`
- **Domain**: Performance
- **Issue**: The `Employee` model has six FK fields with no `@@index`. `companyId` is the primary list filter on virtually every employee query, and `branchId` / `departmentId` are used in filter queries (payroll, reports, leave). Missing indexes cause full table scans on the largest table in the schema.
- **Fix**: Add `@@index([companyId])`, `@@index([clientId])`, `@@index([branchId])`, `@@index([departmentId])`, `@@index([gradeId])`, `@@index([necGradeId])` to `Employee`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `PayrollRun.companyId`, `PayrollRun.payrollCalendarId`
- **File**: `backend/prisma/schema.prisma` — model `PayrollRun`
- **Domain**: Performance
- **Issue**: `PayrollRun.companyId` is used in nearly every payroll list/filter query (e.g. `findMany({ where: { companyId } })`), but has no index. `payrollCalendarId` is used to join runs to calendar periods.
- **Fix**: Add `@@index([companyId])` and `@@index([payrollCalendarId])` to `PayrollRun`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `PayrollTransaction.employeeId`, `PayrollTransaction.payrollRunId`, `PayrollTransaction.transactionCodeId`
- **File**: `backend/prisma/schema.prisma` — model `PayrollTransaction`
- **Domain**: Performance
- **Issue**: All three FK fields on `PayrollTransaction` lack indexes. This table grows as O(employees × runs × transactions per employee) and is queried by `payrollRunId` for payslip generation and by `employeeId` for per-employee transaction history.
- **Fix**: Add `@@index([payrollRunId])`, `@@index([employeeId])`, `@@index([transactionCodeId])` to `PayrollTransaction`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `PayrollInput.employeeId`, `PayrollInput.payrollRunId`, `PayrollInput.transactionCodeId`
- **File**: `backend/prisma/schema.prisma` — model `PayrollInput`
- **Domain**: Performance
- **Issue**: `PayrollInput` is fetched by `employeeId` and `payrollRunId` during every payroll run, but neither field has an index.
- **Fix**: Add `@@index([employeeId])`, `@@index([payrollRunId])`, `@@index([transactionCodeId])` to `PayrollInput`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `Payslip.employeeId`, `Payslip.payrollRunId`
- **File**: `backend/prisma/schema.prisma` — model `Payslip`
- **Domain**: Performance
- **Issue**: `Payslip` is the most frequently queried table across reports, statutory exports, bank files, and PDF generation. Both `employeeId` and `payrollRunId` are used heavily in `WHERE` clauses but neither has an `@@index`.
- **Fix**: Add `@@index([payrollRunId])` and `@@index([employeeId])` to `Payslip`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `LoanRepayment.loanId`, `LoanRepayment.payrollRunId`
- **File**: `backend/prisma/schema.prisma` — model `LoanRepayment`
- **Domain**: Performance
- **Issue**: `LoanRepayment.loanId` and `payrollRunId` have no indexes. The payroll engine queries unpaid repayments by loan, and the loan detail page queries repayments by `loanId`.
- **Fix**: Add `@@index([loanId])` and `@@index([payrollRunId])` to `LoanRepayment`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `Loan.employeeId`
- **File**: `backend/prisma/schema.prisma` — model `Loan`
- **Domain**: Performance
- **Issue**: `Loan.employeeId` has no `@@index`. Loan list queries filter by employee and the payroll engine's `findMany({ where: { employeeId: { in: [...] } } })` will scan the full table.
- **Fix**: Add `@@index([employeeId])` to `Loan`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `LeaveRecord.employeeId`, `LeaveRequest.employeeId`
- **File**: `backend/prisma/schema.prisma` — models `LeaveRecord`, `LeaveRequest`
- **Domain**: Performance
- **Issue**: Both `LeaveRecord.employeeId` and `LeaveRequest.employeeId` are used as primary filter criteria in leave lookups but have no `@@index`.
- **Fix**: Add `@@index([employeeId])` to both `LeaveRecord` and `LeaveRequest`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `EmployeeBankAccount.employeeId`, `EmployeeDocument.employeeId`, `LeaveEncashment.employeeId`/`leaveBalanceId`, `LeaveBalance.leavePolicyId`
- **File**: `backend/prisma/schema.prisma` — models `EmployeeBankAccount`, `EmployeeDocument`, `LeaveEncashment`, `LeaveBalance`
- **Domain**: Performance
- **Issue**: These models are accessed by their FK fields (e.g. bank accounts loaded per employee during payroll, documents listed per employee) but have no `@@index` on those FK columns.
- **Fix**: Add `@@index([employeeId])` to `EmployeeBankAccount`, `EmployeeDocument`, `LeaveEncashment`; add `@@index([leavePolicyId])` and `@@index([companyId])` to `LeaveBalance`; add `@@index([leaveBalanceId])` to `LeaveEncashment`. `MANUAL` — requires `prisma migrate dev`.

### [Medium/MANUAL][FIXED] Unindexed FK: `AttendanceRecord.shiftId`, `TaxBracket.taxTableId`, `NecGrade.necTableId`, `TransactionCodeRule.transactionCodeId`
- **File**: `backend/prisma/schema.prisma` — models `AttendanceRecord`, `TaxBracket`, `NecGrade`, `TransactionCodeRule`
- **Domain**: Performance
- **Issue**: `AttendanceRecord.shiftId` (joined when computing OT), `TaxBracket.taxTableId` (loaded for every payroll run), `NecGrade.necTableId` (filtered when listing NEC grades), and `TransactionCodeRule.transactionCodeId` (joined during payroll) all lack `@@index` declarations.
- **Fix**: Add `@@index([shiftId])` to `AttendanceRecord`; `@@index([taxTableId])` to `TaxBracket`; `@@index([necTableId])` to `NecGrade`; `@@index([transactionCodeId])` to `TransactionCodeRule`. `MANUAL` — requires `prisma migrate dev`.

---

<!-- Task 7: Frontend security and quality sweep — 2026-03-23 -->

## Frontend Findings (Task 7)

### [Low][DEFERRED] `EmployeeEdit.tsx` — 834 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/EmployeeEdit.tsx`
- **Domain**: Code Quality
- **Issue**: The file is 834 lines, combining employee profile editing, document management, and salary structure in a single monolithic component. Individual sections are hard to test, review, and maintain.
- **Fix**: Extract each tab (Profile, Documents, Salary Structure) into dedicated sub-components under `frontend/src/pages/employee-edit/` and import them from the parent page.

### [Low][DEFERRED] `PayslipInput.tsx` — 826 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/PayslipInput.tsx`
- **Domain**: Code Quality
- **Issue**: 826 lines mixing payslip input form logic, TC line management, and preview rendering in one component.
- **Fix**: Split into `PayslipInputForm.tsx`, `PayslipTCLines.tsx`, and `PayslipPreview.tsx`; the parent should only compose them and handle routing state.

### [Low][DEFERRED] `utilities/Transactions.tsx` — 772 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/utilities/Transactions.tsx`
- **Domain**: Code Quality
- **Issue**: 772 lines blending transaction listing, filtering, form entry, and export logic in a single module.
- **Fix**: Extract the transaction form and export section into separate components, targeting each sub-concern at under 200 lines.

### [Low][DEFERRED] `PayrollInputGrid.tsx` — 693 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/PayrollInputGrid.tsx`
- **Domain**: Code Quality
- **Issue**: 693-line page combining inline grid editing, TC mapping, and summary calculations.
- **Fix**: Extract the grid body, TC column renderer, and action toolbar into separate components.

### [Low][DEFERRED] `utilities/BackPay.tsx` — 630 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/utilities/BackPay.tsx`
- **Domain**: Code Quality
- **Issue**: 630 lines mixing back-pay calculation form, employee selection, and preview table.
- **Fix**: Split into `BackPayForm.tsx` and `BackPayPreview.tsx` with a thin orchestrator parent.

### [Low][DEFERRED] `NecTables.tsx` — 599 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/NecTables.tsx`
- **Domain**: Code Quality
- **Issue**: 599 lines with NEC table listing, inline row editing, and bulk upload all in one file.
- **Fix**: Extract the edit modal and upload panel into `NecTableEditModal.tsx` and `NecTableUpload.tsx`.

### [Low][DEFERRED] `EmployeeNew.tsx` — 566 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/EmployeeNew.tsx`
- **Domain**: Code Quality
- **Issue**: 566 lines for a new-employee wizard with multiple field groups.
- **Fix**: Break form sections into field-group sub-components (PersonalFields, EmploymentFields, BankFields) and import them into the parent page.

### [Low][DEFERRED] `PayrollInputs.tsx` — 556 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/PayrollInputs.tsx`
- **Domain**: Code Quality
- **Issue**: 556 lines combining list, filter, and edit-in-place logic for payroll inputs.
- **Fix**: Extract the inputs table and inline edit form into dedicated components.

### [Low][DEFERRED] `utilities/PayrollCalendar.tsx` — 475 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/utilities/PayrollCalendar.tsx`
- **Domain**: Code Quality
- **Issue**: 475 lines mixing calendar rendering, period management, and close-period workflow.
- **Fix**: Split into `PayrollCalendarGrid.tsx` and `PeriodCloseModal.tsx`.

### [Low][DEFERRED] `TaxTableSettings.tsx` — 447 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/TaxTableSettings.tsx`
- **Domain**: Code Quality
- **Issue**: 447 lines combining tax table list, band editing, and bracket management.
- **Fix**: Extract `TaxBandEditor.tsx` as a standalone component.

### [Low][DEFERRED] `PayrollSummary.tsx` — 432 lines (split candidate)
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/pages/PayrollSummary.tsx`
- **Domain**: Code Quality
- **Issue**: 432 lines blending summary statistics, employee breakdown table, and export controls.
- **Fix**: Extract breakdown table and export actions into `PayrollSummaryTable.tsx` and `PayrollSummaryExports.tsx`.

### [Medium][FIXED] `PayslipExports.tsx` — silent fetch failure, no user-facing error state
- **File**: `frontend/src/pages/PayslipExports.tsx`
- **Domain**: Code Quality
- **Issue**: The `useEffect` fetch catches errors with only `console.error`. The page renders silently empty on failure, indistinguishable from an empty dataset.
- **Fix**: Add an `error` state variable. On catch, set it and render a visible inline error banner so the user knows the load failed and can retry.

### [Medium][FIXED] `TaxConfiguration.tsx` — silent fetch failure, no user-facing error state
- **File**: `frontend/src/pages/TaxConfiguration.tsx`
- **Domain**: Code Quality
- **Issue**: Tax-bands fetch errors are swallowed with `console.error`. The user sees a blank page with no feedback.
- **Fix**: Add error state and render an inline error banner on failure.

### [Medium][FIXED] `PayrollUsers.tsx` — silent fetch failure, no user-facing error state
- **File**: `frontend/src/pages/PayrollUsers.tsx`
- **Domain**: Code Quality
- **Issue**: Users list fetch errors are swallowed with only `console.error`. The table stays empty with no feedback.
- **Fix**: Add error state and render a visible error message on fetch failure.

### [Medium][FIXED] `Employees.tsx` — silent fetch failure for employees and filter dependencies
- **File**: `frontend/src/pages/Employees.tsx:50,72`
- **Domain**: Code Quality
- **Issue**: Both `fetchDependencies` and `fetchEmployees` swallow errors with `console.error`. A failed employee load shows a blank table indistinguishable from an empty result. Branch/department failures silently prevent filters from populating.
- **Fix**: Add a top-level `fetchError` state; set it in both catch blocks and render an alert banner above the table. Consider a separate state for dependency failures to allow degraded-but-functional operation.

### [Medium][FIXED] `SystemSettings.tsx` — silent fetch failure, no user-facing error state
- **File**: `frontend/src/pages/SystemSettings.tsx`
- **Domain**: Code Quality
- **Issue**: System settings fetch errors are swallowed via `console.error`. The user sees a blank settings form with no feedback.
- **Fix**: Add error state and render an inline error message.

### [Medium][FIXED] `PayrollCore.tsx` — silent fetch failure, no user-facing error state
- **File**: `frontend/src/pages/PayrollCore.tsx:14`
- **Domain**: Code Quality
- **Issue**: `fetchCores` catches errors with only `console.error`. The table silently stays empty on failure, indistinguishable from an empty dataset.
- **Fix**: Add error state and surface a visible error message. Empty-state and error-state should use different UI treatments.

### [Medium][FIXED] `CurrencyRates.tsx` — silent fetch failure, no user-facing error state
- **File**: `frontend/src/pages/CurrencyRates.tsx`
- **Domain**: Code Quality
- **Issue**: Currency rates fetch errors are swallowed with `console.error`.
- **Fix**: Add error state and render a visible error message on failure.

### [Medium][FIXED] `EmployeeModal.tsx` — untyped `onSave` callback and `initialData` prop
- **File**: `frontend/src/components/EmployeeModal.tsx:5-6`
- **Domain**: Code Quality
- **Issue**: `EmployeeModalProps` declares `onSave: (data: any) => void` and `initialData?: any`, losing all type safety for the data shape passed between parent and modal.
- **Fix**: Define a concrete `EmployeeFormData` interface (or reuse the existing `Employee` type from `types/employee.ts`) and replace both `any` usages with it.

### [Medium][FIXED] `EmployeeFilters.tsx` — untyped `branches` and `departments` props
- **File**: `frontend/src/components/employees/EmployeeFilters.tsx:8-9`
- **Domain**: Code Quality
- **Issue**: `branches: any[]` and `departments: any[]` lose type safety. The existing `Branch` and `Department` types from `types/common.ts` already describe these shapes.
- **Fix**: Import `Branch` and `Department` from `../../types/common` and replace `any[]` with the concrete types.

### [Medium][FIXED] `tax/NewTaxTableModal.tsx` — untyped `onSuccess` callback prop
- **File**: `frontend/src/components/tax/NewTaxTableModal.tsx:7`
- **Domain**: Code Quality
- **Issue**: `onSuccess: (newTable: any) => void` loses the shape of the newly created tax table returned from the API.
- **Fix**: Define or import a `TaxTable` interface and replace `any` with it.

### [Medium][FIXED] `attendance/Attendance.tsx` — untyped `employees` and `onSave` props in internal sub-component
- **File**: `frontend/src/pages/attendance/Attendance.tsx:37-39`
- **Domain**: Code Quality
- **Issue**: The internal attendance form component declares `employees: any[]` and `onSave: (data: any) => Promise<void>`, removing compile-time validation of attendance form data.
- **Fix**: Define an `AttendanceFormData` interface and an `EmployeeSummary` type to replace the `any` usages.

---

## Task 9: Frontend Performance Audit

### [Low][DEFERRED] React Query installed but not used — all data fetching via manual useEffect+axios
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/package.json:15`
- **Domain**: Performance
- **Issue**: @tanstack/react-query is a dependency but is unused. Every page uses manual useEffect+axios patterns with no caching, deduplication, or stale-while-revalidate. Component remounts cause re-fetches; sibling pages requesting the same data each fire independent requests with no sharing.
- **Fix**: Migrate data fetching to useQuery hooks for automatic caching, deduplication, background refetches, and stale data replay. This is a medium-term refactor (not a hotfix) affecting dozens of pages.

### [Low][DEFERRED] Large page components statically imported with no code splitting
<!-- DEFERRED: Medium-term refactor — not a hotfix. -->
- **File**: `frontend/src/App.tsx:1-102`
- **Domain**: Performance
- **Issue**: All 78+ page routes are static `import` statements. Large components (EmployeeEdit 834 lines, PayslipInput 826 lines, PayrollInputGrid 693 lines, etc.) are bundled into the initial js payload regardless of route. Users on `/employees` download bundles for payroll, leave, reports, admin pages, and utilities they may never visit.
- **Fix**: Use `React.lazy(() => import(...))` for all non-critical pages (dashboard, landing, login are reasonable exceptions). This defers large component parsing/hydration until route navigation. Reduces initial bundle by ~40–60 KB on average payroll platforms.

**Files reviewed:** 
- `frontend/src/App.tsx`
- `frontend/package.json`

**Confirmed:** 
- React Query present but unused
- No lazy loading in use (all static imports)
- 78 routes, 13+ pages over 400 lines
