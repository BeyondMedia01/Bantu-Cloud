# Group A — Reliability: Background Jobs & Observability

**Date:** 2026-04-22
**Status:** Approved

---

## Problem

Two production gaps block reliable operation at scale.

**Job queue:** Payroll processing, bank file generation, bulk email, and pay increases run synchronously inside HTTP request handlers. Render's starter plan enforces a 30-second request timeout. A 300-employee payroll run already exceeds this. The existing `worker.js` and `Job` model exist but are not deployed and handle only `EMAIL_PAYSLIP`.

**Observability:** All logging uses `console.log`. There are no correlation IDs, no structured log queries, and no alerting. Errors surface when clients report them, not when they occur.

---

## Decisions

- **Job queue:** Fix and extend the existing DB-backed queue. No Redis. The existing `Job` model, `worker.js`, and `jobProcessor.js` are the foundation.
- **Observability:** Pino for structured logging, Sentry Performance for tracing and alerting, Axiom for log storage and queries.

---

## 1. Background Job Queue

### What changes

**Deploy the worker.** Add a `worker` service to `render.yaml` with the following `envVars`: `DATABASE_URL`, `SENTRY_DSN`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `GCS_BUCKET_NAME`, `GOOGLE_CREDENTIALS_JSON`, `LOG_LEVEL`. Start command: `node worker.js`. This runs as a separate Render process alongside the API.

**Add Sentry init to `worker.js`.** The worker is a separate Node process — it does not load `index.js`. Add `Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.NODE_ENV })` at the top of `worker.js` so job failure errors reach Sentry.

**Tune the poll interval.** Replace the fixed 1-second `setTimeout` with adaptive polling. Extract the existing inline job-fetching logic from `workerLoop` into a `pollOnce` helper that returns the number of jobs it processed. `workerLoop` calls `pollOnce`, then schedules the next tick at 500ms if any jobs were found or 5000ms if the queue was empty.

```js
async function pollOnce() {
  // Move existing job fetch + Promise.all(jobs.map(processOneJob)) logic here
  // Return jobs.length
}

async function workerLoop() {
  if (isShuttingDown) return;
  try {
    const count = await pollOnce();
    if (count > 0) logger.debug({ count }, '[worker] Processed jobs');
    setTimeout(workerLoop, count > 0 ? 500 : 5000);
  } catch (error) {
    logger.error({ err: error }, '[worker] Loop error');
    setTimeout(workerLoop, 5000);
  }
}
```

**Add four job types** to `jobProcessor.js`:

| Type | Payload | Replaces |
|------|---------|---------|
| `PROCESS_PAYROLL` | `{ payrollRunId, companyId }` | Synchronous processing in `POST /api/payroll/:runId/process` |
| `GENERATE_BANK_FILE` | `{ payrollRunId, bankType, companyId }` | Synchronous generation in `POST /api/bank-files/generate` |
| `SEND_PAYSLIPS_BULK` | `{ payrollRunId }` | Synchronous email loop in payslips route |
| `PROCESS_PAY_INCREASE` | `{ payIncreaseId, companyId }` | Synchronous update loop in `payIncrease.js` |

`companyId` must be stored in the job payload for all job types that previously read it from `req.companyId`. The HTTP handler passes `req.companyId` when enqueuing. The worker uses `job.payload.companyId` in place of `req.companyId` throughout the processing logic.

**`SEND_PAYSLIPS_BULK` fan-out strategy.** This job fetches all payslips for the run and sends emails directly in a loop — it does not enqueue individual `EMAIL_PAYSLIP` jobs. This keeps retry semantics simple: if the bulk job fails mid-loop, the whole job retries from the start. The `EMAIL_PAYSLIP` type remains for single-payslip email requests (e.g. from the payslip detail page).

**Add progress tracking to `PayrollRun`.** Three new fields and a status value:

```prisma
// Add to PayrollRun model
jobId           String?   // plain string reference to Job.id — no FK constraint
progress        Int       @default(0)   // 0–100
progressMessage String?   // e.g. "Processing employee 45 of 312"
```

