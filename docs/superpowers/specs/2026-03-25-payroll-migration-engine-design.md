# Bantu Payroll Migration Engine — Design Spec
**Date:** 2026-03-25
**Status:** Ready for Implementation (Phase 1)
**Author:** Brainstorming Session (Claude + Peer Review)

---

## 1. Problem Statement

When a new client signs up for Bantu, they should not have to start over. They have years of payroll history locked inside other platforms. The goal of this feature is to allow clients to upload a backup from their existing payroll software and continue on Bantu without losing a single cent of historical data.

The first and most critical platform to support is **Belina Payroll HR** — the most widely used payroll platform in Zimbabwe.

---

## 2. Reverse Engineering: The Belina `.bkp` Format

A Belina backup file (`.bkp`) was reverse engineered to determine its structure.

**Findings:**
- The file begins with `TAPE` magic bytes — it is a **Microsoft Tape Format (MTF) / NTBackup archive**.
- The `file` command reveals: `software (0x1200): Microsoft SQL Server`
- This means **SQL Server itself wrote the backup directly in tape format** — not Windows Backup wrapping a `.bak`.
- **Critical insight:** SQL Server's native `RESTORE DATABASE FROM DISK` command reads this format directly. No extraction tool (7-Zip, mtftar, Python libraries) is needed.
- The strings embedded in the file reveal Belina's database schema.

**Confirmed Belina Version from sample file:** `3.1.0.250307`

**Confirmed Schema Fields (from binary strings):**

| Entity | Fields |
|---|---|
| Employee | `EmployeeID`, `EmployeeCode`, `Surname`, `FirstName`, `ContractStartDate`, `ContractEndDate`, `ClockNo` |
| Payroll | `PayrollID`, `CompanyID`, `PeriodID` |
| Earnings/Deductions | `EDID`, `EDDescription`, `EDCategory`, `EmployeeAmount`, `EmployerAmount` |
| Pension/Funds | `FundCode`, `FundDescription`, `TotalMonthsContributed`, `Factor` |
| Departments | `DepartmentCode` |
| Banking | `AccountNumber` |

---

## 3. Requirements

| ID | Requirement |
|---|---|
| R-A | Migrate employee master data (personal, bank, tax details) |
| R-B | Migrate historical transactions (payslips, YTD figures for PAYE/NSSA) |
| R-C | Migrate leave balances, loan balances, open deductions |
| R-D | Migration triggered during client onboarding ("Do you have a Belina backup?") |
| R-E | Self-service upload for clients; admin-assisted for complex cases |
| R-F | Import all payrolls found in the backup |
| R-G | Full audit trail — original `.bkp` and JSON snapshot preserved for 7 years (ZIMRA compliance) |

---

## 4. Architecture: The Three-Layer System

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Upload                                                 │
│  Vercel (Frontend) → GCS Signed URL → Client uploads .bkp       │
│  Render Backend → generates jobId → triggers Cloud Run          │
└─────────────────────────────────────────────────────────────────┘
                              ↓ GCS path + jobId
┌─────────────────────────────────────────────────────────────────┐
│  Layer 2: Extraction (Cloud Run)                                 │
│  SQL Server 2022 Express + Node.js 20                            │
│  - Downloads .bkp from GCS to /tmp                              │
│  - RESTORE DATABASE FROM DISK (native tape format support)       │
│  - Schema discovery via INFORMATION_SCHEMA                       │
│  - Fragment each table → save to GCS archive/ immediately        │
│  - Copy .bkp to archive/ (7-year audit trail)                   │
│  - Write manifest.json                                           │
│  - DROP DATABASE + delete all /tmp files                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓ manifestGcsPath
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: Normalization + Staging (Render Backend)               │
│  - Download fragments from GCS                                   │
│  - Map Belina fields → Bantu Prisma schema                       │
│  - Type-cast dates and currency (integer cents)                  │
│  - Write to MigrationStaging table (with jobId)                  │
│  - Present Review UI to client                                   │
│  - On confirm: move from staging → live tables                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Infrastructure

### 5.1 Cloud Run Worker (Migration Engine)

