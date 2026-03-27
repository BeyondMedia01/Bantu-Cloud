# Bantu Payroll System — Audit Report

**Date:** 2026-03-26
**Scope:** Backend calculation correctness, data integrity, statutory compliance, and feature completeness
**Auditor:** Claude Code (automated + manual code review)

---

## Executive Summary

A comprehensive audit of the Bantu payroll backend identified **10 confirmed issues** ranging from critical race conditions to statutory compliance gaps. Two issues pose an immediate risk of data corruption (duplicate payslips). Three issues affect ZIMRA statutory compliance (PAYE, NSSA). Several leave-related bugs were identified and partially resolved during this audit cycle.

**Issue Counts by Severity:**
- CRITICAL: 2 (race conditions — can corrupt payroll data)
- HIGH: 3 (statutory compliance — PAYE, NSSA, severance exemption)
- MEDIUM: 3 (leave balance, loans, YTD calculation edge cases)
- LOW: 2 (display bugs, validation fallback)

---

## Critical Issues

### C1 — Payroll Double-Processing Race Condition

**File:** `backend/routes/payroll/process.js` — lines 191, 1092, 1112, 1145
**Severity:** CRITICAL
**Type:** Race condition / data integrity

**Description:**
The payroll processing endpoint allows re-processing of `COMPLETED` runs. The status check occurs **outside** the Prisma transaction:

1. Thread A reads `run.status = 'APPROVED'` — passes check
2. Thread B reads `run.status = 'APPROVED'` simultaneously — passes check
3. Both enter the transaction, both set status to `PROCESSING`
4. Both delete existing payslips and create new ones
5. Result: duplicate payslips or a transaction rollback with data loss

There is no pessimistic locking (`SELECT FOR UPDATE`) and the Prisma transaction isolation is read-committed, not serializable.

**Impact:** Duplicate payslips for all employees in a run, corrupted payroll figures, audit trail destroyed. Requires manual database cleanup to recover.

**Recommendation:**
Add an atomic status check-and-update at the start of the transaction:
```js
const updated = await tx.payrollRun.updateMany({
  where: { id: run.id, status: { in: ['DRAFT', 'APPROVED', 'ERROR', 'COMPLETED'] } },
  data: { status: 'PROCESSING' },
});
if (updated.count === 0) {
  throw new Error('Payroll run is already being processed');
}
```
This ensures only one thread can advance the status at a time. Also consider adding a unique constraint on `(employeeId, payrollRunId)` on the `Payslip` table as a secondary guard.

---

### C2 — Re-processing Allows Status Bypass Without Locking

**File:** `backend/routes/payroll/process.js` — lines 167–192
**Severity:** CRITICAL
**Type:** Race condition

**Description:**
Same root cause as C1 but specifically the fact that `COMPLETED` is in the allowed list for re-processing. A single concurrent double-click from the UI, or two admin users processing at the same time, is sufficient to trigger this.

**Recommendation:**
Move the status check inside the transaction using an `updateMany` with the expected status as the WHERE condition (as described in C1). Remove `COMPLETED` from the re-processable statuses unless a deliberate "reprocess" flow is implemented with explicit confirmation.

---

## High Severity Issues

### H1 — Elderly Tax Credit Inconsistency in Dual-Currency Runs

**File:** `backend/routes/payroll/process.js` — lines 787–789, 844, 870, 898
**Severity:** HIGH
**Type:** Calculation / statutory compliance

**Description:**
The elderly tax credit (for employees aged 65+) is applied inconsistently across currency paths:

- **USD path (line 844):** `taxCredits: (emp.taxCredits || 0) + elderlyCreditUSD_val` — adds elderly credit **on top of** any existing `emp.taxCredits` from the employee record.
- **ZIG path (line 870):** `taxCredits: elderlyCreditZIG_val` — uses only elderly credit, ignores `emp.taxCredits` entirely.
- **Single-currency (line 898):** `taxCredits: (emp.taxCredits || 0) + elderlyCredit` — same stacking as USD path.

If `emp.taxCredits` is already set as a manual tax credit on the employee record, the elderly credit stacks on top, creating a double credit. Furthermore, USD and ZIG paths behave differently, producing asymmetric PAYE for dual-currency employees.

**ZIMRA position:** Tax credits (elderly credit, blind person credit) are fixed annual amounts set in the Finance Act. They are not additive with manually entered tax credits.

**Impact:** Under-collection of PAYE. ZIMRA P2 reconciliation will show variance. Potential penalties for the employer.

