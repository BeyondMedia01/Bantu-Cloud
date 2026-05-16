# Payroll Background Job Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `POST /api/payroll/:runId/process` off the synchronous request path onto a BullMQ-backed worker so multiple companies can run payroll concurrently without HTTP timeouts.

**Architecture:** The web server enqueues a BullMQ job and returns `202` immediately. A separate worker process (already deployed as `npm run worker` on Render) picks up jobs from Redis and runs the 1,335-line computation. The frontend polls `GET /api/payroll/:runId/status` for live progress. The existing DB-polling email worker is replaced by BullMQ in the same pass.

**Tech Stack:** BullMQ, IORedis, @bull-board/express, @bull-board/api — all new. Prisma (existing), Express (existing), Node.js CommonJS (existing).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/lib/redis.js` | **Create** | IORedis singleton — reads `REDIS_URL`, shared by web server and worker |
| `backend/queues/index.js` | **Create** | Exports `payrollQueue`, `emailQueue`, `notifyQueue` BullMQ Queue instances |
| `backend/queues/payrollWorker.js` | **Create** | BullMQ Worker for `payroll-processing` — contains extracted payroll computation |
| `backend/queues/emailWorker.js` | **Create** | BullMQ Worker for `email-dispatch` — replaces `lib/jobProcessor.js` |
| `backend/queues/notifyWorker.js` | **Create** | BullMQ Worker for `notifications` — replaces notify job type |
| `backend/admin/bullBoard.js` | **Create** | Bull Board Express router, PLATFORM_ADMIN JWT protected |
| `backend/worker.js` | **Rewrite** | Starts all three BullMQ workers, graceful SIGTERM shutdown, stale-run recovery |
| `backend/routes/payroll/process.js` | **Modify** | `POST /:runId/process` shrinks to ~40 lines; extraction of computation to payrollWorker |
| `backend/routes/payroll.js` | **Modify** | Add `GET /:runId/status` endpoint |
| `backend/prisma/schema.prisma` | **Modify** | Add `QUEUED` to enum; add `jobId`, `errorMessage`, `progress`, `employeesProcessed`, `totalEmployees` to `PayrollRun` |
| `backend/index.js` | **Modify** | Mount `/admin/queues` Bull Board router |
| `backend/package.json` | **Modify** | Add `bullmq`, `ioredis`, `@bull-board/express`, `@bull-board/api` |
| `backend/.env` | **Modify** | Add `REDIS_URL` |
| `backend/lib/jobProcessor.js` | **Delete** (end of plan) | Replaced by emailWorker.js |

---

## Task 1: Install dependencies and configure Redis

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/.env`
- Create: `backend/lib/redis.js`

- [ ] **Step 1: Install BullMQ and Bull Board**

```bash
cd backend
npm install bullmq ioredis @bull-board/express @bull-board/api
```

Expected: packages added to `node_modules` and `package-lock.json`.

- [ ] **Step 2: Add REDIS_URL to .env**

Add this line to `backend/.env`:
```
REDIS_URL=redis://localhost:6379
```

> For local development, install Redis via `brew install redis && brew services start redis` (Mac) or `docker run -d -p 6379:6379 redis:7-alpine`. For production (Render), add a Redis instance and set `REDIS_URL` from the Render dashboard.

- [ ] **Step 3: Create `backend/lib/redis.js`**

```javascript
const { Redis } = require('ioredis');

if (!process.env.REDIS_URL) {
  console.error('[Redis] REDIS_URL is not set — queue features will not work');
}

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,
});

connection.on('error', (err) => {
  console.error('[Redis] Connection error:', err.message);
});

module.exports = connection;
```

- [ ] **Step 4: Verify Redis connects**

```bash
cd backend
node -e "const r = require('./lib/redis'); r.ping().then(v => { console.log('Redis OK:', v); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```

Expected: `Redis OK: PONG`

