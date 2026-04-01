# Payroll Migration Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow Bantu clients to upload a Belina `.bkp` backup during onboarding and have their employees automatically migrated into Bantu without starting from scratch.

**Architecture:** A client uploads their `.bkp` file from the Vercel frontend directly to Google Cloud Storage. The Render backend triggers a Cloud Run worker (SQL Server + Node.js) which restores the SQL Server backup, extracts data into GCS JSON fragments, and returns a manifest path. The Render backend then normalises the fragments and writes them to a `MigrationStaging` table for the client to review before committing to live data.

**Tech Stack:** Node.js 20, Express, Prisma (PostgreSQL), Google Cloud Run, SQL Server 2022 Express, `@google-cloud/storage`, `mssql`, Vitest, React/TypeScript

**Spec:** `docs/superpowers/specs/2026-03-25-payroll-migration-engine-design.md`

**Scope:** Phase 1 only — employee master data migration. Transactions/leave/loans extracted but not committed (Phase 2).

---

## File Map

### New files — Cloud Run Worker (`migration-worker/`)
| File | Purpose |
|---|---|
| `migration-worker/package.json` | Worker dependencies (`mssql`, `@google-cloud/storage`, `express`) |
| `migration-worker/Dockerfile` | SQL Server 2022 + Node 20 image |
| `migration-worker/entrypoint.sh` | Start SQL Server → poll ready → cap memory → start Node |
| `migration-worker/index.js` | Express HTTP server wrapping `migrateBelinaBackup` |
| `migration-worker/migrate.js` | Core extraction logic (`migrateBelinaBackup`) |

### New files — Render Backend (`backend/`)
| File | Purpose |
|---|---|
| `backend/lib/finance.js` | `toCents()` shared utility |
| `backend/routes/migration.js` | `POST /api/migration/start`, `GET /api/migration/:id/status`, `POST /api/migration/:id/confirm` |
| `backend/services/migrationService.js` | Download GCS fragments → normalise employees → write to staging |
| `backend/__tests__/finance.test.js` | Unit tests for `toCents` |
| `backend/__tests__/migrationService.test.js` | Unit tests for `mapEmployee` normalisation |

### Modified files — Render Backend
| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `MigrationJob` and `MigrationStaging` models |
| `backend/index.js` | Register `/api/migration` route |

### New files — Frontend (`frontend/src/`)
| File | Purpose |
|---|---|
| `frontend/src/pages/MigrationUpload.tsx` | Upload step — file picker + progress display |
| `frontend/src/pages/MigrationReview.tsx` | Review step — staged employees table + Confirm button |

---

## Task 1: Shared Finance Utility

**Files:**
- Create: `backend/lib/finance.js`
- Create: `backend/__tests__/finance.test.js`

- [ ] **Step 1: Write failing tests**

```javascript
// backend/__tests__/finance.test.js
import { describe, it, expect } from 'vitest';
import { toCents } from '../lib/finance.js';

describe('toCents', () => {
  it('converts a standard decimal salary', () => {
    expect(toCents(1500.50)).toBe(150050);
  });

  it('rounds to 2 decimal places before converting', () => {
    // 1234.575 → "1234.58" → 123458 (not 123457 due to float imprecision)
    expect(toCents(1234.575)).toBe(123458);
  });

  it('handles null/undefined/zero safely', () => {
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
    expect(toCents(0)).toBe(0);
  });

  it('handles string input from SQL driver', () => {
    expect(toCents('750.25')).toBe(75025);
  });

  it('handles string zero', () => {
    expect(toCents('0')).toBe(0);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npm test -- --reporter=verbose finance
```
Expected: `FAIL — toCents is not a function`

- [ ] **Step 3: Implement**

```javascript
// backend/lib/finance.js
'use strict';

/**
 * Convert a currency value to integer cents.
 * Rounds to 2dp before multiplying to avoid floating-point errors.
 * Safe for null/undefined/string input from SQL drivers.
 * ZIMRA requires cent-accurate payroll figures.
 */
const toCents = (val) =>
  Math.round(parseFloat(parseFloat(val || 0).toFixed(2)) * 100);

module.exports = { toCents };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend && npm test -- --reporter=verbose finance
```
Expected: `5 tests pass`

- [ ] **Step 5: Commit**

```bash
git add backend/lib/finance.js backend/__tests__/finance.test.js
git commit -m "feat(migration): add toCents financial utility with tests"
```

---

## Task 2: Prisma Schema — Migration Models

**Files:**
- Modify: `backend/prisma/schema.prisma` (append two models)

- [ ] **Step 1: Add models to schema**

Append to the bottom of `backend/prisma/schema.prisma`:

```prisma
// ─── Migration ────────────────────────────────────────────────────────────────

enum MigrationStatus {
  PROCESSING
  STAGED
  CONFIRMED
  FAILED
}

model MigrationJob {
  id          String          @id @default(uuid())
  clientId    String
  companyId   String
  source      String          // "Belina_BKP"
  status      MigrationStatus @default(PROCESSING)
  manifestUrl String?         // GCS path to manifest.json
  truncated   Json?           // { employees: false, transactions: true, ... }
  errorMsg    String?
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt
  records     MigrationStaging[]

  @@index([clientId])
  @@index([status])
}

model MigrationStaging {
  id             String         @id @default(uuid())
  jobId          String
  job            MigrationJob   @relation(fields: [jobId], references: [id])
  entityType     String         // "employee"
  rawSnapshot    Json           // Original Belina row (for audit/comparison)
  normalised     Json           // Mapped Bantu fields ready to insert
  status         String         @default("STAGED") // STAGED | CONFIRMED | REJECTED
  unmappedFields Json?          // Fields the client needs to manually map
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  @@index([jobId])
  @@index([entityType])
}
```

- [ ] **Step 2: Generate and run migration**

```bash
cd backend && npx prisma migrate dev --name add_migration_models
```
Expected: `Migration applied. Generated Prisma Client.`

- [ ] **Step 3: Verify the migration ran**

