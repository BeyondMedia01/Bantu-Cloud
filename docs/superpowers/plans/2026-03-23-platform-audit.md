# Platform Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perform a full severity-first audit of the Bantu monorepo across Security, Business Logic, Code Quality, and Performance domains, produce a prioritised report, then fix all non-MANUAL findings in four severity-tiered commits on branch `audit/2026-03-23`.

**Architecture:** Two phases — (1) Sweep: read every file in the manifest, log every finding to `docs/audit/2026-03-23-platform-audit.md`; (2) Fix: create branch `audit/2026-03-23`, apply fixes Critical→High→Medium→Low, open PR to `main`. No fix is applied during the sweep. The user reviews and approves the report before the fix phase begins.

**Tech Stack:** Node.js, Express, Prisma (PostgreSQL/Neon), React 18, TypeScript, Vite, TailwindCSS, React Query (v5), pdfkit. Backend test runner: `vitest` (`npm test` in `backend/`).

---

## Appendix: Finding Format Reference

Use this exact format for every finding appended to the report:

```
### [SEVERITY] Short descriptive title
- **File**: `path/to/file.js:142`
- **Domain**: Security | Business Logic | Code Quality | Performance
- **Issue**: One or two sentences explaining what is wrong and why it matters.
- **Fix**: Specific code change (before/after snippet) or precise description. Add `MANUAL` tag and describe the decision needed if the correct value or approach cannot be determined from `backend/utils/taxEngine.js` or `backend/prisma/schema.prisma` alone.
```

**Severity definitions:**
- **Critical** — data loss, auth bypass, wrong tax/statutory calculation output, hardcoded secret
- **High** — logic error producing wrong numeric output, missing auth on sensitive route, unhandled async crash path
- **Medium** — fragile/duplicated code, missing input validation on non-auth route, inconsistent API envelope
- **Low** — dead import, naming violation, missing `staleTime`, minor optimisation

**MANUAL tag rule:** Any finding whose only correct fix cannot be derived from `backend/utils/taxEngine.js` or `backend/prisma/schema.prisma` alone is tagged `MANUAL`. Any finding whose fix requires a `schema.prisma` change that needs a Prisma migration is tagged `MANUAL` regardless of severity.

---

## Pre-Sweep Setup

### Task 1: Initialise report file and count sweep targets

**Files:**
- Create: `docs/audit/2026-03-23-platform-audit.md`

- [ ] **Step 1: Count all files in scope and log the target**

```bash
echo "=== Backend routes ===" && ls backend/routes/*.js | wc -l
echo "=== Backend utils ===" && find backend/utils -name "*.js" | grep -v ".test." | wc -l
echo "=== Backend middleware ===" && ls backend/middleware/*.js | wc -l
echo "=== Backend lib ===" && ls backend/lib/*.js | wc -l
echo "=== Frontend src ===" && find frontend/src -name "*.tsx" -o -name "*.ts" | grep -v node_modules | grep -v "\.test\." | grep -v "\.stories\." | wc -l
```

Sum all counts. Record this number — it is the sweep completion target. Log it at the top of the report under `**Sweep target:**`.

- [ ] **Step 2: Create the report skeleton**

```bash
mkdir -p docs/audit
```

Create `docs/audit/2026-03-23-platform-audit.md`:

```markdown
# Bantu Platform Audit Report
**Date:** 2026-03-23
**Status:** IN PROGRESS
**Sweep target:** [INSERT COUNT FROM STEP 1]
**Files reviewed:** 0

## Summary

| Severity | Security | Business Logic | Code Quality | Performance | Total |
|---|---|---|---|---|---|
| Critical | 0 | 0 | 0 | 0 | 0 |
| High | 0 | 0 | 0 | 0 | 0 |
| Medium | 0 | 0 | 0 | 0 | 0 |
| Low | 0 | 0 | 0 | 0 | 0 |
| **Total** | 0 | 0 | 0 | 0 | **0** |

*Update this table after each sweep batch.*

---

## Findings

<!-- Findings are appended below as sweep progresses -->
```

