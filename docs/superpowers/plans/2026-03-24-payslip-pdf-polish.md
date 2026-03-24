# Payslip PDF Polish & Summary Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix a runtime crash on payslip PDF generation, add overflow/pagination safety to the individual payslip, and rebrand the Payslip Summary PDF to match the individual payslip's navy/green identity.

**Architecture:** All changes are in two backend files — `payslipFormatter.js` (one-line crash fix) and `pdfService.js` (overflow logic in `_drawPayslip` + full header/footer/column rebrand in `_drawPayslipSummary`). No schema, route, or frontend changes.

**Tech Stack:** Node.js, PDFKit (`pdfkit` npm package), Prisma (read-only context)

---

## Files

| File | Action | What changes |
|------|--------|--------------|
| `backend/utils/payslipFormatter.js` | Modify line 135 | `yearStart` → `ytdStart` |
| `backend/utils/pdfService.js` | Modify `_drawPayslip` | Overflow/pagination guard |
| `backend/utils/pdfService.js` | Modify `_drawPayslipSummary` | Full header/footer rebrand + alignment fixes |

---

## Task 1: Fix `yearStart` crash in `payslipFormatter.js`

**Files:**
- Modify: `backend/utils/payslipFormatter.js:135`

- [ ] **Step 1: Locate the bug**

Open `backend/utils/payslipFormatter.js`. On line 135 find:
```js
where: { employeeId: payslip.employeeId, leaveType: 'ANNUAL', year: yearStart.getFullYear() },
```
`yearStart` is used but never declared in this file. `ytdStart` is the correct variable (declared on line 102).

- [ ] **Step 2: Apply the fix**

Change line 135 from:
```js
where: { employeeId: payslip.employeeId, leaveType: 'ANNUAL', year: yearStart.getFullYear() },
```
to:
```js
where: { employeeId: payslip.employeeId, leaveType: 'ANNUAL', year: ytdStart.getFullYear() },
```

- [ ] **Step 3: Verify no other references to `yearStart` remain**

Run:
```bash
grep -n "yearStart" backend/utils/payslipFormatter.js
```
Expected: no output (zero matches).

- [ ] **Step 4: Commit**

```bash
git add backend/utils/payslipFormatter.js
git commit -m "fix(payslip): replace undefined yearStart with ytdStart in leave balance query"
```

---

## Task 2: Add overflow/pagination to `_drawPayslip`

**Files:**
- Modify: `backend/utils/pdfService.js` — function `_drawPayslip` (lines ~38–190)

**Context:** The function draws line items starting at `currY` after the table header. Each row is 22px. With 15+ rows, rows overflow into the summary bar. There is no `doc.addPage()` call anywhere in `_drawPayslip`.

- [ ] **Step 1: Add the page-safe constant and `drawTableHeader` helper**

Immediately after the `cols` array definition (around line 103), add:

```js
const PAGE_SAFE_BOTTOM = 750;

const drawTableHeader = (startY) => {
  doc.rect(LEFT, startY, CONTENT_W, TABLE_HDR_H).fill(DARK_NAVY);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
  cols.forEach(c => {
    doc.text(c.label.toUpperCase(), c.x, startY + 10, { width: c.w, align: c.align });
  });
  return startY + TABLE_HDR_H;
};
```

- [ ] **Step 2: Replace the inline table header draw with the helper**

Find the block that draws the header (currently around line 100–115):
```js
doc.rect(LEFT, TABLE_TOP, CONTENT_W, TABLE_HDR_H).fill(DARK_NAVY);
doc.fillColor('white').font('Helvetica-Bold').fontSize(9);

const cols = [ ... ];

cols.forEach(c => {
  doc.text(c.label.toUpperCase(), c.x, TABLE_TOP + 10, { width: c.w, align: c.align });
});

currY += TABLE_HDR_H;
```

