# Bantu Desktop Offline App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully offline desktop app (Tauri) that shares all source code with the existing web platform, syncing data via an intent-based queue when internet is available.

**Architecture:** Tauri wraps the React frontend (unchanged) and bundles the Express backend as a sidecar process. The sidecar uses a local SQLite database (via a second Prisma schema) instead of Neon PostgreSQL. When internet is detected, a sync queue drains to the web platform's `/api/sync` endpoint using named operations — never raw row overwrites.

**Tech Stack:** Tauri 2, Rust, `tauri-plugin-stronghold`, `tauri-plugin-updater`, Prisma (dual schema: PostgreSQL + SQLite), Vitest, Node.js/Express (CommonJS), React + Vite

---

## Codebase Notes (read before starting)

- Backend is **CommonJS** (`require`/`module.exports`) — do not use `import`/`export` in new backend files
- Tests live in `backend/__tests__/` and run with `cd backend && npm test` (Vitest)
- Vitest is configured to handle ESM `import` syntax in test files even though the backend is CJS — existing tests in `__tests__/` confirm this works. Do not add a new `vitest.config.js`; use the existing one.
- When mocking a CJS `module.exports = value` module with `vi.mock`, the mock factory returns the value directly — **not** `{ default: value }`. Example: `vi.mock('../lib/prisma', () => ({ syncQueue: { create: vi.fn() }, $transaction: vi.fn() }))` — no `.default` wrapper.
- Prisma client is accessed via `require('../lib/prisma')` (or `require('./lib/prisma')` from root)
- Existing entity IDs use `uuid()` — new sync-specific models use `cuid()` for client-generation
- All backend routes follow the pattern in `backend/routes/employees.js` — use `express.Router()`, require `lib/prisma`, authenticate with `authenticateToken` from `lib/auth`
- `backend/index.js` is the entry point and registers all routes manually
- **When editing `backend/routes/sync.js` across multiple tasks:** the file is created in Task 12. Tasks 18, 19, and 20 add more routes to the same file — always edit (append to) the existing file, never recreate it.
- **Account foreign key field:** before writing serverChanges queries in Task 12, run `grep "clientId\|accountId" backend/prisma/schema.prisma | head -5` to confirm whether the account FK on Employee is named `clientId` or `accountId`. Use whichever name the schema uses — the plan uses `clientId` as the likely value based on the existing route code, but verify first.

---

## Phase 1: Dual Build Foundation

> Produces: a working desktop app shell that opens the existing frontend against a local SQLite database. No sync yet — just proof that the two-target build works.

### File Map

