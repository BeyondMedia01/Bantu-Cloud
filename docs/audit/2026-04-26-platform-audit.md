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
| V-052 | YTD boundary uses Zimbabwe tax year (April 1) | ⚠️ Partial | `utils/ytdCalculator.js:85-105` correctly anchors YTD to April 1 (and the `payslipFormatter.js`/`process.js` callers use it for FDS_AVERAGE and printed payslips). **Regression:** the year-end PAYE reconciliation at `backend/routes/payroll/reports.js:34-36` still uses `new Date(year, 0, 1)` / `Date(year, 11, 31)` — calendar-year window, so January–March payslips are split across the wrong tax year (B-001). |
| V-053 | NSSA ceiling read from SystemSettings (no hardcoded fallback at engine level) | ⚠️ Partial | `routes/payroll/process.js:269-287` and the `/preview` route at lines 78-106 both read `NSSA_CEILING_USD` and dynamically compute the ZiG ceiling from the latest USD→ZiG rate. **Caveat:** the `DEFAULT_NSSA_CEILING = { USD: 700, ZiG: 20000 }` constant remains in `utils/taxEngine.js:21` and is still used as a final fallback when `nssaCeiling` is null (line 125). Any caller that omits `nssaCeiling` (e.g. `services/backPayService.js`, the year-end reconcile, or any unit test) silently uses 700/20000 regardless of the live ZIMRA ceiling — see B-002. |
| V-054 | Tax engine rounds PAYE / AIDS levy / NSSA outputs | ✅ Confirmed | `utils/taxEngine.js:212-229` applies `r2()` to every returned monetary field. `calculateSplitSalaryPaye` apportions via `r2()` on each side. |
| V-055 | `normaliseBrackets` empty-bracket guard | ⚠️ Partial | `routes/payroll/process.js:245-249` returns 422 on empty USD brackets in `/process`. The `/preview` route at line 74-76 also guards. **Regression:** `services/backPayService.js:42-57` returns `[]` brackets silently and runs `calculatePaye` with no PAYE — back-pay tax estimates are zero with no warning (B-007). |
| V-056 | `pdfService.js` companyName null-safety | ✅ Not in scope | Marked FIXED in March audit; PDF formatter passes `payslip.payrollRun.company.name` which now has tight `select` upstream. |
| V-057 | `leave.js` POST negative balance race | ⚠️ Partial | `routes/leave.js:104-138` pre-checks balance and decrements inside `$transaction`, but the `Employee.leaveBalance` decrement is still a raw `{ decrement: days_f }` with no DB-level floor — concurrent requests can race past the pre-check (B-013). LeaveBalance row is also decremented without a `where: { balance: { gte: days_f } }` guard. |
| V-058 | `leave.js` approve idempotency | ✅ Confirmed | `routes/leave.js:207-209` returns 409 if `leaveReq.status === 'APPROVED'`. |
| V-059 | `leaveBalances.js` accrual rounding | ✅ Confirmed | `routes/leaveBalances.js:118-120` and 149 round each credit to 2dp. The `jobs/leaveAccrual.js` cron path however still uses `balance.accrued + policy.accrualRate` with no rounding (B-016). |
| V-060 | `payslipFormatter.js` LeaveBalance source-of-truth | ✅ Confirmed (with caveat) | `utils/payslipFormatter.js:250-264` resolves the balance via the active annual policy. **Caveat:** lines 310-311 still fall back to deprecated `payslip.employee.leaveBalance` / `leaveTaken` columns; if the migration drops those columns the fallback silently returns 0 — pre-existing risk noted in March audit, still present. |
| V-061 | N+1: leaveBalances accrual loop | ✅ Fixed — new N+1 in cron path | `routes/leaveBalances.js` POST `/accrue` now batches balance creates/updates. **Regression:** `jobs/leaveAccrual.js` (the cron + post-payroll path) still issues individual `findFirst` + `create`/`update` calls per employee×policy inside the nested loop — O(employees × policies × 3) round-trips per company on every monthly run (P-001). |
| V-062 | N+1: leaveBalances year-end | ✅ Confirmed | `routes/leaveBalances.js` POST `/year-end` now uses `prisma.$transaction` with batched payloads. |
| V-063 | N+1: backup restore | ✅ Confirmed | `routes/backup.js` restore path uses `createMany` with `skipDuplicates: true` per model. |
| V-064 | N+1: transactionCodes seed | ✅ Confirmed | `utils/transactionCodes.js` uses `createMany` batch with `select: { id: true }` on client fetch. |
| V-065 | findMany no select — Employee payroll run | ✅ Confirmed | `routes/payroll/process.js:327-345` uses an explicit `select` with exactly the fields the engine needs. |
| V-066 | findMany no select — Employee dashboard | ✅ Confirmed | `routes/dashboard.js:25-38` uses `select: { id, firstName, lastName, dateOfBirth, startDate, position }`. |
| V-067 | findMany no select — Payslip reports (multiple) | ⚠️ Partial | `routes/reports/statutory.js:/tax` at line 50-58 still uses `include: { employee: true, payrollRun: { include: { company: true } } }` with no `select` on either `Employee` or `Company` — returns all columns including TIN, bank details, and every company field for every payslip in the year (P-002). The `itf16` endpoint at line 165-175 uses a tight employee `select` but no Payslip column `select` — all ~30 Payslip columns fetched when only 5 are used (P-003). |
| V-068 | Unbounded findMany — PayslipTransaction | ✅ Confirmed | `routes/payslipTransactions.js` has `take` and pagination. **Note:** route is unmounted (S-018). |
| V-069 | Unbounded findMany — AuditLog admin | ✅ Confirmed | `routes/admin.js` audit log query includes `take`/`skip` pagination. |
| V-070 | Unindexed FKs (all March findings) | ✅ Confirmed | Schema has `@@index` on all FK fields identified in March: `Session.userId`, `ClientAdmin.clientId`, all six Employee FKs, `PayrollRun.companyId`/`payrollCalendarId`, `PayrollTransaction`/`PayrollInput`/`Payslip` run+employee FKs, `LoanRepayment`, `Loan`, `LeaveRecord`/`LeaveRequest`, `EmployeeBankAccount`/`EmployeeDocument`/`LeaveBalance`, `AttendanceRecord.shiftId`, `TaxBracket.taxTableId`, `NecGrade.necTableId`, `TransactionCodeRule.transactionCodeId`. |

---

## New Findings

### [B-001][High][Business Logic] Year-end PAYE reconciliation uses calendar year instead of Zimbabwe tax year
- **File:** `backend/routes/payroll/reports.js:34-36`
- **Issue:** `/api/payroll/:runId/reconcile` aggregates payslips with `startDate: { gte: yearStart, lte: yearEnd }` where `yearStart = new Date(year, 0, 1)` and `yearEnd = new Date(year, 11, 31)`. Zimbabwe's tax year runs April 1 – March 31. Reconciling against a January 1 window groups Jan–Mar payslips with the wrong tax year and computes `correctAnnualPaye` against the cumulative gross of an arbitrary calendar slice. The fix landed in `utils/ytdCalculator.js` (V-052) but this report endpoint was missed. The resulting `adjustment` figure is then fed into a "PAYE_ADJUSTMENT PayrollInput on the final run of the year" — a wrong figure here produces a wrong year-end true-up paid to the employee or owed to ZIMRA.
- **Fix:** Replace the calendar-year window with `getYtdStartDate(run.startDate, firstRunDate)` from `utils/ytdCalculator.js` for both `yearStart` and `yearEnd` (April 1 → March 31). Also annualise `taxCredits` and `taxDirectiveAmt` over the actual number of months in the tax year window covered by the aggregated payslips, not by `agg.months` alone.

### [B-002][High][Business Logic] `taxEngine.js` `DEFAULT_NSSA_CEILING` silently used by `services/backPayService.js` and any caller that omits `nssaCeiling`
- **File:** `backend/utils/taxEngine.js:21`, `backend/services/backPayService.js:143`
- **Issue:** `DEFAULT_NSSA_CEILING = { USD: 700, ZiG: 20000 }` is the engine's last-resort fallback. `services/backPayService.js` calls `calculatePaye({ baseSalary: empGross, currency: 'USD', taxBrackets })` — no `nssaCeiling`, no `nssaEmployeeRate`, no `aidsLevyRate`, no `medicalAidCreditRate`. The engine therefore applies the hardcoded 700 USD ceiling, the hardcoded 4.5% NSSA rate, and the hardcoded 3% AIDS levy. Whenever ZIMRA revises any of those values the back-pay tax estimate (`taxEstimate` and `netEstimate` returned to the operator before commit) is silently wrong. The same risk applies to the year-end reconcile (`backend/routes/payroll/reports.js:136-144`) which omits `nssaCeiling`, `nssaEmployeeRate`, `aidsLevyRate`, and `medicalAidCreditRate`.
- **Fix:** Have `services/backPayService.js` and the reconcile handler load all statutory rates and ceilings via `getSettings()` and pass them to `calculatePaye`. Either remove `DEFAULT_NSSA_CEILING` and throw if `nssaCeiling` is missing, or log a warning at every fallback so unrecognised callers are detected.

### [B-003][High][Business Logic] Split-salary apportionment uses cash-only ratio but applies it to PAYE that includes benefits
- **File:** `backend/utils/taxEngine.js:317-369`
- **Issue:** `calculateSplitSalaryPaye` derives `usdRatio = cashUSD / totalCashUSD` where `cashUSD = base + overtime + bonus + severance` — explicitly excluding `taxableBenefits`, `motorVehicleBenefit`, and `loanBenefit`. The consolidated PAYE result, however, *does* include those benefits in `grossForTax`. When an employee has, say, a USD vehicle benefit but a ZiG bonus, the ratio understates the USD share and over-apportions PAYE/AIDS levy/NSSA to the ZiG side (or vice versa). NSSA in particular should be apportioned by `nssaBasis` (cash earnings minus NSSA-excluded), not by the cash earnings used here, because `nssaExcludedEarnings` may be entirely on one side while `cashEarnings` is on the other. The result is that ZIMRA NSSA returns and FDS PAYE remittance can be split across the wrong currency totals on the P2.
- **Fix:** Compute three apportionment ratios — one for PAYE (using `grossForTax` per side), one for NSSA (using each side's `nssaBasis`), and one for net pay (using each side's cash earnings net of side-specific deductions). Apportion each output field with its corresponding ratio. Document that a single ratio is only safe when `taxableBenefits`, `motorVehicleBenefit`, and `loanBenefit` are zero.

### [B-004][High][Business Logic] Split-salary engine forces consolidated NSSA ceiling to USD; ZiG ceiling parameter is ignored
- **File:** `backend/utils/taxEngine.js:308-312`
- **Issue:** Inside `calculateSplitSalaryPaye`, the consolidated parameter set passes `nssaCeiling: usdParams.nssaCeiling || 700`. Both `zigParams.nssaCeiling` and the dynamic `effectiveNssaCeilingZIG` value computed by `routes/payroll/process.js:274-286` are discarded. Because the consolidated calculation is in USD, this is correct only if the caller's `usdParams.nssaCeiling` is the USD ceiling. But if both NSSA-able earnings exceed the ceiling, the cap is applied once on the consolidated USD basis — the ZiG-side ceiling that was carefully derived from the live USD→ZiG rate never enters the calculation. Worse: the fallback `|| 700` clobbers any caller who explicitly passes `nssaCeiling: 0` or who relies on the engine's `DEFAULT_NSSA_CEILING` mechanism. NSSA collected on dual-currency runs is wrong whenever `usdParams.nssaCeiling` is missing or zero.
- **Fix:** Remove the `|| 700` literal — either propagate `null` so the engine uses its documented default, or require the caller to pass an explicit ceiling. For dual runs, document that `nssaCeiling` must be the USD ceiling for the consolidated calculation, then verify both sides of the split are within their own currency's ceiling after apportionment.

### [B-005][High][Business Logic] FDS_AVERAGE forecasting averages by `(uniqueMonths + 1)` but cumGross is a sum of *all* prior payslips
- **File:** `backend/routes/payroll/process.js:543-565,894-903`
- **Issue:** `cumGross` accumulates `ps.gross ?? 0` from every YTD payslip — including multiple payslips for the same calendar month (e.g. a re-run, a correction run, or a mid-month termination payslip plus a regular run). `uniqueMonths` is a `Set` of `${year}-${month}`, so the divisor is "distinct months covered + this one". When two payslips exist for the same month (re-processed or correction), `cumGross` adds them both but the divisor stays constant. The FDS average is therefore inflated and the employee is over-taxed via the FDS_AVERAGE PAYE basis.
- **Fix:** Either (a) deduplicate `cumGross` by month — keep only the latest payslip per `${year}-${month}` — or (b) accumulate by month into a `Map<monthKey, gross>` and use `[...map.values()].reduce((a,b)=>a+b,0) / (map.size + 1)`.

### [B-006][High][Business Logic] Loan deemed-interest benefit pulls only PAID repayments, not LoanRepayment.amount of fully repaid principal
- **File:** `backend/routes/payroll/process.js:473-481,597-601,612-617`
- **Issue:** `loan.repayments` is loaded with `where: { status: 'PAID' }` and the current balance is `Math.max(0, loan.amount - sum(paid))`. Two problems: (1) when a repayment is partially applied during processing, this period's deduction reduces principal in the next run only after the repayment is moved to `PAID` — but the **deemed-interest benefit** for the *current* run is computed using the prior balance, which does not yet reflect this period's deduction. (2) The original `Loan.amount` is treated as the running balance — there is no way to record an opening balance for a loan written into the system mid-life with already-paid principal. Both cases overstate the deemed-interest taxable benefit. ZIMRA prescribes interest on the outstanding balance *at month end* — the engine currently uses the prior month-end balance.
- **Fix:** Compute `currentBalance = loan.amount - sum(repayments WHERE paidDate <= run.endDate)` and either (a) include this period's already-decided deduction by computing the benefit *after* the deduction loop (line 1054 onward) or (b) pull `loan.openingBalance` if the model is extended to support it.

### [B-007][Medium][Business Logic] `services/backPayService.js` silently returns zero PAYE if no USD tax table exists
- **File:** `backend/services/backPayService.js:42-57,141-145`
- **Issue:** `getTaxBrackets` returns `taxTable?.brackets ?? []`. When no USD tax table is configured, the back-pay preview's `taxResult` is computed against zero brackets and returns `totalPaye: 0`. Operators then see a "tax estimate" of zero and assume the employee will receive the full back-pay gross net of nothing — leading them to under-deduct PAYE on the BACK_PAY input that gets committed. Unlike the `/process` route, this preview has no 422 guard. A second issue: the back-pay preview hardcodes `currency: 'USD'` for the tax estimate even when the back-pay is being committed in ZiG (line 143), so ZiG employees' tax estimates use USD bands directly without converting their gross via the exchange rate.
- **Fix:** Mirror the `/process` route's empty-bracket 422 guard. Convert ZiG cumulative diffs to USD via the run's exchange rate before applying the USD bands (or surface a clearly-labelled "estimate may be inaccurate" flag).

### [B-008][Medium][Business Logic] Back-pay preview ignores `pensionContribution`, `medicalAid`, `taxCredits` — under-estimates net
- **File:** `backend/services/backPayService.js:143`
- **Issue:** The estimator passes only `baseSalary`, `currency`, and `taxBrackets`. The employee's existing `pensionContribution`, `medicalAid`, `taxCredits`, and any `taxDirective` settings are not applied. The resulting `netEstimate = totalShortfall - PAYE - 0` overstates PAYE (no pension reducing taxable income, no medical aid credit) and ignores legitimate tax directives. For high earners with significant pension contributions the net can be off by 10-30 %.
- **Fix:** Either compute the back-pay shortfall by re-running the *delta* of `calculatePaye(newRate) - calculatePaye(oldRate)` for each affected month using each month's actual TaxTable, or document loudly that the preview is gross-only.

### [B-009][Medium][Business Logic] `commit` of back-pay creates a single `PayrollInput` for the current period — period-attribution is lost
- **File:** `backend/routes/backPay.js:113-122`
- **Issue:** Zimbabwe tax law attributes earnings to the *period in which they were earned* (FDS reporting on the P2). The committed back-pay input collapses all affected runs into one current-period adjustment with no `originalPeriod` field on the `PayrollInput`. When the employee's P2 is filed, the back-pay is reported in the current month's row instead of being apportioned across the months it covers — under-reporting prior-period gross and over-reporting current-period gross. ZIMRA can challenge the apportionment.
- **Fix:** Extend `PayrollInput` schema with an optional `originalPeriod` (or attribute period range) and have the FDS/P2 generator allocate the back-pay across the affected months. Alternatively, create one PayrollInput per affected run with a marker and have the P2 export read those markers.

### [B-010][Medium][Business Logic] `negative-run` correction path uses linear ratio `gross × newRate / oldRate` — wrong when gross included non-rate-driven components
- **File:** `backend/routes/backPay.js:278-282`
- **Issue:** The corrected gross is computed as `ps.gross * (emp.newRate / emp.oldRate)`. `ps.gross` includes overtime, bonuses, allowances, and benefits — none of which scale linearly with base rate. If an employee's baseRate doubles but they had a one-off bonus or vehicle benefit included in `ps.gross`, the correction also doubles the bonus. The reversal/correction pair therefore restates the bonus and over-credits the employee.
- **Fix:** Replay the original payslip's transactions with the corrected base rate, or fetch `ps.basicSalaryApplied` (already stored) and apply the rate ratio only to that field, leaving overtime/bonus/benefits unchanged.

### [B-011][Medium][Business Logic] `loans.js` POST schedules repayments using `setMonth(monthIndex + 1 + i)` which silently advances months on day 31
- **File:** `backend/routes/loans.js:67-72`
- **Issue:** `dueDate.setMonth(dueDate.getMonth() + i + 1)` rolls over when the start date is the 29th–31st and the target month has fewer days (e.g. start `2026-01-31` → setMonth(2) yields `2026-03-03`, not the last day of February). Repayments scheduled this way drift one to three days each month and can land in the *next* payroll period than intended, causing missed deductions or the loan running one month longer than its `termMonths`.
- **Fix:** Compute due dates by clamping to the last day of the target month: `new Date(year, startMonth + i + 1 + 1, 0)` for end-of-month, or use a date library. Alternatively round to the 1st/15th/end-of-month based on the company's payroll calendar.

### [B-012][Medium][Business Logic] Loan deduction is "all or nothing" — partial deductions never apply, employee can defer indefinitely
- **File:** `backend/routes/payroll/process.js:1062-1093`
- **Issue:** `if (rep.amount > availableUSD + 0.001) { continue; }` skips an entire repayment when the employee's net is one cent short. The repayment stays UNPAID and is retried next period. There is no partial-application path: an employee whose net pay is 99% of the repayment amount (e.g. due to higher than expected loans/medical aid) skips the loan entirely. This compounds: a loan with a 24-month term can stretch indefinitely if a single high-deduction month tips net below the repayment threshold. Worse, in dual-currency runs the loan is deducted only from USD net (line 1062) — if ZiG net is positive but USD is below the repayment amount, the employee's loan is skipped despite having available pay in ZiG.
- **Fix:** Decide policy with the client: either (a) take whatever fraction is available and split the remainder over future periods, (b) cap deductions at 33% of net (Zimbabwe Labour Act cap), or (c) bring the deduction across both currencies proportionally for dual runs.

