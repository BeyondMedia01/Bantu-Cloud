# Trial Signup & Lifecycle Design

## Goal

Enable self-serve trial signups with a 30-day / 10-employee cap, a guided onboarding flow, read-only enforcement on expiry, and an upgrade contact form.

---

## Architecture

The trial system has 4 layers:

1. **Signup** — `POST /api/auth/trial-signup` creates `Client` + `Trial` + `ClientAdmin` user, returns JWT. No `Company` created yet.
2. **Onboarding flow** — After first login, users land on `/onboarding` (3 steps: Company Setup → First Employee → Go Run Payroll). Progress tracked via `Trial.onboardingStep`.
3. **Trial enforcement** — `trialGuard` middleware checks `Trial.expiresAt` on every protected request. Expired trials: read requests pass, write requests return `403 { trialExpired: true }`.
4. **Upgrade CTA** — `/upgrade` page with a contact form. Accessible even when trial is expired.

---

## Schema Changes

Add one model to `backend/prisma/schema.prisma`:

```prisma
model Trial {
  id             String      @id @default(cuid())
  clientId       String      @unique
  client         Client      @relation(fields: [clientId], references: [id])
  expiresAt      DateTime
  employeeCap    Int         @default(10)
  status         TrialStatus @default(ACTIVE)
  onboardingStep Int         @default(0)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}

enum TrialStatus {
  ACTIVE
  EXPIRED
  CONVERTED
}
```

Add `trial Trial?` relation to the `Client` model. No changes to `LicenseToken` or any existing model.

`onboardingStep` values:
- `0` — not started
- `1` — company setup done
- `2` — first employee done
- `3` — onboarding complete

`Trial.status` is the authoritative state for conversion tracking (`CONVERTED`). For enforcement, `expiresAt` is the source of truth — the guard reads `expiresAt` at request time. The guard lazily sets `status = EXPIRED` in the DB when it first detects expiry. `CONVERTED` trials pass through the guard without restriction.

---

## Backend

### New endpoint: `POST /api/auth/trial-signup`

Public route (no auth required). Apply the existing `authLimiter` rate limiter (5 req / 15 min per IP).

Accepts:

```json
{
  "firstName": "string",
  "lastName": "string",
  "companyName": "string",
  "email": "string",
  "password": "string"
}
```

Steps:
1. Validate input (Zod: all fields required, email format, password min 8 chars)
2. Check email not already registered (application-level check)
3. Create `Client` record (using `companyName` as the client name)
4. Create `Trial` record: `expiresAt = now + 30 days`, `employeeCap = 10`, `status = ACTIVE`
5. Hash password with bcrypt
6. Create `User` with role `CLIENT_ADMIN` linked to the new `clientId`
7. Sign JWT (`userId`, `clientId`, `role`)
8. Return `{ token, user: { firstName, lastName, email }, requiresOnboarding: true }`

Error responses:
- `409` if email already exists — must explicitly catch Prisma `P2002` unique constraint error to return clean 409 (not 500)
- `400` for validation failures

### New middleware: `trialGuard`

Location: `backend/middleware/trialGuard.js`

- Runs after `auth.js` on all protected routes (does NOT require `companyContext.js` to have run — must handle `req.companyId` being null during onboarding steps 0–1)
- Queries `Trial` for `req.clientId`
- If no trial record: passes through (paid accounts)
- If `status === 'CONVERTED'`: passes through
- If trial active (`expiresAt > now`) and within cap: passes through; sets `req.trial` on the request
- If trial expired and method is `GET`/`HEAD`: passes through (read-only); lazily updates `Trial.status = EXPIRED`
- If trial expired and method is `POST`/`PUT`/`PATCH`/`DELETE`: returns `403 { trialExpired: true, message: "Your trial has ended. Upgrade to continue." }`
- Exception: `POST /api/trial/upgrade-request` is exempt from the write-block check even when expired, so users can submit the contact form

### Employee cap enforcement

In `POST /api/employees`:
- If `req.trial` exists and `status === 'ACTIVE'`, count employees for `clientId` (across all companies under the client)
- If count >= `employeeCap`, return `403 { trialCapReached: true, message: "Trial limit of 10 employees reached." }`

### New endpoints: Trial management

