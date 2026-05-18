import { calculatePaye, calculateSplitSalaryPaye, grossUpNet } from './taxEngine';

export interface TaxBracket {
  lowerBound: number;
  upperBound: number | null;
  rate: number;
  fixedAmount: number;
}

export interface EngineSettings {
  nssaCeilingUSD: number;
  nssaCeilingZIG: number;
  bonusExemptionUSD: number;
  bonusExemptionZIG: number;
  severanceExemptionUSD: number;
  severanceExemptionZIG: number;
  wcifRate: number;
  sdfRate: number;
  nssaEmployeeRateUSD: number;
  nssaEmployerRateUSD: number;
  nssaEmployeeRateZIG: number;
  nssaEmployerRateZIG: number;
  aidsLevyRate: number;
  medicalAidCreditRate: number;
  monthlyPensionCapUSD: number | null;
  monthlyPensionCapZIG: number | null;
  prescribedRateUSD: number;
  prescribedRateZIG: number;
  elderlyCreditUSD: number;
  elderlyCreditZIG: number;
  vehicleBenefitTable: Record<string, Record<string, number>>;
  zimdefRate: number;
  workingDaysPerPeriodDefault: number;
}

export interface RunContext {
  id: string;
  currency: string;
  dualCurrency: boolean;
  exchangeRate: number;
  startDate: Date;
  endDate: Date;
  company: { clientId: string; wcifRate: number | null; sdfRate: number | null; zimdefRate: number | null };
  taxBracketsUSD: TaxBracket[];
  taxBracketsZIG: TaxBracket[];
  annualBracketsUSD: boolean;
  annualBracketsZIG: boolean;
}

export interface EmployeeRecord {
  id: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  baseRate: number;
  currency: string | null;
  taxMethod: string | null;
  taxDirectivePerc: number | null;
  taxDirectiveAmt: number | null;
  taxDirectiveEffective: Date | null;
  taxDirectiveExpiry: Date | null;
  taxCredits: number | null;
  dateOfBirth: Date | null;
  dischargeDate: Date | null;
  hoursPerPeriod: number | null;
  daysPerPeriod: number | null;
  paymentBasis: string | null;
  rateSource: string | null;
  necGradeId: string | null;
  gradeId: string | null;
  splitUsdPercent: number | null;
  splitZigMode: string | null;
  splitZigValue: number | null;
  motorVehicleBenefit: number | null;
  vehicleEngineCategory: string | null;
  grossingUp: boolean | null;
  leaveBalance: number | null;
  leaveTaken: number | null;
  necGrade: { id: string; minRate: number; necLevyRate: number } | null;
}

export interface PayrollInput {
  id: string;
  employeeId: string;
  transactionCodeId: string;
  employeeUSD: number | null;
  employeeZiG: number | null;
  units: number | null;
  notes: string | null;
  duration: string | null;
  transactionCode: {
    type: string;
    taxable: boolean | null;
    preTax: boolean | null;
    affectsNssa: boolean | null;
    affectsPaye: boolean | null;
    name: string;
    code: string;
    incomeCategory: string | null;
    defaultValue: string | null;
    deemedBenefitPercent: number | null;
  };
}

export interface SalaryDefault {
  employeeId: string;
  transactionCodeId: string;
  value: number;
  currency: string;
  notes: string | null;
  transactionCode: {
    type: string;
    taxable: boolean | null;
    preTax: boolean | null;
    affectsNssa: boolean | null;
    affectsPaye: boolean | null;
    name: string;
    code: string;
    incomeCategory: string | null;
    defaultValue: string | null;
    deemedBenefitPercent: number | null;
  };
}

export interface LoanRepayment {
  id: string;
  loanId: string;
  amount: number;
  loan: { employeeId: string };
}

export interface ActiveLoan {
  id: string;
  employeeId: string;
  amount: number;
  interestRate: number | null;
  repayments: { amount: number }[];
}

export interface UnpaidLeave {
  employeeId: string;
  type: string;
  totalDays: number | null;
}

export interface FdsYtd {
  cumGross: number;
  uniqueMonths: Set<string>;
  cumExemptBonus: number;
  cumExemptBonusUSD: number;
  cumExemptBonusZIG: number;
  cumExemptSeverance: number;
  cumExemptSeveranceUSD: number;
  cumExemptSeveranceZIG: number;
}