### [B-013][Medium][Business Logic] `Employee.leaveBalance` decrement has no DB-level floor — concurrent leave requests can race past the balance check
- **File:** `backend/routes/leave.js:104-138,219-267`
- **Issue:** Both POST `/leave` (CLIENT_ADMIN direct create) and PUT `/leave/request/:id/approve` use `prisma.employee.update({ data: { leaveBalance: { decrement: days_f } } })` and `prisma.leaveBalance.update({ data: { balance: { decrement: days_f } } })`. The pre-check is inside the same transaction (good), but neither `Prisma.update` carries a `where` clause that asserts `balance >= days_f` at write time. Two concurrent approvals (e.g. two managers double-clicking) both pass the pre-check at the same DB snapshot, both decrement, and the balance goes negative. March audit's V-057 marked this fixed for the request flow only — the concurrency race remains.
- **Fix:** Use `prisma.leaveBalance.updateMany({ where: { id, balance: { gte: days_f } }, data: { ... } })` and verify `count === 1`; if zero, re-throw the insufficient-balance error. Add a `CHECK (balance >= 0)` constraint on `LeaveBalance` and `Employee.leaveBalance` — Postgres will then reject racing decrements outright.

### [B-014][Medium][Business Logic] `leaveBalances.js` accrual ignores `policy.accrualRate × monthsElapsed` for new starters mid-year
- **File:** `backend/routes/leaveBalances.js:117-134`, `backend/jobs/leaveAccrual.js:96-100`
- **Issue:** When a `LeaveBalance` does not yet exist, the accrual job credits `policy.accrualRate` (one month's worth) regardless of whether the employee has been employed for one month or eleven. The cron path goes further: `if (emp.startDate >= currentMonthStart) { skipped++; continue; }` — an employee who started mid-month receives the full month's accrual, while an employee who started this month gets zero. There is no proration for partial months. Compounded over a year, employees who joined in March 2026 (the first accrual run) end up with a different balance from those who joined April 1 — even if they worked the same days.
- **Fix:** Compute prorated accrual: `proratedRate = policy.accrualRate × (workedDays / daysInMonth)`. For new starters, run a one-time back-fill that credits accruals for every month between `startDate` and the current month, prorated for the joining month.

### [B-015][Medium][Business Logic] `leaveBalances.js` `/year-end` carry-over double-counts when the new-year balance already has an accrued amount
- **File:** `backend/routes/leaveBalances.js:226-244`
- **Issue:** The new-year upsert uses `update: { openingBalance: { increment: carryAmount }, balance: { increment: carryAmount } }`. If `/year-end` is run twice for the same closingYear (idempotency failure), `openingBalance` is incremented each time. There is no marker on the closing-year balance to indicate it has already been processed, so a second invocation forfeits the same closing balance again and re-credits the new year. The closing-year `forfeited` field is *overwritten* (`data: { forfeited: forfeitAmount }`) on each run, which masks the duplication on the closing side but the new-year side keeps growing.
- **Fix:** Add a `yearEndProcessedAt: DateTime?` column on `LeaveBalance` and set it inside the same transaction. On subsequent runs, skip records where `yearEndProcessedAt` is set. Also turn the `update: { openingBalance: { increment } }` into `update: { openingBalance: carryAmount, balance: carryAmount }` (set, not increment) so re-runs converge to the same value.

### [B-016][Medium][Business Logic] `jobs/leaveAccrual.js` cron path adds `policy.accrualRate` raw — drifts from the manual-accrue path's 2dp rounding
- **File:** `backend/jobs/leaveAccrual.js:163-167`
- **Issue:** `const newAccrued = balance.accrued + policy.accrualRate;` — no `Math.round(... * 100) / 100`. `routes/leaveBalances.js:118-120,149` rounds every credit to 2dp. Companies whose accrual is triggered post-payroll (`process.js:1319-1321`) get rounded credits; companies whose accrual is run cron-only get unrounded credits like `20.000000000004`. Over time the two systems diverge and the year-end carry-over forfeits or carries different amounts depending on which path ran first.
- **Fix:** Apply `r2()` rounding consistently in both code paths. Centralise the credit logic into a single helper function and call it from both routes.

### [B-017][Medium][Business Logic] `leaveEncashments.js` daily rate divides monthly salary by `daysPerPeriod || 22` — wrong for ZiG salaries that already include vehicle/allowances
- **File:** `backend/routes/leaveEncashments.js:88-91`
- **Issue:** `monthlySalary = emp.baseRate` and `ratePerDay = monthlySalary / divisor`. The encashment is taxed (it becomes a `BACK_PAY`-style EARNING input via `LEAVE_ENCASHMENT` TC) but the rate per day is computed against `baseRate` only — ignoring recurring earnings that the employee actually receives (housing allowance, vehicle benefit, transport allowance). Zimbabwe Labour Act and most NEC agreements define the "daily rate" for severance and leave-pay purposes as the *gross monthly remuneration* divided by working days, not the basic salary. Companies that use NEC grades will under-pay employees whose recurring allowances are significant.
- **Fix:** Compute monthly remuneration by summing the employee's recurring `EmployeeTransaction` records of type EARNING/BENEFIT plus `baseRate`, then divide by working days. Alternatively, allow the company to configure which TCs feed the encashment rate.

### [B-018][Medium][Business Logic] `leaveEncashments.js` does not enforce period-lock — encashment can be created against a closed payroll calendar
- **File:** `backend/routes/leaveEncashments.js:198-249`
- **Issue:** `POST /:id/process` creates a `PayrollInput` for the current month with no `payrollCalendar.isClosed` check. `payrollInputs.js` POST has the lock check (lines 81-108) but `leaveEncashments.js` bypasses it. An encashment processed for a period that has already been closed creates a stranded input that will neither be picked up by a future payroll (period-lock filter excludes it) nor be visible in pre-close validation.
- **Fix:** Apply the same period-lock check used in `payrollInputs.js POST`. Better: have `leaveEncashments.js` call into a shared `createPayrollInput()` helper that enforces all invariants in one place.

### [B-019][Medium][Business Logic] `nssaContributions.js` reuses employee NSSA as employer NSSA — the `nssaEmployer` payslip column is ignored
- **File:** `backend/routes/nssaContributions.js:90-91,100`
- **Issue:** `run.totalEmployerNssa += empNssa` and `employerNssa: empNssa` — the report reuses the employee NSSA value as employer NSSA. This is correct only when the employee and employer rates are identical (currently 4.5% / 4.5%), and the comment "employer = employee under equal-rate structure" acknowledges this. But the schema stores `nssaEmployer` as a separate column that the engine writes per-payslip, and the rate is configurable via `NSSA_EMPLOYER_RATE` — any future divergence (NSSA has historically used different employee/employer rates) will silently mis-state the employer NSSA report. Also, when an employee turns 65 the engine sets `effectiveNssaEmprRate = 0` (process.js:875-878), so `nssaEmployer` should be zero on that payslip, but the report still credits the employer with the employee NSSA value (which is also zero — but if rates differ, both would be wrong).
- **Fix:** Use `ps.nssaEmployer` from the payslip, not `ps.nssaEmployee`, for the employer column.

### [B-020][Medium][Business Logic] `bankFiles.js` exports only USD net for dual-currency runs — ZiG portion is silently dropped
- **File:** `backend/routes/bankFiles.js:109,131,155`
- **Issue:** All three formats (CBZ, Stanbic, Fidelity) compute `const net = run.dualCurrency ? (p.netPayUSD ?? p.netPay) : p.netPay`. For a dual-currency employee with `netPayUSD = 800` and `netPayZIG = 1.2M`, only the USD figure is written to the bank file. The ZiG portion never reaches the bank — employees are short-paid until manually corrected. There is also no separate file generation per currency, no `EmployeeBankAccount.currency` filtering, and no use of the `splitType/splitValue` configuration on multi-account employees.
- **Fix:** When `run.dualCurrency`, generate two bank files — one for USD (using `netPayUSD` and bank accounts with `currency = 'USD'`), one for ZiG (`netPayZIG`, ZiG accounts). Honour `EmployeeBankAccount.priority` and `splitType/splitValue` to handle employees whose net is split across multiple accounts.

### [B-021][Medium][Business Logic] `payIncrease.js` rounds new rate but does not re-apply NEC minimum — increases below NEC minRate are silently capped at write time
- **File:** `backend/routes/payIncrease.js:48-58`
- **Issue:** `newRate = baseRate × (1 + percentage/100)` is written directly to `Employee.baseRate`. If the employee is on an NEC grade with a `minRate` higher than the resulting `newRate`, the increase looks valid in the audit log but the next payroll run will silently raise it back to `necGrade.minRate` (process.js:840-841). The audit log shows `oldRate=200, newRate=210` but the employee is actually paid `necGrade.minRate=250` — a discrepancy that surfaces only when the operator queries the actual payslip. There is also no warning when the *new* rate falls below the NEC minRate after a percentage decrease (negative percentage), nor is the increase reversed when the audit log says it was applied but the floor mechanism kicked in.
- **Fix:** When the employee is on `rateSource === 'NEC_GRADE'`, compute `newRate = max(newRate, necGrade.minRate)` and surface a warning if the floor was hit. Also reject pay decreases that drop the rate below `minRate` rather than silently flooring.

### [B-022][Medium][Business Logic] `payIncrease.js` applies new rate immediately even when `effectiveDate` is in the future or the past
- **File:** `backend/routes/payIncrease.js:43-59`
- **Issue:** `effectiveDate` is captured in the audit log but the actual `Employee.baseRate` update happens immediately on POST. A future-dated increase takes effect on the next payroll run regardless of the date. A past-dated increase requires the operator to remember to also commit a back-pay run. The endpoint warns about the future case but provides no scheduling — and the operator who forgets to reverse a typo'd future date has to manually walk back the rate.
- **Fix:** Store pending increases in a `ScheduledPayChange` table (effectiveDate, oldRate, newRate, status) and apply them at the start of each payroll run that overlaps the effective date. For past dates, automatically commit a back-pay PayrollInput in the same transaction so the operator cannot forget.

### [B-023][Medium][Business Logic] `periodEnd.js` silently fails leave-accrual loop — clientId scope leaks across companies on partial failure
- **File:** `backend/routes/periodEnd.js:66-76`
- **Issue:** After the period-end transaction commits, the route iterates every company under the client and calls `runLeaveAccrual(company.id, results.endDate)`. Errors are caught per-company and logged but not surfaced to the caller. If three of five companies fail accrual, the API returns a 200 success with no indication that two-thirds of leave balances are still missing the period's accrual. Also, `runLeaveAccrual(companyId, endDate)` is called with the **closed calendar's endDate** — but the calendar may span multiple companies on different payroll cycles; one company's actual payroll may run on a different end date.
- **Fix:** Aggregate per-company accrual results and return them in the response (`accrualOutcomes: [{ companyId, status, errorCount }]`). Resolve each company's actual most-recent COMPLETED payroll run endDate inside the loop instead of reusing the calendar's endDate.

### [B-024][Medium][Business Logic] `periodEnd.js` POST has no idempotency — reopening + re-closing a period flips OVERDUE repayments back to UNPAID and back again
- **File:** `backend/routes/periodEnd.js:42-58,149-175`
- **Issue:** The POST handler returns 400 if the calendar is already closed (good for the calendar itself), but `loanRepayment.updateMany({ status: 'UNPAID' → 'OVERDUE' })` is only run on close. The `un-close` route does not reverse the OVERDUE flag, so on re-close the same `WHERE status = 'UNPAID'` filter no longer matches the previously-overdued ones, but any *new* unpaid repayments (created or unflagged in the meantime) are flipped to OVERDUE. The status history is therefore inconsistent: a repayment that was "OVERDUE → re-flagged as DUE → UNPAID → OVERDUE again" cannot be distinguished from a first-time miss. There is also no audit trail entry on the un-close.
- **Fix:** Add `audit()` to the un-close route. Track repayment-status transitions in a separate `LoanRepaymentStatusHistory` table or on a JSON column. Make the close idempotent by re-running OVERDUE flagging on every close (not just transitions from open → closed).

### [B-025][Medium][Business Logic] `process.js` post-tax deductions are not subject to ZIMRA's 33% net-pay garnishment cap
- **File:** `backend/routes/payroll/process.js:1054-1107`
- **Issue:** `inputDeductions` (post-tax voluntary deductions like funeral schemes, union dues, garnishees) and `loanDeductions` are subtracted with `Math.max(0, ...)` floor only — there is no enforcement of Zimbabwe Labour Act §12(4) which limits non-statutory deductions to 33% of net pay (35% for housing-related). An employee with high voluntary deductions can have their net rounded to zero. There is no warning surfaced on the payslip nor any pre-flight check.
- **Fix:** After computing `taxResult.netSalary`, compute `maxNonStatutoryDeduction = taxResult.netSalary × 0.33`. If `inputDeductions + loanDeductions > maxNonStatutoryDeduction`, either cap the sum and log a warning, or reject processing with a 422 surfacing the offending employees.

### [B-026][Medium][Business Logic] `process.js` mid-month termination prorates by **calendar days**, not working days — under-pays employees who terminate before a weekend
- **File:** `backend/routes/payroll/process.js:815-829`
- **Issue:** `prorationFactor = workedDays / periodDays` where both are calendar days (`Math.ceil((dDate - run.startDate) / (1000*60*60*24)) + 1`). The unpaid-leave proration on lines 803-812, by contrast, uses `daysPerPeriod || 22` (working days). An employee who terminates on a Friday is paid for `(Friday - 1st) / 30` of the month rather than `(workedWorkingDays / 22)` — for someone who actually worked every working day until Friday, this short-changes them by ~10% (working-days/calendar-days ratio). This also varies month-to-month: terminating on the 15th of February (28 days) pays a different proration than terminating on the 15th of March (31 days) for identical actual work.
- **Fix:** Use working days for both leave and termination proration: `workedWorkingDays / (emp.daysPerPeriod || workingDaysPerPeriodDefault || 22)`. Compute working-days-elapsed using the company's `PublicHoliday` table to exclude holidays.

### [B-027][Medium][Business Logic] `process.js` ZiG vehicle benefit table is keyed by run currency, not employee currency — dual-currency runs always use USD ZIG benefit
- **File:** `backend/routes/payroll/process.js:319-336,965-967`
- **Issue:** `resolveVehicleBenefit(emp, run.currency)` selects from the vehicle benefit table by run currency. For dual-currency runs, `run.currency` is forced to `'USD'` at create time (`payroll.js:97 — currency: isDual ? 'USD' : (currency || 'USD')`). A ZiG-primary employee on a dual-currency run therefore receives the USD vehicle benefit, not the ZiG one, even though their salary is paid in ZiG. The split logic at line 965-967 then routes the resolved value to the ZiG side based on `emp.currency` — but the value itself is the USD amount.
- **Fix:** Pass `emp.currency` (or `'USD'` for the USD-side, `'ZiG'` for the ZiG-side) into `resolveVehicleBenefit` separately for each call site in the dual-currency branch.

### [B-028][Medium][Business Logic] `process.js` FDS_AVERAGE basis for ZiG-primary employees converts back via `xr` after baseRate was already converted
- **File:** `backend/routes/payroll/process.js:898-902`
- **Issue:** Comment claims the double-conversion is fixed, but the code computes `currGross = baseRate + inputEarningsUSD + (inputEarningsZIG / xr)`. `baseRate` here is already in USD (the run's reference currency for dual-currency runs — `process.js:945`). For a ZiG-primary employee, `baseRate = effectiveBaseSalary / xr` so the ZiG salary has already been converted to USD. But the `(inputEarningsZIG / xr)` term divides the *separately tracked* ZiG-input earnings by xr — this is correct for those earnings. However the same `inputEarningsZIG` is added to `taxResultZIG.gross` later and apportioned via `usdRatio` — meaning ZiG earnings end up consolidated twice in the FDS basis: once via the divide-by-xr here, and again via the consolidated `calculateSplitSalaryPaye` call. FDS_AVERAGE was designed for non-dual runs and the ported-to-dual logic is brittle.
- **Fix:** Disable FDS_AVERAGE for dual-currency runs (return 422 if any selected employee has `taxMethod === 'FDS_AVERAGE'` and `run.dualCurrency`) until the basis can be authoritatively computed in USD.

### [B-029][Low][Business Logic] `taxEngine.js` `taxCreditsApplied` formula is convoluted and can return wrong value when directives reduce PAYE to zero
- **File:** `backend/utils/taxEngine.js:227`
- **Issue:** `taxCreditsApplied: r2(payeBeforeLevy > 0 ? (payeBeforeLevy + (payeBeforeLevy * aidsLevyRate) - finalTotalPaye) : (medicalAidCredit + taxCredits))` — the formula only works when the directive does not reduce PAYE to exactly zero. When `payeBeforeLevy > 0` but the directive zeroes `finalTotalPaye`, the formula reports the *full* gross PAYE as "tax credits applied", which is misleading on the payslip. The credits used were `medicalAidCredit + taxCredits`; the directive reduced the remainder. Also: this field is never used by any downstream report or on the payslip PDF — it's dead-but-incorrect data persisted to the Payslip table.
- **Fix:** Either (a) compute `taxCreditsApplied = min(medicalAidCredit + taxCredits, payeBeforeLevy)` so it represents only the credit-component, or (b) drop the field if it isn't surfaced anywhere.

### [B-030][Low][Business Logic] `taxEngine.js` net-salary can go negative; engine returns the negative without clamping
- **File:** `backend/utils/taxEngine.js:208-209,229`
- **Issue:** `netSalary = cashEarnings - totalDeductions` is returned with `r2()` but no `Math.max(0, ...)` floor. When pension contribution + medical aid + statutory deductions exceed cash earnings (rare but possible — e.g. employee on unpaid leave with active pension TC), the engine returns a negative net. The caller in `process.js:1094` floors to zero (`Math.max(0, taxResult.netSalary - loanDeductions - inputDeductions)`), but the negative value is also stored on the payslip via `payslipData.push({ ... netPay: netPayAfterLoans })`. For dual runs (`netPayUSD = taxResultUSD.netSalary - loanDeductions - inputDeductionsUSD` — process.js:1072), the floor is at the apportionment level, but NSSA/PAYE columns store the engine's raw signed values.
- **Fix:** Apply `Math.max(0, ...)` to `netSalary` inside the engine, or document that callers must floor and ensure the dual-currency apportionment also floors per-side.

### [B-031][Low][Business Logic] `bankFiles.js` Stanbic export hardcodes BIC `'003'` (Stanbic Zimbabwe ZW clearing) — wrong if the receiving bank is not Stanbic
- **File:** `backend/routes/bankFiles.js:136`
- **Issue:** `'003'` is the Stanbic Bank Zimbabwe clearing code, but the Stanbic EFT format is for *outbound* payments from a Stanbic account. The `BankCode` column should be the *receiving* bank's clearing code, derived from the employee's bank. The current code sets every row's BankCode to Stanbic's own — so all transfers will be routed as if they're internal Stanbic transfers, which Stanbic's clearing system will reject for non-Stanbic destination accounts.
- **Fix:** Look up the receiving bank's clearing code from the employee's `bankName`. Maintain a small mapping table in the codebase: `{ 'Stanbic': '003', 'CBZ': '004', 'ZB': '011', ... }`.

### [B-032][Low][Business Logic] `loans.js` `PUT /:id` allows changing `status` directly to `PAID_OFF` without verifying repayments are settled
- **File:** `backend/routes/loans.js:117-152`
- **Issue:** A user with `manage_loans` can `PUT /loans/:id` with `{ status: 'PAID_OFF' }` even when there are still UNPAID repayments. The next payroll run will skip the loan (because `status !== 'ACTIVE'`) but the repayment records remain UNPAID, distorting the balance shown elsewhere. Conversely, `PAID_OFF → ACTIVE` does not re-open the repayments. There's also no validation that `status` is one of the permitted transitions.
- **Fix:** Validate transitions: `ACTIVE → PAID_OFF` requires zero unpaid repayments; `PAID_OFF → ACTIVE` is platform-admin only and re-opens linked repayments. Reject manual `status` writes that do not match the actual repayment state.

### [B-033][Low][Business Logic] `payrollInputs.js` POST does not validate that `period` matches a real PayrollCalendar
- **File:** `backend/routes/payrollInputs.js:73-121`
- **Issue:** `period` is accepted as any `YYYY-MM` string. There is no check that a `PayrollCalendar` exists for that period — operators can stage inputs for `2099-12` and never see them processed. The lock-check at lines 81-108 only fails if the period maps onto a *closed* calendar; an unknown period is allowed through. The `processed` flag stays false forever and the input lurks in the system.
- **Fix:** Look up `PayrollCalendar.findFirst({ where: { clientId, startDate: { lte: periodEnd }, endDate: { gte: periodStart } } })` and 422 if no calendar exists. Optionally, allow ahead-of-time staging only when `req.companyId`'s next calendar covers the period.

### [B-034][Low][Business Logic] `payslipExports.js` `payPeriod: new Date(payPeriod)` accepts arbitrary dates with no payroll-run linkage
- **File:** `backend/routes/payslipExports.js:50-67`
- **Issue:** The export record stores `payPeriod` as a free-form Date with no foreign key to a PayrollRun. Two exports for the same employee + period can be created with subtly different dates, and there is no way to verify that the `netPayUSD` / `netPayZiG` the operator typed actually match a real payslip's net. This is the "dead route" identified in S-018, but if it is re-mounted, the lack of payslip linkage will let operators record arbitrary export amounts (which then feed bank reconciliation reports) for regulatory exports.
- **Fix:** Either drop the route entirely (it is unmounted anyway — see S-018), or add a foreign key to `Payslip` and verify net amounts match.

### [B-035][Low][Business Logic] `currencyRates.js` POST allows duplicate rates for the same `(companyId, fromCurrency, toCurrency, effectiveDate)` — no uniqueness constraint
- **File:** `backend/routes/currencyRates.js:60-87`
- **Issue:** No upsert and no unique constraint. An operator can create two rates for the same date with different values; the payroll engine then resolves "the most recent" via `orderBy: { effectiveDate: 'desc' }`, which is non-deterministic when two rates share the same date. NSSA ceiling derivation (`process.js:276-285`) then picks an arbitrary one. Companies running same-day rate updates (e.g. when a new RBZ rate is published mid-day) get inconsistent NSSA ceilings between consecutive payroll runs.
- **Fix:** Add a unique constraint on `(companyId, fromCurrency, toCurrency, effectiveDate)` and switch the POST to an `upsert` so updates replace rather than duplicate.

### [B-036][Low][Business Logic] `taxTables.js` overlap detection in PUT compares strings as dates and misses single-day edge cases
- **File:** `backend/routes/taxTables.js:117-132`
- **Issue:** The overlap query `effectiveDate: { gte: dStart, lte: dEnd || new Date('2099-12-31') }` uses date inequalities. Two tables with `effectiveDate = 2026-04-01` and `expiryDate = 2026-03-31` (a back-to-back pair where the new table starts the day after the old one ends) overlap *only* on the boundary day. Postgres compares timestamps with timezone, so a midnight-UTC `2026-04-01T00:00:00Z` table is considered to overlap with a `2026-03-31T23:59:59.999Z` predecessor. The 422 fires unnecessarily and operators cannot create back-to-back tables without manually expiring the old one a day earlier than ZIMRA gazette specifies.
- **Fix:** Use `effectiveDate.startOf('day')` and `expiryDate.endOf('day')` for boundary comparisons, or change the overlap predicate to `effectiveDate < newExpiry AND expiryDate > newEffective` (strict inequality on the boundary).

### [B-037][Low][Business Logic] `process.js` `auto-calculate Shortime` uses `emp.baseRate / divisor` ignoring currency conversion for dual-currency employees
- **File:** `backend/routes/payroll/process.js:643-650`
- **Issue:** Shortime auto-fill computes `dayRate = emp.baseRate / divisor` and writes the result to `i.employeeUSD` or `i.employeeZiG` based on `emp.currency`. For a USD-primary employee on a ZiG-currency run, `emp.baseRate` is in USD but the result is written to `i.employeeUSD` despite `run.currency === 'ZiG'`. The downstream `toRunCcy(i.employeeUSD, i.employeeZiG)` converts it back to ZiG via the exchange rate — correct in single-currency runs but redundant work, and brittle. For dual-currency runs the `i.employeeUSD` flows directly into `inputDeductionsUSD` without conversion — but the Shortime amount was computed in USD using days-not-worked, so it ends up correct only by coincidence.
- **Fix:** Compute Shortime in `run.currency` from the start: convert `emp.baseRate` to run currency first (or use `effectiveBaseRate` after the conversion at line 832-835).

### [B-038][Low][Business Logic] `payslipFormatter.js` ZiG basic salary derivation can go negative if ZiG transactions exceed `grossZIG`
- **File:** `backend/utils/payslipFormatter.js:44-45`
- **Issue:** `basicSalaryZIG = Math.max(0, (payslip.grossZIG || 0) - zigEarningsSum)` — the floor at zero hides the case where the engine wrote a `grossZIG` that is less than the sum of ZiG-side earning transactions (a sign of an apportionment bug or a partial-month adjustment). The payslip then shows `0.00 ZiG` basic salary even though earning transactions sum to a positive figure, and the net does not reconcile back to gross on the printed PDF.
- **Fix:** Throw or log when `zigEarningsSum > payslip.grossZIG + epsilon` so the underlying engine bug becomes visible during testing rather than silently reaching production payslips.

### [B-039][Low][Business Logic] `transactionCodes.js` auto-seed updates display fields on every server start — can trample client renames
- **File:** `backend/utils/transactionCodes.js:144-163`
- **Issue:** `update: { name: tc.name, incomeCategory: tc.incomeCategory, defaultValue: tc.defaultValue }` runs on every restart. A client who renames code `'112'` from "Housing Allowance" to their internal name (e.g. "Lodgings Allowance") sees the rename revert to the seed value on the next deploy. The comment claims tax flags are preserved, but `name` and `incomeCategory` overrides are wiped.
- **Fix:** Only apply `update` to records that still have the seed name, or remove `name` from the update fields. Better: stop auto-seeding on every start and run it as an explicit migration step.

### [B-040][Low][Business Logic] `payIncrease.js` does not record `effectiveDate` on the `Employee` row — repeated increases lose the historical timeline
- **File:** `backend/routes/payIncrease.js:46-60`
- **Issue:** Only `Employee.baseRate` is updated; the audit trail records the change but there is no historical `EmployeeRateHistory` (or similar) table. Operators querying "what was this employee's rate on 2025-08-01?" must reconstruct from audit logs — which requires `view_audit_logs` permission and a parser. For back-pay calculations beyond the audit retention window, the original rate is lost forever.
- **Fix:** Add an `EmployeeRateHistory` table (`employeeId, rate, effectiveFrom, effectiveTo, changedBy`) and write a row on every base-rate change. Use it as the authoritative source for `services/backPayService.js` instead of the current `employeeRates` body parameter.

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

### [S-025][High][Security] JWT stored in `sessionStorage` is readable by any JS — XSS = full account takeover
- **File:** `frontend/src/lib/auth.ts:21-23,46-58`, `frontend/src/api/client.ts:18-24`
- **Issue:** The JWT is persisted in `sessionStorage` (`token`) and attached to every request as `Authorization: Bearer …`. Any script that runs in the page (an XSS payload, a compromised npm dependency, a malicious browser extension injecting into the origin) can read `sessionStorage.getItem('token')` and exfiltrate it. `sessionStorage` does not have an `httpOnly`/`secure` flag — it is JavaScript-accessible by design. Combined with the broad permission set (PLATFORM_ADMIN can hit every endpoint, including `/api/backup/restore`, `/api/admin/users`, `/api/license/issue`), one XSS payload yields a complete tenant compromise. The `parseJwt` decoder also performs no signature validation client-side, so a tampered token in `sessionStorage` passes the `getUser()`/`isAuthenticated()` gate until the next backend call rejects it.
- **Fix:** Issue the session JWT as an `httpOnly; secure; sameSite=strict` cookie from `/api/auth/login` and rely on cookie-based auth + a CSRF token (double-submit) for state-changing requests. If short-term mitigation is required, keep the token in an in-memory module variable (cleared on tab close) and make `Authorization` header injection depend on that variable, never on `sessionStorage`. Also harden against XSS with a strict CSP (`default-src 'self'; script-src 'self'`) once the build outputs hashed bundles.

### [S-026][High][Security] Public route guard relies on client-side `parseJwt` of an unvalidated token — bypassable via crafted JWT
- **File:** `frontend/src/lib/auth.ts:12-19,25-36`, `frontend/src/App.tsx:115-120`
- **Issue:** `getUser()` calls `parseJwt(token)` which only `atob()`s the payload — no signature verification, no `aud`/`iss` checks. The `ProtectedRoute` wrapper uses the result of `getUser()` to decide redirects. An attacker who controls only the local browser (e.g., open computer scenario, browser extension) can paste any JSON payload (with `role: "PLATFORM_ADMIN"` and a far-future `exp`) into a fake JWT (`base64url-encoded JSON.fakeSig`) and place it under `sessionStorage.token`. Every protected page including `/admin/users`, `/admin/clients`, `/admin/licenses` will then render its UI shell and start firing API calls. The backend will reject the API calls (good), but: (a) the UI exposes the existence and structure of admin pages, (b) any page that calls a *public-feeling* endpoint or does optimistic UI work before the first 401 will leak data, and (c) the API client only redirects on 401, not on the structural fact that the token is malformed — so the user lingers in admin views collecting raw error messages. This is also the root reason the audit cannot trust the frontend `roles` array as a security boundary.
- **Fix:** Add a sanity test in `getUser()` that `token.split('.').length === 3` and that the signature segment is non-empty; treat tampered tokens like missing tokens. Better: verify the session by calling `GET /api/user/me` once at app boot and gate `ProtectedRoute` on the server's response, not on the local JWT payload. Document explicitly in `lib/auth.ts` that this check is a UX guard, not a security boundary.

### [S-027][High][Security] No protected catch-all — unauthenticated users sent to `/login` only after the role lookup, leaking deep-link page-shell network calls
- **File:** `frontend/src/App.tsx:264-269`
- **Issue:** The catch-all `path="*"` does `role === 'PLATFORM_ADMIN' ? <Navigate to="/admin" />` etc. If no role is present it redirects to `/login`. But the logic only fires for paths that don't match any other `<Route>`. An unauthenticated user who deep-links to `/admin/users` *does* match the protected admin route block; `ProtectedRoute` then evaluates `getUser()` which returns `null`, redirecting to `/login` — fine in the happy path. The problem is the lazy-import side-effect: by the time `ProtectedRoute` decides to navigate away, React has already started fetching the lazy chunk for `AdminUsers` (line 93 `React.lazy(() => import('./pages/admin/Users'))`). Bundle splitting names like `Users-XXXX.js` are visible in the network tab to any reverse-engineer probing the surface area. More importantly, no route is gated by *license/subscription* state — a CLIENT_ADMIN whose license expired keeps the same JWT but has no automatic redirect to `/license-expired`; that page is reached only if the API explicitly redirects.
- **Fix:** (a) Move the `ProtectedRoute` check ahead of `<Suspense>`'s lazy-load chain by checking auth synchronously and rendering `<Navigate />` *before* the lazy element is referenced. (b) Add a `LicenseGuard` wrapper that runs after `ProtectedRoute` and consults `subscription.active` / `license.isActive` from a context populated at app boot, redirecting to `/license-expired` when invalid.

### [S-028][High][Security] `/api/backup/restore` exposed to all CLIENT_ADMINs in the UI — pairs with backend mass-assignment vector (S-002)
- **File:** `frontend/src/pages/utilities/BackupRestore.tsx:53-71`, `frontend/src/api/client.ts:656-659`
- **Issue:** The Backup & Restore utility is mounted at `/utilities/backup` inside the `CLIENT_ADMIN, PLATFORM_ADMIN` route group (`App.tsx:225`). It POSTs the full file content to `/api/backup/restore` with no client-side warning that the backend dedupes by `id` and accepts `companyId` / `clientId` overrides per S-002. Any CLIENT_ADMIN who lands on the page can construct a JSON payload that overwrites their employees with attacker-supplied bank accounts, or relocate records to another tenant. The UI exposes this dangerous control to every tenant administrator and provides no checksum / signed-backup verification. The "WARNING" copy in the dialog is a UX nicety, not a security control.
- **Fix:** Restrict the route to PLATFORM_ADMIN only by moving it into the `roles={['PLATFORM_ADMIN']}` block and updating the sidebar visibility (`AppShell.tsx`). Surface the operation behind a re-authentication step (re-enter password) on the frontend before allowing the file upload. Block CLIENT_ADMIN from this entry point until S-002/S-014 are fixed.

### [S-029][Medium][Security] No frontend permission gating on sensitive admin actions — relies entirely on the backend
- **File:** `frontend/src/pages/admin/Users.tsx:50-59`, `frontend/src/pages/admin/Clients.tsx:46-49`, `frontend/src/pages/Companies.tsx:82-97`, `frontend/src/pages/Employees.tsx:96-109`
- **Issue:** `frontend/src/lib/permissions.ts` exposes `hasPermission()`, but a repo-wide search shows it is **not imported by any page** — only by the role-table label colours in `admin/Users.tsx`. Delete buttons (employees, companies, clients, users), role-change dropdowns (`admin/Users.tsx:133-141`), and "process payroll" actions (`pages/Payroll.tsx:54-66`) render unconditionally for everyone in the protected route group. The role-change `<select>` even lets a CLIENT_ADMIN viewing `/admin/users` (if they get past the route guard via S-026) elevate themselves to PLATFORM_ADMIN, and the only protection is the backend rejecting the call. This widens the blast radius of any backend permission regression: a typo like the `manage_company` vs `manage_companies` discrepancy from S-014 immediately surfaces in the UI rather than being caught client-side. It also gives lower-privilege users a clear roadmap of which actions exist.
- **Fix:** Wire `hasPermission(role, '<perm>')` (or a `usePermissions()` hook) into `EmployeeActions`, the row-action buttons in `admin/Users.tsx` / `Clients.tsx` / `Companies.tsx` / `Loans.tsx`, and the Payroll status-action buttons. Hide actions a user cannot perform; render disabled buttons with a tooltip if visibility is required for discoverability. Pair with backend checks — never replace them.

### [S-030][Medium][Security] API base URL falls back to `http://${window.location.hostname}:5005/api` — mixed-content & enumeration risk
- **File:** `frontend/src/api/client.ts:4-10`
- **Issue:** When `VITE_API_URL` is unset (which logs only an error, does not block boot), the client constructs `http://${window.location.hostname || 'localhost'}:5005/api`. On a production build accidentally deployed without the env var: (a) every request is plain HTTP, triggering mixed-content blocks and silently breaking auth, (b) the resolved hostname is the *frontend's* domain, so requests hit `http://app.example.com:5005/api` — leaking the backend port-naming convention and offering a free network-scan target, and (c) any browser plugin/middleware that strips mixed-content errors will allow the JWT in the `Authorization` header to traverse plaintext. The "console.error" warning at line 5-8 is invisible to ops staff in production.
- **Fix:** In production builds (`import.meta.env.PROD`) and missing `VITE_API_URL`, throw at module load to fail the entire app rather than silently fall back. Default the dev fallback to a stable `http://localhost:5005/api` (without the `window.location.hostname` substitution) so it is never confused for a production hostname.

### [S-031][Medium][Security] `/profile` route is registered three times — the EMPLOYEE block can be matched first regardless of role
- **File:** `frontend/src/App.tsx:232,247,260`
- **Issue:** `<Route path="/profile" element={<ProfileSettings />}>` is declared inside each of the three protected route groups. React Router v6 evaluates routes in the order they appear; the first match wins. The first declaration is inside the CLIENT_ADMIN+PLATFORM_ADMIN group (line 232), then PLATFORM_ADMIN-only (247), then EMPLOYEE-only (260). For an EMPLOYEE user, the first two `ProtectedRoute roles=...` wrappers will short-circuit to `<Navigate to="/dashboard" replace />` (or `/login`), never falling through to the EMPLOYEE-allowed declaration. The visible effect today: an EMPLOYEE who clicks the sidebar's `Link to="/profile"` is bounced to `/dashboard` unless React Router happens to evaluate the EMPLOYEE branch first. More importantly, the duplicated `path="/profile"` makes the role boundary fragile: any reorder will silently expose `ProfileSettings` to other roles or break it for the role it's meant for.
- **Fix:** Declare `/profile` once outside the role-restricted blocks, wrapped in a generic `ProtectedRoute` that allows all three roles. Or pick one block (CLIENT_ADMIN+PLATFORM_ADMIN+EMPLOYEE) and remove the other two duplicates.

### [S-032][Medium][Security] Idle auto-logout fires after 60 seconds with mouse-move reset — false-positive workflow killer or, if widened, a defensive gap
- **File:** `frontend/src/components/AppShell.tsx:20-24`, `frontend/src/hooks/useIdleTimer.ts:8-49`
- **Issue:** `useIdleTimer({ timeout: 60000, warningThreshold: 50000 })` logs the user out after **60 seconds** of no `mousemove`/`mousedown`/`keydown`/`scroll`/`touchstart`. This is so aggressive that operators reading a payslip are interrupted constantly — and the typical fix in production is to relax `timeout` to a much larger value (e.g., 30 min). When raised, the hook's reliance on browser activity events creates a different problem: a focused but inactive tab (background tab in a multi-tenant browser) keeps its JWT alive indefinitely, defeating the auto-logout intent. The warning modal only appears at 50s (10s warning), which is too short to read. Crucially, the auto-logout calls only `lib/auth.logout()` — it does not invoke `POST /api/auth/logout` to revoke the server-side `Session` row, so the token remains valid until expiry even after the UI claims the user is signed out.
- **Fix:** (a) Set a more reasonable timeout (10–15 min). (b) Pair `logout()` with a server call that calls `prisma.session.delete` for the current `sessionId`. (c) Use the Page Visibility API (`document.visibilitychange`) so background tabs are treated as idle even without mouse movement.

### [S-033][Medium][Security] `Login.tsx` sends the user to `/admin` / `/employee` purely on the `role` field of the response — does not verify the role matches the issued JWT
- **File:** `frontend/src/pages/Login.tsx:23-40`
- **Issue:** After a successful login, the page does `const { token, companyId, role } = res.data; saveAuthData(token, companyId)` and then `navigate(...)` based on the **response-body `role`**, not the role inside the JWT it just stored. A backend regression that sends `role: "PLATFORM_ADMIN"` while issuing a JWT with `role: "EMPLOYEE"` would route the employee into the admin shell and let them see admin pages until the first 401 fires. Today the backend computes both from the same `User` row, but coupling the navigation to a value that bypasses the only token the rest of the app trusts is fragile. There is also no `try/catch` around `saveAuthData` — if `sessionStorage` is full (private browsing on iOS Safari, for example), the navigate happens without the token actually being persisted, and the user lands on `/dashboard` perpetually 401-redirected.
- **Fix:** Read `role` from the freshly-stored token via `getUserRole()` after `saveAuthData(token, companyId)` returns. Wrap `saveAuthData` in a try/catch and surface a "Browser storage unavailable — please disable private mode" error to the user.

### [S-034][Medium][Security] Raw backend error messages rendered into the UI via `err.response.data.message`
- **File:** Many — e.g., `frontend/src/pages/Login.tsx:36`, `frontend/src/pages/Register.tsx:38`, `frontend/src/pages/admin/SystemSettings.tsx:22,39`, `frontend/src/pages/utilities/BackupRestore.tsx:40,67`, `frontend/src/pages/Payroll.tsx:64,97,115`, `frontend/src/pages/EmployeeEdit.tsx:218`, `frontend/src/pages/Subscription.tsx:38,49`, `frontend/src/pages/utilities/PeriodEnd.tsx:60`, `frontend/src/pages/Reports.tsx:67-74` (also reads error blob)
- **Issue:** ~50 catch blocks pull `err.response?.data?.message` and render it directly in `<div>{error}</div>` without sanitisation or shape-checking. If a backend handler ever returns an unsanitised database error (`Foreign key constraint failed on field: 'companyId'`), an internal stack trace, or an SDK error string containing internal hostnames, that text reaches the UI verbatim. The `Reports.tsx` blob-decode path (line 62-75) goes further: it `JSON.parse`s an arbitrary blob body and renders `json.message`, which is fine when the backend obeys its own contract but exposes whatever the underlying axios/Prisma error stringifies to when something throws unexpectedly. There is no global error-message normaliser; every page repeats the same fallback string.
- **Fix:** Add a single helper (e.g., `extractErrorMessage(err: unknown): string`) that returns the message **only if** it matches a known shape (`{ message: string }` with length < 200 chars) and otherwise returns a generic `"Something went wrong"`. Replace the inline `err.response?.data?.message || 'Failed…'` pattern with the helper. Audit backend handlers (separate task) to ensure no Prisma/SQL strings leak into `res.json({ message: err.message })`.

### [S-035][Medium][Security] `License.tsx` uses `window.confirm()` for license revoke — no second-factor or audit-confirmation
- **File:** `frontend/src/pages/License.tsx:20-25`
- **Issue:** `if (!confirm('Revoke this license?'))` is the *only* gate before `LicenseAPI.revoke(clientId)` runs. `window.confirm` is dismissable with a single keystroke and is a known anti-pattern for destructive operations. Revoking a license is highly destructive — it locks the entire client out of the platform until a PLATFORM_ADMIN reactivates it. There is no typed-confirmation ("type the client name to revoke"), no recent-password re-auth, and no client-side throttling on the action.
- **Fix:** Replace `confirm()` with the project's `ConfirmModal` (used elsewhere) plus a typed-name confirmation field. Add a re-auth step (`UserAPI.changePassword`'s `currentPassword` flow can be reused) before the revoke is sent. Also fix the same pattern in any `window.confirm` callers (`grep -rn 'confirm(' frontend/src/pages/`).

### [S-036][Low][Security] Sidebar collapse state in `localStorage` — minor information leak across users on shared machines
- **File:** `frontend/src/components/AppShell.tsx:31-39,47,211`
- **Issue:** `localStorage.getItem('sidebarCollapsed')` and `sessionStorage.getItem('activeCompanyId')` survive logout. After `logout()` (which only clears `sessionStorage` keys), the next user who logs in on the same machine sees the previous user's UI preference and, more sensitively, the previous user's last-active company name briefly flicker in the sidebar before `loadCompanies` re-resolves it. It is not auth-relevant data, but it discloses tenancy associations to a co-located user.
- **Fix:** Clear `localStorage.removeItem('sidebarCollapsed')` (and any other UI-pref keys) inside `lib/auth.logout()`. Confirm `sessionStorage` is cleared in full (`sessionStorage.clear()`) at logout if no other state lives there.

### [S-037][Low][Security] `IntelligenceAPI.getCashflow(companyId)` is called from `Reports.tsx` regardless of role — pairs with backend S-016
- **File:** `frontend/src/pages/Reports.tsx:41-46`, `frontend/src/api/client.ts:588-593`
- **Issue:** `Reports.tsx` is reachable by every CLIENT_ADMIN and the `useEffect` unconditionally fires `IntelligenceAPI.getCashflow(companyId)` and renders the result in the indigo "AI Cashflow Forecast" card. The backend `intelligence.js` route currently has no `requirePermission('view_reports')` (see backend S-016), and the frontend likewise does no permission check. If the backend gate is added without dropping the unconditional call, the card will render an error toast for users without permission. Worse: today, EMPLOYEE-role users (or any future custom role with limited reports access) loaded into `Reports.tsx` would have the cashflow forecast revealed to them. Today they cannot reach `/reports` because of the role guard, but this is implicit and one route-table edit away from regressing.
- **Fix:** Hide the cashflow card behind `hasPermission(role, 'view_reports')` (or a dedicated `view_intelligence` permission once added). Skip the API call entirely when the user lacks permission rather than firing it and ignoring the rejection.

### [S-038][Low][Security] `Login.tsx` calls `SetupAPI.check()` unauthenticated and renders "Platform Setup" hint — discloses platform initialisation state to any visitor
- **File:** `frontend/src/pages/Login.tsx:15-21,120-124`
- **Issue:** Anyone visiting `/login` (or scraping the page) can read whether `initialized === false` and infer that the platform setup endpoint is open. This is a low-impact disclosure on its own, but combined with the `/api/setup` rate-limiter window of 10 / hour (March V-047) it gives an attacker a precise signal about whether `POST /api/setup` is still reachable. A new install left in this state for any meaningful window invites tenant-zero takeover.
- **Fix:** Move the "first-time setup" hint behind a deliberate UI affordance (e.g., a tiny anchor in the footer that fetches the status only when clicked). Better, drop the hint after a successful initial setup is detected and have the install script remove the `/setup` route entirely once `User` count > 0.

### [S-039][Low][Security] Multiple page-level `console.error(...)` calls leak filter names and resource labels in browser console
- **File:** `frontend/src/pages/Companies.tsx:29`, `frontend/src/pages/Employees.tsx:53,77`, `frontend/src/pages/admin/AdminDashboard.tsx:15`, plus orphaned files `pages/PayrollLogs.tsx`, `pages/PayrollUsers.tsx`, `pages/PayslipExports.tsx`, `pages/PayslipSummaries.tsx`, `pages/PayslipTransactions.tsx`, `pages/TaxConfiguration.tsx`, `pages/CurrencyRates.tsx`, `pages/NSSAContributions.tsx`, `pages/SystemSettings.tsx` (top-level — see note below)
- **Issue:** Catch handlers call `console.error('Failed to fetch …', error)` and dump the raw axios error object to the browser console. Anyone with the devtools open sees the request URL, response body, and on 4xx errors the full server message — including any stack hints leaked through the error helper noted in S-034. Several of these files (`pages/PayrollLogs.tsx`, `pages/PayslipExports.tsx`, `pages/PayslipSummaries.tsx`, `pages/PayslipTransactions.tsx`, `pages/TaxConfiguration.tsx`, `pages/PayrollCore.tsx`, `pages/PayrollUsers.tsx`, top-level `pages/SystemSettings.tsx`) appear to be **orphaned**: they are not registered in `App.tsx` and the user-visible navigation never reaches them, but they remain importable through manual URL entry and they ship in the bundle if any other module imports them.
- **Fix:** Strip `console.error` from production via Vite's `define`/Terser drop-console, or replace each with the `useToast` pattern that other pages use. Audit the orphaned pages: either delete them or add their routes to `App.tsx`. Confirm `vite build` tree-shakes them out today (`grep -rn 'PayrollLogs\\|PayslipExports' frontend/src/` shows the file is referenced only by itself).

### [S-040][Low][Security] `frontend/.env.example` may ship secrets — verify no `VITE_*` secret pattern exists
- **File:** `frontend/.env.example` (newly added per repo status), `frontend/src/api/client.ts:10`
- **Issue:** Vite injects every `VITE_*` env var into the client bundle at build time. Any secret accidentally added to `.env.example` (or to the production `.env`) under the `VITE_` prefix is shipped to users. The example file is currently uncommitted (per `git status`) and was added in this branch; if it includes a Stripe key, an SMS API key, or any other token under a `VITE_` name, it will be exfiltrated by every production user. The risk is low because the current `.env.example` likely contains only `VITE_API_URL`, but the convention should be enforced now while the file is a fresh addition.
- **Fix:** Document in `frontend/.env.example` that any `VITE_*` variable is publicly visible. Add a CI check (`grep -E '^VITE_(STRIPE|TWILIO|SMS|API_KEY|SECRET)'  frontend/.env*`) that fails the build if a likely-secret pattern appears. Confirm only `VITE_API_URL` (and similar non-sensitive endpoint URLs) are ever defined under that prefix.

---

## Task 4a Findings — Frontend Payroll/Payslip Pages

### [B-041][High][Business Logic] Exchange rate validated as `> 1` but ZiG/USD rate could legitimately be below 2 or have changed — threshold is business-logic assumption baked into UI
- **File:** `frontend/src/pages/Payroll.tsx:104`, `frontend/src/pages/PayrollNew.tsx:39`
- **Issue:** Both the inline rate editor (`handleSaveRate`) and the new-run form (`handleSubmit`) reject any exchange rate `<= 1` with "Exchange rate must be greater than 1". This prevents the entry of any ZiG/USD rate that is ≤ 1 — which is not impossible given Zimbabwe's currency history. More critically, there is no staleness warning: if the stored rate is weeks old and the RBZ has moved significantly, users can process payroll at a badly outdated rate with no alert. The `latestRate` banner in PayrollNew is informational only and disappears once the user types their own value.
- **Fix:** Lower the rejection threshold to `> 0` (any positive rate is arithmetically valid). Add a staleness check: if the rate stored on a run differs from `latestRate.rate` by more than e.g. 5%, surface a dismissible warning before allowing the run to proceed. Persist the rate-fetch timestamp and warn if it is older than 24 hours.

### [B-042][High][Business Logic] `totalDeductions` in `Payslips.tsx` computed as `gross − netPay` on the frontend, diverging from the backend's summed statutory fields
- **File:** `frontend/src/pages/Payslips.tsx:303`
- **Issue:** Line 303 calculates `const totalDeductions = p.gross - p.netPay`. This is a derived approximation that ignores the backend's individual deduction fields (`paye`, `nssaEmployee`, `aidsLevy`, `loanDeductions`, etc.). If the backend stores rounding differences or uses different currency sources for `gross` vs `netPay` (especially in dual-currency runs), the displayed "Total Deductions" column will not match the sum-of-parts and will differ from what appears on the printed payslip PDF. Employees or auditors comparing the screen to the PDF will see conflicting figures.
- **Fix:** Replace the derived `gross - netPay` with an explicit sum: `(p.paye ?? 0) + (p.nssaEmployee ?? 0) + (p.aidsLevy ?? 0) + (p.loanDeductions ?? 0)` — the same approach used correctly in `PayrollSummary.tsx:374`.

### [B-043][High][Business Logic] No date-range validation: `endDate` can be before `startDate` in `PayrollNew.tsx`
- **File:** `frontend/src/pages/PayrollNew.tsx:96–117`
- **Issue:** The period start and end date inputs are both `type="date"` with `required` but no cross-field validation. A user can set `startDate = 2025-03-31` and `endDate = 2025-03-01` and submit successfully. The API may silently accept it and create a zero-employee-day run or one with inverted tax periods, producing incorrect PAYE calculations for that period. There is also no guard against future dates or absurdly distant dates (e.g. year 2099).
- **Fix:** In `handleSubmit`, add: `if (form.endDate <= form.startDate) return setError('Period end must be after period start')`. Optionally set `min={form.startDate}` on the end-date input. Add a sanity cap: warn if the period spans more than 31 days.

### [B-044][High][Business Logic] Payroll "Process" action available on `DRAFT` runs bypassing the submit→approve workflow
- **File:** `frontend/src/pages/Payroll.tsx:263–271`
- **Issue:** The action buttons render "Process" for `run.status === 'DRAFT' || run.status === 'APPROVED' || run.status === 'ERROR'`. This means a `DRAFT` run can be processed directly without ever being submitted for approval or approved — completely bypassing the two-step submit→approve gate. On a system with separation-of-duties requirements (required for ZIMRA compliance), this allows a payroll preparer to both prepare and execute a payroll run unilaterally.
- **Fix:** Remove `'DRAFT'` from the condition that shows the "Process" button. Process should only be available for `APPROVED` (and `ERROR` for reruns). The submit→approve flow enforces segregation. If single-user environments need a shortcut, make it a company-level setting, not unconditional.

### [B-045][Medium][Business Logic] Dual-currency PAYE and NSSA summary cards always show USD totals even for ZiG components — ZiG PAYE not surfaced
- **File:** `frontend/src/pages/PayrollSummary.tsx:320–321`
- **Issue:** The "Total PAYE" and "Total NSSA" summary cards render `isDual ? '$' : ccy + ' '` — meaning for a dual-currency run, PAYE is always shown as a USD dollar amount. But in a dual run the backend calculates PAYE independently in both USD and ZiG. The ZiG PAYE component is silently dropped from the dashboard card. A finance user reviewing the summary would see an understated PAYE liability (USD-only), which could cause incorrect ZIMRA P2 remittance preparation.
- **Fix:** For dual-currency runs, split the PAYE and NSSA cards into two rows (USD and ZiG), summing `payslips.reduce((s, p) => s + (p.payeUSD ?? p.paye ?? 0), 0)` and `payslips.reduce((s, p) => s + (p.payeZIG ?? 0), 0)` separately, with appropriate currency labels.

### [B-046][Medium][Business Logic] `PayrollInputs.tsx` amount column always prefixes `$` regardless of selected currency
- **File:** `frontend/src/pages/PayrollInputs.tsx:432`
- **Issue:** The read-only table cell at line 432 renders `${Number(inp.amount).toLocaleString(...)}` (hardcoded `$` USD symbol) for every row, regardless of `inp.currency`. A ZiG-denominated input would show `$500.00` instead of `Z 500.00`, misleading users who manage mixed-currency inputs about which currency each entry is in.
- **Fix:** Replace the hardcoded `$` with `inp.currency === 'ZiG' ? 'Z ' : '$ '` (matching the prefix pattern used in the edit form at lines 231–234).

### [B-047][Medium][Business Logic] `PayrollInputGrid.tsx` client-side PAYE estimate uses a hardcoded ZiG NSSA ceiling of `20000` ignoring the NSSASettings API value
- **File:** `frontend/src/pages/PayrollInputGrid.tsx:158`
- **Issue:** When building `resolvedTaxConfig` for the client-side PAYE estimator, the ZiG NSSA ceiling is set to the literal `20000` rather than reading `nssa.ceilingZIG` from the API response: `nssaCeiling: currency === 'ZiG' ? 20000 : (nssa?.ceilingUSD ?? 700)`. If the RBZ/NSSA changes the ZiG ceiling (which is expected as ZiG stabilises), the frontend grid will keep estimating NSSA against the old hardcoded figure even after the admin updates the NSSA Settings, producing misleading preview figures that diverge from actual payroll calculations.
- **Fix:** Replace `20000` with `nssa?.ceilingZIG ?? 20000` so the setting is driven from the database value fetched at line 124.

### [B-048][Medium][Business Logic] `PayrollInputGrid.tsx` "unusual value" warning threshold of `50000` is currency-agnostic — fires too early for ZiG, too late for USD
- **File:** `frontend/src/pages/PayrollInputGrid.tsx:236`
- **Issue:** `if (!isNaN(num) && num > 50000)` triggers the amber "Unusually high amount" warning at the same absolute threshold regardless of whether the cell is in USD or ZiG. USD 50,000 is a plausible senior executive monthly salary; ZiG 50,000 at a mid-2025 rate of ~27 ZiG/USD is only ~USD 1,850 — well within normal range for many employees. The warning will fire constantly on ordinary ZiG salaries, causing alert fatigue and causing users to ignore it.
- **Fix:** Apply a currency-aware threshold: e.g. `(currency === 'ZiG' ? 2_000_000 : 50_000)`. The exact value should be configurable or derived from the NSSA ceiling as a multiple.

### [B-049][Medium][Business Logic] `Payslips.tsx` "Send All Payslips" two-step confirm only shows employee count — does not warn if run is not yet in COMPLETED status
- **File:** `frontend/src/pages/Payslips.tsx:186–193`
- **Issue:** The "Send All Payslips" confirm prompt reads "Send to N employees?" and has Confirm/Cancel. However, the page is accessible for any run status (DRAFT, PROCESSING, ERROR, etc.) because the route `/payroll/:runId/payslips` is not gated on `run.status === 'COMPLETED'`. A user could trigger `sendAllPayslips` on a DRAFT run that has no payslips or has stale/zero figures. Employees would receive payslips showing $0.00 or preliminary numbers.
- **Fix:** Disable or hide the "Send All Payslips" button unless `run?.status === 'COMPLETED'`. Add to the confirm message: "This will permanently send final payslips — ensure the run is complete before proceeding."

### [B-050][Medium][Business Logic] `PayrollSummary.tsx` "Rerun Payroll" fires immediately without confirmation on a completed, potentially already-disbursed payroll
- **File:** `frontend/src/pages/PayrollSummary.tsx:207–232`
- **Issue:** The "Rerun Payroll" button calls `PayrollAPI.process(runId!)` in an inline `onClick` handler with no confirmation dialog. Rerunning recalculates all payslips, potentially changing PAYE, net pay, and statutory amounts on a run that may have already been disbursed to employees' bank accounts. There is a guard for `!run.payrollCalendar?.isClosed` but no explicit warning to the user that payroll has already been paid and rerunning will produce conflicting records.
- **Fix:** Wrap the rerun trigger in a `ConfirmModal` (the component is imported elsewhere in the project) with a clear warning: "This run may have already been disbursed. Rerunning will recalculate all payslips — do not rerun after bank files have been submitted." Require the user to explicitly confirm.

### [B-051][Low][Business Logic] `PayrollCore.tsx` Edit and Delete action buttons are rendered but have no `onClick` handlers — silent dead UI
- **File:** `frontend/src/pages/PayrollCore.tsx:136–141`
- **Issue:** The Edit (`<Edit />`) and Delete (`<Trash />`) buttons in the PayrollCore table have no `onClick` props. Clicking them does nothing, but they appear fully interactive (hover styles active). For a foundational payroll record page managing multi-currency salary splits, silently non-functional edit/delete buttons could cause users to believe changes were saved when they were not, or to assume records cannot be modified and work around them incorrectly.
- **Fix:** Either implement the handlers or replace the buttons with a disabled state and tooltip explaining the feature is coming. Do not ship visually-active controls that perform no action.

### [B-052][Low][Business Logic] `PayslipTransactions.tsx` allows deleting transaction ledger entries without any guard on whether the parent payslip is finalised
- **File:** `frontend/src/pages/PayslipTransactions.tsx:28–39`
- **Issue:** `confirmDelete` calls `PayslipTransactionAPI.delete(deleteTarget)` after a single `ConfirmModal` dialog. There is no check on whether the transaction belongs to a finalized payslip summary (`isFinalized === true`). Deleting a ledger entry from a finalised payslip breaks the audit trail and the point-in-time exchange-rate integrity that the page banner explicitly describes as a compliance requirement.
- **Fix:** Before calling delete, fetch or check the parent payslip's `isFinalized` flag. If true, replace the delete button with a locked icon and display "Cannot delete — payslip is finalised." Mirror the same guard on the backend (`PayslipTransactionAPI.delete` route).

### [B-053][Low][Business Logic] `PayslipSummaries.tsx` fetch errors are silently swallowed — users see an empty table with no error message
- **File:** `frontend/src/pages/PayslipSummaries.tsx:13–19`
- **Issue:** The `fetchSummaries` catch block calls `console.error('Failed to fetch payslip summaries')` and does nothing visible to the user. If the API call fails (network error, 401, 500), the table simply shows the "No payroll summaries found" empty state, which is indistinguishable from a genuine empty dataset. Finance users may conclude no records exist and take incorrect action (e.g., re-processing payroll that already ran).
- **Fix:** Add a `fetchError` state (matching the pattern in `PayrollCore.tsx` and `PayslipExports.tsx`) and render an error banner when the fetch fails. Replace `console.error` with the `useToast` pattern used on other pages.

---

## Task 4b Findings — Leave / Loan / Utilities / Tax pages

### [B-054][High][Business Logic] `LeaveNew.tsx` days calculation counts calendar days — weekends and public holidays inflate the leave deduction
- **File:** `frontend/src/pages/LeaveNew.tsx:23–25`
- **Issue:** `days` is calculated as `Math.ceil((endDate - startDate) / 86400000) + 1`, which is a straight calendar-day count inclusive of weekends and public holidays. A request from Monday to Friday shows 5 days, but Monday to the following Sunday shows 7 days. Leave policies in Zimbabwe (and most HR systems) are measured in working days. The same raw formula is duplicated in `LeaveEdit.tsx:43–45`. The `totalDays` value sent to the backend drives leave balance deductions and payable days for encashment — inflating it by counting weekends means employees' balances are incorrectly reduced and encashment pay is overstated.
- **Fix:** Replace the calendar-day formula with a working-day counter that iterates the date range and excludes weekends (Saturday/Sunday) and any public holiday list from the server. Alternatively, delegate the `totalDays` calculation entirely to the backend where a public-holiday calendar can be applied consistently.

### [B-055][High][Business Logic] `LeaveNew.tsx` / `LeaveEdit.tsx` — no balance check before submission; leave can be recorded beyond available balance
- **File:** `frontend/src/pages/LeaveNew.tsx:27–39`, `frontend/src/pages/LeaveEdit.tsx:47–58`
- **Issue:** Neither form fetches the employee's current leave balance for the selected `type` before submitting. There is no client-side guard preventing a user from recording 30 days of annual leave for an employee whose balance is 5 days. The blue "N days" info box provides a day count preview but shows no available-balance comparison and does not block submission. Users will create over-drawn leave records unless the backend also enforces a ceiling (not confirmed here), and even then the first feedback comes as a generic API error after submit — a poor UX that may mislead staff.
- **Fix:** When `employeeId` and `type` are both selected, fetch `LeaveBalanceAPI.getForEmployee(employeeId)` and compare `days` against `selectedBalance.balance`. Show an inline warning if `days > balance` and disable or warn on the submit button. This pattern is already implemented in `LeaveEncashments.tsx:61–68`.

### [B-056][High][Business Logic] `LeaveEncashments.tsx` estimated amount preview is always `USD 0.00` — broken formula produces no useful information
- **File:** `frontend/src/pages/LeaveEncashments.tsx:232–235`
- **Issue:** The estimated encashment amount is computed as `parseFloat(form.days) * (selectedBalance?.leavePolicy ? 1 : 0)`. Because `selectedBalance.leavePolicy` is a policy object (always truthy when present), this resolves to `days * 1` — meaning the "estimate" is just the raw day count in USD, not an amount derived from daily rate. Furthermore, when no policy is embedded, it returns `0`. Neither result is the correct `ratePerDay × days` figure. The displayed `Est. amount: USD 0.00` (or a misleading USD day-count integer) gives users no guidance on how much the encashment will pay out.
- **Fix:** Fetch the employee's `baseRate` (or derive `ratePerDay = baseRate / 22`) alongside the balance fetch, then compute `parseFloat(form.days) * ratePerDay`. Display the currency correctly (the employee's primary currency, not hardcoded USD).