The `PayrollStatus` enum already includes `ERROR` for failures. Use `ERROR` (not a new `FAILED` value) when a job exhausts its retries. Store the error message in `progressMessage`.

The worker updates `progress` and `progressMessage` every 10 employees during `PROCESS_PAYROLL`.

**`PROCESS_PAYROLL` post-processing side-effects.** The existing synchronous handler calls `audit()` (which requires `req`) and `runLeaveAccrual()` after processing. In the async job handler:
- Replace `audit({ req, ... })` with a direct `prisma.auditLog.create(...)` call using `job.payload.userId` (add `userId` to the `PROCESS_PAYROLL` payload — the HTTP handler passes `req.user.id`).
- Call `runLeaveAccrual(companyId, run.endDate)` at the end of the job handler, after all payslips are complete. This preserves the statutory side-effect.

Update the `PROCESS_PAYROLL` payload to `{ payrollRunId, companyId, userId }`.

**Add a status endpoint.** Add `GET /:id/status` to `backend/routes/payroll/process.js` — this file is where the payroll sub-router is defined and is the correct place for the new route. There is no `index.js` assembler in that directory. Returns `{ status, progress, progressMessage }`. Require the `view_payroll` permission (consistent with other read routes in this router). Existing company context middleware applies.

### API behaviour changes

`POST /api/payroll/:runId/process` (in `backend/routes/payroll/process.js`) stops doing the work itself. It enqueues a `PROCESS_PAYROLL` job with `{ payrollRunId, companyId, userId }`, sets the run status to `PROCESSING`, and returns `202 Accepted` with `{ message: 'Payroll processing started' }`. The client does not use a job ID — it polls `GET /api/payroll/:id/status` every 2 seconds until status is `COMPLETED` or `ERROR`.

The same pattern applies to bank file generation and bulk email: the HTTP handler enqueues and returns `202` immediately.

### Frontend changes

The payroll run card gains a progress bar, visible when `status === 'PROCESSING'`. The bar shows percentage and the current `progressMessage`. On `COMPLETED`, a success toast fires and the card refreshes. On `ERROR`, the card shows the error message inline and re-enables the Process button.

The Process button disables immediately on click and shows a spinner. It re-enables only if the job errors.

### Error handling

- Worker retries failed jobs with exponential backoff (already implemented: 60s, 120s, … up to `maxAttempts`).
- After `maxAttempts` exhausted, job status moves to `FAILED`. In `worker.js`'s `processOneJob` catch block, after writing `FAILED` to the `Job` record, check `job.type === 'PROCESS_PAYROLL'` and update the linked `PayrollRun` to `ERROR` with `progressMessage` set to the error message. Use `job.payload.payrollRunId` to look up the record.
- `worker.js` calls `Sentry.captureException(error)` on each failed job attempt.

---

## 2. Observability

### Structured logging with Pino

Replace all `console.log` / `console.error` calls with a shared Pino logger at `lib/logger.js`. The canonical configuration is:

```js
// lib/logger.js
const pino = require('pino');

const transport = (() => {
  if (process.env.AXIOM_TOKEN) {
    return { target: '@axiomhq/pino', options: { dataset: process.env.AXIOM_DATASET || 'bantu-prod', token: process.env.AXIOM_TOKEN } };
  }
  if (process.env.NODE_ENV !== 'production') {
    return { target: 'pino-pretty' };
  }
  return undefined; // plain JSON to stdout — safe fallback for production without Axiom
})();

module.exports = pino({ level: process.env.LOG_LEVEL || 'info', transport });
```

In production with `AXIOM_TOKEN` set, logs ship to Axiom. In production without `AXIOM_TOKEN`, Pino writes newline-delimited JSON to stdout — Render captures this in its log dashboard. In development, logs pretty-print to the terminal. `pino-pretty` is never loaded in production, so it can remain a `devDependency`.

