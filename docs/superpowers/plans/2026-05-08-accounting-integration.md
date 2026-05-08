# Accounting Platform Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable Bantu users to export/post payroll journals to QuickBooks Online (and later Xero, Sage) directly from the platform, with configurable GL account mappings and one-click sync.

**Architecture:** New backend modules for OAuth connection management, GL account mapping, journal entry generation, and sync orchestration. Frontend pages for integration settings and mapping configuration. The sync engine reuses the existing `SyncQueue`/`SyncLog` pattern for reliability.

**Tech Stack:** Existing Node.js/Express backend, React frontend, Prisma. New: QuickBooks Online OAuth 2.0 SDK, `axios` for QB API calls. No new infra — OAuth tokens stored in DB, journal entries generated server-side.

---

## Codebase Notes (read before starting)

- Backend is **CommonJS** (`require`/`module.exports`) — do not use `import`/`export` in new backend files
- Tests live in `backend/__tests__/` and run with `cd backend && npm test` (Vitest)
- Prisma client is accessed via `require('../lib/prisma')` (or `require('./lib/prisma')` from root)
- All entity IDs use `uuid()` for server-generated IDs
- Backend routes follow the pattern in `backend/routes/employees.js` — `express.Router()`, require `lib/prisma`, authenticate with `authenticateToken` from `lib/auth`
- `backend/index.js` is the entry point and registers all routes manually
- Environment variables are loaded via `dotenv` — add new QB vars to `.env.example`
- Frontend API client is at `frontend/src/api/client.ts` — all authenticated calls go through this
- The `TransactionCode` model has `incomeCategory` (enum: BASIC_SALARY, BONUS, GRATUITY, ALLOWANCE, OVERTIME, COMMISSION, BENEFIT, PENSION, MEDICAL_AID) — this is the primary anchor for GL mapping
- `PayrollTransaction` is the line-item detail generated per employee per run — this is what gets journalized

---

## Phase 1: Data Model & Prisma Schema

> Produces: new Prisma models for integration connections, GL account mappings, and posted journal entries.

### Task 1.1 — Add `IntegrationConnection` model

Add to `backend/prisma/schema.prisma`:

```prisma
enum IntegrationProvider {
  QUICKBOOKS
  XERO
  SAGE
}

model IntegrationConnection {
  id              String              @id @default(uuid())
  clientId        String
  provider        IntegrationProvider
  // OAuth 2.0 tokens
  accessToken     String
  refreshToken    String?
  tokenExpiresAt  DateTime
  realmId         String?             // QuickBooks company ID
  // Provider-specific metadata
  providerData    Json?               // QB: company info, Xero: tenant info
  isActive        Boolean             @default(true)
  lastSyncAt      DateTime?
  lastError       String?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  client          Client              @relation(fields: [clientId], references: [id])

  @@index([clientId])
  @@index([provider, isActive])
}
```

**SQLite mirror** (`backend/prisma/sqlite/schema.prisma`): Same model but `String` instead of enums, `Json` → `String`.

### Task 1.2 — Add `GLAccountMapping` model

```prisma
model GLAccountMapping {
  id                String   @id @default(uuid())
  clientId          String
  provider          String   // "QUICKBOOKS" | "XERO" | "SAGE"
  // Links a Bantu TransactionCode to an external GL account
  transactionCodeId String
  externalAccountId String   // QB: account ID in QuickBooks
  externalAccountName String // QB: account name (denormalized for display)
  externalAccountNumber String? // QB: account number (e.g. 6000)
  // Default debit/credit side for this mapping
  defaultSide       String   @default("DEBIT") // DEBIT | CREDIT
  isActive          Boolean  @default(true)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  client          Client          @relation(fields: [clientId], references: [id])
  transactionCode TransactionCode @relation(fields: [transactionCodeId], references: [id])

  @@unique([clientId, provider, transactionCodeId])
  @@index([clientId, provider])
}
```

### Task 1.3 — Add `JournalEntry` and `JournalEntryLine` models

