const r2 = (n: number) => Math.round((n + 1e-10) * 100) / 100;

const STATUTORY_RATES = {
  AIDS_LEVY: 0.03,
  NSSA_EMPLOYEE: 0.045,
  NSSA_EMPLOYER: 0.045,
  MEDICAL_AID_CREDIT_RATE: 0.50,
};

interface TaxBracket {
  lowerBound: number;
  upperBound: number | null;
  rate: number;
  fixedAmount?: number;
}

interface Band {
  lower: number;
  upper: number;
  rate: number;
  fixed: number;
}

interface CalculatePayeParams {
  baseSalary: number;
  currency: string;
  taxableBenefits?: number;
  motorVehicleBenefit?: number;
  overtimeAmount?: number;
  bonus?: number;
  bonusExemption?: number;
  severanceAmount?: number;
  severanceExemption?: number;
  pensionContribution?: number;
  pensionCap?: number | null;
  medicalAid?: number;
  taxCredits?: number;
  wcifRate?: number;
  sdfRate?: number;
  taxBrackets?: TaxBracket[] | null;
  annualBrackets?: boolean;
  nssaCeiling?: number | null;
  nssaEmployeeRate?: number;
  nssaEmployerRate?: number;
  nssaExcludedEarnings?: number;
  payeExcludedEarnings?: number;
  taxDirectivePerc?: number;
  taxDirectiveAmt?: number;
  aidsLevyRate?: number;
  medicalAidCreditRate?: number;
  loanBenefit?: number;
  fdsAveragePAYEBasis?: number | null;
  zimdefRate?: number;
}

interface PayeResult {
  grossSalary: number;
  taxableBenefits: number;
  exemptBonus: number;
  exemptSeverance: number;
  pensionApplied: number;
  nssaBasis: number;
  nssaEmployee: number;
  nssaEmployer: number;
  wcifEmployer: number;
  zimdefEmployer: number;
  sdfContribution: number;
  taxableIncome: number;
  payeBeforeLevy: number;
  medicalAidCredit: number;
  aidsLevy: number;
  taxCreditsApplied: number;
  totalPaye: number;
  netSalary: number;
}

const normaliseBrackets = (brackets: TaxBracket[]): Band[] =>
  brackets
    .sort((a, b) => a.lowerBound - b.lowerBound)
    .map((b) => ({
      lower: b.lowerBound,
      upper: b.upperBound ?? Infinity,
      rate: b.rate,
      fixed: b.fixedAmount ?? 0,
    }));

