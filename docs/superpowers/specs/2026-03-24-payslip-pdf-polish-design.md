# Design: Payslip PDF Polish & Payslip Summary Rebrand

**Date:** 2026-03-24
**Scope:** `backend/utils/pdfService.js`, `backend/utils/payslipFormatter.js`
**Approach:** Option B — Bug fixes + overflow safety on payslip + full brand alignment on summary

---

## Files in scope

| File | Changes |
|------|---------|
| `backend/utils/payslipFormatter.js` | Fix `yearStart` → `ytdStart` crash |
| `backend/utils/pdfService.js` | Payslip overflow/pagination + Payslip Summary rebrand |

---

## Section 1: Bug Fixes & Payslip PDF Overflow

### 1a. `yearStart` crash fix
**File:** `payslipFormatter.js` line 135
`yearStart` is referenced in the `leaveBalance` query but is never declared. Replace with `ytdStart` (computed on line 102). This is a runtime crash on every payslip PDF generation.

### 1b. Payslip PDF pagination
**File:** `pdfService.js` — `_drawPayslip()`

Current behavior: all line items rendered at 22px row height with no page-break guard. 15+ rows overflow into the summary bar.

Fix:
- Define `PAGE_SAFE_BOTTOM = 750`
- Before drawing each line item row, check `if (rowY > PAGE_SAFE_BOTTOM)`: call `doc.addPage()`, redraw the column header bar, reset `currY = TABLE_HDR_H`, recalculate `rowY`
- Summary totals bar, leave section, and footer always render on the final page after all rows are complete

### 1c. Leave section / footer boundary
- Leave section: render at `currY += 100` after the summary bar (currently `+= 90`, insufficient spacing)
- Footer: change from hardcoded `footerY = 810` to `footerY = Math.min(currY + 60, 820)` to prevent overflow past A4's 841.89pt height

---

## Section 2: Payslip Summary PDF Rebrand

### Header bar
Replace the current plain red centered title with a full-width dark navy bar matching the individual payslip:

```
rect(0, 0, PAGE_WIDTH, 110).fill(DARK_NAVY)
```

Contents:
- **Left:** `drawPlatformLogo(doc, LEFT, 30, 45)` — same Bantu SVG logo, 45px
- **Top-right:** `"PAYSLIP SUMMARY"` in white Helvetica-Bold 24px (mirrors `"PAYSLIP"` label)
- **Below logo:** Company name in `#B2DB64` (Bantu green), Helvetica-Bold 16px
- **Below company:** Period, date, time in white Helvetica 10px

### Column header bar
Replace `#f8fafc` light grey band with `DARK_NAVY` background. Labels in white bold uppercase:
`EARNINGS | AMOUNT | DEDUCTIONS | AMOUNT | EMPLOYER CONTRIB.`

Consistent with the payslip's table header style.

### Grand totals row
- Background: `DARK_NAVY`
- White text, Helvetica-Bold
- Add currency prefix to all values: `USD 12,345.00`
- Column x-positions pinned to match the detail rows above (currently offset)

### Per-employee net pay alignment
Pin the `NET PAY:` label and value to a consistent right-anchored position using `RIGHT - 160` for label and `RIGHT` for value, preventing drift across employees with varying line item counts.

### Footer (all pages)
Add same footer as individual payslip:
- Thin border line at `footerY`
- Left: `Bantu - Modern HR & Payroll Automation`
- Right: `CONFIDENTIAL DOCUMENT`
- Draw on every page via a helper called after `doc.addPage()` and at document end

---

## Out of scope
- ZIMRA P16, P2, NSSA P4A generators — no changes
- Master Roll (`generatePayrollSummaryPDF`) — no changes
- Frontend UI — no changes
- Database schema — no changes