**Correlation IDs.** A `requestId` middleware at `middleware/requestId.js` runs before all routes. It reads `X-Request-ID` from the incoming header or generates a UUID. It attaches `req.requestId` and a child logger at `req.log`. Every route handler uses `req.log` instead of the module-level logger. Every log line carries `requestId`, enabling end-to-end request tracing without distributed tracing infrastructure.

**Log levels:**
- `development`: `debug`
- `production`: `info` (override with `LOG_LEVEL=debug` for incidents)

**Worker logging.** The worker imports `lib/logger.js`. Every job start, progress update, completion, and failure logs `jobId`, `jobType`, and `payrollRunId` (where applicable).

### Sentry Performance

Sentry is already installed and initialised in `index.js`. Three changes:

1. Add `tracesSampleRate: 0.2` to `Sentry.init()` in `index.js` — captures 20% of requests as performance traces.
2. Add `Sentry.init(...)` to `worker.js` — the worker is a separate process and needs its own init.
3. Add a custom span wrapping the employee-processing loop in `PROCESS_PAYROLL`:

```js
const span = Sentry.startInactiveSpan({ name: 'payroll.processEmployees', op: 'job' });
// ... process employees ...
span.end();
```

**Alert rules (configured in Sentry UI):**

| Alert | Condition | Action |
|-------|-----------|--------|
| Job failure | Sentry error tagged `jobType` | Email to platform admin |
| Slow response | p95 latency > 5s on any route | Email to platform admin |
| Error spike | Error rate > 5% over 5 minutes | Email to platform admin |

### Axiom

Axiom receives logs via the `@axiomhq/pino` transport (the official package). Two datasets: `bantu-prod` and `bantu-dev`.

**Saved queries to create on first login:**

- All errors in the last hour: `level = "error"`
- Slow requests: `duration > 2000`
- Job failures by type: `jobType != null | summarize count() by jobType, status`
- Payroll processing duration by run: `jobType = "PROCESS_PAYROLL" | summarize avg(duration) by payrollRunId`

### New environment variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `AXIOM_TOKEN` | API + worker | Axiom API token (production only) |
| `AXIOM_DATASET` | API + worker | Axiom dataset name (default: `bantu-prod`) |
| `LOG_LEVEL` | API + worker | Override log verbosity (default: `info`) |

`SENTRY_DSN` already exists in `render.yaml` for the API service — add it to the worker service block too.

---

## Out of scope

- Redis / BullMQ
- OpenTelemetry / distributed tracing
- Frontend observability (browser errors, Core Web Vitals)
- Real-time WebSockets — the frontend polls for job status

---

## Files affected

**New files:**
- `backend/lib/logger.js`
- `backend/middleware/requestId.js`

**Modified files:**
- `backend/index.js` — add requestId middleware, update Sentry init with `tracesSampleRate`
- `backend/worker.js` — add Sentry init, adaptive polling, replace console with Pino
- `backend/lib/jobProcessor.js` — four new job types, Sentry spans on `PROCESS_PAYROLL`, call `runLeaveAccrual` and `prisma.auditLog.create` post-processing
- `backend/jobs/leaveAccrual.js` — called from `jobProcessor.js` after payroll completion (no change to its logic)
- `backend/routes/payroll/process.js` — add `GET /:id/status` route; enqueue `PROCESS_PAYROLL`, return `202`
- `backend/routes/bankFiles.js` — enqueue `GENERATE_BANK_FILE`, return `202`
- `backend/routes/payslips.js` — enqueue `SEND_PAYSLIPS_BULK`, return `202`
- `backend/routes/payIncrease.js` — enqueue `PROCESS_PAY_INCREASE`, return `202`
- `backend/prisma/schema.prisma` — add `jobId`, `progress`, `progressMessage` to `PayrollRun`
- `render.yaml` — add worker service with full `envVars` block
- `backend/package.json` — add `pino`, `@axiomhq/pino` as runtime dependencies; add `pino-pretty` as a devDependency
- `frontend/src/` — progress bar on payroll run card, status polling hook (`usePayrollRunStatus`)

**New migration:** `add_payroll_run_progress_fields`