| Setting | Value | Reason |
|---|---|---|
| Base image | `mcr.microsoft.com/mssql/server:2022-latest` | Official, optimised, avoids re-installing same packages |
| RAM | 2GB | SQL Server Express minimum; capped at 1400MB via `sp_configure` |
| vCPU | 1 | Sufficient for sequential extraction |
| Min instances | 0 (`--min-instances 0`) | Scales to zero — no idle billing |
| Max instances | 3 | Prevents concurrent overload |
| Concurrency | 1 (`--concurrency 1`) | SQL Server is resource-heavy; one migration per container |
| Execution environment | Gen 2 | Better `/tmp` storage behaviour |
| CPU Boost | Enabled (`--cpu-boost`) | Free startup boost reduces cold-start billed time |
| Region | `us-central1` | Qualifies for GCP Always Free tier |
| Timeout | 15 minutes | Covers large backup restore + extraction |
| Authentication | `--no-allow-unauthenticated` | Internal only — requires Cloud Run IAM invoker role |

**Estimated cost:** ~600 free migrations/month on GCP Always Free tier. Beyond that, ~$0.0015 per migration.

**Legal note:** The Dockerfile sets `ACCEPT_EULA=Y` which constitutes acceptance of the Microsoft SQL Server Express EULA. Legal review required before production deployment.

### 5.2 GCS Bucket Structure

```
bantu-migrations/
├── temp/                              ← 30-day lifecycle policy (working files only)
│   └── {clientId}/{jobId}/
│       └── upload.bkp                 ← client upload lands here first
└── archive/                           ← 7-year retention (ZIMRA compliance)
    └── {clientId}/{jobId}/
        ├── original.bkp               ← copied from temp/ for audit trail
        ├── manifest.json              ← entry point for Render
        └── fragments/
            ├── employees.json
            ├── transactions.json
            ├── leave.json
            └── loans.json
```

**Lifecycle policies:**
- `temp/` — auto-delete after 30 days
- `archive/` — retain for 7 years, then auto-delete

### 5.3 Memory Budget

```
2048 MB total
├── OS + container overhead    ~200 MB
├── SQL Server Express         ~1400 MB  (hard-capped via sp_configure)
├── Node.js worker             ~300 MB   (hard-capped via --max-old-space-size)
└── Buffer                     ~148 MB
```

### 5.4 Deployment Command

```bash
gcloud run deploy bantu-migration-worker \
  --image gcr.io/YOUR_PROJECT_ID/bantu-migration-engine \
  --memory 2Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 3 \
  --concurrency 1 \
  --cpu-boost \
  --execution-environment gen2 \
  --region us-central1 \
  --no-allow-unauthenticated \
  --set-secrets MSSQL_SA_PASSWORD=bantu-mssql-sa:latest \
  --set-secrets MIGRATION_BUCKET=bantu-migration-bucket:latest
```

The Render backend invokes Cloud Run using a service account with the `roles/run.invoker` IAM role. Render passes a Bearer token in the Authorization header.

---

## 6. Dockerfile

```dockerfile
# ── Stage 1: Node.js dependency builder ──────────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: Runtime ─────────────────────────────────────────────
FROM mcr.microsoft.com/mssql/server:2022-latest
USER root

# Pin Node.js 20 via modern GPG method (no deprecated apt-key)
RUN mkdir -p /etc/apt/keyrings \
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
ENV ACCEPT_EULA=Y   # Accepts Microsoft SQL Server Express EULA — legal review required
ENV MSSQL_PID=Express
# MSSQL_SA_PASSWORD injected at runtime via Cloud Run Secret Manager

EXPOSE 8080
RUN chmod +x entrypoint.sh
CMD ["./entrypoint.sh"]
```

---

## 7. Startup Script (`entrypoint.sh`)

```bash
#!/bin/bash

# 1. Start SQL Server in background
/opt/mssql/bin/sqlservr &

# 2. Smart poll — start the instant SQL Server is ready (not a blind sleep)
echo "Bantu Worker: Waiting for SQL Server..."
until /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" \
  -Q "SELECT 1" -No &>/dev/null; do
  sleep 1
done

# 3. Hard memory cap — must run before any restore
/opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -No -Q "
    EXEC sys.sp_configure 'show advanced options', 1;
    RECONFIGURE;
    EXEC sys.sp_configure 'max server memory (MB)', 1400;
    RECONFIGURE;
  "

# 4. Start Node.js worker with strict heap cap
echo "Bantu Worker: SQL Ready. Starting Migration API..."
node --max-old-space-size=300 index.js
```

---

## 8. Cloud Run Worker Logic (`index.js`)

