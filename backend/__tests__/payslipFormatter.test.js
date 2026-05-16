import { describe, it, expect } from 'vitest';

// Import from the pure module — no DB or PDF dependencies.
import { buildPayslipLineItems } from '../utils/payslipLineItems.js';

// buildPayslipLineItems is a pure function — no DB calls, no async.
// Tests here verify that line items are built correctly from payslip + transaction data.

const makePayslip = (overrides = {}) => ({
  paye: 300,
  aidsLevy: 9,
  nssaEmployee: 31.5,
  nssaEmployer: 31.5,
  necLevy: 0,
  loanDeductions: 0,
  zimdefEmployer: 0,
  sdfContribution: 0,
  wcifEmployer: 0,
  necEmployer: 0,
  medicalAidCredit: 0,
  basicSalaryApplied: 2000,
  gross: 2200,
  netPay: 1859.5,
  payrollRun: { dualCurrency: false, currency: 'USD' },
  // dual-currency fields
  payeUSD: null, payeZIG: null,
  aidsLevyUSD: null, aidsLevyZIG: null,
  nssaUSD: null, nssaZIG: null,
  grossZIG: null,
  ...overrides,
});

const makeTC = (id, name, type, extra = {}) => ({
  id,
  code: String(id),
  name,
  type,
  incomeCategory: null,
  preTax: false,
  ...extra,
});

const makeTx = (tcId, amount, type, currency = 'USD', tcOverrides = {}) => ({
  transactionCodeId: tcId,
  amount,
  currency,
  description: null,
  units: null,
  unitsType: null,
  transactionCode: makeTC(tcId, `TC_${tcId}`, type, tcOverrides),
});

const emptyYtd = () => ({
  ytdStat: {
    basicSalary: 2000, paye: 300, aidsLevy: 9, nssaEmployee: 31.5,
    necLevy: 0, loanDeductions: 0, nssaEmployer: 31.5, zimdefEmployer: 0,
    sdfContribution: 0, wcifEmployer: 0, necEmployer: 0, medicalAidCredit: 0,
  },
  ytdMap: {},
  ytdStatZIG: { paye: 0, aidsLevy: 0, nssaEmployee: 0 },
  ytdMapZIG: {},
});

// ─── Single-currency: basic structure ───────────────────────────────────────