### [B-057][High][Business Logic] `BackPay.tsx` effective date accepts future dates — back pay can be committed for periods that have not yet occurred
- **File:** `frontend/src/pages/utilities/BackPay.tsx:172–177`
- **Issue:** The `effectiveDate` input has no `max` constraint and `goStep1to2` only checks `if (!effectiveDate)`. A user can enter a future date (e.g., 2027-01-01), proceed through the wizard, and generate back-pay payroll inputs for runs that do not yet exist. The backend will find zero completed runs for a future date and return an empty preview — but the commit step can still be reached, producing payroll inputs with a future effective date that will interfere with normal pay cycles.
- **Fix:** Add `max={new Date().toISOString().slice(0, 10)}` to the date input and add a validation check in `goStep1to2`: `if (effectiveDate > today) return setError('Effective date must be in the past')`.

### [B-058][Medium][Business Logic] `LoanDetail.tsx` "Outstanding" balance is calculated as `principal − sum(paid repayments)` — ignores interest; understates true balance
- **File:** `frontend/src/pages/LoanDetail.tsx:42–43`
- **Issue:** `outstanding = loan.amount - paid` where `paid = repayments.filter(r => r.status === 'PAID').reduce((s, r) => s + r.amount, 0)`. `loan.amount` is the principal only. Each repayment `amount` from the backend is the full amortised instalment (principal + interest). As the employee pays instalments, `outstanding` will cross into negative territory once total payments exceed the principal, even though the loan is not yet fully paid (interest has consumed some payments). The Summary card will show a red negative "Outstanding" balance, which is alarming and incorrect.
- **Fix:** Outstanding balance should be `loan.outstandingBalance` from the server if it is maintained, or `(loan.monthlyInstalment * loan.termMonths) - paid` (total repayable minus paid). Alternatively derive it as `loan.totalRepayable - paid` where `totalRepayable` is stored on the loan record. Remove the client-side `loan.amount - paid` calculation.

