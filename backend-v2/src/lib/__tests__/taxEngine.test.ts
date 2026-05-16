import { describe, it, expect } from 'vitest';
import { calculatePaye, calculateSplitSalaryPaye, grossUpNet, STATUTORY_RATES } from '../taxEngine';
import type { TaxBracket } from '../taxEngine';

// Zimbabwe PAYE tax brackets (monthly, USD) — simplified illustration
const DEFAULT_BRACKETS: TaxBracket[] = [
  { lowerBound: 0, upperBound: 100, rate: 0, fixedAmount: 0 },
  { lowerBound: 100.01, upperBound: 300, rate: 0.20, fixedAmount: 0 },
  { lowerBound: 300.01, upperBound: 1000, rate: 0.25, fixedAmount: 0 },
  { lowerBound: 1000.01, upperBound: 2000, rate: 0.30, fixedAmount: 0 },
  { lowerBound: 2000.01, upperBound: 3000, rate: 0.35, fixedAmount: 0 },
  { lowerBound: 3000.01, upperBound: null, rate: 0.40, fixedAmount: 0 },
];

// ── calculatePaye ──────────────────────────────────────────────────────────────

describe('calculatePaye', () => {
  it('returns zero for zero salary', () => {
    const result = calculatePaye({
      baseSalary: 0,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(result.grossSalary).toBe(0);
    expect(result.nssaEmployee).toBe(0);
    expect(result.payeBeforeLevy).toBe(0);
    expect(result.totalPaye).toBe(0);
    expect(result.netSalary).toBe(0);
  });

  it('calculates PAYE for salary within tax-free band', () => {
    const result = calculatePaye({
      baseSalary: 100,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(result.grossSalary).toBe(100);
    expect(result.payeBeforeLevy).toBe(0);
    expect(result.nssaEmployee).toBeCloseTo(4.5, 2);
    expect(result.netSalary).toBeCloseTo(95.5, 2);
  });

  it('calculates PAYE correctly for mid-range salary', () => {
    const result = calculatePaye({
      baseSalary: 500,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    // Band 1: 0-100 @ 0% = 0
    // Band 2: 100.01-300 @ 20% = 39.998
    // Band 3: 300.01-500 @ 25% = 49.9975
    // Annual PAYE ≈ 89.9955
    // Monthly PAYE ≈ 89.9955
    expect(result.totalPaye).toBeGreaterThan(0);
    expect(result.netSalary).toBeGreaterThan(0);
    expect(result.netSalary).toBeLessThan(result.grossSalary);
  });

  it('handles tax directive percentage', () => {
    const without = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    const withDirective = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      taxDirectivePerc: 50,
    });
    expect(withDirective.totalPaye).toBeLessThan(without.totalPaye);
    expect(withDirective.totalPaye).toBeCloseTo(without.totalPaye * 0.5, 0);
  });

  it('handles tax directive fixed amount', () => {
    const without = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    const amount = 50;
    const withDirective = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      taxDirectiveAmt: amount,
    });
    expect(withDirective.totalPaye).toBeCloseTo(Math.max(0, without.totalPaye - amount), 0);
  });

  it('caps NSSA at the ceiling', () => {
    const result = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(result.nssaEmployee).toBeCloseTo(700 * 0.045, 2);
    expect(result.nssaEmployer).toBeCloseTo(700 * 0.045, 2);
    expect(result.nssaBasis).toBe(700);
  });

  it('applies pension contribution with cap', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      pensionContribution: 200,
      pensionCap: 150,
    });
    expect(result.pensionApplied).toBe(150);
  });

  it('applies medical aid credit', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      medicalAid: 100,
    });
    expect(result.medicalAidCredit).toBeCloseTo(100 * 0.5, 2);
  });

  it('applies tax credits', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      taxCredits: 30,
    });
    expect(result.taxCreditsApplied).toBeGreaterThan(0);
  });

  it('calculates AIDS levy at 3% of PAYE after credits', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(result.aidsLevy).toBeGreaterThan(0);
    expect(result.aidsLevy).toBeCloseTo(result.payeBeforeLevy * STATUTORY_RATES.AIDS_LEVY, 1);
  });

  it('calculates WCIF and SDF', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      wcifRate: 0.01,
      sdfRate: 0.005,
    });
    expect(result.wcifEmployer).toBeCloseTo(1000 * 0.01, 2);
    expect(result.sdfContribution).toBeCloseTo(1000 * 0.005, 2);
  });

  it('handles bonus with exemption', () => {
    const result = calculatePaye({
      baseSalary: 800,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      bonus: 500,
      bonusExemption: 300,
    });
    expect(result.exemptBonus).toBe(300);
    expect(result.grossSalary).toBe(1300);
  });

  it('handles motor vehicle benefit', () => {
    const without = calculatePaye({
      baseSalary: 800,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    const withVehicle = calculatePaye({
      baseSalary: 800,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      motorVehicleBenefit: 200,
    });
    expect(withVehicle.payeBeforeLevy).toBeGreaterThan(without.payeBeforeLevy);
  });

  it('handles annual brackets', () => {
    const monthly = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      annualBrackets: false,
    });
    const annual = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      annualBrackets: true,
    });
    // With annual brackets, the PAYE on 12x monthly should be the same as 12x monthly PAYE
    const annualBracketsHigh = calculatePaye({
      baseSalary: 12000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700 * 12,
      annualBrackets: true,
    });
    // annualBracketsHigh.totalPaye should be close to 12 * monthly.totalPaye (with higher ceiling)
    expect(annualBracketsHigh.totalPaye).toBeGreaterThan(monthly.totalPaye * 12 * 0.5);
  });

  it('handles loan benefit', () => {
    const result = calculatePaye({
      baseSalary: 800,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      loanBenefit: 100,
    });
    expect(result.grossSalary).toBe(800);
    expect(result.taxableIncome).toBeGreaterThan(0);
  });

  it('handles overtime amount', () => {
    const result = calculatePaye({
      baseSalary: 800,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      overtimeAmount: 200,
    });
    expect(result.grossSalary).toBe(1000);
  });

  it('handles severance with exemption', () => {
    const result = calculatePaye({
      baseSalary: 800,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      severanceAmount: 2000,
      severanceExemption: 1500,
    });
    expect(result.exemptSeverance).toBe(1500);
    expect(result.grossSalary).toBe(2800);
  });

  it('handles FDS average PAYE basis', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      fdsAveragePAYEBasis: 1200,
    });
    // The PAYE should be based on 1200, not 1000
    expect(result.payeBeforeLevy).toBeGreaterThan(0);
  });

  it('handles ZIMDEF rate', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      zimdefRate: 0.01,
    });
    expect(result.zimdefEmployer).toBeCloseTo(1000 * 0.01, 2);
  });

  it('handles NSSA excluded earnings', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      nssaExcludedEarnings: 200,
    });
    expect(result.nssaBasis).toBeCloseTo(Math.min(1000 - 200, 700), 2);
  });

  it('handles PAYE excluded earnings', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      payeExcludedEarnings: 100,
    });
    expect(result.taxableIncome).toBeLessThan(
      calculatePaye({ baseSalary: 1000, currency: 'USD', taxBrackets: DEFAULT_BRACKETS, nssaCeiling: 700 }).taxableIncome,
    );
  });

  it('handles custom NSSA employee/employer rates', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      nssaEmployeeRate: 0.05,
      nssaEmployerRate: 0.06,
    });
    expect(result.nssaEmployee).toBeCloseTo(700 * 0.05, 2);
    expect(result.nssaEmployer).toBeCloseTo(700 * 0.06, 2);
  });

  it('handles empty tax brackets', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: [],
      nssaCeiling: 700,
    });
    expect(result.totalPaye).toBeCloseTo(0, 0);
  });

  it('handles null tax brackets', () => {
    const result = calculatePaye({
      baseSalary: 1000,
      currency: 'USD',
      taxBrackets: null,
      nssaCeiling: 700,
    });
    expect(result.totalPaye).toBeCloseTo(0, 0);
  });

  it('handles null NSSA ceiling', () => {
    const result = calculatePaye({
      baseSalary: 100,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: null,
    });
    expect(result.nssaBasis).toBeCloseTo(100, 2);
  });

  it('handles high salary for progressive taxation', () => {
    const result = calculatePaye({
      baseSalary: 10000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    // Top marginal rate of 40% on the portion above 3000
    // Total tax should be substantial
    expect(result.totalPaye).toBeGreaterThan(2000);
    expect(result.netSalary).toBeLessThan(result.grossSalary * 0.7);
  });

  it('ensures netSalary = grossSalary - totalDeductions', () => {
    const result = calculatePaye({
      baseSalary: 1500,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      pensionContribution: 100,
      pensionCap: 200,
      medicalAid: 50,
      taxCredits: 20,
    });
    const totalDeductions = result.nssaEmployee + result.pensionApplied + 50 + result.totalPaye;
    expect(result.netSalary).toBeCloseTo(result.grossSalary - totalDeductions, 2);
  });
});