describe('buildPayslipLineItems — single currency', () => {
  it('always includes Basic Salary as the first line', () => {
    const lines = buildPayslipLineItems({
      payslip: makePayslip(),
      transactions: [],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    expect(lines[0].name).toBe('Basic Salary');
    expect(lines[0].allowance).toBe(2000);
    expect(lines[0].deduction).toBe(0);
  });

  it('includes statutory deduction lines for PAYE, AIDS Levy, and NSSA', () => {
    const lines = buildPayslipLineItems({
      payslip: makePayslip(),
      transactions: [],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    const names = lines.map(l => l.name);
    expect(names).toContain('PAYE');
    expect(names).toContain('AIDS Levy');
    expect(names).toContain('NSSA Employee');
  });

  it('PAYE line has correct deduction amount', () => {
    const lines = buildPayslipLineItems({
      payslip: makePayslip({ paye: 305.5 }),
      transactions: [],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    const paye = lines.find(l => l.name === 'PAYE');
    expect(paye.deduction).toBeCloseTo(305.5, 2);
    expect(paye.allowance).toBe(0);
  });

  it('earning transaction appears in the lines with allowance populated', () => {
    const tx = makeTx(10, 200, 'EARNING');
    const lines = buildPayslipLineItems({
      payslip: makePayslip(),
      transactions: [tx],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    const housing = lines.find(l => l.name === 'TC_10');
    expect(housing).toBeDefined();
    expect(housing.allowance).toBe(200);
    expect(housing.deduction).toBe(0);
  });

  it('deduction transaction appears with deduction populated', () => {
    const tx = makeTx(20, 100, 'DEDUCTION');
    const lines = buildPayslipLineItems({
      payslip: makePayslip(),
      transactions: [tx],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    const deduction = lines.find(l => l.name === 'TC_20');
    expect(deduction).toBeDefined();
    expect(deduction.deduction).toBe(100);
    expect(deduction.allowance).toBe(0);
  });

  it('medical aid credit line has taxCredit:true so it is excluded from earnings totals', () => {
    const lines = buildPayslipLineItems({
      payslip: makePayslip({ medicalAidCredit: 50 }),
      transactions: [],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    const credit = lines.find(l => l.name === 'Medical Aid Credit');
    expect(credit).toBeDefined();
    expect(credit.taxCredit).toBe(true);
    expect(credit.allowance).toBe(50);
  });

  it('medical aid credit line is absent when credit is 0', () => {
    const lines = buildPayslipLineItems({
      payslip: makePayslip({ medicalAidCredit: 0 }),
      transactions: [],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    expect(lines.find(l => l.name === 'Medical Aid Credit')).toBeUndefined();
  });

  it('medical aid deduction (code 301) appears in its own section with employer amount', () => {
    const tx = makeTx(301, 150, 'DEDUCTION', 'USD', { code: '301', incomeCategory: null });
    const lines = buildPayslipLineItems({
      payslip: makePayslip(),
      transactions: [tx],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    const medAid = lines.find(l => l.name === 'TC_301');
    expect(medAid).toBeDefined();
    expect(medAid.deduction).toBe(150);
    expect(medAid.employer).toBe(150); // medical aid shows employer cost too
  });

  it('loan deductions appear when loanDeductions > 0', () => {
    const lines = buildPayslipLineItems({
      payslip: makePayslip({ loanDeductions: 200 }),
      transactions: [],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    expect(lines.find(l => l.name === 'Loan Repayments')).toBeDefined();
  });

  it('employer contributions appear when non-zero', () => {
    const lines = buildPayslipLineItems({
      payslip: makePayslip({ nssaEmployer: 31.5, zimdefEmployer: 4, sdfContribution: 2, wcifEmployer: 1 }),
      transactions: [],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    expect(lines.find(l => l.name === 'NSSA Employer')).toBeDefined();
    expect(lines.find(l => l.name === 'ZIMDEF (Manpower)')).toBeDefined();
    expect(lines.find(l => l.name === 'SDF (Training)')).toBeDefined();
    expect(lines.find(l => l.name === 'WCIF (Insurance)')).toBeDefined();
  });

  it('employer contributions are absent when zero', () => {
    const lines = buildPayslipLineItems({
      payslip: makePayslip({ nssaEmployer: 0, zimdefEmployer: 0, sdfContribution: 0, wcifEmployer: 0 }),
      transactions: [],
      basicSalary: 2000,
      ...emptyYtd(),
    });
    expect(lines.find(l => l.name === 'NSSA Employer')).toBeUndefined();
  });

  it('YTD values on each line reflect the ytdMap entries', () => {
    const tx = makeTx(10, 200, 'EARNING');
    const ytd = emptyYtd();
    ytd.ytdMap[10] = 800; // 4 months of $200 = $800
    const lines = buildPayslipLineItems({
      payslip: makePayslip(),
      transactions: [tx],
      basicSalary: 2000,
      ...ytd,
    });
    const housing = lines.find(l => l.name === 'TC_10');
    expect(housing.ytd).toBe(800);
  });
});

// ─── Dual-currency: grouping logic ──────────────────────────────────────────

describe('buildPayslipLineItems — dual currency', () => {
  const dualPayslip = makePayslip({
    payrollRun: { dualCurrency: true, currency: 'USD' },
    payeUSD: 200, payeZIG: 5000,
    aidsLevyUSD: 6, aidsLevyZIG: 150,
    nssaUSD: 20, nssaZIG: 300,
    grossZIG: 50000,
  });

  it('groups USD and ZiG transactions for the same TC into one line', () => {
    const txUSD = makeTx(10, 200, 'EARNING', 'USD');
    const txZIG = makeTx(10, 5000, 'EARNING', 'ZiG');
    const lines = buildPayslipLineItems({
      payslip: dualPayslip,
      transactions: [txUSD, txZIG],
      basicSalary: 1000,
      ...emptyYtd(),
    });
    const earningLines = lines.filter(l => l.name === 'TC_10');
    expect(earningLines).toHaveLength(1); // merged into one row
    expect(earningLines[0].amountUSD).toBeUndefined(); // the line uses allowance/allowanceZIG
    expect(earningLines[0].allowance).toBe(200);
    expect(earningLines[0].allowanceZIG).toBe(5000);
  });

  it('PAYE line shows split USD and ZiG amounts for dual run', () => {
    const lines = buildPayslipLineItems({
      payslip: dualPayslip,
      transactions: [],
      basicSalary: 1000,
      ...emptyYtd(),
    });
    const paye = lines.find(l => l.name === 'PAYE');
    expect(paye.deduction).toBe(200);    // payeUSD
    expect(paye.deductionZIG).toBe(5000); // payeZIG
  });
});