**Recommendation:**
Use the elderly credit as a **replacement** for `emp.taxCredits`, not an addition — unless `emp.taxCredits` is explicitly a different credit type. Add a field `taxCreditType` to disambiguate. Apply the same logic consistently in USD, ZIG, and single-currency paths:
```js
const appliedTaxCredits = isElderly ? elderlyCreditUSD_val : (emp.taxCredits || 0);
```

---

### H2 — NSSA Double-Deduction in Dual-Currency Payrolls

**File:** `backend/routes/payroll/process.js` — lines 825–882
**Severity:** HIGH
**Type:** Calculation / statutory compliance

**Description:**
In dual-currency payroll runs, NSSA is calculated independently for USD earnings and ZIG earnings, each with their own ceiling (USD: 700, ZIG: 20,000). For employees with mixed-currency earnings:

- USD NSSA deducted on USD earnings (capped at $700)
- ZIG NSSA deducted on ZIG earnings (capped at ZIG 20,000)
- **Both deductions applied to net pay**

If the intention is that NSSA applies to total earnings (not split by currency), this approach can over-deduct NSSA. The correct approach per the NSSA Act is to apply the ceiling to the **combined** earnings for the month.

**Impact:** Employees on mixed-currency payrolls are over-deducted on NSSA. The difference could be significant for high-earners whose combined earnings exceed the ceiling on each currency's side separately.

**Recommendation:**
Calculate the employee's **effective total earnings in a single reference currency** (USD), apply the NSSA ceiling once, then split the resulting contribution pro-rata to each currency's net pay. Alternatively, apply NSSA only on the primary currency earnings and zero on the secondary.

---

### H3 — Severance Exemption Defaults to Zero

**File:** `backend/routes/payroll/process.js` — lines 269–271; `backend/utils/systemSettings.js`
**Severity:** HIGH
**Type:** Configuration gap / statutory compliance

**Description:**
The PAYE exemption on severance pay is loaded from system settings:
```js
severanceExemptionUSD = await getSettingAsNumber('SEVERANCE_EXEMPTION_USD', 0);
```

The **default is 0**. If this setting is not explicitly configured in System Settings, severance receives **no PAYE exemption** — all severance pay is fully taxable. Per ZIMRA rules, there is a statutory minimum severance exemption (historically US$10,000 or the ZIG equivalent per Finance Act thresholds).

**Impact:** Employees receiving severance pay are over-taxed if the setting is not configured. Employer is exposed to refund claims and ZIMRA scrutiny.

**Recommendation:**
Change the default to a non-zero value reflecting current ZIMRA statutory rates:
```js
severanceExemptionUSD = await getSettingAsNumber('SEVERANCE_EXEMPTION_USD', 10000);
```
Additionally, display a warning in the UI if this setting is 0 and the system processes any payslip with `transactionCode.type === 'SEVERANCE'`.

---

## Medium Severity Issues

### M1 — Leave Balance Lookup Uses Substring Match

**File:** `backend/utils/payslipFormatter.js` — lines 175, 187
**Severity:** MEDIUM
**Type:** Data integrity / display

**Description:**
Leave balance lookup uses `leaveType: { contains: 'ANNUAL', mode: 'insensitive' }`, which matches any leave type containing "ANNUAL" as a substring. If a company has multiple leave types containing "ANNUAL" (e.g., "ANNUAL_PAID", "ANNUAL_UNPAID"), the query returns the record with the highest balance (`orderBy: { balance: 'desc' }`), which may not be the intended annual leave type.

The on-demand accrual upsert (lines 191–213) uses `policy.leaveType` as the unique key, but the initial lookup may have retrieved a different type, creating a mismatch.

**Impact:** Wrong leave balance displayed on payslip. For companies with multiple annual leave policies, employees may see the wrong balance.

**Recommendation:**
Match on exact leave type. Use the active leave policy's `leaveType` field directly rather than a substring search:
```js
const policy = await prisma.leavePolicy.findFirst({
  where: { companyId, isActive: true, accrualRate: { gt: 0 }, leaveType: { contains: 'ANNUAL', mode: 'insensitive' } },
});
// Then query balance by exact policy.leaveType:
let leaveBal = await prisma.leaveBalance.findFirst({
  where: { employeeId: payslip.employeeId, companyId, year: leaveYear, leaveType: policy.leaveType },
});
```

---

### M2 — Loan Deduction Order Non-Deterministic with Floating-Point Tolerance

**File:** `backend/routes/payroll/process.js` — lines 917–951
**Severity:** MEDIUM
**Type:** Data integrity / edge case