All under `backend/routes/trial.js`, mounted at `/api/trial`.

**`GET /api/trial/status`** (auth required)
- If no `Trial` record exists for the client (paid account): returns `200 { trial: null }`. The frontend `TrialBanner` suppresses itself on this response.
- If a trial exists, returns:
```json
{
  "trial": {
    "status": "ACTIVE",
    "expiresAt": "2026-06-17T...",
    "daysRemaining": 28,
    "onboardingStep": 0,
    "employeeCap": 10,
    "employeeCount": 3
  }
}
```
`employeeCount` = current employee count for the client (used by banner to show "X of 10 used").
`daysRemaining` = `Math.max(0, Math.ceil((expiresAt - now) / 86400000))` — clamped to 0, never negative.

**`PATCH /api/trial/onboarding-step`** (auth required)
Body: `{ "step": number }`
- Only allows `step === trial.onboardingStep + 1` (strict increment, no skipping)
- Returns `400` if step is out of sequence
- Returns updated `onboardingStep`

**`POST /api/trial/upgrade-request`** (auth required, exempt from expired-trial write-block)
Body: `{ "name": "string", "message": "string" }`
- Sends email via nodemailer to `UPGRADE_CONTACT_EMAIL`
- On email send failure: returns `500 { error: "Failed to send request. Please email us directly." }`
- On success: returns `200 { sent: true }`

---

## Frontend

### Post-login redirect logic

In `App.tsx` (or the auth flow):
- After login, fetch `GET /api/trial/status`
- If `onboardingStep < 3`, redirect to `/onboarding`
- Do NOT rely on `requiresOnboarding` flag in sessionStorage — derive redirect need from live `onboardingStep` so it survives tab closes and re-logins

### New pages

**`/onboarding`** (`pages/Onboarding.tsx`)
- Protected route; redirects to `/dashboard` if `onboardingStep >= 3`
- Full-page layout (no AppShell sidebar)
- 3-step wizard with progress indicator:
  1. **Company Setup** — full company details form (name, industry, country, currency). On submit: calls existing `POST /api/company`, then `PATCH /api/trial/onboarding-step { step: 1 }`, advances to step 2.
  2. **First Employee** — simplified form: first name, last name, job title, department, employment type, salary. On submit: calls `POST /api/employees`, then `PATCH /api/trial/onboarding-step { step: 2 }`, advances to step 3.
  3. **You're all set** — informational step. Explains payroll runs. CTA: "Go to Dashboard" → calls `PATCH /api/trial/onboarding-step { step: 3 }`, navigates to `/dashboard`.

**`/upgrade`** (`pages/Upgrade.tsx`)
- Sits behind a standard `ProtectedRoute` (valid JWT required). If the JWT itself is expired, the user is redirected to `/login` as normal.
- Not blocked by `trialGuard` — accessible even when the trial has expired
- Shows trial summary (plan, expiry date)
- Contact form: name (pre-filled from user profile), email (pre-filled), message textarea
- On submit: calls `POST /api/trial/upgrade-request`
- Confirmation message shown on success; error message shown on failure

### Trial status banner

Component: `components/TrialBanner.tsx`

- Fetches `GET /api/trial/status` on mount for all authenticated users
- If response is `{ trial: null }`, renders nothing (paid accounts)
- Active trial: amber bar — "Your trial expires in X days. (Y of 10 employees used)" with a subtle "Upgrade" link
- Expired trial: red bar — "Your trial has ended — your data is in read-only mode." with prominent "Upgrade" button
- Rendered inside `AppShell` above the main content area
- Hidden on `/onboarding` and `/upgrade` pages

### Read-only UX

When any API call returns `403 { trialExpired: true }`:
- Show a toast: "Your trial has ended. Upgrade to continue editing."
- Axios interceptor in `frontend/src/api/` catches this globally

When `403 { trialCapReached: true }`:
- Show a toast: "You've reached the 10-employee trial limit. Upgrade to add more."

---

## Environment Variables

Add to `backend/.env.example`:
```
UPGRADE_CONTACT_EMAIL=bechanibeyond@gmail.com
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```

---

## Out of Scope

- Stripe checkout / payment processing
- Automated trial extension
- Demo seed data
- Welcome email on signup
- Trial-to-paid conversion flow (beyond the contact form)
