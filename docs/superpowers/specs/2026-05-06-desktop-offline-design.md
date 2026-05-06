# Bantu Desktop Offline App — Design Spec

**Date:** 2026-05-06
**Status:** Approved

---

## Overview

Bantu will support two deployment targets from a single codebase:

- **Web** — existing React + Express + Neon PostgreSQL (unchanged)
- **Desktop** — Tauri shell wrapping the same React frontend and Express backend as a sidecar, with a local SQLite database and intent-based sync to the web platform

Users on the desktop version work fully offline. When internet is available, changes sync to the web platform so the same data is accessible from either target. License validation uses one-time online activation with a locally-stored signed JWT, enabling offline operation after first setup.

---

## Goals

- One codebase, two build targets (web and desktop)
- Full offline capability — no internet required after activation
- Safe bi-directional sync using an intent queue (not raw row sync)
- One-time online license activation, hardware-locked, seat-capped
- Multi-company support per account (same model as web)
- macOS and Windows installers via GitHub Actions CI

---

## Non-Goals

- Real-time collaboration between desktop and web users (sync is eventual)
- Mobile targets
- Delta/partial sync of individual fields (operations are the unit of sync)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  DESKTOP APP (Tauri)                     │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │     React Frontend (build-time API_URL injected) │    │
│  └──────────────────┬──────────────────────────────┘    │
│                     │ HTTP (localhost:5005)               │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │     Express Sidecar (desktop build of backend)   │    │
│  │   + sync_queue table  + SyncService              │    │
│  └──────────────────┬──────────────────────────────┘    │
│                     │ Prisma (SQLite client)             │
│  ┌──────────────────▼──────────────────────────────┐    │
│  │           Local SQLite Database                  │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Tauri Shell: window chrome, tray icon, auto-updater    │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS (when internet available)
              ┌───────────▼────────────┐
              │   Web Platform API     │
              │  (existing Express +   │
              │   Neon PostgreSQL)     │
              │   + /api/sync          │
              │   + /api/license/*     │
              └────────────────────────┘
```

**Key principles:**
- The web frontend and web backend are unchanged
- Two separate backend builds are produced: one targeting PostgreSQL (web), one targeting SQLite (desktop). They share all route and service code; only the Prisma client and `APP_MODE` env differ
- Prisma generates two separate clients from two schema files (`schema.prisma` for PostgreSQL, `schema.sqlite.prisma` for SQLite). The desktop build uses the SQLite client
- The frontend is built twice with different `VITE_API_URL` values: web builds point to the remote server, desktop builds point to `http://localhost:5005`
- Sync queue lives in SQLite and drains to the web API when internet is detected
- The web platform gets two new routes: `/api/sync` and `/api/license/*`

---

## Repository Structure

```
Bantu/
├── frontend/                        ← shared source
│   └── src/lib/api.ts               ← BASE_URL set from VITE_API_URL at build time
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma            ← PostgreSQL schema (web build)
│   │   └── schema.sqlite.prisma     ← SQLite schema (desktop build, mirrors PG schema)
│   ├── routes/                      ← shared, unchanged
│   ├── services/
│   │   └── syncService.js           ← NEW: sync queue drain logic
│   ├── sync_queue/
│   │   └── operations.js            ← NEW: named operation handlers
│   └── index.js                     ← APP_MODE flag gates sync middleware
├── desktop/                         ← NEW: Tauri shell
│   ├── src-tauri/
│   │   ├── tauri.conf.json          ← window config, sidecar registration
│   │   ├── Cargo.toml
│   │   └── src/
│   │       ├── main.rs              ← spawns sidecar, manages lifecycle
│   │       └── commands.rs          ← license IPC commands
│   └── package.json
├── scripts/
│   ├── build-web.sh                 ← existing
│   └── build-desktop.sh             ← NEW: builds SQLite backend + frontend + Tauri
└── .env.desktop                     ← DATABASE_URL=file:./bantu.db, APP_MODE=desktop
```

### Two build outputs from one codebase

**Web build** (unchanged):
```
DATABASE_URL=postgresql://...  →  Prisma PG client
VITE_API_URL=https://api.bantu.app  →  Frontend hits remote server
```

**Desktop build:**
```
DATABASE_URL=file:./bantu.db   →  Prisma SQLite client (generated from schema.sqlite.prisma)
APP_MODE=desktop               →  Backend enables sync middleware
VITE_API_URL=http://localhost:5005  →  Frontend hits local sidecar
```

`build-desktop.sh` runs:
1. `prisma generate --schema prisma/schema.sqlite.prisma` — generates SQLite client
2. `prisma migrate deploy --schema prisma/schema.sqlite.prisma` — applies migrations on first run
3. `vite build` with `VITE_API_URL=http://localhost:5005`
4. `tauri build` — bundles everything into installer

### Frontend API base URL

```ts
// frontend/src/lib/api.ts
const BASE_URL = import.meta.env.VITE_API_URL
```

`VITE_API_URL` is injected at build time — no runtime branching needed in the frontend source. Web and desktop produce different bundles with this value baked in.

### Backend APP_MODE gate

```js
// backend/index.js
const isDesktop = process.env.APP_MODE === 'desktop'
if (isDesktop) {
  app.use(syncQueueMiddleware)
}
```

---

## Sync Engine

### sync_queue table (SQLite schema only)

```prisma
model SyncQueue {
  id        String    @id @default(cuid())
  entity    String    // "employee", "payroll", "leave", etc.
  entityId  String    // client-generated cuid, used as PK on server too
  operation String    // "CREATE_EMPLOYEE", "FINALIZE_PAYROLL", etc.
  payload   String    // JSON string
  status    String    @default("pending") // pending | synced | conflict | failed
  createdAt DateTime  @default(now())
  syncedAt  DateTime?
  errorMsg  String?
}
```

Every write appends a queue entry and performs the DB write in the same transaction. If the DB write fails, the queue entry rolls back with it.

### Client-generated IDs

All records created on the desktop use client-generated `cuid()`s as their primary keys. The server accepts and stores these IDs as-is. This avoids ID translation problems when referencing related records in the queue (e.g. a `CREATE_LEAVE` referencing an employee created in the same offline session). The server checks for ID collisions on `CREATE_*` operations — if a record with that ID already exists remotely, the operation is treated as a conflict, not silently overwritten.

### Named operations (`backend/sync_queue/operations.js`)

```js
const operations = {
  CREATE_EMPLOYEE:  (payload, db) => employeeService.create(payload, db),
  UPDATE_EMPLOYEE:  (payload, db) => employeeService.update(payload, db),
  FINALIZE_PAYROLL: (payload, db) => payrollService.finalize(payload, db),
  CREATE_LEAVE:     (payload, db) => leaveService.create(payload, db),
  // one handler per write path
}
```

Each handler receives the same `db` transaction context so all operations in a batch are atomic. Finalized payrolls are immutable — `FINALIZE_PAYROLL` rejects if the period is already finalized remotely.

### SyncService flow

```
On internet detected (Tauri network event):
  1. Snapshot SQLite → bantu-backup-{timestamp}.db
  2. Fetch all pending queue entries (ordered by createdAt)
  3. Compute dry-run diff locally (what entities will be created/updated)
  4. Show diff summary to user with "Sync now" / "Cancel" prompt
  5. On user confirm: POST /api/sync { accountId, operations, lastSyncedAt }
  6. Server applies each operation in order (see batching strategy below)
  7. Server returns { synced: [...ids], conflicts: [...items], failed: [...items], serverChanges: [...] }
  8. Mark synced entries → status: "synced"
  9. Mark conflicts → status: "conflict" (user notified, Sync panel opens)
  10. Apply serverChanges locally via direct Prisma upserts (not via queue)
  11. Update lastSyncedAt timestamp
```

The dry-run diff (step 3) is computed locally without a server round-trip: it summarises the pending queue entries by entity type and operation. It is shown before every sync, not just on first sync or when conflicts exist.

### Server-side changes pull (`serverChanges`)

The server returns all records modified after `lastSyncedAt` for the account:

```js
// server: collect records changed since lastSyncedAt
const serverChanges = await db.employee.findMany({
  where: { accountId, updatedAt: { gt: lastSyncedAt } }
})
// ... repeated for each entity type
```

This requires an `updatedAt` field on every synced entity. All existing Prisma models already have `updatedAt` via `@updatedAt`. Server changes are applied locally as upserts — if the local record has a matching pending queue entry (i.e. both sides changed the same record), it is flagged as a conflict instead of being upserted.

### Conflict detection

A conflict is raised when:
1. The incoming operation targets a record (`entityId`) that has been modified on the server after `lastSyncedAt` (checked via `updatedAt` on the server row), **and**
2. The operation is an `UPDATE_*` or `FINALIZE_*` (not a `CREATE_*` which uses a client-generated ID)

The server returns conflicting items in the `conflicts` array with both the local payload and the current server state. The desktop marks these queue entries as `status: "conflict"`. The user resolves them manually in the Sync panel.

### Conflict resolution actions

In the Sync panel, each conflict shows a side-by-side diff with two buttons:

- **Keep local** — re-enqueues the local operation as a new `pending` queue entry with a `forceOverwrite: true` flag. On the next sync, the server applies this operation unconditionally (bypasses the conflict check). The conflicting queue entry is marked `status: "resolved"`.
- **Keep server** — discards the local queue entry (marks it `status: "resolved"`). The server record is applied locally via a direct Prisma upsert.

Both actions are recorded in the sync audit log.

### Sync batching strategy

To avoid all-or-nothing failure on large queues, the server processes operations in entity-typed mini-batches in **dependency order**, each in its own PostgreSQL transaction:

```
Batch 1: all CREATE_COMPANY operations   →  own PG transaction
Batch 2: all CREATE_EMPLOYEE operations  →  own PG transaction (depends on company)
Batch 3: all CREATE_LEAVE operations     →  own PG transaction (depends on employee)
Batch 4: all UPDATE_EMPLOYEE operations  →  own PG transaction
Batch 5: all FINALIZE_PAYROLL operations →  own PG transaction (depends on employees)
...
```

The dependency order is defined statically in `operations.js` — each operation declares a `dependsOn` entity type. The server sorts batches by this order before executing. This ensures FK constraints are never violated.

If one batch fails, subsequent batches still run. The response identifies which operations succeeded and which failed. The desktop retries only the failed entries on the next sync.

### Server-side `/api/sync` endpoint

```
POST /api/sync
  Headers: Authorization: Bearer <account JWT>
  Body:    { accountId, operations: [...queue entries], lastSyncedAt }
  Returns: {
    synced:        [...ids],
    conflicts:     [{ id, localPayload, serverRecord }],
    failed:        [{ id, error }],
    serverChanges: [{ entity, records: [...] }]
  }
```

### Safety guards

1. **Append-only for finalized payrolls** — finalized records are write-protected on both sides
2. **Snapshot before sync** — local SQLite backed up before every sync attempt
3. **Dry-run diff shown to user** — user confirms before every sync fires
4. **Batch transactions** — each entity-type batch is its own PG transaction; failures are isolated
5. **Conflict surfacing** — same-record edits on both sides are flagged, never silently overwritten
6. **Sync audit log** — every sync operation written to a `SyncLog` table on both sides (see schema below)

### Sync audit log schema

Added to both the SQLite schema (`schema.sqlite.prisma`) and the PostgreSQL schema (`schema.prisma`):

```prisma
model SyncLog {
  id          String   @id @default(cuid())
  accountId   String
  operation   String   // queue operation name e.g. "CREATE_EMPLOYEE"
  entityId    String
  direction   String   // "push" (desktop→server) | "pull" (server→desktop)
  status      String   // "synced" | "conflict" | "failed" | "resolved"
  resolvedAs  String?  // "keep_local" | "keep_server" — set on conflict resolution
  syncedAt    DateTime @default(now())
  errorMsg    String?
}
```

The SQLite `SyncLog` records the desktop side. The PostgreSQL `SyncLog` records the server side. Both are written atomically with their respective operations.

---

## First-Time Setup & Initial Data Seed

When a desktop app is activated for the first time, the local SQLite database is empty. After license activation, the app performs an **initial pull**:

```
POST /api/sync/initial
  Body: { accountId, page?: number }
  Returns: {
    respondedAt: DateTime,    // server timestamp — used as lastSyncedAt
    hasMore: boolean,
    nextPage: number | null,
    data: { employees: [...], companies: [...], payrolls: [...], ... }
  }
```

The server returns all current data for the account paginated at 1000 records per entity type per page. The desktop writes each page directly to SQLite via bulk Prisma upserts (bypassing the sync queue — no queue entries generated). The desktop repeats requests with incrementing `page` until `hasMore` is false.

`lastSyncedAt` is set to the `respondedAt` timestamp from the **first** page response (the server's clock, not the client's), ensuring records written between the pull start and client processing time are not missed on the first incremental sync.

This also covers existing web customers migrating to desktop — they get their full history on first install.

---

## Schema Migrations (Desktop)

SQLite migrations are applied on every app launch before the Express sidecar starts:

```
Launch sequence:
  1. Tauri main.rs runs: prisma migrate deploy --schema schema.sqlite.prisma
  2. If migration succeeds → spawn Express sidecar
  3. If migration fails → show error dialog with "Contact support" link, do not launch
```

The `prisma/migrations/` directory is bundled inside the Tauri installer as a sidecar resource. At runtime, Tauri resolves the migrations path relative to the app's resource directory (not the repo root) using `tauri::api::path::resource_dir()`. The `build-desktop.sh` script copies the migrations folder into `desktop/src-tauri/resources/` before running `tauri build`, and `tauri.conf.json` lists it under `bundle.resources`.

Skipping versions is safe because Prisma applies all pending migrations in order. The SQLite schema is kept in sync with the PostgreSQL schema — any schema change requires updating both `schema.prisma` and `schema.sqlite.prisma`.

---

## License Validation

### Activation (one-time, requires internet)

1. App launches → checks OS keychain for license token
2. No token found → show Activation screen
3. User enters license key + account credentials
4. Desktop POSTs to `/api/license/activate`: `{ licenseKey, machineId, accountId }`
5. Server validates key, checks seat count, registers machine
6. Server returns signed JWT: `{ accountId, expiresAt, machineId }` — **TTL: 1 year**
7. JWT stored in OS keychain via `tauri-plugin-stronghold` (uses the OS secure enclave / keychain on both macOS and Windows)
8. App unlocks — no further internet needed until token expires

**Machine ID** derived from hardware identifiers (CPU + disk serial) via `tauri-plugin-system-info`. Stable across reboots.

### Offline validation (every launch)

1. Read JWT from OS keychain
2. Verify signature with RSA public key bundled in the app binary
3. Check `expiresAt` claim — if expired, show reactivation screen
4. Check `machineId` matches current machine
5. All pass → app starts

### Silent token renewal

Token renewal is a **separate background task** independent of the user-confirmed sync flow. It fires whenever internet is detected, regardless of whether a sync is pending or in progress:

```
On internet detected (Tauri network event):
  → If token expiresAt < now() + 30 days:
      POST /api/license/renew { machineId, accountId }
      → If machine is still active: store new JWT (1-year TTL) in keychain, silent
      → If machine revoked: show "License deactivated" blocking screen
      → If no internet / request fails: skip silently, retry on next internet event
```

This fires independently of sync — a user who cancels the sync dry-run diff still gets renewal. Revocation is enforced within 30 days for offline machines.

### JWT TTL & revocation

- **Token TTL: 1 year** — baked into every issued JWT
- **Revocation window: max 30 days** — silent renewal checks enforce this
- A revoked machine can operate offline for at most 30 days after revocation (when its token nears expiry and renewal is rejected)

### Database schema additions (web platform)

```prisma
model License {
  id          String            @id @default(cuid())
  key         String            @unique
  accountId   String
  maxMachines Int               @default(1)
  expiresAt   DateTime?
  createdAt   DateTime          @default(now())
  machines    LicensedMachine[]
}

model LicensedMachine {
  id          String    @id @default(cuid())
  licenseId   String
  machineId   String    @unique
  activatedAt DateTime  @default(now())
  revokedAt   DateTime?
}
```

Seat cap enforced at activation time. Web admin panel shows all registered machines with a deactivate button.

---

## Desktop Shell (Tauri)

### App lifecycle

```
Launch:
  1. Run: prisma migrate deploy --schema schema.sqlite.prisma
  2. Spawn Express sidecar (desktop build of backend/index.js)
  3. Poll localhost:5005/health until ready (max 10s, then show error)
  4. Validate license token (offline JWT check)
  5. Open main window → load frontend (bundled, served from localhost)
  6. If internet available: check for app updates, trigger sync if queue non-empty
  7. App ready

Close:
  1. Gracefully shut down Express sidecar (SIGTERM + 5s timeout)
  2. SQLite WAL checkpoint
  3. Window closes
```

### System tray

```
Tray menu:
  ├── Open Bantu
  ├── Sync Status (● Synced / ⟳ Syncing / ✕ Offline)
  ├── Last synced: 2026-05-06 14:32
  ├── ─────────────────────────────
  ├── Sync Now
  ├── Backup Database...
  └── Quit
```

### Network detection & auto-sync

Event-driven via Tauri network listener — no polling:

```
networkStatus.onChange(status => {
  if (status === 'online' && pendingQueueCount > 0) {
    syncService.run()  // shows dry-run diff, waits for user confirm
  }
})
```

Manual sync also available from tray "Sync Now" and from Settings page.

### Auto-updater

Using `tauri-plugin-updater`:

1. Check `/api/desktop/latest` on launch (after license check), skip silently if offline
2. If update available → non-blocking banner: "Update available — install now or later"
3. Download in background
4. User confirms → install + relaunch
5. Updates do not interrupt an in-progress sync

### Build targets

| Command | Output |
|---|---|
| `npm run dev:desktop` | Tauri dev mode with hot reload |
| `npm run build:web` | Web deploy (unchanged) |
| `npm run build:desktop:mac` | Signed `.dmg` for macOS |
| `npm run build:desktop:win` | Signed `.exe` / `.msi` for Windows |

CI/CD via GitHub Actions — signed installers produced on every tagged release.

---

## Data Flow Summary

```
User action (desktop)
  → write to SQLite (Prisma SQLite client)
  → append to sync_queue (same transaction)
  → UI updates immediately (no waiting for sync)

Internet reconnects
  → snapshot SQLite backup
  → show dry-run diff to user
  → user confirms
  → drain sync_queue to /api/sync in entity-typed batches
  → server applies each batch in its own PG transaction
  → pull serverChanges → upsert locally
  → conflicts surfaced in Sync panel for manual resolution
  → update lastSyncedAt

App launch (first time / new machine)
  → license activation (internet required)
  → POST /api/sync/initial → pull all account data → populate SQLite
  → app ready for offline use
```

---

## Open Questions / Future Work

- Large queue batching: define max operations per sync request (suggest 500)
- GCS file upload calls (Google Cloud Storage) — detect offline and skip gracefully; queue uploads
- Email notifications (nodemailer) — skip silently when offline
- Cron jobs (node-cron) — run locally on desktop for scheduled tasks (e.g. leave accrual)
- Biometric unlock (TouchID / Windows Hello) via `tauri-plugin-biometric` — post-MVP
