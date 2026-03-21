/**
 * Client-side PAYE preview calculator.
 * Mirrors taxEngine.js logic for UI estimates.
 */

const STATUTORY_RATES = {
  AIDS_LEVY: 0.03,
  NSSA_EMPLOYEE: 0.045,
  MEDICAL_AID_CREDIT_RATE: 0.50,
};

const USD_TAX_BANDS_2024 = [
  { lower: 0,    upper: 100,      rate: 0,    fixed: 0 },
  { lower: 100,  upper: 300,      rate: 0.20, fixed: 0 },
  { lower: 300,  upper: 1000,     rate: 0.25, fixed: 40 },
  { lower: 1000, upper: 2000,     rate: 0.30, fixed: 215 },
  { lower: 2000, upper: 3000,     rate: 0.35, fixed: 515 },
  { lower: 3000, upper: Infinity, rate: 0.40, fixed: 865 },
];

const ZIG_TAX_BANDS_2024 = [
  { lower: 0,     upper: 2800,     rate: 0,    fixed: 0 },
  { lower: 2800,  upper: 8400,     rate: 0.20, fixed: 0 },
  { lower: 8400,  upper: 28000,    rate: 0.25, fixed: 1120 },
  { lower: 28000, upper: 56000,    rate: 0.30, fixed: 6020 },
  { lower: 56000, upper: 84000,    rate: 0.35, fixed: 14420 },
  { lower: 84000, upper: Infinity, rate: 0.40, fixed: 24220 },
];

interface TaxBracket {
  lower: number;
  upper: number;
  rate: number;
  fixed: number;
}

interface PAYEParams {
  baseSalary: number;
  currency?: string;
  taxableBenefits?: number;
  overtimeAmount?: number;
  bonus?: number;
  pensionContribution?: number;
  medicalAid?: number;
  taxCredits?: number;
  taxBrackets?: TaxBracket[];
  nssaCeiling?: number;
}

export interface PAYEResult {
  grossSalary: number;
  taxableIncome: number;
  nssaEmployee: number;
  payeBeforeLevy: number;
  aidsLevy: number;
  totalPaye: number;
  netSalary: number;
  effectiveRate: number;
}

export function calculatePAYE({
  baseSalary,
  currency = 'USD',
  taxableBenefits = 0,
  overtimeAmount = 0,
  bonus = 0,
  pensionContribution = 0,
  medicalAid = 0,
  taxCredits = 0,
  taxBrackets,
  nssaCeiling,
}: PAYEParams): PAYEResult {
  const defaultCeiling = currency === 'ZiG' ? 20000 : 700;
  const ceiling = nssaCeiling ?? defaultCeiling;

  let bands: TaxBracket[];
  if (taxBrackets && taxBrackets.length > 0) {
    bands = taxBrackets;
  } else {
    bands = currency === 'ZiG' ? ZIG_TAX_BANDS_2024 : USD_TAX_BANDS_2024;
  }

  const cashEarnings = baseSalary + overtimeAmount + bonus;
  const grossForTax = cashEarnings + taxableBenefits;
  const nssaBasis = Math.min(cashEarnings, ceiling);
  const nssaEmployee = nssaBasis * STATUTORY_RATES.NSSA_EMPLOYEE;
  const taxableIncome = Math.max(0, grossForTax - nssaEmployee - pensionContribution);

  let payeBeforeLevy = 0;
  for (const band of bands) {
    if (taxableIncome > band.lower) {
      const taxableInThisBand = Math.min(taxableIncome, band.upper) - band.lower;
      payeBeforeLevy = band.fixed + taxableInThisBand * band.rate;
      if (taxableIncome <= band.upper) break;
    }
  }

  const aidsLevy = payeBeforeLevy * STATUTORY_RATES.AIDS_LEVY;
  const medicalAidCredit = medicalAid * STATUTORY_RATES.MEDICAL_AID_CREDIT_RATE;
  const totalPaye = Math.max(0, payeBeforeLevy + aidsLevy - medicalAidCredit - taxCredits);
  const netSalary = cashEarnings - nssaEmployee - pensionContribution - medicalAid - totalPaye;

  return {
    grossSalary: cashEarnings,
    taxableIncome,
    nssaEmployee,
    payeBeforeLevy,
    aidsLevy,
    totalPaye,
    netSalary,
    effectiveRate: cashEarnings > 0 ? (totalPaye / cashEarnings) * 100 : 0,
  };
}
