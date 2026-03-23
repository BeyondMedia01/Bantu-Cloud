# Platform Audit Design
**Date (sweep start):** 2026-03-23
**Project:** Bantu Payroll & HR Platform
**Approach:** Full sweep first, then fix in severity order on a dedicated branch

---

## Overview

A full comprehensive audit of the Bantu monorepo (`/backend` + `/frontend`) covering four domains simultaneously. Two phases:

1. **Sweep phase** — Open and review every file listed in the Scope Manifest below. Catalogue every finding. Do not apply any fix. Continue until all files are checked off.
2. **Fix phase** — After the user reviews and approves the report, apply fixes in severity order on branch `audit/2026-03-23`. One commit per tier. Open a PR to `main` at the end. User merges.

---

## Scope Manifest

The sweep is complete when every entry in this manifest has been reviewed. No file may be skipped.

### Backend
All files in `backend/routes/` (enumerate at sweep start with `ls backend/routes/`)
All files in `backend/utils/` matching: `taxEngine.js`, `pdfService.js`, `intelligenceEngine.js`, `transactionCodes.js`, `holidayEngine.js`
`backend/middleware/auth.js`, `companyContext.js`, `license.js`, `permissions.js`, `validate.js`
`backend/lib/audit.js`, `prisma.js`, `mailer.js`, `systemSettings.js`, `attendanceEngine.js`, `taxTableParser.js`
`backend/prisma/schema.prisma`
`backend/index.js`

### Frontend
All `.tsx` files in `frontend/pages/` (exclude any `*.test.tsx`, `*.stories.tsx`)
All `.tsx`/`.ts` files in `frontend/components/` (exclude test and story files)
`frontend/context/`, `frontend/hooks/`, `frontend/lib/`, `frontend/utils/` — all `.ts`/`.tsx` files (exclude test and story files)

At sweep start, run: `find frontend/pages frontend/components frontend/context frontend/hooks frontend/lib frontend/utils -name "*.tsx" -o -name "*.ts" | grep -v test | grep -v stories | wc -l` and log the count. That number is the sweep completion target.

---

## Audit Domains & Checklists

### Security (Backend + Frontend)

**Sensitive route definition:** Any route that reads or writes User, Employee, Payroll, PayslipTransaction, Leave, Loan, Company, or financial data is a sensitive route and requires `authenticateToken` middleware.

- JWT: `JWT_SECRET` read from `process.env` only, never hardcoded; token includes `expiresIn`.
- Auth middleware: `authenticateToken` applied to every sensitive route (per definition above). List any missing.
- Input validation: POST/PUT handlers use `express-validator` or equivalent to validate body fields. Flag any that use raw `req.body.fieldName` without prior validation.
- Raw SQL: any use of `$queryRaw` or `$executeRaw` with template literals or string concatenation (SQL injection risk).
- CORS: `cors()` configured with an explicit `origin` array, not `*`.
- Rate limiting: `express-rate-limit` applied to all auth routes (`/login`, `/register`, `/reset-password`, `/forgot-password`).
- Sensitive data: API responses do not return `password`, `passwordHash`, JWT secrets, or full PII fields when not required.
- Frontend: auth tokens stored in `httpOnly` cookies or in-memory (React state/context), not `localStorage`.
- Frontend: `dangerouslySetInnerHTML` not used with any user-supplied data.

### Business Logic (Backend)

Reference: `backend/utils/taxEngine.js` and `backend/prisma/schema.prisma` are authoritative for implementation intent. The audit validates internal consistency. If the correct value cannot be derived from these two files alone, tag the finding `MANUAL`.

- **PAYE:** Tax band thresholds and rates are applied in correct ascending order. AIDS levy (3% of PAYE) is calculated from the PAYE result, not from gross income.
- **NSSA:** Employer contribution rate, employee contribution rate, and the monthly earnings cap are applied as defined in taxEngine.js. Both employer and employee amounts are written to the payslip.
- **NEC:** Grade/band lookup uses the correct table; verify that the correct NEC table is selected for the employee's grade.
- **Leave:** Accrual calculation uses consistent rounding (floor or round — flag if mixed). Negative leave balances handled without crashing.
- **YTD:** YTD figures accumulate correctly across consecutive pay periods. YTD resets at the tax year boundary (not calendar year).
- **Payslip:** Every field written to the PDF in `backend/utils/pdfService.js` maps to a field sourced from `PayslipTransaction` or `Payslip` records. Flag any hardcoded values or unmapped fields.

### Code Quality (Backend + Frontend)

**Backend:**
- Route files > 300 lines: list as split candidates.
- Files in `backend/utils/` that contain `router.get/post/put/delete` calls: naming violation (they are routes, not utilities).
- Async route handlers without a `try/catch` block or without calling `next(err)` on caught errors: will produce unhandled promise rejection crashes.
- Same calculation or query block appearing in 3 or more route files: flag as duplication candidate.
- Routes registered in `backend/index.js` that have no matching API call in the frontend: flag as dead routes.
- API responses using inconsistent envelope shape (e.g. mix of `{ data }`, `{ result }`, `{ employees }`, raw arrays): flag each variant.