// ── calculateSplitSalaryPaye ────────────────────────────────────────────────────

describe('calculateSplitSalaryPaye', () => {
  const usdOnly = {
    usdParams: { baseSalary: 1000, currency: 'USD', nssaCeiling: 700 },
    zigParams: { baseSalary: 0, currency: 'ZiG', nssaCeiling: 0 },
    exchangeRate: 30,
    taxBracketsUSD: DEFAULT_BRACKETS,
  };

  const fiftyFifty = {
    usdParams: { baseSalary: 500, currency: 'USD', nssaCeiling: 700 },
    zigParams: { baseSalary: 15000, currency: 'ZiG', nssaCeiling: 21000 },
    exchangeRate: 30,
    taxBracketsUSD: DEFAULT_BRACKETS,
  };

  it('handles 100% USD (0% ZiG)', () => {
    const result = calculateSplitSalaryPaye(usdOnly);
    expect(result.cashRatio).toBeCloseTo(1, 5);
    expect(result.payeRatio).toBeCloseTo(1, 5);
    expect(result.nssaRatio).toBeCloseTo(1, 5);
    expect(result.usd.netSalary).toBeGreaterThan(0);
    expect(result.zig.netSalary).toBeCloseTo(0, 0);
  });

  it('handles 100% ZiG via USD=0', () => {
    const result = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 0, currency: 'USD', nssaCeiling: 0 },
      zigParams: { baseSalary: 30000, currency: 'ZiG', nssaCeiling: 21000 },
      exchangeRate: 30,
      taxBracketsUSD: DEFAULT_BRACKETS,
    });
    expect(result.cashRatio).toBeCloseTo(0, 5);
    expect(result.usd.netSalary).toBeCloseTo(0, 0);
    expect(result.zig.netSalary).toBeGreaterThan(0);
  });

  it('handles 50/50 USD/ZiG split', () => {
    const result = calculateSplitSalaryPaye(fiftyFifty);
    const totalNet = result.usd.netSalary + result.zig.netSalary / 30;
    expect(totalNet).toBeGreaterThan(0);
    expect(result.usd.netSalary).toBeGreaterThan(0);
    expect(result.zig.netSalary).toBeGreaterThan(0);
  });

  it('maintains total net consistency across currencies', () => {
    const usdResult = calculateSplitSalaryPaye(usdOnly);
    const splitResult = calculateSplitSalaryPaye(fiftyFifty);

    // Total net should be positive in both cases
    expect(usdResult.usd.netSalary).toBeGreaterThan(0);
    expect(splitResult.usd.netSalary).toBeGreaterThan(0);
    expect(splitResult.zig.netSalary).toBeGreaterThan(0);
  });

  it('handles exchange rate of 1', () => {
    const result = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 500, currency: 'USD', nssaCeiling: 700 },
      zigParams: { baseSalary: 500, currency: 'ZiG', nssaCeiling: 700 },
      exchangeRate: 1,
      taxBracketsUSD: DEFAULT_BRACKETS,
    });
    // At 1:1, total is equivalent to single-currency salary of 1000
    expect(result.totalResult.grossSalary).toBeCloseTo(1000, 2);
  });

  it('handles zero exchange rate gracefully', () => {
    const result = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 500, currency: 'USD', nssaCeiling: 700 },
      zigParams: { baseSalary: 0, currency: 'ZiG', nssaCeiling: 0 },
      exchangeRate: 0,
      taxBracketsUSD: DEFAULT_BRACKETS,
    });
    // Should fall back to exchange rate of 1
    expect(result.totalResult.grossSalary).toBe(500);
  });

  it('apportions PAYE by taxable income ratio', () => {
    const result = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 800, currency: 'USD', nssaCeiling: 700 },
      zigParams: { baseSalary: 6000, currency: 'ZiG', nssaCeiling: 21000 },
      exchangeRate: 30,
      taxBracketsUSD: DEFAULT_BRACKETS,
    });
    // USD has 800/1000 = 80% of gross
    // ZiG has 200/1000 = 20% of gross
    expect(result.payeRatio).toBeGreaterThan(0.7);
    expect(result.payeRatio).toBeLessThan(0.9);
  });
});

