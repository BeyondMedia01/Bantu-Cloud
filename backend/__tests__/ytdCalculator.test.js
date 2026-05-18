import { describe, it, expect } from 'vitest';
import { calculateYTD, getYtdStartDate } from '../utils/ytdCalculator.js';

// ─── calculateYTD ────────────────────────────────────────────────────────────

describe('calculateYTD', () => {
  const TC_BASIC  = 1;
  const TC_HOUSING = 2;
  const TC_MEDAID  = 3;

  const makePayslip = (overrides = {}) => ({
    basicSalaryApplied: 2000,
    paye: 300,
    aidsLevy: 9,
    nssaEmployee: 31.5,
    necLevy: 0,
    loanDeductions: 0,
    nssaEmployer: 31.5,
    zimdefEmployer: 4,
    sdfContribution: 2,
    wcifEmployer: 1,
    necEmployer: 0,
    medicalAidCredit: 0,
    payeZIG: 0,
    aidsLevyZIG: 0,
    nssaZIG: 0,
    ...overrides,
  });

  it('first payroll — ytdStat equals current payslip values with no history', () => {
    const current = makePayslip({ paye: 250, aidsLevy: 7.5, nssaEmployee: 31.5 });
    const { ytdStat } = calculateYTD({
      currentPayslip: current,
      historicalPayslips: [],
      currentTransactions: [],
      historicalTransactions: [],
    });
    expect(ytdStat.paye).toBeCloseTo(250, 5);
    expect(ytdStat.aidsLevy).toBeCloseTo(7.5, 5);
    expect(ytdStat.nssaEmployee).toBeCloseTo(31.5, 5);
    expect(ytdStat.basicSalary).toBe(2000);
  });

  it('second payroll — ytdStat accumulates current + one historical month', () => {
    const current = makePayslip({ paye: 300, aidsLevy: 9, nssaEmployee: 31.5 });
    const historical = [makePayslip({ paye: 280, aidsLevy: 8.4, nssaEmployee: 31.5, basicSalaryApplied: 2000 })];

    const { ytdStat } = calculateYTD({
      currentPayslip: current,
      historicalPayslips: historical,
      currentTransactions: [],
      historicalTransactions: [],
    });

    expect(ytdStat.paye).toBeCloseTo(580, 5);
    expect(ytdStat.aidsLevy).toBeCloseTo(17.4, 5);
    expect(ytdStat.nssaEmployee).toBeCloseTo(63, 5);
    expect(ytdStat.basicSalary).toBe(4000);
  });

  it('accumulates three historical payslips correctly', () => {
    const current = makePayslip({ paye: 300 });
    const history = [
      makePayslip({ paye: 300 }),
      makePayslip({ paye: 300 }),
      makePayslip({ paye: 300 }),
    ];
    const { ytdStat } = calculateYTD({
      currentPayslip: current,
      historicalPayslips: history,
      currentTransactions: [],
      historicalTransactions: [],
    });
    expect(ytdStat.paye).toBe(1200); // 4 months × $300
  });

  it('transaction code YTD accumulates USD and ZiG amounts separately', () => {
    const current = makePayslip();
    const currentTxs = [
      { transactionCodeId: TC_BASIC,   currency: 'USD', amount: 2000 },
      { transactionCodeId: TC_HOUSING, currency: 'USD', amount: 200  },
      { transactionCodeId: TC_MEDAID,  currency: 'ZiG', amount: 5000 },
    ];
    const historicalTxs = [
      { transactionCodeId: TC_BASIC,   currency: 'USD', amount: 2000 },
      { transactionCodeId: TC_HOUSING, currency: 'USD', amount: 200  },
      { transactionCodeId: TC_MEDAID,  currency: 'ZiG', amount: 5000 },
    ];

    const { ytdMap, ytdMapZIG } = calculateYTD({
      currentPayslip: current,
      historicalPayslips: [makePayslip()],
      currentTransactions: currentTxs,
      historicalTransactions: historicalTxs,
    });

    expect(ytdMap[TC_BASIC]).toBe(4000);   // 2 months of USD
    expect(ytdMap[TC_HOUSING]).toBe(400);  // 2 months of USD
    expect(ytdMapZIG[TC_MEDAID]).toBe(10000); // 2 months of ZiG
    expect(ytdMap[TC_MEDAID]).toBeUndefined(); // ZiG TC should not appear in USD map
  });

  it('ZiG statutory fields accumulate from ytdStatZIG', () => {
    const current = makePayslip({ payeZIG: 1000, aidsLevyZIG: 30, nssaZIG: 0 });
    const history  = [makePayslip({ payeZIG: 1000, aidsLevyZIG: 30, nssaZIG: 0 })];

    const { ytdStatZIG } = calculateYTD({
      currentPayslip: current,
      historicalPayslips: history,
      currentTransactions: [],
      historicalTransactions: [],
    });

    expect(ytdStatZIG.paye).toBe(2000);
    expect(ytdStatZIG.aidsLevy).toBe(60);
  });

  it('null/missing fields on payslip default to 0 without throwing', () => {
    const sparse = { basicSalaryApplied: null };
    expect(() => calculateYTD({
      currentPayslip: sparse,
      historicalPayslips: [sparse],
      currentTransactions: [],
      historicalTransactions: [],
    })).not.toThrow();

    const { ytdStat } = calculateYTD({
      currentPayslip: sparse,
      historicalPayslips: [sparse],
      currentTransactions: [],
      historicalTransactions: [],
    });
    expect(ytdStat.paye).toBe(0);
    expect(ytdStat.basicSalary).toBe(0);
  });

  it('employer contributions accumulate separately in ytdStat', () => {
    const current = makePayslip({ nssaEmployer: 31.5, zimdefEmployer: 4, sdfContribution: 2, wcifEmployer: 1 });
    const history  = [makePayslip({ nssaEmployer: 31.5, zimdefEmployer: 4, sdfContribution: 2, wcifEmployer: 1 })];

    const { ytdStat } = calculateYTD({
      currentPayslip: current,
      historicalPayslips: history,
      currentTransactions: [],
      historicalTransactions: [],
    });

    expect(ytdStat.nssaEmployer).toBeCloseTo(63, 5);
    expect(ytdStat.zimdefEmployer).toBeCloseTo(8, 5);
    expect(ytdStat.sdfContribution).toBeCloseTo(4, 5);
    expect(ytdStat.wcifEmployer).toBeCloseTo(2, 5);
  });
});