- [ ] **Step 5: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/lib/redis.js backend/.env
git commit -m "feat: add BullMQ, IORedis, Bull Board dependencies and Redis connection"
```

---

## Task 2: Create queue definitions

**Files:**
- Create: `backend/queues/index.js`

- [ ] **Step 1: Create `backend/queues/` directory and `index.js`**

```bash
mkdir -p backend/queues
```

```javascript
// backend/queues/index.js
const { Queue } = require('bullmq');
const connection = require('../lib/redis');

const payrollQueue = new Queue('payroll-processing', {
  connection,
  defaultJobOptions: {
    attempts: 3, // 1 initial + 2 retries
    backoff: { type: 'exponential', delay: 60000 }, // 60s, 120s
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
  },
});

const emailQueue = new Queue('email-dispatch', {
  connection,
  defaultJobOptions: {
    attempts: 4, // 1 initial + 3 retries
    backoff: { type: 'fixed', delay: 30000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

const notifyQueue = new Queue('notifications', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 15000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

module.exports = { payrollQueue, emailQueue, notifyQueue };
```

- [ ] **Step 2: Smoke-test queue creation**

```bash
cd backend
node -e "const { payrollQueue } = require('./queues/index'); console.log('Queue name:', payrollQueue.name); process.exit(0);"
```

Expected: `Queue name: payroll-processing`

- [ ] **Step 3: Commit**

```bash
git add backend/queues/index.js
git commit -m "feat: create BullMQ queue definitions (payroll, email, notifications)"
```

---

## Task 3: Update Prisma schema

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add `QUEUED` to `PayrollStatus` enum**

In `schema.prisma`, find the `PayrollStatus` enum (currently around line 185) and add `QUEUED`:

```prisma
enum PayrollStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  QUEUED
  PROCESSING
  COMPLETED
  ERROR
}
```

- [ ] **Step 2: Add new fields to `PayrollRun` model**

In the `PayrollRun` model, add these fields after the `notes` field:

```prisma
  jobId              String?
  errorMessage       String?
  progress           Int     @default(0)
  employeesProcessed Int     @default(0)
  totalEmployees     Int     @default(0)
```

- [ ] **Step 3: Add `jobId` field to `PayrollLog` model**

Find the `PayrollLog` model in `schema.prisma` and add this field (it links each audit entry to the BullMQ job that produced it):

```prisma
  jobId  String?
```

Add it after any existing nullable fields so the migration is additive.

- [ ] **Step 4: Run migration**

```bash
cd backend
npx prisma migrate dev --name payroll_job_queue
```

Expected output: `✔ Generated Prisma Client` with no errors. If it asks about drift, choose to continue (the drift is pre-existing from manual schema pushes).

- [ ] **Step 5: Verify new columns exist**

```bash
cd backend
node -e "const p = require('./lib/prisma'); p.payrollRun.findFirst({ select: { jobId: true, progress: true, totalEmployees: true } }).then(r => { console.log('Schema OK:', r); process.exit(0); }).catch(e => { console.error(e); process.exit(1); })"
```

Expected: `Schema OK: null` (no runs found is fine — null means the query ran without error).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat: add QUEUED status, job tracking fields to PayrollRun, jobId to PayrollLog"
```

---

## Task 4: Create the email BullMQ worker

**Files:**
- Create: `backend/queues/emailWorker.js`

This replaces `lib/jobProcessor.js`. The logic is identical — only the wiring changes.

- [ ] **Step 1: Create `backend/queues/emailWorker.js`**

```javascript
// backend/queues/emailWorker.js
const { Worker } = require('bullmq');
const connection = require('../lib/redis');
const { payslipToBuffer } = require('../utils/payslipFormatter');
const mailer = require('../lib/mailer');

function createEmailWorker() {
  const worker = new Worker('email-dispatch', async (job) => {
    const { payslipId } = job.data;
    if (!payslipId) throw new Error('Missing payslipId in job data');

    const result = await payslipToBuffer(payslipId);
    if (!result) throw new Error(`Payslip not found: ${payslipId}`);

    if (!result.email) {
      console.warn(`[EmailWorker] Skipping payslip ${payslipId}: no email address`);
      return;
    }

    await mailer.sendPayslip(result.email, {
      employeeName: result.employeeName,
      companyName: result.companyName,
      period: result.period,
      pdfBuffer: result.buffer,
    });

    console.log(`[EmailWorker] Sent payslip ${payslipId} to ${result.email}`);
  }, {
    connection,
    concurrency: 10,
  });

  worker.on('failed', (job, err) => {
    console.error(`[EmailWorker] Job ${job?.id} failed after all retries:`, err.message);
  });

  return worker;
}

module.exports = { createEmailWorker };
```

- [ ] **Step 2: Commit**

```bash
git add backend/queues/emailWorker.js
git commit -m "feat: create BullMQ email dispatch worker (replaces DB-polling jobProcessor)"
```

---

## Task 5: Create the notifications BullMQ worker

**Files:**
- Create: `backend/queues/notifyWorker.js`

- [ ] **Step 1: Create `backend/queues/notifyWorker.js`**

```javascript
// backend/queues/notifyWorker.js
const { Worker } = require('bullmq');
const connection = require('../lib/redis');
const { runNotifications } = require('../jobs/notifications');

function createNotifyWorker() {
  const worker = new Worker('notifications', async (job) => {
    console.log('[NotifyWorker] Running notifications job');
    const sent = await runNotifications();
    console.log(`[NotifyWorker] ${sent} notification(s) sent`);
  }, {
    connection,
    concurrency: 3,
  });

  worker.on('failed', (job, err) => {
    console.error(`[NotifyWorker] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

module.exports = { createNotifyWorker };
```

- [ ] **Step 2: Commit**

```bash
git add backend/queues/notifyWorker.js
git commit -m "feat: create BullMQ notifications worker"
```

---

## Task 6: Extract payroll computation into the BullMQ payroll worker

This is the largest task. The 1,335-line `POST /:runId/process` handler body moves into `queues/payrollWorker.js` as a standalone async function.

**Files:**
- Create: `backend/queues/payrollWorker.js`
- Read first: `backend/routes/payroll/process.js` lines 155–1318

- [ ] **Step 1: Read the full process handler to understand all imports and logic**

```bash
cat -n backend/routes/payroll/process.js | sed -n '155,1318p'
```

- [ ] **Step 2: Create `backend/queues/payrollWorker.js` with the wrapper and the extracted computation**

The structure is:

```javascript
// backend/queues/payrollWorker.js
const { Worker } = require('bullmq');
const connection = require('../lib/redis');
const prisma = require('../lib/prisma');
const { emailQueue } = require('./index');

// --- Copy all imports from process.js lines 1-11 here ---
const { calculatePaye, calculateSplitSalaryPaye, grossUpNet } = require('../utils/taxEngine');
const { getSettings } = require('../lib/systemSettings');
const { audit } = require('../lib/audit');
const { getYtdStartDate } = require('../utils/ytdCalculator');
const { payslipToBuffer, buildPayslipLineItems } = require('../utils/payslipFormatter');
// (add any other imports used in the handler body)

async function processPayrollRun(job) {
  const { runId, companyId, clientId, userId } = job.data;

  // Step 1: Compensating cleanup — delete any partial writes from a prior crashed attempt
  await prisma.payrollTransaction.deleteMany({ where: { payrollRunId: runId } });
  await prisma.payslip.deleteMany({ where: { payrollRunId: runId } });

  // Step 2: Atomic claim — prevents two workers processing the same run
  const claimed = await prisma.$executeRaw`
    UPDATE "PayrollRun"
    SET status = 'PROCESSING', "updatedAt" = now()
    WHERE id = ${runId} AND status = 'QUEUED'
  `;
  if (claimed === 0) {
    throw new Error(`Run ${runId} already claimed or not in QUEUED state`);
  }
  await job.updateProgress(10);

  // Step 3–5: Paste the full body of the existing handler here.
  // Replace:
  //   req.companyId  → companyId
  //   req.clientId   → clientId
  //   req.user.userId → userId
  //   req.params.runId → runId
  //   res.json(...)  → (remove — worker returns void)
  //   res.status(...).json(...) → throw new Error(...)
  // Update progress at key milestones:
  //   after loading settings → job.updateProgress(20)
  //   after fetching employees → job.updateProgress(25); set totalEmployees
  //   after each employee batch → job.updateProgress(25 + 70 * (processed/total)); update employeesProcessed
  //
  // At the point where employees are fetched, capture count:
  //   await prisma.payrollRun.update({ where: { id: runId }, data: { totalEmployees: employees.length } });
  // After each batch write, update processed count:
  //   await prisma.payrollRun.update({ where: { id: runId }, data: { employeesProcessed: processedCount } });

  // Step 6: Enqueue email jobs BEFORE marking COMPLETED (so a crash here causes retry that re-enqueues)
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    select: { id: true },
  });
  await emailQueue.addBulk(payslips.map(p => ({
    name: 'EMAIL_PAYSLIP',
    data: { payslipId: p.id },
    opts: { jobId: `email-payslip-${p.id}` }, // deduplication key
  })));

  // Mark COMPLETED
  await prisma.payrollRun.update({
    where: { id: runId },
    data: { status: 'COMPLETED', progress: 100 },
  });

  console.log(`[PayrollWorker] runId=${runId} companyId=${companyId} completed`);
}

function createPayrollWorker() {
  const worker = new Worker('payroll-processing', processPayrollRun, {
    connection,
    concurrency: 5,
  });

  worker.on('failed', async (job, err) => {
    console.error(`[PayrollWorker] Job ${job?.id} failed after all retries:`, err.message);
    if (job?.data?.runId) {
      await prisma.payrollRun.update({
        where: { id: job.data.runId },
        data: { status: 'ERROR', errorMessage: err.message },
      }).catch(() => {});
    }
  });

  worker.on('active', (job) => {
    console.log(`[PayrollWorker] Starting runId=${job.data.runId} companyId=${job.data.companyId}`);
  });

  return worker;
}

module.exports = { createPayrollWorker };
```

- [ ] **Step 3: Perform the full extraction — move handler body into `processPayrollRun`**

Read `backend/routes/payroll/process.js` lines 155–1318 in full. Copy the entire handler body (everything between the opening `async (req, res) => {` brace and the closing `}`). Paste it into `processPayrollRun` after the claim step. Make all substitutions listed in Step 2 comments above:
- `req.companyId` → `companyId`
- `req.clientId` → `clientId`
- `req.user.userId` (or `req.user.id`) → `userId`
- `req.params.runId` → `runId`
- All `res.json(...)` calls at success → remove (worker returns void)
- All `res.status(N).json(...)` calls → `throw new Error('...')`
- Insert `job.updateProgress(N)` calls at the milestones described above

- [ ] **Step 4: Verify the worker file has no syntax errors**

```bash
cd backend
node --check queues/payrollWorker.js && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 5: Commit**

```bash
git add backend/queues/payrollWorker.js
git commit -m "feat: extract payroll computation into BullMQ payrollWorker"
```

---

## Task 7: Rewrite `backend/worker.js`

**Files:**
- Rewrite: `backend/worker.js`

- [ ] **Step 1: Replace `backend/worker.js` with the BullMQ-based version**

```javascript
// backend/worker.js
require('dotenv').config();
const prisma = require('./lib/prisma');
const { payrollQueue } = require('./queues/index');
const { createPayrollWorker } = require('./queues/payrollWorker');
const { createEmailWorker } = require('./queues/emailWorker');
const { createNotifyWorker } = require('./queues/notifyWorker');

const STALE_PROCESSING_MINUTES = 5;

async function recoverStaleRuns() {
  const staleThreshold = new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000);
  const staleRuns = await prisma.payrollRun.findMany({
    where: { status: 'PROCESSING', updatedAt: { lt: staleThreshold } },
    select: {
      id: true,
      companyId: true,
      company: { select: { clientId: true } },
    },
  });

  if (staleRuns.length === 0) return;

  console.log(`[worker] Recovering ${staleRuns.length} stale PROCESSING run(s)`);

  for (const run of staleRuns) {
    // Delete partial writes so retry starts clean
    await prisma.payrollTransaction.deleteMany({ where: { payrollRunId: run.id } });
    await prisma.payslip.deleteMany({ where: { payrollRunId: run.id } });

    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'QUEUED', progress: 0, employeesProcessed: 0 },
    });

    await payrollQueue.add('process', {
      runId: run.id,
      companyId: run.companyId,
      clientId: run.company.clientId,
      userId: null, // original user unavailable after crash — worker handles null gracefully
    }, {
      jobId: `payroll-${run.id}`,
    });

    console.log(`[worker] Re-enqueued stale run ${run.id}`);
  }
}

async function main() {
  console.log('[worker] Starting Bantu Job Worker (BullMQ)...');

  await recoverStaleRuns();

  const payrollWorker = createPayrollWorker();
  const emailWorker = createEmailWorker();
  const notifyWorker = createNotifyWorker();

  console.log('[worker] All workers started. Listening for jobs...');

  async function shutdown(signal) {
    console.log(`[worker] Received ${signal}. Shutting down gracefully...`);
    const timeout = setTimeout(() => {
      console.error('[worker] Graceful shutdown timed out. Forcing exit.');
      process.exit(1);
    }, 30000);

    await Promise.all([
      payrollWorker.close(),
      emailWorker.close(),
      notifyWorker.close(),
    ]);

    clearTimeout(timeout);
    await prisma.$disconnect();
    console.log('[worker] Shutdown complete.');
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[worker] Fatal startup error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify the worker file has no syntax errors**

```bash
cd backend
node --check worker.js && echo "Syntax OK"
```

- [ ] **Step 3: Commit**

```bash
git add backend/worker.js
git commit -m "feat: rewrite worker.js with BullMQ workers and stale-run recovery"
```

---

## Task 8: Rewrite `POST /:runId/process` to enqueue and return 202

**Files:**
- Modify: `backend/routes/payroll/process.js`

The handler currently spans lines 155–1318. After extraction in Task 6, it shrinks to ~40 lines.

- [ ] **Step 1: Replace the handler body in `backend/routes/payroll/process.js`**

Find the existing handler starting at line 155:
```javascript
router.post('/:runId/process', requirePermission('process_payroll'), async (req, res) => {
```

Replace everything from that line through its closing `});` (line ~1318) with:

```javascript
const { payrollQueue } = require('../../queues/index');

router.post('/:runId/process', requirePermission('process_payroll'), async (req, res) => {
  const { runId } = req.params;
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId, companyId: req.companyId },
      select: { id: true, status: true, companyId: true },
    });

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });
    if (run.status !== 'APPROVED') {
      return res.status(409).json({ message: `Run must be APPROVED to process (current: ${run.status})` });
    }

    const jobId = `payroll-${runId}`;

    await prisma.payrollRun.update({
      where: { id: runId },
      data: { status: 'QUEUED', jobId, progress: 0, employeesProcessed: 0, totalEmployees: 0, errorMessage: null },
    });

    await payrollQueue.add('process', {
      runId,
      companyId: req.companyId,
      clientId: req.clientId,
      userId: req.user.userId,
    }, {
      jobId, // BullMQ deduplicates — re-enqueue of same run is a no-op
    });

    res.status(202).json({ ok: true, jobId, status: 'QUEUED', message: 'Payroll run queued for processing' });
  } catch (err) {
    // If Redis is unavailable, BullMQ throws — return 503
    if (err.message?.includes('connect') || err.code === 'ECONNREFUSED') {
      return res.status(503).json({ message: 'Queue service unavailable — try again shortly' });
    }
    console.error('[Payroll] Enqueue error:', err);
    res.status(500).json({ message: 'Failed to queue payroll run' });
  }
});
```

- [ ] **Step 2: Verify no syntax errors**

```bash
cd backend
node --check routes/payroll/process.js && echo "Syntax OK"
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/payroll/process.js
git commit -m "feat: POST /process now enqueues BullMQ job and returns 202"
```

---

## Task 9: Add `GET /:runId/status` endpoint

**Files:**
- Modify: `backend/routes/payroll.js`

- [ ] **Step 1: Add the status endpoint to `backend/routes/payroll.js`**

**Critical placement:** `payroll.js` already has a `GET /:runId` handler further down in the file (around line 210). Express resolves routes in declaration order — if `GET /:runId/status` is declared *after* `GET /:runId`, requests to `/api/payroll/abc123/status` will be captured by `/:runId` and never reach the status handler.

You MUST insert the status route at the **very top of the file**, immediately after the `const router = express.Router()` and `router.use(requireModule('PAYROLL'))` lines — before all sub-router mounts and all other route handlers.

```javascript
// GET /api/payroll/:runId/status — lightweight polling endpoint for job progress
router.get('/:runId/status', async (req, res) => {
  const { runId } = req.params;
  if (!req.companyId) return res.status(400).json({ message: 'x-company-id header required' });

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId, companyId: req.companyId },
      select: {
        id: true,
        status: true,
        progress: true,
        employeesProcessed: true,
        totalEmployees: true,
        errorMessage: true,
        jobId: true,
      },
    });

    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    res.json(run);
  } catch (err) {
    console.error('[Payroll] Status error:', err);
    res.status(500).json({ message: 'Failed to fetch run status' });
  }
});
```

> **Note:** Placed at the top of the file — before all sub-router mounts and the existing `GET /:runId` handler — so Express resolves `/api/payroll/:runId/status` before matching `:runId` alone.

- [ ] **Step 2: Verify no syntax errors**

```bash
cd backend
node --check routes/payroll.js && echo "Syntax OK"
```

- [ ] **Step 3: Commit**

```bash
git add backend/routes/payroll.js
git commit -m "feat: add GET /api/payroll/:runId/status polling endpoint"
```

---

## Task 10: Add Bull Board admin UI

**Files:**
- Create: `backend/admin/bullBoard.js`
- Modify: `backend/index.js`

- [ ] **Step 1: Create `backend/admin/bullBoard.js`**

```javascript
// backend/admin/bullBoard.js
const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { payrollQueue, emailQueue, notifyQueue } = require('../queues/index');
const { verifyToken } = require('../lib/auth');

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath('/admin/queues');