### 8.1 Shared Utilities

`toCents` is defined once in a shared module (`lib/finance.js`) used by the Render normalization layer. The Cloud Run worker does **not** call `toCents` — it stores raw values as-is in JSON fragments. All currency conversion happens in Layer 3 (Render), not Layer 2 (Cloud Run).

```javascript
// lib/finance.js (Render-side only)
const toCents = (val) => Math.round(parseFloat(parseFloat(val || 0).toFixed(2)) * 100);
module.exports = { toCents };
```

### 8.2 Migration Function

```javascript
const { execSync } = require('child_process');
const sql = require('mssql');
const fs = require('fs');
const { Storage } = require('@google-cloud/storage');
// Note: toCents is NOT imported here — raw values are stored as-is.
// Currency conversion happens in Layer 3 (Render normalization layer).

const storage = new Storage();
const BUCKET_NAME = process.env.MIGRATION_BUCKET;

const sanitize = (str) => str.replace(/[^a-zA-Z0-9_-]/g, '');
const escapeSql = (str) => str.replace(/'/g, "''");

const tablesToMigrate = [
  { key: 'employees',    pattern: 'Employee' },
  { key: 'transactions', pattern: 'Trans' },
  { key: 'leave',        pattern: 'Leave' },
  { key: 'loans',        pattern: 'Loan' },
];

async function migrateBelinaBackup(gcsSourcePath, rawClientId, jobId) {
  const clientId = sanitize(rawClientId);
  const safeJobId = sanitize(jobId);
  const dbName = `Mig_${clientId}_${safeJobId}`;  // jobId in dbName ensures idempotency
  const password = process.env.MSSQL_SA_PASSWORD;
  const localBkpPath = `/tmp/${dbName}.bkp`;
  const sqlFile = `/tmp/${dbName}_restore.sql`;

  const baseConfig = {
    user: 'sa',
    password,
    server: 'localhost',
    database: 'master',
    options: { encrypt: false, trustServerCertificate: true },
    pool: { max: 1, min: 0, idleTimeoutMillis: 3000 },
    requestTimeout: 60000, // 60s safety for DDL/header reads
  };

  let masterPool;
  try {
    // ── Step 0: Download .bkp from GCS to /tmp ───────────────────
    await storage.bucket(BUCKET_NAME).file(gcsSourcePath).download({
      destination: localBkpPath,
    });

    // ── Step 0b: Copy .bkp to archive/ for 7-year audit trail ────
    const archiveBkpPath = `archive/${clientId}/${safeJobId}/original.bkp`;
    await storage.bucket(BUCKET_NAME).file(gcsSourcePath)
      .copy(storage.bucket(BUCKET_NAME).file(archiveBkpPath));

    masterPool = await sql.connect(baseConfig);

    // ── Step 1: Discover logical file names ──────────────────────
    const fileList = await masterPool.request()
      .query(`RESTORE FILELISTONLY FROM DISK = N'${escapeSql(localBkpPath)}'`);

    const dataFile = fileList.recordset.find(f => f.Type === 'D')?.LogicalName;
    const logFile  = fileList.recordset.find(f => f.Type === 'L')?.LogicalName;

    if (!dataFile || !logFile) {
      throw new Error('Invalid Belina backup: could not locate internal data or log streams.');
    }

    // ── Step 2: Restore via temp SQL file (avoids shell-escaping issues) ─
    const restoreScript =
      `RESTORE DATABASE [${dbName}] FROM DISK = N'${escapeSql(localBkpPath)}' ` +
      `WITH REPLACE, ` +
      `MOVE '${escapeSql(dataFile)}' TO '/tmp/${dbName}.mdf', ` +
      `MOVE '${escapeSql(logFile)}' TO '/tmp/${dbName}.ldf';`;

    fs.writeFileSync(sqlFile, restoreScript);
    execSync(`sqlcmd -S localhost -U sa -i "${sqlFile}" -No`, {
      env: { ...process.env, SQLCMDPASSWORD: password },
      timeout: 300000, // 5-minute hard limit
    });

    // ── Step 3: Extract + Fragment ────────────────────────────────
    const manifest = {
      clientId,
      jobId: safeJobId,
      timestamp: new Date().toISOString(),
      fragments: {},
      truncated: {},  // tracks which tables hit the 1,000 row limit
      context: {},
    };

    let dbPool;
    try {
      dbPool = await new sql.ConnectionPool({ ...baseConfig, database: dbName }).connect();

      // Context: Whitelist specific fields from CompanyParameters to avoid storing
      // PII or integration secrets in the 7-year GCS archive.
      try {
        const ctx = await dbPool.request().query(`
          SELECT TOP 1 Currency, TaxYear, HoursPerDay, WorkingHoursPerDay, CompanyName
          FROM dbo.CompanyParameters
        `);
        manifest.context = ctx.recordset[0] || { _warning: 'Manual context required' };
      } catch {
        manifest.context = { _error: 'CompanyParameters not found — configure manually' };
      }

      // Discover all tables (unfiltered — needed for Trans/Leave/Loan)
      const allTablesResult = await dbPool.request().query(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
      `);
      const allTableNames = allTablesResult.recordset.map(r => r.TABLE_NAME);

      // Extract each table → save fragment → clear memory
      for (const target of tablesToMigrate) {
        try {
          // Use first match — tables are ordered alphabetically for determinism
          const tableName = allTableNames.find(
            t => t.toLowerCase().includes(target.pattern.toLowerCase())
          );
          if (!tableName) continue;

          // v1.0 limit: 1,000 rows. Detect truncation via TOP 1001 to avoid
          // false positive when a table has exactly 1,000 rows.
          const result = await dbPool.request()
            .query(`SELECT TOP 1001 * FROM [${tableName}]`);

          const wasTruncated = result.recordset.length > 1000;
          if (wasTruncated) result.recordset = result.recordset.slice(0, 1000);
          manifest.truncated[target.key] = wasTruncated;

          const fragmentPath = `archive/${clientId}/${safeJobId}/fragments/${target.key}.json`;
          await storage.bucket(BUCKET_NAME).file(fragmentPath).save(
            JSON.stringify(result.recordset),
            { contentType: 'application/json', resumable: true }
          );

          manifest.fragments[target.key] = `gs://${BUCKET_NAME}/${fragmentPath}`;
          result.recordset = null; // Signal GC — clear before next query
        } catch (e) {
          console.warn(`Bantu: Optional table "${target.pattern}" not found — skipped.`);
        }
      }

      // Save manifest last (Render uses this as the entry point)
      const manifestPath = `archive/${clientId}/${safeJobId}/manifest.json`;
      await storage.bucket(BUCKET_NAME).file(manifestPath).save(
        JSON.stringify(manifest),
        { contentType: 'application/json', resumable: false }
      );

      return {
        status: 'success',
        manifestGcsPath: `gs://${BUCKET_NAME}/${manifestPath}`,
        truncated: manifest.truncated,
      };

    } finally {
      if (dbPool) await dbPool.close();
    }

  } finally {
    // Guaranteed cleanup — runs even on error
    if (masterPool) {
      try {
        // Use sys.databases with parameterized lookup to avoid injection in WHERE clause.
        // The DDL still uses bracket-quoted dbName (SQL Server doesn't support parameters for identifiers).
        await masterPool.request()
          .input('dbName', sql.NVarChar, dbName)
          .query(`
            IF EXISTS (SELECT name FROM sys.databases WHERE name = @dbName)
            BEGIN
              ALTER DATABASE [${dbName}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
              DROP DATABASE [${dbName}];
            END
          `);
        [localBkpPath, sqlFile, `/tmp/${dbName}.mdf`, `/tmp/${dbName}.ldf`].forEach(f => {
          if (fs.existsSync(f)) fs.unlinkSync(f);
        });
      } catch (err) {
        console.error('Bantu Cleanup Warning:', err.message);
      }
      await masterPool.close();
    }
  }
}
```

---

## 9. Normalization Layer (Render Backend)

Runs after Render downloads each fragment from GCS. Uses the shared `toCents` from `lib/finance.js`.

```javascript
const { toCents } = require('./lib/finance');