| File | Action | Purpose |
|---|---|---|
| `backend/prisma/sqlite/schema.prisma` | Create | SQLite schema mirroring PG schema (own subfolder so migrations don't conflict with PG) |
| `backend/prisma/sqlite/migrations/` | Create | SQLite migration history (Prisma auto-creates adjacent to schema) |
| `backend/lib/prisma.js` | No change | Picks up DATABASE_URL automatically |
| `backend/index.js` | Modify | Add `APP_MODE` gate + health endpoint |
| `frontend/src/lib/api.ts` | Modify | Use `VITE_API_URL` env var |
| `.env.desktop` | Create | Desktop env vars |
| `desktop/` | Create | Full Tauri project |
| `desktop/src-tauri/tauri.conf.json` | Create | Window + sidecar config |
| `desktop/src-tauri/Cargo.toml` | Create | Rust dependencies |
| `desktop/src-tauri/src/main.rs` | Create | Sidecar spawn + lifecycle |
| `desktop/src-tauri/src/lib.rs` | Create | Tauri app builder |
| `desktop/package.json` | Create | Desktop scripts |
| `scripts/build-desktop.sh` | Create | Full desktop build pipeline |

---

### Task 1: SQLite Prisma Schema

**Files:**
- Create: `backend/prisma/sqlite/schema.prisma`

The SQLite schema lives in its own subfolder `backend/prisma/sqlite/` so that Prisma's auto-generated `migrations/` folder stays adjacent to the SQLite schema and never conflicts with the PostgreSQL `migrations/` folder.

- [ ] **Step 1: Copy the PostgreSQL schema as a starting point**

```bash
mkdir -p backend/prisma/sqlite
cp backend/prisma/schema.prisma backend/prisma/sqlite/schema.prisma
```

- [ ] **Step 2: Edit the datasource block in `backend/prisma/sqlite/schema.prisma`**

Change the datasource and generator blocks only — all model definitions stay identical:

```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../../generated/sqlite-client"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

SQLite does not support `@db.Text`, `@db.VarChar`, or enum types. Remove all `@db.*` field attributes and replace all `enum` declarations with `String` fields. For example:

```prisma
// Before (PostgreSQL)
enum UserRole { PLATFORM_ADMIN CLIENT_ADMIN EMPLOYEE }
role  UserRole @default(EMPLOYEE)

// After (SQLite)
role  String   @default("EMPLOYEE")
```

Do this for every enum in the schema. SQLite also does not support `Unsupported()` types — remove any such fields.

- [ ] **Step 3: Generate the SQLite Prisma client**

```bash
cd backend
DATABASE_URL="file:./dev.db" npx prisma generate --schema prisma/sqlite/schema.prisma
```

Expected: client generated to `backend/generated/sqlite-client/`

- [ ] **Step 4: Create the first SQLite migration**

```bash
cd backend
DATABASE_URL="file:./dev.db" npx prisma migrate dev \
  --schema prisma/sqlite/schema.prisma \
  --name init
```

Prisma automatically creates `backend/prisma/sqlite/migrations/` adjacent to the schema file. This does not conflict with the PostgreSQL migrations at `backend/prisma/migrations/`. Verify `dev.db` is created.

- [ ] **Step 5: Verify the SQLite client imports work**

```bash
node -e "
const { PrismaClient } = require('./generated/sqlite-client');
const db = new PrismaClient({ datasources: { db: { url: 'file:./dev.db' } } });
db.\$connect().then(() => { console.log('SQLite OK'); db.\$disconnect(); });
"
```

Expected: `SQLite OK`

- [ ] **Step 6: Add `dev.db` to `.gitignore`**

```bash
echo "backend/dev.db" >> .gitignore
echo "backend/generated/" >> .gitignore
```

- [ ] **Step 7: Commit**

```bash
git add backend/prisma/sqlite/schema.prisma backend/prisma/sqlite/migrations/ .gitignore
git commit -m "feat: add SQLite prisma schema for desktop build"
```

---

### Task 2: Backend Health Endpoint + APP_MODE Gate

**Files:**
- Modify: `backend/index.js`

**Note:** Steps 1–3 are coupled — the test shape depends on the export shape. Do Step 3 first (export `app`), then Steps 1–2 (write and run the failing test for the missing route).

- [ ] **Step 3 (do first): Add health endpoint and APP_MODE gate to `backend/index.js`**

Find the section after all middleware is set up (after rate limiting) and add:

```js
// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Desktop Mode ─────────────────────────────────────────────────────────────
const isDesktop = process.env.APP_MODE === 'desktop';
if (isDesktop) {
  // Sync middleware registered in Task 8
  console.log('[desktop] Running in desktop mode with SQLite');
}
```

Export `app` for testing — at the bottom of `index.js`, before `app.listen`:

```js
module.exports = { app };
// existing: app.listen(...)
```

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/health.test.js`:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- health
```

Expected: FAIL — `Cannot find module` or `/health` returns 404 before the route is added (the export change is needed first so the test can import `app`)

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd backend && npm test -- health
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/index.js backend/__tests__/health.test.js
git commit -m "feat: add /health endpoint and APP_MODE gate"
```

---

### Task 3: Frontend API URL from Environment

**Files:**
- Modify: `frontend/src/lib/api.ts` (or wherever the base URL is currently defined)

- [ ] **Step 1: Find where the API base URL is currently set**

```bash
grep -r "localhost:5005\|VITE_API\|baseURL\|BASE_URL" frontend/src --include="*.ts" --include="*.tsx" -l
```

- [ ] **Step 2: Update the base URL to use `VITE_API_URL`**

In `frontend/src/lib/api.ts` (or the equivalent axios/fetch config file):

```ts
// Replace any hardcoded URL with:
// Do NOT use a localhost fallback — if VITE_API_URL is not set the build is misconfigured
const BASE_URL = import.meta.env.VITE_API_URL;
if (!BASE_URL) throw new Error('VITE_API_URL must be set at build time');
```

- [ ] **Step 3: Add `VITE_API_URL` to frontend `.env.example` or `.env`**

```bash
echo "VITE_API_URL=http://localhost:5005" >> frontend/.env.example
```

- [ ] **Step 4: Verify the web dev server still works**

```bash
cd frontend && npm run dev
```

Open the app and confirm it loads data normally. No functional change expected.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/.env.example
git commit -m "feat: read API base URL from VITE_API_URL env var"
```

---

### Task 4: Desktop Environment File

**Files:**
- Create: `.env.desktop`

- [ ] **Step 1: Create `.env.desktop`**

```bash
cat > .env.desktop << 'EOF'
# Desktop-specific environment — used by build-desktop.sh
APP_MODE=desktop
DATABASE_URL=file:./bantu.db
NODE_ENV=production
PORT=5005
JWT_SECRET=REPLACE_WITH_SECURE_SECRET
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:5005
EOF
```

- [ ] **Step 2: Add `.env.desktop` to `.gitignore`** (contains secrets)

```bash
echo ".env.desktop" >> .gitignore
```

- [ ] **Step 3: Create `.env.desktop.example` for reference**

```bash
cat > .env.desktop.example << 'EOF'
APP_MODE=desktop
DATABASE_URL=file:./bantu.db
NODE_ENV=production
PORT=5005
JWT_SECRET=your-secure-secret-here
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:5005
EOF
git add .env.desktop.example .gitignore
git commit -m "feat: add desktop env template"
```

---

### Task 5: Scaffold Tauri Project

**Files:**
- Create: `desktop/` (full Tauri project)

- [ ] **Step 1: Install Tauri CLI and prerequisites**

```bash
# Install Rust if not present
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install Tauri CLI
cargo install tauri-cli --version "^2"

# Verify
cargo tauri --version
```

- [ ] **Step 2: Scaffold the Tauri project**

```bash
mkdir desktop && cd desktop
npm init -y
npm install --save-dev @tauri-apps/cli@^2
npx tauri init
```

When prompted:
- App name: `Bantu`
- Window title: `Bantu`
- Web assets location: `../frontend/dist`
- Dev server URL: `http://localhost:5173`
- Frontend dev command: `cd ../frontend && npm run dev`
- Frontend build command: `cd ../frontend && VITE_API_URL=http://localhost:5005 npm run build`

- [ ] **Step 3: Update `desktop/package.json` scripts**

```json
{
  "name": "bantu-desktop",
  "scripts": {
    "dev": "tauri dev",
    "build": "tauri build",
    "build:mac": "tauri build --target universal-apple-darwin",
    "build:win": "tauri build --target x86_64-pc-windows-msvc"
  }
}
```

- [ ] **Step 4: Add Tauri dependencies to `desktop/src-tauri/Cargo.toml`**

```toml
[package]
name = "bantu"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = ["tray-icon", "macos-private-api"] }
tauri-plugin-shell = "2"
tauri-plugin-updater = "2"
tauri-plugin-stronghold = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", features = ["json"] }

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

- [ ] **Step 5: Commit the scaffold**

```bash
cd ..
git add desktop/
git commit -m "feat: scaffold Tauri desktop project"
```

---

### Task 6: Tauri Main — Sidecar Spawn + Lifecycle

**Files:**
- Modify: `desktop/src-tauri/src/main.rs`
- Create: `desktop/src-tauri/src/sidecar.rs` (NOT `lib.rs` — `lib.rs` is a reserved Rust name)

- [ ] **Step 1: Register the backend as a sidecar in `tauri.conf.json`**

In `desktop/src-tauri/tauri.conf.json`, add to the `bundle` section:

```json
{
  "bundle": {
    "active": true,
    "externalBin": ["../backend/index"],
    "resources": ["resources/template.db"]
  }
}
```

- [ ] **Step 2: Write `desktop/src-tauri/src/sidecar.rs`**

`wait_for_sidecar` runs on a dedicated OS thread to avoid blocking the Tokio async runtime that Tauri uses. Do not use `reqwest::blocking` inside an async context — it panics.

`ensure_database` copies a pre-migrated template database on first launch instead of running `npx prisma migrate deploy` at runtime. This means the end user does not need Node.js installed. The template database is created by `build-desktop.sh` at build time.

```rust
use std::process::{Child, Command};
use std::sync::Mutex;

pub struct SidecarState(pub Mutex<Option<Child>>);

/// Copies the pre-migrated template.db to the user's app data dir on first launch.
/// If bantu.db already exists, this is a no-op (preserves existing user data).
/// template_db: path to the bundled template.db (resources/template.db)
/// db_path: destination path in the user's app data dir
pub fn ensure_database(template_db: &std::path::Path, db_path: &std::path::Path) -> Result<(), Box<dyn std::error::Error>> {
    if !db_path.exists() {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(template_db, db_path)?;
        println!("Database initialized from template");
    }
    Ok(())
}

pub fn spawn_sidecar(resource_dir: &std::path::Path, db_path: &std::path::Path) -> Result<Child, Box<dyn std::error::Error>> {
    let sidecar_path = resource_dir.join("../backend/index");

    let child = Command::new(sidecar_path)
        .env("APP_MODE", "desktop")
        .env("DATABASE_URL", format!("file:{}", db_path.display()))
        .env("PORT", "5005")
        .env("NODE_ENV", "production")
        .spawn()?;

    Ok(child)
}

/// Polls the health endpoint from a dedicated OS thread (not inside Tokio).
/// Returns true if the sidecar responds within timeout_ms.
pub fn wait_for_sidecar(timeout_ms: u64) -> bool {
    std::thread::spawn(move || {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_millis(timeout_ms);

        while start.elapsed() < timeout {
            if let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:5005") {
                return true;
            }
            std::thread::sleep(std::time::Duration::from_millis(200));
        }
        false
    })
    .join()
    .unwrap_or(false)
}
```

Note: uses `TcpStream::connect` instead of an HTTP client — avoids the reqwest dependency entirely for this health check. The sidecar's TCP port being open is sufficient signal that it is ready.

- [ ] **Step 3: Write `desktop/src-tauri/src/main.rs`**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod sidecar;
use sidecar::{spawn_sidecar, wait_for_sidecar, SidecarState};

use std::sync::Mutex;
use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(SidecarState(Mutex::new(None)))
        .setup(|app| {
            let resource_dir = app.path().resource_dir()?;
            let data_dir = app.path().app_data_dir()?;
            let db_path = data_dir.join("bantu.db");

            // Copy pre-migrated template database on first launch (no Node.js required).
            // build-desktop.sh creates resources/template.db using prisma migrate deploy.
            let template_db = resource_dir.join("template.db");
            if let Err(e) = sidecar::ensure_database(&template_db, &db_path) {
                eprintln!("Database init failed: {}", e);
                std::process::exit(1);
            }

            match spawn_sidecar(&resource_dir, &db_path) {
                Ok(child) => {
                    *app.state::<SidecarState>().0.lock().unwrap() = Some(child);
                }
                Err(e) => {
                    eprintln!("Failed to spawn backend sidecar: {}", e);
                    std::process::exit(1);
                }
            }

            if !wait_for_sidecar(10_000) {
                eprintln!("Backend sidecar did not start within 10 seconds");
                std::process::exit(1);
            }

            println!("Backend sidecar ready");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}
```

- [ ] **Step 4: Test that Tauri dev mode launches**

```bash
cd desktop && npm run dev
```

Expected: Tauri window opens, frontend loads, backend sidecar starts on port 5005. Check `localhost:5005/health` returns `{"status":"ok"}`.

- [ ] **Step 5: Commit**

```bash
cd ..
git add desktop/src-tauri/src/ desktop/src-tauri/tauri.conf.json desktop/src-tauri/Cargo.toml
git commit -m "feat: Tauri main with sidecar spawn and health poll"
```

---

### Task 7: Build Script + Desktop Scripts in Root package.json

**Files:**
- Create: `scripts/build-desktop.sh`
- Create: `package.json` (root, if not present)

- [ ] **Step 1: Create `scripts/build-desktop.sh`**

```bash
cat > scripts/build-desktop.sh << 'SCRIPT'
#!/usr/bin/env bash
set -e

echo "==> Generating SQLite Prisma client"
cd backend
DATABASE_URL="file:./template.db" npx prisma generate --schema prisma/sqlite/schema.prisma

echo "==> Creating pre-migrated template database (shipped with installer)"
DATABASE_URL="file:./template.db" npx prisma migrate deploy \
  --schema prisma/sqlite/schema.prisma
mkdir -p ../desktop/src-tauri/resources
cp template.db ../desktop/src-tauri/resources/template.db
rm -f template.db  # clean up build artifact

echo "==> Building frontend for desktop"
cd ../frontend
VITE_API_URL=http://localhost:5005 npm run build

echo "==> Building Tauri app"
cd ../desktop
npm run build

echo "==> Done. Installer in desktop/src-tauri/target/release/bundle/"
SCRIPT

chmod +x scripts/build-desktop.sh
```