### [B-059][Medium][Business Logic] `LoanDetail.tsx` "Mark Paid" fires without confirmation — a misclick permanently marks a future instalment as paid
- **File:** `frontend/src/pages/LoanDetail.tsx:24–31`
- **Issue:** `handleMarkPaid` calls `LoanAPI.markRepaymentPaid(repaymentId)` directly on button click with no confirmation modal. There is no undo. For an upcoming instalment that is not yet due, a misclick produces a premature PAID record that distorts the outstanding balance, affects loan-status transitions (ACTIVE → PAID_OFF), and creates a false audit trail.
- **Fix:** Wrap the call in a `ConfirmModal` similar to the pattern used elsewhere: "Mark instalment #N (due DATE, amount X) as paid? This cannot be undone."

### [B-060][Medium][Business Logic] `PayIncrease.tsx` effective date accepts future dates and past dates without any validation — a future date silently applies an increase that has not yet taken effect
- **File:** `frontend/src/pages/utilities/PayIncrease.tsx:26–45`
- **Issue:** The bulk pay increase form sends whatever date is entered directly to the API. There is no client-side guard against future dates (scheduling a salary change that should not yet be applied to running payroll) or unreasonably old past dates (e.g., 2010-01-01, which could trigger erroneous back-pay calculations in downstream reporting). The validation at line 28 only checks `!form.effectiveDate`. A future date will update every employee's `baseRate` immediately but with an effective date that makes it appear the salary change was planned for the future — creating confusion when payroll runs use current base rates.
- **Fix:** Add a warning (not a hard block) when `effectiveDate > today`: "Effective date is in the future — the new rate will be applied immediately but recorded as future-dated." Add a hard block if `effectiveDate` is more than 5 years in the past.

