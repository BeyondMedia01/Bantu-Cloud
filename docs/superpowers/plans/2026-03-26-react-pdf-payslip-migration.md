# React-PDF Payslip Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the PDFKit coordinate-based renderers for the Individual Payslip and Payroll Summary Report with `@react-pdf/renderer` (JSX + Flexbox), eliminating all coordinate drift bugs while keeping every other PDF (P16, P4A, P2, IT7, Master Roll) on PDFKit unchanged.

**Architecture:** Two new React-PDF component files (`payslipDocument.jsx` and `summaryDocument.jsx`) replace only `_drawPayslip` and `_drawPayslipSummary`. The public API of `pdfService.js` (`generatePayslipBuffer`, `generatePayslipPDF`, `generatePayslipSummaryPDF`, `generatePayslipSummaryBuffer`) stays identical so zero callers need changes. Both old functions are deleted from `pdfService.js` after the new renderers are validated.

**Tech Stack:** `@react-pdf/renderer` v4, React 18 (peer dep), Node.js 20, existing Express backend

---

## Scope — What changes, what doesn't

| File | Change |
|------|--------|
| `backend/utils/payslipDocument.jsx` | **Create** — React-PDF component for individual payslip |
| `backend/utils/summaryDocument.jsx` | **Create** — React-PDF component for payroll summary |
| `backend/utils/pdfService.js` | **Modify** — replace `_drawPayslip` + `_drawPayslipSummary`, update `generatePayslipBuffer/PDF/SummaryPDF/SummaryBuffer` to call new renderers |
| `backend/package.json` | **Modify** — add `@react-pdf/renderer` |
| `backend/tests/payslipDocument.test.js` | **Create** — buffer generation smoke tests |
| `backend/tests/summaryDocument.test.js` | **Create** — buffer generation smoke tests |

**Do NOT touch:** `generateP16PDF`, `generateNSSA_P4A`, `generateP2PDF`, `generateIT7PDF`, `generatePayrollSummaryPDF` — these stay on PDFKit.

---

## Data Contracts (read this before writing any component)

### Individual Payslip (`data` object passed to `generatePayslipBuffer`)

```js
{
  companyName: string,
  period: string,             // e.g. "01/03/2026 – 31/03/2026"
  issuedDate: string,         // e.g. "26/03/2026"
  employeeName: string,
  employeeCode: string,
  nationalId: string,
  jobTitle: string,
  department: string,
  costCenter: string,
  paymentMethod: string,      // 'BANK' | 'CASH'
  bankName: string,
  accountNumber: string,
  bankMissing: boolean,       // throw BANK_DETAILS_MISSING if true
  currency: string,           // 'USD'
  lineItems: [
    {
      name: string,
      description?: string,
      allowance: number,      // > 0 = earning
      deduction: number,      // > 0 = deduction
      employer: number,       // > 0 = employer contribution
      ytd: number | null,     // null on first run — use ?? not ||
    }
  ],
  grossPay: number,
  totalDeductions: number,
  netSalary: number,
  netPayUSD: number | null,   // set when currency split active
  netPayZIG: number | null,
  leaveBalance: number,
  leaveTaken: number,
}
```

### Payroll Summary (`data` object)

```js
{
  companyName: string,
  period: string,
  date: string,
  time: string,
  groups: [
    {
      name: string,           // department name
      payslips: [
        {
          currency: string,
          netPay: number,
          employee: { employeeCode, firstName, lastName },
          displayLines: [     // same shape as lineItems above
            { name, allowance, deduction, employer, ytd }
          ]
        }
      ]
    }
  ]
}
```

---

## Shared Design Tokens (use in both components)

```js
// colors
const DARK_NAVY   = '#1a2e4a';
const BANTU_GREEN = '#B2DB64';
const TEXT_DARK   = '#1e293b';
const TEXT_MUTED  = '#64748b';
const BG_LIGHT    = '#f8fafc';
const BORDER      = '#e2e8f0';
const RED         = '#dc2626';

// typography
const FONT_BOLD   = 'Helvetica-Bold';   // built-in, no font registration needed
const FONT_REG    = 'Helvetica';

// helpers
const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => `USD ${fmt(n)}`;
```

---

## Task 1: Install dependency

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install `@react-pdf/renderer`**

```bash
cd backend
npm install @react-pdf/renderer
```

Expected: `@react-pdf/renderer` appears in `package.json` dependencies, no peer-dep errors.

- [ ] **Step 2: Verify import works in Node**

```bash
node -e "const { renderToBuffer } = require('@react-pdf/renderer'); console.log(typeof renderToBuffer)"
```