export interface EmployeeAdjustments {
  taxableBenefits?: number;
  overtimeAmount?: number;
  bonus?: number;
  severanceAmount?: number;
  pensionContribution?: number;
  medicalAid?: number;
}

export interface PayslipData {
  employeeId: string;
  payrollRunId: string;
  gross: number;
  paye: number;
  aidsLevy: number;
  nssaEmployee: number;
  nssaEmployer: number;
  nssaBasis: number;
  pensionApplied: number;
  basicSalaryApplied: number;
  wcifEmployer: number;
  sdfContribution: number;
  zimdefEmployer: number;
  necLevy: number;
  necEmployer: number;
  loanDeductions: number;
  netPay: number;
  netPayUSD: number | null;
  netPayZIG: number | null;
  exchangeRate: number | null;
  grossUSD?: number;
  grossZIG?: number;
  payeUSD?: number;
  payeZIG?: number;
  aidsLevyUSD?: number;
  aidsLevyZIG?: number;
  nssaUSD?: number;
  nssaZIG?: number;
  exemptBonus: number;
  exemptBonusUSD: number | null;
  exemptBonusZIG: number | null;
  exemptSeverance: number;
  exemptSeveranceUSD: number | null;
  exemptSeveranceZIG: number | null;
  medicalAidCredit: number;
  taxCreditsApplied: number;
}

export interface PayrollTx {
  employeeId: string;
  payrollRunId: string;
  transactionCodeId: string;
  amount: number;
  currency: string;
  description: string | null;
}

export interface EmployeePayrollResult {
  payslip: PayslipData;
  transactions: PayrollTx[];
  appliedRepaymentIds: string[];
}

function isMedicalAid(tc: { type: string; preTax: boolean | null; incomeCategory: string | null; name: string; code: string }): boolean {
  return tc.type === 'DEDUCTION' && tc.preTax === false &&
    (tc.incomeCategory === 'MEDICAL_AID' ||
      /medical\s*aid|med\s*aid/i.test(tc.name) ||
      /MED_AID|MEDICAL_AID/i.test(tc.code) ||
      (tc.name.toLowerCase().includes('medical') && /^\d+$/.test(tc.code)));
}

const round2 = (x: number) => Math.round((x + Number.EPSILON) * 100) / 100;