### [B-061][Medium][Business Logic] `PayIncrease.tsx` no confirmation step before an irreversible bulk base-rate mutation affecting all active employees
- **File:** `frontend/src/pages/utilities/PayIncrease.tsx:26–45`
- **Issue:** Submitting the form immediately calls `UtilitiesAPI.payIncrease(payload)` with no confirmation dialog. A 10% percentage increase applied to all active employees with no department/type filter is irreversible at the database level (the previous `baseRate` values are overwritten). The form has no preview step and no undo mechanism. A typo in the percentage field (e.g., `100` instead of `10`) would double every employee's salary instantly.
- **Fix:** Add a preview step or a `ConfirmModal` that displays: "Apply a {X}% increase to {N} employees effective {date}? This will overwrite current base rates and cannot be automatically reversed." Require typing "CONFIRM" or similar for operations affecting more than a configurable threshold of employees.

### [B-062][Medium][Business Logic] `NSSASettings.tsx` accepts a rate of `0` — silently disables NSSA deductions with no warning
- **File:** `frontend/src/pages/utilities/NSSASettings.tsx:95–101`
- **Issue:** The employee rate, employer rate, and WCIF rate inputs all have `min="0"`, allowing the rates to be set to zero. The `handleChange` fallback `parseFloat(value) || 0` actively maps empty/invalid input to `0`. If an administrator accidentally clears a rate field and saves, NSSA contributions are set to zero for all future payroll runs. There is no warning that a zero rate disables a statutory deduction, nor any minimum validation. Zimbabwe law mandates NSSA contributions — a zero rate would make every payslip non-compliant.
- **Fix:** Change `min` to `"0.01"` (or add a custom validator). Show a prominent warning banner when any rate is set to `0`: "A zero rate will disable this statutory deduction — ensure this is intentional."

### [B-063][Medium][Business Logic] `CurrencyRates.tsx` rate input accepts `0` and negative values via `min="0"` HTML attribute only — no JS guard; a zero rate would divide-by-zero in ZiG payroll
- **File:** `frontend/src/pages/CurrencyRates.tsx:233–242`
- **Issue:** The rate input uses `min="0"` (HTML5 attribute). HTML `min` is bypassed when the form is submitted programmatically or the browser's built-in validation is suppressed. The `handleCreate` validation at line 36 only checks `!form.rate` — it does not check `parseFloat(form.rate) > 0`. A rate of `0` would pass the guard and be saved. The backend ZiG payroll engine divides by the exchange rate to convert between currencies; a stored rate of 0 would cause a division-by-zero or produce `Infinity` values silently in every ZiG payroll calculation until corrected.
- **Fix:** Add `if (parseFloat(form.rate) <= 0) { setFormError('Rate must be greater than zero.'); return; }` in `handleCreate` before the API call. Change `min="0"` to `min="0.0001"`.

### [B-064][Medium][Business Logic] `CurrencyRates.tsx` no staleness warning — latest rate shown with no indicator of how old it is; stale rates silently corrupt ZiG payroll
- **File:** `frontend/src/pages/CurrencyRates.tsx:119–123`
- **Issue:** The "Current ZiG Rate" card shows only the rate value. There is no timestamp or age indicator next to the current rate. The `latestZig` object has an `effectiveDate` field but it is not displayed in the hero card. The ZiG/USD rate is highly volatile (RBZ adjusts it frequently); if a rate entered weeks ago is still the "latest", every ZiG payroll calculation uses an outdated rate. Without a staleness warning, administrators have no prompt to update the rate before running payroll.
- **Fix:** Display the `effectiveDate` of `latestZig` in the hero card. Add an amber warning banner when `today - latestZig.effectiveDate > 7 days`: "Exchange rate is N days old — verify against the current RBZ rate before running payroll."

### [B-065][Low][Business Logic] `LeaveBalances.tsx` balance adjustment field accepts any number with no lower bound — negative adjustment can drive balance below zero without warning
- **File:** `frontend/src/pages/LeaveBalances.tsx:184–208`
- **Issue:** The inline adjustment input (`type="number" step="0.5"`) has no `min` or `max` attribute, and `handleAdjust` calls `parseFloat(adjValue)` with no range check. A user can type `-999` to set an employee's balance deeply negative. There is no warning shown before confirming the adjustment, and no confirmation modal guards the "OK" button. A mistyped adjustment (e.g., `–30` instead of `–3`) silently creates a large negative leave balance that will propagate into any encashment value calculations.
- **Fix:** Add a `ConfirmModal` before calling `LeaveBalanceAPI.adjust`. Validate that `currentBalance + adjustment >= 0` and show a warning if the result would go negative: "This adjustment would result in a negative balance of X days — confirm to proceed."

### [B-066][Low][Business Logic] `frontend/src/lib/tax.ts` hardcodes NSSA employee rate at `4.5%` but NSSA settings page and info banner quote `3.5%` — mismatch produces incorrect client-side PAYE estimates
- **File:** `frontend/src/lib/tax.ts:8`
- **Issue:** `STATUTORY_RATES.NSSA_EMPLOYEE = 0.045` (4.5%). The `NSSASettings.tsx` page defaults `employeeRate: 3.5` and the information banner explicitly states "Standard rates: **3.5% employee**". The backend `taxEngine.js` uses the rate stored in the database (configured via the NSSA Settings API). The client-side `calculatePAYE` in `tax.ts` uses the hardcoded `0.045`. This discrepancy means every client-side PAYE estimate (used in `BenefitCalculator`, `PayrollInputGrid`, and `BackPay` preview) over-deducts NSSA by 1 percentage point and therefore understates taxable income, producing a PAYE estimate that is lower than what the backend engine will actually compute. For an employee earning USD 700 (the ceiling), the NSSA over-deduction is USD 7/month — 1pp × ceiling.
- **Fix:** Either (a) remove the hardcoded constant and fetch the NSSA rate from the `NSSASettingsAPI` at the call site, passing it as a parameter to `calculatePAYE`; or (b) align the hardcoded constant with the legally correct 3.5% rate and add a comment referencing the NSSA Settings page. Option (a) is preferred for correctness.

### [B-067][Low][Business Logic] `BenefitCalculator.tsx` housing benefit uses `baseSalary × 7%` of gross salary — ZIMRA rule applies to gross including benefits, not base salary alone
- **File:** `frontend/src/components/tax/BenefitCalculator.tsx:25–27`
- **Issue:** `calculateHousing()` for employer-owned housing returns `baseSalary * 0.07`. The ZIMRA rule (IT exemption schedule) applies 7% to *total gross earnings* (basic + allowances + other taxable items), not just the base/basic salary. For an employee with a base salary of USD 1,000 and USD 400 in allowances, the correct taxable benefit is `1,400 × 7% = USD 98`, but the calculator returns `1,000 × 7% = USD 70`. The under-stated benefit means the payroll input produced by "Apply" is too low, understating taxable income by USD 28/month in this example.
- **Fix:** The `BenefitCalculatorProps` interface should accept a `grossSalary` prop in addition to (or instead of) `baseSalary`, and `calculateHousing` should multiply `grossSalary * 0.07`. Update all call sites to pass total gross.

### [B-068][Low][Business Logic] `LeavePolicy.tsx` delete silently fails without showing an error toast when delete API call fails
- **File:** `frontend/src/pages/LeavePolicy.tsx:88–98`
- **Issue:** `confirmDelete` catches API errors and calls `setError(...)`, which renders an inline error banner above the form. However, after a delete failure the `ConfirmModal` has already been dismissed (`setDeleteTarget(null)` in `finally`). The error state is rendered in the form area which may not be visible if the user has scrolled down to the policy table. There is also no `showToast` call, so the failure notification is easily missed. If the backend rejects the delete (e.g., the policy is still referenced by active balances), the user sees no clear feedback.
- **Fix:** Replace the `setError` in the catch block of `confirmDelete` with `showToast(message, 'error')` (importing `useToast`), consistent with the pattern used in `Leave.tsx:69` and other pages. The inline error can remain as a secondary indicator.

---

## Task 5a Findings — Backend lib / utils / worker Code Quality Sweep

### March 2026 Code Quality Fix Verification

| ID | Finding (short title) | Status | Notes |
|---|---|---|---|
| V-061 | `jobProcessor.js` — async fns missing try/catch (March Code Quality [FIXED]) | ✅ Confirmed | `lib/jobProcessor.js:11-23` wraps `processJob` in try/catch; `processEmailPayslip` propagates to the outer catch. Worker's `processOneJob` has its own try/catch at `worker.js:47-99` that logs, retries, and marks jobs FAILED. |
| V-062 | `hikvisionClient.js` — `getDeviceInfo`/`fetchAttendanceEvents` missing try/catch (March Code Quality [Low] — not marked FIXED) | ✅ Confirmed present | Both functions now wrap `digestGet` in try/catch and rethrow with contextual device IP + path. The Low finding was not marked [FIXED] in March; code confirms it was addressed. |
| V-063 | `attendanceEngine.js` — `matchEmployeeByPin` missing try/catch (March Code Quality [FIXED]) | ✅ Confirmed | `lib/attendanceEngine.js:255-264` wraps both `findFirst` calls in try/catch; returns `null` on error and logs with pin+companyId context. |

---

### New Findings

### [C-001][High][Code Quality] `services/attendanceService.js` — no top-level try/catch; all Prisma calls unguarded
- **File:** `backend/services/attendanceService.js:16`
- **Issue:** `processAttendanceLogs` is an async function with no surrounding try/catch. It issues at least five Prisma calls (`findMany`, `findMany`, `upsert` in a loop, `updateMany`) plus the CPU-intensive grouping loop. Any Prisma connectivity failure, schema mismatch, or unique-constraint violation inside the `upsert` at line 74 will throw an unhandled rejection. The caller in `routes/attendance.js` has its own try/catch, but callers added in the future (cron jobs, worker tasks) may not. The service should be self-protecting at the library level, following the same pattern established for `matchEmployeeByPin`.
- **Fix:** Wrap the entire function body in `try { ... } catch (err) { console.error('[attendanceService] processAttendanceLogs failed:', err); throw err; }` so errors are logged with context and re-thrown for the caller to handle. Add per-employee fault isolation: catch errors from the per-row `upsert` inside the loop and continue processing other employees rather than aborting the entire batch.

### [C-002][High][Code Quality] `lib/systemSettings.js` — `_loadAll` async with no try/catch; Prisma error crashes every settings-dependent payroll route
- **File:** `backend/lib/systemSettings.js:9`
- **Issue:** `_loadAll` calls `prisma.systemSetting.findMany(...)` with no error handling. Every exported function (`getSetting`, `getSettings`, `getSettingAsNumber`, `getSettingAsBoolean`, `getSettingAsString`) `await _loadAll()` and has no try/catch of its own. A transient DB connection failure propagates raw to every payroll route that calls `getSettings(...)` at the start of preview/process — crashing the route handler with an unhandled Prisma error instead of returning a 500. The in-memory cache mitigates this after the first successful load, but the cold-start window and any cache-miss after a write (`invalidateSettingsCache`) are unguarded.
- **Fix:** Wrap `prisma.systemSetting.findMany(...)` in a try/catch inside `_loadAll`. On error, log the failure and rethrow with a clear message: `throw new Error('[systemSettings] Failed to load settings: ' + err.message)`. This lets callers surface a 500 with context rather than an opaque Prisma error.