function calculatePaye(params: CalculatePayeParams): PayeResult {
  const {
    baseSalary,
    currency,
    taxableBenefits = 0,
    motorVehicleBenefit = 0,
    overtimeAmount = 0,
    bonus = 0,
    bonusExemption = 0,
    severanceAmount = 0,
    severanceExemption = 0,
    pensionContribution = 0,
    pensionCap = null,
    medicalAid = 0,
    taxCredits = 0,
    wcifRate = 0,
    sdfRate = 0,
    taxBrackets = null,
    annualBrackets = false,
    nssaCeiling = null,
    nssaEmployeeRate = STATUTORY_RATES.NSSA_EMPLOYEE,
    nssaEmployerRate = STATUTORY_RATES.NSSA_EMPLOYER,
    nssaExcludedEarnings = 0,
    payeExcludedEarnings = 0,
    taxDirectivePerc = 0,
    taxDirectiveAmt = 0,
    aidsLevyRate = STATUTORY_RATES.AIDS_LEVY,
    medicalAidCreditRate = STATUTORY_RATES.MEDICAL_AID_CREDIT_RATE,
    loanBenefit = 0,
    fdsAveragePAYEBasis = null,
    zimdefRate = 0.01,
   } = params;

  if (aidsLevyRate === STATUTORY_RATES.AIDS_LEVY) {
    console.warn(`[taxEngine] Using default aidsLevyRate (${STATUTORY_RATES.AIDS_LEVY}). Callers should pass aidsLevyRate from SystemSettings.`);
  }
  if (nssaEmployeeRate === STATUTORY_RATES.NSSA_EMPLOYEE) {
    console.warn(`[taxEngine] Using default nssaEmployeeRate (${STATUTORY_RATES.NSSA_EMPLOYEE}). Callers should pass nssaEmployeeRate from SystemSettings.`);
  }
  if (nssaEmployerRate === STATUTORY_RATES.NSSA_EMPLOYER) {
    console.warn(`[taxEngine] Using default nssaEmployerRate (${STATUTORY_RATES.NSSA_EMPLOYER}). Callers should pass nssaEmployerRate from SystemSettings.`);
  }
  if (medicalAidCreditRate === STATUTORY_RATES.MEDICAL_AID_CREDIT_RATE) {
    console.warn(`[taxEngine] Using default medicalAidCreditRate (${STATUTORY_RATES.MEDICAL_AID_CREDIT_RATE}). Callers should pass medicalAidCreditRate from SystemSettings.`);
  }
  if (zimdefRate === 0.01) {
    console.warn(`[taxEngine] Using default zimdefRate (0.01). Callers should pass zimdefRate from SystemSettings.`);
  }

  if (!taxBrackets || taxBrackets.length === 0) {
    console.warn('[taxEngine] No tax brackets provided — PAYE will be zero. Check tax table configuration.');
  }
  const bands = (taxBrackets && taxBrackets.length > 0) ? normaliseBrackets(taxBrackets) : [];

  const ceiling = nssaCeiling ?? 700;
  if (nssaCeiling === null || nssaCeiling === undefined) {
    console.warn(`[taxEngine] No nssaCeiling provided for ${currency} — falling back to 700. Callers should pass nssaCeiling from SystemSettings.`);
  }

  const effectivePension = pensionCap !== null
    ? Math.min(pensionContribution, pensionCap)
    : pensionContribution;

  const cashEarnings = baseSalary + overtimeAmount + bonus + severanceAmount;

  const zimdefEmployer = (cashEarnings + taxableBenefits) * zimdefRate;

  const exemptBonus = Math.min(bonus, bonusExemption);
  const exemptSeverance = Math.min(severanceAmount, severanceExemption);

  const grossForTax = cashEarnings + taxableBenefits + motorVehicleBenefit + loanBenefit
    - exemptBonus - exemptSeverance - payeExcludedEarnings;

  const nssaBasis = Math.max(0, Math.min(cashEarnings - nssaExcludedEarnings, ceiling));
  const nssaEmployee = r2(nssaBasis * nssaEmployeeRate);
  const nssaEmployer = r2(nssaBasis * nssaEmployerRate);

  const wcifEmployer = cashEarnings * wcifRate;
  const sdfContribution = cashEarnings * sdfRate;

  const taxableIncome = Math.max(0, grossForTax - nssaEmployee - effectivePension);

  const payeBase = fdsAveragePAYEBasis != null
    ? Math.max(0, fdsAveragePAYEBasis - nssaEmployee - effectivePension)
    : taxableIncome;

  const taxBase = annualBrackets ? payeBase * 12 : payeBase;

  let annualPaye = 0;
  for (const band of bands) {
    const offset = Math.max(0, band.lower - 1);
    if (taxBase <= offset) break;
    const taxableInThisBand = Math.min(taxBase, band.upper) - offset;
    annualPaye = r2(annualPaye + r2(taxableInThisBand * band.rate));
  }

  const payeBeforeLevy = annualBrackets ? annualPaye / 12 : annualPaye;
  const medicalAidCredit = medicalAid * medicalAidCreditRate;

  const payeAfterCredits = Math.max(0, payeBeforeLevy - medicalAidCredit - taxCredits);
  const aidsLevy = payeAfterCredits * aidsLevyRate;
  const totalPaye = payeAfterCredits + aidsLevy;

  let finalPayeAfterCredits = payeAfterCredits;
  if (taxDirectivePerc > 0) {
    finalPayeAfterCredits = finalPayeAfterCredits * (1 - Math.min(taxDirectivePerc, 100) / 100);
  }
  if (taxDirectiveAmt > 0) {
    finalPayeAfterCredits = Math.max(0, finalPayeAfterCredits - taxDirectiveAmt);
  }
  const finalAidsLevy = r2(finalPayeAfterCredits * aidsLevyRate);
  const finalTotalPaye = r2(finalPayeAfterCredits + finalAidsLevy);
  const finalPayeNet = r2(finalPayeAfterCredits);

  const totalDeductions = nssaEmployee + effectivePension + medicalAid + finalTotalPaye;
  const netSalary = cashEarnings - totalDeductions;

  return {
    grossSalary: r2(cashEarnings),
    taxableBenefits: r2(taxableBenefits),
    exemptBonus: r2(exemptBonus),
    exemptSeverance: r2(exemptSeverance),
    pensionApplied: r2(effectivePension),
    nssaBasis: r2(nssaBasis),
    nssaEmployee,
    nssaEmployer,
    wcifEmployer: r2(wcifEmployer),
    zimdefEmployer: r2(zimdefEmployer),
    sdfContribution: r2(sdfContribution),
    taxableIncome: r2(taxableIncome),
    payeBeforeLevy: finalPayeNet,
    medicalAidCredit: r2(medicalAidCredit),
    aidsLevy: finalAidsLevy,
    taxCreditsApplied: r2(payeBeforeLevy > 0 ? (medicalAidCredit + taxCredits + (payeAfterCredits - finalPayeAfterCredits)) : (medicalAidCredit + taxCredits)),
    totalPaye: finalTotalPaye,
    netSalary: r2(netSalary),
  };
}

