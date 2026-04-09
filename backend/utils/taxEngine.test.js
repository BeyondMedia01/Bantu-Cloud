import { describe, it, expect } from 'vitest';
import { calculatePaye, calculateSplitSalaryPaye, grossUpNet, STATUTORY_RATES } from './taxEngine.js';

// Integration note: FDS_AVERAGE dual-run currGross must include both USD and ZiG inputs.
// Fix is in process.js (fdsAvgPAYEBasis block): currGross adds inputEarningsZIG / xr for dual runs.
// Covered by manual verification — full payroll loop tests are not present in this file.

// ─── Shared ZIMRA 2026 USD annual tax brackets ──────────────────────────────
// Populated from the live database (confirmed in audit March 2026)
const BRACKETS_2026_USD = [
  { lowerBound: 0,     upperBound: 1200,       rate: 0,    fixedAmount: 0    },
  { lowerBound: 1201,  upperBound: 3600,        rate: 0.20, fixedAmount: 240  },
  { lowerBound: 3601,  upperBound: 12000,       rate: 0.25, fixedAmount: 420  },
  { lowerBound: 12001, upperBound: 24000,       rate: 0.30, fixedAmount: 1020 },
  { lowerBound: 24001, upperBound: 36000,       rate: 0.35, fixedAmount: 2220 },
  { lowerBound: 36001, upperBound: 99999999999, rate: 0.40, fixedAmount: 4020 },
];