```prisma
model JournalEntry {
  id              String   @id @default(uuid())
  clientId        String
  companyId       String
  provider        String   // "QUICKBOOKS" | "XERO" | "SAGE"
  payrollRunId    String
  externalId      String?  // QB: journal entry ID after posting
  entryNumber     String?  // Optional sequential reference
  // Period
  transactionDate DateTime
  // Status tracking
  status          String   @default("PENDING") // PENDING | POSTED | FAILED | VOIDED
  errorMessage    String?
  postedAt        DateTime?
  // Debit/Credit totals for verification
  totalDebit      Float    @default(0)
  totalCredit     Float    @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  client      Client       @relation(fields: [clientId], references: [id])
  company     Company      @relation(fields: [companyId], references: [id])
  payrollRun  PayrollRun   @relation(fields: [payrollRunId], references: [id])
  lines       JournalEntryLine[]

  @@index([clientId, provider, status])
  @@index([payrollRunId])
  @@index([clientId, status])
}

model JournalEntryLine {
  id                String  @id @default(uuid())
  journalEntryId    String
  // GL account reference
  transactionCodeId String?
  externalAccountId String
  externalAccountName String
  // Line detail
  description       String
  debitAmount       Float   @default(0)
  creditAmount      Float   @default(0)
  // Employee reference for audit trail
  employeeId        String?
  employeeName      String?
  // Currency
  currency          String  @default("USD")
  amountUSD         Float?
  amountZIG         Float?

  journalEntry   JournalEntry   @relation(fields: [journalEntryId], references: [id], onDelete: Cascade)
  transactionCode TransactionCode? @relation(fields: [transactionCodeId], references: [id])

  @@index([journalEntryId])
}
```

### Task 1.4 — Run Prisma migration

```bash
cd backend && npx prisma migrate dev --name add_accounting_integration
```

Also update the SQLite schema mirror (`backend/prisma/sqlite/schema.prisma`) with equivalent models (String types instead of enums, `String` instead of `Json`).

---

## Phase 2: QuickBooks OAuth Integration

> Produces: OAuth 2.0 flow for QuickBooks Online — connect, disconnect, token refresh.

### Task 2.1 — Install QB OAuth SDK

```bash
cd backend && npm install openid-client
```

`openid-client` handles the OAuth 2.0 Authorization Code + PKCE flow. Add env vars:

```
QUICKBOOKS_CLIENT_ID=your_client_id
QUICKBOOKS_CLIENT_SECRET=your_client_secret
QUICKBOOKS_REDIRECT_URI=https://app.bantu.co.zw/api/integrations/quickbooks/callback
QUICKBOOKS_SANDBOX=true
```

### Task 2.2 — Create `backend/lib/quickbooks.js`

Shared library with:

- `getQBClient()` — returns configured OAuth client using `openid-client`
- `getAuthUrl(state)` — generates QB authorization URL with scope `com.intuit.quickbooks.accounting`
- `exchangeCodeForToken(code, redirectUri)` — exchanges auth code for access + refresh tokens
- `refreshAccessToken(refreshToken)` — refreshes expiring tokens (access tokens expire in 1 hour)
- `getValidToken(connection)` — returns a valid access token (refreshing if needed)
- `revokeToken(connection)` — revokes and deactivates the connection
- `qbRequest(token, endpoint, method, body)` — makes authenticated requests to QB API v3

Store discovery URL statically (no live fetch needed): `https://developer.api.intuit.com/.well-known/openid-configuration`

### Task 2.3 — Create `backend/routes/integrations.js`

```
GET  /api/integrations                — list active integrations for client
POST /api/integrations/quickbooks/auth — start OAuth flow, return auth URL
GET  /api/integrations/quickbooks/callback — OAuth callback, store tokens
POST /api/integrations/quickbooks/disconnect — revoke tokens, deactivate
GET  /api/integrations/quickbooks/status — connection status + company info
```

**OAuth flow:**
1. Frontend calls `POST /api/integrations/quickbooks/auth`
2. Backend generates PKCE challenge, stores `state` + `code_verifier` in session, returns `authUrl`
3. Frontend redirects to `authUrl` (QB login page)
4. User authorizes, QB redirects to `/api/integrations/quickbooks/callback?code=...&state=...&realmId=...`
5. Backend validates state, exchanges code for tokens, saves `IntegrationConnection` row
6. Backend redirects to frontend `/settings/integrations?quickbooks=connected`
7. Frontend shows success state

**Mount in `backend/index.js`:**
```javascript
app.use('/api/integrations', require('./routes/integrations'));
```
Mount BEFORE the auth middleware for the callback endpoint (same pattern as webhooks). The callback is public because QB redirects there. All other routes require `authenticateToken`.

### Task 2.4 — QB company info fetch on connect

After storing tokens, call `GET /v3/company/{realmId}/companyinfo/{realmId}` to get company name, address, legal name. Store in `providerData` JSON field. This gives the user visual confirmation of which QB company is connected.

---

## Phase 3: GL Account Mapping

> Produces: UI and backend for mapping Bantu TransactionCodes to QuickBooks GL accounts.

### Task 3.1 — Backend mapping routes

Add to `backend/routes/integrations.js`:

```
GET    /api/integrations/:provider/accounts         — fetch QB chart of accounts (sync from QB)
GET    /api/integrations/:provider/mappings         — list current GL mappings
POST   /api/integrations/:provider/mappings         — create/update a mapping
PUT    /api/integrations/:provider/mappings/:id     — update mapping
DELETE /api/integrations/:provider/mappings/:id     — remove mapping
POST   /api/integrations/:provider/mappings/suggest — auto-suggest mappings by incomeCategory
```