After adding the helper in Step 1, replace the `cols.forEach` header-draw and `currY += TABLE_HDR_H` lines with:
```js
currY = drawTableHeader(TABLE_TOP);
```

- [ ] **Step 3: Add page-break guard to the line items loop**

Find the `lineItems.forEach` loop (around line 118). Replace:
```js
lineItems.forEach((item, i) => {
  const rowY = currY + (i * 22);
  if (i % 2 === 0) {
    doc.rect(LEFT, rowY, CONTENT_W, 22).fill('#fafafa');
  }
  // ... text drawing ...
});
```

with:
```js
let rowIndex = 0;
lineItems.forEach((item) => {
  if (currY + 22 > PAGE_SAFE_BOTTOM) {
    doc.addPage({ size: 'A4', margin: 0 });
    currY = drawTableHeader(40);
    rowIndex = 0;
  }
  const rowY = currY;
  if (rowIndex % 2 === 0) {
    doc.rect(LEFT, rowY, CONTENT_W, 22).fill('#fafafa');
  }
  rowIndex++;

  doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(9);
  doc.text(item.name, cols[0].x, rowY + 7);

  doc.font('Helvetica-Bold');
  if (item.allowance > 0) {
    doc.fillColor('#059669').text(fmt(item.allowance), cols[1].x, rowY + 7, { width: cols[1].w, align: 'right' });
  }
  if (item.deduction > 0) {
    doc.fillColor('#e11d48').text(fmt(item.deduction), cols[2].x, rowY + 7, { width: cols[2].w, align: 'right' });
  }

  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8.5);
  if (item.employer > 0) {
    doc.text(fmt(item.employer), cols[3].x, rowY + 7, { width: cols[3].w, align: 'right' });
  }
  if (item.ytd) {
    doc.text(fmt(item.ytd), cols[4].x, rowY + 7, { width: cols[4].w, align: 'right' });
  }

  currY += 22;
});
```

Note: using `currY` as a running pointer instead of `currY + (i * 22)` — this is required for correct positioning after a page break.

- [ ] **Step 4: Fix leave section and footer anchor**

Find the summary totals section and everything after. Change:
```js
currY += 90;  // leave section
```
to:
```js
currY += 100;
```

Change the footer:
```js
const footerY = 810;
```
to:
```js
const footerY = Math.min(currY + 60, 820);
```

- [ ] **Step 5: Verify the function still has correct structure**

Skim `_drawPayslip` top to bottom and confirm this order:
1. Header bar
2. Employee info card
3. Bank details card
4. Table header (via `drawTableHeader`)
5. Line items loop (with page-break guard)
6. Summary totals bar
7. Leave balances card
8. Footer

- [ ] **Step 6: Commit**

```bash
git add backend/utils/pdfService.js
git commit -m "fix(pdf): add pagination guard and footer boundary fix to payslip PDF"
```

---

## Task 3: Rebrand `_drawPayslipSummary` header

**Files:**
- Modify: `backend/utils/pdfService.js` — function `_drawPayslipSummary`, `drawHeader` inner function (lines ~756–780)

**Context:** Current header is: `doc.font('Helvetica-Bold').fontSize(14).fillColor(RED).text('PAYSLIP SUMMARY', 0, 40, { align: 'center' })`. Replace with the same dark navy bar used by the individual payslip.

- [ ] **Step 1: Add shared color constants at the top of `_drawPayslipSummary`**

At the top of `_drawPayslipSummary`, alongside the existing `BLUE`, `GREY`, `RED`, `GREEN` constants, add:
```js
const DARK_NAVY = '#1a2e4a';
const BANTU_GREEN = '#B2DB64';
const BORDER_COLOR = '#e2e8f0';
const PAGE_WIDTH = 595.28;
```

(Note: `LEFT = 30`, `RIGHT = 565`, `WIDTH = RIGHT - LEFT` are already defined in the function.)

- [ ] **Step 2: Replace the `drawHeader` inner function**