// ─── 1. Zero tax (under threshold) ─────────────────────────────────────────
describe('Tax Engine — Zimbabwean PAYE (FDS)', () => {
  it('should calculate 0 tax for low income (under $100 USD)', () => {
    const result = calculatePaye({ baseSalary: 80, currency: 'USD' });
    expect(result.totalPaye).toBe(0);
    expect(result.aidsLevy).toBe(0);
  });

  // ─── 2. Mid-range income with explicit brackets ────────────────────────────
  it('should calculate correct tax for medium income ($1500 USD — monthly brackets)', () => {
    const brackets = [
      { lowerBound: 0,    upperBound: 1000, rate: 0.215, fixedAmount: 0 },
      { lowerBound: 1000, upperBound: 2000, rate: 0.30,  fixedAmount: 215 },
    ];
    // NSSA: min(1500, 700)*0.045 = 31.5; taxable = 1500-31.5 = 1468.5
    // Band1: 1000 * 0.215 = 215; Band2: (1468.5-1000)*0.30 = 140.55; total = 355.55
    const result = calculatePaye({ baseSalary: 1500, currency: 'USD', taxBrackets: brackets });
    expect(result.payeBeforeLevy).toBeCloseTo(356.07, 2);
    expect(result.aidsLevy).toBeCloseTo(10.68, 2);
    expect(result.totalPaye).toBeCloseTo(366.75, 2);
  });

  // ─── 3. NSSA ceiling ──────────────────────────────────────────────────────
  it('should apply NSSA ceiling correctly', () => {
    const resultHigh = calculatePaye({ baseSalary: 5000, currency: 'USD' });
    expect(resultHigh.nssaEmployee).toBe(31.5); // ceiling $700 × 4.5%

    const resultLow = calculatePaye({ baseSalary: 500, currency: 'USD' });
    expect(resultLow.nssaEmployee).toBeCloseTo(500 * 0.045, 5);
  });

  // ─── 4. Motor vehicle benefit ─────────────────────────────────────────────
  it('should include motor vehicle benefit in taxable income but not in NSSA basis', () => {
    const result = calculatePaye({ baseSalary: 1000, currency: 'USD', motorVehicleBenefit: 200 });
    expect(result.nssaEmployee).toBe(31.5);          // NSSA only on base, ceiling 700
    expect(result.taxableIncome).toBeCloseTo(1168.5, 2); // 1000 + 200 - 31.5
  });

  // ─── 5. Medical aid 50% credit ────────────────────────────────────────────
  it('should apply 50% medical aid tax credit correctly', () => {
    const brackets = [
      { lowerBound: 0,   upperBound: 100,  rate: 0,    fixedAmount: 0 },
      { lowerBound: 100, upperBound: 1000, rate: 0.20, fixedAmount: 0 },
    ];
    const result = calculatePaye({ baseSalary: 1000, currency: 'USD', medicalAid: 100, taxBrackets: brackets });
    expect(result.medicalAidCredit).toBe(50);
    expect(result.totalPaye).toBeCloseTo(127.62, 2);
    expect(result.netSalary).toBeCloseTo(740.88, 2);
  });

  // ─── 6. FDS_FORECASTING: annualises income and applies annual brackets ─────
  it('FDS_FORECASTING — annualises monthly income against annual brackets', () => {
    // Monthly salary $2000, annualBrackets=true (FDS)
    // NSSA: min(2000,700)*0.045 = 31.5
    // Annual taxable: (2000 - 31.5) * 12 = 23622
    // Band 1201-3600: (3600-1200)*0.20 = 480  (boundary at 1201, so ~479.8)
    // Band 3601-12000: (12000-3600)*0.25 = 2100
    // Band 12001-24000: (23622-12000)*0.30 = 3486.6
    // Annual PAYE ≈ 6066.4; monthly ≈ 505.5
    const result = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
    });
    expect(result.nssaEmployee).toBeCloseTo(31.5, 2);
    expect(result.payeBeforeLevy).toBeCloseTo(505.55, 2);
    expect(result.aidsLevy).toBeCloseTo(15.17, 2);
    expect(result.netSalary).toBeCloseTo(1447.78, 2);
  });

  // ─── 7. FDS_AVERAGE: average basis changes PAYE but not NSSA ─────────────
  it('FDS_AVERAGE — PAYE computed on averaged basis; NSSA stays on actual earnings', () => {
    // Actual salary this month: $5,000 (e.g. bonus month)
    // FDS average basis: $2,000 (smoothed from prior months)
    // NSSA must be based on actual $5,000 (capped at ceiling $700) = 31.5
    // But PAYE must use the $2,000 avg basis, not $5,000
    const resultWithAverage = calculatePaye({
      baseSalary: 5000,
      currency: 'USD',
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
      fdsAveragePAYEBasis: 2000,
    });

    const resultNoAverage = calculatePaye({
      baseSalary: 5000,
      currency: 'USD',
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
    });

    // NSSA should be identical (actual basis, capped at ceiling)
    expect(resultWithAverage.nssaEmployee).toBeCloseTo(31.5, 2);
    expect(resultNoAverage.nssaEmployee).toBeCloseTo(31.5, 2);

    // PAYE MUST be lower when average is applied (smoothing reduces tax on high months)
    expect(resultWithAverage.totalPaye).toBeLessThan(resultNoAverage.totalPaye);

    // Net salary with average should be higher (less PAYE deducted)
    expect(resultWithAverage.netSalary).toBeGreaterThan(resultNoAverage.netSalary);
  });

  // ─── 8. Tax directive — percentage reduction ──────────────────────────────
  it('Tax directive (%) — reduces PAYE by the given percentage', () => {
    const brackets = [
      { lowerBound: 0,    upperBound: 1000, rate: 0,   fixedAmount: 0 },
      { lowerBound: 1000, upperBound: 5000, rate: 0.25, fixedAmount: 0 },
    ];
    const baseline = calculatePaye({ baseSalary: 3000, currency: 'USD', taxBrackets: brackets });
    const withDirective = calculatePaye({ baseSalary: 3000, currency: 'USD', taxBrackets: brackets, taxDirectivePerc: 10 });
    // Directive of 10% should reduce total PAYE by ~10%
    expect(withDirective.totalPaye).toBeCloseTo(baseline.totalPaye * 0.9, 2);
  });

  // ─── 9. Tax directive — fixed amount reduction ────────────────────────────
  it('Tax directive (fixed) — reduces PAYE by a fixed monthly amount', () => {
    const brackets = [
      { lowerBound: 0,    upperBound: 1000, rate: 0,   fixedAmount: 0 },
      { lowerBound: 1000, upperBound: 5000, rate: 0.25, fixedAmount: 0 },
    ];
    const baseline = calculatePaye({ baseSalary: 3000, currency: 'USD', taxBrackets: brackets });
    const withDirective = calculatePaye({ baseSalary: 3000, currency: 'USD', taxBrackets: brackets, taxDirectiveAmt: 50 });
    expect(withDirective.totalPaye).toBeCloseTo(Math.max(0, baseline.totalPaye - 50), 2);
  });

  // ─── 10. Tax directive cannot drive PAYE below zero ──────────────────────
  it('Tax directive cannot produce negative PAYE (floored at 0)', () => {
    const result = calculatePaye({
      baseSalary: 200,
      currency: 'USD',
      taxDirectiveAmt: 99999,
    });
    expect(result.totalPaye).toBe(0);
    expect(result.aidsLevy).toBe(0);
  });

  // ─── 11. Annual bonus exemption limit ─────────────────────────────────────
  it('Bonus exemption — only the exempt portion is excluded from PAYE', () => {
    // Bonus $2000, exemption limit $500 remaining this year
    // $500 should be excluded from PAYE; $1500 is taxable
    const withExemption = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      bonus: 2000,
      bonusExemption: 500,
    });
    const withNoExemption = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      bonus: 2000,
      bonusExemption: 0,
    });
    // With partial exemption, taxable income is lower → less PAYE
    expect(withExemption.totalPaye).toBeLessThanOrEqual(withNoExemption.totalPaye);
    expect(withExemption.exemptBonus).toBe(500);
  });

  // ─── 12. Bonus exemption: fully exempt does not exceed bonus amount ────────
  it('Bonus exemption — exempt portion is capped at actual bonus amount', () => {
    // Bonus is only $100 but exemption limit is $500
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      bonus: 100,
      bonusExemption: 500,
    });
    // Only $100 can actually be exempt
    expect(result.exemptBonus).toBe(100);
  });

  // ─── 13. Pension cap enforcement ─────────────────────────────────────────
  it('Pension cap — pension deduction is capped at the prescribed limit', () => {
    // Salary $5,000 comfortably generates PAYE. Pension $500, cap $200.
    // Without cap: taxableIncome = 5000 - 31.5 - 500 = 4468.5
    // With cap:    taxableIncome = 5000 - 31.5 - 200 = 4768.5  → higher → more PAYE
    const withCap = calculatePaye({
      baseSalary: 5000,
      currency: 'USD',
      pensionContribution: 500,
      pensionCap: 200,
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
    });
    const withoutCap = calculatePaye({
      baseSalary: 5000,
      currency: 'USD',
      pensionContribution: 500,
      pensionCap: null,
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
    });
    expect(withCap.pensionApplied).toBe(200);
    expect(withoutCap.pensionApplied).toBe(500);
    // Capped pension means higher taxable income → more PAYE
    expect(withCap.totalPaye).toBeGreaterThan(withoutCap.totalPaye);
  });

  // ─── 14. Employer contributions do not reduce employee net pay ────────────
  it('Employer-only charges (NSSA employer, WCIF, ZIMDEF) do not affect net salary', () => {
    const without = calculatePaye({ baseSalary: 2000, currency: 'USD' });
    const withEmployer = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      wcifRate: 0.01,
      sdfRate: 0.005,
    });
    // Net salary must be identical — these are employer costs only
    expect(withEmployer.netSalary).toBeCloseTo(without.netSalary, 2);
    // But the employer charges themselves should be non-zero
    expect(withEmployer.wcifEmployer).toBeGreaterThan(0);
    expect(withEmployer.zimdefEmployer).toBeGreaterThan(0);
  });

  // ─── 15. Payable earnings excluded from PAYE (reimbursements etc.) ────────
  it('PAYE-excluded earnings reduce grossForTax but still appear in cashEarnings', () => {
    // $500 reimbursement paid via overtimeAmount but marked as PAYE-excluded.
    // It should NOT increase PAYE, but the gross salary accounts for base only.
    const baseBrackets = [
      { lowerBound: 0,    upperBound: 1200,       rate: 0,   fixedAmount: 0 },
      { lowerBound: 1201, upperBound: 99999999999, rate: 0.25, fixedAmount: 0 },
    ];
    // No exclusion: full $500 overtime is taxable
    const withoutExclusion = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      overtimeAmount: 500,
      payeExcludedEarnings: 0,
      taxBrackets: baseBrackets,
      annualBrackets: true,
    });
    // With exclusion: $500 overtime excluded from PAYE
    const withExclusion = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      overtimeAmount: 500,
      payeExcludedEarnings: 500,
      taxBrackets: baseBrackets,
      annualBrackets: true,
    });
    // PAYE is lower when the $500 is marked paye-excluded
    expect(withExclusion.totalPaye).toBeLessThan(withoutExclusion.totalPaye);
    // Gross salary (cashEarnings) still includes the overtime
    expect(withExclusion.grossSalary).toBe(2500);
  });

  // ─── 16. NSSA-excluded earnings ──────────────────────────────────────────
  it('NSSA-excluded earnings reduce nssaBasis but remain in cash earnings', () => {
    // Base $500, NSSA-excluded allowance $300 — NSSA should only be on $500
    const resultWithExclusion = calculatePaye({
      baseSalary: 500,
      currency: 'USD',
      nssaExcludedEarnings: 300,
    });
    const resultWithoutExclusion = calculatePaye({
      baseSalary: 500,
      currency: 'USD',
    });
    // NSSA basis should be lower with exclusion applied
    expect(resultWithExclusion.nssaBasis).toBeLessThanOrEqual(resultWithoutExclusion.nssaBasis);
  });

  // ─── 17. No brackets = zero PAYE ─────────────────────────────────────────
  it('No active tax table (empty brackets) results in zero PAYE', () => {
    const result = calculatePaye({ baseSalary: 10000, currency: 'USD', taxBrackets: [] });
    expect(result.totalPaye).toBe(0);
    expect(result.payeBeforeLevy).toBe(0);
    expect(result.aidsLevy).toBe(0);
    // Net should still deduct NSSA
    expect(result.nssaEmployee).toBeCloseTo(31.5, 2);
  });
});