**Auto-suggest logic** (key UX win):
| `TransactionCode.incomeCategory` | Suggested QB Account Name |
|---|---|
| BASIC_SALARY | "Salaries and Wages" (expense) |
| BONUS | "Bonus Expense" (expense) |
| OVERTIME | "Overtime Expense" (expense) |
| COMMISSION | "Commission Expense" (expense) |
| ALLOWANCE | "Employee Allowances" (expense) |
| BENEFIT | "Employee Benefits" (expense) |
| PENSION | "Pension Expense" (expense) / "Pension Payable" (liability) |
| MEDICAL_AID | "Medical Aid Expense" (expense) / "Medical Aid Payable" (liability) |
| null (DEDUCTION type) | "Wage Payable" (liability) or specific deduction payable |

**Fetch QB chart of accounts:**
`GET /v3/company/{realmId}/query?query=select * from Account where Active in (true, false) MAXRESULTS 1000`

Return only accounts of type: `Expense`, `Equity`, `Liability`, `Other Current Liability`.

### Task 3.2 — Frontend mapping page

Create `frontend/src/pages/settings/Integrations.tsx`:

- **Connection panel**: Shows connected platform(s), status, "Connect" / "Disconnect" buttons
- **Mapping panel**: Table of Bantu TransactionCodes, each with a dropdown of QB GL accounts. Shows auto-suggested mappings highlighted. Save button.
- **Sync panel**: "Post to QuickBooks" button for completed payroll runs. Shows sync history (JournalEntry rows).

Wire into router in `App.tsx`:
```typescript
<Route path="/settings/integrations" element={<Integrations />} />
```

Show in the settings sidebar navigation.

---

## Phase 4: Journal Entry Generation

> Produces: The core logic that converts a Completed payroll run into QuickBooks journal entries.

### Task 4.1 — Create `backend/lib/journalGenerator.js`

This is the heart of the integration. One exported function:

```javascript
async function generateJournalEntries(payrollRunId, mappings, connection) {
  // 1. Fetch payslips + payrollTransactions for the run
  // 2. Group by employee
  // 3. Build debit/credit lines per employee:
  //
  //    For each employee, create journal lines:
  //    DEBIT  Salaries & Wages (expense)         = gross pay (total cost)
  //    DEBIT  Employer NSSA (expense)             = nssaEmployer
  //    DEBIT  Employer WCIF (expense)             = wcifEmployer
  //    DEBIT  Employer ZIMDEF (expense)           = zimdefEmployer
  //    DEBIT  Employer SDF (expense)              = sdfContribution
  //    DEBIT  Employer NEC (expense)              = necEmployer
  //    CREDIT PAYE Payable (liability)            = paye
  //    CREDIT AIDS Levy Payable (liability)       = aidsLevy
  //    CREDIT NSSA Payable (liability)            = nssaEmployee + nssaEmployer
  //    CREDIT NEC Payable (liability)             = necLevy
  //    CREDIT WCIF Payable (liability)            = wcifEmployer
  //    CREDIT ZIMDEF Payable (liability)          = zimdefEmployer
  //    CREDIT SDF Payable (liability)             = sdfContribution
  //    CREDIT Loan Deductions Payable (liability) = loanDeductions
  //    CREDIT Net Pay Payable (liability)         = netPay (bank transfer total)
  //
  // 4. If dual currency (USD+ZiG), split lines accordingly
  // 5. Validate: totalDebit === totalCredit (throw if not)
  // 6. Save JournalEntry + JournalEntryLine rows to DB
  // 7. Return the saved entries
}
```

**Key design decisions:**
- Journal entries are generated PER PAYROLL RUN (one batch), not per employee
- Each employee gets line items within the same journal entry (grouped)
- The Net Pay Payable line is the sum total to be transferred — this maps to a bank payment in QB
- Dual-currency runs generate separate USD and ZiG lines with appropriate currency indicators

**Validation rules:**
- Every DEBIT has a corresponding CREDIT (implicitly via the structure above)
- Total debits = total credits (cross-check all lines)
- No zero-amount lines
- All transactionCodes in the run must have GL mappings (throw clear error if not)

### Task 4.2 — Create `backend/lib/qbJournalPoster.js`

Handles the actual QB API call:

