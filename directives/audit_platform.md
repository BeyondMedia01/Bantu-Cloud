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