Find and replace the entire `drawHeader` function (lines ~756–780) with:

```js
const drawHeader = () => {
  // Navy header bar
  doc.rect(0, 0, PAGE_WIDTH, 110).fill(DARK_NAVY);

  // Bantu logo
  drawPlatformLogo(doc, LEFT, 30, 45);

  // "PAYSLIP SUMMARY" label — top right
  doc.fillColor('white').font('Helvetica-Bold').fontSize(24)
    .text('PAYSLIP SUMMARY', RIGHT - 200, 35, { width: 200, align: 'right' });

  // Company name in Bantu green
  doc.fillColor(BANTU_GREEN).font('Helvetica-Bold').fontSize(16)
    .text((companyName || '').toUpperCase(), LEFT + 60, 40);

  // Period, date, time in white
  doc.fillColor('white').font('Helvetica').fontSize(9)
    .text(`Period: ${period}`, LEFT + 60, 60)
    .text(`Date: ${date}   Time: ${time}`, LEFT + 60, 74);

  // Column header band
  const hdrY = 125;
  doc.rect(LEFT, hdrY, WIDTH, 20).fill(DARK_NAVY);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(8.5);
  doc.text('EARNINGS',           LEFT + 5,       hdrY + 5);
  doc.text('AMOUNT',             LEFT + 120,     hdrY + 5, { width: 50, align: 'right' });
  doc.text('DEDUCTIONS',         LEFT + 180,     hdrY + 5);
  doc.text('AMOUNT',             LEFT + 310,     hdrY + 5, { width: 50, align: 'right' });
  doc.text('EMPLOYER CONTRIB.',  RIGHT - 90,     hdrY + 5, { width: 90, align: 'right' });

  // Thin border below column header
  doc.lineWidth(0.5).strokeColor(BORDER_COLOR)
    .moveTo(LEFT, hdrY + 20).lineTo(RIGHT, hdrY + 20).stroke();

  return hdrY + 28; // starting y for content
};
```

- [ ] **Step 3: Verify `drawHeader` return value is used correctly**

Confirm that `let y = drawHeader();` appears after the function definition and that `y` is used as the running vertical position throughout `_drawPayslipSummary`. It already is — no change needed here, just verify.

- [ ] **Step 4: Handle continuation pages**