```javascript
async function postJournalEntry(journalEntry, lines, connection) {
  // 1. Get valid access token (refresh if needed)
  // 2. Build QB JournalEntry object:
  //    {
  //      "JournalEntry": {
  //        "DocNumber": "PAYROLL-2024-12",
  //        "TxnDate": "2024-12-31",
  //        "Line": [
  //          {
  //            "DetailType": "JournalEntryLineDetail",
  //            "Amount": 50000.00,
  //            "Description": "Gross Salary - John Doe (Dec 2024)",
  //            "JournalEntryLineDetail": {
  //              "PostingType": "Debit",
  //              "AccountRef": { "value": "QB_ACCOUNT_ID" }
  //            }
  //          },
  //          // ... credit lines ...
  //        ]
  //      }
  //    }
  // 3. POST to /v3/company/{realmId}/journalentry
  // 4. Store returned QB entry ID in JournalEntry.externalId
  // 5. Update status to POSTED
  // 6. On failure: store error, set status to FAILED
}
```

### Task 4.3 — Add sync routes to integrations

```
POST /api/integrations/:provider/sync/:runId — generate + post journal entry for a run
GET  /api/integrations/:provider/sync/history — list posted entries (JournalEntry rows)
POST /api/integrations/:provider/sync/:entryId/retry — retry a failed post
```

The sync endpoint:
1. Validates the run is COMPLETED
2. Fetches GL mappings for the provider
3. Calls `generateJournalEntries()`
4. Calls `postJournalEntry()` for each
5. Returns result

### Task 4.4 — Idempotency guard

Before generating a new entry, check if one already exists for `(payrollRunId, provider)`. If so, return the existing entry instead of duplicating. QuickBooks doesn't have true idempotency on JournalEntry creation, so we track it ourselves.

---

## Phase 5: Frontend Integration UI

> Produces: Working integration settings page with connect, map, and sync workflow.

### Task 5.1 — QuickBooks connection flow

In `frontend/src/pages/settings/Integrations.tsx`:

- "Connect to QuickBooks" button → calls `POST /api/integrations/quickbooks/auth` → redirects to returned URL
- After callback redirect back (with `?quickbooks=connected` query param), fetch connection status
- Show connected company name, disconnect button
- Show connection status: "Connected to {CompanyName} (QB sandbox/production)"

### Task 5.2 — GL mapping interface

- Fetch list of Bantu TransactionCodes (EARNING + DEDUCTION types)
- Fetch list of QB accounts (from `GET /api/integrations/quickbooks/accounts`)
- Fetch existing mappings
- Display in a two-column table: left = TransactionCode, right = QB account dropdown
- Show auto-suggested mapping with "(suggested)" badge and highlight
- "Fetch from QuickBooks" button to re-fetch chart of accounts

### Task 5.3 — Sync workflow

- "Payroll Runs" section showing completed runs ready for export
- "Post to QuickBooks" button per run
- Sync history table: date, run ID, status (POSTED/FAILED), "Retry" button for failed
- Status badges with colors (green = posted, red = failed, yellow = pending)

### Task 5.4 — Wire into navigation

Add "Integrations" link to settings sidebar. Route: `/settings/integrations`.

---

## Phase 6: Testing & Verification

> Produces: Automated tests for journal generation, OAuth flow, and sync endpoints.

### Task 6.1 — Unit tests for journal generation

Create `backend/__tests__/integrations/journalGenerator.test.js`:
- Test with single-currency run (USD)
- Test with dual-currency run (USD+ZiG)
- Test with all deduction types present
- Test that DEBIT totals = CREDIT totals
- Test error when mapping is missing
- Test with empty payslip run

### Task 6.2 — Unit tests for QB API client

Create `backend/__tests__/integrations/quickbooks.test.js`:
- Test token refresh when expired
- Test journal entry formatting
- Test error handling for QB API failures

### Task 6.3 — Integration test

Test the full flow end-to-end using QB sandbox:
- Connect to sandbox (manual — needs real credentials)
- Map transaction codes
- Generate journal entry
- Post to QB sandbox
- Verify in QB sandbox dashboard

### Task 6.4 — Run full test suite

```bash
cd backend && npm test
cd frontend && npm run build
```

---

## Future Phases (separate plans)

| Phase | Scope |
|---|---|
| Phase 7 | Xero integration (OAuth 2.0, same architecture) |
| Phase 8 | Sage integration |
| Phase 9 | Automated sync: post journal entries when payroll run status → COMPLETED |
| Phase 10 | QuickBooks Desktop sync (QBD — different API, SDK-based) |
| Phase 11 | QB Employees sync (auto-create/update employee records in QB) |

---

## Rollback Plan

If integration has issues:
1. Set `isActive = false` on the connection — stops all sync
2. Existing posted entries in QB remain (QB stays consistent)
3. Delete `IntegrationConnection` row to fully disconnect
4. Drop models via Prisma if rolling back schema changes:
   ```bash
   cd backend && npx prisma migrate down 1
   ```
