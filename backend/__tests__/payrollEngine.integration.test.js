/**
 * Payroll Engine — Integration Tests
 *
 * These tests exercise the full calculation pipeline from raw employee
 * transaction inputs through to final payslip numbers, mirroring the
 * aggregation logic in payrollWorker.js without a live database or queue.
 *
 * Why: tax miscalculations in a live payroll are catastrophic.  Unit tests
 * on calculatePaye() alone cannot catch bugs in the upstream aggregation
 * (which earnings feed PAYE, which are excluded from NSSA, medical aid
 * credit wiring, etc.).
 */

import { describe, it, expect } from 'vitest';
import { calculatePaye, calculateSplitSalaryPaye } from '../utils/taxEngine.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

// ZIMRA 2026 USD annual brackets (same as taxEngine.test.js)
const BRACKETS_USD = [
  { lowerBound: 0,     upperBound: 1200,       rate: 0,    fixedAmount: 0    },
  { lowerBound: 1201,  upperBound: 3600,        rate: 0.20, fixedAmount: 240  },
  { lowerBound: 3601,  upperBound: 12000,       rate: 0.25, fixedAmount: 420  },
  { lowerBound: 12001, upperBound: 24000,       rate: 0.30, fixedAmount: 1020 },
  { lowerBound: 24001, upperBound: 36000,       rate: 0.35, fixedAmount: 2220 },
  { lowerBound: 36001, upperBound: 99999999999, rate: 0.40, fixedAmount: 4020 },
];

const NSSA_CEILING = 700;
const NSSA_RATE    = 0.045;

/**
 * Simulates the aggregation that payrollWorker.js performs for a single
 * employee before it calls calculatePaye.
 *
 * Routing rules (mirrors payrollWorker.js):
 *   - All cash earnings go through overtimeAmount (the "additional earnings" bucket).
 *   - Earnings with affectsPaye=false are ALSO added to payeExcludedEarnings so
 *     they cancel out of grossForTax while still inflating cashEarnings/grossSalary.
 *   - Earnings with affectsNssa=false are ALSO added to nssaExcludedEarnings so
 *     they cancel out of nssaBasis while still in cashEarnings.
 *   - Medical aid goes to its own bucket (generates a 50% PAYE credit).
 *   - Pre-tax deductions go to pensionContribution (reduces taxableIncome before PAYE).
 *
 * @param {number}  basicSalary
 * @param {Array}   transactions  Array of { amount, affectsPaye, affectsNssa, preTax, isMedicalAid }
 * @param {Object}  opts          Extra calculatePaye params (bonus, pension, etc.)
 */
function simulatePayroll(basicSalary, transactions = [], opts = {}) {
  let overtimeAmount       = 0;
  let payeExcludedEarnings = 0;
  let nssaExcludedEarnings = 0;
  let medicalAid           = 0;
  let preTaxDeductions     = 0;
  let taxableBenefits      = 0;

  for (const tx of transactions) {
    if (tx.isMedicalAid) {
      medicalAid += tx.amount;
      continue;
    }
    if (tx.preTax) {
      preTaxDeductions += tx.amount;
      continue;
    }
    // Every cash earning flows into cashEarnings via overtimeAmount.
    overtimeAmount += tx.amount;

    if (!tx.affectsPaye) {
      // Cancel out of grossForTax while remaining in cashEarnings.
      payeExcludedEarnings += tx.amount;
    }
    if (!tx.affectsNssa) {
      // Cancel out of nssaBasis while remaining in cashEarnings.
      nssaExcludedEarnings += tx.amount;
    }
    if (tx.isBenefit) {
      taxableBenefits += tx.amount;
    }
  }

  return calculatePaye({
    baseSalary: basicSalary,
    currency: 'USD',
    taxBrackets: BRACKETS_USD,
    annualBrackets: true,
    nssaCeiling: NSSA_CEILING,
    nssaEmployeeRate: NSSA_RATE,
    overtimeAmount,
    payeExcludedEarnings,
    nssaExcludedEarnings,
    medicalAid,
    pensionContribution: preTaxDeductions,
    taxableBenefits,
    ...opts,
  });
}

// ─── Baseline: basic salary only ─────────────────────────────────────────────

describe('Payroll engine integration — basic salary only', () => {
  it('computes correct PAYE, NSSA, and net for a mid-range salary ($2000)', () => {
    const result = simulatePayroll(2000);

    // NSSA: min(2000, 700) × 4.5% = 31.5
    expect(result.nssaEmployee).toBeCloseTo(31.5, 2);
    // Annualised taxable = (2000 - 31.5) × 12 = 23622
    //   Band 1201-3600: (3600-1200)*0.20 = 480 (minus 1200 offset ≈ 479.8)
    //   Band 3601-12000: 8400*0.25 = 2100
    //   Band 12001-23622: 11622*0.30 = 3486.6
    //   Annual PAYE ≈ 6066.4 → monthly ≈ 505.5
    expect(result.payeBeforeLevy).toBeCloseTo(505.55, 1);
    expect(result.aidsLevy).toBeCloseTo(15.17, 1);
    expect(result.netSalary).toBeCloseTo(1447.78, 1);
  });

  it('below-threshold salary ($90) produces zero PAYE and AIDS levy', () => {
    const result = simulatePayroll(90);
    expect(result.totalPaye).toBe(0);
    expect(result.aidsLevy).toBe(0);
  });

  it('NSSA capped at ceiling for high earner ($8000 basic)', () => {
    const result = simulatePayroll(8000);
    expect(result.nssaEmployee).toBeCloseTo(31.5, 2); // 700 × 4.5%
    expect(result.nssaBasis).toBe(NSSA_CEILING);
  });
});