```bash
cd backend && npx prisma studio
```
Confirm `MigrationJob` and `MigrationStaging` tables appear. Close Prisma Studio.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(migration): add MigrationJob and MigrationStaging Prisma models"
```

---

## Task 3: GCS Bucket Setup Script

**Files:**
- Create: `backend/scripts/setup-gcs-bucket.js`

This is a one-time setup script. Run it once when deploying to production.

- [ ] **Step 1: Install GCS SDK in backend**

```bash
cd backend && npm install @google-cloud/storage
```

- [ ] **Step 2: Create setup script**

```javascript
// backend/scripts/setup-gcs-bucket.js
'use strict';

/**
 * One-time GCS bucket setup for the Bantu Migration Engine.
 * Run: node scripts/setup-gcs-bucket.js
 *
 * Requires: GOOGLE_CLOUD_PROJECT and MIGRATION_BUCKET env vars.
 */

require('dotenv').config();
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const BUCKET_NAME = process.env.MIGRATION_BUCKET;

if (!BUCKET_NAME) {
  console.error('FATAL: MIGRATION_BUCKET env var not set');
  process.exit(1);
}

async function setup() {
  // Create bucket if it doesn't exist
  const [bucket] = await storage.createBucket(BUCKET_NAME, {
    location: 'US',
    storageClass: 'STANDARD',
  }).catch(err => {
    if (err.code === 409) return [storage.bucket(BUCKET_NAME)]; // already exists
    throw err;
  });

  // temp/ — 30-day auto-delete
  await bucket.addLifecycleRule({
    action: { type: 'Delete' },
    condition: { age: 30, matchesPrefix: ['temp/'] },
  });

  // archive/ — 7-year retention (ZIMRA compliance)
  await bucket.addLifecycleRule({
    action: { type: 'Delete' },
    condition: { age: 2555, matchesPrefix: ['archive/'] }, // 7 * 365
  });

  console.log(`✓ Bucket ${BUCKET_NAME} configured with lifecycle policies`);
}

setup().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Add MIGRATION_BUCKET to .env.example**

Add this line to `backend/.env.example`:
```
MIGRATION_BUCKET="bantu-migrations-dev"
CLOUD_RUN_WORKER_URL="https://bantu-migration-worker-xxxx-uc.a.run.app"
GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/setup-gcs-bucket.js backend/.env.example
git commit -m "feat(migration): add GCS bucket setup script with lifecycle policies"
```

---

## Task 4: Cloud Run Worker — Package + Dockerfile + Entrypoint

**Files:**
- Create: `migration-worker/package.json`
- Create: `migration-worker/Dockerfile`
- Create: `migration-worker/entrypoint.sh`

- [ ] **Step 1: Create the worker directory and package.json**

```bash
mkdir -p migration-worker
```

```json
// migration-worker/package.json
{
  "name": "bantu-migration-worker",
  "version": "1.0.0",
  "description": "Belina .bkp extraction engine for Bantu",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "@google-cloud/storage": "^7.0.0",
    "express": "^4.18.0",
    "mssql": "^11.0.0"
  }
}
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
# migration-worker/Dockerfile

# ── Stage 1: Node dependency builder ─────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime (SQL Server 2022 base) ───────────────────────
FROM mcr.microsoft.com/mssql/server:2022-latest
USER root

# Install Node.js 20 (pinned via GPG — avoids deprecated apt-key method)
RUN mkdir -p /etc/apt/keyrings \
    && apt-get update && apt-get install -y curl gnupg2 \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
       | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" \
       | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y nodejs --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY . .

ENV PATH="$PATH:/opt/mssql-tools18/bin"
# ACCEPT_EULA=Y acknowledges the Microsoft SQL Server Express EULA.
# Legal review required before production deployment.
ENV ACCEPT_EULA=Y
ENV MSSQL_PID=Express
# MSSQL_SA_PASSWORD and MIGRATION_BUCKET are injected at runtime via
# Cloud Run Secret Manager — never hardcode them here.

EXPOSE 8080
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]
```

- [ ] **Step 3: Create entrypoint.sh**

```bash
#!/bin/bash
# migration-worker/entrypoint.sh

set -e

# 1. Start SQL Server 2022 Express in background
/opt/mssql/bin/sqlservr &

# 2. Smart poll — don't waste billed seconds with a blind sleep.
#    Start the moment SQL Server is ready to accept connections.
echo "[Bantu Worker] Waiting for SQL Server to be ready..."
until /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" \
  -Q "SELECT 1" -No &>/dev/null; do
  sleep 1
done
echo "[Bantu Worker] SQL Server ready."

# 3. Hard memory cap — MUST run before any RESTORE.
#    Without this, SQL Server grabs all available RAM and OOMs the container.
/opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -No -Q "
    EXEC sys.sp_configure 'show advanced options', 1;
    RECONFIGURE;
    EXEC sys.sp_configure 'max server memory (MB)', 1400;
    RECONFIGURE;
  "
echo "[Bantu Worker] Memory cap applied (1400 MB)."

# 4. Start Node.js with a strict heap cap.
#    300 MB for Node + 1400 MB for SQL Server = 1700 MB, within 2 GB Cloud Run limit.
echo "[Bantu Worker] Starting Migration API on port 8080..."
exec node --max-old-space-size=300 index.js
```

- [ ] **Step 4: Install dependencies locally (for IDE autocomplete)**

```bash
cd migration-worker && npm install
```

- [ ] **Step 5: Commit**

```bash
cd .. && git add migration-worker/
git commit -m "feat(migration): add Cloud Run worker Dockerfile and entrypoint"
```

---

## Task 5: Cloud Run Worker — Core Extraction Logic

**Files:**
- Create: `migration-worker/migrate.js`

- [ ] **Step 1: Create migrate.js**