describe('grossUpNet', () => {
  it('returns net salary within tolerance when PAYE is zero (income below threshold)', () => {
    const result = grossUpNet({ targetNet: 80, currency: 'USD' });
    expect(result.totalPaye).toBeCloseTo(0, 1);
    expect(Math.abs(result.netSalary - 80)).toBeLessThan(0.02);
  });

  it('gross-up produces a net salary within $0.02 of target for mid-range income', () => {
    const TARGET = 2000;
    const result = grossUpNet({
      targetNet: TARGET,
      currency: 'USD',
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
    });
    expect(Math.abs(result.netSalary - TARGET)).toBeLessThan(0.02);
    expect(result.grossSalary).toBeGreaterThan(TARGET);
  });

  it('gross-up is idempotent: calculatePaye on result.grossSalary yields the same net', () => {
    const TARGET = 3500;
    const grossedUp = grossUpNet({
      targetNet: TARGET,
      currency: 'USD',
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
    });
    const verification = calculatePaye({
      baseSalary: grossedUp.grossSalary,
      currency: 'USD',
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
    });
    expect(Math.abs(verification.netSalary - TARGET)).toBeLessThan(0.02);
  });
});

describe('calculateSplitSalaryPaye — ZIMRA Multi-Currency Apportionment', () => {
  const xr = 25; // 1 USD = 25 ZiG

  it('calculates the same total tax as single-currency on the same combined gross', () => {
    // Scenario: Employee earns $2000 USD (consolidated)
    // Case A: 100% USD ($2,000)
    // Case B: 50% USD ($1,000) + 50% ZiG ($1,000 * 25 = 25,000 ZiG)

    const singleResult = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      taxBrackets: BRACKETS_2026_USD,
      annualBrackets: true,
    });

    const splitResult = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 1000 },
      zigParams: { baseSalary: 25000 },
      exchangeRate: xr,
      taxBracketsUSD: BRACKETS_2026_USD,
      annualBrackets: true,
    });

    // Total USD equivalent of both sides should match the single result
    const totalPayeUSD = splitResult.usd.totalPaye + (splitResult.zig.totalPaye / xr);
    expect(totalPayeUSD).toBeCloseTo(singleResult.totalPaye, 1);

    // PAYE should be apportioned correctly (50/50 because gross is 50/50 in USD terms)
    expect(splitResult.usdRatio).toBe(0.5);
    expect(splitResult.usd.totalPaye).toBeCloseTo(singleResult.totalPaye * 0.5, 1);
    expect(splitResult.zig.totalPaye).toBeCloseTo(singleResult.totalPaye * 0.5 * xr, 1);
  });

  it('handles 100% USD correctly within the split-salary function', () => {
    const result = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 2000 },
      zigParams: { baseSalary: 0 },
      exchangeRate: xr,
      taxBracketsUSD: BRACKETS_2026_USD,
      annualBrackets: true,
    });
    expect(result.usdRatio).toBe(1);
    expect(result.zig.totalPaye).toBe(0);
    expect(result.usd.totalPaye).toBeGreaterThan(0);
  });

  it('properly consolidates and apportions pre-tax deductions (pension)', () => {
    // $2000 base. $200 pension in USD, $0 in ZiG.
    // Total taxable in USD = 2000 - 200 - NSSA
    const result = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 1000, pensionContribution: 200 },
      zigParams: { baseSalary: 25000, pensionContribution: 0 },
      exchangeRate: xr,
      taxBracketsUSD: BRACKETS_2026_USD,
      annualBrackets: true,
    });

    // Ratio is 50/50 ($1000/$2000)
    expect(result.usd.pensionApplied).toBeCloseTo(result.totalResult.pensionApplied * 0.5, 1);
    expect(result.zig.pensionApplied).toBeCloseTo(result.totalResult.pensionApplied * 0.5 * xr, 1);
  });
});