- [ ] **Step 2: Add root-level npm scripts (create `package.json` if missing)**

```json
{
  "name": "bantu",
  "private": true,
  "scripts": {
    "dev:web:backend": "cd backend && npm run dev",
    "dev:web:frontend": "cd frontend && npm run dev",
    "dev:desktop": "cd desktop && npm run dev",
    "build:web": "cd frontend && npm run build",
    "build:desktop": "bash scripts/build-desktop.sh",
    "build:desktop:mac": "bash scripts/build-desktop.sh && cd desktop && npm run build:mac",
    "build:desktop:win": "bash scripts/build-desktop.sh && cd desktop && npm run build:win"
  }
}
```

- [ ] **Step 3: Test the build script in dry-run**

```bash
bash scripts/build-desktop.sh
```

Expected: each step echoes completion. Tauri installer appears in `desktop/src-tauri/target/release/bundle/`.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-desktop.sh package.json
git commit -m "feat: add desktop build script and root npm scripts"
```

---

## Phase 2: Sync Engine

> Produces: a working sync queue. Desktop writes go into the queue. `/api/sync` on the server applies them. No UI yet — tested via unit and integration tests.

### File Map

| File | Action | Purpose |
|---|---|---|
| `backend/prisma/sqlite/schema.prisma` | Modify | Add `SyncQueue` + `SyncLog` models |
| `backend/prisma/schema.prisma` | Modify | Add `SyncLog` model (server-side) |
| `backend/sync_queue/operations.js` | Create | Named operation registry with `dependsOn` |
| `backend/sync_queue/syncQueueMiddleware.js` | Create | Express middleware to intercept writes |
| `backend/services/syncService.js` | Create | Queue drain logic |
| `backend/routes/sync.js` | Create | `POST /api/sync` + `POST /api/sync/initial` |
| `backend/index.js` | Modify | Register sync routes + middleware |
| `backend/__tests__/sync.test.js` | Create | Unit tests for sync engine |
| `backend/__tests__/syncRoute.test.js` | Create | Integration tests for /api/sync |

---

### Task 8: Add SyncQueue and SyncLog Models

**Files:**
- Modify: `backend/prisma/sqlite/schema.prisma`
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add models to `prisma/sqlite/schema.prisma`**

At the end of the file, add:

```prisma
model SyncQueue {
  id        String    @id @default(cuid())
  entity    String
  entityId  String
  operation String
  payload   String
  status    String    @default("pending")
  forceOverwrite Boolean @default(false)
  createdAt DateTime  @default(now())
  syncedAt  DateTime?
  errorMsg  String?
}

model SyncLog {
  id         String   @id @default(cuid())
  accountId  String
  operation  String
  entityId   String
  direction  String
  status     String
  resolvedAs String?
  syncedAt   DateTime @default(now())
  errorMsg   String?
}

model SyncMeta {
  id           String   @id @default("singleton")
  lastSyncedAt DateTime?
}
```

- [ ] **Step 2: Add `SyncLog` to `schema.prisma` (PostgreSQL)**

Same `SyncLog` model, but with native PostgreSQL types:

```prisma
model SyncLog {
  id         String   @id @default(cuid())
  accountId  String
  operation  String
  entityId   String
  direction  String
  status     String
  resolvedAs String?
  syncedAt   DateTime @default(now())
  errorMsg   String?
}
```

- [ ] **Step 3: Create SQLite migration**

```bash
cd backend
DATABASE_URL="file:./dev.db" npx prisma migrate dev --schema prisma/sqlite/schema.prisma --name add_sync_models
```

- [ ] **Step 4: Create PostgreSQL migration**

```bash
cd backend
npx prisma migrate dev --name add_sync_log
```

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/
git commit -m "feat: add SyncQueue, SyncLog, SyncMeta to schemas"
```

---

### Task 9: Named Operations Registry

**Files:**
- Create: `backend/sync_queue/operations.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/operations.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { getOperations, getSortedBatches } from '../sync_queue/operations.js';

describe('operations registry', () => {
  it('exports an object with named operations', () => {
    const ops = getOperations();
    expect(ops.CREATE_EMPLOYEE).toBeDefined();
    expect(typeof ops.CREATE_EMPLOYEE.handler).toBe('function');
    expect(ops.CREATE_EMPLOYEE.entity).toBe('employee');
    expect(ops.CREATE_EMPLOYEE.dependsOn).toBeTypeOf('string');
  });

  it('getSortedBatches returns operations sorted by dependency order', () => {
    const queue = [
      { operation: 'CREATE_LEAVE', entityId: 'l1', payload: '{}' },
      { operation: 'CREATE_EMPLOYEE', entityId: 'e1', payload: '{}' },
      { operation: 'CREATE_COMPANY', entityId: 'c1', payload: '{}' },
    ];
    const batches = getSortedBatches(queue);
    expect(batches[0][0].operation).toBe('CREATE_COMPANY');
    expect(batches[1][0].operation).toBe('CREATE_EMPLOYEE');
    expect(batches[2][0].operation).toBe('CREATE_LEAVE');
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- operations
```

- [ ] **Step 3: Create `backend/sync_queue/operations.js`**

```js
const prisma = require('../lib/prisma');

// Dependency order determines batch execution order.
// Lower order = runs first. Operations with the same order run in one batch.
const OPERATIONS = {
  CREATE_COMPANY: {
    entity: 'company',
    dependsOn: null,
    order: 1,
    handler: async (payload, db) => {
      const data = JSON.parse(payload);
      return (db || prisma).company.upsert({
        where: { id: data.id },
        create: data,
        update: {},  // do not overwrite on collision — server wins
      });
    },
  },
  CREATE_EMPLOYEE: {
    entity: 'employee',
    dependsOn: 'company',
    order: 2,
    handler: async (payload, db) => {
      const data = JSON.parse(payload);
      return (db || prisma).employee.upsert({
        where: { id: data.id },
        create: data,
        update: {},
      });
    },
  },
  UPDATE_EMPLOYEE: {
    entity: 'employee',
    dependsOn: 'company',
    order: 3,
    handler: async (payload, db) => {
      const { id, ...data } = JSON.parse(payload);
      return (db || prisma).employee.update({ where: { id }, data });
    },
  },
  CREATE_LEAVE: {
    entity: 'leave',
    dependsOn: 'employee',
    order: 4,
    handler: async (payload, db) => {
      const data = JSON.parse(payload);
      return (db || prisma).leaveRequest.upsert({
        where: { id: data.id },
        create: data,
        update: {},
      });
    },
  },
  FINALIZE_PAYROLL: {
    entity: 'payroll',
    dependsOn: 'employee',
    order: 5,
    handler: async (payload, db) => {
      const { payrollRunId, ...data } = JSON.parse(payload);
      const existing = await (db || prisma).payrollRun.findUnique({
        where: { id: payrollRunId },
        select: { status: true },
      });
      if (existing?.status === 'FINALIZED') {
        throw new Error(`Payroll run ${payrollRunId} is already finalized`);
      }
      return (db || prisma).payrollRun.update({
        where: { id: payrollRunId },
        data: { status: 'FINALIZED', ...data },
      });
    },
  },
};

function getOperations() {
  return OPERATIONS;
}

// Groups queue entries into ordered batches by operation type.
// Batches are sorted by their `order` value (dependency order).
function getSortedBatches(queueEntries) {
  const groups = {};
  for (const entry of queueEntries) {
    const op = OPERATIONS[entry.operation];
    if (!op) continue;
    if (!groups[op.order]) groups[op.order] = [];
    groups[op.order].push(entry);
  }
  return Object.keys(groups)
    .sort((a, b) => Number(a) - Number(b))
    .map((order) => groups[order]);
}

module.exports = { getOperations, getSortedBatches };
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd backend && npm test -- operations
```

- [ ] **Step 5: Commit**

```bash
git add backend/sync_queue/operations.js backend/__tests__/operations.test.js
git commit -m "feat: add named operations registry with dependency ordering"
```

---

### Task 10: SyncQueue Middleware (Desktop Only)

**Files:**
- Create: `backend/sync_queue/syncQueueMiddleware.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/syncQueueMiddleware.test.js`:

