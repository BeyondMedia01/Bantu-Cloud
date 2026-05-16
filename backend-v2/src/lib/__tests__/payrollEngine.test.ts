import { describe, it, expect } from 'vitest';
import { processEmployee } from '../payrollEngine';
import type { EmployeeRecord, RunContext, EngineSettings, FdsYtd } from '../payrollEngine';

const TAX_BRACKETS = [
  { lowerBound: 0, upperBound: 300, rate: 0, fixedAmount: 0 },
  { lowerBound: 300.01, upperBound: 1000, rate: 0.20, fixedAmount: 0 },
  { lowerBound: 1000.01, upperBound: null, rate: 0.40, fixedAmount: 0 },
];

const baseSettings: EngineSettings = {
  nssaCeilingUSD: 700, nssaCeilingZIG: 5000,
  bonusExemptionUSD: 1000, bonusExemptionZIG: 7000,
  severanceExemptionUSD: 10000, severanceExemptionZIG: 70000,
  wcifRate: 0.01, sdfRate: 0.005,
  nssaEmployeeRateUSD: 0.045, nssaEmployerRateUSD: 0.045,
  nssaEmployeeRateZIG: 0.045, nssaEmployerRateZIG: 0.045,
  aidsLevyRate: 0.03, medicalAidCreditRate: 0.5,
  monthlyPensionCapUSD: null, monthlyPensionCapZIG: null,
  prescribedRateUSD: 10, prescribedRateZIG: 10,
  elderlyCreditUSD: 0, elderlyCreditZIG: 0,
  vehicleBenefitTable: { USD: { UP_TO_1500CC: 50, CC_1501_TO_2000: 80, ABOVE_2000CC: 100 }, ZiG: {} },
  zimdefRate: 0.005,
  workingDaysPerPeriodDefault: 22,
};

const baseRun: RunContext = {
  id: 'run-1',
  currency: 'USD',
  dualCurrency: false,
  exchangeRate: 1,
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-01-31'),
  company: { clientId: 'client-1', wcifRate: null, sdfRate: null, zimdefRate: null },
  taxBracketsUSD: TAX_BRACKETS,
  taxBracketsZIG: [],
  annualBracketsUSD: false,
  annualBracketsZIG: false,
};

function makeEmployee(overrides: Partial<EmployeeRecord> = {}): EmployeeRecord {
  return {
    id: 'emp-1', employeeCode: 'E001', firstName: 'Test', lastName: 'User',
    baseRate: 500, currency: 'USD', taxMethod: 'NON_FDS',
    taxDirectivePerc: null, taxDirectiveAmt: null,
    taxDirectiveEffective: null, taxDirectiveExpiry: null,
    taxCredits: 0, dateOfBirth: null, dischargeDate: null,
    hoursPerPeriod: null, daysPerPeriod: null,
    paymentBasis: null, rateSource: null,
    necGradeId: null, gradeId: null,
    splitUsdPercent: null, splitZigMode: null, splitZigValue: null,
    motorVehicleBenefit: null, vehicleEngineCategory: null,
    grossingUp: false, leaveBalance: null, leaveTaken: null, necGrade: null,
    ...overrides,
  };
}

const emptyYtd: FdsYtd = {
  cumGross: 0, uniqueMonths: new Set(),
  cumExemptBonus: 0, cumExemptBonusUSD: 0, cumExemptBonusZIG: 0,
  cumExemptSeverance: 0, cumExemptSeveranceUSD: 0, cumExemptSeveranceZIG: 0,
};

