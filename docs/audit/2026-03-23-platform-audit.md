# Bantu Platform Audit Report
**Date:** 2026-03-23
**Status:** IN PROGRESS
**Sweep target:** 191
**Files reviewed:** 9

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