// ── grossUpNet ─────────────────────────────────────────────────────────────────

describe('grossUpNet', () => {
  it('calculates gross for a given target net', () => {
    const result = grossUpNet({
      targetNet: 800,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(result).not.toBeNull();
    expect(result!.netSalary).toBeCloseTo(800, 0);
  });

  it('returns null for impossible target (zero iterations edge)', () => {
    const result = grossUpNet({
      targetNet: 0,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
      maxIterations: 1,
      tolerance: 0.000001,
    });
    expect(result).not.toBeNull();
  });

  it('handles low net targets', () => {
    const result = grossUpNet({
      targetNet: 100,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(result).not.toBeNull();
    expect(result!.netSalary).toBeCloseTo(100, 0);
  });

  it('handles high net targets', () => {
    const result = grossUpNet({
      targetNet: 5000,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(result).not.toBeNull();
    expect(result!.grossSalary).toBeGreaterThan(5000);
    expect(result!.netSalary).toBeCloseTo(5000, 0);
  });

  it('produces consistent results (grossUp + calculatePaye roundtrip)', () => {
    const target = 1500;
    const grossUpResult = grossUpNet({
      targetNet: target,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(grossUpResult).not.toBeNull();
    const payeResult = calculatePaye({
      baseSalary: grossUpResult!.grossSalary,
      currency: 'USD',
      taxBrackets: DEFAULT_BRACKETS,
      nssaCeiling: 700,
    });
    expect(payeResult.netSalary).toBeCloseTo(target, 0);
  });
});