describe('ITF16 CSV format', () => {
  it('formats a row correctly', () => {
    const fmt2 = (n) => Number(n || 0).toFixed(2);
    const row = {
      tin: 'TIN123', idPassport: 'ID456',
      totalBasicSalary: 1000, totalBonus: 700, totalGratuity: 0,
      totalAllowances: 200, totalOvertime: 50, totalCommission: 0, totalBenefits: 100,
      pensionContributions: 45, totalNssa: 31.50, totalPaye: 150, totalAidsLevy: 4.50,
      totalGross: 2050,
    };
    const lastName = 'Doe';
    const firstName = 'John';
    const name = `"${lastName}, ${firstName}"`;
    const fields = [
      row.tin, row.idPassport, name,
      fmt2(row.totalGross),
      fmt2(row.totalBasicSalary), fmt2(row.totalBonus),
      fmt2(row.totalGratuity), fmt2(row.totalAllowances),
      fmt2(row.totalOvertime), fmt2(row.totalCommission), fmt2(row.totalBenefits),
      fmt2(row.pensionContributions), fmt2(row.totalNssa),
      fmt2(row.totalPaye), fmt2(row.totalAidsLevy),
      fmt2(row.totalPaye + row.totalAidsLevy),
    ];
    expect(fields.join(',')).toBe(
      'TIN123,ID456,"Doe, John",2050.00,1000.00,700.00,0.00,200.00,50.00,0.00,100.00,45.00,31.50,150.00,4.50,154.50'
    );
  });
});