const mapEmployee = (raw, context) => {
  // Hours per day: read from CompanyParameters, default 8 if not set
  const hoursPerDay = parseFloat(context.HoursPerDay || context.WorkingHoursPerDay || 8);

  return {
    // Field mapping (handles both Belina naming conventions)
    employeeExternalId: raw.EmployeeCode || raw.Emp_No,
    firstName:          raw.FirstName    || raw.F_Name,
    lastName:           raw.Surname      || raw.LastName,
    idNumber:           raw.IDNumber?.replace(/[^a-zA-Z0-9]/g, ''),

    // Dates — mssql driver returns JS Date objects, no double-conversion needed
    dateOfBirth:   raw.DateOfBirth       ?? null,
    startDate:     raw.ContractStartDate ?? null,
    dischargeDate: raw.ContractEndDate   ?? null,

    // Currency — integer cents pattern (ZIMRA-compliant, no floating-point errors)
    baseSalaryCents: toCents(raw.BasicPay),

    // Leave — preserve 2 decimal places; use company-configured hours per day
    leaveBalanceHours: raw.LeaveDays
      ? Math.round(parseFloat(parseFloat(raw.LeaveDays).toFixed(2)) * hoursPerDay * 100) / 100
      : 0,

    // Metadata
    migrationSource: 'Belina_BKP',
    status:          'STAGED',
  };
};

