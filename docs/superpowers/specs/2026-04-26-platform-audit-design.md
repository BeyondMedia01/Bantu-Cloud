# Bantu Platform Audit — Design Spec

**Date:** 2026-04-26
**Status:** Approved
**Type:** Full fresh sweep — actionable findings, feeds implementation plans

---

## Goal

A comprehensive audit of the Bantu payroll & HR platform covering both backend and frontend. The audit verifies whether March 2026 findings were actually fixed, then sweeps the entire current codebase for new issues. All Critical and High findings feed directly into an implementation plan.

---

## Scope

| Layer | Files |
|---|---|
| Backend — routes | All 40+ route files in `backend/routes/` |
| Backend — core | `backend/index.js`, `backend/middleware/`, `backend/lib/`, `backend/utils/`, `backend/services/`, `backend/jobs/`, `backend/worker.js` |
| Backend — schema | `backend/prisma/schema.prisma` |
| Frontend — pages | All ~80 pages in `frontend/src/pages/` |
| Frontend — components | `frontend/src/components/`, `frontend/src/hooks/`, `frontend/src/context/` |
| Frontend — API/auth | `frontend/src/api/client.ts`, `frontend/src/lib/auth.ts`, `frontend/src/lib/permissions.ts` |

---

## Priority Order

1. **Security** — auth gaps, unprotected routes, CORS, input validation, token handling, frontend auth enforcement
2. **Business Logic** — payroll calculation correctness, statutory compliance (ZIMRA/NSSA/NEC), multicurrency handling, leave accrual, loan interest
3. **Code Quality** — missing try/catch, error propagation, dead code, inconsistent patterns
4. **Performance** — N+1 queries, missing pagination, unindexed lookups, synchronous blocking operations

---

## March 2026 Fix Verification

As each file is read, the agent cross-references the March 2026 audit report (`docs/audit/2026-03-23-platform-audit.md`). Each prior finding marked `[FIXED]` is verified in the current code and logged with one of:

- `✅ Confirmed` — fix is present and correct
- `⚠️ Partial` — fix was applied but incomplete or only covers some cases
- `🔴 Regression` — fix was reverted or broken by subsequent changes

---

## Execution Order

1. Backend security sweep — `index.js`, all route files, `middleware/`, `lib/auth.js`, `lib/permissions.js`
2. Frontend auth/security sweep — `lib/auth.ts`, `lib/permissions.ts`, `api/client.ts`, token handling across pages
3. Business logic sweep — payroll routes, `lib/finance.js`, `utils/taxEngine.js`, `utils/payslipFormatter.js`, leave/loan/NSSA/multicurrency
4. Frontend business logic — form validation, payroll UI flows, currency display correctness
5. Code quality sweep — remaining routes and utils for missing try/catch, error handling, dead code
6. Performance sweep — Prisma queries, N+1, unindexed lookups, synchronous blocking in request handlers
7. Schema sweep — `prisma/schema.prisma` for missing indexes, wrong nullability, relation integrity

The agent writes findings to the report file incrementally as it goes — not at the end.

---

## Output

**Report file:** `docs/audit/2026-04-26-platform-audit.md`

```
# Bantu Platform Audit — 2026-04-26

## Summary Table
| Severity | Security | Business Logic | Code Quality | Performance | Total |

## March 2026 Fix Verification
| Finding | Status | Notes |

## New Findings
### [Severity][Domain] Title
- File + line
- Issue
- Fix
```

**Severity definitions:**
- **Critical** — exploitable in production now, data loss or auth bypass
- **High** — likely to cause a bug in normal use or material security risk
- **Medium** — wrong under specific conditions or degrades reliability
- **Low** — code quality / maintainability concern

---

## After the Audit

All Critical and High findings are collected into a prioritized fix list. That list feeds directly into an implementation plan via `writing-plans`. The audit report is the single source of truth — the implementation plan references finding IDs from the report.