interface GrossUpParams {
  targetNet: number;
  currency?: string;
  maxIterations?: number;
  tolerance?: number;
  [key: string]: any;
}

function grossUpNet({ targetNet, currency = 'USD', maxIterations = 50, tolerance = 0.01, ...payeParams }: GrossUpParams): PayeResult | null {
  let lo = targetNet;
  let hi = targetNet / 0.50;

  let best: PayeResult | null = null;
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const result = calculatePaye({ baseSalary: mid, currency, ...payeParams } as CalculatePayeParams);
    const net = result.netSalary;
    if (Math.abs(net - targetNet) < tolerance) {
      best = result;
      break;
    }
    if (net < targetNet) lo = mid;
    else hi = mid;
    best = result;
  }
  return best;
}

interface SplitSalaryParams {
  usdParams: Record<string, any>;
  zigParams: Record<string, any>;
  exchangeRate: number;
  taxBracketsUSD: TaxBracket[];
  annualBrackets?: boolean;
  [key: string]: any;
}

interface SplitSalaryResult {
  totalResult: PayeResult;
  cashRatio: number;
  payeRatio: number;
  usdRatio: number;
  nssaRatio: number;
  usd: SplitCurrencyResult;
  zig: SplitCurrencyResult;
}

interface SplitCurrencyResult {
  gross: number;
  paye: number;
  aidsLevy: number;
  nssaEmployee: number;
  nssaEmployer: number;
  pensionApplied: number;
  netSalary: number;
  totalPaye: number;
  exemptBonus: number;
  medicalAidCredit: number;
}