// ─── getYtdStartDate ─────────────────────────────────────────────────────────

describe('getYtdStartDate', () => {
  it('April run → tax year starts April 1 of the same calendar year', () => {
    const result = getYtdStartDate('2026-04-30', null);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3); // April = month index 3
    expect(result.getDate()).toBe(1);
  });

  it('January run → tax year started April 1 of the previous calendar year', () => {
    const result = getYtdStartDate('2026-01-15', null);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(3);
  });

  it('March run → still in the previous tax year (Apr 1 of prior year)', () => {
    const result = getYtdStartDate('2026-03-31', null);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(3);
  });

  it('April 1 exactly → returns April 1 of the same year', () => {
    const result = getYtdStartDate('2026-04-01', null);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(1);
  });

  it('company first payroll after April 1 → uses the first payroll date', () => {
    const firstPayroll = '2026-07-01';
    const result = getYtdStartDate('2026-10-01', firstPayroll);
    expect(result.toISOString().startsWith('2026-07-01')).toBe(true);
  });

  it('company first payroll before April 1 → uses April 1 (not the company date)', () => {
    const firstPayroll = '2026-02-01'; // before April 1, 2026
    const result = getYtdStartDate('2026-08-01', firstPayroll);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3); // April
  });

  it('null first payroll date → falls back to April 1', () => {
    const result = getYtdStartDate('2026-08-01', null);
    expect(result.getMonth()).toBe(3);
    expect(result.getFullYear()).toBe(2026);
  });

  it('legacy epoch firstPayrollDate (1970) is ignored and April 1 is used', () => {
    const result = getYtdStartDate('2026-06-01', new Date(0).toISOString());
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);
  });
});