export function processEmployee(params: {
  emp: EmployeeRecord;
  run: RunContext;
  adj: EmployeeAdjustments;
  empInputs: PayrollInput[];
  empDefaults: SalaryDefault[];
  empRepayments: LoanRepayment[];
  empLoans: ActiveLoan[];
  unpaidLeave: UnpaidLeave | undefined;
  ytd: FdsYtd;
  settings: EngineSettings;
}): EmployeePayrollResult {
  const { emp, run, adj, empInputs, empDefaults, empRepayments, empLoans, unpaidLeave, ytd, settings } = params;
  const {
    nssaCeilingUSD, nssaCeilingZIG, bonusExemptionUSD, bonusExemptionZIG,
    severanceExemptionUSD, severanceExemptionZIG, wcifRate, sdfRate,
    nssaEmployeeRateUSD, nssaEmployerRateUSD, nssaEmployeeRateZIG, nssaEmployerRateZIG,
    aidsLevyRate, medicalAidCreditRate, monthlyPensionCapUSD, monthlyPensionCapZIG,
    prescribedRateUSD, prescribedRateZIG, elderlyCreditUSD, elderlyCreditZIG,
    vehicleBenefitTable, zimdefRate, workingDaysPerPeriodDefault,
  } = settings;

  const xr = run.exchangeRate > 0 ? run.exchangeRate : 1;
  const toRunCcy = (usd: number, zig: number) => round2(run.currency === 'ZiG'
    ? (zig || 0) + (usd || 0) * xr
    : (usd || 0) + (zig || 0) / xr);

  const nssaCeiling = run.currency === 'ZiG' ? nssaCeilingZIG : nssaCeilingUSD;
  const nssaEmployeeRate = run.currency === 'ZiG' ? nssaEmployeeRateZIG : nssaEmployeeRateUSD;
  const nssaEmployerRate = run.currency === 'ZiG' ? nssaEmployerRateZIG : nssaEmployerRateUSD;
  const taxBrackets = run.currency === 'ZiG' ? run.taxBracketsZIG : run.taxBracketsUSD;
  const annualBrackets = run.currency === 'ZiG' ? run.annualBracketsZIG : run.annualBracketsUSD;

  const resolveVehicleBenefit = (e: EmployeeRecord, currency: string): number => {
    const cat = e.vehicleEngineCategory;
    if (!cat || cat === 'NONE') return e.motorVehicleBenefit || 0;
    const ccy = currency === 'ZiG' ? 'ZiG' : 'USD';
    return vehicleBenefitTable[ccy]?.[cat] ?? e.motorVehicleBenefit ?? 0;
  };

  // ---- Loan benefits ----
  let totalLoanBenefit = 0, totalLoanBenefitUSD = 0, totalLoanBenefitZIG = 0;
  if (run.dualCurrency) {
    const empPrescribedRate = emp.currency === 'USD' ? prescribedRateUSD : prescribedRateZIG;
    for (const loan of empLoans) {
      const loanRate = loan.interestRate ?? 0;
      if (loanRate < empPrescribedRate) {
        const paidAmt = loan.repayments.reduce((s, r) => s + (r.amount || 0), 0);
        const balance = Math.max(0, loan.amount - paidAmt);
        if (balance > 0) {
          const benefit = round2((balance * (empPrescribedRate - loanRate)) / 100 / 12);
          if (emp.currency === 'USD') totalLoanBenefitUSD += benefit;
          else totalLoanBenefitZIG += benefit;
        }
      }
    }
  } else {
    const empPrescribedRate = emp.currency === 'ZiG' ? prescribedRateZIG : prescribedRateUSD;
    for (const loan of empLoans) {
      const loanRate = loan.interestRate ?? 0;
      if (loanRate < empPrescribedRate) {
        const paidAmt = loan.repayments.reduce((s, r) => s + (r.amount || 0), 0);
        const balance = Math.max(0, loan.amount - paidAmt);
        if (balance > 0) {
          let benefit = round2((balance * (empPrescribedRate - loanRate)) / 100 / 12);
          if (emp.currency === 'ZiG' && run.currency === 'USD') benefit = round2(benefit / xr);
          else if (emp.currency === 'USD' && run.currency === 'ZiG') benefit = round2(benefit * xr);
          totalLoanBenefit += benefit;
        }
      }
    }
  }

  // ---- Input aggregation ----
  let inputEarnings = 0, inputDeductions = 0, inputPension = 0;
  let inputMedicalAid = 0, inputMedicalAidUSD = 0, inputMedicalAidZIG = 0;
  let inputEarningsUSD = 0, inputEarningsZIG = 0;
  let inputDeductionsUSD = 0, inputDeductionsZIG = 0;
  let inputPensionUSD = 0, inputPensionZIG = 0;
  let inputNssaExcluded = 0, inputPayeExcluded = 0;
  let inputNssaExcludedUSD = 0, inputNssaExcludedZIG = 0;
  let inputPayeExcludedUSD = 0, inputPayeExcludedZIG = 0;

  // Auto-compute basic salary and overtime amounts from units if not set
  for (const i of empInputs) {
    if (i.transactionCode.code === '201' && (i.units || 0) > 0 && !(i.employeeUSD || 0) && !(i.employeeZiG || 0)) {
      const divisor = emp.daysPerPeriod || workingDaysPerPeriodDefault || 22;
      const amt = round2((emp.baseRate / divisor) * (i.units || 0));
      if (emp.currency === 'ZiG') (i as any).employeeZiG = amt;
      else (i as any).employeeUSD = amt;
    }
  }
  for (const i of empInputs) {
    const tc = i.transactionCode;
    const isOvertime = tc.incomeCategory === 'OVERTIME' || tc.name.toLowerCase().includes('overtime');
    if (isOvertime && (i.units || 0) > 0 && !(i.employeeUSD || 0) && !(i.employeeZiG || 0)) {
      const divisor = emp.daysPerPeriod || workingDaysPerPeriodDefault || 22;
      const hourlyRate = (emp.baseRate / divisor) / 8;
      const nameMatch = tc.name.match(/(\d+(?:\.\d+)?)x/i);
      const multiplier = tc.defaultValue != null ? parseFloat(tc.defaultValue) : (nameMatch ? parseFloat(nameMatch[1]) : 1.5);
      const amt = round2(hourlyRate * (i.units || 0) * multiplier);
      if (emp.currency === 'ZiG') (i as any).employeeZiG = amt;
      else (i as any).employeeUSD = amt;
    }
  }

  const accumulateInput = (tc: PayrollInput['transactionCode'], empUSD: number, empZIG: number) => {
    const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
    const isPreTax = tc.type === 'DEDUCTION' && tc.preTax === true;
    const isMedAid = isMedicalAid(tc as any);
    const deemedExempt = isEarning && tc.deemedBenefitPercent != null && tc.deemedBenefitPercent > 0 && tc.deemedBenefitPercent < 100
      ? (100 - tc.deemedBenefitPercent) / 100
      : 0;

    if (run.dualCurrency) {
      if (isEarning) {
        inputEarningsUSD += empUSD; inputEarningsZIG += empZIG;
        if (tc.affectsNssa === false) { inputNssaExcludedUSD += empUSD; inputNssaExcludedZIG += empZIG; }
        if (tc.affectsPaye === false || tc.taxable === false) { inputPayeExcludedUSD += empUSD; inputPayeExcludedZIG += empZIG; }
        if (deemedExempt) { inputPayeExcludedUSD += empUSD * deemedExempt; inputPayeExcludedZIG += empZIG * deemedExempt; }
      } else if (isPreTax) {
        inputPensionUSD += empUSD; inputPensionZIG += empZIG;
      } else if (isMedAid) {
        inputMedicalAidUSD += empUSD; inputMedicalAidZIG += empZIG;
      } else {
        inputDeductionsUSD += empUSD; inputDeductionsZIG += empZIG;
      }
    } else {
      const amt = toRunCcy(empUSD, empZIG);
      if (isEarning) {
        inputEarnings += amt;
        if (tc.affectsNssa === false) inputNssaExcluded += amt;
        if (tc.affectsPaye === false || tc.taxable === false) inputPayeExcluded += amt;
        if (deemedExempt) inputPayeExcluded += amt * deemedExempt;
      } else if (isPreTax) {
        inputPension += amt;
      } else if (isMedAid) {
        inputMedicalAid += amt;
      } else {
        inputDeductions += amt;
      }
    }
  };

  for (const i of empInputs) accumulateInput(i.transactionCode, i.employeeUSD || 0, i.employeeZiG || 0);
  for (const sd of empDefaults) {
    const empUSD = sd.currency === 'USD' ? sd.value : 0;
    const empZIG = sd.currency === 'ZiG' ? sd.value : 0;
    accumulateInput(sd.transactionCode, empUSD, empZIG);
  }

  // ---- Base rate adjustments ----
  let effectiveBaseRate = emp.baseRate;
  if (unpaidLeave) {
    const unpaidDays = unpaidLeave.totalDays || 0;
    const wDays = emp.daysPerPeriod || workingDaysPerPeriodDefault || 22;
    effectiveBaseRate = unpaidDays >= wDays ? 0 : emp.baseRate * (1 - unpaidDays / wDays);
  }
  if (emp.dischargeDate && effectiveBaseRate > 0) {
    const dDate = new Date(emp.dischargeDate);
    if (dDate >= run.startDate && dDate <= run.endDate) {
      const workedDays = Math.ceil((dDate.getTime() - run.startDate.getTime()) / 86400000) + 1;
      const periodDays = Math.ceil((run.endDate.getTime() - run.startDate.getTime()) / 86400000) + 1;
      effectiveBaseRate *= Math.min(1, workedDays / periodDays);
    } else if (dDate < run.startDate) {
      effectiveBaseRate = 0;
    }
  }

  let baseRate = effectiveBaseRate;
  if (effectiveBaseRate > 0 && emp.currency && emp.currency !== run.currency && run.exchangeRate !== 1 && !run.dualCurrency) {
    if (run.currency === 'ZiG' && emp.currency === 'USD') baseRate = round2(effectiveBaseRate * run.exchangeRate);
    else if (run.currency === 'USD' && emp.currency === 'ZiG') baseRate = round2(effectiveBaseRate / run.exchangeRate);
  }

  let necLevy = 0, necEmployer = 0;
  if (emp.rateSource === 'NEC_GRADE' && emp.necGrade) {
    if (baseRate < emp.necGrade.minRate) baseRate = emp.necGrade.minRate;
    necLevy = baseRate * (emp.necGrade.necLevyRate || 0);
    necEmployer = necLevy;
  }

  // ---- Elderly / 65+ adjustments ----
  let elderlyCredit = 0, elderlyCreditUSD_val = 0, elderlyCreditZIG_val = 0;
  let effectiveNssaEmpRate = nssaEmployeeRate;
  let effectiveNssaEmprRate = nssaEmployerRate;

  if (emp.dateOfBirth) {
    const dob = new Date(emp.dateOfBirth);
    const runStart = new Date(run.startDate);
    const age = runStart.getFullYear() - dob.getFullYear();
    const birthdayThisYear = new Date(runStart.getFullYear(), dob.getMonth(), dob.getDate());
    if (age > 65 || (age === 65 && runStart >= birthdayThisYear)) {
      elderlyCredit = run.currency === 'ZiG' ? elderlyCreditZIG : elderlyCreditUSD;
      elderlyCreditUSD_val = elderlyCreditUSD;
      elderlyCreditZIG_val = elderlyCreditZIG;
      effectiveNssaEmpRate = 0;
      effectiveNssaEmprRate = 0;
    }
  }

  // ---- Bonus / severance remaining exemptions ----
  const remBonusExUSD = Math.max(0, bonusExemptionUSD - ytd.cumExemptBonusUSD);
  const remBonusExZIG = Math.max(0, bonusExemptionZIG - ytd.cumExemptBonusZIG);
  const remBonusEx = run.currency === 'ZiG' ? remBonusExZIG : remBonusExUSD;

  const remSevExUSD = Math.max(0, severanceExemptionUSD - (ytd.cumExemptSeveranceUSD || ytd.cumExemptSeverance));
  const remSevExZIG = Math.max(0, severanceExemptionZIG - (ytd.cumExemptSeveranceZIG || ytd.cumExemptSeverance));
  const remSevEx = run.currency === 'ZiG' ? remSevExZIG : remSevExUSD;

  // ---- FDS average basis ----
  let fdsAvgPAYEBasis: number | null = null;
  if (emp.taxMethod === 'FDS_AVERAGE') {
    const provisionalBaseZIG = (run.dualCurrency && emp.splitZigMode === 'FIXED' && (emp.splitZigValue || 0) > 0)
      ? (emp.splitZigValue || 0) : 0;
    const currGross = round2(run.dualCurrency
      ? baseRate + inputEarningsUSD + (inputEarningsZIG / xr) + (provisionalBaseZIG / xr)
      : baseRate + inputEarnings);
    fdsAvgPAYEBasis = round2((ytd.cumGross + currGross) / (ytd.uniqueMonths.size + 1));
  }

  // ---- Tax directive ----
  const runStart = new Date(run.startDate);
  const directiveActive =
    (!emp.taxDirectiveEffective || new Date(emp.taxDirectiveEffective) <= runStart) &&
    (!emp.taxDirectiveExpiry || new Date(emp.taxDirectiveExpiry) >= runStart);
  const effectiveTaxDirectivePerc = directiveActive ? (emp.taxDirectivePerc || 0) : 0;
  const effectiveTaxDirectiveAmt = directiveActive ? (emp.taxDirectiveAmt || 0) : 0;

  // ---- Gross-up ----
  const effectiveBaseSalary = emp.grossingUp
    ? (() => {
        const isZIG = run.currency === 'ZiG';
        const pensionContribution = (adj.pensionContribution || 0) + (isZIG ? inputPensionZIG : inputPensionUSD || inputPension);
        const pensionCap = isZIG ? monthlyPensionCapZIG : monthlyPensionCapUSD;
        const cappedPension = pensionCap != null ? Math.min(pensionContribution, pensionCap) : pensionContribution;
        const medForGrossUp = isZIG ? 0
          : ((adj.medicalAid || 0) + (inputMedicalAidUSD || inputMedicalAid || 0) + (run.dualCurrency ? (inputMedicalAidZIG || 0) / xr : 0));
        const grossUpTargetNet = baseRate + cappedPension + medForGrossUp;
        const solved = grossUpNet({
          targetNet: grossUpTargetNet,
          currency: isZIG ? 'ZiG' : 'USD',
          taxBrackets: isZIG ? run.taxBracketsZIG : run.taxBracketsUSD,
          annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : (isZIG ? run.annualBracketsZIG : run.annualBracketsUSD),
          nssaCeiling: isZIG ? nssaCeilingZIG : nssaCeilingUSD,
          pensionContribution, pensionCap,
          medicalAid: medForGrossUp,
          taxCredits: elderlyCredit > 0 ? elderlyCredit : (emp.taxCredits || 0),
          nssaEmployeeRate, nssaEmployerRate,
        } as any);
        return solved ? solved.grossSalary : baseRate;
      })()
    : baseRate;

  // ---- Tax calculation ----
  let taxResult: any, taxResultUSD: any, taxResultZIG: any;

  if (run.dualCurrency) {
    let baseUSD = 0, baseZIG = 0;
    const totalBasicUSD = emp.currency === 'USD' ? effectiveBaseSalary : effectiveBaseSalary / xr;
    if (emp.splitZigMode === 'PERCENTAGE' && (emp.splitZigValue || 0) > 0) {
      const splitPerc = Math.min(100, Math.max(0, emp.splitZigValue || 0));
      baseUSD = totalBasicUSD * (1 - splitPerc / 100);
      baseZIG = totalBasicUSD * (splitPerc / 100) * xr;
    } else if (emp.splitZigMode === 'FIXED' && (emp.splitZigValue || 0) > 0) {
      baseZIG = emp.splitZigValue || 0;
      baseUSD = totalBasicUSD;
    } else {
      if (emp.currency === 'ZiG') { baseZIG = effectiveBaseSalary; }
      else { baseUSD = effectiveBaseSalary; }
    }

    const resolvedMV = resolveVehicleBenefit(emp, run.currency);
    const mvBenefitUSD = emp.currency !== 'ZiG' ? resolvedMV : 0;
    const mvBenefitZIG = emp.currency === 'ZiG' ? resolvedMV : 0;

    const splitResult = calculateSplitSalaryPaye({
      usdParams: {
        baseSalary: baseUSD, taxableBenefits: adj.taxableBenefits || 0,
        motorVehicleBenefit: mvBenefitUSD, overtimeAmount: (adj.overtimeAmount || 0) + inputEarningsUSD,
        bonus: adj.bonus || 0, bonusExemption: remBonusExUSD,
        severanceAmount: adj.severanceAmount || 0, severanceExemption: remSevExUSD,
        pensionContribution: (adj.pensionContribution || 0) + inputPensionUSD, pensionCap: monthlyPensionCapUSD,
        medicalAid: (adj.medicalAid || 0) + inputMedicalAidUSD,
        taxCredits: elderlyCreditUSD_val > 0 ? elderlyCreditUSD_val : (emp.taxCredits || 0),
        nssaCeiling: nssaCeilingUSD, nssaExcludedEarnings: inputNssaExcludedUSD,
        payeExcludedEarnings: inputPayeExcludedUSD, loanBenefit: totalLoanBenefitUSD,
        fdsAveragePAYEBasis: fdsAvgPAYEBasis,
      },
      zigParams: {
        baseSalary: baseZIG, taxableBenefits: 0, motorVehicleBenefit: mvBenefitZIG,
        overtimeAmount: inputEarningsZIG, bonus: 0, bonusExemption: remBonusExZIG,
        severanceAmount: 0, severanceExemption: remSevExZIG,
        pensionContribution: inputPensionZIG, pensionCap: monthlyPensionCapZIG,
        medicalAid: inputMedicalAidZIG,
        taxCredits: elderlyCreditZIG_val > 0 ? elderlyCreditZIG_val : (emp.taxCredits || 0),
        nssaCeiling: nssaCeilingZIG, nssaExcludedEarnings: inputNssaExcludedZIG,
        payeExcludedEarnings: inputPayeExcludedZIG, loanBenefit: totalLoanBenefitZIG,
        fdsAveragePAYEBasis: null,
      },
      exchangeRate: xr, taxBracketsUSD: run.taxBracketsUSD,
      annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : run.annualBracketsUSD,
      wcifRate, sdfRate, zimdefRate, aidsLevyRate, medicalAidCreditRate,
      nssaEmployeeRate: effectiveNssaEmpRate, nssaEmployerRate: effectiveNssaEmprRate,
      taxDirectivePerc: effectiveTaxDirectivePerc, taxDirectiveAmt: effectiveTaxDirectiveAmt,
    });
    taxResultUSD = splitResult.usd;
    taxResultZIG = splitResult.zig;
    taxResult = splitResult.totalResult;
  } else {
    taxResult = calculatePaye({
      baseSalary: effectiveBaseSalary, currency: run.currency,
      taxableBenefits: adj.taxableBenefits || 0,
      motorVehicleBenefit: resolveVehicleBenefit(emp, run.currency),
      overtimeAmount: (adj.overtimeAmount || 0) + inputEarnings,
      bonus: adj.bonus || 0, bonusExemption: remBonusEx,
      severanceAmount: adj.severanceAmount || 0, severanceExemption: remSevEx,
      pensionContribution: (adj.pensionContribution || 0) + inputPension,
      pensionCap: run.currency === 'ZiG' ? monthlyPensionCapZIG : monthlyPensionCapUSD,
      medicalAid: (adj.medicalAid || 0) + inputMedicalAid,
      taxCredits: elderlyCredit > 0 ? elderlyCredit : (emp.taxCredits || 0),
      wcifRate, sdfRate, taxBrackets, annualBrackets: emp.taxMethod === 'FDS_FORECASTING' ? true : annualBrackets,
      nssaCeiling, nssaEmployeeRate: effectiveNssaEmpRate, nssaEmployerRate: effectiveNssaEmprRate,
      nssaExcludedEarnings: inputNssaExcluded, payeExcludedEarnings: inputPayeExcluded,
      taxDirectivePerc: effectiveTaxDirectivePerc, taxDirectiveAmt: effectiveTaxDirectiveAmt,
      aidsLevyRate, medicalAidCreditRate, loanBenefit: totalLoanBenefit,
      fdsAveragePAYEBasis: fdsAvgPAYEBasis, zimdefRate,
    });
  }

  // ---- Loan deductions from net ----
  let netPayAfterLoans: number, netPayUSD: number | null, netPayZIG: number | null;
  let loanDeductions = 0;
  const appliedRepaymentIds: string[] = [];
  const dualFields: Record<string, number> = {};

  if (run.dualCurrency) {
    let availableUSD = Math.max(0, taxResultUSD.netSalary - inputDeductionsUSD);
    for (const rep of empRepayments) {
      if (rep.amount > availableUSD + 0.001) continue;
      appliedRepaymentIds.push(rep.id);
      loanDeductions += rep.amount;
      availableUSD -= rep.amount;
    }
    const netUSD = Math.max(0, taxResultUSD.netSalary - loanDeductions - inputDeductionsUSD);
    const netZIG = Math.max(0, taxResultZIG.netSalary - inputDeductionsZIG);
    netPayAfterLoans = netUSD;
    netPayUSD = netUSD;
    netPayZIG = netZIG;
    Object.assign(dualFields, {
      grossUSD: taxResultUSD.gross, grossZIG: taxResultZIG.gross,
      payeUSD: taxResultUSD.paye, payeZIG: taxResultZIG.paye,
      aidsLevyUSD: taxResultUSD.aidsLevy, aidsLevyZIG: taxResultZIG.aidsLevy,
      nssaUSD: taxResultUSD.nssaEmployee, nssaZIG: taxResultZIG.nssaEmployee,
    });
  } else {
    let availableNet = Math.max(0, taxResult.netSalary - inputDeductions);
    for (const rep of empRepayments) {
      if (rep.amount > availableNet + 0.001) continue;
      appliedRepaymentIds.push(rep.id);
      loanDeductions += rep.amount;
      availableNet -= rep.amount;
    }
    netPayAfterLoans = Math.max(0, taxResult.netSalary - loanDeductions - inputDeductions);
    netPayUSD = null;
    netPayZIG = null;
    const splitPct = emp.splitUsdPercent;
    if (splitPct && splitPct > 0 && splitPct < 100 && run.exchangeRate && run.exchangeRate !== 1) {
      const usdShare = splitPct / 100;
      if (run.currency === 'USD') {
        netPayUSD = round2(netPayAfterLoans * usdShare);
        netPayZIG = round2(netPayAfterLoans * (1 - usdShare) * run.exchangeRate);
      } else {
        netPayZIG = round2(netPayAfterLoans * (1 - usdShare));
        netPayUSD = round2((netPayAfterLoans * usdShare) / run.exchangeRate);
      }
    }
  }

  // ---- Build payslip ----
  const payslip: PayslipData = {
    employeeId: emp.id,
    payrollRunId: run.id,
    gross: taxResult.grossSalary,
    paye: taxResult.payeBeforeLevy,
    aidsLevy: taxResult.aidsLevy,
    nssaEmployee: taxResult.nssaEmployee,
    nssaEmployer: taxResult.nssaEmployer,
    nssaBasis: taxResult.nssaBasis,
    pensionApplied: taxResult.pensionApplied,
    basicSalaryApplied: run.dualCurrency
      ? Math.max(baseRate > 0 ? 0.01 : 0, round2(emp.currency === 'USD' ? baseRate : baseRate / xr))
      : round2(baseRate),
    wcifEmployer: taxResult.wcifEmployer,
    sdfContribution: taxResult.sdfContribution,
    zimdefEmployer: taxResult.zimdefEmployer,
    necLevy, necEmployer, loanDeductions,
    netPay: netPayAfterLoans,
    netPayUSD, netPayZIG,
    exchangeRate: (run.dualCurrency || run.currency === 'ZiG') ? (run.exchangeRate || null) : null,
    ...dualFields,
    exemptBonus: taxResult.exemptBonus,
    exemptBonusUSD: run.dualCurrency ? (taxResultUSD?.exemptBonus ?? null) : null,
    exemptBonusZIG: run.dualCurrency ? (taxResultZIG?.exemptBonus ?? null) : null,
    exemptSeverance: taxResult.exemptSeverance,
    exemptSeveranceUSD: run.dualCurrency ? (taxResultUSD?.exemptSeverance ?? null) : (run.currency === 'USD' ? taxResult.exemptSeverance : null),
    exemptSeveranceZIG: run.dualCurrency ? (taxResultZIG?.exemptSeverance ?? null) : (run.currency === 'ZiG' ? taxResult.exemptSeverance : null),
    medicalAidCredit: taxResult.medicalAidCredit,
    taxCreditsApplied: taxResult.taxCreditsApplied,
  };

  // ---- Build payroll transactions ----
  const transactions: PayrollTx[] = [];

  const pushTx = (transactionCodeId: string, empUSD: number, empZIG: number, description: string | null) => {
    if (run.dualCurrency) {
      if (empUSD !== 0) transactions.push({ employeeId: emp.id, payrollRunId: run.id, transactionCodeId, amount: empUSD, currency: 'USD', description });
      if (empZIG !== 0) transactions.push({ employeeId: emp.id, payrollRunId: run.id, transactionCodeId, amount: empZIG, currency: 'ZiG', description });
    } else {
      const amt = toRunCcy(empUSD, empZIG);
      if (amt !== 0) transactions.push({ employeeId: emp.id, payrollRunId: run.id, transactionCodeId, amount: amt, currency: run.currency, description });
    }
  };

  for (const i of empInputs) pushTx(i.transactionCodeId, i.employeeUSD || 0, i.employeeZiG || 0, i.notes);
  for (const sd of empDefaults) {
    const empUSD = sd.currency === 'USD' ? sd.value : 0;
    const empZIG = sd.currency === 'ZiG' ? sd.value : 0;
    pushTx(sd.transactionCodeId, empUSD, empZIG, sd.notes);
  }

  return { payslip, transactions, appliedRepaymentIds };
}
