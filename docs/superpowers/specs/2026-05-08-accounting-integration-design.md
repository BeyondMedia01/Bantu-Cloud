# Bantu Accounting Integration — Design Spec

**Date:** 2026-05-08
**Status:** Draft

---

## Overview

Bantu processes payroll for Zimbabwean businesses but has no way to push payroll data into accounting platforms. Finance teams currently re-key payroll totals into QuickBooks/Xero manually — error-prone and time-consuming.

This spec describes a generic accounting integration framework with QuickBooks Online as the first target. The same architecture supports Xero, Sage, and others with minimal per-platform work (primarily OAuth flow + API model mapping).

---

## Goals

- One-click posting of completed payroll runs as journal entries to QuickBooks Online
- Configurable GL account mapping — users map Bantu TransactionCodes to QB accounts
- Support for single-currency (USD) and dual-currency (USD+ZiG) payroll runs
- Automatic token refresh (QB access tokens expire in 1 hour)
- Idempotent — re-posting the same run creates no duplicates
- Multi-tenant — each Bantu client connects their own QB company
- Offline-safe — uses existing SyncQueue pattern for reliability

---

## Non-Goals

- Bi-directional sync (employees, customers, invoices from QB into Bantu)
- Real-time sync during payroll processing (posted only on COMPLETED runs)
- QuickBooks Desktop (QBD) — Online only for v1
- Employee auto-creation in QuickBooks
- Payroll liability payment creation in QB (user handles bill payment separately)

---

## Architecture

### Data Flow

```
Bantu Payroll Run (COMPLETED)
        │
        ▼
  generateJournalEntries()
        │
        ├── Fetch payslips + transactions
        ├── Look up GL mappings (TransactionCode → QB account)
        ├── Build debit/credit lines
        ├── Validate (debits === credits)
        │
        ▼
  JournalEntry (DB, status=PENDING)
        │
        ▼
  postJournalEntry()
        │
        ├── Refresh OAuth token if expired
        ├── POST to QuickBooks API v3
        │
        ▼
  JournalEntry (DB, status=POSTED | FAILED)
        │
        ▼
  Frontend shows status
```

### Model Relationships

```
Client ──1:N── IntegrationConnection (QUICKBOOKS | XERO | SAGE)
Client ──1:N── GLAccountMapping (TransactionCode → QB Account)
Client ──1:N── JournalEntry
                     └──1:N── JournalEntryLine
```

### Journal Entry Structure (Per Payroll Run)

One journal entry per run, with debit and credit lines for each employee:

```
DEBIT:  Salaries & Wages (expense)          = gross per employee
DEBIT:  Employer NSSA (expense)             = nssaEmployer per employee
DEBIT:  Employer WCIF (expense)             = wcifEmployer per employee
DEBIT:  Employer ZIMDEF (expense)           = zimdefEmployer per employee
DEBIT:  Employer SDF (expense)              = sdfContribution per employee
DEBIT:  Employer NEC (expense)              = necEmployer per employee
CREDIT: PAYE Payable (liability)            = paye per employee
CREDIT: AIDS Levy Payable (liability)       = aidsLevy per employee
CREDIT: NSSA Payable (liability)            = nssaEmployee + nssaEmployer
CREDIT: NEC Payable (liability)             = necLevy
CREDIT: WCIF Payable (liability)            = wcifEmployer
CREDIT: ZIMDEF Payable (liability)          = zimdefEmployer
CREDIT: SDF Payable (liability)             = sdfContribution
CREDIT: Loan Deductions Payable (liability) = loanDeductions
CREDIT: Net Pay Payable (liability)         = netPay
```

**Validation rule:** Sum of all DEBITs == Sum of all CREDITs for each employee.

### Dual-Currency Handling

