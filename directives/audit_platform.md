# Directive: Platform Security & Quality Audit

**Goal**: Automatically scan the backend service for common security misconfigurations, code quality issues, and unhandled exceptions according to the 3-Layer Architecture rules.

**Inputs**: 
- Target directory: `backend/routes/`
- Target directory: `backend/lib/`

**Tools/Scripts to use**:
- `execution/audit_platform.py`

**Outputs**:
- A temporary markdown report generated at `.tmp/platform_audit_results.md`.

**Edge Cases**:
- Some routes might legitimately not require `authenticateToken` (e.g., public webhooks, login). The script should flag warnings that a human or orchestrator must review.
- `backend/index.js` mounts `authenticateToken` and `companyContext` before most routers. Route files may not contain auth strings directly, so future audit improvements should classify public/protected mounts from `index.js` before reporting "no auth visible" findings.
- A full platform audit should pair `execution/audit_platform.py` with verification commands: backend tests, frontend build, frontend tests, and frontend lint.
- When lint has large legacy migration debt, prefer making the lint command exit nonzero only for actionable errors while leaving `any`/React compiler migration issues visible as warnings. Record the warning count in the audit output.