```javascript
// migration-worker/migrate.js
'use strict';

const { execSync } = require('child_process');
const sql = require('mssql');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();
const BUCKET_NAME = process.env.MIGRATION_BUCKET;

/** Strip all chars that could cause shell/SQL injection in system identifiers */
const sanitize = (str) => str.replace(/[^a-zA-Z0-9_-]/g, '');

/** Escape single quotes in SQL string literals */
const escapeSql = (str) => str.replace(/'/g, "''");

/**
 * Tables to extract from Belina. Pattern is matched against Belina's
 * INFORMATION_SCHEMA.TABLES using case-insensitive includes().
 * Tables are ordered alphabetically by INFORMATION_SCHEMA — first match wins.
 */
const TABLES_TO_MIGRATE = [
  { key: 'employees',    pattern: 'Employee' },
  { key: 'transactions', pattern: 'Trans' },   // Extracted but not committed in Phase 1
  { key: 'leave',        pattern: 'Leave' },   // Extracted but not committed in Phase 1
  { key: 'loans',        pattern: 'Loan' },    // Extracted but not committed in Phase 1
];

/**
 * @param {string} gcsSourcePath - GCS path to the uploaded .bkp (e.g. temp/{clientId}/{jobId}/upload.bkp)
 * @param {string} rawClientId   - Client ID from Bantu (will be sanitized)
 * @param {string} rawJobId      - Job ID from Bantu (will be sanitized)
 * @returns {{ status: 'success', manifestGcsPath: string, truncated: object }}
 */
async function migrateBelinaBackup(gcsSourcePath, rawClientId, rawJobId) {
  const clientId = sanitize(rawClientId);
  const jobId    = sanitize(rawJobId);
  // Include jobId in dbName to ensure idempotency — re-running the same job
  // doesn't collide with a previous failed run.
  const dbName   = `Mig_${clientId}_${jobId}`;
  const password = process.env.MSSQL_SA_PASSWORD;
  const localBkpPath = `/tmp/${dbName}.bkp`;
  const sqlFile      = `/tmp/${dbName}_restore.sql`;

  const baseConfig = {
    user: 'sa',
    password,
    server: 'localhost',
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
    pool: { max: 1, min: 0, idleTimeoutMillis: 3000 },
    requestTimeout: 60000, // 60s — DDL/header reads can be slow on large files
  };

  let masterPool;
  try {
    // ── Step 0a: Download .bkp from GCS temp/ to /tmp ────────────
    console.log(`[migrate] Downloading ${gcsSourcePath}...`);
    await storage.bucket(BUCKET_NAME).file(gcsSourcePath).download({
      destination: localBkpPath,
    });

    // ── Step 0b: Copy .bkp to archive/ for 7-year audit trail ────
    const archiveBkpPath = `archive/${clientId}/${jobId}/original.bkp`;
    await storage.bucket(BUCKET_NAME).file(gcsSourcePath)
      .copy(storage.bucket(BUCKET_NAME).file(archiveBkpPath));
    console.log(`[migrate] Archived .bkp to ${archiveBkpPath}`);

    masterPool = await sql.connect(baseConfig);

    // ── Step 1: Discover logical file names from backup header ────
    // SQL Server needs the logical names to know where to place .mdf and .ldf
    const fileList = await masterPool.request()
      .query(`RESTORE FILELISTONLY FROM DISK = N'${escapeSql(localBkpPath)}'`);

    const dataFile = fileList.recordset.find(f => f.Type === 'D')?.LogicalName;
    const logFile  = fileList.recordset.find(f => f.Type === 'L')?.LogicalName;

    if (!dataFile || !logFile) {
      throw new Error(
        'Invalid Belina backup: could not locate internal data or log streams. ' +
        'Ensure this is an unmodified Belina .bkp file.'
      );
    }
    console.log(`[migrate] Logical names: data="${dataFile}" log="${logFile}"`);

    // ── Step 2: Restore via temp .sql file ───────────────────────
    // Writing SQL to a file avoids shell-escaping nightmares with newlines
    // and special characters in logical file names.
    const restoreScript =
      `RESTORE DATABASE [${dbName}] FROM DISK = N'${escapeSql(localBkpPath)}' ` +
      `WITH REPLACE, ` +
      `MOVE '${escapeSql(dataFile)}' TO '/tmp/${dbName}.mdf', ` +
      `MOVE '${escapeSql(logFile)}' TO '/tmp/${dbName}.ldf';`;

    fs.writeFileSync(sqlFile, restoreScript);
    console.log(`[migrate] Restoring database ${dbName}...`);

    execSync(`sqlcmd -S localhost -U sa -i "${sqlFile}" -No`, {
      env: { ...process.env, SQLCMDPASSWORD: password },
      timeout: 300000, // 5-minute hard limit for the restore operation
    });
    console.log(`[migrate] Restore complete.`);

    // ── Step 3: Extract + Fragment ────────────────────────────────
    const manifest = {
      clientId,
      jobId,
      timestamp: new Date().toISOString(),
      fragments: {},
      truncated: {},
      context: {},
    };

    let dbPool;
    try {
      dbPool = await new sql.ConnectionPool({ ...baseConfig, database: dbName }).connect();

      // Context: Whitelist specific fields only — avoid storing PII or secrets
      // from CompanyParameters in the 7-year GCS archive.
      try {
        const ctx = await dbPool.request().query(`
          SELECT TOP 1 Currency, TaxYear, HoursPerDay, WorkingHoursPerDay, CompanyName
          FROM dbo.CompanyParameters
        `);
        manifest.context = ctx.recordset[0] || { _warning: 'Manual context required' };
      } catch {
        manifest.context = { _error: 'CompanyParameters not found — configure manually in Bantu' };
      }

      // Discover all base tables (unfiltered — Trans/Leave/Loan won't match 'Employee')
      const allTablesResult = await dbPool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);
      const allTableNames = allTablesResult.recordset.map(r => r.TABLE_NAME);
      console.log(`[migrate] Found ${allTableNames.length} tables in Belina DB`);

      // Extract each table → save to GCS immediately → clear memory
      for (const target of TABLES_TO_MIGRATE) {
        try {
          const tableName = allTableNames.find(
            t => t.toLowerCase().includes(target.pattern.toLowerCase())
          );
          if (!tableName) {
            console.warn(`[migrate] Table pattern "${target.pattern}" not found — skipped`);
            continue;
          }

          // Use TOP 1001 to accurately detect truncation without false positives
          // when a table happens to have exactly 1,000 rows.
          const result = await dbPool.request()
            .query(`SELECT TOP 1001 * FROM [${tableName}]`);

          const wasTruncated = result.recordset.length > 1000;
          if (wasTruncated) result.recordset = result.recordset.slice(0, 1000);
          manifest.truncated[target.key] = wasTruncated;

          if (wasTruncated) {
            console.warn(`[migrate] WARNING: ${target.key} truncated at 1,000 rows — requires support escalation`);
          }

          const fragmentPath = `archive/${clientId}/${jobId}/fragments/${target.key}.json`;
          await storage.bucket(BUCKET_NAME).file(fragmentPath).save(
            JSON.stringify(result.recordset),
            { contentType: 'application/json', resumable: true }
          );

          manifest.fragments[target.key] = `gs://${BUCKET_NAME}/${fragmentPath}`;
          result.recordset = null; // Release memory before next query
          console.log(`[migrate] Saved ${target.key} fragment (truncated: ${wasTruncated})`);
        } catch (e) {
          console.warn(`[migrate] Optional table "${target.pattern}" error: ${e.message} — skipped`);
        }
      }

      // Save manifest — this is the entry point Render uses to find all fragments
      const manifestPath = `archive/${clientId}/${jobId}/manifest.json`;
      await storage.bucket(BUCKET_NAME).file(manifestPath).save(
        JSON.stringify(manifest),
        { contentType: 'application/json', resumable: false }
      );
      console.log(`[migrate] Manifest saved: ${manifestPath}`);

      return {
        status: 'success',
        manifestGcsPath: `gs://${BUCKET_NAME}/${manifestPath}`,
        truncated: manifest.truncated,
      };

    } finally {
      if (dbPool) await dbPool.close();
    }

  } finally {
    // Guaranteed cleanup — runs even on error.
    // Leaves a clean container for the next request.
    if (masterPool) {
      try {
        // Parameterized WHERE clause prevents injection in the sys.databases lookup.
        // DDL still uses bracket-quoted identifier (SQL Server doesn't support params for identifiers).
        await masterPool.request()
          .input('dbName', sql.NVarChar, dbName)
          .query(`
            IF EXISTS (SELECT name FROM sys.databases WHERE name = @dbName)
            BEGIN
              ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
              DROP DATABASE [${dbName}];
            END
          `);
      } catch (err) {
        console.error('[migrate] Cleanup warning (DROP DATABASE):', err.message);
      }

      [localBkpPath, sqlFile, `/tmp/${dbName}.mdf`, `/tmp/${dbName}.ldf`].forEach(f => {
        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
      });

      await masterPool.close();
      console.log('[migrate] Cleanup complete.');
    }
  }
}