**Frontend:**
- Components > 400 lines: list as split candidates.
- Pages or components that fetch data but render no error state: missing error boundary.
- React components with props typed as `any` or with no TypeScript interface/type: flag each.
- Data passed through 3 or more component layers as props without context or a store: flag as prop drilling.

### Performance (Backend + Frontend)

**Backend:**
- N+1: any `prisma.model.findMany()` result iterated in a loop that contains a nested `prisma.*` call. Fix: use `include` or batch with `findMany({ where: { id: { in: ids } } })`.
- Missing `select`: `findMany` or `findFirst` on Employee, Payroll, PayslipTransaction, or Company that returns all fields when only a subset is used downstream.
- Unindexed FK: any field in `schema.prisma` annotated with `@relation` or named with an `Id` suffix that has no `@@index`, `@unique`, or `@id` directive.
- Unbounded list: any GET endpoint that returns results with no `take`/`limit` applied. A finding is raised if the endpoint can return more than 500 rows in a single response with no pagination parameters.

**Frontend:**
- React Query hooks (`useQuery`, `useInfiniteQuery`) with no `staleTime` set: causes refetch on every component mount/focus. Add `staleTime: 1000 * 60` (1 minute) as default.
- Component or page imports that are not code-split with `React.lazy` when the component is > 50KB estimated bundle contribution.

---

## Findings Format

```
### [SEVERITY] Short descriptive title
- **File**: `path/to/file.js:142`
- **Domain**: Security | Business Logic | Code Quality | Performance
- **Issue**: One or two sentences explaining what is wrong and why it matters.
- **Fix**: Specific code change (before/after snippet), or precise description (one correct implementation). Use `MANUAL` tag and describe the decision needed if the correct value or approach cannot be determined from the codebase alone.
```

### Severity Definitions

| Severity | Criteria |
|---|---|
| **Critical** | Data loss risk, auth bypass, wrong tax/statutory calculation output, hardcoded secret |
| **High** | Logic error producing wrong numeric output, sensitive route missing auth, unhandled async crash path |
| **Medium** | Working but fragile, duplicated logic, missing input validation on non-auth route, inconsistent API envelope |
| **Low** | Dead import, naming violation, missing `staleTime`, minor optimisation |

---

## Items Not Auto-Fixed (MANUAL tag)

The following are logged in the report as `MANUAL` and excluded from all fix commits:
- Any business logic finding where the correct value cannot be derived from `taxEngine.js` or `schema.prisma` alone.
- Refactors of backend files > 500 lines or frontend files > 600 lines. These are documented in the report; applied only after the user explicitly approves.
- Any `schema.prisma` change that requires a Prisma migration. The migration SQL is documented in the report; the user runs it.

---

## Fix Strategy

After the user reviews and approves the report:

1. Create branch `audit/2026-03-23` from `main`.
2. Apply all **Critical** fixes → verify: `cd backend && npm test` (if tests exist) + manual: hit the affected endpoint and confirm correct output → commit: `Fix [Critical]: resolve all Critical audit findings`.
3. Apply all **High** fixes → same verification → commit: `Fix [High]: resolve all High audit findings`.
4. Apply all **Medium** fixes → verify → commit: `Fix [Medium]: resolve all Medium audit findings`.
5. Apply all **Low** fixes → verify → commit: `Fix [Low]: resolve all Low audit findings`.
6. Open a PR from `audit/2026-03-23` to `main`. User reviews and merges.

**Cross-tier file conflicts:** If a file has findings in multiple severity tiers, all findings for that file are fixed together in the highest-severity tier commit. The lower-tier entries for that file are noted as `[included in higher tier]` in the report.

**Merge conflicts:** If a tier commit conflicts with changes already on `main` (or with a prior tier), resolve the conflict manually before committing that tier. Do not skip a tier to avoid a conflict.

---

## Acceptance Criteria

**Sweep complete when:**
- Every file in the Scope Manifest has been reviewed.
- Total files reviewed equals the count logged at sweep start.
- Every finding is logged in the correct format.
- Report exists at `docs/audit/2026-03-23-platform-audit.md` with a summary table at the top listing finding counts by severity and domain.

**Fix phase complete when:**
- All non-`MANUAL` findings have a corresponding committed code change on branch `audit/2026-03-23`.
- Report updated: each fixed finding marked `[FIXED]`, each skipped finding marked `[MANUAL]` or `[DEFERRED]`.
- PR open from `audit/2026-03-23` → `main`.

---

## Output

- **Branch**: `audit/2026-03-23` (created from `main` before first fix commit)
- **Report**: `docs/audit/2026-03-23-platform-audit.md` (filename uses sweep-start date)
- **Directory**: `docs/audit/` created if it does not exist
- **Commits**: One per severity tier on `audit/2026-03-23`
- **PR**: Opened at end of fix phase; user merges to `main`
- **Review gate**: User explicitly confirms report before any fix commit is made