**Description:**
Loan repayments are processed in due-date order. If two repayments share the same due date, the order depends on database retrieval order (non-deterministic). The floating-point tolerance check `rep.amount > availableNet + 0.001` allows repayments to create a negative net (clamped to 0 at line 951).

Additionally, in dual-currency runs, loans are deducted only from USD net pay (line 932), creating an asymmetry for ZIG-primary employees.

**Impact:** Unpredictable repayment order for same-date loans. Employees can occasionally receive zero net pay due to rounding edge cases. ZIG-primary employees' loans may not be correctly deducted.

**Recommendation:**
1. Add a secondary sort key (e.g., `loanId`, `createdAt`) to ensure deterministic ordering.
2. Replace the floating-point tolerance with precise decimal arithmetic.
3. Consider whether loans should be deducted from total net (USD + ZIG) rather than only USD.

---

### M3 — YTD Mid-Year Company Start Edge Case

**File:** `backend/utils/ytdCalculator.js` — lines 69–89; `backend/utils/payslipFormatter.js` — lines 136–154
**Severity:** MEDIUM
**Type:** Calculation / display

**Description:**
`getYtdStartDate()` correctly limits YTD to the company's first payroll run if it started mid-tax-year. However, the historical payslip query (`historicRunIds`) includes all runs `gte: ytdStart`, which could include data from before a mid-year company start if the `companyFirstPayrollDate` is later than tax year start but earlier payroll records exist (e.g., imported data).

Also, `new Date(null)` (from a null `companyFirstPayrollDate`) resolves to 1970-01-01 — less than any modern tax year start — which causes the guard to be silently skipped.

**Impact:** YTD totals may include earnings from periods outside the intended calculation window, inflating cumulative figures. This affects the bonus exemption threshold ($10k/year) and severance calculations.

**Recommendation:**
Add null-check before date comparison:
```js
if (companyFirstPayrollDate && firstRun.getFullYear() > 1970) {
  if (firstRun > taxYearStart) return firstRun;
}
```

---

## Low Severity Issues

### L1 — basicSalaryApplied Can Be Zero Due to Rounding in Dual-Currency

**File:** `backend/routes/payroll/process.js` — lines 980–982; `backend/utils/payslipFormatter.js` — line 163
**Severity:** LOW
**Type:** Display / data integrity

**Description:**
For ZIG-denominated employees in USD-primary dual-currency runs, `basicSalaryApplied` is computed as `round2(baseRate / xr)`. If the employee's ZIG base rate is small relative to the exchange rate (e.g., ZIG 5 at rate 100), the result is `0.05` → rounded to `0.00`.

The payslip formatter then falls back to `payslip.employee.baseRate` (in ZIG), creating a currency mismatch in the PDF display (payslip shows "5.00" but denomination is wrong).

**Impact:** Confusing payslip display. Not a financial calculation bug (PAYE/NSSA used the correct pre-rounded value), but undermines employee trust and audit clarity.

**Recommendation:**
Use a minimum floor (e.g., `Math.max(0.01, round2(...))`) or display the ZIG equivalent directly when `basicSalaryApplied` is near zero.

---

### L2 — Tax Table Validation Guard Has Silent Zero-PAYE Fallback

**File:** `backend/utils/taxEngine.js` — lines 120, 174–175; `backend/routes/payroll/process.js` — lines 239–252
**Severity:** LOW
**Type:** Validation / guard

**Description:**
The endpoint correctly guards against missing tax tables with a 422 error. However, if the `taxBrackets` array is empty inside `taxEngine.js` (e.g., due to a race condition between the guard check and the calculation), the PAYE loop simply produces `0` with no error or warning log.

**Impact:** Extremely unlikely in normal operation. If bypassed, PAYE would be zero (under-deduction). A warning log would make this easier to diagnose.

**Recommendation:**
Add a warning log inside `taxEngine.js` when `taxBrackets.length === 0`:
```js
if (taxBrackets.length === 0) {
  console.warn('[taxEngine] No tax brackets provided — PAYE will be zero');
}
```

---

## Leave System Issues (Identified and Fixed During This Audit)

### LV1 — Ghost Leave Records Blocking Accrual ✅ FIXED

**File:** `backend/jobs/leaveAccrual.js`
**Status:** Fixed (commit in March 2026)

**Description:**
Records with `balance: 0, accrued: 0` and `lastAccrualDate` set to the current month were permanently skipped by the accrual job's date check, creating "ghost" records that would never receive any credit.

**Fix:** Added `neverActuallyAccrued` check to bypass the date guard for records that have zero accrued and zero opening balance.

---

### LV2 — Wrong Tax Year Used for Leave Balance Lookup ✅ FIXED

