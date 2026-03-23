# Platform Audit Design
**Date:** 2026-03-23
**Project:** Bantu Payroll & HR Platform
**Approach:** Severity-first sweep

---

## Overview

A full comprehensive audit of the Bantu monorepo (`/backend` + `/frontend`) covering four domains simultaneously. The audit produces a prioritised findings report saved to `docs/audit/`, then applies fixes in severity order — Critical → High → Medium → Low — each tier committed separately.

---

## Scope

### Backend
- `backend/routes/` — 60+ Express route files
- `backend/utils/` — tax engine, PDF service, intelligence engine, transaction codes
- `backend/middleware/` — auth, companyContext, license, permissions, validate
- `backend/lib/` — audit, prisma client, mailer, system settings, biometric clients
- `backend/prisma/schema.prisma` — 1,036-line data model

### Frontend
- `frontend/pages/` — 50+ React/TSX page components
- `frontend/components/` — shared UI components
- `frontend/context/`, `hooks/`, `lib/`, `utils/`

---

## Audit Domains

| Domain | Focus Areas |
|---|---|
| **Security** | JWT secret hygiene, auth middleware coverage on all routes, input validation (missing express-validator), SQL injection via raw Prisma queries, CORS config, rate-limiting coverage, sensitive data in logs/responses |
| **Business Logic** | PAYE/ZIMRA band correctness, NSSA contribution caps, NEC table application, leave accrual rounding, YTD accumulation, payslip data mapping fidelity, AIDS levy calculation |
| **Code Quality** | Route files > 300 lines (split candidates), duplicated logic across routes, dead routes/unused imports, utils/ files that are actually routes (naming violations), missing async error handling, inconsistent response formats |
| **Performance** | Prisma queries inside loops (N+1), missing `select` on large model fetches, unindexed foreign keys in schema, React Query cache config, missing pagination on large list endpoints |

---

## Findings Format

Each finding in the report follows this structure:

```
### [SEVERITY] Title
- **File**: path/to/file.js:line
- **Domain**: Security | Business Logic | Code Quality | Performance
- **Issue**: What is wrong and why it matters
- **Fix**: Specific change required
```

### Severity Definitions

| Severity | Criteria |
|---|---|
| **Critical** | Data loss, auth bypass, compliance failure (wrong tax calc), secret exposure |
| **High** | Logic errors producing wrong output, missing auth on sensitive routes, unhandled async crashes |
| **Medium** | Working but fragile code, duplicate logic, missing validation on non-auth routes |
| **Low** | Style/naming violations, dead imports, minor optimisation opportunities |

---

## Fix Strategy

Fixes are applied in four tiers, each as a separate git commit:

1. **Critical** — Applied immediately after report is written
2. **High** — Applied after Critical tier is committed
3. **Medium** — Applied after High tier
4. **Low** — Applied last; large refactors flagged for user review before applying

### What Is NOT Auto-Fixed
- Business logic changes requiring a decision (flagged in report, fixed after confirmation)
- Large refactors of files > 500 lines (noted, applied only with user approval)
- Schema/migration changes (noted but not applied — too risky without migration strategy)

---

## Output

- **Report**: `docs/audit/2026-03-23-platform-audit.md`
- **Commits**: One per severity tier (Critical, High, Medium, Low)