describe('processEmployee', () => {
  it('produces a payslip for a basic employee with no inputs', () => {
    const result = processEmployee({
      emp: makeEmployee({ baseRate: 500 }),
      run: baseRun, adj: {}, empInputs: [], empDefaults: [], empRepayments: [],
      empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });

    expect(result.payslip.employeeId).toBe('emp-1');
    expect(result.payslip.gross).toBeGreaterThan(0);
    // $500 salary → NSSA pre-tax: 500 - 22.5 = 477.5 taxable
    // 0 on first $300, 20% on $177.5 = $35.5 PAYE before AIDS levy
    expect(result.payslip.paye).toBeCloseTo(35.5, 0);
    expect(result.payslip.aidsLevy).toBeCloseTo(35.5 * 0.03, 0);
    expect(result.payslip.netPay).toBeGreaterThan(0);
    expect(result.transactions).toHaveLength(0);
  });

  it('deducts loan repayments from net pay', () => {
    const noLoanResult = processEmployee({
      emp: makeEmployee({ baseRate: 500 }), run: baseRun, adj: {}, empInputs: [], empDefaults: [],
      empRepayments: [], empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });
    const safeAmount = Math.floor(noLoanResult.payslip.netPay / 2);
    const repayment = { id: 'rep-1', loanId: 'loan-1', amount: safeAmount, loan: { employeeId: 'emp-1' } };

    const result = processEmployee({
      emp: makeEmployee({ baseRate: 500 }), run: baseRun, adj: {}, empInputs: [], empDefaults: [],
      empRepayments: [repayment], empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });

    expect(result.payslip.loanDeductions).toBe(safeAmount);
    expect(result.appliedRepaymentIds).toContain('rep-1');
  });

  it('zeros base rate for discharged employees before run start', () => {
    const result = processEmployee({
      emp: makeEmployee({ baseRate: 1000, dischargeDate: new Date('2024-12-31') }),
      run: baseRun, adj: {}, empInputs: [], empDefaults: [], empRepayments: [],
      empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });

    expect(result.payslip.basicSalaryApplied).toBe(0);
    expect(result.payslip.gross).toBe(0);
    expect(result.payslip.netPay).toBe(0);
  });

  it('prorates salary for mid-period discharge', () => {
    const result = processEmployee({
      emp: makeEmployee({ baseRate: 620 }),
      run: baseRun, adj: {}, empInputs: [], empDefaults: [], empRepayments: [],
      empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });
    // Full month → gross = 620
    expect(result.payslip.basicSalaryApplied).toBeCloseTo(620, 1);

    const resultMid = processEmployee({
      emp: makeEmployee({ baseRate: 620, dischargeDate: new Date('2025-01-15') }),
      run: baseRun, adj: {}, empInputs: [], empDefaults: [], empRepayments: [],
      empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });
    // Half month → should be roughly half
    expect(resultMid.payslip.basicSalaryApplied).toBeLessThan(620);
    expect(resultMid.payslip.basicSalaryApplied).toBeGreaterThan(0);
  });

  it('applies unpaid leave deduction', () => {
    const fullResult = processEmployee({
      emp: makeEmployee({ baseRate: 660 }),
      run: baseRun, adj: {}, empInputs: [], empDefaults: [], empRepayments: [],
      empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });
    const leaveResult = processEmployee({
      emp: makeEmployee({ baseRate: 660 }),
      run: baseRun, adj: {}, empInputs: [], empDefaults: [], empRepayments: [],
      empLoans: [], unpaidLeave: { employeeId: 'emp-1', type: 'UNPAID', totalDays: 11 },
      ytd: emptyYtd, settings: baseSettings,
    });

    expect(leaveResult.payslip.gross).toBeLessThan(fullResult.payslip.gross);
  });

  it('skips loan repayment when net insufficient', () => {
    const repayment = { id: 'rep-1', loanId: 'loan-1', amount: 9999, loan: { employeeId: 'emp-1' } };
    const result = processEmployee({
      emp: makeEmployee({ baseRate: 500 }),
      run: baseRun, adj: {}, empInputs: [], empDefaults: [], empRepayments: [repayment],
      empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });

    expect(result.payslip.loanDeductions).toBe(0);
    expect(result.appliedRepaymentIds).toHaveLength(0);
  });

  it('NaN guard — no NaN values in payslip output', () => {
    const result = processEmployee({
      emp: makeEmployee({ baseRate: 750 }),
      run: baseRun, adj: {}, empInputs: [], empDefaults: [], empRepayments: [],
      empLoans: [], unpaidLeave: undefined, ytd: emptyYtd, settings: baseSettings,
    });
    for (const [k, v] of Object.entries(result.payslip)) {
      if (typeof v === 'number') {
        expect(isFinite(v), `${k} should be finite`).toBe(true);
      }
    }
  });
});