Expected output: `function`

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add @react-pdf/renderer dependency"
```

---

## Task 2: Individual Payslip Component (`payslipDocument.jsx`)

**Files:**
- Create: `backend/utils/payslipDocument.jsx`
- Create: `backend/tests/payslipDocument.test.js`

### Section layout (top to bottom, all Flexbox)

```
┌──────────────────────────────────────────────────────┐  HEADER (navy, 110pt)
│  [Logo]  COMPANY NAME          PAYSLIP               │
│          Period / Issued        [Leave Balance Box]   │
└──────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────┐  EMPLOYEE CARD (grey, ~80pt)
│  Name  |  Code  |  ID                                │
│  Dept  |  Position  |  Cost Centre  |  Pay Method    │
└──────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────┐  BANK BAR (light blue, 32pt)
│  Bank: FBC Bank          Acc: 1234567890             │
└──────────────────────────────────────────────────────┘
┌────────────────────────┬─────────────────────────────┐  TABLES (side by side)
│ EARNINGS               │ DEDUCTIONS                  │
│ Desc | Amount | YTD    │ Desc | Amount | YTD         │
│ row…                   │ row…                        │
└────────────────────────┴─────────────────────────────┘
┌──────────────────────────────────────────────────────┐  EMPLOYER CONTRIBS (full width)
│ STATUTORY EMPLOYER CONTRIBUTIONS                     │
│ Desc | Amount | YTD                                  │
└──────────────────────────────────────────────────────┘
┌──────────┬─────────────┬─────────────────────────────┐  SUMMARY RIBBON (3 boxes)
│ TOTAL    │ TOTAL       │ NET SALARY                   │
│ EARNINGS │ DEDUCTIONS  │ USD 488.75                   │
└──────────┴─────────────┴─────────────────────────────┘
┌──────────────────────────────────────────────────────┐  FOOTER
│ [Logo]  Bantu Modern HR & Payroll    CONFIDENTIAL    │
└──────────────────────────────────────────────────────┘
```

- [ ] **Step 1: Write the failing smoke test**

```js
// backend/tests/payslipDocument.test.js
import { describe, it, expect } from 'vitest';
import { generatePayslipBuffer } from '../utils/payslipDocument.jsx';

const MOCK = {
  companyName: 'Test Co', period: '01/03/2026 – 31/03/2026',
  issuedDate: '26/03/2026', employeeName: 'Jane Smith',
  employeeCode: 'EMP001', nationalId: '63-123456A78',
  jobTitle: 'Engineer', department: 'IT',
  costCenter: 'CC1', paymentMethod: 'BANK',
  bankName: 'FBC Bank', accountNumber: '1234567890',
  bankMissing: false, currency: 'USD',
  lineItems: [
    { name: 'Basic Salary', allowance: 600, deduction: 0, employer: 0, ytd: 600 },
    { name: 'PAYE',         allowance: 0, deduction: 100, employer: 0, ytd: 100 },
    { name: 'NSSA Employee',allowance: 0, deduction: 10,  employer: 0, ytd: 10 },
    { name: 'NSSA Employer',allowance: 0, deduction: 0,   employer: 11.3, ytd: 11.3 },
  ],
  grossPay: 600, totalDeductions: 110, netSalary: 490,
  netPayUSD: null, netPayZIG: null,
  leaveBalance: 2.5, leaveTaken: 0,
};