// ─── Allowances: PAYE-taxable vs non-taxable ─────────────────────────────────

describe('Payroll engine integration — allowances and their tax treatment', () => {
  it('housing allowance (PAYE+NSSA-taxable) raises both PAYE and NSSA', () => {
    // Use baseSalary=300 so that 300+200=500 stays below the $700 NSSA ceiling.
    const baseOnly    = simulatePayroll(300);
    const withHousing = simulatePayroll(300, [
      { amount: 200, affectsPaye: true, affectsNssa: true },
    ]);
    // PAYE increases because taxable gross went up
    expect(withHousing.totalPaye).toBeGreaterThan(baseOnly.totalPaye);
    // NSSA basis = min(300+200, 700) = 500 × 4.5% = 22.5
    expect(withHousing.nssaEmployee).toBeCloseTo(500 * NSSA_RATE, 5);
    expect(baseOnly.nssaEmployee).toBeCloseTo(300 * NSSA_RATE, 5);
  });

  it('airtime allowance (PAYE-taxable but NSSA-excluded) raises PAYE but not NSSA basis', () => {
    const baseOnly   = simulatePayroll(600);
    const withAirtime = simulatePayroll(600, [
      { amount: 100, affectsPaye: true, affectsNssa: false },
    ]);
    // PAYE increases (airtime is taxable)
    expect(withAirtime.totalPaye).toBeGreaterThan(baseOnly.totalPaye);
    // NSSA stays on basic salary only (600 < ceiling)
    expect(withAirtime.nssaEmployee).toBeCloseTo(600 * 0.045, 5);
    expect(baseOnly.nssaEmployee).toBeCloseTo(600 * 0.045, 5);
  });

  it('reimbursement (PAYE-excluded) does not change PAYE but increases gross', () => {
    const baseOnly        = simulatePayroll(2000);
    const withReimbursement = simulatePayroll(2000, [
      { amount: 300, affectsPaye: false, affectsNssa: false },
    ]);
    expect(withReimbursement.totalPaye).toBeCloseTo(baseOnly.totalPaye, 2);
    expect(withReimbursement.grossSalary).toBe(2300);
  });
});

// ─── Pre-tax deductions ───────────────────────────────────────────────────────

describe('Payroll engine integration — pre-tax deductions', () => {
  it('pension contribution reduces taxable income and therefore PAYE', () => {
    const withoutPension = simulatePayroll(3000);
    const withPension    = simulatePayroll(3000, [
      { amount: 200, preTax: true },
    ]);
    expect(withPension.totalPaye).toBeLessThan(withoutPension.totalPaye);
  });

  it('medical aid deduction generates a 50% tax credit against PAYE', () => {
    const withoutMed = simulatePayroll(2000);
    const withMed    = simulatePayroll(2000, [
      { amount: 200, isMedicalAid: true },
    ]);
    // Medical aid credit = 200 × 50% = 100
    expect(withMed.medicalAidCredit).toBeCloseTo(100, 2);
    // Total PAYE should be lower after credit
    expect(withMed.totalPaye).toBeLessThan(withoutMed.totalPaye);
  });

  it('medical aid credit cannot reduce PAYE below zero', () => {
    // Very high medical aid on a low-income employee
    const result = simulatePayroll(90, [
      { amount: 10000, isMedicalAid: true },
    ]);
    expect(result.totalPaye).toBe(0);
    expect(result.aidsLevy).toBe(0);
  });
});

// ─── Bonus and exemptions ─────────────────────────────────────────────────────

describe('Payroll engine integration — bonus month', () => {
  it('bonus with $500 exemption remaining: only the excess is taxable', () => {
    const withBonus = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      taxBrackets: BRACKETS_USD,
      annualBrackets: true,
      bonus: 1500,
      bonusExemption: 500,
    });
    const withFullBonus = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      taxBrackets: BRACKETS_USD,
      annualBrackets: true,
      bonus: 1500,
      bonusExemption: 0,
    });

    // Partial exemption → less PAYE
    expect(withBonus.totalPaye).toBeLessThan(withFullBonus.totalPaye);
    expect(withBonus.exemptBonus).toBe(500);
    // Gross salary must include the full bonus regardless
    expect(withBonus.grossSalary).toBeGreaterThanOrEqual(3500); // base + bonus
  });

  it('bonus smaller than the exemption limit: fully exempt', () => {
    const result = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      taxBrackets: BRACKETS_USD,
      annualBrackets: true,
      bonus: 300,
      bonusExemption: 500, // limit > bonus
    });
    expect(result.exemptBonus).toBe(300); // capped at actual bonus
  });
});