createBullBoard({
  queues: [
    new BullMQAdapter(payrollQueue),
    new BullMQAdapter(emailQueue),
    new BullMQAdapter(notifyQueue),
  ],
  serverAdapter,
});

// Middleware: require PLATFORM_ADMIN JWT
function requirePlatformAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const user = verifyToken(token);
    if (user.role !== 'PLATFORM_ADMIN') {
      return res.status(403).json({ message: 'Platform admin access required' });
    }
    next();
  } catch {
    res.status(401).json({ message: 'Invalid token' });
  }
}

module.exports = { bullBoardRouter: serverAdapter.getRouter(), requirePlatformAdmin };
```

- [ ] **Step 2: Mount Bull Board in `backend/index.js`**

Find the line that mounts the cron router (search for `app.use('/api/cron'`). Add just before it:

```javascript
// Bull Board — PLATFORM_ADMIN only, before authenticateToken so it handles its own auth
const { bullBoardRouter, requirePlatformAdmin } = require('./admin/bullBoard');
app.use('/admin/queues', requirePlatformAdmin, bullBoardRouter);
```

- [ ] **Step 3: Verify no syntax errors**

```bash
cd backend
node --check admin/bullBoard.js && echo "Syntax OK"
node --check index.js && echo "Syntax OK"
```

- [ ] **Step 4: Commit**

```bash
git add backend/admin/bullBoard.js backend/index.js
git commit -m "feat: add Bull Board admin UI at /admin/queues (PLATFORM_ADMIN protected)"
```

---

## Task 11: End-to-end smoke test

- [ ] **Step 1: Start Redis locally**

```bash
redis-server --daemonize yes
redis-cli ping  # should return PONG
```

- [ ] **Step 2: Start the web server**

```bash
cd backend
npm run dev
```

Watch for: `[worker]` lines absent (worker is a separate process), server starts on port 5005.

- [ ] **Step 3: Start the worker in a second terminal**

```bash
cd backend
npm run worker
```

Expected: `[worker] Starting Bantu Job Worker (BullMQ)...` then `[worker] All workers started. Listening for jobs...`

- [ ] **Step 4: Trigger a payroll run via the API**

Find an existing APPROVED payroll run ID in the DB, then:

```bash
curl -s -X POST http://localhost:5005/api/payroll/<runId>/process \
  -H "Authorization: Bearer <token>" \
  -H "x-company-id: <companyId>" \
  -H "Content-Type: application/json" | jq .
```

Expected response:
```json
{ "ok": true, "jobId": "payroll-<runId>", "status": "QUEUED", "message": "Payroll run queued for processing" }
```

- [ ] **Step 5: Poll the status endpoint**

```bash
watch -n 2 "curl -s http://localhost:5005/api/payroll/<runId>/status \
  -H 'Authorization: Bearer <token>' \
  -H 'x-company-id: <companyId>' | jq '{status, progress, employeesProcessed, totalEmployees}'"
```

Watch `progress` increment from 10 → 25 → increasing → 100, then `status` change from `QUEUED` → `PROCESSING` → `COMPLETED`.

- [ ] **Step 6: Open Bull Board**

Visit `http://localhost:5005/admin/queues` in a browser with a `PLATFORM_ADMIN` JWT in the `Authorization` header (use a REST client like Bruno/Insomnia if the browser doesn't support custom headers). Verify the completed job appears in the `payroll-processing` queue.

- [ ] **Step 7: Commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: smoke test corrections for payroll job queue"
```

---

## Task 12: Clean up retired code

Only do this after Task 11 passes cleanly.

**Files:**
- Delete: `backend/lib/jobProcessor.js`

- [ ] **Step 1: Verify `jobProcessor.js` has no remaining importers**

```bash
grep -r "jobProcessor" backend/ --include="*.js"
```

Expected: no output (only `worker.js` imported it, and it's been rewritten).

- [ ] **Step 2: Delete the file**

```bash
rm backend/lib/jobProcessor.js
```

- [ ] **Step 3: Final commit and push**

```bash
git add -A
git commit -m "chore: remove retired DB-polling jobProcessor (replaced by BullMQ emailWorker)"
git push origin main
```

---

## Environment Variables Reference

| Variable | Where needed | Value |
|----------|-------------|-------|
| `REDIS_URL` | Web server + Worker | `redis://localhost:6379` (dev) / Upstash or Render Redis URL (prod) |
| `DIRECT_URL` | Worker (Prisma migrate) | Already configured |

## Render Deployment Checklist

- [ ] Add `REDIS_URL` to the **web service** environment on Render
- [ ] Add `REDIS_URL` to the **worker service** environment on Render
- [ ] Confirm worker service `Start Command` is still `node worker.js`
- [ ] Confirm Bull Board at `/admin/queues` is not publicly accessible (set Render private networking or IP allowlist)
