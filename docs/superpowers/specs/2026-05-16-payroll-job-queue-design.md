# Payroll Background Job Queue — Design Spec
**Date:** 2026-05-16  
**Status:** Approved  
**Scope:** Move payroll run processing off the synchronous HTTP request path onto a BullMQ-backed background worker, with concurrent support for multiple companies processing simultaneously.

---

## 1. Problem

`POST /api/payroll/:runId/process` executes up to 1,335 lines of synchronous computation in-request. For large companies this takes 10–120 seconds, causing HTTP timeouts. At month-end, 10+ clients process simultaneously — the current architecture has no concurrency controls, no retry logic, and a crashed worker silently loses in-flight state.

---

## 2. Solution Overview

Replace the synchronous handler with an enqueue-and-poll pattern:

1. `POST /process` sets `PayrollRun.status = QUEUED`, enqueues a BullMQ job, returns `202 { jobId, status: 'QUEUED' }` immediately.
2. A separate worker process picks up the job from Redis and runs the computation.
3. Frontend polls `GET /api/payroll/:runId/status` every 3 seconds for live progress.
4. On completion or failure, `PayrollRun.status` updates to `COMPLETED` or `ERROR`.

The existing email/notification DB-backed polling worker is retired and replaced by BullMQ workers in the same pass, giving one unified queue system.

---

## 3. Architecture & Data Flow

```
Frontend          Web Server           Redis (BullMQ)        Worker Process
   │                   │                     │                      │
   │ POST /process      │                     │                      │
   │──────────────────>│                     │                      │
   │                   │ status=QUEUED        │                      │
   │                   │ enqueue ────────────>│                      │
   │ 202 { jobId }     │                     │  job available ──────>│
   │<──────────────────│                     │                      │ compensating cleanup
   │                   │                     │                      │ atomic claim → PROCESSING
   │                   │                     │                      │ compute payslips
   │                   │                     │                      │ update status/progress
   │ GET /status (poll)│                     │                      │
   │──────────────────>│ read PayrollRun      │                      │
   │ { PROCESSING, 45%}│<────────────────────│                      │
   │                   │                     │                      │ enqueue emails → COMPLETED
   │ GET /status       │                     │                      │
   │──────────────────>│                     │                      │
   │ { COMPLETED }     │                     │                      │
```

---

## 4. Queue Configuration

| Queue | Concurrency | Max Retries | Backoff |
|-------|-------------|-------------|---------|
| `payroll-processing` | 5 | 2 | Exponential, 60s base |
| `email-dispatch` | 10 | 3 | Fixed, 30s |
| `notifications` | 3 | 2 | Fixed, 15s |

---

## 5. Schema Changes

### `PayrollRunStatus` enum — add two new values
```prisma
enum PayrollRunStatus {
  DRAFT
  PENDING_APPROVAL
  APPROVED
  QUEUED       // ← new: enqueued, not yet picked up by worker
  PROCESSING   // ← new: worker actively computing
  COMPLETED
  ERROR
}
```

### `PayrollRun` model — add columns
```prisma
jobId              String?   // BullMQ parent job ID (persists across retries)
errorMessage       String?   // populated on ERROR status
progress           Int       @default(0)  // 0–100
employeesProcessed Int       @default(0)
totalEmployees     Int       @default(0)
```

All new columns are nullable or have defaults — the migration is purely additive and non-destructive to existing rows. Existing `PayrollRun` rows will have `progress=0`, `employeesProcessed=0`, `totalEmployees=0`, `jobId=null`, `errorMessage=null`.

### `PayrollLog` model — add column
```prisma
jobId  String?  // links log entry to BullMQ job ID
```

### Migration
Run `npx prisma migrate dev --name payroll_job_queue` in `backend/`. This is a required step — schema edits alone do not update the database. The `DIRECT_URL` env var must be set (already configured).

---

## 6. File Changes

### New files
```
backend/
  lib/
    redis.js              # IORedis connection singleton (reads REDIS_URL)
  queues/
    index.js              # Creates/exports all Queue instances (shared Redis connection)
    payrollWorker.js      # BullMQ Worker — payroll computation (extracted from process.js)
    emailWorker.js        # BullMQ Worker — email dispatch (replaces jobProcessor.js)
    notifyWorker.js       # BullMQ Worker — notifications
  admin/
    bullBoard.js          # Bull Board Express router, PLATFORM_ADMIN protected
```

### Modified files
```
backend/
  worker.js               # Rewritten: starts all workers, graceful SIGTERM shutdown
  routes/payroll/
    process.js            # POST /:runId/process shrinks to ~40 lines (enqueue only)
    index.js              # Mount GET /:runId/status endpoint
  prisma/schema.prisma    # Schema additions above
  index.js                # Mount /admin/queues Bull Board router
  package.json            # Add: bullmq, ioredis, @bull-board/express, @bull-board/api
```

### Retired files
```
backend/
  lib/jobProcessor.js     # Replaced by emailWorker.js + notifyWorker.js
  (worker.js polling loop) # Replaced by BullMQ event-driven workers
```

---

## 7. API Changes

### Modified
**`POST /api/payroll/:runId/process`**
- Before: synchronous, returns `200` after full computation
- After: enqueues job, returns `202 { jobId, status: 'QUEUED' }`
- Validation: run must be `APPROVED` status; returns `409` if already `QUEUED` or `PROCESSING`
- Idempotent: uses `runId` as BullMQ job ID — BullMQ deduplicates, second enqueue is a no-op
- Redis unavailable: returns `503 Service Unavailable`