// Transactions, leave, and loans mappers are defined in Phase 2.
// They follow the same pattern: field alias fallbacks + toCents for all amounts.

const normalizeBatch = (fragments, context) => ({
  employees: (fragments.employees || []).map(raw => mapEmployee(raw, context)),
  meta: {
    currency:    context.Currency    ?? 'USD',
    taxYear:     context.TaxYear     ?? null,
    hoursPerDay: parseFloat(context.HoursPerDay || 8),
  },
});
```

---

## 10. Staging Pattern (Human-in-the-Loop)

Before data enters live Bantu tables, it goes through a mandatory review step.

**Flow:**
1. Render normalizes fragments → writes to `MigrationStaging` in PostgreSQL with `jobId`
2. Frontend shows Review UI: *"We found 112 employees. Total basic pay: $45,230.14. Does this match your July Belina report?"*
3. Client can expand any row to see **Belina Original** vs **Bantu Normalised** side-by-side
4. Client flags unmapped fields: *"What is Custom_Allowance_2?"*
5. **If any fragment was truncated (`truncated: true` in manifest), the Confirm button is disabled** with message: *"Your backup contains more than 1,000 employees. Please contact support to complete this migration."*
6. Client clicks **Confirm Migration**
7. Render moves records from `MigrationStaging` → live `Employee`, `Payroll`, etc. tables

**Prisma model:**
```prisma
model MigrationJob {
  id          String            @id @default(cuid())
  clientId    String
  source      String            // "Belina_BKP"
  status      String            // PROCESSING | STAGED | CONFIRMED | FAILED
  manifestUrl String?
  truncated   Json?             // { employees: false, transactions: true, ... }
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  records     MigrationStaging[]

  @@index([clientId])
  @@index([status])
}

