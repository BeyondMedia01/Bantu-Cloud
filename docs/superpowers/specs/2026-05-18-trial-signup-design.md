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

---

## Backend

### New endpoint: `POST /api/auth/trial-signup`

Public route (no auth required). Accepts:

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
1. Validate input (Zod or manual checks)
2. Check email not already registered
3. Create `Client` record (using `companyName` as the client name)
4. Create `Trial` record: `expiresAt = now + 30 days`, `employeeCap = 10`, `status = ACTIVE`
5. Hash password with bcrypt
6. Create `User` with role `CLIENT_ADMIN` linked to the new `clientId`
7. Sign JWT (`userId`, `clientId`, `role`)
8. Return `{ token, user: { firstName, lastName, email }, requiresOnboarding: true }`

Error responses:
- `409` if email already exists
- `400` for validation failures

### New middleware: `trialGuard`

Location: `backend/middleware/trialGuard.js`

- Runs after `auth.js` and `companyContext.js` on all protected routes
- Queries `Trial` for `req.clientId`
- If no trial record: passes through (paid accounts)
- If trial active and within cap: passes through
- If trial expired and method is `GET`/`HEAD`: passes through (read-only)
- If trial expired and method is `POST`/`PUT`/`PATCH`/`DELETE`: returns `403 { trialExpired: true, message: "Your trial has ended. Upgrade to continue." }`
- Sets `req.trial` on the request object for downstream use

### Employee cap enforcement

In `POST /api/employees` (or in `trialGuard`):
- If `req.trial` exists and status is `ACTIVE`, count employees for `clientId`
- If count >= `employeeCap`, return `403 { trialCapReached: true, message: "Trial limit of 10 employees reached." }`

### New endpoints: Trial management

**`GET /api/trial/status`** (auth required)
Returns:
```json
{
  "status": "ACTIVE",
  "expiresAt": "2026-06-17T...",
  "daysRemaining": 28,
  "onboardingStep": 0,
  "employeeCap": 10
}
```

**`PATCH /api/trial/onboarding-step`** (auth required)
Body: `{ "step": 1 }` — advances `Trial.onboardingStep`. Only allows incrementing (prevents step regression).

**`POST /api/trial/upgrade-request`** (auth required)
Body: `{ "name": "string", "message": "string" }`
- Sends email to configured `UPGRADE_CONTACT_EMAIL` env var
- Returns `200 { sent: true }`

---

## Frontend

### New pages

**`/onboarding`** (`pages/Onboarding.tsx`)
- Protected route; redirects to `/dashboard` if `onboardingStep >= 3`
- Full-page layout (no AppShell sidebar)
- 3-step wizard with progress indicator:
  1. **Company Setup** — full company details form using existing fields (name, industry, country, currency). On submit: calls existing `POST /api/company`, then `PATCH /api/trial/onboarding-step { step: 1 }`, advances to step 2.
  2. **First Employee** — simplified form: first name, last name, job title, department, employment type, salary. On submit: calls `POST /api/employees`, then `PATCH /api/trial/onboarding-step { step: 2 }`, advances to step 3.
  3. **You're all set** — informational step. Explains payroll runs. CTA: "Go to Dashboard" → sets step to 3, navigates to `/dashboard`.

**`/upgrade`** (`pages/Upgrade.tsx`)
- Accessible even when trial expired (not blocked by trialGuard)
- Shows trial summary (plan, expiry date)
- Contact form: name (pre-filled), email (pre-filled), message textarea
- On submit: calls `POST /api/trial/upgrade-request`
- Confirmation message shown on success

### Trial status banner

Component: `components/TrialBanner.tsx`

- Fetches `GET /api/trial/status` on mount (only if user has trial)
- Active trial: amber bar — "Your trial expires in X days." with a subtle "Upgrade" link
- Expired trial: red bar — "Your trial has ended — your data is in read-only mode." with prominent "Upgrade" button
- Rendered inside `AppShell` above the main content area
- Hidden on `/onboarding` and `/upgrade` pages

### Post-login redirect logic

In `App.tsx` (or the auth flow):
- After login, if `requiresOnboarding` is in session/response and `onboardingStep < 3`, redirect to `/onboarding`
- Store `requiresOnboarding` in sessionStorage alongside JWT

### Read-only UX

When any API call returns `403 { trialExpired: true }`:
- Show a toast: "Your trial has ended. Upgrade to continue editing."
- Axios interceptor in `frontend/src/api/` catches this globally

---

## Environment Variables

Add to `backend/.env.example`:
```
UPGRADE_CONTACT_EMAIL=bechanibeyond@gmail.com
```

---

## Out of Scope

- Stripe checkout / payment processing
- Automated trial extension
- Demo seed data
- Welcome email on signup
- Trial-to-paid conversion flow (beyond the contact form)