- [ ] **Step 3: Commit skeleton**

```bash
git add docs/audit/2026-03-23-platform-audit.md
git commit -m "Audit: initialise report skeleton"
```

---

## Sweep Phase — Backend Security

### Task 2: Audit auth infrastructure and middleware

**Files to read (correct paths):**
- `backend/middleware/auth.js`
- `backend/middleware/companyContext.js`
- `backend/lib/auth.js` ← separate file, may differ from middleware version
- `backend/lib/companyContext.js` ← separate file
- `backend/lib/permissions.js`
- `backend/lib/license.js`
- `backend/lib/validate.js`
- `backend/index.js`
- `backend/routes/auth.js`

**Checklist to apply to each file:**
- `JWT_SECRET` sourced from `process.env` only, never hardcoded; `expiresIn` set on `jwt.sign` call
- `authenticateToken` implementation: verifies the token, decodes it, attaches user to `req.user`, calls `next()` only on valid token — calls `next(err)` or returns 401 on invalid
- `backend/index.js`: which route groups have `authenticateToken` applied at the router level vs only per-handler? Note each explicitly.
- `backend/routes/auth.js`: is `/login` rate-limited? Is password compared with `bcrypt.compare` (not `==` or `===`)?
- CORS: what is the `origin` value — is it `*` (bad) or an explicit allowlist?
- Rate limiting: which middleware applies it, and which routes does it cover?

- [ ] **Step 1: Read and annotate each file against the checklist**

Append a finding for every checklist item that fails. Update `**Files reviewed:**` count after each file.

- [ ] **Step 2: Update the summary table**

---

### Task 3: Audit all 60 route files for auth coverage, SQL injection, validation, sensitive data

**Sensitive route definition:** Any route handler that reads or writes User, Employee, Payroll, PayslipTransaction, Leave, Loan, Company, or financial data is sensitive and MUST have `authenticateToken` applied — either on the router or the individual handler.

**Checklist per file:**
- Does the router apply `authenticateToken` globally (`router.use(authenticateToken)`) or per-handler?
- Are any handlers on this router missing `authenticateToken`?
- Does any handler use `$queryRaw` or `$executeRaw` with template literals or string interpolation? (SQL injection)
- Does any POST/PUT handler use `req.body.fieldName` directly without prior validation (no `express-validator`, no type-guard)?
- Does any response include `password`, `passwordHash`, or fields that should never be returned to the client?

Process in this exact order (highest risk first):

**Batch A — Payroll & Financial:**
`backend/routes/payroll.js`, `backend/routes/payrollCore.js`, `backend/routes/payslips.js`, `backend/routes/payslipTransactions.js`, `backend/routes/payslipSummaries.js`, `backend/routes/payslipExports.js`, `backend/routes/payrollInputs.js`, `backend/routes/payrollLogs.js`, `backend/routes/reports.js`, `backend/routes/statutoryExports.js`, `backend/routes/bankFiles.js`, `backend/routes/transactions.js`, `backend/routes/payTransactions.js`

**Batch B — Employee & HR:**
`backend/routes/employees.js`, `backend/routes/employeeTransactions.js`, `backend/routes/employeeSelf.js`, `backend/routes/leave.js`, `backend/routes/leaveBalances.js`, `backend/routes/leaveEncashments.js`, `backend/routes/leavePolicies.js`, `backend/routes/loans.js`, `backend/routes/grades.js`, `backend/routes/departments.js`, `backend/routes/branches.js`

**Batch C — Statutory & Config:**
`backend/routes/taxBands.js`, `backend/routes/taxTables.js`, `backend/routes/necTables.js`, `backend/routes/nssaContributions.js`, `backend/routes/nssaSettings.js`, `backend/routes/statutoryRates.js`, `backend/routes/currencyRates.js`, `backend/routes/transactionCodes.js`