### New
**`GET /api/payroll/:runId/status`**
- Returns: `{ status, progress, employeesProcessed, totalEmployees, errorMessage }`
- Implementation: single indexed `PayrollRun` row lookup — no joins, no aggregates
- Auth: same companyContext middleware as existing payroll routes

### New (admin)
**`/admin/queues`** — Bull Board UI
- Auth: PLATFORM_ADMIN JWT required
- Network protection: route is additionally gated behind Render's private networking or an IP allowlist (see Section 11). The manual retry button can trigger financial recomputation across tenants — public exposure is unacceptable.

---

## 8. Worker Logic — Payroll Processing

```
payrollWorker.js processJob(job):

  Step 1 — Compensating cleanup (idempotent re-entry safety)
    DELETE PayrollTransaction WHERE payrollRunId = runId
    DELETE Payslip WHERE payrollRunId = runId
    (safe: these rows are fully regenerated each run; clears any partial writes from a prior crashed attempt)

  Step 2 — Atomic claim
    result = await prisma.$executeRaw`
      UPDATE "PayrollRun"
      SET status = 'PROCESSING', "updatedAt" = now()
      WHERE id = ${runId} AND status = 'QUEUED'
      RETURNING id
    `
    if (result.count === 0) throw new Error('Run already claimed or not in QUEUED state')
    → job.updateProgress(10)

  Step 3 — Load system settings, tax tables, exchange rates
    → job.updateProgress(20)

  Step 4 — Fetch active employees, set totalEmployees
    → job.updateProgress(25), update PayrollRun.totalEmployees

  Step 5 — Per-employee computation (batches of 25)
    For each batch:
      a. Calculate gross earnings (transaction codes)
      b. Apply PAYE / NSSA / AIDS levy
      c. Write PayrollTransaction rows
      d. Write Payslip
      → job.updateProgress(25 + 70 * (processed / total))
         update PayrollRun.employeesProcessed

  Step 6 — Enqueue email jobs, then mark COMPLETED (order matters)
    await emailQueue.addBulk(payslipIds.map(id => ({ name: 'EMAIL_PAYSLIP', data: { payslipId: id } })))
    await prisma.payrollRun.update({ where: { id: runId }, data: { status: 'COMPLETED', progress: 100 } })
    (emails are enqueued BEFORE status=COMPLETED so a Redis blip before the status write
     causes a retry that will re-enqueue emails — email queue is idempotent by payslipId)
```

On throw: BullMQ retries (up to 2×, exponential backoff). After all retries exhausted, `failed` event fires → set `PayrollRun.status=ERROR`, `errorMessage=err.message`.

---

## 9. Atomic Claim — Why `$executeRaw`

The claim in Step 2 **must** use a single `UPDATE ... WHERE status='QUEUED' RETURNING id` statement. A Prisma `findFirst` followed by `update` is a read-then-write — two round trips with a race window where a second worker can read the same `QUEUED` row before either has updated it. The raw SQL `UPDATE ... RETURNING` is atomic at the PostgreSQL level.

---

## 10. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Worker throws mid-run | Compensating cleanup runs on retry (Step 1 deletes partial rows) |
| All retries exhausted | `PayrollRun.status = ERROR`, `errorMessage` set |
| Worker process crashes mid-job | On next startup, stale `PROCESSING` runs (updatedAt < now - 5min) reset to `QUEUED` |
| Same run enqueued twice | BullMQ deduplicates by jobId — second enqueue is a no-op |
| Redis unavailable at enqueue | `POST /process` returns `503 Service Unavailable` |
| Email enqueue fails after computation | emails are enqueued before `COMPLETED` write — retry re-enqueues safely |

---

## 11. Graceful Shutdown

`worker.js` registers `SIGTERM` handler (Render sends this on deploys):
1. Call `worker.close()` on each BullMQ Worker — waits for current jobs to finish
2. Hard timeout: 30s, then `process.exit(1)`
3. On next startup: find `PayrollRun` records with `status=PROCESSING` AND `updatedAt < now() - 5 minutes` → delete child rows and reset to `QUEUED`, re-enqueue into BullMQ. The 5-minute window uses `updatedAt` (which Prisma's `@updatedAt` keeps current via the `employeesProcessed` progress updates during processing).

---

## 12. Observability

- **Bull Board** at `/admin/queues`: active, waiting, completed, failed jobs; manual retry button. Protected by PLATFORM_ADMIN JWT + Render private networking / IP allowlist.
- **PayrollLog.jobId**: every payroll action traceable to a BullMQ parent job ID
- **Structured logs**: `[PayrollWorker] runId=X companyId=Y employees=N duration=Xms`
- **Frontend progress bar**: `employeesProcessed / totalEmployees` shown during `PROCESSING` status
- **`jobId` on `PayrollRun`**: stores the BullMQ parent job ID, which is stable across retry attempts (BullMQ retries do not change the parent job ID)

---

## 13. Environment Variables

```
REDIS_URL=redis://...   # Required for both web server (enqueue) and worker process
                        # Use Upstash Redis (free tier) or Render Redis addon
```

Add to both the web service and worker service environment on Render.

---

## 14. Deployment Notes

- Web server and worker are already separate processes on Render — no topology change needed
- Add `REDIS_URL` to both services on Render
- Bull Board: configure Render private networking so `/admin/queues` is not publicly routable, or add an IP allowlist middleware in `bullBoard.js`
- Existing `Job` table and `lib/jobProcessor.js` can be removed after the migration is stable (post-deploy cleanup, separate PR)
- `GET /status` performs a single indexed row lookup on `PayrollRun.id` — no joins — keeping Neon cold-start latency impact minimal even under concurrent polling