### [C-003][High][Code Quality] `lib/companyContext.js` — `getCompanyForUser`/`getClientIdForUser` async with no try/catch; middleware-level unhandled rejection
- **File:** `backend/lib/companyContext.js:9`
- **Issue:** Both exported functions perform `prisma.*` lookups with no error handling. They are called from `middleware/companyContext.js` inside what is likely an `async` middleware handler. If Prisma throws (DB down, network blip), the error propagates as an unhandled rejection at the middleware level. In Node ≥15 this crashes the process. The downstream routes rely on `req.companyId` and `req.clientId` being set; a crash here means every authenticated request fails silently.
- **Fix:** Wrap each `prisma.*` call in try/catch. On error, call `next(err)` from the middleware wrapper (or rethrow with context from the library function) so the Express error handler can return a 500 cleanly rather than crashing.

### [C-004][High][Code Quality] `utils/intelligenceEngine.js` — exported functions have no try/catch; Prisma errors crash the route handler
- **File:** `backend/utils/intelligenceEngine.js:3`
- **Issue:** `detectFraud`, `generateSmartAlerts`, and `predictCashflow` are all async functions with multiple `prisma.*` calls and no surrounding try/catch. The route handler in `routes/intelligence.js` has its own try/catch, but `generateSmartAlerts` is also called from background jobs and future scheduled tasks where the presence of a caller-level catch cannot be guaranteed. Each function performs 3–5 sequential Prisma round-trips; any one failing leaves the others' results discarded without logging.
- **Fix:** Wrap the body of each exported function in try/catch with a `console.error('[intelligenceEngine] <function> failed:', err)` log and rethrow. Within `generateSmartAlerts`, wrap individual alert checks in try/catch so a single-alert failure does not suppress the remaining alerts.

### [C-005][High][Code Quality] `utils/intelligenceEngine.js` `predictCashflow` references `input.amount` which does not exist on `PayrollInput` — `stagedInputsTotal` is always `0`
- **File:** `backend/utils/intelligenceEngine.js:204`
- **Issue:** `if (input.transactionCode.type === 'EARNING') stagedInputsTotal += input.amount;` — the `PayrollInput` schema uses `employeeUSD` and `employeeZiG` as the value columns, not `amount`. `input.amount` is always `undefined`, so `stagedInputsTotal` is always `NaN` (then coerced to `0` by the `+= undefined` path). The "staged inputs" component of the cashflow forecast is therefore permanently zero, making the `predictedTotal` just `baselineGross` regardless of how many inputs have been staged. Operators relying on this to plan cash position receive a silently incorrect figure.
- **Fix:** Replace `input.amount` with `(input.employeeUSD ?? 0) + ((input.employeeZiG ?? 0) / xrRate)` where `xrRate` is the latest USD→ZiG rate. If `xrRate` is unavailable, omit the ZiG portion and note it in the response. Alternatively, include only USD-currency inputs and document the limitation.

### [C-006][Medium][Code Quality] `lib/license.js` — five exported async functions have no try/catch; callers cannot distinguish DB failure from business logic failure
- **File:** `backend/lib/license.js:7`
- **Issue:** `issueLicense`, `validateLicense`, `revokeLicense`, `reactivateLicense`, and `checkEmployeeCap` all `await prisma.*` with no error handling. Route handlers in `routes/license.js` and `routes/admin.js` call these functions. Some callers have try/catch, others may not. When the DB is unavailable, `validateLicense` throws a raw Prisma error rather than returning `{ valid: false, reason: '...' }` — callers that destructure `{ valid }` will get an uncaught exception. `checkEmployeeCap` is called during employee creation; a Prisma error here reads as an employee-cap exceeded (throws, route catches, returns 500) when it should surface as a DB error.
- **Fix:** Wrap each function body in try/catch. For `validateLicense`, catch and return `{ valid: false, reason: 'License check unavailable — DB error' }`. For `checkEmployeeCap`, rethrow with a clear label so the caller's error handler can differentiate a cap check failure from a hard DB failure.

### [C-007][Medium][Code Quality] `lib/holidays.js` `autoSeedHolidays` — per-row `create` inside loop; single duplicate terminates entire seed silently
- **File:** `backend/lib/holidays.js:110`
- **Issue:** The inner `for (const h of holidays)` loop checks `findFirst` before each `create`, but the outer `try/catch` wraps the whole year's loop. If the `findFirst` returns null (holiday appears new) but a concurrent request or a race creates the same record before the `create` executes, Prisma throws a unique-constraint violation that is caught by the outer try/catch — logging `'Failed to auto-seed holidays'` and silently aborting the remaining holidays for that year. The result is a partially-seeded year that cannot be detected without querying the DB.
- **Fix:** Move the try/catch inside the inner loop so a single row failure logs and continues: `try { await prisma.publicHoliday.create(...) } catch (e) { if (e.code !== 'P2002') throw e; /* ignore duplicate */ }`. Or switch to `createMany` with `skipDuplicates: true` for the entire year's batch.

### [C-008][Medium][Code Quality] `worker.js` — outer loop catch swallows the error and reschedules, but a persistent Prisma failure causes infinite retry with no backoff
- **File:** `backend/worker.js:33`
- **Issue:** The outer `try/catch` in `workerLoop` catches errors from `prisma.job.findMany` (e.g., DB connection failure) with only `console.error('[worker] Loop Error:', error)` and then reschedules via `setTimeout(workerLoop, POLL_INTERVAL_MS)` — a fixed 1-second interval. If the DB is persistently down, the worker hammers reconnect attempts at 1 Hz with no backoff, floods the error log, and can exhaust connection-pool slots on recovery. There is also no alerting or circuit-breaker: an operator monitoring logs may miss the repeated identical lines.
- **Fix:** Implement exponential backoff on the loop error path: track consecutive failures and multiply the delay (e.g., min 1s, max 60s, factor 2). Reset the counter on a successful poll. Log the first failure and every 10th thereafter to reduce log noise.

### [C-009][Medium][Code Quality] `lib/taxTableParser.js` — `parseTaxExcel` and `parseTaxCSV` have no try/catch; corrupt file throws synchronously from route handler
- **File:** `backend/lib/taxTableParser.js:9`
- **Issue:** `parseTaxExcel` calls `XLSX.read(buffer, { type: 'buffer' })` and `XLSX.utils.sheet_to_json(worksheet)` with no error handling. A malformed or password-protected XLSX will throw synchronously inside what the caller expects to be a pure data function. The upload route in `routes/taxTables.js` has a try/catch at the handler level, but the parser's own try/catch is missing, making error messages opaque (the route sees `XLSX error: ...` which it wraps in a generic `500`). Similarly `parseTaxCSV` calls `csv-parse/sync`'s `parse()` which throws on malformed CSV. `parseTaxPDF` is async and already internally unguarded.
- **Fix:** Wrap the `XLSX.read` / `sheet_to_json` calls in a try/catch inside `parseTaxExcel` and throw a `new Error('Excel parse failed: ' + err.message)`. Do the same for `parseTaxCSV`. For `parseTaxPDF`, add an outer try/catch around `pdf(buffer)`. This gives the route handler a clean error message to surface to the operator.

### [C-010][Medium][Code Quality] `utils/intelligenceEngine.js` — `console.log` absent; errors use `console.error` but normal flow is silent — operational visibility gap
- **File:** `backend/utils/intelligenceEngine.js`
- **Issue:** None of the three exported functions emit any structured log on entry, on success, or on partial result (e.g., zero employees found). When the intelligence route returns an empty alerts array, there is no way to distinguish "no alerts because everything is healthy" from "no alerts because the function silently returned early due to `employees.length === 0`" or a DB error swallowed by a route-level catch. The `detectFraud` function has a `return []` at line 27 for zero employees with no log, meaning a company that accidentally has all employees discharged will silently pass fraud detection.
- **Fix:** Add `console.log('[intelligenceEngine] detectFraud: 0 active employees — skipping')` at the early return, and similar breadcrumbs at each major computation step. Use a structured logger (or at minimum `console.info`) rather than silence. This is a Low-severity operational issue but pairs with C-004.

### [C-011][Medium][Code Quality] `utils/payslipDocument.jsx` and `utils/summaryDocument.jsx` use ES module `import` syntax but are `require()`d from CommonJS `pdfService.js` — fragile interop
- **File:** `backend/utils/pdfService.js:4-11`, `backend/utils/payslipDocument.jsx:1`, `backend/utils/summaryDocument.jsx:1`
- **Issue:** `pdfService.js` is CommonJS (`require(...)`) but `payslipDocument.jsx` and `summaryDocument.jsx` use `import React from 'react'`, `import { ... } from '@react-pdf/renderer'`, and `createRequire(import.meta.url)` — all ES module syntax. `import.meta.url` is only defined in ESM context; in a CJS `require()` chain it throws `ReferenceError: Cannot use 'import.meta' outside a module`. This works only if the build pipeline (Babel / esbuild / tsx) transpiles the JSX files to CJS before the server runs them. There is no build script or `package.json` `"type": "module"` declaration visible to confirm this is handled. If the transpile step is ever skipped (e.g., running `node backend/worker.js` directly), PDF generation throws at startup.
- **Fix:** Either (a) transpile `payslipDocument.jsx` and `summaryDocument.jsx` to CJS as part of the build, documenting this dependency explicitly; or (b) convert `pdfService.js` to an ESM module (`import` / `export`) and ensure the entry point (`index.js`) is also ESM or uses a loader; or (c) rewrite the JSX files as CJS (`.js`) with `require()` and `module.exports`.

### [C-012][Low][Code Quality] `services/employeeImportService.js` — no per-batch DB transaction; partial import leaves orphaned employee rows on crash
- **File:** `backend/services/employeeImportService.js:114`
- **Issue:** The import loop calls `prisma.employee.create(...)` for each row sequentially with no enclosing `prisma.$transaction`. If the Node process crashes mid-import (OOM, SIGKILL, or an unhandled exception outside the per-row catch), employees 1–N are committed while N+1–M are lost. The caller has no way to re-run the import idempotently (there is no `upsert` by `employeeCode`) — re-running creates duplicates. The `results.failed` array is also returned without a reference to which rows were successfully written, making partial-import recovery manual.
- **Fix:** Wrap the entire row-processing loop in `prisma.$transaction([...all creates...])` or chunk into transaction batches of 50 rows. Alternatively, use `upsert` keyed on `employeeCode + companyId` so re-runs are idempotent and a partial import can be safely retried.

### [C-013][Low][Code Quality] `lib/validate.js` — `validateBody` middleware returns only the first error; multi-field validation failures give misleading feedback
- **File:** `backend/lib/validate.js:72`
- **Issue:** `res.status(400).json({ message: errors[0], errors })` — the `message` field always contains the first validation error string. The full `errors` array is included, but most frontend consumers read only `err.response.data.message` and display a single string. If a request has three invalid fields, the user sees only the first one, corrects it, resubmits, and sees the next one — each submit cycle is a round-trip. This is a developer experience and UX issue, not a crash risk.
- **Fix:** Either join errors into a multi-sentence string for `message` (`errors.join('; ')`), or adopt a `{ message: 'Validation failed', errors: [{ field, message }] }` shape that frontends can iterate. This is a Low-severity DX improvement but affects every route that calls `validateBody`.

### [C-014][Low][Code Quality] `lib/mailer.js` — no retry or delivery receipt confirmation; transient SMTP errors silently drop emails
- **File:** `backend/lib/mailer.js:52`
- **Issue:** All `sendMail` wrappers return the `getTransporter().sendMail(...)` promise directly with no retry logic. `nodemailer` throws on SMTP connection failure, authentication error, or RCPT reject. The caller (`jobProcessor.js`) catches this and marks the job as failed (triggering retry via exponential backoff), but ad-hoc callers in `routes/payroll.js` (send-all payslips), `routes/cron.js` (reminders), and `routes/auth.js` (password reset) do not have retry logic — the email is simply lost. There is no delivery receipt check (`info.rejected`, `info.response`) logged after a successful `sendMail` call.
- **Fix:** After `sendMail` resolves, check `if (info.rejected?.length > 0) console.error('[mailer] Rejected recipients:', info.rejected)`. Add a jitter-retry wrapper (1 retry, 2s delay) to critical emails (payslip, password reset). Log the `info.messageId` at `INFO` level so delivery can be correlated in SMTP provider logs.

### [C-015][Low][Code Quality] Dead code — `lib/taxTableParser.js` `parseTaxPDF` uses fragile regex heuristics and is unlikely to work reliably on real ZIMRA PDFs
- **File:** `backend/lib/taxTableParser.js:63`
- **Issue:** `parseTaxPDF` extracts tax brackets by scanning text lines for four consecutive numbers. ZIMRA PDFs use formatted tables with multi-column layouts that `pdf-parse` collapses into a single text stream, stripping column alignment. The regex `/(\d+[\.\d]*)\s+(\d+[\.\d]*|max|MAX|and above)\s+(\d+[\.\d]*)\s*(\d+[\.\d]*)?/i` will match spurious lines (page numbers, footnote references, employee counts in table headers) and miss rows where numbers span two text lines due to PDF rendering. The function is exported and reachable via `POST /api/tax-tables/:id/upload` — a production user uploading a ZIMRA PDF will receive silently incorrect brackets with no parse error.
- **Fix:** Either remove the PDF upload path and require CSV/XLSX only (simpler and more reliable), or replace the regex heuristic with a proper column-coordinate-aware PDF parser (e.g., `pdf2table` or Camelot). At minimum, add a `console.warn('[taxTableParser] PDF parsing is experimental — verify brackets after upload')` and surface a warning in the API response.