describe('payslipDocument', () => {
  it('generates a non-empty buffer', async () => {
    const buf = await generatePayslipBuffer(MOCK);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('throws BANK_DETAILS_MISSING when bankMissing is true', async () => {
    await expect(generatePayslipBuffer({ ...MOCK, bankMissing: true }))
      .rejects.toMatchObject({ code: 'BANK_DETAILS_MISSING' });
  });

  it('renders zero YTD without doubling (first-run employee)', async () => {
    const data = {
      ...MOCK,
      lineItems: [{ name: 'Basic Salary', allowance: 600, deduction: 0, employer: 0, ytd: 0 }],
    };
    // Should not throw — 0 is a valid YTD value
    const buf = await generatePayslipBuffer(data);
    expect(buf.length).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (file doesn't exist yet)**

```bash
cd backend && npx vitest run tests/payslipDocument.test.js
```

Expected: `Cannot find module '../utils/payslipDocument.jsx'`

- [ ] **Step 3: Create `backend/utils/payslipDocument.jsx`**

```jsx
import React from 'react';
import {
  Document, Page, View, Text, StyleSheet, renderToBuffer
} from '@react-pdf/renderer';

// ── Design tokens ────────────────────────────────────────────────────────────
const DARK_NAVY   = '#1a2e4a';
const BANTU_GREEN = '#B2DB64';
const TEXT_DARK   = '#1e293b';
const TEXT_MUTED  = '#64748b';
const BG_LIGHT    = '#f8fafc';
const BORDER      = '#e2e8f0';
const RED         = '#dc2626';
const NAVY_LIGHT  = '#1e3a5f';

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const usd = (n) => `USD ${fmt(n)}`;

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  page:        { fontFamily: 'Helvetica', fontSize: 8, paddingBottom: 65 },

  // Header
  header:      { backgroundColor: DARK_NAVY, padding: 12, flexDirection: 'row',
                 justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLeft:  { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  logoBox:     { width: 42, height: 42, backgroundColor: BANTU_GREEN,
                 borderRadius: 4, marginRight: 10, justifyContent: 'center',
                 alignItems: 'center' },
  logoText:    { color: DARK_NAVY, fontSize: 10, fontFamily: 'Helvetica-Bold' },
  company:     { color: BANTU_GREEN, fontFamily: 'Helvetica-Bold', fontSize: 14 },
  periodText:  { color: 'white', fontSize: 8, marginTop: 3 },
  payslipTitle:{ color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 20,
                 textAlign: 'right' },
  leaveBox:    { backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 4,
                 padding: 7, marginTop: 6, width: 130 },
  leaveLabel:  { color: 'rgba(255,255,255,0.7)', fontSize: 6, fontFamily: 'Helvetica-Bold' },
  leaveValue:  { color: BANTU_GREEN, fontSize: 14, fontFamily: 'Helvetica-Bold', marginTop: 3 },
  leaveTaken:  { color: 'rgba(255,255,255,0.55)', fontSize: 6, marginTop: 2 },

  // Employee card
  card:        { backgroundColor: BG_LIGHT, borderRadius: 5, padding: 10,
                 marginHorizontal: 10, marginTop: 6,
                 borderWidth: 0.5, borderColor: BORDER },
  cardRow:     { flexDirection: 'row', marginBottom: 6 },
  fieldBlock:  { flex: 1 },
  fieldLabel:  { color: TEXT_MUTED, fontSize: 6, fontFamily: 'Helvetica-Bold',
                 textTransform: 'uppercase' },
  fieldValue:  { color: TEXT_DARK, fontSize: 8.5, fontFamily: 'Helvetica-Bold', marginTop: 2 },

  // Bank bar
  bankBar:     { backgroundColor: '#edf2f7', marginHorizontal: 10, marginTop: 5,
                 padding: 8, flexDirection: 'row',
                 borderWidth: 0.5, borderColor: BORDER },

  // Tables
  tables:      { flexDirection: 'row', marginHorizontal: 10, marginTop: 5, gap: 5 },
  tableHalf:   { flex: 1 },
  tableHeader: { backgroundColor: DARK_NAVY, padding: 5, paddingBottom: 3 },
  tableTitle:  { fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  subHeaders:  { flexDirection: 'row', marginTop: 4 },
  subHdrDesc:  { flex: 1, color: 'rgba(255,255,255,0.65)', fontSize: 6 },
  subHdrAmt:   { width: 72, color: 'rgba(255,255,255,0.65)', fontSize: 6, textAlign: 'right' },
  subHdrYtd:   { width: 58, color: 'rgba(255,255,255,0.65)', fontSize: 6, textAlign: 'right' },
  tableRow:    { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 5 },
  rowEven:     { backgroundColor: '#f7f9fc' },
  rowDesc:     { flex: 1, color: TEXT_DARK, fontSize: 7.5 },
  rowSubDesc:  { flex: 1, color: TEXT_MUTED, fontSize: 6, marginTop: 1 },
  rowAmt:      { width: 72, fontFamily: 'Helvetica-Bold', fontSize: 7.5,
                 textAlign: 'right', color: DARK_NAVY },
  rowYtd:      { width: 58, fontSize: 7, textAlign: 'right', color: TEXT_MUTED },

  // Employer contributions
  empSection:  { marginHorizontal: 10, marginTop: 5 },
  empHeader:   { backgroundColor: NAVY_LIGHT, padding: 5, paddingBottom: 3 },
  empTitle:    { color: '#a5b4fc', fontFamily: 'Helvetica-Bold', fontSize: 8 },
  empSubHdrs:  { flexDirection: 'row', marginTop: 4 },
  empRow:      { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 5 },
  empRowDesc:  { flex: 1, color: TEXT_DARK, fontSize: 7.5 },
  empRowAmt:   { width: 72, fontFamily: 'Helvetica-Bold', fontSize: 7.5,
                 textAlign: 'right', color: '#3730a3' },
  empRowYtd:   { width: 58, fontSize: 7, textAlign: 'right', color: TEXT_MUTED },

  // Summary ribbon — 3 boxes
  ribbon:      { flexDirection: 'row', marginHorizontal: 10, marginTop: 5, gap: 4 },
  ribbonBox:   { flex: 1, padding: 10, borderRadius: 3 },
  ribbonLabel: { fontSize: 6.5, marginBottom: 6 },
  ribbonAmt:   { fontFamily: 'Helvetica-Bold', fontSize: 11, textAlign: 'right' },
  ribbonAmtLg: { fontFamily: 'Helvetica-Bold', fontSize: 14, textAlign: 'right' },

  // Footer (absolute, always at bottom)
  footer:      { position: 'absolute', bottom: 12, left: 12, right: 12,
                 borderTopWidth: 0.5, borderColor: BORDER,
                 flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  footerLogo:  { width: 18, height: 18, backgroundColor: BANTU_GREEN,
                 borderRadius: 3, justifyContent: 'center', alignItems: 'center',
                 marginRight: 6 },
  footerBrand: { flex: 1, color: TEXT_MUTED, fontSize: 7, fontFamily: 'Helvetica-Bold',
                 textAlign: 'center' },
  footerConf:  { color: TEXT_MUTED, fontSize: 7, textAlign: 'right' },
});

// ── Sub-components ───────────────────────────────────────────────────────────

const Field = ({ label, value, style }) => (
  <View style={[s.fieldBlock, style]}>
    <Text style={s.fieldLabel}>{label}</Text>
    <Text style={s.fieldValue}>{value || '—'}</Text>
  </View>
);

const TableSection = ({ title, titleColor, rows, getAmt, getYtd }) => (
  <View style={s.tableHalf}>
    <View style={s.tableHeader}>
      <Text style={[s.tableTitle, { color: titleColor }]}>{title}</Text>
      <View style={s.subHeaders}>
        <Text style={s.subHdrDesc}>DESCRIPTION</Text>
        <Text style={s.subHdrAmt}>AMOUNT (USD)</Text>
        <Text style={s.subHdrYtd}>YTD (USD)</Text>
      </View>
    </View>
    {rows.map((item, idx) => (
      <View key={idx} style={[s.tableRow, idx % 2 === 0 ? s.rowEven : {}]}>
        <View style={{ flex: 1 }}>
          <Text style={s.rowDesc}>{item.name}</Text>
          {item.description ? <Text style={s.rowSubDesc}>{item.description}</Text> : null}
        </View>
        <Text style={s.rowAmt}>{usd(getAmt(item))}</Text>
        <Text style={s.rowYtd}>{usd(getYtd(item) ?? getAmt(item))}</Text>
      </View>
    ))}
  </View>
);

// ── Main Document Component ──────────────────────────────────────────────────

const PayslipDocument = ({ data }) => {
  const {
    companyName, period, issuedDate, employeeName, employeeCode, nationalId,
    jobTitle, department, costCenter, paymentMethod, bankName, accountNumber,
    currency, lineItems = [], grossPay, totalDeductions, netSalary,
    netPayUSD, netPayZIG, leaveBalance, leaveTaken,
  } = data;

  const earnings   = lineItems.filter(i => (i.allowance ?? 0) > 0);
  const deductions = lineItems.filter(i => (i.deduction  ?? 0) > 0);
  const employers  = lineItems.filter(i => (i.employer   ?? 0) > 0);

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* ── Section 1: Identity Header ─────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <View style={s.logoBox}>
              <Text style={s.logoText}>B</Text>
            </View>
            <View>
              <Text style={s.company}>{(companyName || '').toUpperCase()}</Text>
              <Text style={s.periodText}>Period: {period}</Text>
              <Text style={s.periodText}>Issued: {issuedDate}</Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.payslipTitle}>PAYSLIP</Text>
            <View style={s.leaveBox}>
              <Text style={s.leaveLabel}>ANNUAL LEAVE BALANCE</Text>
              <Text style={s.leaveValue}>{(leaveBalance || 0).toFixed(1)} days</Text>
              {leaveTaken > 0 && (
                <Text style={s.leaveTaken}>{leaveTaken.toFixed(1)} days taken YTD</Text>
              )}
            </View>
          </View>
        </View>

        {/* ── Section 2: Employee & Job Details Card ─────────────────── */}
        <View style={s.card}>
          <View style={s.cardRow}>
            <Field label="Employee Name" value={employeeName} style={{ flex: 1.5 }} />
            <Field label="Employee Code" value={employeeCode} />
            <Field label="ID Number"     value={nationalId}   style={{ flex: 1.5 }} />
          </View>
          <View style={[s.cardRow, { marginBottom: 0 }]}>
            <Field label="Department"  value={department} />
            <Field label="Position"    value={jobTitle} />
            <Field label="Cost Centre" value={costCenter} />
            <Field label="Pay Method"  value={paymentMethod} />
          </View>
        </View>

        {/* ── Section 3: Payment Destination Bar ─────────────────────── */}
        <View style={s.bankBar}>
          <Field label="Bank Name"      value={bankName}      style={{ flex: 1 }} />
          <Field label="Account Number" value={accountNumber} style={{ flex: 1 }} />
        </View>

        {/* ── Section 4: Side-by-Side Financial Tables ───────────────── */}
        <View style={s.tables}>
          <TableSection
            title="EARNINGS" titleColor={BANTU_GREEN}
            rows={earnings}
            getAmt={e => e.allowance}
            getYtd={e => e.ytd}
          />
          <TableSection
            title="DEDUCTIONS" titleColor="#fb7185"
            rows={deductions}
            getAmt={d => d.deduction}
            getYtd={d => d.ytd}
          />
        </View>

        {/* ── Section 5: Employer Contributions ──────────────────────── */}
        {employers.length > 0 && (
          <View style={s.empSection}>
            <View style={s.empHeader}>
              <Text style={s.empTitle}>STATUTORY EMPLOYER CONTRIBUTIONS</Text>
              <View style={s.empSubHdrs}>
                <Text style={[s.subHdrDesc, { flex: 1 }]}>DESCRIPTION</Text>
                <Text style={s.subHdrAmt}>AMOUNT (USD)</Text>
                <Text style={s.subHdrYtd}>YTD (USD)</Text>
              </View>
            </View>
            {employers.map((c, idx) => (
              <View key={idx} style={[s.empRow, idx % 2 === 0 ? { backgroundColor: '#f0f4ff' } : {}]}>
                <Text style={s.empRowDesc}>{c.name}</Text>
                <Text style={s.empRowAmt}>{usd(c.employer)}</Text>
                {c.ytd != null && <Text style={s.empRowYtd}>{usd(c.ytd)}</Text>}
              </View>
            ))}
          </View>
        )}

        {/* ── Section 6: Three-Box Summary Ribbon ────────────────────── */}
        <View style={s.ribbon}>
          {/* Box 1 — Total Earnings */}
          <View style={[s.ribbonBox, { backgroundColor: DARK_NAVY }]}>
            <Text style={[s.ribbonLabel, { color: 'rgba(255,255,255,0.7)' }]}>TOTAL EARNINGS</Text>
            <Text style={[s.ribbonAmt, { color: 'white' }]}>{usd(grossPay)}</Text>
          </View>
          {/* Box 2 — Total Deductions */}
          <View style={[s.ribbonBox, { backgroundColor: '#f1f5f9' }]}>
            <Text style={[s.ribbonLabel, { color: TEXT_MUTED }]}>TOTAL DEDUCTIONS</Text>
            <Text style={[s.ribbonAmt, { color: RED }]}>{usd(totalDeductions)}</Text>
          </View>
          {/* Box 3 — Net Salary */}
          <View style={[s.ribbonBox, { backgroundColor: BANTU_GREEN }]}>
            <Text style={[s.ribbonLabel, { color: DARK_NAVY, fontFamily: 'Helvetica-Bold' }]}>NET SALARY</Text>
            {netPayUSD != null && netPayZIG != null ? (
              <>
                <Text style={[s.ribbonAmt, { color: DARK_NAVY, fontSize: 11 }]}>USD {fmt(netPayUSD)}</Text>
                <Text style={[s.ribbonAmt, { color: DARK_NAVY, fontSize: 9, marginTop: 2 }]}>ZiG {fmt(netPayZIG)}</Text>
              </>
            ) : (
              <Text style={[s.ribbonAmtLg, { color: DARK_NAVY }]}>{usd(netSalary)}</Text>
            )}
          </View>
        </View>

        {/* ── Section 7: Footer (absolute, always at page bottom) ─────── */}
        <View style={s.footer} fixed>
          <View style={s.footerLogo}>
            <Text style={{ color: DARK_NAVY, fontSize: 8, fontFamily: 'Helvetica-Bold' }}>B</Text>
          </View>
          <Text style={s.footerBrand}>Bantu Modern HR &amp; Payroll Automation</Text>
          <Text style={s.footerConf}>CONFIDENTIAL DOCUMENT</Text>
        </View>

      </Page>
    </Document>
  );
};

// ── Public API ───────────────────────────────────────────────────────────────

export async function generatePayslipBuffer(data) {
  if (data.bankMissing) {
    const err = new Error(
      `Bank details incomplete for ${data.employeeName || 'employee'}. ` +
      'Both Bank Name and Account Number must be set before generating a payslip.'
    );
    err.code = 'BANK_DETAILS_MISSING';
    throw err;
  }
  return renderToBuffer(<PayslipDocument data={data} />);
}

export async function generatePayslipPDF(data, stream) {
  const buf = await generatePayslipBuffer(data);
  stream.end(buf);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend && npx vitest run tests/payslipDocument.test.js
```

Expected: all 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/payslipDocument.jsx backend/tests/payslipDocument.test.js
git commit -m "feat(payslip): React-PDF individual payslip component with smoke tests"
```

---

## Task 3: Payroll Summary Component (`summaryDocument.jsx`)

**Files:**
- Create: `backend/utils/summaryDocument.jsx`
- Create: `backend/tests/summaryDocument.test.js`

### Layout per employee block

```
DEPARTMENT NAME
  EMP001  SMITH, Jane
  ┌──────────────┬──────────────┬──────────────┐
  │ EARNINGS     │ DEDUCTIONS   │ EMPLOYER     │
  │ Desc | Amt   │ Desc | Amt   │ Desc | Amt   │
  │ …            │ …            │ …            │
  └──────────────┴──────────────┴──────────────┘
  NET PAY: USD 488.75
  ────────────────────────────────────────────
SUBTOTAL — DEPARTMENT: ...  ...  ...
```

- [ ] **Step 1: Write the failing smoke test**

```js
// backend/tests/summaryDocument.test.js
import { describe, it, expect } from 'vitest';
import { generatePayslipSummaryBuffer } from '../utils/summaryDocument.jsx';

const MOCK = {
  companyName: 'Test Co', period: '2026/03',
  date: '26/03/2026', time: '09:00',
  groups: [
    {
      name: 'Engineering',
      payslips: [
        {
          currency: 'USD', netPay: 490,
          employee: { employeeCode: 'EMP001', firstName: 'Jane', lastName: 'Smith' },
          displayLines: [
            { name: 'Basic Salary', allowance: 600, deduction: 0,   employer: 0,    ytd: 600 },
            { name: 'PAYE',         allowance: 0,   deduction: 100, employer: 0,    ytd: 100 },
            { name: 'NSSA Employer',allowance: 0,   deduction: 0,   employer: 11.3, ytd: 11.3 },
          ],
        },
      ],
    },
  ],
};

describe('summaryDocument', () => {
  it('generates a non-empty buffer', async () => {
    const buf = await generatePayslipSummaryBuffer(MOCK);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('handles empty groups array', async () => {
    const buf = await generatePayslipSummaryBuffer({ ...MOCK, groups: [] });
    expect(buf).toBeInstanceOf(Buffer);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd backend && npx vitest run tests/summaryDocument.test.js
```

- [ ] **Step 3: Create `backend/utils/summaryDocument.jsx`**

```jsx
import React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';

const DARK_NAVY   = '#1a2e4a';
const BANTU_GREEN = '#B2DB64';
const TEXT_DARK   = '#1e293b';
const TEXT_MUTED  = '#64748b';
const BORDER      = '#e2e8f0';

const fmt = (n) =>
  Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const normalizeLabel = (name) => {
  if (!name) return '';
  const l = name.toLowerCase();
  if (l.includes('wcif') || l.includes('workers') || l.includes('workmen') || l.includes('compensation insurance')) {
    const m = name.match(/\(\s*[\d.]+\s*%\s*\)/);
    return m ? `WCIF ${m[0]}` : 'WCIF (1.25%)';
  }
  return name;
};

const s = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 7.5, paddingBottom: 65 },
  header:     { backgroundColor: DARK_NAVY, padding: 12, flexDirection: 'row',
                justifyContent: 'space-between', alignItems: 'flex-start' },
  company:    { color: BANTU_GREEN, fontFamily: 'Helvetica-Bold', fontSize: 14 },
  meta:       { color: 'white', fontSize: 8, marginTop: 3 },
  title:      { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 20, textAlign: 'right' },

  colHdr:     { backgroundColor: DARK_NAVY, flexDirection: 'row', padding: 4,
                marginHorizontal: 10, marginTop: 14 },
  colHdrText: { color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 7.5 },
  colAmt:     { width: 68, color: 'white', fontFamily: 'Helvetica-Bold',
                fontSize: 7.5, textAlign: 'right' },

  deptLabel:  { color: DARK_NAVY, fontFamily: 'Helvetica-Bold', fontSize: 9,
                paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  empName:    { color: DARK_NAVY, fontFamily: 'Helvetica-Bold', fontSize: 7.5,
                paddingHorizontal: 10, paddingBottom: 3 },

  threeCol:   { flexDirection: 'row', marginHorizontal: 10 },
  colSection: { flex: 1, borderRightWidth: 0.3, borderColor: BORDER },
  colTitle:   { backgroundColor: '#e8edf3', padding: 3, fontSize: 6.5,
                fontFamily: 'Helvetica-Bold', color: DARK_NAVY },
  dataRow:    { flexDirection: 'row', paddingHorizontal: 4, paddingVertical: 2 },
  dataDesc:   { flex: 1, color: TEXT_DARK },
  dataAmt:    { width: 68, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK_NAVY },
  dataAmtGrey:{ width: 68, textAlign: 'right', color: TEXT_MUTED },

  netPay:     { flexDirection: 'row', paddingHorizontal: 10, paddingTop: 4,
                paddingBottom: 2, justifyContent: 'flex-end' },
  netLabel:   { color: '#059669', fontFamily: 'Helvetica-Bold', fontSize: 8, marginRight: 6 },
  netValue:   { color: DARK_NAVY, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },

  divider:    { borderBottomWidth: 0.3, borderColor: BORDER, marginHorizontal: 10,
                marginTop: 4, marginBottom: 6 },

  subtotal:   { backgroundColor: '#f1f5f9', flexDirection: 'row', padding: 5,
                marginHorizontal: 10, marginBottom: 4 },
  subtotLabel:{ flex: 1, fontFamily: 'Helvetica-Bold', fontSize: 7.5, color: DARK_NAVY },
  subtotAmt:  { width: 68, textAlign: 'right', fontFamily: 'Helvetica-Bold', color: DARK_NAVY },

  grandTotal: { backgroundColor: DARK_NAVY, flexDirection: 'row', padding: 7,
                marginHorizontal: 10, marginTop: 6 },
  gtLabel:    { flex: 1, color: 'white', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  gtAmt:      { width: 80, textAlign: 'right', color: 'white',
                fontFamily: 'Helvetica-Bold', fontSize: 9 },

  footer:     { position: 'absolute', bottom: 12, left: 12, right: 12,
                borderTopWidth: 0.5, borderColor: BORDER,
                flexDirection: 'row', alignItems: 'center', paddingTop: 6 },
  footerLogo: { width: 18, height: 18, backgroundColor: BANTU_GREEN, borderRadius: 3,
                justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  footerBrand:{ flex: 1, color: TEXT_MUTED, fontSize: 7, fontFamily: 'Helvetica-Bold',
                textAlign: 'center' },
  footerConf: { color: TEXT_MUTED, fontSize: 7, textAlign: 'right' },
});

const SummaryDocument = ({ data }) => {
  const { companyName, period, date, time, groups = [] } = data;

  let grandEarnings = 0, grandDeductions = 0, grandEmployer = 0, grandNet = 0;

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Header */}
        <View style={s.header} fixed>
          <View>
            <Text style={s.company}>{(companyName || '').toUpperCase()}</Text>
            <Text style={s.meta}>Period: {period}</Text>
            <Text style={s.meta}>Generated: {date}  {time}</Text>
          </View>
          <Text style={s.title}>PAYROLL SUMMARY</Text>
        </View>

        {/* Column headers */}
        <View style={s.colHdr} fixed>
          <Text style={[s.colHdrText, { flex: 1 }]}>EARNINGS</Text>
          <Text style={s.colAmt}>AMOUNT</Text>
          <Text style={[s.colHdrText, { flex: 1, paddingLeft: 6 }]}>DEDUCTIONS</Text>
          <Text style={s.colAmt}>AMOUNT</Text>
          <Text style={[s.colHdrText, { flex: 1, paddingLeft: 6 }]}>EMPLOYER CONTRIB.</Text>
          <Text style={s.colAmt}>AMOUNT</Text>
        </View>

        {/* Groups */}
        {groups.map((group, gi) => {
          let groupEarnings = 0, groupDeductions = 0, groupEmployer = 0, groupNet = 0;

          return (
            <View key={gi}>
              <Text style={s.deptLabel}>{(group.name || 'General').toUpperCase()}</Text>

              {group.payslips.map((p, pi) => {
                const emp      = p.employee || {};
                const lines    = p.displayLines || [];
                const earnings  = lines.filter(l => (l.allowance ?? 0) > 0);
                const deductions= lines.filter(l => (l.deduction  ?? 0) > 0);
                const employers = lines.filter(l => (l.employer   ?? 0) > 0);
                const maxRows   = Math.max(earnings.length, deductions.length, employers.length);

                const totalAllow = earnings.reduce((s, e)  => s + (e.allowance ?? 0), 0);
                const totalDed   = deductions.reduce((s, d) => s + (d.deduction ?? 0), 0);
                const totalEmpr  = employers.reduce((s, r)  => s + (r.employer  ?? 0), 0);
                const netPay     = p.netPay ?? (totalAllow - totalDed);
                const ccy        = p.currency || 'USD';

                groupEarnings   += totalAllow;
                groupDeductions += totalDed;
                groupEmployer   += totalEmpr;
                groupNet        += netPay;

                return (
                  <View key={pi} wrap={false}>
                    <Text style={s.empName}>
                      {emp.employeeCode}  {(emp.lastName || '').toUpperCase()}, {emp.firstName}
                    </Text>
                    <View style={s.threeCol}>
                      {/* Earnings column */}
                      <View style={s.colSection}>
                        {Array.from({ length: maxRows }).map((_, i) => {
                          const e = earnings[i];
                          return e ? (
                            <View key={i} style={s.dataRow}>
                              <Text style={s.dataDesc}>{e.name}</Text>
                              <Text style={s.dataAmt}>{fmt(e.allowance)}</Text>
                            </View>
                          ) : <View key={i} style={[s.dataRow, { height: 14 }]} />;
                        })}
                      </View>
                      {/* Deductions column */}
                      <View style={s.colSection}>
                        {Array.from({ length: maxRows }).map((_, i) => {
                          const d = deductions[i];
                          return d ? (
                            <View key={i} style={s.dataRow}>
                              <Text style={s.dataDesc}>{normalizeLabel(d.name)}</Text>
                              <Text style={s.dataAmt}>{fmt(d.deduction)}</Text>
                            </View>
                          ) : <View key={i} style={[s.dataRow, { height: 14 }]} />;
                        })}
                      </View>
                      {/* Employer column */}
                      <View style={{ flex: 1 }}>
                        {Array.from({ length: maxRows }).map((_, i) => {
                          const r = employers[i];
                          return r ? (
                            <View key={i} style={s.dataRow}>
                              <Text style={s.dataDesc}>{normalizeLabel(r.name)}</Text>
                              <Text style={s.dataAmtGrey}>{fmt(r.employer)}</Text>
                            </View>
                          ) : <View key={i} style={[s.dataRow, { height: 14 }]} />;
                        })}
                      </View>
                    </View>
                    {/* Net Pay line */}
                    <View style={s.netPay}>
                      <Text style={s.netLabel}>NET PAY</Text>
                      <Text style={s.netValue}>{ccy} {fmt(netPay)}</Text>
                    </View>
                    <View style={s.divider} />
                  </View>
                );
              })}

              {/* Group subtotal — accumulate into grand totals */}
              {(() => {
                grandEarnings   += groupEarnings;
                grandDeductions += groupDeductions;
                grandEmployer   += groupEmployer;
                grandNet        += groupNet;
                return (
                  <View style={s.subtotal} wrap={false}>
                    <Text style={s.subtotLabel}>SUBTOTAL — {(group.name || 'General').toUpperCase()}</Text>
                    <Text style={s.subtotAmt}>{fmt(groupEarnings)}</Text>
                    <Text style={s.subtotAmt}>{fmt(groupDeductions)}</Text>
                    <Text style={s.subtotAmt}>{fmt(groupEmployer)}</Text>
                  </View>
                );
              })()}
            </View>
          );
        })}

        {/* Grand Totals */}
        <View style={s.grandTotal} wrap={false}>
          <Text style={s.gtLabel}>GRAND TOTALS</Text>
          <Text style={s.gtAmt}>USD {fmt(grandEarnings)}</Text>
          <Text style={s.gtAmt}>USD {fmt(grandDeductions)}</Text>
          <Text style={s.gtAmt}>USD {fmt(grandEmployer)}</Text>
        </View>

        {/* Footer */}
        <View style={s.footer} fixed>
          <View style={s.footerLogo}>
            <Text style={{ color: DARK_NAVY, fontSize: 8, fontFamily: 'Helvetica-Bold' }}>B</Text>
          </View>
          <Text style={s.footerBrand}>Bantu Modern HR &amp; Payroll Automation</Text>
          <Text style={s.footerConf}>CONFIDENTIAL DOCUMENT</Text>
        </View>

      </Page>
    </Document>
  );
};

export async function generatePayslipSummaryBuffer(data) {
  return renderToBuffer(<SummaryDocument data={data} />);
}

export async function generatePayslipSummaryPDF(data, res) {
  const buf = await generatePayslipSummaryBuffer(data);
  res.end(buf);
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd backend && npx vitest run tests/summaryDocument.test.js
```

- [ ] **Step 5: Commit**

```bash
git add backend/utils/summaryDocument.jsx backend/tests/summaryDocument.test.js
git commit -m "feat(summary): React-PDF payroll summary component with smoke tests"
```

---

## Task 4: Wire new components into `pdfService.js`

**Files:**
- Modify: `backend/utils/pdfService.js`

The goal: replace the `generatePayslipBuffer`, `generatePayslipPDF`, `generatePayslipSummaryPDF`, `generatePayslipSummaryBuffer` implementations with calls to the new React-PDF modules. Delete `_drawPayslip`, `_drawPayslipSummary`, and `drawBantuFooter` (PDFKit-only helpers) **only after** confirming the new functions are wired up.

- [ ] **Step 1: Replace payslip exports at top of `pdfService.js`**

Add at the top of the file (after existing `require` statements):

```js
const {
  generatePayslipBuffer: _reactPayslipBuffer,
  generatePayslipPDF: _reactPayslipPDF,
} = require('./payslipDocument.jsx');

const {
  generatePayslipSummaryBuffer: _reactSummaryBuffer,
  generatePayslipSummaryPDF: _reactSummaryPDF,
} = require('./summaryDocument.jsx');
```

Then update the four exported functions to delegate:

```js
// Replace the existing generatePayslipBuffer function body:
function generatePayslipBuffer(data) {
  return _reactPayslipBuffer(data);
}

// Replace the existing generatePayslipPDF function body:
const generatePayslipPDF = (data, stream) => _reactPayslipPDF(data, stream);

// Replace the existing generatePayslipSummaryBuffer function body:
const generatePayslipSummaryBuffer = (data) => _reactSummaryBuffer(data);

// Replace the existing generatePayslipSummaryPDF function body:
const generatePayslipSummaryPDF = (data, res) => _reactSummaryPDF(data, res);
```

- [ ] **Step 2: Verify Node loads without error**

```bash
node -e "require('./backend/utils/pdfService.js'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Delete the PDFKit-only dead code from `pdfService.js`**

Remove these functions (they are no longer called by anything):
- `_drawPayslip` (lines ~71–311)
- `drawBantuFooter` (lines ~43–69)  ← only used by `_drawPayslip` and `_drawPayslipSummary`
- `_drawPayslipSummary` (lines ~870–1098)

> **Caution:** `drawPlatformLogo` may still be used by statutory report functions — verify with grep before deleting.

```bash
grep -n "drawPlatformLogo\|drawBantuFooter" /Users/beyondbechani/Documents/Projects/Bantu/backend/utils/pdfService.js
```

Only delete functions confirmed to have zero remaining callers.

- [ ] **Step 4: Run all tests**

```bash
cd backend && npx vitest run
```

Expected: all existing tests pass, no regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/pdfService.js
git commit -m "refactor(pdf): wire React-PDF payslip/summary into pdfService, remove PDFKit renderers"
```

---

## Task 5: Remove PDFKit types + update `package.json`

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Remove `@types/pdfkit` if PDFKit is still needed for statutory reports**

```bash
grep -rn "new PDFDocument\|PDFDocument" backend/utils/pdfService.js | grep -v "^Binary"
```

If PDFDocument is still used (P16, P4A, P2, IT7, Master Roll), **keep** `pdfkit` and `@types/pdfkit`. Only remove if zero usages remain.

- [ ] **Step 2: Commit final dependency state**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: finalise dependencies after React-PDF migration"
```

---

## Task 6: Manual visual QA checklist

Before merging, generate a real PDF for each document type and visually verify:

**Individual Payslip:**
- [ ] Header navy bar with logo placeholder, company name, period, issued date
- [ ] Annual Leave Balance box visible in top-right of header (not invisible)
- [ ] Employee details card shows all 7 fields
- [ ] Bank bar shows Bank Name and Account Number
- [ ] Earnings table left, Deductions table right — no overlap
- [ ] Each row has Description | Amount (USD) | YTD (USD) — three distinct columns
- [ ] Employer Contributions section below tables
- [ ] Three-box summary ribbon: Total Earnings (navy) | Total Deductions (grey) | Net Salary (green)
- [ ] Footer anchored at page bottom, never on a second page
- [ ] No blank Page 2 generated

**Payroll Summary:**
- [ ] Header with company, period, timestamp and PAYROLL SUMMARY title
- [ ] Department labels above employee blocks
- [ ] Each employee block: name + 3-column grid (Earnings | Deductions | Employer) + NET PAY line
- [ ] Group subtotals show Earnings / Deductions / Employer (not Net Pay in employer column)
- [ ] Grand Totals navy bar at bottom
- [ ] Footer on every page, never orphaned

---

## Rollback Plan

If React-PDF causes issues in production, the rollback is:

1. Revert the `pdfService.js` wiring commit (`git revert <sha>`)
2. The original PDFKit code in the commits before `e8474f8` is still in git history

---

## Notes

- React-PDF's `fixed` prop on `<View>` renders that view on every page (like a header/footer template) — use for the column header band in the summary and the footer in both documents.
- React-PDF uses `wrap={false}` on a `<View>` to prevent page-breaks inside it (equivalent to PDFKit's `blockH` pre-estimation pattern).
- The `rgba()` bug that plagued PDFKit does not exist in React-PDF — CSS color strings including rgba are parsed correctly by the React-PDF layout engine.
- The Bantu SVG logo cannot be embedded as a path in React-PDF without converting it to a React-PDF `<Svg>/<Path>` component. For now, use a coloured square with "B" as a placeholder. Logo upgrade can be a follow-up task.