**Batch D — Admin & System:**
`backend/routes/admin.js`, `backend/routes/companies.js`, `backend/routes/subCompanies.js`, `backend/routes/clients.js`, `backend/routes/systemSettings.js`, `backend/routes/user.js`, `backend/routes/licenses.js`, `backend/routes/licenseValidate.js`, `backend/routes/subscriptions.js`, `backend/routes/setup.js`, `backend/routes/backup.js`

**Batch E — Supporting:**
`backend/routes/attendance.js`, `backend/routes/biometric.js`, `backend/routes/devices.js`, `backend/routes/roster.js`, `backend/routes/shifts.js`, `backend/routes/documents.js`, `backend/routes/dashboard.js`, `backend/routes/intelligence.js`, `backend/routes/auditLogs.js`, `backend/routes/publicHolidays.js`, `backend/routes/payrollCalendar.js`, `backend/routes/payrollUsers.js`, `backend/routes/payIncrease.js`, `backend/routes/backPay.js`, `backend/routes/periodEnd.js`, `backend/routes/webhooks.js`

- [ ] **Step 1: Read Batch A — Payroll & Financial**

Read each file. For every checklist item that fails, append a finding. Increment `**Files reviewed:**` count after each file. Update summary table.

- [ ] **Step 2: Read Batch B — Employee & HR**

Same process.

- [ ] **Step 3: Read Batch C — Statutory & Config**

Same process.

- [ ] **Step 4: Read Batch D — Admin & System**

Same process.

- [ ] **Step 5: Read Batch E — Supporting**

Same process.

---

## Sweep Phase — Business Logic

### Task 4: Audit tax engine and payroll calculation logic

**Files to read:**
- `backend/utils/taxEngine.js`
- `backend/utils/ytdCalculator.js`
- `backend/utils/transactionCodes.js`
- `backend/routes/payrollCore.js`
- `backend/routes/payroll.js`

**Checklist:**
- **PAYE:** Are tax bands applied in ascending order (lowest threshold first)? Is AIDS levy calculated as `paye * 0.03` — NOT `grossIncome * 0.03`? Is AIDS levy added to PAYE after the band calculation completes?
- **NSSA:** Are employer rate, employee rate, and monthly earnings cap read from config/DB or hardcoded? If hardcoded, tag the finding `MANUAL` (correct statutory value cannot be verified from code alone).
- **NEC:** Does the NEC lookup receive the correct grade identifier? Is the correct NEC table variant selected for the employee's grade?
- **Rounding:** Are `Math.round`, `Math.floor`, and `Math.ceil` used consistently across PAYE, NSSA, and NEC — or mixed? Mixed rounding is a Medium finding.
- **YTD:** In `ytdCalculator.js`: does YTD accumulate per tax year or calendar year? What is the boundary/reset condition? Verify the boundary is a tax year start, not January 1st.
- **payrollCore.js / payroll.js:** Do the arguments passed to the tax engine match the parameter order and types the engine expects?

- [ ] **Step 1: Read taxEngine.js — trace full PAYE, AIDS levy, NSSA, NEC calculation paths**

Log any deviation from the checklist as a finding with severity:
- Wrong AIDS levy base = Critical
- Wrong NSSA application = High (tag MANUAL if correct value unknown)
- Mixed rounding = Medium

- [ ] **Step 2: Read ytdCalculator.js — verify YTD boundary**

- [ ] **Step 3: Read payrollCore.js and payroll.js — verify arguments passed to tax engine**

- [ ] **Step 4: Update summary table and increment file count**

---

### Task 5: Audit payslip data mapping and leave logic

**Files to read:**
- `backend/utils/pdfService.js`
- `backend/utils/payslipFormatter.js`
- `backend/routes/payslips.js`
- `backend/routes/payslipTransactions.js`
- `backend/routes/leave.js`
- `backend/routes/leaveBalances.js`