function calculateSplitSalaryPaye(params: SplitSalaryParams): SplitSalaryResult {
  const {
    usdParams,
    zigParams,
    exchangeRate,
    taxBracketsUSD,
    annualBrackets,
    ...sharedParams
  } = params;

  const xr = (exchangeRate && exchangeRate > 0) ? exchangeRate : 1;
  const consolidate = (u: number, z: number) => (u || 0) + (z || 0) / xr;
  const hasValue = (value: any) => value !== undefined && value !== null;
  const consolidatedNssaCeiling =
    hasValue(usdParams.nssaCeiling) || hasValue(zigParams.nssaCeiling)
      ? (usdParams.nssaCeiling || 0) + ((zigParams.nssaCeiling || 0) / xr)
      : undefined;

  const consolidated: CalculatePayeParams = {
    ...sharedParams,
    currency: 'USD',
    taxBrackets: taxBracketsUSD,
    annualBrackets,
    baseSalary: consolidate(usdParams.baseSalary, zigParams.baseSalary),
    taxableBenefits: consolidate(usdParams.taxableBenefits, zigParams.taxableBenefits),
    motorVehicleBenefit: consolidate(usdParams.motorVehicleBenefit, zigParams.motorVehicleBenefit),
    overtimeAmount: consolidate(usdParams.overtimeAmount, zigParams.overtimeAmount),
    bonus: consolidate(usdParams.bonus, zigParams.bonus),
    severanceAmount: consolidate(usdParams.severanceAmount, zigParams.severanceAmount),
    pensionContribution: consolidate(usdParams.pensionContribution, zigParams.pensionContribution),
    medicalAid: consolidate(usdParams.medicalAid, zigParams.medicalAid),
    taxCredits: consolidate(usdParams.taxCredits, zigParams.taxCredits),
    nssaExcludedEarnings: consolidate(usdParams.nssaExcludedEarnings, zigParams.nssaExcludedEarnings),
    payeExcludedEarnings: consolidate(usdParams.payeExcludedEarnings, zigParams.payeExcludedEarnings),
    loanBenefit: consolidate(usdParams.loanBenefit, zigParams.loanBenefit),
    fdsAveragePAYEBasis: hasValue(usdParams.fdsAveragePAYEBasis) || hasValue(zigParams.fdsAveragePAYEBasis)
      ? consolidate(usdParams.fdsAveragePAYEBasis, zigParams.fdsAveragePAYEBasis)
      : null,
    bonusExemption: usdParams.bonusExemption || 0,
    severanceExemption: usdParams.severanceExemption || 0,
    nssaCeiling: consolidatedNssaCeiling,
    pensionCap: usdParams.pensionCap,
  };

  const totalResult = calculatePaye(consolidated);

  const cashUSD = (usdParams.baseSalary || 0) + (usdParams.overtimeAmount || 0) + (usdParams.bonus || 0) + (usdParams.severanceAmount || 0);
  const cashZIG = (zigParams.baseSalary || 0) + (zigParams.overtimeAmount || 0) + (zigParams.bonus || 0) + (zigParams.severanceAmount || 0);
  const totalCashUSD = cashUSD + cashZIG / xr;

  const grossForTaxUSD = cashUSD + (usdParams.taxableBenefits || 0) + (usdParams.motorVehicleBenefit || 0) + (usdParams.loanBenefit || 0)
    - Math.min(usdParams.bonus || 0, usdParams.bonusExemption || 0) - Math.min(usdParams.severanceAmount || 0, usdParams.severanceExemption || 0)
    - (usdParams.payeExcludedEarnings || 0);
  const grossForTaxZIG = cashZIG + (zigParams.taxableBenefits || 0) + (zigParams.motorVehicleBenefit || 0) + (zigParams.loanBenefit || 0)
    - Math.min(zigParams.bonus || 0, zigParams.bonusExemption || 0) - Math.min(zigParams.severanceAmount || 0, zigParams.severanceExemption || 0)
    - (zigParams.payeExcludedEarnings || 0);
  const totalGrossForTaxUSD = grossForTaxUSD + grossForTaxZIG / xr;

  const usdNssaCeil = usdParams.nssaCeiling ?? 700;
  const zigNssaCeil = zigParams.nssaCeiling ?? Math.round(700 * xr);
  const nssaBasisUSD = Math.max(0, Math.min(cashUSD - (usdParams.nssaExcludedEarnings || 0), usdNssaCeil));
  const nssaBasisZIG = Math.max(0, Math.min(cashZIG - (zigParams.nssaExcludedEarnings || 0), zigNssaCeil));
  const totalNssaBasisUSD = nssaBasisUSD + nssaBasisZIG / xr;

  const cashRatio = totalCashUSD > 0 ? cashUSD / totalCashUSD : 1;
  const payeRatio = totalGrossForTaxUSD > 0 ? grossForTaxUSD / totalGrossForTaxUSD : 1;
  const nssaRatio = totalNssaBasisUSD > 0 ? nssaBasisUSD / totalNssaBasisUSD : 1;

  const apportionPaye = (val: number) => r2(val * payeRatio);
  const apportionNssa = (val: number) => r2(val * nssaRatio);
  const apportionCash = (val: number) => r2(val * cashRatio);
  const apportionPayeZIG = (val: number) => r2(val * (1 - payeRatio) * xr);
  const apportionNssaZIG = (val: number) => r2(val * (1 - nssaRatio) * xr);
  const apportionCashZIG = (val: number) => r2(val * (1 - cashRatio) * xr);

  const grossUSD = r2(
    (usdParams.baseSalary || 0) + (usdParams.overtimeAmount || 0) +
    (usdParams.bonus || 0) + (usdParams.severanceAmount || 0) +
    (usdParams.taxableBenefits || 0) + (usdParams.motorVehicleBenefit || 0)
  );
  const grossZIG = r2(
    (zigParams.baseSalary || 0) + (zigParams.overtimeAmount || 0) +
    (zigParams.bonus || 0) + (zigParams.severanceAmount || 0) +
    (zigParams.taxableBenefits || 0) + (zigParams.motorVehicleBenefit || 0)
  );

  return {
    totalResult,
    cashRatio,
    payeRatio,
    usdRatio: payeRatio,
    nssaRatio,
    usd: {
      gross: grossUSD,
      paye: apportionPaye(totalResult.payeBeforeLevy),
      aidsLevy: apportionPaye(totalResult.aidsLevy),
      nssaEmployee: apportionNssa(totalResult.nssaEmployee),
      nssaEmployer: apportionNssa(totalResult.nssaEmployer),
      pensionApplied: apportionCash(totalResult.pensionApplied),
      netSalary: apportionCash(totalResult.netSalary),
      totalPaye: apportionPaye(totalResult.totalPaye),
      exemptBonus: apportionCash(totalResult.exemptBonus),
      medicalAidCredit: apportionCash(totalResult.medicalAidCredit),
    },
    zig: {
      gross: grossZIG,
      paye: apportionPayeZIG(totalResult.payeBeforeLevy),
      aidsLevy: apportionPayeZIG(totalResult.aidsLevy),
      nssaEmployee: apportionNssaZIG(totalResult.nssaEmployee),
      nssaEmployer: apportionNssaZIG(totalResult.nssaEmployer),
      pensionApplied: apportionCashZIG(totalResult.pensionApplied),
      netSalary: apportionCashZIG(totalResult.netSalary),
      totalPaye: apportionPayeZIG(totalResult.totalPaye),
      exemptBonus: apportionCashZIG(totalResult.exemptBonus),
      medicalAidCredit: apportionCashZIG(totalResult.medicalAidCredit),
    }
  };
}

export { calculatePaye, calculateSplitSalaryPaye, grossUpNet, STATUTORY_RATES };
export type { PayeResult, SplitSalaryResult, TaxBracket, CalculatePayeParams };