**File:** `backend/utils/payslipFormatter.js`
**Status:** Fixed (commit in March 2026)

**Description:**
Leave balance was queried using `ytdStart.getFullYear()`, which returns the Zimbabwe tax year start (2025 for Jan-Mar 2026 runs). Leave balances are stored by calendar year (2026), so the query always returned null.

**Fix:** Changed to use `new Date(payslip.payrollRun.startDate).getFullYear()` (calendar year).

---

### LV3 — On-Demand Accrual Skipped Zero-Balance Records ✅ FIXED

**File:** `backend/utils/payslipFormatter.js`
**Status:** Fixed (commit in March 2026)

**Description:**
On-demand accrual in payslip generation only triggered when `leaveBal` was `null`. If a ghost record existed with `balance: 0`, `leaveBal` was not null and the accrual was skipped, leaving the payslip showing `0.0` days.

**Fix:** Changed trigger condition to also fire when `balance === 0 && accrued === 0`.

---

### LV4 — Leave Accrual Not Tied to Payroll Processing ✅ FIXED

**File:** `backend/routes/payroll/process.js`
**Status:** Fixed (commit in March 2026)

**Description:**
Leave accrual was only triggered by a cron job on the 1st of the month. If payroll was processed mid-month, leave wouldn't accrue until the cron ran. Also, a manual "Run Accrual" button was not appropriate per business requirements.

**Fix:** Added post-payroll trigger — after a run reaches `COMPLETED` status, `runLeaveAccrual(companyId)` fires asynchronously for that company.

---

## Recommendations Summary

### Immediate (Before Next Payroll Run)

1. **Fix payroll race condition (C1/C2):** Add atomic status check inside the Prisma transaction using `updateMany` with the expected current status as the WHERE condition. This prevents double-processing.

2. **Set severance exemption default (H3):** Update `getSettingAsNumber('SEVERANCE_EXEMPTION_USD', 0)` default to `10000` (or the current ZIMRA statutory amount). Verify this setting is configured for all live companies.

3. **Audit elderly credit logic (H1):** Review whether `emp.taxCredits` is being used as a manually-entered tax credit or a category label. If it's an additional credit type, create a separate field to avoid stacking with elderly credit.

### Short Term (Within 1–2 Sprints)

4. **Fix NSSA dual-currency calculation (H2):** Determine correct NSSA basis for mixed-currency employees. Consider calculating NSSA on USD-equivalent total earnings with a single ceiling.

5. **Fix leave balance lookup (M1):** Replace `contains: 'ANNUAL'` with exact policy type lookup. Derive leave type from the active policy rather than a substring search.

6. **Fix loan deduction ordering (M2):** Add secondary sort key to ensure deterministic order. Add a test for the two-loans-same-due-date scenario.

### Medium Term (Technical Debt)

7. **YTD mid-year edge case (M3):** Add null guard for `companyFirstPayrollDate`. Add integration test for a company that started mid-tax-year.

8. **basicSalaryApplied floor (L1):** Add minimum floor or store the pre-conversion amount with its original currency code.

9. **taxEngine zero-bracket log (L2):** Add `console.warn` when tax brackets are empty inside the engine.

10. **Add unique constraint on Payslip (employeeId, payrollRunId):** Secondary guard against duplicate payslip creation in the event of concurrent processing attempts.

---

## Testing Gaps

The following scenarios are not covered by existing tests and should be added:

| Scenario | Risk if Untested |
|----------|-----------------|
| Concurrent POST /process requests for same run | Duplicate payslips (C1) |
| Employee with manual `taxCredits` + aged 65+ | Over-credit on PAYE (H1) |
| Dual-currency employee with NSSA > ceiling | Over-deduction (H2) |
| Severance payment with no system setting | Zero exemption (H3) |
| Two active leave policies with "ANNUAL" in name | Wrong balance on payslip (M1) |
| Two loan repayments with same due date | Non-deterministic deduction (M2) |
| Company first payroll mid-tax-year | Inflated YTD (M3) |
| ZIG employee with low base rate / high exchange rate | Zero salary on payslip (L1) |

---

## Appendix — Leave System Fixes Applied

All four leave-related bugs (LV1–LV4) were identified and fixed during this audit cycle:

- Ghost records no longer block accrual
- Calendar year (not tax year) is used for leave balance queries
- On-demand accrual triggers on zero-balance records, not just null records
- Leave accrual fires automatically after each payroll run completes

Employees who had 0.0 days on their payslips should now see the correct balance when the next payslip is generated, or when the March/April payroll is regenerated.
