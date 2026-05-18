# Trial Signup & Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement self-serve trial signups with a 30-day/10-employee cap, guided onboarding, read-only enforcement on expiry, and an upgrade contact form.

**Architecture:** A `Trial` Prisma model tracks expiry and onboarding progress per client. A `trialGuard` middleware enforces read-only on expiry. The frontend has a full-page `/trial-onboarding` wizard (note: `/onboarding` is already taken by the existing Onboarding feature at App.tsx:281) and a `TrialBanner` shown across the app.

**Tech Stack:** Node.js/Express, Prisma/PostgreSQL, React/TypeScript, TanStack React Query, React Hook Form + Zod, shadcn/ui, Tailwind v4, nodemailer (already configured in `backend/lib/mailer.js`)

**Spec:** `docs/superpowers/specs/2026-05-18-trial-signup-design.md`

---

## File Map

**Create:**
- `backend/middleware/trialGuard.js` — middleware that reads Trial record and blocks writes on expiry
- `backend/routes/trial.js` — GET /status, PATCH /onboarding-step, POST /upgrade-request
- `frontend/src/pages/TrialOnboarding.tsx` — full-page 3-step wizard (no AppShell)
- `frontend/src/pages/Upgrade.tsx` — contact form page for expired trial users
- `frontend/src/components/TrialBanner.tsx` — amber/red status bar shown in AppShell
- `frontend/src/api/trial.api.ts` — TrialAPI (status, advanceStep, upgradeRequest)

**Modify:**
- `backend/prisma/schema.prisma` — add Trial model + TrialStatus enum + `trial Trial?` on Client
- `backend/routes/auth.js` — add POST /trial-signup handler
- `backend/routes/employees.js` — enforce employee cap for trial accounts
- `backend/index.js` — mount trialGuard + trial routes
- `frontend/src/api/client.ts` — re-export TrialAPI
- `frontend/src/api/auth.api.ts` — update trialSignup response type
- `frontend/src/components/AppShell.tsx` — render TrialBanner
- `frontend/src/App.tsx` — add /trial-onboarding + /upgrade routes, post-login redirect logic

---

## Task 1: Schema — Add Trial model

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add TrialStatus enum and Trial model**

Find the enums section (around line 11) and add after the existing enums. Find the `Client` model (line 303) and add `trial Trial?` to its relations.

```prisma
enum TrialStatus {
  ACTIVE
  EXPIRED
  CONVERTED
}
```

```prisma
model Trial {
  id             String      @id @default(cuid())
  clientId       String      @unique
  client         Client      @relation(fields: [clientId], references: [id], onDelete: Cascade)
  expiresAt      DateTime
  employeeCap    Int         @default(10)
  status         TrialStatus @default(ACTIVE)
  onboardingStep Int         @default(0)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
}
```

Add to `Client` model relations:
```prisma
  trial           Trial?
```

- [ ] **Step 2: Run migration**

```bash
cd backend
npx prisma migrate dev --name add_trial_model
```
Expected: Migration created and applied, Prisma client regenerated.

- [ ] **Step 3: Verify**

```bash
npx prisma studio
```
Open browser at localhost:5555, confirm `Trial` table exists with correct columns.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add Trial model and TrialStatus enum to schema"
```

---

## Task 2: Backend — POST /api/auth/trial-signup

**Files:**
- Modify: `backend/routes/auth.js`

**Context:** The existing `POST /api/auth/register` route (line 62 in auth.js) creates a user from a license token. The trial signup creates its own `Client` + `Trial` + `ClientAdmin` user without a license token.

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/trial-signup.test.js`:

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  default: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    client: { create: vi.fn() },
    trial: { create: vi.fn() },
    clientAdmin: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock('../lib/auth', () => ({ signToken: vi.fn(() => 'mock-token') }));
vi.mock('bcryptjs', () => ({ default: { hash: vi.fn(async () => 'hashed') } }));