Find where `doc.addPage()` is called inside `_drawPayslipSummary` (around lines 790 and 801 and 818 and 870 and 885). After each `doc.addPage()`, the `drawHeader()` call redraws the header. Confirm the return value `y = drawHeader()` is used (not a hardcoded `y = 40` or similar). If any `doc.addPage()` is followed by a hardcoded y-reset, change it to use `drawHeader()`.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/pdfService.js
git commit -m "feat(pdf): rebrand payslip summary header to match payslip navy/green identity"
```

---

## Task 4: Fix grand totals alignment and add currency + footer

**Files:**
- Modify: `backend/utils/pdfService.js` — `_drawPayslipSummary` grand totals block and per-employee net pay positioning

**Context:** Grand totals bar uses `LEFT + 100` for earnings but detail rows use `LEFT + 120`. Net pay label drifts. No currency prefix. No footer on any page.

- [ ] **Step 1: Fix grand totals column alignment**

Find the grand totals block (around line 886–891):
```js
doc.text(fmt(grandTotalEarnings), LEFT + 100, y, { width: 70, align: 'right' });
doc.text(fmt(grandTotalDeductions), LEFT + 320, y, { width: 70, align: 'right' });
doc.text(fmt(grandTotalNetPay), RIGHT - 90, y, { width: 90, align: 'right' });
```

Replace with positions that match the detail rows (`LEFT + 120`, `LEFT + 310`, `RIGHT - 40`):
```js
const gtCcy = (groups[0]?.payslips[0]?.currency) || 'USD';
doc.text(`${gtCcy} ${fmt(grandTotalEarnings)}`,    LEFT + 65,  y, { width: 105, align: 'right' });
doc.text(`${gtCcy} ${fmt(grandTotalDeductions)}`,  LEFT + 255, y, { width: 105, align: 'right' });
doc.text(`${gtCcy} ${fmt(grandTotalNetPay)}`,      RIGHT - 100, y, { width: 100, align: 'right' });
```

Also update the grand totals label position to be consistent:
```js
doc.text('GRAND TOTALS', LEFT + 5, y);
```
(Already correct — verify it hasn't drifted.)

- [ ] **Step 2: Pin net pay label and value to right anchor**

Find the per-employee net pay row (around line 857–858):
```js
doc.fillColor(GREEN).text('NET PAY:', LEFT + 380, y + 12, { width: 60, align: 'right' });
doc.text(`${p.currency || 'USD'} ${fmt(netPay)}`, RIGHT - 100, y + 12, { width: 100, align: 'right' });
```

These positions are already reasonable. Use these definitive right-anchored positions (replace whatever is there):
```js
doc.fillColor(GREEN).text('NET PAY:', RIGHT - 175, y + 12, { width: 75, align: 'right' });
doc.fillColor(BLUE).text(`${p.currency || 'USD'} ${fmt(netPay)}`, RIGHT - 95, y + 12, { width: 95, align: 'right' });
```

- [ ] **Step 3: Add a `drawFooter` helper and call it on every page**

Define this helper inside `_drawPayslipSummary`, alongside `drawHeader`:
```js
const drawFooter = (pageBottom = 800) => {
  doc.lineWidth(0.5).strokeColor(BORDER_COLOR)
    .moveTo(LEFT, pageBottom).lineTo(RIGHT, pageBottom).stroke();
  doc.fillColor(GREY).font('Helvetica').fontSize(8)
    .text('Bantu - Modern HR & Payroll Automation', LEFT, pageBottom + 8);
  doc.text('CONFIDENTIAL DOCUMENT', RIGHT - 150, pageBottom + 8, { width: 150, align: 'right' });
};
```

Call `drawFooter()` at two points:
1. Before every `doc.addPage()` call: add `drawFooter();` immediately before each `doc.addPage()` line
2. At the very end of `_drawPayslipSummary`, after the grand totals block: add `drawFooter();`

- [ ] **Step 4: Commit**

```bash
git add backend/utils/pdfService.js
git commit -m "fix(pdf): align grand totals columns, add currency prefix, add footer to payslip summary"
```

---

## Task 5: Manual smoke test

There are no automated tests for PDF generation in this codebase (PDFKit output is a binary stream). Verify visually.

- [ ] **Step 1: Start the backend**

```bash
cd backend && node index.js
```
or however the backend is normally started (check `package.json` scripts).

- [ ] **Step 2: Generate a payslip PDF**

Hit `GET /api/payroll/:runId/payslips/:id/pdf` for a real payslip ID. Open the downloaded PDF and verify:
- No runtime crash (previously crashed due to `yearStart`)
- Employee info, bank details, line items table render cleanly
- If the payslip has many line items, confirm no rows overflow into the totals bar
- Leave balance section and footer are within the page boundary

- [ ] **Step 3: Generate the payslip summary PDF**

Hit `GET /api/payroll/:runId/payslip-summary`. Open the PDF and verify:
- Dark navy header bar with Bantu logo at top left
- `"PAYSLIP SUMMARY"` in white at top right
- Company name in green below the logo
- Column header band is dark navy with white labels
- Grand totals row has currency prefix and columns align with detail rows above
- Footer (`Bantu - ...` / `CONFIDENTIAL DOCUMENT`) appears on every page

- [ ] **Step 4: Final commit if any last-minute tweaks were made**

```bash
git add backend/utils/pdfService.js backend/utils/payslipFormatter.js
git commit -m "fix(pdf): final smoke test adjustments"
```