```js
import { describe, it, expect, vi } from 'vitest';

// CJS module.exports mock — no `.default` wrapper
const mockCreate = vi.fn().mockResolvedValue({ id: 'sq1' });
vi.mock('../lib/prisma', () => ({
  syncQueue: { create: mockCreate },
  $transaction: vi.fn((fn) => fn({ syncQueue: { create: vi.fn().mockResolvedValue({}) } })),
}));

import { createSyncQueueEntry } from '../sync_queue/syncQueueMiddleware.js';
import prisma from '../lib/prisma.js';

describe('createSyncQueueEntry', () => {
  it('creates a queue entry with correct fields', async () => {
    await createSyncQueueEntry(prisma, {
      entity: 'employee',
      entityId: 'emp123',
      operation: 'CREATE_EMPLOYEE',
      payload: { name: 'John' },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: 'employee',
        entityId: 'emp123',
        operation: 'CREATE_EMPLOYEE',
        status: 'pending',
      }),
    });
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- syncQueueMiddleware
```

- [ ] **Step 3: Create `backend/sync_queue/syncQueueMiddleware.js`**

```js
const prisma = require('../lib/prisma');

/**
 * Creates a sync queue entry within an optional transaction context.
 * Call this alongside every write operation in desktop mode.
 */
async function createSyncQueueEntry(db = prisma, { entity, entityId, operation, payload, forceOverwrite = false }) {
  return db.syncQueue.create({
    data: {
      entity,
      entityId,
      operation,
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      status: 'pending',
      forceOverwrite,
    },
  });
}

/**
 * Express middleware — only registered in desktop mode (APP_MODE=desktop).
 * Logs sync queue entries for write operations.
 * Actual queue population happens inside route handlers via createSyncQueueEntry.
 */
function syncQueueMiddleware(req, res, next) {
  // Attach helper to req so route handlers can call it
  req.enqueueSyncOp = (entry) => createSyncQueueEntry(prisma, entry);
  next();
}

module.exports = { syncQueueMiddleware, createSyncQueueEntry };
```

- [ ] **Step 4: Register middleware in `backend/index.js`**

```js
const { syncQueueMiddleware } = require('./sync_queue/syncQueueMiddleware');

// In the isDesktop block:
const isDesktop = process.env.APP_MODE === 'desktop';
if (isDesktop) {
  app.use(syncQueueMiddleware);
  console.log('[desktop] Sync queue middleware enabled');
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd backend && npm test -- syncQueueMiddleware
```

- [ ] **Step 6: Commit**

```bash
git add backend/sync_queue/syncQueueMiddleware.js backend/__tests__/syncQueueMiddleware.test.js backend/index.js
git commit -m "feat: add sync queue middleware for desktop mode"
```

---

### Task 11: SyncService — Queue Drain Logic

**Files:**
- Create: `backend/services/syncService.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/syncService.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { computeDryRunDiff, applyServerChanges } from '../services/syncService.js';

describe('computeDryRunDiff', () => {
  it('summarises pending queue entries by operation', () => {
    const queue = [
      { operation: 'CREATE_EMPLOYEE', entity: 'employee' },
      { operation: 'CREATE_EMPLOYEE', entity: 'employee' },
      { operation: 'UPDATE_EMPLOYEE', entity: 'employee' },
    ];
    const diff = computeDryRunDiff(queue);
    expect(diff.CREATE_EMPLOYEE).toBe(2);
    expect(diff.UPDATE_EMPLOYEE).toBe(1);
  });
});

describe('applyServerChanges', () => {
  it('returns a list of entity type and record count pairs', () => {
    const serverChanges = [
      { entity: 'employee', records: [{ id: 'e1' }, { id: 'e2' }] },
      { entity: 'company', records: [{ id: 'c1' }] },
    ];
    const summary = applyServerChanges(serverChanges);
    expect(summary).toEqual([
      { entity: 'employee', count: 2 },
      { entity: 'company', count: 1 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- syncService
```

- [ ] **Step 3: Create `backend/services/syncService.js`**

```js
const prisma = require('../lib/prisma');
const { getSortedBatches } = require('../sync_queue/operations');
const fs = require('fs');
const path = require('path');

/**
 * Summarises pending queue entries by operation name for the dry-run diff.
 * Returns { OPERATION_NAME: count, ... }
 */
function computeDryRunDiff(queueEntries) {
  return queueEntries.reduce((acc, entry) => {
    acc[entry.operation] = (acc[entry.operation] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Snapshots the SQLite database file to a timestamped backup.
 * dbPath: absolute path to bantu.db
 * backupDir: directory to write backup into
 */
async function snapshotDatabase(dbPath, backupDir) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `bantu-backup-${timestamp}.db`);
  fs.copyFileSync(dbPath, backupPath);
  return backupPath;
}

/**
 * Applies serverChanges (array of { entity, records }) to local SQLite
 * via direct upserts. Does NOT write to the sync queue.
 * Returns a summary of what was applied.
 */
async function applyServerChanges(serverChanges, db = prisma) {
  const summary = [];
  for (const { entity, records } of serverChanges) {
    // Map entity name to Prisma model delegate
    const model = db[entity];
    if (!model) continue;
    for (const record of records) {
      await model.upsert({
        where: { id: record.id },
        create: record,
        update: record,
      });
    }
    summary.push({ entity, count: records.length });
  }
  return summary;
}

/**
 * Updates lastSyncedAt in the SyncMeta singleton.
 */
async function updateLastSyncedAt(timestamp, db = prisma) {
  return db.syncMeta.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', lastSyncedAt: timestamp },
    update: { lastSyncedAt: timestamp },
  });
}

/**
 * Gets the lastSyncedAt timestamp from local SyncMeta.
 */
async function getLastSyncedAt(db = prisma) {
  const meta = await db.syncMeta.findUnique({ where: { id: 'singleton' } });
  return meta?.lastSyncedAt ?? null;
}

module.exports = {
  computeDryRunDiff,
  snapshotDatabase,
  applyServerChanges,
  updateLastSyncedAt,
  getLastSyncedAt,
};
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
cd backend && npm test -- syncService
```

- [ ] **Step 5: Commit**

```bash
git add backend/services/syncService.js backend/__tests__/syncService.test.js
git commit -m "feat: add syncService with dry-run diff and server changes apply"
```

---

### Task 12: Server-Side `/api/sync` and `/api/sync/initial` Routes

**Files:**
- Create: `backend/routes/sync.js`
- Modify: `backend/index.js`

- [ ] **Step 1: Write the failing integration test**

Create `backend/__tests__/syncRoute.test.js`:

```js
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('POST /api/sync', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/sync')
      .send({ accountId: 'acc1', operations: [], lastSyncedAt: null });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/sync/initial', () => {
  it('returns 401 without auth token', async () => {
    const res = await request(app)
      .post('/api/sync/initial')
      .send({ accountId: 'acc1' });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails (route not found)**

```bash
cd backend && npm test -- syncRoute
```

- [ ] **Step 3: Create `backend/routes/sync.js`**

```js
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../lib/auth');
const { getSortedBatches, getOperations } = require('../sync_queue/operations');

// POST /api/sync
// Accepts a batch of sync queue operations from the desktop and applies them.
router.post('/', authenticateToken, async (req, res) => {
  const { accountId, operations = [], lastSyncedAt } = req.body;

  if (!accountId) return res.status(400).json({ error: 'accountId required' });

  const synced = [];
  const conflicts = [];
  const failed = [];

  const ops = getOperations();
  const batches = getSortedBatches(operations);

  for (const batch of batches) {
    // Each batch runs in its own transaction
    try {
      await prisma.$transaction(async (db) => {
        for (const entry of batch) {
          const op = ops[entry.operation];
          if (!op) {
            failed.push({ id: entry.id, error: `Unknown operation: ${entry.operation}` });
            continue;
          }

          // Conflict detection for UPDATE_* and FINALIZE_* operations
          if (entry.operation.startsWith('UPDATE_') || entry.operation.startsWith('FINALIZE_')) {
            if (!entry.forceOverwrite && lastSyncedAt) {
              const model = db[op.entity];
              if (model) {
                const existing = await model.findUnique({
                  where: { id: entry.entityId },
                  select: { updatedAt: true },
                });
                if (existing?.updatedAt > new Date(lastSyncedAt)) {
                  conflicts.push({
                    id: entry.id,
                    localPayload: entry.payload,
                    serverRecord: existing,
                  });
                  continue;
                }
              }
            }
          }

          try {
            await op.handler(entry.payload, db);
            synced.push(entry.id);

            // Write server-side sync log
            await db.syncLog.create({
              data: {
                accountId,
                operation: entry.operation,
                entityId: entry.entityId,
                direction: 'push',
                status: 'synced',
              },
            });
          } catch (err) {
            failed.push({ id: entry.id, error: err.message });
          }
        }
      });
    } catch (err) {
      // Entire batch failed — mark all as failed
      for (const entry of batch) {
        failed.push({ id: entry.id, error: err.message });
      }
    }
  }

  // Collect server-side changes since lastSyncedAt
  const serverChanges = [];
  if (lastSyncedAt) {
    const since = new Date(lastSyncedAt);
    const changedEmployees = await prisma.employee.findMany({
      where: { clientId: accountId, updatedAt: { gt: since } },
    });
    if (changedEmployees.length) serverChanges.push({ entity: 'employee', records: changedEmployees });

    const changedCompanies = await prisma.company.findMany({
      where: { clientId: accountId, updatedAt: { gt: since } },
    });
    if (changedCompanies.length) serverChanges.push({ entity: 'company', records: changedCompanies });
    // Add more entity types as needed
  }

  return res.json({ synced, conflicts, failed, serverChanges });
});