import request from 'supertest';
import express from 'express';
import authRouter from '../routes/auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('POST /api/auth/trial-signup', () => {
  it('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/api/auth/trial-signup').send({ email: 'a@b.com' });
    expect(res.status).toBe(400);
  });

  it('returns 400 for invalid email format', async () => {
    const res = await request(app).post('/api/auth/trial-signup').send({
      firstName: 'John', lastName: 'Doe', companyName: 'Acme',
      email: 'not-an-email', password: 'password123',
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for short password', async () => {
    const res = await request(app).post('/api/auth/trial-signup').send({
      firstName: 'John', lastName: 'Doe', companyName: 'Acme',
      email: 'a@b.com', password: 'short',
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx vitest run __tests__/trial-signup.test.js
```
Expected: FAIL — route not found (404).

- [ ] **Step 3: Add the trial-signup route to auth.js**

Add after the last `router.post` in `backend/routes/auth.js`, before `module.exports = router`:

```javascript
// ─── POST /api/auth/trial-signup ─────────────────────────────────────────────

router.post('/trial-signup', async (req, res) => {
  const { firstName, lastName, companyName, email, password } = req.body;

  if (!firstName || !lastName || !companyName || !email || !password) {
    return res.status(400).json({ message: 'firstName, lastName, companyName, email, and password are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters' });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ message: 'An account with this email already exists' });

    const hashedPassword = await bcrypt.hash(password, 12);

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const client = await prisma.client.create({
      data: { name: companyName.trim() },
    });

    await prisma.trial.create({
      data: {
        clientId: client.id,
        expiresAt,
        employeeCap: 10,
        status: 'ACTIVE',
        onboardingStep: 0,
      },
    });

    const user = await prisma.user.create({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`,
        email,
        password: hashedPassword,
        role: 'CLIENT_ADMIN',
        clientAdmin: { create: { clientId: client.id } },
      },
    });

    const token = signToken({ userId: user.id, clientId: client.id, role: user.role });
    const refreshToken = await rotateRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);

    return res.status(201).json({
      token,
      refreshToken,
      role: user.role,
      clientId: client.id,
      companyId: null,
      name: user.name,
      requiresOnboarding: true,
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }
    console.error('[trial-signup]', err);
    return res.status(500).json({ message: 'Failed to create trial account' });
  }
});
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && npx vitest run __tests__/trial-signup.test.js
```
Expected: PASS (3 tests passing).

- [ ] **Step 5: Commit**

```bash
git add backend/routes/auth.js backend/__tests__/trial-signup.test.js
git commit -m "feat: add POST /api/auth/trial-signup endpoint"
```

---

## Task 3: Backend — trialGuard middleware

**Files:**
- Create: `backend/middleware/trialGuard.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/trialGuard.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockTrial = { expiresAt: new Date(Date.now() + 86400000), status: 'ACTIVE', employeeCap: 10 };

vi.mock('../lib/prisma', () => ({
  default: {
    trial: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import prisma from '../lib/prisma';
import trialGuard from '../middleware/trialGuard';

function mockReqRes(method = 'GET', clientId = 'client-1', url = '/api/employees') {
  const req = { method, clientId, url, trial: null };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  return { req, res, next };
}

describe('trialGuard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes through when no trial record (paid account)', async () => {
    prisma.trial.findUnique.mockResolvedValue(null);
    const { req, res, next } = mockReqRes('POST', 'client-1');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes through GET when trial is active', async () => {
    prisma.trial.findUnique.mockResolvedValue(mockTrial);
    const { req, res, next } = mockReqRes('GET', 'client-1');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.trial).toEqual(mockTrial);
  });

  it('blocks POST when trial is expired', async () => {
    const expiredTrial = { ...mockTrial, expiresAt: new Date(Date.now() - 86400000), status: 'ACTIVE' };
    prisma.trial.findUnique.mockResolvedValue(expiredTrial);
    prisma.trial.update.mockResolvedValue({});
    const { req, res, next } = mockReqRes('POST', 'client-1');
    await trialGuard(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ trialExpired: true }));
  });

  it('allows GET when trial is expired (read-only)', async () => {
    const expiredTrial = { ...mockTrial, expiresAt: new Date(Date.now() - 86400000), status: 'ACTIVE' };
    prisma.trial.findUnique.mockResolvedValue(expiredTrial);
    prisma.trial.update.mockResolvedValue({});
    const { req, res, next } = mockReqRes('GET', 'client-1');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows POST to /api/trial/upgrade-request even when expired', async () => {
    const expiredTrial = { ...mockTrial, expiresAt: new Date(Date.now() - 86400000), status: 'ACTIVE' };
    prisma.trial.findUnique.mockResolvedValue(expiredTrial);
    prisma.trial.update.mockResolvedValue({});
    const { req, res, next } = mockReqRes('POST', 'client-1', '/api/trial/upgrade-request');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('passes through CONVERTED trial without restriction', async () => {
    const convertedTrial = { ...mockTrial, status: 'CONVERTED' };
    prisma.trial.findUnique.mockResolvedValue(convertedTrial);
    const { req, res, next } = mockReqRes('POST', 'client-1');
    await trialGuard(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx vitest run __tests__/trialGuard.test.js
```
Expected: FAIL — cannot find module `../middleware/trialGuard`.

- [ ] **Step 3: Create trialGuard.js**

Create `backend/middleware/trialGuard.js`:

```javascript
const prisma = require('../lib/prisma');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function trialGuard(req, res, next) {
  // No clientId means unauthenticated or pre-company onboarding step — pass through
  const clientId = req.clientId;
  if (!clientId) return next();

  let trial;
  try {
    trial = await prisma.trial.findUnique({ where: { clientId } });
  } catch (err) {
    console.error('[trialGuard] DB error:', err);
    return next(); // Don't block on guard failure
  }

  if (!trial) return next(); // Paid account — no trial record

  if (trial.status === 'CONVERTED') return next();

  const isExpired = new Date(trial.expiresAt) < new Date();

  if (isExpired) {
    // Lazily mark as EXPIRED in DB (fire-and-forget, don't await)
    if (trial.status !== 'EXPIRED') {
      prisma.trial.update({
        where: { clientId },
        data: { status: 'EXPIRED' },
      }).catch((err) => console.error('[trialGuard] failed to mark expired:', err));
    }

    // Allow upgrade-request even when expired.
    // When Express routes strip the /api/trial prefix, req.path === '/upgrade-request'.
    // req.url is also stripped at this point so check req.path only.
    if (req.path === '/upgrade-request') {
      req.trial = { ...trial, status: 'EXPIRED' };
      return next();
    }

    if (WRITE_METHODS.has(req.method)) {
      return res.status(403).json({
        trialExpired: true,
        message: 'Your trial has ended. Upgrade to continue.',
      });
    }
  }

  req.trial = trial;
  return next();
}

module.exports = trialGuard;
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && npx vitest run __tests__/trialGuard.test.js
```
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/middleware/trialGuard.js backend/__tests__/trialGuard.test.js
git commit -m "feat: add trialGuard middleware with read-only enforcement"
```

---

## Task 4: Backend — Trial routes

**Files:**
- Create: `backend/routes/trial.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/trial-routes.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/prisma', () => ({
  default: {
    trial: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    employee: { count: vi.fn() },
  },
}));
// Mock getTransporter to return a fake sendMail function
vi.mock('../lib/mailer', () => ({
  getTransporter: vi.fn(() => ({ sendMail: vi.fn(async () => ({ messageId: 'test' })) })),
}));

import request from 'supertest';
import express from 'express';
import trialRouter from '../routes/trial';
import prisma from '../lib/prisma';

const app = express();
app.use(express.json());
app.use((req, _res, next) => { req.clientId = 'c1'; req.userId = 'u1'; next(); });
app.use('/api/trial', trialRouter);

describe('GET /api/trial/status', () => {
  it('returns { trial: null } when no trial record exists', async () => {
    prisma.trial.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/trial/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ trial: null });
  });

  it('returns trial status with daysRemaining >= 0', async () => {
    prisma.trial.findUnique.mockResolvedValue({
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 5 * 86400000),
      onboardingStep: 1,
      employeeCap: 10,
    });
    prisma.employee.count.mockResolvedValue(3);
    const res = await request(app).get('/api/trial/status');
    expect(res.status).toBe(200);
    expect(res.body.trial.daysRemaining).toBeGreaterThanOrEqual(0);
    expect(res.body.trial.employeeCount).toBe(3);
  });
});

describe('PATCH /api/trial/onboarding-step', () => {
  it('rejects non-sequential step advances', async () => {
    prisma.trial.findUnique.mockResolvedValue({ onboardingStep: 0 });
    const res = await request(app).patch('/api/trial/onboarding-step').send({ step: 2 });
    expect(res.status).toBe(400);
  });

  it('advances step by 1', async () => {
    prisma.trial.findUnique.mockResolvedValue({ onboardingStep: 0 });
    prisma.trial.update.mockResolvedValue({ onboardingStep: 1 });
    const res = await request(app).patch('/api/trial/onboarding-step').send({ step: 1 });
    expect(res.status).toBe(200);
    expect(res.body.onboardingStep).toBe(1);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx vitest run __tests__/trial-routes.test.js
```
Expected: FAIL — module not found.

- [ ] **Step 3: Create backend/routes/trial.js**

```javascript
const express = require('express');
const prisma = require('../lib/prisma');
const { getTransporter } = require('../lib/mailer');

const router = express.Router();

// ─── GET /api/trial/status ────────────────────────────────────────────────────

router.get('/status', async (req, res) => {
  const trial = await prisma.trial.findUnique({ where: { clientId: req.clientId } });
  if (!trial) return res.json({ trial: null });

  const employeeCount = await prisma.employee.count({ where: { clientId: req.clientId } });
  const msRemaining = new Date(trial.expiresAt) - new Date();
  const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000));

  return res.json({
    trial: {
      status: trial.status,
      expiresAt: trial.expiresAt,
      daysRemaining,
      onboardingStep: trial.onboardingStep,
      employeeCap: trial.employeeCap,
      employeeCount,
    },
  });
});

// ─── PATCH /api/trial/onboarding-step ────────────────────────────────────────

router.patch('/onboarding-step', async (req, res) => {
  const { step } = req.body;
  if (typeof step !== 'number') {
    return res.status(400).json({ message: 'step must be a number' });
  }

  const trial = await prisma.trial.findUnique({ where: { clientId: req.clientId } });
  if (!trial) return res.status(404).json({ message: 'No trial found' });

  if (step !== trial.onboardingStep + 1) {
    return res.status(400).json({ message: 'Steps must advance sequentially' });
  }

  const updated = await prisma.trial.update({
    where: { clientId: req.clientId },
    data: { onboardingStep: step },
  });

  return res.json({ onboardingStep: updated.onboardingStep });
});

// ─── POST /api/trial/upgrade-request ─────────────────────────────────────────

router.post('/upgrade-request', async (req, res) => {
  const { name, message } = req.body;
  if (!name || !message) {
    return res.status(400).json({ message: 'name and message are required' });
  }

  const to = process.env.UPGRADE_CONTACT_EMAIL || 'bechanibeyond@gmail.com';

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Bantu Payroll <no-reply@bantu.io>',
      to,
      subject: `Trial Upgrade Request from ${name}`,
      text: `Name: ${name}\nUser ID: ${req.userId}\nClient ID: ${req.clientId}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family:sans-serif;max-width:500px;margin:0 auto;">
          <h2 style="color:#0f172a;">Trial Upgrade Request</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>User ID:</strong> ${req.userId}</p>
          <p><strong>Client ID:</strong> ${req.clientId}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br>')}</p>
        </div>
      `,
    });
    return res.json({ sent: true });
  } catch (err) {
    console.error('[upgrade-request] email failed:', err);
    return res.status(500).json({ error: 'Failed to send request. Please email us directly.' });
  }
});

module.exports = router;
```

Also add `getTransporter` to `backend/lib/mailer.js` exports:
```javascript
module.exports = {
  getTransporter,  // ← add this
  sendPasswordReset,
  // ...rest unchanged
};
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd backend && npx vitest run __tests__/trial-routes.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/routes/trial.js backend/__tests__/trial-routes.test.js backend/lib/mailer.js
git commit -m "feat: add trial management routes (status, onboarding-step, upgrade-request)"
```

---

## Task 5: Backend — Wire up middleware and routes + employee cap

**Files:**
- Modify: `backend/index.js`
- Modify: `backend/routes/employees.js`

- [ ] **Step 1: Mount trialGuard and trial routes in index.js**

In `backend/index.js`, after line 121 (`app.use(companyContext);`), add:

```javascript
const trialGuard = require('./middleware/trialGuard');
app.use(trialGuard);
```

After the `app.use('/api/sync', ...)` line (around line 151), add:

```javascript
app.use('/api/trial', require('./routes/trial'));
```

- [ ] **Step 2: Add employee cap check in employees route**

In `backend/routes/employees.js`, find the `router.post('/', ...)` handler. After the auth/validation checks and before the `prisma.employee.create(...)` call, add:

```javascript
  // Trial cap enforcement
  if (req.trial && req.trial.status === 'ACTIVE') {
    const count = await prisma.employee.count({ where: { clientId: req.clientId } });
    if (count >= req.trial.employeeCap) {
      return res.status(403).json({
        trialCapReached: true,
        message: `Trial limit of ${req.trial.employeeCap} employees reached. Upgrade to add more.`,
      });
    }
  }
```

- [ ] **Step 3: Add env vars to .env.example**

In `backend/.env.example`, add:
```
UPGRADE_CONTACT_EMAIL=bechanibeyond@gmail.com
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
```
(SMTP vars may already be present — only add if missing.)

- [ ] **Step 4: Verify server starts**

```bash
cd backend && npm run dev
```
Expected: Server starts on port 5005, no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/index.js backend/routes/employees.js backend/.env.example
git commit -m "feat: wire trialGuard middleware, trial routes, and employee cap enforcement"
```

---

## Task 6: Frontend — TrialAPI

**Files:**
- Create: `frontend/src/api/trial.api.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/api/auth.api.ts`

- [ ] **Step 1: Create trial.api.ts**

```typescript
import { http } from './http';

export interface TrialStatus {
  status: 'ACTIVE' | 'EXPIRED' | 'CONVERTED';
  expiresAt: string;
  daysRemaining: number;
  onboardingStep: number;
  employeeCap: number;
  employeeCount: number;
}

export interface TrialStatusResponse {
  trial: TrialStatus | null;
}

export const TrialAPI = {
  getStatus: () => http.get<TrialStatusResponse>('/trial/status'),
  advanceStep: (step: number) =>
    http.patch<{ onboardingStep: number }>('/trial/onboarding-step', { step }),
  upgradeRequest: (data: { name: string; message: string }) =>
    http.post<{ sent: boolean }>('/trial/upgrade-request', data),
};
```

- [ ] **Step 2: Re-export from client.ts**

Add to `frontend/src/api/client.ts`:
```typescript
export { TrialAPI } from './trial.api';
export type { TrialStatus, TrialStatusResponse } from './trial.api';
```

- [ ] **Step 3: Update trialSignup return type in auth.api.ts**

Change the `trialSignup` return type to match what the backend now returns:
```typescript
trialSignup: (data: { firstName: string; lastName: string; companyName: string; email: string; password: string }) =>
  http.post<{ token: string; refreshToken: string; role: string; clientId: string; companyId: string | null; name: string; requiresOnboarding: boolean }>('/auth/trial-signup', data),
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/trial.api.ts frontend/src/api/client.ts frontend/src/api/auth.api.ts
git commit -m "feat: add TrialAPI client and update trialSignup return type"
```

---

## Task 7: Frontend — TrialBanner component

**Files:**
- Create: `frontend/src/components/TrialBanner.tsx`

**Context:** The banner is rendered inside AppShell. It calls `GET /api/trial/status`. It shows amber (active) or red (expired) bar. It uses the design tokens from `index.css` (accent-green, destructive, etc.). Check existing components for style patterns — use `className` with Tailwind tokens, not inline hex colors.

- [ ] **Step 1: Create TrialBanner.tsx**

```tsx
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import { TrialAPI } from '../api/client';
import { AlertTriangle, Lock } from 'lucide-react';

const HIDDEN_PATHS = ['/onboarding', '/upgrade'];

const TrialBanner: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['trial-status'],
    queryFn: () => TrialAPI.getStatus().then(r => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (HIDDEN_PATHS.includes(location.pathname)) return null;
  if (!data?.trial) return null;

  const { trial } = data;
  const isExpired = trial.status === 'EXPIRED' || trial.daysRemaining === 0;

  if (isExpired) {
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-destructive text-sm font-medium">
          <Lock size={14} />
          <span>Your trial has ended — your data is in read-only mode.</span>
        </div>
        <button
          onClick={() => navigate('/upgrade')}
          className="text-xs font-semibold bg-destructive text-destructive-foreground px-3 py-1 rounded-full hover:bg-destructive/90 transition-colors shrink-0"
        >
          Upgrade
        </button>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center justify-between gap-4 dark:bg-amber-950/20 dark:border-amber-800/30">
      <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm font-medium">
        <AlertTriangle size={14} />
        <span>
          Trial expires in <strong>{trial.daysRemaining} day{trial.daysRemaining !== 1 ? 's' : ''}</strong>.
          {' '}
          <span className="text-muted-foreground font-normal">
            {trial.employeeCount} of {trial.employeeCap} employees used.
          </span>
        </span>
      </div>
      <button
        onClick={() => navigate('/upgrade')}
        className="text-xs font-semibold text-amber-700 dark:text-amber-400 underline underline-offset-2 hover:no-underline shrink-0"
      >
        Upgrade
      </button>
    </div>
  );
};

export default TrialBanner;
```

- [ ] **Step 2: Add TrialBanner to AppShell**

In `frontend/src/components/AppShell.tsx`, import and render TrialBanner at the top of the main content area. Find the `<main>` or content wrapper element and add the banner just inside it, before the `<Outlet />`:

```tsx
import TrialBanner from './TrialBanner';
```

Find the element that wraps `<Outlet />` and add `<TrialBanner />` before it:
```tsx
<TrialBanner />
<Outlet />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TrialBanner.tsx frontend/src/components/AppShell.tsx
git commit -m "feat: add TrialBanner component with active/expired states"
```

---

## Task 8: Frontend — TrialOnboarding page

**Files:**
- Create: `frontend/src/pages/TrialOnboarding.tsx`

**Context:**
- Full-page layout (no AppShell sidebar). Style it as a clean centered wizard.
- On mount, fetch `GET /api/trial/status`. If `onboardingStep >= 3`, redirect to `/dashboard` immediately.
- The route path is `/trial-onboarding` (not `/onboarding` — that's taken by the existing Tier 3 feature).
- Step 1 creates a Company via `POST /api/company` — check `frontend/src/api/org.api.ts` for `CompanyAPI.create()` signature.
- Step 2 creates an Employee via `POST /api/employees` — check `frontend/src/api/employees.api.ts` for `EmployeeAPI.create()` signature.
- After each step, call `TrialAPI.advanceStep(n)`.
- Use React Hook Form + Zod for validation. Use `useToast` / `showToast` for errors.
- Use the `Button` component from `components/ui/button`.

- [ ] **Step 1: Check CompanyAPI and EmployeeAPI signatures**

```bash
grep -n "create" frontend/src/api/org.api.ts | head -10
grep -n "create" frontend/src/api/employees.api.ts | head -10
```

- [ ] **Step 2: Create TrialOnboarding.tsx**

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Building2, Users, Rocket, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { CompanyAPI } from '../api/client';
import { EmployeeAPI } from '../api/client';
import { TrialAPI } from '../api/client';
import { useToast } from '../context/ToastContext';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const companySchema = z.object({
  name: z.string().min(2, 'Company name is required'),
  industry: z.string().optional(),
  country: z.string().optional(),
  defaultCurrency: z.string().default('USD'),
});

const employeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  jobTitle: z.string().optional(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'TEMPORARY', 'PART_TIME']).default('PERMANENT'),
  basicSalary: z.number({ coerce: true }).optional(),
});