**Checklist:**
- **Payslip mapping:** List every field written to the PDF in `pdfService.js` and `payslipFormatter.js`. For each field, confirm the data source is a column from `Payslip` or `PayslipTransaction` — not a hardcoded value or a variable that may be `undefined`. A field that could be `undefined` at runtime is a High finding.
- **Leave accrual:** Is the rounding method consistent throughout (`Math.floor` everywhere, or mixed)? Does a negative leave balance produce an unhandled error, or is it capped at 0?

- [ ] **Step 1: Read pdfService.js and payslipFormatter.js — map every field to its data source**

For each field written to the PDF:
- If sourced from a DB record: note which model and column
- If hardcoded: High finding
- If potentially `undefined` (e.g. optional field not guarded): High finding

- [ ] **Step 2: Read leave.js and leaveBalances.js — verify accrual rounding and negative balance handling**

- [ ] **Step 3: Update summary table and increment file count**

---

## Sweep Phase — Code Quality

### Task 6: Audit backend route files for size, async errors, duplication, and envelopes

**Files:** Use the same 60 files already read in Task 3 — no need to re-open them. Use notes from that sweep. For files not fully analysed in Task 3, open them now.

**Additional files to read:**
- `backend/lib/hikvisionClient.js`
- `backend/lib/zktecoClient.js`
- `backend/lib/jobProcessor.js`
- `backend/lib/attendanceEngine.js`

**Checklist:**
- Route file line count > 300: flag as split candidate (Medium)
- Any `async (req, res) =>` handler not wrapped in `try/catch` with `next(err)` in the catch block: High
- Same calculation or identical query block appearing verbatim in 3+ route files: Medium
- Routes registered in `backend/index.js` with no corresponding fetch/axios call in `frontend/src/api/client.ts` or any page file: flag as dead route candidate (Low)
- API response envelope: note each unique shape used. More than two distinct shapes = Medium finding per variant

- [ ] **Step 1: Check line counts for all route and lib files**

```bash
wc -l backend/routes/*.js backend/lib/*.js | sort -rn | head -25
```

Flag any route file over 300 lines and any lib file over 400 lines.

- [ ] **Step 2: Grep for async handlers potentially missing try/catch**

```bash
grep -rn "async (req, res)" backend/routes/ | wc -l
grep -rn "try {" backend/routes/ | wc -l
```

If the async handler count significantly exceeds the try-catch count, open the files with the highest discrepancy. Spot-check five of the largest route files by reading them fully.