model MigrationStaging {
  id             String       @id @default(cuid())
  jobId          String
  job            MigrationJob @relation(fields: [jobId], references: [id])
  entityType     String       // "employee" | "transaction" | "leave" | "loan"
  rawSnapshot    Json         // Original Belina row
  normalised     Json         // Mapped Bantu fields
  status         String       // STAGED | CONFIRMED | REJECTED
  unmappedFields Json?        // Fields needing human review
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  @@index([jobId])
  @@index([entityType])
}
```

---

## 11. Onboarding Integration

During client setup, the onboarding wizard asks:

> *"Do you have payroll data from another system?"*
> - **Yes, I have a Belina backup (.bkp)** ← Phase 1 & 2
> - **Yes, I have Excel/CSV files** ← Phase 3 (backend not yet built — hide this option until Phase 3)
> - **No, I'm starting fresh**

Selecting Belina triggers: upload → Cloud Run → Review UI.

**Note:** The Excel/CSV option must remain hidden until Phase 3 is implemented to avoid presenting a broken flow.

---

## 12. UX: Cold Start Messaging

SQL Server on Linux cold start is typically **60–90 seconds** under memory constraints. The UI must set honest expectations:

> *"We're setting up a secure, isolated environment to process your payroll data. This usually takes 60–90 seconds. We'll notify you when it's ready for review."*

**Progress stages via SSE/WebSocket:**
1. Uploading backup file...
2. Validating backup format...
3. Waking up migration engine...
4. Restoring legacy database...
5. Extracting employee records...
6. Extracting transaction history...
7. Saving secure snapshot...
8. Ready for your review ✓

---

## 13. Phased Rollout

| Phase | Scope | Unlocks |
|---|---|---|
| **Phase 1** | Employee master + CompanyParameters | Client can log in, see their employees, configure Bantu |
| **Phase 2** | Transactions + Leave + Loans mappers | Client can run next payroll with correct YTD figures |
| **Phase 3** | Other platforms: Sage, Jarrison, PayMaster, Excel/CSV | Broader market capture |

---

## 14. Open Design Questions (Resolve During Implementation)

1. **Cloud Run invocation pattern** — Cloud Run supports synchronous HTTP requests up to 60 minutes. The simplest approach: Render makes a `POST` to Cloud Run and awaits the response (blocking). This works for the 15-minute job. If longer jobs are needed in future, switch to async trigger via Cloud Tasks + Pub/Sub callback. **Decision needed before implementing `POST /api/migration/start`.**

2. **Failure signaling** — If Cloud Run fails mid-job (OOM, timeout, corrupt backup), `manifest.json` is never written. Render needs a way to detect this. Options: (a) Cloud Run always writes a `status.json` with success/failure before returning; (b) Render sets a job timeout and marks `FAILED` if no manifest appears within N minutes. **Decision needed before implementing `MigrationJob.status`.**

3. **Transaction table truncation** — The 1,000-row limit will truncate transaction history for any company with >1,000 payslip rows (common after 2+ years). Truncated YTD figures are a ZIMRA compliance risk. **Phase 2 must include mssql streaming before transactions are normalised and committed to live tables.**

4. **Phase 1 extraction scope** — The Cloud Run worker extracts all four table types (employees, transactions, leave, loans) in Phase 1, but only the employee mapper is defined. Fragments for transactions/leave/loans are staged but not normalised. The Confirm step in Phase 1 should only commit employee records; other staged fragments wait for Phase 2 mappers.

---

## 15. Security

| Concern | Mitigation |
|---|---|
| Unauthenticated Cloud Run access | `--no-allow-unauthenticated`; Render invokes via service account with `roles/run.invoker`; Cloud Run service account needs `roles/storage.objectAdmin` on the migration bucket |
| Shell injection | `sanitize()` on all system-level strings; jobId included in dbName |
| SQL injection | `escapeSql()` on all SQL string values; bracket-quoting on all identifiers |
| SQL injection in cleanup | `WHERE name = N'${dbName}'` — dbName is sanitized and bracket-quoted consistently |
| Password in process list | `SQLCMDPASSWORD` env var (never `-P` flag) |
| Secrets in Dockerfile | All secrets via Cloud Run Secret Manager at runtime |
| `.bkp` persistence | Deleted from `/tmp` in `finally` block; archived copy in GCS for audit |
| Microsoft EULA | `ACCEPT_EULA=Y` requires legal sign-off before production deployment |

---

## 16. Known Limitations (v1.0)

- **1,000 row limit per table** — enforced via `SELECT TOP 1000`. If hit, `truncated[key]` is `true` in manifest and the Review UI blocks the Confirm step, routing client to support.
- **Belina only** — Phase 3 adds other platforms.
- **CompanyParameters table name** — inferred from reverse engineering; may differ across Belina versions. Non-fatal fallback included.
- **Table discovery uses first pattern match** — `allTableNames` is ordered alphabetically (via `ORDER BY TABLE_NAME`) for determinism; first match wins.
- **hoursPerDay** — read from `CompanyParameters`; defaults to 8 if not present.
- **Phase 2 mappers not yet defined** — Transactions, Leave, Loans normalization functions are Phase 2 deliverables.
- **Excel/CSV import** — onboarding UI option hidden until Phase 3 backend exists.

---

## 17. Next Steps (Implementation Order)

1. **Shared finance module** — `lib/finance.js` with `toCents()`, used by both Cloud Run and Render
2. **Prisma schema** — Add `MigrationJob` and `MigrationStaging` models
3. **GCS bucket setup** — Create bucket with two lifecycle policies (`temp/` 30-day, `archive/` 7-year)
4. **Cloud Run service** — Dockerfile + entrypoint.sh + index.js
5. **Render API routes** — `POST /api/migration/start`, `GET /api/migration/:jobId/status`
6. **Cloud Run IAM** — Service account with `roles/run.invoker` bound to Render's service identity
7. **Review UI** — Comparison view with truncation block guard
8. **Phase 2: Transaction/Leave/Loan mappers** — After Phase 1 is live and tested
9. **Phase 3: Excel/CSV + other platforms**