type CompanyForm = z.infer<typeof companySchema>;
type EmployeeForm = z.infer<typeof employeeSchema>;

// ─── Steps config ─────────────────────────────────────────────────────────────

const steps = [
  { label: 'Company Setup', icon: Building2 },
  { label: 'First Employee', icon: Users },
  { label: "You're all set", icon: Rocket },
];

// ─── Component ────────────────────────────────────────────────────────────────

const TrialOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [step, setStep] = useState(0);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const companyForm = useForm<CompanyForm>({
    resolver: zodResolver(companySchema),
    defaultValues: { defaultCurrency: 'USD' },
  });

  const employeeForm = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: { employmentType: 'PERMANENT' },
  });

  async function handleCompanySubmit(values: CompanyForm) {
    setSaving(true);
    try {
      const res = await CompanyAPI.create(values);
      setCompanyId(res.data.id);
      await TrialAPI.advanceStep(1);
      setStep(1);
    } catch {
      showToast('Failed to create company. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleEmployeeSubmit(values: EmployeeForm) {
    if (!companyId) return;
    setSaving(true);
    try {
      await EmployeeAPI.create({ ...values, companyId });
      await TrialAPI.advanceStep(2);
      setStep(2);
    } catch {
      showToast('Failed to add employee. Please try again.', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleFinish() {
    setSaving(true);
    try {
      await TrialAPI.advanceStep(3);
    } catch {
      // Non-critical — navigate anyway
    } finally {
      setSaving(false);
      navigate('/dashboard');
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo / brand */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-navy tracking-tight">Welcome to Bantu</h1>
          <p className="text-muted-foreground text-sm mt-1">Let's get you set up in 3 quick steps.</p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const done = i < step;
            const active = i === step;
            return (
              <React.Fragment key={s.label}>
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                    done ? 'bg-accent-green border-accent-green text-white' :
                    active ? 'border-accent-green text-accent-green bg-accent-green/10' :
                    'border-border text-muted-foreground'
                  }`}>
                    {done ? <CheckCircle2 size={16} /> : <Icon size={16} />}
                  </div>
                  <span className={`text-[10px] font-semibold tracking-wide ${active ? 'text-accent-green' : 'text-muted-foreground'}`}>
                    {s.label}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 mb-5 ${i < step ? 'bg-accent-green' : 'bg-border'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">

          {/* Step 0 — Company */}
          {step === 0 && (
            <form onSubmit={companyForm.handleSubmit(handleCompanySubmit)} className="space-y-4">
              <h2 className="text-lg font-bold text-navy mb-1">Set up your company</h2>
              <p className="text-sm text-muted-foreground mb-4">Enter your company's basic details. You can update these later.</p>

              <div>
                <label className="label-section mb-1 block">Company Name *</label>
                <input {...companyForm.register('name')} className="input w-full" placeholder="Acme Corp" />
                {companyForm.formState.errors.name && (
                  <p className="text-destructive text-xs mt-1">{companyForm.formState.errors.name.message}</p>
                )}
              </div>
              <div>
                <label className="label-section mb-1 block">Industry</label>
                <input {...companyForm.register('industry')} className="input w-full" placeholder="e.g. Manufacturing" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-section mb-1 block">Country</label>
                  <input {...companyForm.register('country')} className="input w-full" placeholder="Zimbabwe" />
                </div>
                <div>
                  <label className="label-section mb-1 block">Currency</label>
                  <select {...companyForm.register('defaultCurrency')} className="input w-full">
                    <option value="USD">USD</option>
                    <option value="ZiG">ZiG</option>
                  </select>
                </div>
              </div>

              <Button type="submit" className="w-full mt-2" disabled={saving}>
                {saving ? 'Saving...' : 'Continue →'}
              </Button>
            </form>
          )}

          {/* Step 1 — Employee */}
          {step === 1 && (
            <form onSubmit={employeeForm.handleSubmit(handleEmployeeSubmit)} className="space-y-4">
              <h2 className="text-lg font-bold text-navy mb-1">Add your first employee</h2>
              <p className="text-sm text-muted-foreground mb-4">Add yourself or a colleague to test payroll.</p>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-section mb-1 block">First Name *</label>
                  <input {...employeeForm.register('firstName')} className="input w-full" />
                  {employeeForm.formState.errors.firstName && (
                    <p className="text-destructive text-xs mt-1">{employeeForm.formState.errors.firstName.message}</p>
                  )}
                </div>
                <div>
                  <label className="label-section mb-1 block">Last Name *</label>
                  <input {...employeeForm.register('lastName')} className="input w-full" />
                  {employeeForm.formState.errors.lastName && (
                    <p className="text-destructive text-xs mt-1">{employeeForm.formState.errors.lastName.message}</p>
                  )}
                </div>
              </div>
              <div>
                <label className="label-section mb-1 block">Job Title</label>
                <input {...employeeForm.register('jobTitle')} className="input w-full" placeholder="e.g. HR Manager" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-section mb-1 block">Employment Type</label>
                  <select {...employeeForm.register('employmentType')} className="input w-full">
                    <option value="PERMANENT">Permanent</option>
                    <option value="CONTRACT">Contract</option>
                    <option value="TEMPORARY">Temporary</option>
                    <option value="PART_TIME">Part-time</option>
                  </select>
                </div>
                <div>
                  <label className="label-section mb-1 block">Basic Salary (USD)</label>
                  <input {...employeeForm.register('basicSalary')} type="number" className="input w-full" placeholder="0.00" />
                </div>
              </div>

              <div className="flex gap-3 mt-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(0)} disabled={saving}>
                  Back
                </Button>
                <Button type="submit" className="flex-1" disabled={saving}>
                  {saving ? 'Saving...' : 'Continue →'}
                </Button>
              </div>
            </form>
          )}

          {/* Step 2 — Done */}
          {step === 2 && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-accent-green/10 flex items-center justify-center mx-auto">
                <Rocket size={28} className="text-accent-green" />
              </div>
              <h2 className="text-lg font-bold text-navy">You're all set!</h2>
              <p className="text-sm text-muted-foreground">
                Your company and first employee are ready. Head to the dashboard to explore Bantu or run your first payroll.
              </p>
              <div className="bg-muted/50 rounded-xl p-4 text-left space-y-2 text-sm">
                <p className="font-semibold text-navy text-xs label-section mb-2">What's next</p>
                <p>📋 Go to <strong>Payroll</strong> to create your first payroll run</p>
                <p>👥 Add more employees under <strong>People</strong></p>
                <p>📅 Configure leave policies under <strong>Leave</strong></p>
              </div>
              <Button className="w-full" onClick={handleFinish} disabled={saving}>
                {saving ? 'Loading...' : 'Go to Dashboard'}
              </Button>
            </div>
          )}

        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Your trial gives you 30 days and up to 10 employees.
        </p>
      </div>
    </div>
  );
};

export default TrialOnboarding;
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/TrialOnboarding.tsx
git commit -m "feat: add TrialOnboarding full-page wizard"
```

---

## Task 9: Frontend — Upgrade page

**Files:**
- Create: `frontend/src/pages/Upgrade.tsx`

- [ ] **Step 1: Create Upgrade.tsx**

```tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { TrialAPI } from '../api/client';
import { getUser } from '../lib/auth';
import { useToast } from '../context/ToastContext';

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  message: z.string().min(10, 'Please write at least 10 characters'),
});

type FormData = z.infer<typeof schema>;

const Upgrade: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const user = getUser();
  const [sent, setSent] = useState(false);

  const { data: trialData } = useQuery({
    queryKey: ['trial-status'],
    queryFn: () => TrialAPI.getStatus().then(r => r.data),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: user?.name || '',
    },
  });

  async function onSubmit(values: FormData) {
    try {
      await TrialAPI.upgradeRequest(values);
      setSent(true);
    } catch {
      showToast('Failed to send request. Please try again or email us directly.', 'error');
    }
  }

  const trial = trialData?.trial;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft size={14} />
          Back
        </button>

        {sent ? (
          <div className="bg-card border border-border rounded-2xl p-8 shadow-sm text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-accent-green/10 flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} className="text-accent-green" />
            </div>
            <h2 className="text-lg font-bold text-navy">Request sent!</h2>
            <p className="text-sm text-muted-foreground">
              We've received your upgrade request and will get back to you shortly.
            </p>
            <Button variant="outline" onClick={() => navigate('/dashboard')} className="w-full">
              Back to Dashboard
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
            <h1 className="text-xl font-bold text-navy mb-1">Upgrade your plan</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Get in touch and we'll help you find the right plan.
            </p>

            {trial && (
              <div className="bg-muted/50 rounded-xl p-4 mb-6 text-sm space-y-1">
                <p className="label-section mb-2">Your trial summary</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Status</span>
                  <span className={`font-semibold ${trial.status === 'EXPIRED' ? 'text-destructive' : 'text-accent-green'}`}>
                    {trial.status === 'EXPIRED' ? 'Expired' : `${trial.daysRemaining} days remaining`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employees used</span>
                  <span className="font-semibold">{trial.employeeCount} / {trial.employeeCap}</span>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <label className="label-section mb-1 block">Your Name *</label>
                <input {...register('name')} className="input w-full" />
                {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label-section mb-1 block">Message *</label>
                <textarea
                  {...register('message')}
                  rows={4}
                  className="input w-full resize-none"
                  placeholder="Tell us about your needs — number of employees, payroll frequency, etc."
                />
                {errors.message && <p className="text-destructive text-xs mt-1">{errors.message.message}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                <Send size={14} className="mr-2" />
                {isSubmitting ? 'Sending...' : 'Send Request'}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default Upgrade;
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/Upgrade.tsx
git commit -m "feat: add Upgrade contact form page"
```

---

## Task 10: Frontend — Routing and post-login redirect

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/TrialSignup.tsx` (update post-signup navigation)
- Modify: `frontend/src/pages/Login.tsx` (add post-login trial check)

- [ ] **Step 1: Add routes to App.tsx**

In `App.tsx`:

1. Add lazy imports at the top with other lazy pages:
```tsx
const TrialOnboarding = React.lazy(() => import('./pages/TrialOnboarding'));
const Upgrade = React.lazy(() => import('./pages/Upgrade'));
```

2. Add routes after `/trial-signup` public route:
```tsx
{/* Trial onboarding — requires auth, no AppShell. Uses /trial-onboarding to avoid
    conflict with the existing /onboarding route (App.tsx:281, Tier 3 feature). */}
<Route path="/trial-onboarding" element={
  <ProtectedRoute>
    <TrialOnboarding />
  </ProtectedRoute>
} />

{/* Upgrade — requires auth, no AppShell */}
<Route path="/upgrade" element={
  <ProtectedRoute>
    <Upgrade />
  </ProtectedRoute>
} />
```

- [ ] **Step 2: Update TrialSignup.tsx post-signup redirect**

In `frontend/src/pages/TrialSignup.tsx`, find the `onSubmit` handler after a successful trial signup. Replace any `navigate('/dashboard')` with `navigate('/onboarding')`.

Also store the auth data in sessionStorage (matching the existing login flow pattern). Check `frontend/src/lib/auth.ts` for `saveAuth()` or equivalent.

- [ ] **Step 3: Add post-login trial check to Login.tsx**

In `frontend/src/pages/Login.tsx`, find the successful login handler. After saving the token and navigating, add a check: if the user role is `CLIENT_ADMIN`, fetch `/api/trial/status` and if `onboardingStep < 3`, redirect to `/onboarding` instead of `/dashboard`.

Pattern:
```typescript
// After saving auth token
if (role === 'CLIENT_ADMIN') {
  try {
    const { data } = await TrialAPI.getStatus();
    if (data.trial && data.trial.onboardingStep < 3) {
      navigate('/trial-onboarding');
      return;
    }
  } catch {
    // Non-critical — proceed to dashboard
  }
}
navigate('/dashboard');
```

Import `TrialAPI` at the top: `import { TrialAPI } from '../api/client';`

- [ ] **Step 4: Run TypeScript check**

```bash
cd frontend && npm run build 2>&1 | head -50
```
Expected: No TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/TrialSignup.tsx frontend/src/pages/Login.tsx
git commit -m "feat: add trial onboarding routes and post-login redirect logic"
```

---

## Task 11: Frontend — Axios interceptor for trial errors

**Files:**
- Modify: `frontend/src/api/http.ts` (or wherever the Axios instance is configured)

- [ ] **Step 1: Find the Axios instance**

```bash
cat frontend/src/api/http.ts
```

- [ ] **Step 2: Add response interceptor for trialExpired and trialCapReached**

In the Axios response interceptor (alongside the existing 401 handler), add:

```typescript
if (error.response?.status === 403) {
  const data = error.response.data;
  if (data?.trialExpired) {
    // Toast shown by TrialBanner — just rethrow with a recognisable shape
    const err = new Error('Your trial has ended. Upgrade to continue editing.');
    (err as any).trialExpired = true;
    throw err;
  }
  if (data?.trialCapReached) {
    const err = new Error("You've reached the 10-employee trial limit. Upgrade to add more.");
    (err as any).trialCapReached = true;
    throw err;
  }
}
```

The spec requires a global toast for `trialExpired`. Use the toast utility from `context/ToastContext` — check how it's accessed outside React components (it may expose a `showToast` singleton, or you may need to emit a custom DOM event). If no singleton exists, dispatch a custom event:

```typescript
if (data?.trialExpired) {
  window.dispatchEvent(new CustomEvent('trial-expired'));
  const err = new Error('Your trial has ended. Upgrade to continue editing.');
  (err as any).trialExpired = true;
  throw err;
}
if (data?.trialCapReached) {
  window.dispatchEvent(new CustomEvent('trial-cap-reached'));
  const err = new Error("You've reached the 10-employee trial limit. Upgrade to add more.");
  (err as any).trialCapReached = true;
  throw err;
}
```

Then in `TrialBanner.tsx` (which is always mounted), listen for these events and call `showToast()`.

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run build 2>&1 | head -30
```
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/http.ts
git commit -m "feat: handle trialExpired and trialCapReached 403 errors in Axios interceptor"
```

---

## Task 12: End-to-end smoke test

- [ ] **Step 1: Start backend and frontend**

```bash
# Terminal 1
cd backend && npm run dev

# Terminal 2
cd frontend && npm run dev
```

- [ ] **Step 2: Test trial signup flow**

1. Navigate to `http://localhost:5173/trial-signup`
2. Fill in the form and submit
3. Verify redirect to `/trial-onboarding`
4. Complete Step 1 (Company Setup) — verify company created
5. Complete Step 2 (First Employee) — verify employee created
6. Click "Go to Dashboard" — verify redirect to `/dashboard`
7. Verify TrialBanner shows "Trial expires in 30 days. 1 of 10 employees used."

- [ ] **Step 3: Test expired trial (manual DB update)**

```bash
cd backend
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.trial.updateMany({ data: { expiresAt: new Date('2020-01-01') } }).then(r => { console.log(r); p.\$disconnect(); });
"
```

Refresh the app — verify red banner appears. Try adding an employee — verify 403 blocked. Verify GET requests (e.g. viewing employees) still work.

- [ ] **Step 4: Test upgrade form**

1. Click "Upgrade" button in banner
2. Fill in the contact form and submit
3. Verify success confirmation screen

- [ ] **Step 5: Final TypeScript build**

```bash
cd frontend && npm run build
```
Expected: Clean build, no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/ frontend/src/
git commit -m "test: end-to-end trial flow verified"
```