- [ ] **Step 3: Check for misplaced route logic in backend/utils/**

```bash
grep -l "router\." backend/utils/*.js 2>/dev/null
```

Any match = naming violation (Low).

- [ ] **Step 4: Check response envelope consistency**

```bash
grep -n "res\.json(" backend/routes/*.js | head -50
```

Note the shapes: `{ data }`, `{ employees }`, raw array, etc. If more than two distinct shapes are used across routes, log a Medium finding.

- [ ] **Step 5: Read hikvisionClient.js, zktecoClient.js, jobProcessor.js, attendanceEngine.js**

Apply the async error handling and code quality checklist to these files.

- [ ] **Step 6: Log all findings, update summary table, increment file count**

---

### Task 7: Audit frontend pages, components, hooks, and utilities

**Files to read:** All `.tsx` and `.ts` files under `frontend/src/` (excluding `*.test.*` and `*.stories.*`).

When reading `frontend/src/components/`, recurse into all subdirectories: `common/`, `dashboard/`, `employees/`, `tax/`, and any others present. Process every file returned by the find command — do not skip subdirectory files.

**Checklist:**
- Component/page file line count > 400: flag as split candidate (Low)
- Page that calls `useQuery` or `useInfiniteQuery` but has no `if (isError)` / `if (error)` render branch: Medium
- Props typed as `any` or component with no TypeScript `interface`/`type` for its props: Medium
- Data passed through 3+ component layers as props without going through a context or store: Medium
- `localStorage.setItem` or `localStorage.getItem` used with a key containing `token`, `jwt`, or `auth`: Critical
- `dangerouslySetInnerHTML` assigned a variable (not a static string): High

- [ ] **Step 1: Check frontend file sizes**

```bash
find frontend/src -name "*.tsx" | grep -v node_modules | xargs wc -l 2>/dev/null | sort -rn | head -20
```

Flag all files over 400 lines.

- [ ] **Step 2: Grep for token storage in localStorage**

```bash
grep -rn "localStorage" frontend/src/ | grep -i "token\|jwt\|auth"
```

- [ ] **Step 3: Grep for dangerouslySetInnerHTML**

```bash
grep -rn "dangerouslySetInnerHTML" frontend/src/
```

For each match, read the surrounding lines to confirm the value is a variable (not a static string). Log a High finding if it is dynamic.

- [ ] **Step 4: Read all page files — check for missing error states**

Priority order: `Payroll.tsx`, `PayrollCore.tsx`, `Employees.tsx`, `Reports.tsx`, `Payslips.tsx`, `Leave.tsx`, `Loans.tsx`, then all remaining pages.

For each page: does it call `useQuery`? If yes, does it render an error message when `isError` is true? If no error state: log a Medium finding.

- [ ] **Step 5: Grep for untyped props**

```bash
grep -rn ": any" frontend/src/ | grep -v "node_modules" | grep -v "\.test\."
```

For each match, confirm the context is a prop type (not a third-party or intentional cast). Log Medium finding per component.

- [ ] **Step 6: Read frontend/src/api/client.ts and frontend/src/context/**

Check: are tokens stored in context/memory (good) or localStorage (Critical)?

- [ ] **Step 7: Log all findings, update summary table, increment file count**

---

## Sweep Phase — Performance

### Task 8: Audit backend for N+1, missing select, unindexed FKs, pagination

**Files:**
- `backend/prisma/schema.prisma`
- Use notes from Task 3 route file readings; re-read payroll, employees, reports routes if needed.

**Checklist:**
- N+1: `findMany` result iterated in a loop containing a nested `prisma.*` call inside the loop body (High)
- Missing `select`: `findMany` or `findFirst` on `Employee`, `Payroll`, `PayslipTransaction`, or `Company` with no `select` clause (Medium)
- Unindexed FK: field ending in `Id` or annotated with `@relation` in `schema.prisma` with no `@@index`, `@unique`, or `@id` directive on it (Medium — tag MANUAL as it requires a migration)
- Unbounded list: GET handler returning `findMany` with no `take`, `skip`, or pagination parameter, where the table could contain > 500 rows (Medium)

- [ ] **Step 1: Grep for N+1 patterns**

```bash
grep -n "\.forEach\|for (" backend/routes/*.js | grep -v "//"
```

For files with loop constructs, open those files and check whether a prisma call appears inside the loop body.

- [ ] **Step 2: Grep for findMany without select on large models**

```bash
grep -n "findMany\|findFirst" backend/routes/*.js backend/utils/*.js | grep -v "select:"
```

For each match, read the surrounding 10 lines to confirm no `select` clause follows. Log a Medium finding for each confirmed miss on a large model.

- [ ] **Step 3: Audit schema.prisma for unindexed FK fields**

Read `backend/prisma/schema.prisma`. For each model, list all `*Id` fields. Check whether each has a corresponding `@@index([fieldName])` in the same model block. Log a Medium/MANUAL finding for each unindexed FK.

- [ ] **Step 4: Grep for unbounded findMany**

```bash
grep -n "findMany" backend/routes/*.js | grep -v "take:\|skip:\|cursor:\|pagination"
```

For each match, read the handler to confirm no pagination is applied anywhere. Log a Medium finding if the endpoint can return > 500 rows.

- [ ] **Step 5: Update summary table, increment file count**

---

### Task 9: Audit frontend React Query config and lazy loading

**Files to read:** All files in `frontend/src/` containing `useQuery` or `useInfiniteQuery`.

- [ ] **Step 1: Find all useQuery calls missing staleTime**

```bash
grep -rn "useQuery\|useInfiniteQuery" frontend/src/ | grep -v node_modules
```

For each match, read the options object passed to the hook. If no `staleTime` property is present, log a Low finding with the file and line number. The fix is: `staleTime: 1000 * 60`.

- [ ] **Step 2: Check App.tsx for lazy loading**

Read `frontend/src/App.tsx`. List all page component imports. For each page previously flagged as > 400 lines, check whether it is imported with `React.lazy(() => import(...))`. If not, log a Low finding.

- [ ] **Step 3: Update summary table, increment file count**

---

### Task 10: Finalise report and get user approval

- [ ] **Step 1: Cross-tier annotation check**

For every file that appears in more than one severity section of the report: confirm the lower-severity entries are annotated with `[included in higher tier — see [SEVERITY] finding above]` before proceeding.

- [ ] **Step 2: Update the summary table with final counts**

Count every finding by severity × domain. Update the summary table in the report. Confirm the numbers are accurate.

- [ ] **Step 3: Verify file count**

The `**Files reviewed:**` counter in the report header should equal (or closely approximate) the sweep target logged in Task 1 Step 1. If the gap is > 5 files, identify which files were missed and read them now.

- [ ] **Step 4: Mark report status as SWEEP COMPLETE**

Change `**Status:** IN PROGRESS` → `**Status:** SWEEP COMPLETE — AWAITING REVIEW`.

- [ ] **Step 5: Commit the completed report**

```bash
git add docs/audit/2026-03-23-platform-audit.md
git commit -m "Audit: complete sweep — report ready for review"
```

- [ ] **Step 6: Present findings summary to user**

Output the completed summary table and total finding count. Tell the user: "Full report is at `docs/audit/2026-03-23-platform-audit.md`. Please review it and reply to confirm before the fix phase begins."

**Do not proceed to Task 11 until the user explicitly replies with approval.**

---

## Fix Phase

> **Gate:** Begin ONLY after user explicitly approves the report in Task 10 Step 6.

### Task 11: Create fix branch

- [ ] **Step 1: Check if branch already exists**

```bash
git branch --list audit/2026-03-23
```

- If the branch exists locally: `git checkout audit/2026-03-23`
- If the branch does not exist: `git checkout -b audit/2026-03-23`
- If the branch exists on the remote but not locally: `git checkout -b audit/2026-03-23 origin/audit/2026-03-23`

---

### Task 12: Apply all Critical fixes

- [ ] **Step 1: List all Critical findings**

Read the report. Extract every finding tagged `[Critical]` that is NOT tagged `MANUAL`. Confirm the fix for each is a concrete, unambiguous code change.

- [ ] **Step 2: Apply each Critical fix**

For each finding:
- Open the file at the stated path and line
- Apply the fix exactly as described in the finding
- Change no code outside the scope of that fix

- [ ] **Step 3: Run tests**

```bash
cd backend && npm test
```

If tests fail, investigate and fix the regression before proceeding. If no tests exist for the changed file, note this.

- [ ] **Step 4: Spot-check auth fixes**

For any Critical finding involving missing auth: confirm the route now returns 401 when called without a `Authorization` header. Use curl if a local server can be started:

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:5005/[affected-route]
# Expected: 401
```

If the server cannot be started, note this and skip the curl check.

- [ ] **Step 5: Update report — mark each Critical finding as `[FIXED]`**

- [ ] **Step 6: Commit**

```bash
git add -p
git commit -m "Fix [Critical]: resolve all Critical audit findings"
```

---

### Task 13: Apply all High fixes

- [ ] **Step 1: List all High findings not tagged MANUAL**

- [ ] **Step 2: Apply each High fix**

Same process as Task 12 Step 2. If a High finding is in a file that already had a Critical fix applied, verify the Critical fix is still intact after applying the High fix.

- [ ] **Step 3: Run tests**

```bash
cd backend && npm test
```

Investigate and fix any new failures.

- [ ] **Step 4: Update report — mark each High finding as `[FIXED]`**

- [ ] **Step 5: Commit**

```bash
git add -p
git commit -m "Fix [High]: resolve all High audit findings"
```

---

### Task 14: Apply all Medium fixes

Medium fixes include: input validation additions (`express-validator`), response envelope standardisation, duplication extractions, React error state additions.

- [ ] **Step 1: List all Medium findings not tagged MANUAL**

- [ ] **Step 2: Apply each Medium fix**

**For duplication fixes:** extract the shared logic into a new helper function in `backend/lib/`. Choose a filename that reflects the responsibility (e.g. `backend/lib/payrollHelpers.js`). Update all call sites. Do not place the helper in `backend/utils/` unless it already exists there with a matching responsibility.

**For React error state fixes:** add an `if (isError) return <div>Error: {error?.message}</div>` (or whatever error component pattern is already used in the codebase) above the main render. Check `frontend/src/components/common/` for an existing error component first.

**For response envelope fixes:** if standardising to `{ data: [...] }` would be a breaking change (frontend currently reads `res.employees` etc.), note it as MANUAL instead of applying it — changing envelopes requires simultaneous frontend+backend changes.

- [ ] **Step 3: Run tests**

```bash
cd backend && npm test
```

- [ ] **Step 4: Update report — mark each Medium finding as `[FIXED]`**

- [ ] **Step 5: Commit**

```bash
git add -p
git commit -m "Fix [Medium]: resolve all Medium audit findings"
```

---

### Task 15: Apply all Low fixes

- [ ] **Step 1: List all Low findings not tagged MANUAL**

- [ ] **Step 2: Apply staleTime additions**

For each `useQuery` / `useInfiniteQuery` call missing `staleTime`, add `staleTime: 1000 * 60` to the options object. Example:

```ts
// Before
const { data } = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees })

// After
const { data } = useQuery({ queryKey: ['employees'], queryFn: fetchEmployees, staleTime: 1000 * 60 })
```

- [ ] **Step 3: Remove dead imports**

For each file flagged with dead imports, remove only the unused import line. Do not change any other code.

- [ ] **Step 4: Handle naming violations (utils/ files that contain router calls)**

Do NOT move these files — moving requires updating all imports and is a separate refactor. Instead, add this comment on line 1 of each violating file:

```js
// TODO [audit]: This file belongs in backend/routes/ — move in a dedicated refactor (see audit report)
```

Then log the item as `[DEFERRED]` in the report.

- [ ] **Step 5: Update report — mark Low findings as `[FIXED]` or `[DEFERRED]`**

- [ ] **Step 6: Commit**

```bash
git add -p
git commit -m "Fix [Low]: resolve all Low audit findings"
```

---

### Task 16: Open PR

- [ ] **Step 1: Push the audit branch**

```bash
git push -u origin audit/2026-03-23
```

- [ ] **Step 2: Open PR**

```bash
gh pr create \
  --title "Audit: platform security, quality, and performance fixes" \
  --body "$(cat <<'EOF'
## Platform Audit — 2026-03-23

Full severity-first audit of Bantu monorepo across Security, Business Logic, Code Quality, and Performance.

Full report: [docs/audit/2026-03-23-platform-audit.md](docs/audit/2026-03-23-platform-audit.md)

## Commits
- Fix [Critical]: resolve all Critical audit findings
- Fix [High]: resolve all High audit findings
- Fix [Medium]: resolve all Medium audit findings
- Fix [Low]: resolve all Low audit findings

## MANUAL items (not in this PR)
See report for findings tagged MANUAL — these require a decision or a Prisma migration before patching.

## Test plan
- [ ] Run `cd backend && npm test` — all tests pass
- [ ] Confirm all sensitive routes return 401 without a valid token
- [ ] Test payroll calculation end-to-end for at least one employee
- [ ] Confirm payslip PDF downloads correctly
- [ ] Confirm no regressions on login, reports, and leave pages

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Share the PR URL with the user**

Output: "PR opened: [URL]. MANUAL items remaining in report require your decision before they can be patched."