module.exports = { migrateBelinaBackup };
```

- [ ] **Step 2: Commit**

```bash
git add migration-worker/migrate.js
git commit -m "feat(migration): add Belina backup extraction logic (Cloud Run worker)"
```

---

## Task 6: Cloud Run Worker — HTTP Server

**Files:**
- Create: `migration-worker/index.js`

- [ ] **Step 1: Create Express HTTP server**

```javascript
// migration-worker/index.js
'use strict';

const express = require('express');
const { migrateBelinaBackup } = require('./migrate');

const app = express();
app.use(express.json({ limit: '1mb' })); // Request body is tiny — just paths

const PORT = process.env.PORT || 8080;

// Health check — Cloud Run uses this to confirm the container is up
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

/**
 * POST /migrate
 * Body: { gcsSourcePath, clientId, jobId }
 * Called by Render backend (internal only — not public).
 *
 * Cloud Run is invoked synchronously with up to 15-minute timeout.
 * Render awaits this response before updating job status.
 */
app.post('/migrate', async (req, res) => {
  const { gcsSourcePath, clientId, jobId } = req.body;

  if (!gcsSourcePath || !clientId || !jobId) {
    return res.status(400).json({ error: 'Missing required fields: gcsSourcePath, clientId, jobId' });
  }

  console.log(`[worker] Migration started: clientId=${clientId} jobId=${jobId}`);

  try {
    const result = await migrateBelinaBackup(gcsSourcePath, clientId, jobId);
    console.log(`[worker] Migration complete: ${result.manifestGcsPath}`);
    return res.json(result);
  } catch (err) {
    console.error(`[worker] Migration failed: ${err.message}`);
    return res.status(500).json({
      status: 'failed',
      error: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`[worker] Bantu Migration Worker listening on port ${PORT}`);
});
```

- [ ] **Step 2: Commit**

```bash
git add migration-worker/index.js
git commit -m "feat(migration): add Cloud Run HTTP server wrapper"
```

---

## Task 7: Render Backend — Migration Service

**Files:**
- Create: `backend/services/migrationService.js`
- Create: `backend/__tests__/migrationService.test.js`

- [ ] **Step 1: Write failing tests for mapEmployee**

```javascript
// backend/__tests__/migrationService.test.js
import { describe, it, expect } from 'vitest';
import { mapEmployee } from '../services/migrationService.js';

describe('mapEmployee', () => {
  const defaultContext = { HoursPerDay: 8, Currency: 'USD' };

  it('maps standard Belina employee fields to Bantu fields', () => {
    const raw = {
      EmployeeCode: 'HE01',
      FirstName: 'John',
      Surname: 'Doe',
      IDNumber: '63-123456A78',
      BasicPay: 1500.50,
      ContractStartDate: new Date('2022-01-01'),
    };

    const result = mapEmployee(raw, defaultContext);

    expect(result.employeeExternalId).toBe('HE01');
    expect(result.firstName).toBe('John');
    expect(result.lastName).toBe('Doe');
    expect(result.idNumber).toBe('63123456A78'); // dashes stripped
    expect(result.baseSalaryCents).toBe(150050);
    expect(result.startDate).toEqual(new Date('2022-01-01'));
    expect(result.status).toBe('STAGED');
    expect(result.migrationSource).toBe('Belina_BKP');
  });

  it('falls back to alternate field names for older Belina versions', () => {
    const raw = { Emp_No: 'CP001', F_Name: 'Jane', LastName: 'Smith', BasicPay: 0 };
    const result = mapEmployee(raw, defaultContext);
    expect(result.employeeExternalId).toBe('CP001');
    expect(result.firstName).toBe('Jane');
    expect(result.lastName).toBe('Smith');
  });

  it('converts leave days to hours using HoursPerDay from context', () => {
    const raw = { LeaveDays: 10, BasicPay: 0 };
    const result = mapEmployee(raw, { HoursPerDay: 7.5 });
    expect(result.leaveBalanceHours).toBe(75); // 10 * 7.5
  });

  it('returns 0 leaveBalanceHours when LeaveDays is absent', () => {
    const result = mapEmployee({ BasicPay: 0 }, defaultContext);
    expect(result.leaveBalanceHours).toBe(0);
  });

  it('strips non-alphanumeric characters from ID number', () => {
    const raw = { IDNumber: '63-123456A78', BasicPay: 0 };
    const result = mapEmployee(raw, defaultContext);
    expect(result.idNumber).toBe('63123456A78');
  });

  it('handles null dates gracefully', () => {
    const raw = { BasicPay: 0, DateOfBirth: null, ContractEndDate: null };
    const result = mapEmployee(raw, defaultContext);
    expect(result.dateOfBirth).toBeNull();
    expect(result.dischargeDate).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npm test -- --reporter=verbose migrationService
```
Expected: `FAIL — mapEmployee is not a function`

- [ ] **Step 3: Implement migrationService.js**

```javascript
// backend/services/migrationService.js
'use strict';

const { Storage } = require('@google-cloud/storage');
const prisma = require('../lib/prisma');
const { toCents } = require('../lib/finance');

const storage = new Storage();
const BUCKET_NAME = process.env.MIGRATION_BUCKET;

/**
 * Map a raw Belina employee row to Bantu's normalised format.
 * Handles field name variations across Belina versions.
 * All currency values stored as integer cents (ZIMRA-compliant).
 *
 * @param {object} raw     - Raw row from Belina's Employee table
 * @param {object} context - Parsed CompanyParameters (provides HoursPerDay)
 */
function mapEmployee(raw, context) {
  const hoursPerDay = parseFloat(
    context?.HoursPerDay || context?.WorkingHoursPerDay || 8
  );

  return {
    // Field mapping — handles both naming conventions across Belina versions
    employeeExternalId: raw.EmployeeCode || raw.Emp_No,
    firstName:          raw.FirstName    || raw.F_Name,
    lastName:           raw.Surname      || raw.LastName,
    idNumber:           raw.IDNumber?.replace(/[^a-zA-Z0-9]/g, '') ?? null,

    // Dates: mssql driver already returns JS Date objects — no conversion needed
    dateOfBirth:   raw.DateOfBirth       ?? null,
    startDate:     raw.ContractStartDate ?? null,
    dischargeDate: raw.ContractEndDate   ?? null,

    // Currency: integer cents for ZIMRA-level accuracy
    baseSalaryCents: toCents(raw.BasicPay),

    // Leave: convert days → hours using company-configured hours per day
    // Preserve 2 decimal places (quarter-hour precision)
    leaveBalanceHours: raw.LeaveDays
      ? Math.round(
          parseFloat(parseFloat(raw.LeaveDays).toFixed(2)) * hoursPerDay * 100
        ) / 100
      : 0,

    migrationSource: 'Belina_BKP',
    status: 'STAGED',
  };
}

/**
 * Download a GCS fragment file and parse it as JSON.
 */
async function downloadFragment(gcsPath) {
  // gcsPath format: "gs://bucket-name/archive/..."
  const pathWithoutScheme = gcsPath.replace(/^gs:\/\/[^/]+\//, '');
  const [contents] = await storage.bucket(BUCKET_NAME).file(pathWithoutScheme).download();
  return JSON.parse(contents.toString());
}

/**
 * Process a completed Cloud Run job:
 * 1. Download manifest from GCS
 * 2. Download employees fragment
 * 3. Normalise each employee via mapEmployee
 * 4. Write normalised records to MigrationStaging
 * 5. Update MigrationJob status to STAGED
 *
 * @param {string} jobId          - Bantu MigrationJob ID
 * @param {string} manifestGcsPath - GCS path returned by Cloud Run
 * @param {object} truncated      - Truncation flags from Cloud Run response
 */
async function processMigrationResult(jobId, manifestGcsPath, truncated) {
  // Download manifest
  const manifest = await downloadFragment(manifestGcsPath);
  const context  = manifest.context || {};

  // Download and normalise employees (Phase 1 only)
  const rawEmployees = manifest.fragments.employees
    ? await downloadFragment(manifest.fragments.employees)
    : [];

  const stagedRecords = rawEmployees.map(raw => ({
    jobId,
    entityType:    'employee',
    rawSnapshot:   raw,
    normalised:    mapEmployee(raw, context),
    status:        'STAGED',
  }));

  // Write all staged records + update job status in one transaction
  await prisma.$transaction([
    prisma.migrationStaging.createMany({ data: stagedRecords }),
    prisma.migrationJob.update({
      where: { id: jobId },
      data: {
        status:      'STAGED',
        manifestUrl: manifestGcsPath,
        truncated:   truncated || {},
      },
    }),
  ]);

  return { stagedCount: stagedRecords.length };
}

/**
 * Commit STAGED employee records to the live Employee table.
 * Called when the client clicks "Confirm Migration" in the Review UI.
 *
 * @param {string} jobId     - MigrationJob ID to confirm
 * @param {string} companyId - Bantu company ID to assign employees to
 * @param {string} clientId  - Bantu client ID
 */
async function confirmMigration(jobId, companyId, clientId) {
  const staged = await prisma.migrationStaging.findMany({
    where: { jobId, entityType: 'employee', status: 'STAGED' },
  });

  if (!staged.length) {
    throw new Error('No staged employee records found for this job');
  }

  // Build Employee create payloads from normalised data
  const employeeData = staged.map(record => {
    const n = record.normalised;
    return {
      clientId,
      companyId,
      employeeCode:  n.employeeExternalId,
      firstName:     n.firstName      || 'Unknown',
      lastName:      n.lastName       || 'Unknown',
      nationalId:    n.idNumber,
      dateOfBirth:   n.dateOfBirth,
      // startDate is non-nullable in Bantu — fall back to today if Belina didn't supply one.
      // The client must correct this in the Bantu UI after migration.
      startDate:     n.startDate || new Date(),
      dischargeDate: n.dischargeDate,
      // baseRate stored as dollars (Bantu's Employee model uses Float for baseRate)
      baseRate:      n.baseSalaryCents / 100,
      position:      'Migrated Employee', // client updates via Bantu UI
    };
  });

  await prisma.$transaction([
    prisma.employee.createMany({ data: employeeData, skipDuplicates: true }),
    prisma.migrationStaging.updateMany({
      where: { jobId, entityType: 'employee' },
      data:  { status: 'CONFIRMED' },
    }),
    prisma.migrationJob.update({
      where: { id: jobId },
      data:  { status: 'CONFIRMED' },
    }),
  ]);

  return { confirmedCount: employeeData.length };
}

module.exports = { mapEmployee, processMigrationResult, confirmMigration };
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend && npm test -- --reporter=verbose migrationService
```
Expected: `7 tests pass`

- [ ] **Step 5: Commit**

```bash
git add backend/services/migrationService.js backend/__tests__/migrationService.test.js
git commit -m "feat(migration): add migration service with mapEmployee normalisation and tests"
```

---

## Task 8: Render Backend — Migration Routes

**Files:**
- Create: `backend/routes/migration.js`
- Modify: `backend/index.js`

- [ ] **Step 1: Create migration route**

```javascript
// backend/routes/migration.js
'use strict';

const express = require('express');
const { Storage } = require('@google-cloud/storage');
const prisma  = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');
const { processMigrationResult, confirmMigration } = require('../services/migrationService');

const router = express.Router();
const storage = new Storage();
const BUCKET_NAME = process.env.MIGRATION_BUCKET;
const WORKER_URL  = process.env.CLOUD_RUN_WORKER_URL;

/**
 * POST /api/migration/upload-url
 * Returns a GCS signed URL for direct client-to-GCS upload.
 * The client uploads the .bkp directly to GCS — the file never passes through Render.
 * After upload completes, client calls POST /api/migration/start with the jobId.
 */
router.post('/upload-url', requirePermission('manage_employees'), async (req, res) => {
  const { companyId, filename } = req.body;
  if (!companyId) return res.status(400).json({ error: 'companyId is required' });
  if (!filename?.toLowerCase().endsWith('.bkp')) {
    return res.status(400).json({ error: 'Only .bkp files are accepted' });
  }

  const clientId = req.user.clientId;

  // Create the job record first so we have an ID for the GCS path
  const job = await prisma.migrationJob.create({
    data: { clientId, companyId, source: 'Belina_BKP', status: 'PROCESSING' },
  });

  const gcsPath = `temp/${clientId}/${job.id}/upload.bkp`;
  const [signedUrl] = await storage.bucket(BUCKET_NAME).file(gcsPath).getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + 30 * 60 * 1000, // 30 minutes
    contentType: 'application/octet-stream',
  });

  return res.json({ jobId: job.id, uploadUrl: signedUrl, gcsPath });
});

/**
 * POST /api/migration/start
 * Called by the frontend after the GCS signed-URL upload completes.
 * Triggers the Cloud Run worker in the background.
 */
router.post('/start', requirePermission('manage_employees'), async (req, res) => {
  const { jobId, gcsPath } = req.body;
  if (!jobId || !gcsPath) return res.status(400).json({ error: 'jobId and gcsPath are required' });

  const clientId = req.user.clientId;

  // Confirm the job belongs to this client
  const job = await prisma.migrationJob.findFirst({
    where: { id: jobId, clientId, status: 'PROCESSING' },
  });
  if (!job) return res.status(404).json({ error: 'Job not found or already started' });

  // Trigger Cloud Run worker in background (don't block the HTTP response)
  res.json({ jobId: job.id, status: 'PROCESSING' });

  // Background: call Cloud Run synchronously (it handles its own timeout)
  setImmediate(async () => {
    try {
      // Fetch an identity token for Cloud Run (requires GOOGLE_APPLICATION_CREDENTIALS)
      const { GoogleAuth } = require('google-auth-library');
      const auth = new GoogleAuth();
      const client = await auth.getIdTokenClient(WORKER_URL);
      const tokenRes = await client.getRequestHeaders();

      const response = await fetch(`${WORKER_URL}/migrate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...tokenRes },
        body: JSON.stringify({ gcsSourcePath: gcsPath, clientId, jobId: job.id }),
        signal: AbortSignal.timeout(900_000), // 15 min timeout
      });

      const result = await response.json();

      if (result.status === 'success') {
        await processMigrationResult(job.id, result.manifestGcsPath, result.truncated);
      } else {
        await prisma.migrationJob.update({
          where: { id: job.id },
          data: { status: 'FAILED', errorMsg: result.error || 'Worker returned failure' },
        });
      }
    } catch (err) {
      console.error(`[migration] Background worker failed for job ${job.id}:`, err.message);
      await prisma.migrationJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMsg: err.message },
      }).catch(() => {}); // Don't throw — job is already done
    }
  });
});

/**
 * GET /api/migration/:id/status
 * Poll job status. Frontend polls this every 5s during the migration.
 */
router.get('/:id/status', requirePermission('manage_employees'), async (req, res) => {
  const job = await prisma.migrationJob.findFirst({
    where: { id: req.params.id, clientId: req.user.clientId },
    include: {
      _count: { select: { records: true } },
    },
  });

  if (!job) return res.status(404).json({ error: 'Job not found' });

  return res.json({
    jobId:      job.id,
    status:     job.status,
    truncated:  job.truncated,
    errorMsg:   job.errorMsg,
    recordCount: job._count.records,
  });
});

/**
 * GET /api/migration/:id/preview
 * Returns staged employee records for the Review UI.
 */
router.get('/:id/preview', requirePermission('manage_employees'), async (req, res) => {
  const job = await prisma.migrationJob.findFirst({
    where: { id: req.params.id, clientId: req.user.clientId, status: 'STAGED' },
  });
  if (!job) return res.status(404).json({ error: 'Staged job not found' });

  const records = await prisma.migrationStaging.findMany({
    where: { jobId: job.id, entityType: 'employee' },
    orderBy: { createdAt: 'asc' },
  });

  return res.json({ job, records });
});

/**
 * POST /api/migration/:id/confirm
 * Commit staged employees to the live Employee table.
 * Blocked if any fragment was truncated.
 */
router.post('/:id/confirm', requirePermission('manage_employees'), async (req, res) => {
  const job = await prisma.migrationJob.findFirst({
    where: { id: req.params.id, clientId: req.user.clientId, status: 'STAGED' },
  });

  if (!job) return res.status(404).json({ error: 'Staged job not found' });

  // Block confirm if any table was truncated — data would be incomplete
  const truncated = job.truncated || {};
  const anyTruncated = Object.values(truncated).some(Boolean);
  if (anyTruncated) {
    return res.status(409).json({
      error: 'Migration contains truncated data. Please contact support to complete this migration.',
      truncated,
    });
  }

  const result = await confirmMigration(job.id, req.body.companyId, req.user.clientId);

  await audit(req, 'migration.confirmed', {
    jobId:          job.id,
    confirmedCount: result.confirmedCount,
  });

  return res.json({ success: true, confirmedCount: result.confirmedCount });
});

module.exports = router;
```

- [ ] **Step 2: Register route in index.js**

Add this line to `backend/index.js` after the other route registrations (line ~152, before the bank-files block). Do NOT pass `authenticateToken` or `companyContext` here — they are already applied globally at lines 83–84:

```javascript
// Migration (Belina BKP import)
app.use('/api/migration', require('./routes/migration'));
```

- [ ] **Step 3: Install google-auth-library**

```bash
cd backend && npm install google-auth-library
```

- [ ] **Step 4: Start the backend and verify routes are registered**

```bash
cd backend && npm run dev
```
Expected: Server starts on port 5005. No crashes.

Check with:
```bash
curl http://localhost:5005/api/migration/nonexistent/status \
  -H "Authorization: Bearer your-test-token"
```
Expected: `401` or `404` (not 404 for route not found, which would be a different error)

- [ ] **Step 5: Commit**

```bash
git add backend/routes/migration.js backend/index.js backend/package.json backend/package-lock.json
git commit -m "feat(migration): add migration API routes (upload-url, start, status, preview, confirm)"
```

---

## Task 9: Frontend — Migration Upload Page

**Files:**
- Create: `frontend/src/pages/MigrationUpload.tsx`

- [ ] **Step 1: Create the upload page**

```tsx
// frontend/src/pages/MigrationUpload.tsx
import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type Stage = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

const POLL_INTERVAL_MS = 5000;

const STAGE_LABELS: Record<string, string> = {
  PROCESSING: 'Restoring your Belina database...',
  STAGED:     'Ready for your review',
  CONFIRMED:  'Migration complete',
  FAILED:     'Migration failed',
};

export default function MigrationUpload() {
  const navigate   = useNavigate();
  const fileRef    = useRef<HTMLInputElement>(null);
  const [stage, setStage]   = useState<Stage>('idle');
  const [jobId, setJobId]   = useState<string | null>(null);
  const [error, setError]   = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState('');

  const pollStatus = (id: string) => {
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/migration/${id}/status`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        });
        const data = await res.json();
        setStatusMsg(STAGE_LABELS[data.status] || data.status);

        if (data.status === 'STAGED') {
          clearInterval(timer);
          setStage('done');
          navigate(`/migration/${id}/review`);
        } else if (data.status === 'FAILED') {
          clearInterval(timer);
          setStage('error');
          setError(data.errorMsg || 'Migration failed. Please contact support.');
        }
      } catch {
        // Transient network error — keep polling
      }
    }, POLL_INTERVAL_MS);
  };

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setStage('uploading');
    setError(null);
    setStatusMsg('Requesting upload URL...');

    const authHeaders = { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' };

    try {
      // Step 1: Get a GCS signed URL — file never passes through Render
      const urlRes = await fetch('/api/migration/upload-url', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ companyId: 'TODO_GET_FROM_CONTEXT', filename: file.name }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json();
        throw new Error(err.error || 'Could not get upload URL');
      }
      const { jobId: id, uploadUrl, gcsPath } = await urlRes.json();
      setJobId(id);
      setStatusMsg('Uploading backup directly to secure storage...');

      // Step 2: PUT directly to GCS — bypasses Render entirely
      const uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      if (!uploadRes.ok) throw new Error('Upload to storage failed — please try again');

      setStatusMsg('Waking up migration engine...');

      // Step 3: Tell Render to trigger the Cloud Run worker
      const startRes = await fetch('/api/migration/start', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ jobId: id, gcsPath }),
      });
      if (!startRes.ok) {
        const err = await startRes.json();
        throw new Error(err.error || 'Failed to start migration');
      }

      setStage('processing');
      pollStatus(id);
    } catch (err: any) {
      setStage('error');
      setError(err.message);
    }
  };

  return (
    <div className="max-w-lg mx-auto mt-16 p-8 bg-white rounded-xl shadow">
      <h1 className="text-2xl font-bold mb-2">Import from Belina</h1>
      <p className="text-gray-500 mb-6">
        Upload your Belina <code>.bkp</code> backup file. We'll securely restore
        your employees and let you review before confirming.
      </p>

      {stage === 'idle' && (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".bkp,.Bkp,.BKP"
            className="block w-full border rounded p-2 mb-4"
          />
          <button
            onClick={handleUpload}
            className="w-full bg-blue-600 text-white py-2 rounded font-semibold hover:bg-blue-700"
          >
            Upload and Migrate
          </button>
        </>
      )}

      {(stage === 'uploading' || stage === 'processing') && (
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-700 font-medium">{statusMsg || 'Processing...'}</p>
          <p className="text-gray-400 text-sm mt-2">
            This usually takes 60–90 seconds. You can safely leave this page.
          </p>
        </div>
      )}

      {stage === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-red-700 font-medium">Migration failed</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
          <button
            onClick={() => setStage('idle')}
            className="mt-3 text-blue-600 underline text-sm"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/MigrationUpload.tsx
git commit -m "feat(migration): add Belina backup upload page with polling"
```

---

## Task 10: Frontend — Migration Review Page

**Files:**
- Create: `frontend/src/pages/MigrationReview.tsx`

- [ ] **Step 1: Create the review page**

```tsx
// frontend/src/pages/MigrationReview.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

interface StagedRecord {
  id: string;
  rawSnapshot: Record<string, any>;
  normalised: Record<string, any>;
  status: string;
}

interface Job {
  id: string;
  status: string;
  truncated: Record<string, boolean>;
}

export default function MigrationReview() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate  = useNavigate();
  const [records, setRecords] = useState<StagedRecord[]>([]);
  const [job, setJob]         = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const token = localStorage.getItem('token');
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetch(`/api/migration/${jobId}/preview`, { headers })
      .then(r => r.json())
      .then(data => {
        setJob(data.job);
        setRecords(data.records);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [jobId]);

  const isTruncated = job?.truncated && Object.values(job.truncated).some(Boolean);

  const totalBasicPay = records.reduce(
    (sum, r) => sum + (r.normalised.baseSalaryCents || 0) / 100, 0
  );

  const handleConfirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`/api/migration/${jobId}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ companyId: job?.companyId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate('/employees');
    } catch (err: any) {
      setError(err.message);
      setConfirming(false);
    }
  };

  if (loading) return <div className="p-8 text-gray-500">Loading migration preview...</div>;

  return (
    <div className="max-w-5xl mx-auto mt-8 p-6">
      <h1 className="text-2xl font-bold mb-1">Review Your Migration</h1>
      <p className="text-gray-500 mb-6">
        We found <strong>{records.length} employees</strong> with a total basic pay of{' '}
        <strong>${totalBasicPay.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>.
        Does this match your last Belina report?
      </p>

      {isTruncated && (
        <div className="bg-amber-50 border border-amber-300 rounded p-4 mb-6">
          <p className="font-semibold text-amber-800">Large dataset detected</p>
          <p className="text-amber-700 text-sm mt-1">
            Your backup contains more than 1,000 records in some tables. Please contact
            support to complete this migration with full data fidelity.
          </p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded border mb-6">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2">Code</th>
              <th className="text-left px-4 py-2">First Name</th>
              <th className="text-left px-4 py-2">Last Name</th>
              <th className="text-left px-4 py-2">ID Number</th>
              <th className="text-right px-4 py-2">Basic Pay</th>
              <th className="text-right px-4 py-2">Leave (hrs)</th>
            </tr>
          </thead>
          <tbody>
            {records.map(r => (
              <tr key={r.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-mono">{r.normalised.employeeExternalId}</td>
                <td className="px-4 py-2">{r.normalised.firstName}</td>
                <td className="px-4 py-2">{r.normalised.lastName}</td>
                <td className="px-4 py-2 font-mono text-xs">{r.normalised.idNumber}</td>
                <td className="px-4 py-2 text-right">
                  ${((r.normalised.baseSalaryCents || 0) / 100).toFixed(2)}
                </td>
                <td className="px-4 py-2 text-right">{r.normalised.leaveBalanceHours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 justify-end">
        <button
          onClick={() => navigate('/migration/upload')}
          className="px-6 py-2 border rounded text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={confirming || !!isTruncated}
          className="px-6 py-2 bg-green-600 text-white rounded font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirming ? 'Confirming...' : `Confirm — Import ${records.length} Employees`}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register routes in `frontend/src/App.tsx`**

Add the imports near the top with the other page imports, then add the routes inside `<Routes>`:

```tsx
import MigrationUpload from './pages/MigrationUpload';
import MigrationReview from './pages/MigrationReview';

// Inside your <Routes>:
<Route path="/migration/upload" element={<MigrationUpload />} />
<Route path="/migration/:jobId/review" element={<MigrationReview />} />
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/MigrationUpload.tsx frontend/src/pages/MigrationReview.tsx
git commit -m "feat(migration): add migration review UI with confirm and truncation guard"
```

---

## Task 11: End-to-End Smoke Test (Manual)

Before deploying, verify the happy path works locally with a mock.

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm test
```
Expected: All tests pass (finance + migrationService suites)

- [ ] **Step 2: Test the migration route with a mock payload**

Start the backend:
```bash
cd backend && npm run dev
```

Simulate what the client would do (bypass Cloud Run for local testing):

```bash
# Step 1: Get a signed upload URL
curl -X POST http://localhost:5005/api/migration/upload-url \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"companyId":"<your-company-id>","filename":"test.bkp"}'
```
Expected: `{ "jobId": "...", "uploadUrl": "https://storage.googleapis.com/...", "gcsPath": "temp/..." }`

```bash
# Step 2: PUT the file directly to GCS (use the uploadUrl from step 1)
curl -X PUT "<uploadUrl>" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @/path/to/HalsmanInvestiments_30016_202601_0302.Bkp

# Step 3: Trigger Cloud Run worker
curl -X POST http://localhost:5005/api/migration/start \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"jobId":"<jobId>","gcsPath":"<gcsPath>"}'
```
Expected: `{ "jobId": "...", "status": "PROCESSING" }`

```bash
# Poll status
curl http://localhost:5005/api/migration/<jobId>/status \
  -H "Authorization: Bearer <your-token>"
```
Expected: `{ "status": "PROCESSING" }` → eventually `{ "status": "STAGED" }` (once Cloud Run returns)

- [ ] **Step 3: Commit final state**

```bash
git add .
git commit -m "feat(migration): Phase 1 Belina migration engine — employee master import"
```

---

## Deployment Checklist

Before going live, complete these steps in order:

- [ ] **GCS bucket** — Run `node backend/scripts/setup-gcs-bucket.js` with production credentials
- [ ] **Cloud Run service account** — Grant `roles/storage.objectAdmin` on the migration bucket
- [ ] **Render service account** — Grant `roles/run.invoker` on the Cloud Run service
- [ ] **Cloud Run deploy** — Run the `gcloud run deploy` command from the spec (Section 5.4)
- [ ] **Legal sign-off** — `ACCEPT_EULA=Y` in Dockerfile accepts Microsoft SQL Server Express EULA
- [ ] **Environment variables** — Set `MIGRATION_BUCKET`, `CLOUD_RUN_WORKER_URL`, `GOOGLE_APPLICATION_CREDENTIALS` on Render
- [ ] **Migration worker npm install** — `cd migration-worker && npm install`
- [ ] **Build and push Docker image** — `docker build -t gcr.io/YOUR_PROJECT/bantu-migration-engine migration-worker/`

---

## Phase 2 Preview (Do Not Implement Now)

When Phase 1 is live and tested, Phase 2 adds:
- `mapTransaction`, `mapLeave`, `mapLoan` normalisation functions in `migrationService.js`
- mssql streaming for large transaction tables (removes the 1,000-row cap)
- Confirm step expanded to commit transactions/leave/loans alongside employees