// POST /api/sync/initial
// Returns all account data paginated for first-time desktop setup.
router.post('/initial', authenticateToken, async (req, res) => {
  const { accountId, page = 0 } = req.body;
  const PAGE_SIZE = 1000;
  const skip = page * PAGE_SIZE;
  const respondedAt = new Date();

  const [employees, companies] = await Promise.all([
    prisma.employee.findMany({
      where: { clientId: accountId },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.company.findMany({
      where: { clientId: accountId },
      skip,
      take: PAGE_SIZE,
    }),
  ]);

  const hasMore = employees.length === PAGE_SIZE || companies.length === PAGE_SIZE;

  return res.json({
    respondedAt: respondedAt.toISOString(),
    hasMore,
    nextPage: hasMore ? page + 1 : null,
    data: { employees, companies },
  });
});

module.exports = router;
```

- [ ] **Step 4: Register the route in `backend/index.js`**

```js
app.use('/api/sync', authenticateToken, require('./routes/sync'));
```

Wait — `authenticateToken` is already applied inside `routes/sync.js`. Remove the double-auth. Register as:

```js
app.use('/api/sync', require('./routes/sync'));
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd backend && npm test -- syncRoute
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/sync.js backend/index.js backend/__tests__/syncRoute.test.js
git commit -m "feat: add /api/sync and /api/sync/initial server routes"
```

---

## Phase 3: License Validation

> Produces: working license activation and offline JWT validation. Server stores licenses; desktop validates the JWT locally on every launch.

### File Map

| File | Action | Purpose |
|---|---|---|
| `backend/prisma/schema.prisma` | Modify | Add `License` + `LicensedMachine` models |
| `backend/prisma/sqlite/schema.prisma` | No change | License is server-only — not in SQLite |
| `backend/routes/license.js` | Create | `/api/license/activate`, `/api/license/renew` |
| `backend/lib/licenseJwt.js` | Create | RSA JWT sign/verify for license tokens |
| `backend/index.js` | Modify | Register license routes |
| `desktop/src-tauri/src/commands.rs` | Create | Tauri IPC commands for license state |
| `frontend/src/pages/Activation.tsx` | Create | Activation screen |
| `backend/__tests__/license.test.js` | Create | License route tests |

---

### Task 13: License Schema Migration (Server)

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add License models to `schema.prisma`**

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
  license     License   @relation(fields: [licenseId], references: [id])
  machineId   String    @unique
  activatedAt DateTime  @default(now())
  revokedAt   DateTime?
}
```

- [ ] **Step 2: Run migration**

```bash
cd backend && npx prisma migrate dev --name add_license_models
```

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/
git commit -m "feat: add License and LicensedMachine schema models"
```

---

### Task 14: License JWT Utility

**Files:**
- Create: `backend/lib/licenseJwt.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/licenseJwt.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { signLicenseToken, verifyLicenseToken } from '../lib/licenseJwt.js';

describe('signLicenseToken / verifyLicenseToken', () => {
  it('signs and verifies a license token', () => {
    const payload = { accountId: 'acc1', machineId: 'machine1' };
    const token = signLicenseToken(payload);
    const verified = verifyLicenseToken(token);
    expect(verified.accountId).toBe('acc1');
    expect(verified.machineId).toBe('machine1');
    expect(verified.expiresAt).toBeDefined();
  });

  it('throws on tampered token', () => {
    expect(() => verifyLicenseToken('invalid.token.here')).toThrow();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- licenseJwt
```

- [ ] **Step 3: Generate RSA key pair for license signing**

```bash
cd backend
mkdir -p lib/keys
openssl genrsa -out lib/keys/license_private.pem 2048
openssl rsa -in lib/keys/license_private.pem -pubout -out lib/keys/license_public.pem
# Add private key to .gitignore — public key is safe to commit
echo "backend/lib/keys/license_private.pem" >> ../.gitignore
```

- [ ] **Step 4: Create `backend/lib/licenseJwt.js`**

**Important:** The private key is only needed on the **web server** (for signing). The desktop sidecar only needs the **public key** (for verifying). Keys are read lazily — only when the relevant function is called — so the sidecar does not crash at startup when the private key is absent.

```js
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const TTL_SECONDS = 365 * 24 * 60 * 60; // 1 year

function getPrivateKey() {
  if (process.env.LICENSE_PRIVATE_KEY) return process.env.LICENSE_PRIVATE_KEY;
  const keyPath = path.join(__dirname, 'keys/license_private.pem');
  if (!fs.existsSync(keyPath)) {
    throw new Error('LICENSE_PRIVATE_KEY env var or keys/license_private.pem is required to sign license tokens');
  }
  return fs.readFileSync(keyPath, 'utf8');
}

function getPublicKey() {
  if (process.env.LICENSE_PUBLIC_KEY) return process.env.LICENSE_PUBLIC_KEY;
  const keyPath = path.join(__dirname, 'keys/license_public.pem');
  if (!fs.existsSync(keyPath)) {
    throw new Error('LICENSE_PUBLIC_KEY env var or keys/license_public.pem is required');
  }
  return fs.readFileSync(keyPath, 'utf8');
}

function signLicenseToken({ accountId, machineId }) {
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();
  return jwt.sign(
    { accountId, machineId, expiresAt },
    getPrivateKey(),
    { algorithm: 'RS256', expiresIn: TTL_SECONDS }
  );
}

function verifyLicenseToken(token) {
  return jwt.verify(token, getPublicKey(), { algorithms: ['RS256'] });
}

module.exports = { signLicenseToken, verifyLicenseToken };
```

The desktop build: bundle `license_public.pem` in `desktop/src-tauri/resources/` and set `LICENSE_PUBLIC_KEY` via the sidecar's environment (read from the bundled file at startup in `sidecar.rs`). The private key never leaves the server.

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd backend && npm test -- licenseJwt
```

- [ ] **Step 6: Commit (public key only)**

```bash
git add backend/lib/licenseJwt.js backend/lib/keys/license_public.pem backend/__tests__/licenseJwt.test.js .gitignore
git commit -m "feat: add RSA license JWT sign/verify utility"
```

---

### Task 15: License Activation and Renewal Routes

**Files:**
- Create: `backend/routes/license.js`
- Modify: `backend/index.js`

- [ ] **Step 1: Write the failing test**

Create `backend/__tests__/license.test.js`:

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

describe('POST /api/license/activate', () => {
  it('returns 400 if licenseKey is missing', async () => {
    const res = await request(app)
      .post('/api/license/activate')
      .send({ machineId: 'm1', accountId: 'acc1' });
    expect(res.status).toBe(400);
  });

  it('returns 404 if license key does not exist', async () => {
    const res = await request(app)
      .post('/api/license/activate')
      .send({ licenseKey: 'FAKE-KEY', machineId: 'm1', accountId: 'acc1' });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- license.test
```

- [ ] **Step 3: Create `backend/routes/license.js`**

```js
const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { signLicenseToken, verifyLicenseToken } = require('../lib/licenseJwt');
const { authenticateToken } = require('../lib/auth');

// POST /api/license/activate
router.post('/activate', async (req, res) => {
  const { licenseKey, machineId, accountId } = req.body;

  if (!licenseKey || !machineId || !accountId) {
    return res.status(400).json({ error: 'licenseKey, machineId, and accountId are required' });
  }

  const license = await prisma.license.findUnique({
    where: { key: licenseKey },
    include: { machines: { where: { revokedAt: null } } },
  });

  if (!license) return res.status(404).json({ error: 'License not found' });
  if (license.accountId !== accountId) return res.status(403).json({ error: 'License does not belong to this account' });
  if (license.machines.length >= license.maxMachines) {
    return res.status(403).json({ error: 'License seat limit reached. Deactivate another machine first.' });
  }

  // Register machine (upsert in case of re-activation)
  await prisma.licensedMachine.upsert({
    where: { machineId },
    create: { licenseId: license.id, machineId },
    update: { revokedAt: null, activatedAt: new Date() },
  });

  const token = signLicenseToken({ accountId, machineId });
  return res.json({ token });
});

// POST /api/license/renew
router.post('/renew', authenticateToken, async (req, res) => {
  const { machineId, accountId } = req.body;

  if (!machineId || !accountId) {
    return res.status(400).json({ error: 'machineId and accountId are required' });
  }

  const machine = await prisma.licensedMachine.findUnique({ where: { machineId } });
  if (!machine || machine.revokedAt) {
    return res.status(403).json({ error: 'Machine is revoked or not registered' });
  }

  const token = signLicenseToken({ accountId, machineId });
  return res.json({ token });
});

module.exports = router;
```

- [ ] **Step 4: Register in `backend/index.js`**

```js
app.use('/api/license', require('./routes/license'));
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd backend && npm test -- license.test
```

- [ ] **Step 6: Commit**

```bash
git add backend/routes/license.js backend/__tests__/license.test.js backend/index.js
git commit -m "feat: add license activation and renewal routes"
```

---

### Task 16: Desktop License Validation (Tauri Side)

**Files:**
- Modify: `desktop/src-tauri/src/commands.rs`
- Modify: `desktop/src-tauri/src/main.rs`

- [ ] **Step 1: Create `desktop/src-tauri/src/commands.rs`**

```rust
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseToken {
    pub account_id: String,
    pub machine_id: String,
    pub expires_at: String,
}

/// Called from frontend to check if a valid license token is stored.
/// Returns the decoded token payload if valid, or an error string.
#[tauri::command]
pub async fn check_license(app: AppHandle) -> Result<LicenseToken, String> {
    // In a real implementation: read from tauri-plugin-stronghold
    // For now: check a temp file (replace with stronghold in Task 17)
    let token_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("license.token");

    if !token_path.exists() {
        return Err("no_token".to_string());
    }

    let token = std::fs::read_to_string(&token_path).map_err(|e| e.to_string())?;

    // Validate expiry by calling the sidecar's /api/license/validate (offline check)
    let client = reqwest::Client::new();
    let res = client
        .post("http://localhost:5005/api/license/validate-local")
        .json(&serde_json::json!({ "token": token }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if res.status().is_success() {
        res.json::<LicenseToken>().await.map_err(|e| e.to_string())
    } else {
        Err("invalid_token".to_string())
    }
}

/// Called from frontend after successful activation to store the token.
#[tauri::command]
pub async fn store_license_token(app: AppHandle, token: String) -> Result<(), String> {
    let token_path = app.path().app_data_dir()
        .map_err(|e| e.to_string())?
        .join("license.token");

    std::fs::write(&token_path, token).map_err(|e| e.to_string())
}
```

**Note:** This uses a file for storage initially. Replace with `tauri-plugin-stronghold` after confirming the flow works end-to-end (see Open Questions).

- [ ] **Step 2: Add a local token validation endpoint to `backend/routes/license.js`**

```js
// POST /api/license/validate-local
// Validates a JWT signature locally — no DB lookup. Safe for offline use.
router.post('/validate-local', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'token required' });

  try {
    const payload = verifyLicenseToken(token);
    // Check machineId matches (in production, get from hardware via Tauri IPC)
    return res.json({
      accountId: payload.accountId,
      machineId: payload.machineId,
      expiresAt: payload.expiresAt,
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});
```

- [ ] **Step 3: Register commands in `main.rs`**

```rust
use commands::{check_license, store_license_token};

// In tauri::Builder chain, after .setup():
.invoke_handler(tauri::generate_handler![check_license, store_license_token])
```

- [ ] **Step 4: Create the frontend Activation page**

Create `frontend/src/pages/Activation.tsx`:

```tsx
import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import axios from 'axios';

export default function Activation() {
  const [licenseKey, setLicenseKey] = useState('');
  const [accountId, setAccountId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleActivate() {
    setLoading(true);
    setError('');
    try {
      // Get machine ID from Tauri (placeholder — replace with tauri-plugin-system-info)
      const machineId = 'machine-placeholder';

      const { data } = await axios.post('/api/license/activate', {
        licenseKey,
        machineId,
        accountId,
      });

      await invoke('store_license_token', { token: data.token });
      window.location.reload(); // re-trigger license check in App.tsx
    } catch (err: any) {
      setError(err.response?.data?.error ?? 'Activation failed. Check your license key.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-2xl font-semibold">Activate Bantu</h1>
        <p className="text-muted-foreground text-sm">
          Enter your license key and account ID to activate this machine.
        </p>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="License key (e.g. BANTU-XXXX-XXXX)"
          value={licenseKey}
          onChange={(e) => setLicenseKey(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="Account ID"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <button
          className="w-full bg-primary text-primary-foreground rounded py-2 font-medium"
          onClick={handleActivate}
          disabled={loading}
        >
          {loading ? 'Activating…' : 'Activate'}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Gate the app on license in `frontend/src/App.tsx`**

```tsx
// At the top of App.tsx, before rendering routes:
const isDesktop = import.meta.env.VITE_APP_MODE === 'desktop';

// Inside App component:
const [licenseValid, setLicenseValid] = useState(!isDesktop); // web: always valid

useEffect(() => {
  if (!isDesktop) return;
  invoke<{ accountId: string }>('check_license')
    .then(() => setLicenseValid(true))
    .catch(() => setLicenseValid(false));
}, []);

if (isDesktop && !licenseValid) return <Activation />;
```

Add `VITE_APP_MODE=desktop` to `.env.desktop.example`.

- [ ] **Step 6: Test activation flow in dev mode**

```bash
cd desktop && npm run dev
```

Expected: Activation screen appears on first launch. Enter a valid license key (seed one manually in the DB), complete activation, app loads.

- [ ] **Step 7: Commit**

```bash
git add desktop/src-tauri/src/commands.rs desktop/src-tauri/src/main.rs \
        backend/routes/license.js frontend/src/pages/Activation.tsx frontend/src/App.tsx
git commit -m "feat: license activation flow — Tauri commands + activation screen"
```

---

## Phase 4: System Tray, Sync UI, Auto-Updater, Initial Seed

> Produces: the complete user-facing desktop experience. Sync panel, tray icon, first-time data pull, and update notifications.

### File Map

| File | Action | Purpose |
|---|---|---|
| `desktop/src-tauri/src/tray.rs` | Create | System tray setup |
| `desktop/src-tauri/src/main.rs` | Modify | Register tray + updater |
| `frontend/src/components/SyncPanel.tsx` | Create | Sync status + conflict resolution UI |
| `frontend/src/components/SyncTrigger.tsx` | Create | Dry-run diff modal |
| `frontend/src/hooks/useSync.ts` | Create | Sync state and trigger hook |
| `frontend/src/pages/Settings.tsx` | Modify | Add "Sync Now" button |
| `backend/routes/sync.js` | No change | Already built |

---

### Task 17: System Tray

**Files:**
- Create: `desktop/src-tauri/src/tray.rs`
- Modify: `desktop/src-tauri/src/main.rs`

- [ ] **Step 1: Create `desktop/src-tauri/src/tray.rs`**

```rust
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub fn setup_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let open = MenuItem::with_id(app, "open", "Open Bantu", true, None::<&str>)?;
    let sync_status = MenuItem::with_id(app, "sync_status", "● Synced", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let sync_now = MenuItem::with_id(app, "sync_now", "Sync Now", true, None::<&str>)?;
    let backup = MenuItem::with_id(app, "backup", "Backup Database...", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &sync_status, &separator, &sync_now, &backup, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
            }
            "sync_now" => {
                // Emit event to frontend to trigger sync
                app.emit("tray:sync_now", ()).unwrap();
            }
            "backup" => {
                app.emit("tray:backup", ()).unwrap();
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                if let Some(window) = tray.app_handle().get_webview_window("main") {
                    window.show().unwrap();
                    window.set_focus().unwrap();
                }
            }
        })
        .build(app)?;

    Ok(())
}
```

- [ ] **Step 2: Register tray in `main.rs`**

```rust
mod tray;
use tray::setup_tray;

// In .setup():
setup_tray(&app.handle())?;
```

- [ ] **Step 3: Test tray appears in dev mode**

```bash
cd desktop && npm run dev
```

Expected: Bantu icon in system tray with menu items. Clicking "Open Bantu" brings window to front.

- [ ] **Step 4: Commit**

```bash
git add desktop/src-tauri/src/tray.rs desktop/src-tauri/src/main.rs
git commit -m "feat: add system tray with sync and backup menu items"
```

---

### Task 18: Sync Hook and Dry-Run Diff Modal

**Files:**
- Create: `frontend/src/hooks/useSync.ts`
- Create: `frontend/src/components/SyncTrigger.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/useSync.ts`**

```ts
import { useState, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import axios from 'axios';

export type SyncStatus = 'idle' | 'pending' | 'syncing' | 'conflict' | 'error';

export interface SyncDiff {
  [operation: string]: number;
}

export function useSync() {
  const [status, setStatus] = useState<SyncStatus>('idle');
  const [diff, setDiff] = useState<SyncDiff | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [showDiffModal, setShowDiffModal] = useState(false);

  // Listen for tray "Sync Now" events
  useEffect(() => {
    const unlisten = listen('tray:sync_now', () => triggerSync());
    return () => { unlisten.then(f => f()); };
  }, []);

  async function triggerSync() {
    // 1. Fetch pending queue entries from local backend
    const { data: queue } = await axios.get('/api/sync/queue');
    if (!queue.length) return;

    // 2. Compute dry-run diff
    const diff: SyncDiff = {};
    for (const entry of queue) {
      diff[entry.operation] = (diff[entry.operation] || 0) + 1;
    }
    setDiff(diff);
    setShowDiffModal(true);
  }

  async function confirmSync() {
    setShowDiffModal(false);
    setStatus('syncing');
    try {
      const { data: queue } = await axios.get('/api/sync/queue');
      const meta = await axios.get('/api/sync/meta');
      const { data: result } = await axios.post('/api/sync', {
        accountId: localStorage.getItem('accountId'),
        operations: queue,
        lastSyncedAt: meta.data.lastSyncedAt,
      });

      if (result.conflicts.length) {
        setConflicts(result.conflicts);
        setStatus('conflict');
      } else {
        setStatus('idle');
      }
      setLastSyncedAt(new Date().toISOString());
    } catch (err) {
      setStatus('error');
    }
  }

  return { status, diff, conflicts, lastSyncedAt, showDiffModal, setShowDiffModal, triggerSync, confirmSync };
}
```

- [ ] **Step 2: Add `/api/sync/queue` and `/api/sync/meta` endpoints to `backend/routes/sync.js`**

```js
// GET /api/sync/queue — returns pending queue entries (desktop only)
router.get('/queue', authenticateToken, async (req, res) => {
  const queue = await prisma.syncQueue.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });
  return res.json(queue);
});

// GET /api/sync/meta — returns lastSyncedAt
router.get('/meta', authenticateToken, async (req, res) => {
  const meta = await prisma.syncMeta.findUnique({ where: { id: 'singleton' } });
  return res.json({ lastSyncedAt: meta?.lastSyncedAt ?? null });
});
```

- [ ] **Step 3: Create `frontend/src/components/SyncTrigger.tsx`**

```tsx
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { SyncDiff } from '@/hooks/useSync';

interface Props {
  open: boolean;
  diff: SyncDiff | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SyncTrigger({ open, diff, onConfirm, onCancel }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ready to sync</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <p className="text-sm text-muted-foreground">
            The following changes will be sent to the server:
          </p>
          <ul className="space-y-1">
            {diff && Object.entries(diff).map(([op, count]) => (
              <li key={op} className="text-sm flex justify-between">
                <span>{op.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="font-medium">{count}</span>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button onClick={onConfirm}>Sync now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire up in `App.tsx`**

```tsx
import { useSync } from '@/hooks/useSync';
import { SyncTrigger } from '@/components/SyncTrigger';

// Inside App:
const { showDiffModal, diff, confirmSync, setShowDiffModal } = useSync();

// In JSX, alongside existing routes:
<SyncTrigger
  open={showDiffModal}
  diff={diff}
  onConfirm={confirmSync}
  onCancel={() => setShowDiffModal(false)}
/>
```

- [ ] **Step 5: Test in dev mode**

```bash
cd desktop && npm run dev
```

Click "Sync Now" from tray. Diff modal appears. Confirm fires the sync POST. Check server logs for received operations.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/useSync.ts frontend/src/components/SyncTrigger.tsx \
        frontend/src/App.tsx backend/routes/sync.js
git commit -m "feat: sync trigger with dry-run diff modal"
```

---

### Task 19: Conflict Resolution Panel

**Files:**
- Create: `frontend/src/components/SyncPanel.tsx`
- Modify: `backend/routes/sync.js` (append — do not recreate)

- [ ] **Step 1: Write the failing test for the resolve endpoint**

Add to `backend/__tests__/syncRoute.test.js`:

```js
describe('POST /api/sync/resolve', () => {
  it('returns 400 for invalid resolution value', async () => {
    const res = await request(app)
      .post('/api/sync/resolve')
      .send({ conflictId: 'cid1', resolution: 'invalid' });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd backend && npm test -- syncRoute
```

- [ ] **Step 3: Create `frontend/src/components/SyncPanel.tsx`**

```tsx
import { Button } from '@/components/ui/button';
import axios from 'axios';

interface Conflict {
  id: string;
  localPayload: string;
  serverRecord: Record<string, any>;
}

interface Props {
  conflicts: Conflict[];
  onResolved: () => void;
}

export function SyncPanel({ conflicts, onResolved }: Props) {
  async function resolveConflict(conflictId: string, resolution: 'keep_local' | 'keep_server') {
    await axios.post('/api/sync/resolve', { conflictId, resolution });
    if (conflicts.length === 1) onResolved();
  }

  if (!conflicts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 rounded-lg border bg-background shadow-lg p-4 space-y-4">
      <h3 className="font-semibold text-sm">Sync conflicts ({conflicts.length})</h3>
      {conflicts.map((c) => (
        <div key={c.id} className="rounded border p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="font-medium text-muted-foreground mb-1">Your version</p>
              <pre className="bg-muted rounded p-2 overflow-auto max-h-24">
                {JSON.stringify(JSON.parse(c.localPayload), null, 2)}
              </pre>
            </div>
            <div>
              <p className="font-medium text-muted-foreground mb-1">Server version</p>
              <pre className="bg-muted rounded p-2 overflow-auto max-h-24">
                {JSON.stringify(c.serverRecord, null, 2)}
              </pre>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => resolveConflict(c.id, 'keep_server')}>
              Keep server
            </Button>
            <Button size="sm" onClick={() => resolveConflict(c.id, 'keep_local')}>
              Keep mine
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add `/api/sync/resolve` to `backend/routes/sync.js`**

```js
// POST /api/sync/resolve — resolves a conflict queue entry
router.post('/resolve', authenticateToken, async (req, res) => {
  const { conflictId, resolution } = req.body;

  if (!['keep_local', 'keep_server'].includes(resolution)) {
    return res.status(400).json({ error: 'resolution must be keep_local or keep_server' });
  }

  if (resolution === 'keep_local') {
    // Re-enqueue with forceOverwrite so next sync pushes it unconditionally
    const entry = await prisma.syncQueue.findUnique({ where: { id: conflictId } });
    await prisma.syncQueue.create({
      data: {
        entity: entry.entity,
        entityId: entry.entityId,
        operation: entry.operation,
        payload: entry.payload,
        status: 'pending',
        forceOverwrite: true,
      },
    });
  }

  // Mark the original entry as resolved
  await prisma.syncQueue.update({
    where: { id: conflictId },
    data: { status: 'resolved' },
  });

  await prisma.syncLog.create({
    data: {
      accountId: req.user.clientId,
      operation: 'RESOLVE_CONFLICT',
      entityId: conflictId,
      direction: 'local',
      status: 'resolved',
      resolvedAs: resolution,
    },
  });

  return res.json({ ok: true });
});
```

- [ ] **Step 3: Wire SyncPanel into App.tsx**

```tsx
import { SyncPanel } from '@/components/SyncPanel';

// In JSX:
<SyncPanel conflicts={conflicts} onResolved={() => setConflicts([])} />
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/SyncPanel.tsx backend/routes/sync.js frontend/src/App.tsx
git commit -m "feat: conflict resolution panel"
```

---

### Task 20: Initial Data Seed (First Launch)

**Files:**
- Create: `frontend/src/hooks/useInitialSeed.ts`
- Modify: `frontend/src/pages/Activation.tsx`

- [ ] **Step 1: Create `frontend/src/hooks/useInitialSeed.ts`**

```ts
import axios from 'axios';

export async function runInitialSeed(accountId: string) {
  let page = 0;
  let firstRespondedAt: string | null = null;

  while (true) {
    const { data } = await axios.post('/api/sync/initial', { accountId, page });

    if (page === 0) {
      firstRespondedAt = data.respondedAt;
    }

    // Write data to local backend (which writes to SQLite)
    await axios.post('/api/sync/seed-local', { data: data.data });

    if (!data.hasMore) break;
    page = data.nextPage;
  }

  // Set lastSyncedAt to the server's timestamp from the first page
  if (firstRespondedAt) {
    await axios.post('/api/sync/meta/set', { lastSyncedAt: firstRespondedAt });
  }
}
```

- [ ] **Step 2: Add `/api/sync/seed-local` and `/api/sync/meta/set` to `backend/routes/sync.js`**

```js
// POST /api/sync/seed-local — writes initial pull data to SQLite (desktop only)
router.post('/seed-local', authenticateToken, async (req, res) => {
  const { data } = req.body;
  const { employees = [], companies = [] } = data;

  await prisma.$transaction(async (db) => {
    for (const record of companies) {
      await db.company.upsert({ where: { id: record.id }, create: record, update: record });
    }
    for (const record of employees) {
      await db.employee.upsert({ where: { id: record.id }, create: record, update: record });
    }
  });

  return res.json({ ok: true });
});

// POST /api/sync/meta/set — sets lastSyncedAt in SyncMeta
router.post('/meta/set', authenticateToken, async (req, res) => {
  const { lastSyncedAt } = req.body;
  await prisma.syncMeta.upsert({
    where: { id: 'singleton' },
    create: { id: 'singleton', lastSyncedAt: new Date(lastSyncedAt) },
    update: { lastSyncedAt: new Date(lastSyncedAt) },
  });
  return res.json({ ok: true });
});
```

- [ ] **Step 3: Call `runInitialSeed` after activation in `Activation.tsx`**

```tsx
import { runInitialSeed } from '@/hooks/useInitialSeed';

// After store_license_token:
await runInitialSeed(accountId);
window.location.reload();
```

- [ ] **Step 4: Test first-time flow**

```bash
cd desktop && npm run dev
```

1. Delete any existing `bantu.db` and `license.token`
2. Activate with a valid license key
3. Expected: progress (check network tab), app loads with all data from server populated locally

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useInitialSeed.ts frontend/src/pages/Activation.tsx backend/routes/sync.js
git commit -m "feat: initial data seed on first activation"
```

---

### Task 21: Auto-Updater

**Files:**
- Modify: `desktop/src-tauri/src/main.rs`
- Create: `backend/routes/desktop.js`
- Modify: `backend/index.js`

- [ ] **Step 1: Add `/api/desktop/latest` to the web backend**

Create `backend/routes/desktop.js`:

```js
const express = require('express');
const router = express.Router();

// GET /api/desktop/latest
// Returns the latest desktop app version info for the auto-updater.
// Update this file when releasing a new desktop version.
router.get('/latest', (_req, res) => {
  res.json({
    version: process.env.DESKTOP_VERSION || '0.1.0',
    notes: 'Bug fixes and improvements',
    pub_date: new Date().toISOString(),
    platforms: {
      'darwin-aarch64': {
        url: process.env.DESKTOP_UPDATE_URL_MAC || '',
        signature: process.env.DESKTOP_UPDATE_SIG_MAC || '',
      },
      'windows-x86_64': {
        url: process.env.DESKTOP_UPDATE_URL_WIN || '',
        signature: process.env.DESKTOP_UPDATE_SIG_WIN || '',
      },
    },
  });
});

module.exports = router;
```

Register in `backend/index.js`:

```js
app.use('/api/desktop', require('./routes/desktop'));
```

- [ ] **Step 2: Configure the updater in `tauri.conf.json`**

```json
{
  "plugins": {
    "updater": {
      "endpoints": ["https://your-api-domain.com/api/desktop/latest"],
      "dialog": false,
      "pubkey": "YOUR_TAURI_UPDATER_PUBLIC_KEY"
    }
  }
}
```

Generate update keys:

```bash
cargo tauri signer generate -w ~/.tauri/bantu.key
```

- [ ] **Step 3: Add update check to `main.rs` setup**

```rust
use tauri_plugin_updater::UpdaterExt;

// In .setup() after sidecar is ready:
let handle = app.handle().clone();
tauri::async_runtime::spawn(async move {
    if let Ok(Some(update)) = handle.updater().check().await {
        // Emit to frontend so it can show a banner
        handle.emit("update:available", update.version.clone()).unwrap();
    }
});
```

- [ ] **Step 4: Add `install_update` Tauri command to `commands.rs`**

```rust
use tauri_plugin_updater::UpdaterExt;

/// Downloads and installs the pending update, then relaunches the app.
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    if let Some(update) = updater.check().await.map_err(|e| e.to_string())? {
        update.download_and_install(|_chunk, _total| {}, || {}).await.map_err(|e| e.to_string())?;
        app.restart();
    }
    Ok(())
}
```

Register it in `main.rs` invoke handler:

```rust
.invoke_handler(tauri::generate_handler![
    commands::check_license,
    commands::store_license_token,
    commands::install_update,
])
```

- [ ] **Step 5: Show update banner in frontend**

In `App.tsx`:

```tsx
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

useEffect(() => {
  const unlisten = listen<string>('update:available', (e) => {
    toast.info(`Update available: v${e.payload}`, {
      action: { label: 'Install', onClick: () => invoke('install_update') },
      duration: Infinity,
    });
  });
  return () => { unlisten.then(f => f()); };
}, []);
```

- [ ] **Step 5: Commit**

```bash
git add backend/routes/desktop.js backend/index.js desktop/src-tauri/src/main.rs \
        desktop/src-tauri/tauri.conf.json frontend/src/App.tsx
git commit -m "feat: auto-updater with update banner"
```

---

### Task 22: GitHub Actions CI — Desktop Builds

**Files:**
- Create: `.github/workflows/desktop-release.yml`

- [ ] **Step 1: Create `.github/workflows/desktop-release.yml`**

```yaml
name: Desktop Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build-mac:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - run: cd backend && npm ci
      - run: cd frontend && npm ci
      - run: cd desktop && npm ci

      - name: Build desktop (macOS universal)
        run: npm run build:desktop:mac
        env:
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - uses: actions/upload-artifact@v4
        with:
          name: bantu-mac
          path: desktop/src-tauri/target/release/bundle/dmg/*.dmg

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - uses: dtolnay/rust-toolchain@stable

      - run: cd backend && npm ci
      - run: cd frontend && npm ci
      - run: cd desktop && npm ci

      - name: Build desktop (Windows)
        run: npm run build:desktop:win
        env:
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}

      - uses: actions/upload-artifact@v4
        with:
          name: bantu-windows
          path: desktop/src-tauri/target/release/bundle/msi/*.msi
```

- [ ] **Step 2: Add required secrets to GitHub repo settings**

Go to repo → Settings → Secrets and add:
- `TAURI_SIGNING_PRIVATE_KEY` (from `~/.tauri/bantu.key`)
- `APPLE_CERTIFICATE`, `APPLE_ID`, `APPLE_PASSWORD` (for macOS signing)

- [ ] **Step 3: Tag a release and verify CI produces installers**

```bash
git tag v0.1.0
git push origin v0.1.0
```

Check GitHub Actions — both jobs should produce installer artifacts.

- [ ] **Step 4: Commit the workflow**

```bash
git add .github/workflows/desktop-release.yml
git commit -m "ci: add GitHub Actions desktop build pipeline"
```

---

## Final Checklist

- [ ] Web build still works: `npm run build:web` produces unchanged output
- [ ] Desktop dev mode launches: `npm run dev:desktop` opens Tauri window
- [ ] Offline mode: disconnect internet, create an employee — record appears locally
- [ ] Sync: reconnect internet, tray shows sync prompt, confirm — server receives operation
- [ ] Conflict: edit the same employee on web and desktop, sync — conflict appears in panel
- [ ] License: fresh install shows activation screen; valid key unlocks app
- [ ] Revoked license: revoke machine on server, app shows "deactivated" screen within 30 days
- [ ] All tests pass: `cd backend && npm test`
- [ ] Installer builds: `npm run build:desktop` produces `.dmg` / `.exe`