### [C-016][Low][Code Quality] `lib/prisma.js` — `globalForPrisma` singleton pattern only prevents duplicate clients in development; production creates a new client on every cold-start module load
- **File:** `backend/lib/prisma.js:8`
- **Issue:** `if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;` — the singleton is stored on `globalThis` **only in non-production** environments. In production every module `require('../lib/prisma')` within the same process returns the same module-cached instance (Node's module cache provides this), so production is fine as long as a single process runs. However, if worker.js and index.js are ever run as separate Node processes in the same container (or if a future bundler inlines the module), each process creates its own `PrismaClient` with a separate connection pool. The comment is absent — the intent is unclear to future maintainers, and the asymmetry between dev and prod is surprising.
- **Fix:** Either (a) store the singleton on `globalThis` unconditionally and document why (`globalThis` avoids module re-instantiation in hot-reload environments), or (b) remove the `globalThis` pattern entirely and rely on Node's module cache for both environments — simpler and correct for a single-process server. Add a comment explaining the chosen approach.

---

## Task 5b — Frontend Components Code Quality Sweep (2026-04-27)

### [C-017][High][Code Quality] `AppShell.tsx` — `useEffect` for auto-logout has missing `handleLogout` dependency; stale closure captures initial `navigate`
- **File:** `frontend/src/components/AppShell.tsx:81`
- **Issue:** `useEffect(() => { if (isIdle) handleLogout(); }, [isIdle])` omits `handleLogout` from the dependency array. `handleLogout` calls `logout()` and `navigate('/login')`, capturing the `navigate` reference from the component's initial render. Because `handleLogout` is a plain function defined inside the component it is recreated on every render, but the effect's stale closure will always reference the first instance. If `navigate` ever becomes stale (e.g., after a React Router context update) the redirect silently fails and the session is not terminated. React's exhaustive-deps lint rule will flag this but the eslint-disable comment on line 61 suggests the project may be suppressing these warnings broadly.
- **Fix:** Either wrap `handleLogout` in `useCallback` with `[navigate]` dependency and add it to the effect's dep array, or inline the logout logic directly: `useEffect(() => { if (isIdle) { logout(); navigate('/login'); } }, [isIdle, navigate])`.

### [C-018][High][Code Quality] `AppShell.tsx` — `loadCompanies` captured in `useEffect` with empty dep array; `user` role check uses stale closure
- **File:** `frontend/src/components/AppShell.tsx:61`
- **Issue:** `useEffect(loadCompanies, [])` is intentionally suppressed with `// eslint-disable-line react-hooks/exhaustive-deps`. `loadCompanies` closes over `user` (from `getUser()` at line 16). If the JWT is refreshed mid-session and `getUser()` returns a new object with a different role, `loadCompanies` will not re-run and `companies`/`activeCompany` state will reflect stale data. Additionally, `loadCompanies` calls `setActiveCompany` and `setActiveCompanyId` after the async `CompanyAPI.getAll()` resolves with no mounted-guard — if the component unmounts during the fetch (e.g., immediate logout), this causes a React state-update-on-unmounted-component warning.
- **Fix:** Add a mounted guard to `loadCompanies` (`let mounted = true; ... if (mounted) setCompanies(...)`) and add a cleanup. Reconsider whether `user` should be in the dep array or extracted into a ref.

### [C-019][High][Code Quality] `useIdleTimer.ts` — activity handler captures `isWarning` from closure; stale value causes reset to fire during warning window after first render
- **File:** `frontend/src/hooks/useIdleTimer.ts:55`
- **Issue:** `const activityHandler = () => { if (!isWarning) { resetTimer(); } }` is defined inside the `useEffect` at line 54 whose dependency array is `[resetTimer, isWarning]`. This means the event listeners are removed and re-added every time `isWarning` changes — which happens on every countdown tick that toggles the warning state. Re-adding listeners on each `isWarning` flip introduces a brief window (~0ms) where no listener is attached. More critically, because `activityEvents.forEach(addEventListener)` is called again inside the same effect that also calls `resetTimer()` as the "initial start", toggling `isWarning` from `false` to `true` re-runs `resetTimer()` immediately, resetting the very countdown that just started.
- **Fix:** Use a `ref` for `isWarning` inside the hook (`const isWarningRef = useRef(false)`) so the activity handler always reads the current value without needing to be recreated. The effect dependency array can then be `[resetTimer]` only, and the listener registration happens once per `resetTimer` identity change.

### [C-020][Medium][Code Quality] `EmployeeAuditTab.tsx` — fetch errors swallowed silently; user sees empty state instead of an error message
- **File:** `frontend/src/components/EmployeeAuditTab.tsx:16`
- **Issue:** `.catch(err => console.error('Failed to load audit logs:', err))` logs to the console but sets no error state. When the API call fails, `loading` becomes `false` via `finally` and `logs` remains `[]`, so the component renders the "No audit history found" empty state. A user will assume there is no audit history when in fact a network or auth error occurred. There is no way to distinguish an API failure from a genuinely empty log.
- **Fix:** Add `const [error, setError] = useState<string | null>(null)` and in the catch block set it: `setError('Failed to load audit history. Please try again.')`. Render the error message in place of the empty state when `error` is non-null. Optionally use `useToast` for consistency with other components.

### [C-021][Medium][Code Quality] `SalaryStructurePanel.tsx` — `load()` silently swallows fetch errors; user sees empty list with no indication of failure
- **File:** `frontend/src/components/employees/SalaryStructurePanel.tsx:45`
- **Issue:** The `catch` block in `load()` is `// silent` — there is no `setError` call and no toast. When `EmployeeSalaryStructureAPI.getAll` or `TransactionCodeAPI.getAll` fails (e.g., 401, 500, network timeout), `loading` becomes `false`, `records` remains `[]`, and the component renders "No salary components defined." — indistinguishable from a genuinely empty structure. This is especially problematic because salary structure data is payroll-critical; a user may act on what appears to be an empty structure.
- **Fix:** Replace the silent catch with `setError('Failed to load salary structure. Please refresh.')` and render the error string in a visible banner when present. Mirror the error display pattern already used for `handleSave` errors.

### [C-022][Medium][Code Quality] `SalaryStructurePanel.tsx` — `window.confirm()` used for destructive actions; blocks UI thread and is inconsistent with the rest of the app which uses `ConfirmModal`
- **File:** `frontend/src/components/employees/SalaryStructurePanel.tsx:87,97`
- **Issue:** Both `handleEndDate` and `handleDelete` call `window.confirm(...)` for confirmation. The rest of the application uses the shared `ConfirmModal` component (backed by shadcn Dialog). `window.confirm` cannot be styled, blocks the JS thread, is suppressed in some embedded browser contexts, and cannot be tested with React Testing Library. This is inconsistent with the established UX pattern.
- **Fix:** Replace both `window.confirm` calls with the shared `ConfirmModal` (control via a `pendingAction` state variable). This matches the pattern used elsewhere in the codebase.

### [C-023][Medium][Code Quality] `IntelligenceWidget.tsx` — fetch errors silently logged only; fraud/alert data loss is not surfaced to the user
- **File:** `frontend/src/components/IntelligenceWidget.tsx:29`
- **Issue:** The `catch` block only calls `console.error('Failed to load intelligence data')` with no user-visible feedback. If the API fails, `loading` becomes `false` and both `alerts` and `fraudFlags` remain `[]`, causing the widget to return `null` (line 40) — it disappears silently from the dashboard. Fraud detection is a security-sensitive feature; a silent failure that hides the widget is indistinguishable from "no fraud detected."
- **Fix:** Track an `error` state and render a small inline error banner (e.g., "Compliance alerts unavailable") instead of returning `null` on error. This ensures the widget's absence is distinguishable from a clean bill of health.

### [C-024][Medium][Code Quality] `FilingDeadlinesCard.tsx` — index used as `key` on deadline list items; reorder causes React reconciliation bugs
- **File:** `frontend/src/components/dashboard/FilingDeadlinesCard.tsx:125`
- **Issue:** `deadlines.map((d, i) => { ... return <div key={i} ...>` uses the array index as the React key. `getUpcomingDeadlines` recalculates on each render and its output order depends on date comparison — if the caller's `holidays` prop changes (e.g., after a lazy-loaded holidays fetch completes), the sorted array reorders but React uses stable-by-index keys and may incorrectly reuse DOM nodes, producing visual glitches or stale content in list items.
- **Fix:** Use a stable composite key such as `` key={`${d.tag}-${d.dueDate.toISOString()}`} ``. All deadline objects have a unique `(tag, dueDate)` combination after filtering and sorting.

### [C-025][Medium][Code Quality] `EmployeeModal.tsx` — no error handling on `onSave`; submit failures are invisible to the user
- **File:** `frontend/src/components/EmployeeModal.tsx:25`
- **Issue:** `handleSubmit` calls `onSave(formData)` without catching any errors or accepting a return value. If the parent's `onSave` implementation throws or rejects (e.g., API returns 422 validation error), the modal does not display any feedback. There is also no `submitting` loading state, so the Save button can be clicked multiple times before the first request completes.
- **Fix:** Convert `handleSubmit` to `async`, add a `submitting` state, and accept a `Promise` from `onSave`. Wrap in try/catch and display the error message via a local `error` state or `useToast`. Disable the Save button while `submitting` is true.

### [C-026][Medium][Code Quality] `SettingsContext.tsx` — `updatePreferences` optimistically updates state before server confirm; server failure leaves UI out of sync with persisted data
- **File:** `frontend/src/context/SettingsContext.tsx:74`
- **Issue:** `updatePreferences` calls `setPreferences(merged)` and `applyTheme(newPrefs.theme)` synchronously before the `await UserAPI.update(...)` call. If the server update fails, the UI shows the new preference (e.g., dark theme applied) but the server still has the old value. On next page load, `fetchPrefs` restores the server's version, causing a visible theme flash. There is no rollback and no user-visible error.
- **Fix:** Either (a) do pessimistic update: `await UserAPI.update(...)` first, then `setPreferences`; or (b) keep optimistic update but add a rollback on failure: save `previous = preferences` before the update, and in the catch block call `setPreferences(previous)` and `applyTheme(previous.theme)`. Show a toast on failure using `useToast` (which is available in the project).

### [C-027][Low][Code Quality] `AppShell.tsx` — `NavLink` component defined inside the render function; recreated on every parent render, defeats React reconciliation
- **File:** `frontend/src/components/AppShell.tsx:128`
- **Issue:** `const NavLink = ({ link }) => { ... }` is declared inside the `AppShell` component body. React treats this as a new component type on each parent render, causing every `NavLink` instance to unmount and remount rather than update. This also prevents React DevTools from showing a stable component name in the tree. `SidebarContent` at line 147 has the same issue.
- **Fix:** Move `NavLink` and `SidebarContent` outside the `AppShell` function and pass required values (e.g., `collapsed`, `location`) as explicit props. This allows React to reconcile them as stable component types.

### [C-028][Low][Code Quality] `EmployeeTableSkeleton.tsx` — duplicates `SkeletonTable` functionality; `SkeletonTable` already exists as a generic replacement
- **File:** `frontend/src/components/employees/EmployeeTableSkeleton.tsx`
- **Issue:** `EmployeeTableSkeleton` is a 42-line hand-coded skeleton that exactly replicates the employee table structure. The generic `SkeletonTable` component (`frontend/src/components/common/SkeletonTable.tsx`) was introduced to eliminate these duplicates and already handles an employee-style first column. Having both means bug fixes or style changes must be applied in two places.
- **Fix:** Replace `EmployeeTableSkeleton` with `<SkeletonTable headers={['Employee', 'ID', 'Position', 'Department', 'Branch', 'Status', 'Actions']} rows={5} />` at all call sites and delete the file.

### [C-029][Low][Code Quality] `MiniCalendar.tsx` — calendar day cells use day number as `key`; duplicate keys occur when padding nulls share the same `key` namespace
- **File:** `frontend/src/components/dashboard/MiniCalendar.tsx:75`
- **Issue:** `cells.map((day, i) => { if (!day) return <div key={`e-${i}`} />; ... return <div key={day} ...>`. The real-day divs use `key={day}` (a number 1–31). This is unique within the month view, but if `selectedDay` is on the same month as `viewDate`, the rendered `key={day}` cells and any parent-rendered siblings could collide. More importantly, when the month changes, `day` numbers repeat — React's reconciler may incorrectly reuse nodes from the previous month. Using the index `i` (already available) would be more stable here.
- **Fix:** Use `key={`cell-${i}`}` for all cells (both nulls and real days). The index is stable within a single render of a given month's grid.

### [C-030][Low][Code Quality] `IdleTimerModal.tsx` — progress bar width calculation hardcodes divisor `10`; assumes a fixed 10-second countdown regardless of `timeout`/`warningThreshold` config
- **File:** `frontend/src/components/common/IdleTimerModal.tsx:37`
- **Issue:** `style={{ width: \`${(remainingTime / 10) * 100}%\` }}` assumes the countdown always starts at 10 seconds. `useIdleTimer` is called from `AppShell` with `timeout: 60000` and `warningThreshold: 50000`, giving a 10-second window — so this happens to be correct today. But the divisor is a magic number not derived from props, making the component fragile if the timeout config changes. If `warningThreshold` is ever set to 45000 (15-second window), the bar will exceed 100% for the first 5 seconds.
- **Fix:** Pass the total countdown duration as a prop (`totalSeconds: number`) and use `(remainingTime / totalSeconds) * 100`. Alternatively, accept `maxRemainingTime` as a prop initialised to the first `remainingTime` value received.

### [C-031][Low][Code Quality] `useDashboardData.ts` — `getActiveCompanyId()` called imperatively inside query hooks; company ID not reactive to `activeCompanyChanged` events
- **File:** `frontend/src/hooks/useDashboardData.ts:22`
- **Issue:** `const companyId = getActiveCompanyId()` is called at hook body level (outside any effect) using a synchronous read from `sessionStorage` via `companyContext`. When the user switches companies in `AppShell` (which dispatches a `window.dispatchEvent(new Event('activeCompanyChanged'))` and calls `navigate(homeLink)`), React Query's `queryKey` depends on `companyId` captured at the time the hook rendered. If the dashboard component does not unmount and remount on company switch, the `companyId` in the query key stays stale and no re-fetch is triggered. The page reload (via `navigate`) currently masks this bug, but it will surface if navigation ever becomes soft.
- **Fix:** Subscribe to the `activeCompanyChanged` event inside the hook (or a wrapper context) and force a re-render to pick up the new `companyId`. Alternatively, store `activeCompanyId` in React state or a context value so it participates in normal React rendering.

---

## Performance Findings (Task 6)

### [P-001][High][Performance] N+1: `jobs/leaveAccrual.js` issues individual DB calls per employee×policy in the monthly cron loop
- **File:** `backend/jobs/leaveAccrual.js:112-178`
- **Issue:** The cron (and post-payroll trigger) path iterates `for (policy) / for (employee)` and for each pair issues: (1) `prisma.leaveBalance.findFirst` to locate the existing balance, (2) `prisma.leaveBalance.create` if missing, (3) optionally `prisma.leaveBalance.update` to back-fill `leavePolicyId`, (4) `prisma.leaveBalance.update` to apply the accrual — plus a further 2–3 queries per employee on January runs via `handleYearEnd` (lines 220-268: two `findFirst` calls + up to two writes). For a company with 300 employees and 3 policies that is 300 × 3 × ~4 = 3,600 sequential Prisma round-trips per monthly run. If the platform serves 50 companies the cron job issues ~180,000 queries before it completes — taking several minutes and potentially timing out or starving other queries. The `routes/leaveBalances.js` accrual endpoint was fixed to batch (V-061), but this cron path was not updated.
- **Fix:** Before entering the loops, pre-fetch all existing balances for the target companies and year in a single `findMany({ where: { companyId: { in: companyIds }, year: currentYear } })` and build an in-memory map keyed by `employeeId:leaveType`. Collect all creates and updates into arrays, then execute via `prisma.$transaction([...batchedWrites])` or chunked `createMany`/`updateMany`. Apply the same batching to `handleYearEnd`.

### [P-002][High][Performance] `GET /api/reports/tax` (P16): `include: { employee: true, payrollRun: { include: { company: true } } }` fetches all columns on Employee and Company for every payslip row
- **File:** `backend/routes/reports/statutory.js:50-58`
- **Issue:** The P16 annual tax report calls `prisma.payslip.findMany({ include: { employee: true, payrollRun: { include: { company: true } } } })` with no `select` clauses. For a year with 300 employees × 12 runs = 3,600 payslip rows, Prisma hydrates the complete `Employee` object (40+ columns including TIN, bank details, address, all salary fields) and the complete `Company` object for every row. Only `employee.firstName/lastName/tin/nationalId/passportNumber/employeeCode` and `company.name/taxId/registrationNumber` are used in the output. The payload held in memory is orders of magnitude larger than needed and will cause OOM or extreme GC pressure on tenants with >200 employees.
- **Fix:** Replace `employee: true` with `employee: { select: { firstName: true, lastName: true, employeeCode: true, tin: true, nationalId: true, passportNumber: true } }` and `payrollRun: { include: { company: true } }` with `payrollRun: { select: { id: true, company: { select: { name: true, taxId: true, registrationNumber: true } } } }`. Also add a tight `select` on the `Payslip` model itself — only `employeeId`, `payrollRunId`, `gross`, `paye`, `aidsLevy`, `nssaEmployee`, `netPay`, `wcifEmployer`, `sdfContribution`, `necLevy` are needed; the remaining ~20 columns can be dropped.

### [P-003][Medium][Performance] `GET /api/reports/itf16`: `findMany` on `Payslip` has no `select` — all ~30 Payslip columns fetched for annual export
- **File:** `backend/routes/reports/statutory.js:165-175`
- **Issue:** `prisma.payslip.findMany({ where: ..., include: { employee: { select: {...} } } })` has no `select` on the Payslip model itself. The handler only reads `gross`, `paye`, `aidsLevy`, `nssaEmployee`, `pensionApplied`, `netPay`, and `payrollRunId` from each payslip, but all ~30 columns (dual-currency floats, YTD fields, status, timestamps, etc.) are fetched and instantiated in memory for every payslip in the year.
- **Fix:** Add `select: { employeeId: true, payrollRunId: true, gross: true, paye: true, aidsLevy: true, nssaEmployee: true, pensionApplied: true, netPay: true, employee: { select: { employeeCode: true, firstName: true, lastName: true, tin: true, nationalId: true, passportNumber: true } } }` to the `findMany` call.

### [P-004][Medium][Performance] `GET /api/employees/:id` fetches full Employee row with no `select` — TIN, SSN, all salary fields returned unnecessarily
- **File:** `backend/routes/employees.js:352-361`
- **Issue:** `prisma.employee.findUnique({ where: { id }, include: { company, branch, department, grade, bankAccounts } })` has no `select` on the `Employee` model. All ~45 columns are returned including `tin`, `passportNumber`, `socialSecurityNum`, `taxDirective*`, internal flags, and YTD fields, even when the consumer (employee edit form) only needs a subset. This also returns `bankAccounts` unconditionally, which includes full account numbers. As noted in V-015, this is a security regression as well as a performance issue.
- **Fix:** Add an explicit `select` that mirrors the list projection used in `GET /` (lines 162–186), plus the relation fields needed by the detail view. Return `bankAccounts` via `include` only (it already has a tight schema), but strip the full Employee model to the whitelist.

### [P-005][Medium][Performance] `GET /api/payroll` returns all PayrollRun rows for a company with no pagination
- **File:** `backend/routes/payroll.js:28-43`
- **Issue:** `prisma.payrollRun.findMany({ where: { companyId }, include: { _count, payrollCalendar }, orderBy: { runDate: 'desc' } })` has no `take`/`skip`. A company that has been running payroll for 3 years has 36+ runs; a multi-company platform client can have hundreds. The response also includes the full `payrollCalendar` sub-object for every run. All runs are returned in a single query and held in memory before serialising to JSON.
- **Fix:** Add `take: parseInt(limit) || 24` and `skip` pagination, and expose `page`/`limit` query params. Return a `total` count from a parallel `prisma.payrollRun.count({ where })`. Add `payrollCalendar: { select: { year: true, month: true, isClosed: true } }` to trim the included relation.

### [P-006][Medium][Performance] `GET /api/leave` fetches all LeaveRecords and LeaveRequests for a company with no pagination
- **File:** `backend/routes/leave.js:25-36`
- **Issue:** Both `prisma.leaveRecord.findMany(...)` and `prisma.leaveRequest.findMany(...)` are called with no `take`/`skip`. A company with 200 employees and 3 years of leave history can accumulate 7,000+ leave records. Both sets are fetched in full and returned in a single JSON payload. There is no `total` count or cursor. For an EMPLOYEE-role caller the filter already scopes to `employeeId`, so the exposure is limited to admin callers — but a `manage_leave` admin triggering this with no filters against a large company can receive a response >1 MB and exhaust memory on low-tier instances.
- **Fix:** Add `take: parseInt(limit) || 50` and `skip` pagination to both queries, and expose `page`/`limit` query params. Return `total` counts via parallel `prisma.leaveRecord.count` / `prisma.leaveRequest.count`.

### [P-007][Medium][Performance] `jobs/leaveAccrual.js` — `handleYearEnd` issues up to 4 sequential queries per employee inside the January run (already inside the outer N+1 loop)
- **File:** `backend/jobs/leaveAccrual.js:220-268`
- **Issue:** `handleYearEnd` is called inside the `for (emp)` loop on every January accrual run. For each employee it issues: (1) `findFirst` on the previous year's balance, (2) optionally `update` on that balance (forfeiture), (3) `findFirst` on the current year's balance, (4) `create` or `update` on the current year's balance. These 4 queries are sequential. For a company with 300 employees this produces 1,200 sequential DB round-trips just for the year-end carry-over step, before the main accrual update is applied. This compounds the N+1 identified in P-001.
- **Fix:** Pre-fetch all previous-year and current-year balances for all employees in a single pass before entering the loop. Batch creates and updates. This can be unified with the P-001 fix — a single pre-fetch pass at the top of the company block covers both main accrual and year-end carry-over.

### [P-008][Medium][Performance] `GET /api/payslipSummaries` has no pagination — returns all summaries for a company unbounded
- **File:** `backend/routes/payslipSummaries.js:9-19`
- **Issue:** `prisma.payslipSummary.findMany({ where: { companyId: req.companyId }, include: { employee: ... }, orderBy: { payPeriod: 'desc' } })` has no `take`/`skip`. If `PayslipSummary` accumulates one row per employee per period, a company with 200 employees running 36 monthly payrolls has 7,200 summary rows returned in every `GET /` request.
- **Fix:** Add `take: parseInt(limit) || 100` and `skip` pagination with `page`/`limit` query params. Return `total` from a parallel `prisma.payslipSummary.count({ where })`.

### [P-009][Low][Performance] `GET /api/employees/:id/audit-logs` fetches up to 200 audit log rows with a JSON `path` filter — may fall back to a full table scan on the `details` JSONB column
- **File:** `backend/routes/employees.js:330-341`
- **Issue:** The second and third `OR` branches of the audit log query use `{ details: { path: ['employeeId'], equals: req.params.id } }` and `{ details: { path: ['id'], equals: req.params.id } }`. These are JSONB path filters on the `details` column. Unless a GIN index exists on `AuditLog.details`, PostgreSQL must scan the entire `AuditLog` table and evaluate the JSON expression for every row to satisfy these conditions. On a busy platform the `AuditLog` table grows unboundedly; a single call can do a multi-second sequential scan. The `take: 200` limit is applied after the scan, not before.
- **Fix:** Either remove the two JSONB `OR` branches (the `resource: 'employee', resourceId: req.params.id` clause is sufficient for most use cases), or add a GIN index on `AuditLog.details` via `prisma migrate dev`. Also ensure `AuditLog` has a compound index on `(resource, resourceId)` for the primary branch. Note: `MANUAL` — requires schema migration.

### [P-010][Low][Performance] `POST /api/payroll/:runId/process` fetches `PayrollInput` for all employees without a `select` — full model hydration on the largest input table
- **File:** `backend/routes/payroll/process.js:370-379`
- **Issue:** `prisma.payrollInput.findMany({ where: {...}, include: { transactionCode: { select: {...} } } })` fetches the full `PayrollInput` row with no `select` on the model itself. The `PayrollInput` model has ~15 columns including `employeeUSD`, `employeeZiG`, `companyUSD`, `companyZiG`, `unitsType`, `units`, `balance`, `processed`, `period`, `notes`, etc. The engine uses most of these, but `createdAt`, `updatedAt`, `importSource`, and relation metadata are hydrated unnecessarily for every input on every payroll run. For a company with 200 employees × 10 inputs each this is 2,000 full model objects per run.
- **Fix:** Add a `select` clause to the `payrollInput.findMany` that covers only the fields consumed by the processing loop: `id`, `employeeId`, `transactionCodeId`, `payrollRunId`, `employeeUSD`, `employeeZiG`, `companyUSD`, `companyZiG`, `units`, `unitsType`, `balance`, `processed`, `period`, plus the `transactionCode` sub-select already present.

---

## Schema Findings (Task 7)

### [SC-001][High][Schema] `PayrollRun` has no cascade on Company delete — orphaned run rows block tenant offboarding
- **Model:** `PayrollRun`
- **Field:** `companyId` relation to `Company`
- **Issue:** `company Company @relation(fields: [companyId], references: [id])` has no `onDelete` clause, so Prisma defaults to `Restrict`. If a company is deleted (e.g., tenant offboarding, test cleanup), the delete is blocked by existing `PayrollRun` rows. Cascades exist on `PayrollRun → Payslip` and `PayrollRun → PayrollTransaction`, so the child tables would be cleaned up — but the run itself would not, leaving the delete to fail at the DB level with a foreign key violation and no actionable error message to the caller.
- **Fix:** Add `onDelete: Cascade` to the `company` relation on `PayrollRun`. Alternatively, add `onDelete: Restrict` explicitly and implement a soft-delete or archival flow for companies, with documentation.

### [SC-002][High][Schema] `Employee` → `Company` and `Employee` → `Client` relations have no `onDelete` — cascading deletes of Company/Client fail silently or produce FK violations
- **Model:** `Employee`
- **Field:** `companyId` and `clientId` relations
- **Issue:** Both `company Company @relation(...)` and `client Client @relation(...)` on `Employee` omit `onDelete`. The default `Restrict` means deleting a `Company` or `Client` with active employees throws a FK violation. `Company` cascades to many other models (`Branch`, `Department`, `PayrollRun`, etc.) via explicit `onDelete: Cascade`, so partial company deletes will succeed for those children but then fail when the DB hits `Employee` — leaving the company partially deleted and the DB in an inconsistent state. This is a data integrity risk during any tenant offboarding or company restructure operation.
- **Fix:** Add `onDelete: Cascade` to both the `company` and `client` relations on `Employee`. Ensure all downstream Employee relations (`Payslip`, `LeaveBalance`, `Loan`, etc.) are consistently set — most already have `onDelete: Cascade` on the Employee FK, which is correct.

### [SC-003][High][Schema] `Loan` → `Employee` has no cascade — deleting an employee leaves orphaned loans and repayments
- **Model:** `Loan`
- **Field:** `employeeId` relation to `Employee`
- **Issue:** `employee Employee @relation(fields: [employeeId], references: [id])` has no `onDelete`. If an employee is deleted (discharge workflow, data correction), the `Loan` rows are not cleaned up. `LoanRepayment` cascades from `Loan` (`onDelete: Cascade`), so repayments would remain orphaned via the non-cascading parent. Orphaned loans retain financial balances that can appear in reports and payroll processing, corrupting totals.
- **Fix:** Add `onDelete: Cascade` to the `employee` relation on `Loan`. If business rules require loan records to survive employee deletion, use `onDelete: Restrict` and enforce a "settle or write-off all loans before archiving employee" guard in the discharge route.

### [SC-004][High][Schema] `LeaveRecord` → `Employee` has no cascade — deleting an employee orphans leave history
- **Model:** `LeaveRecord`
- **Field:** `employeeId` relation to `Employee`
- **Issue:** `employee Employee @relation(fields: [employeeId], references: [id])` has no `onDelete`. Deletion of an employee does not remove associated leave records. Unlike `LeaveBalance` (which cascades), `LeaveRecord` will retain rows tied to a non-existent employee, polluting leave reports and blocking future `employeeId` reuse if codes are recycled.
- **Fix:** Add `onDelete: Cascade` to the `employee` relation on `LeaveRecord`.

### [SC-005][High][Schema] `LeaveRequest` → `Employee` has no cascade — same orphan risk as LeaveRecord
- **Model:** `LeaveRequest`
- **Field:** `employeeId` relation to `Employee`
- **Issue:** Same pattern as SC-004. `employee Employee @relation(fields: [employeeId], references: [id])` has no `onDelete`. Pending or approved leave requests referencing a deleted employee will linger in the `LeaveRequest` table, appearing in manager approval queues with a broken employee reference.
- **Fix:** Add `onDelete: Cascade` to the `employee` relation on `LeaveRequest`.

### [SC-006][High][Schema] `PayrollTransaction` → `Employee` has no cascade — payroll history orphaned on employee delete
- **Model:** `PayrollTransaction`
- **Field:** `employeeId` relation to `Employee`
- **Issue:** `employee Employee @relation(fields: [employeeId], references: [id])` has no `onDelete`. If an employee is deleted while a completed payroll run references them, `PayrollTransaction` rows are left with a dangling `employeeId`. These rows feed payroll reports; orphaned rows will produce null-reference errors in any reporting query that joins back to `Employee`.
- **Fix:** Add `onDelete: Restrict` (preferred for financial audit trail — block employee deletion if payroll transactions exist) or `onDelete: SetNull` (if the employee FK is made nullable). Do not cascade-delete financial transactions; preserve them with a null or archived employee reference.

### [SC-007][High][Schema] `CurrencyRate` has no unique constraint on `(companyId, fromCurrency, toCurrency, effectiveDate)` — duplicate rates for same day accepted silently
- **Model:** `CurrencyRate`
- **Field:** `(companyId, fromCurrency, toCurrency, effectiveDate)`
- **Issue:** Only `@@index([companyId, effectiveDate])` exists; there is no `@@unique`. A duplicate POST request (retry, double-click) or an import script run twice will insert two rows for the same currency pair and date. The payroll engine selects the "most recent" rate by `effectiveDate desc` — on a tie it picks the first row returned by the DB (non-deterministic). This can cause different payroll runs to use different exchange rates for the same nominal date, producing calculation discrepancies that are invisible at the UI level.
- **Fix:** Add `@@unique([companyId, fromCurrency, toCurrency, effectiveDate])`. Update the upsert/create routes to use `prisma.currencyRate.upsert({ where: { companyId_fromCurrency_toCurrency_effectiveDate: ... }, ... })`.

### [SC-008][High][Schema] `SystemSetting` has no `companyId` — global settings cannot be overridden per-tenant; all tenants share a single row
- **Model:** `SystemSetting`
- **Field:** `settingName` (no tenant scoping)
- **Issue:** `SystemSetting` has no `companyId` or `clientId`. The `@@unique([settingName, effectiveFrom])` constraint means there can only be one global value per setting per effective date, shared across all tenants. Settings like `nssaRate`, `wcifRate`, `zimdefRate` vary by company industry. The schema comment on `Company` notes industry-specific overrides on the `Company` model itself (e.g., `wcifRate`, `sdfRate`), but `SystemSetting` as a fallback has no tenant dimension, so any tenant-specific default must be hard-coded in application logic rather than stored in the settings table. This creates a rigid global-only table that cannot serve multi-tenant configuration needs.
- **Fix:** Add an optional `clientId String?` column and update `@@unique` to `@@unique([clientId, settingName, effectiveFrom])` (null `clientId` = global default). Index `[clientId, settingName, isActive]` for tenant-aware lookups. Update the settings resolver to prefer a client-scoped row over the global fallback.

### [SC-009][Medium][Schema] `PayrollRun.payrollCalendarId` is optional (`String?`) — payroll runs can exist with no calendar linkage, breaking period validation
- **Model:** `PayrollRun`
- **Field:** `payrollCalendarId`
- **Issue:** `payrollCalendarId String?` allows a `PayrollRun` to be created without being linked to a `PayrollCalendar`. The calendar is the source of truth for whether a period is open/closed (`isClosed`). Without a calendar link, the payroll engine cannot enforce that duplicate runs are not created for the same closed period. Routes that check `payrollCalendar.isClosed` will simply skip the check when the FK is null.
- **Fix:** Either (a) make `payrollCalendarId` required (`String`, not `String?`) and enforce calendar creation before payroll run creation; or (b) keep it optional but add a DB check constraint or application-level guard that prevents creating a second `DRAFT` or `APPROVED` run for the same `(companyId, startDate, endDate)` without a calendar reference.

### [SC-010][Medium][Schema] `PayrollInput.payrollRunId` is optional (`String?`) — inputs can float detached from any run, complicating deduplication
- **Model:** `PayrollInput`
- **Field:** `payrollRunId`
- **Issue:** `payrollRunId String?` is intentional for "pre-loaded" inputs not yet attached to a run, but there is no lifecycle enforcement. An input record with `payrollRunId = null` and `processed = false` that was created but never attached to a run will persist indefinitely. The processing engine queries `where: { payrollRunId, processed: false }` so these orphaned inputs are invisible to normal processing but accumulate as dead data. There is also no `@@unique` to prevent two active inputs for the same `(employeeId, transactionCodeId, period)`.
- **Fix:** Add `@@unique([employeeId, transactionCodeId, period])` to prevent duplicate active inputs per period. Add a periodic cleanup job or soft-delete flag for unattached inputs older than N periods.

### [SC-011][Medium][Schema] `EmployeeBankAccount.splitType` is a free-text `String` — no DB-level constraint prevents invalid values
- **Model:** `EmployeeBankAccount`
- **Field:** `splitType String @default("REMAINDER")`
- **Issue:** The comment notes valid values are `"FIXED" | "PERCENTAGE" | "REMAINDER"`, but the field is a plain `String`. Any other value (e.g., a typo like `"FIXED_AMOUNT"`, an empty string, or a value from a different locale) is accepted by the DB. The bank payment export logic branches on this string; an unexpected value silently falls through to an unhandled case, potentially exporting zero amounts or skipping an employee's bank transfer.
- **Fix:** Define a `SplitType` enum (`FIXED`, `PERCENTAGE`, `REMAINDER`) and change the field to `splitType SplitType @default(REMAINDER)`. This enforces valid values at the DB level.

### [SC-012][Medium][Schema] `EmployeeDocument.type` is a free-text `String` — document type classification is unconstrained
- **Model:** `EmployeeDocument`
- **Field:** `type String`
- **Issue:** The comment lists `"ID", "CONTRACT", "MEDICAL", "OTHER"` as valid values but the field is a plain `String`. Documents can be stored with arbitrary type strings, making document-type filtering unreliable (e.g., a query for `type = "ID"` would miss documents stored as `"id"` or `"National ID"`). No DB constraint prevents invalid classification.
- **Fix:** Define a `DocumentType` enum and apply it to the field. If extension is needed, keep `OTHER` as a catch-all and add a `subType String?` for free-text.

### [SC-013][Medium][Schema] `AttendanceLog.punchType` and `.source` are free-text strings — no DB constraint on punch event classification
- **Model:** `AttendanceLog`
- **Field:** `punchType String`, `source String`
- **Issue:** `punchType` should be one of `IN | OUT | BREAK_IN | BREAK_OUT` and `source` one of `DEVICE | MANUAL | IMPORT | HIKVISION`. Both are plain strings. The attendance processing engine branches on these values; an unexpected value (e.g., device firmware returning `"CHECK_IN"` instead of `"IN"`) silently falls through, producing an unprocessed log that never generates an `AttendanceRecord`. This can cause ghost absences in payroll.
- **Fix:** Define `PunchType` and `AttendanceSource` enums. Change both fields to use the respective enum.

### [SC-014][Medium][Schema] `AttendanceRecord.status` is a free-text `String` — attendance status is unconstrained
- **Model:** `AttendanceRecord`
- **Field:** `status String @default("PRESENT")`
- **Issue:** Valid values noted in the comment are `PRESENT | ABSENT | HALF_DAY | HOLIDAY | LEAVE`, but the field is a plain `String`. Payroll processing logic and leave integration branch on this value. Any spelling variation or future value added by a developer without updating all branch sites will produce silent incorrect behavior.
- **Fix:** Define an `AttendanceStatus` enum and apply it to the field.

### [SC-015][Medium][Schema] `LeavePolicy.leaveType` and `LeaveBalance.leaveType` are free-text strings — leave type taxonomy is unconstrained across three tables
- **Model:** `LeavePolicy`, `LeaveBalance`, `LeaveRecord`, `LeaveRequest`
- **Field:** `leaveType String` (all four models)
- **Issue:** All four leave models store leave type as a plain `String`. The `@@unique([companyId, leaveType])` on `LeavePolicy` provides some protection, but `LeaveBalance`, `LeaveRecord`, and `LeaveRequest` have no such constraint. A `LeaveRequest` created with `type = "annual"` (lowercase) will not match a `LeavePolicy` with `leaveType = "ANNUAL"`, causing the policy lookup to fail silently and skip accrual or entitlement validation.
- **Fix:** Define a `LeaveType` enum covering `ANNUAL`, `SICK`, `MATERNITY`, `PATERNITY`, `UNPAID`, `STUDY`, `COMPASSIONATE`, `OTHER`. Use it on all four models. For `OTHER`, add an optional `leaveTypeCustom String?` for extensibility.

### [SC-016][Medium][Schema] `LeaveEncashment.status` is a free-text `String` — encashment workflow state is unconstrained
- **Model:** `LeaveEncashment`
- **Field:** `status String @default("PENDING")`
- **Issue:** Valid values are `PENDING | APPROVED | PROCESSED | REJECTED` but the field is a plain `String`. No DB constraint prevents invalid state transitions or typos. The payroll integration reads this field to decide whether to include the encashment amount in a payroll run; an invalid status silently skips the encashment.
- **Fix:** Define an `EncashmentStatus` enum and apply it to the field. This also makes the `LeaveStatus` enum (already defined for `LeaveRecord`/`LeaveRequest`) a candidate for reuse if the status values are aligned.

### [SC-017][Medium][Schema] `TransactionCode.calculationType` is a free-text `String` — calculation engine branches on this without DB validation
- **Model:** `TransactionCode`
- **Field:** `calculationType String @default("fixed")`
- **Issue:** The payroll calculation engine branches on `calculationType` being one of `"fixed" | "percentage" | "formula"`. This is a plain `String`. A value saved with mixed case (`"Fixed"`) or a typo (`"percentge"`) bypasses all branching, defaulting to zero or throwing an unhandled error at payroll run time. The incorrect value would not be caught until a payroll run is processed.
- **Fix:** Define a `CalculationType` enum (`FIXED`, `PERCENTAGE`, `FORMULA`) and migrate the field. Update the engine to use enum comparison.

### [SC-018][Medium][Schema] `PayrollCore` has no `@@index` on `(companyId, employeeId)` — bank export queries will full-scan the table
- **Model:** `PayrollCore`
- **Field:** `companyId`, `employeeId`
- **Issue:** `PayrollCore` is used for bank export generation and currency configuration snapshots. There are no indexes on this model at all. Bank export routes filter by `companyId` and optionally `employeeId`. Without an index, every bank export request performs a sequential scan of the entire `PayrollCore` table. As the platform grows and snapshot records accumulate, this becomes a progressively worse full table scan.
- **Fix:** Add `@@index([companyId])` and `@@index([employeeId])`. Consider `@@unique([companyId, employeeId])` if only one active `PayrollCore` per employee per company is the intended invariant (currently no uniqueness is enforced).

### [SC-019][Medium][Schema] `TaxTable` has no index on `(clientId, isActive)` or `(clientId, currency, isActive)` — active tax table lookup requires a full table scan per client
- **Model:** `TaxTable`
- **Field:** `clientId`, `isActive`, `currency`
- **Issue:** Every payroll run fetches the active tax table via a query like `{ where: { clientId, isActive: true, currency } }`. The `TaxTable` model has no indexes. For a platform with many clients each maintaining multiple historical tax tables, this query scans all rows to find the single active one. At scale (50 clients × 10 historical tables each = 500 rows minimum) this is a sequential scan on every payroll calculation.
- **Fix:** Add `@@index([clientId, isActive])` and `@@index([clientId, currency, isActive])`.

### [SC-020][Medium][Schema] `TransactionCodeRule` has no index on `isActive` — rule evaluation scans all rules for a transaction code
- **Model:** `TransactionCodeRule`
- **Field:** `isActive`, `transactionCodeId`
- **Issue:** The existing `@@index([transactionCodeId])` covers the primary lookup, but rule evaluation typically also filters `isActive: true`. Without a compound index, the DB fetches all rules for a transaction code (active and inactive) and filters in memory. For codes with many historical inactive rules this grows unboundedly.
- **Fix:** Change the existing index to `@@index([transactionCodeId, isActive])` or add a separate `@@index([transactionCodeId, isActive, priority])` to also support the `orderBy: { priority }` that rule evaluation uses.

### [SC-021][Low][Schema] `TaxBracket` has no `updatedAt` — bracket changes leave no audit trail
- **Model:** `TaxBracket`
- **Field:** missing `updatedAt`
- **Issue:** `TaxBracket` has only `createdAt`. Tax brackets are mutated when a client updates their tax table. Without `updatedAt`, there is no way to determine when a bracket was last changed, breaking the audit trail for ZIMRA compliance. If a payroll was calculated with incorrect brackets, the investigation cannot determine when the bracket was edited.
- **Fix:** Add `updatedAt DateTime @updatedAt` to `TaxBracket`.

### [SC-022][Low][Schema] `LoanRepayment` — `payrollRunId` FK has no cascade — run deletion leaves repayments with stale run references
- **Model:** `LoanRepayment`
- **Field:** `payrollRunId` relation to `PayrollRun`
- **Issue:** `payrollRun PayrollRun? @relation(fields: [payrollRunId], references: [id])` has no `onDelete`. If a `DRAFT` payroll run is cancelled and deleted, any `LoanRepayment` rows already linked to it retain the stale `payrollRunId`. On the next payroll run, the repayment processor queries `where: { status: UNPAID }` (not filtered by run) and may re-process repayments that were already partially committed to the cancelled run, leading to double-deduction.
- **Fix:** Add `onDelete: SetNull` to the `payrollRun` relation on `LoanRepayment`. Add application-level logic to reset `status` back to `UNPAID` when the linked run is deleted.

### [SC-023][Low][Schema] `NecTable` and `NecGrade` have no index on `(clientId)` and `(clientId, sector)` — NEC grade lookup for payroll is unindexed at the client level
- **Model:** `NecTable`
- **Field:** `clientId`, `sector`
- **Issue:** `NecTable` has no `@@index` declarations. When the payroll engine resolves a `NEC_GRADE` employee's rate, it queries `NecTable` filtered by `clientId` and `sector`. Without an index, this is a full table scan. As clients build up historical NEC tables per sector, this degrades.
- **Fix:** Add `@@index([clientId])` and `@@index([clientId, sector])` to `NecTable`.

### [SC-024][Low][Schema] `Employee` model has 55+ fields — candidate for decomposition into sub-tables
- **Model:** `Employee`
- **Field:** multiple field groups
- **Issue:** The `Employee` model has approximately 55 columns spanning personal data, employment data, pay configuration, tax configuration, and split-currency configuration. This violates the single-responsibility principle at the schema level. SELECT * on `Employee` (which occurs in several routes without a `select`) hydrates all 55 columns including tax directives, ZIMRA TIN, motor vehicle benefit details, and bank account fragments — many of which are only needed in specific contexts. Wide rows also increase the cost of index scans on the table.
- **Fix:** Consider extracting into related sub-tables: `EmployeeTaxConfig` (all `tax*` fields, `tin`, `accumulativeSetting`), `EmployeePayConfig` (`baseRate`, `currency`, `paymentBasis`, `splitZig*`, `motorVehicle*`), and `EmployeePersonalInfo` (`dateOfBirth`, `gender`, `nationality`, `nationalId`, `passportNumber`, `nextOfKin*`). Keep only the most-queried operational fields (`companyId`, `employeeCode`, `firstName`, `lastName`, `position`, `employmentType`, `startDate`, `dischargeDate`) on the core `Employee` table. This is a large migration; prioritise adding `select` clauses to all routes as an interim fix.