For runs with `dualCurrency = true`:
- USD amounts posted as primary currency (QB company's home currency)
- ZiG amounts included in description: "Gross Salary (USD 500 + ZiG 3500)"
- If QB company is USD-based, ZiG amounts are converted at the run's `exchangeRate` and the rate is noted in the description

---

## API Design

### Routes

All routes are mounted at `/api/integrations`:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Required | List active integrations |
| POST | `/quickbooks/auth` | Required | Start OAuth, return auth URL |
| GET | `/quickbooks/callback` | Public | OAuth callback from QB |
| POST | `/quickbooks/disconnect` | Required | Deactivate connection |
| GET | `/quickbooks/status` | Required | Connection status + company info |
| GET | `/:provider/accounts` | Required | Fetch QB chart of accounts |
| GET | `/:provider/mappings` | Required | List GL mappings |
| POST | `/:provider/mappings` | Required | Create/update mapping |
| PUT | `/:provider/mappings/:id` | Required | Update mapping |
| DELETE | `/:provider/mappings/:id` | Required | Remove mapping |
| POST | `/:provider/mappings/suggest` | Required | Auto-suggest mappings |
| POST | `/:provider/sync/:runId` | Required | Generate + post journal entry |
| GET | `/:provider/sync/history` | Required | List posted entries |
| POST | `/:provider/sync/:entryId/retry` | Required | Retry failed post |

---

## Frontend Design

### Route

`/settings/integrations` — new page in the Settings section.

### Page Layout

Three panels (vertical stack):

**1. Connection Panel**
- Provider cards (QuickBooks first, Xero/Sage grayed as "Coming Soon")
- Connected state: company name, status badge, "Disconnect" button
- Disconnected state: "Connect to QuickBooks" button

**2. GL Mapping Panel**
- Searchable table of TransactionCodes (filter by type: EARNING/DEDUCTION)
- Each row shows: Code name, Income Category, current QB account mapping (dropdown)
- "Fetch from QuickBooks" button to refresh QB chart of accounts
- "Auto-suggest" button to apply default mappings
- Save button (batch save all changes)

**3. Sync Panel**
- Dropdown to select a COMPLETED payroll run
- "Preview" button: shows projected debit/credit totals before posting
- "Post to QuickBooks" button
- History table: Date, Run ID, Status (badge), Actions (Retry if failed, View in QB if posted)

### States

| State | Behavior |
|-------|----------|
| Not connected | Only Connection panel visible; show "Connect to QuickBooks" CTA |
| Connected, no mappings | Show empty mapping table with "Fetch from QuickBooks" prompt |
| Connected, mapped | Full three-panel view |
| Syncing | Spinner on sync button, progress indicator |
| Posted | Green success badge, link to view in QB |
| Failed | Red error badge, error message, "Retry" button |

---

## Security

- OAuth tokens encrypted at rest in `IntegrationConnection` (use Prisma `Json` field or column-level encryption via `encrypt` package)
- Token refresh happens server-side, never exposed to frontend
- QB API calls always go through backend proxy — frontend never gets QB access tokens
- PKCE flow prevents authorization code interception
- Each client can only see their own connections (scoped by `clientId` in middleware)
- Rate limiting on sync endpoints (max 1 post per 30 seconds per client)

---

## Configuration (Environment Variables)

```
QUICKBOOKS_CLIENT_ID=<client_id>
QUICKBOOKS_CLIENT_SECRET=<client_secret>
QUICKBOOKS_REDIRECT_URI=https://app.bantu.co.zw/api/integrations/quickbooks/callback
QUICKBOOKS_SANDBOX=true
```

In production:
- Register Bantu as a QuickBooks app via Intuit Developer portal
- Request `com.intuit.quickbooks.accounting` scope
- Set `QUICKBOOKS_SANDBOX=false`

---

## Migration

1. Prisma migration adds 4 new models (no changes to existing tables)
2. No existing data migration needed
3. Zero downtime — old code ignores new tables

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| QB API rate limits (500 req/min per company) | Batch employee lines into one JournalEntry per run (1 API call per run, well under limit) |
| Token refresh failure | Store last error, show in UI, auto-retry on next sync attempt |
| OAuth callback lost (user closes tab) | User can re-initiate from settings; existing token never stored |
| Journal entry too large (QB max 500 lines per entry) | For companies with 500+ employees, split into multiple journal entries (unlikely — Bantu targets SMEs) |
| QB sandbox vs production mismatch | `QUICKBOOKS_SANDBOX` env var; UI shows "Sandbox" badge when active |
| Network failure during post | JournalEntry saved as PENDING before API call; retry button re-posts |

---

## Testing Strategy

- **Journal generator unit tests**: Validate debit/credit equality, correct amounts, dual-currency splitting
- **OAuth flow tests**: Mock `openid-client`, verify token storage and refresh
- **QB sandbox tests**: Manual — connect a real sandbox company, post and verify in QB dashboard
- **Frontend tests**: Mock API responses, verify all three panel states
