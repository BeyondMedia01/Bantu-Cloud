/**
 * Client-side PAYE preview calculator.
 * Mirrors taxEngine.js logic for UI estimates.
 */

const STATUTORY_RATES = {
  AIDS_LEVY: 0.03,
  NSSA_EMPLOYEE: 0.045,
  MEDICAL_AID_CREDIT_RATE: 0.50,
};

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
}: PAYEParams): PAYEResult | null {
  const defaultCeiling = currency === 'ZiG' ? 20000 : 700;
  const ceiling = nssaCeiling ?? defaultCeiling;

  if (!taxBrackets || taxBrackets.length === 0) {
    return null;
  }
  const bands: TaxBracket[] = taxBrackets;

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