// ─── Dual-currency (USD + ZiG) ───────────────────────────────────────────────

describe('Payroll engine integration — dual currency (USD + ZiG)', () => {
  const XR = 25; // 1 USD = 25 ZiG

  it('50/50 USD-ZiG split produces same total PAYE as single-currency on the combined gross', () => {
    const singleUSD = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      taxBrackets: BRACKETS_USD,
      annualBrackets: true,
    });

    const split = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 1000 },
      zigParams: { baseSalary: 1000 * XR },
      exchangeRate: XR,
      taxBracketsUSD: BRACKETS_USD,
      annualBrackets: true,
    });

    const totalPayeUSDEquiv = split.usd.totalPaye + split.zig.totalPaye / XR;
    expect(totalPayeUSDEquiv).toBeCloseTo(singleUSD.totalPaye, 1);
  });

  it('PAYE apportioned 70/30 when USD is 70% of gross', () => {
    // Employee earns $1400 USD + 25*600=15000 ZiG (= $600) → total $2000
    const split = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 1400 },
      zigParams: { baseSalary: 600 * XR },
      exchangeRate: XR,
      taxBracketsUSD: BRACKETS_USD,
      annualBrackets: true,
    });

    expect(split.usdRatio).toBeCloseTo(0.7, 3);
    // ZiG PAYE in USD terms = 30% of total
    const totalPayeUSDEquiv = split.usd.totalPaye + split.zig.totalPaye / XR;
    expect(split.usd.totalPaye / totalPayeUSDEquiv).toBeCloseTo(0.7, 2);
  });

  it('100% USD run within the split function produces zero ZiG PAYE', () => {
    const result = calculateSplitSalaryPaye({
      usdParams: { baseSalary: 2000 },
      zigParams: { baseSalary: 0 },
      exchangeRate: XR,
      taxBracketsUSD: BRACKETS_USD,
      annualBrackets: true,
    });
    expect(result.usdRatio).toBe(1);
    expect(result.zig.totalPaye).toBe(0);
    expect(result.zig.nssaEmployee).toBe(0);
  });
});

// ─── Net-to-gross (employer absorbs PAYE) ────────────────────────────────────

describe('Payroll engine integration — grossUpNet', () => {
  // grossUpNet is tested in taxEngine.test.js; this integration test
  // confirms composition: that the result re-verifies round-trip.
  it('gross-up then verify: PAYE on the grossed-up salary yields the same net', async () => {
    const { grossUpNet } = await import('../utils/taxEngine.js');
    const TARGET = 2500;
    const grossedUp = grossUpNet({
      targetNet: TARGET,
      currency: 'USD',
      taxBrackets: BRACKETS_USD,
      annualBrackets: true,
    });
    const verification = calculatePaye({
      baseSalary: grossedUp.grossSalary,
      currency: 'USD',
      taxBrackets: BRACKETS_USD,
      annualBrackets: true,
    });
    expect(Math.abs(verification.netSalary - TARGET)).toBeLessThan(0.02);
  });
});

// ─── Statutory invariants ─────────────────────────────────────────────────────

describe('Payroll engine integration — statutory invariants', () => {
  it('AIDS levy is always 3% of PAYE before levy (when non-zero)', () => {
    const result = simulatePayroll(3000);
    if (result.payeBeforeLevy > 0) {
      expect(result.aidsLevy / result.payeBeforeLevy).toBeCloseTo(0.03, 5);
    }
  });

  it('net salary = gross − PAYE total − NSSA employee (no other deductions)', () => {
    const result = simulatePayroll(2000);
    const expectedNet = result.grossSalary - result.totalPaye - result.nssaEmployee;
    expect(result.netSalary).toBeCloseTo(expectedNet, 2);
  });

  it('employer costs (NSSA employer, WCIF, SDF) never reduce net salary', () => {
    const without = simulatePayroll(2000);
    const withCosts = calculatePaye({
      baseSalary: 2000,
      currency: 'USD',
      taxBrackets: BRACKETS_USD,
      annualBrackets: true,
      wcifRate: 0.01,
      sdfRate: 0.005,
    });
    expect(withCosts.netSalary).toBeCloseTo(without.netSalary, 2);
    expect(withCosts.wcifEmployer).toBeGreaterThan(0);
  });

  it('empty tax brackets result in zero PAYE but still deduct NSSA', () => {
    const result = calculatePaye({
      baseSalary: 5000,
      currency: 'USD',
      taxBrackets: [],
    });
    expect(result.totalPaye).toBe(0);
    expect(result.nssaEmployee).toBeCloseTo(31.5, 2); // ceiling still applies
  });
});
