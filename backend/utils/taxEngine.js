/**
 * Zimbabwean PAYE Calculation Engine (FDS)
 * Final Deduction System implementation based on ZIMRA guidelines.
 *
 * NSSA rates (nssaEmployeeRate / nssaEmployerRate) are passed in at call-time from
 * SystemSettings so that rate changes take effect without a code deployment.
 * The STATUTORY_RATES constants below serve as fallback defaults only.
 */

const STATUTORY_RATES = {
  AIDS_LEVY: 0.03,
  NSSA_EMPLOYEE: 0.045,
  NSSA_EMPLOYER: 0.045,
  MEDICAL_AID_CREDIT_RATE: 0.50,
};


const DEFAULT_NSSA_CEILING = { USD: 700, ZiG: 20000 };

/**
 * Normalise DB TaxBracket records into the internal band format.
 * DB records: { lowerBound, upperBound, rate, fixedAmount }
 */
const normaliseBrackets = (brackets) =>
  brackets
    .sort((a, b) => a.lowerBound - b.lowerBound)
    .map((b) => ({
      lower: b.lowerBound,
      upper: b.upperBound ?? Infinity,
      rate: b.rate,
      fixed: b.fixedAmount ?? 0,
    }));

/**
 * Calculates PAYE for a given monthly gross salary.
 *
 * @param {Object} params
 * @param {number}   params.baseSalary
 * @param {string}   params.currency              "USD" | "ZiG"
 * @param {number}   [params.taxableBenefits]      Other non-cash benefits (e.g. housing)
 * @param {number}   [params.motorVehicleBenefit]  Monthly deemed value (ZIMRA annual ÷ 12) — added to taxable
 *                                                  income per ZIMRA FDS; excluded from NSSA basis.
 * @param {number}   [params.overtimeAmount]
 * @param {number}   [params.bonus]
 * @param {number}   [params.bonusExemption]       Tax-free bonus threshold per ZIMRA. Exempt portion excluded from
 *                                                  PAYE but NSSA is still calculated on full cash earnings.
 * @param {number}   [params.severanceAmount]      Retrenchment / severance pay — included in cash earnings; the
 *                                                  exempt portion (up to severanceExemption) is excluded from PAYE.
 * @param {number}   [params.severanceExemption]   ZIMRA-prescribed tax-free threshold for retrenchment packages.
 * @param {number}   [params.pensionContribution]
 * @param {number|null} [params.pensionCap]        Maximum allowable pension deduction before PAYE (ZIMRA-prescribed).
 *                                                  null = no cap (default).
 * @param {number}   [params.medicalAid]
 * @param {number}   [params.taxCredits]
 * @param {number}   [params.wcifRate]             Workers Compensation Insurance Fund rate — employer-only, per
 *                                                  industry classification; does NOT reduce employee net pay.
 * @param {number}   [params.sdfRate]              Standard Development Fund / Manpower Training Levy rate —
 *                                                  employer-only (typically 1%); does NOT reduce employee net pay.
 * @param {Array}    [params.taxBrackets]          DB TaxBracket[] — overrides built-in bands when provided
 * @param {boolean}  [params.annualBrackets]        true when DB brackets are annual (FDS). Monthly income is
 *                                                  annualised (×12), tax computed against annual bands, result
 *                                                  divided by 12. Hardcoded fallback bands are already monthly.
 * @param {number}   [params.nssaCeiling]          Override NSSA ceiling from DB/SystemSettings
 * @param {number}   [params.nssaEmployeeRate]     Employee NSSA contribution rate. Passed from SystemSettings
 *                                                  (NSSA_EMPLOYEE_RATE). Defaults to 4.5% fallback.
 * @param {number}   [params.nssaEmployerRate]     Employer NSSA contribution rate. Passed from SystemSettings
 *                                                  (NSSA_EMPLOYER_RATE). Defaults to 4.5% fallback.
 * @param {number}   [params.nssaExcludedEarnings] Earnings from transaction codes marked affectsNssa=false.
 *                                                  Excluded from NSSA basis but remain in cash earnings for
 *                                                  net-pay and PAYE purposes.
 * @param {number}   [params.payeExcludedEarnings] Earnings from transaction codes marked affectsPaye=false.
 *                                                  Excluded from grossForTax but still present in cash earnings
 *                                                  and subject to NSSA unless also nssaExcluded.
 * @param {number}   [params.taxDirectivePerc]     ZIMRA tax directive — percentage reduction applied to the
 *                                                  computed PAYE+AIDS levy total (e.g. 10 = reduce PAYE by 10%).
 *                                                  Applied AFTER credits. Floored at 0.
 * @param {number}   [params.taxDirectiveAmt]      ZIMRA tax directive — fixed monthly PAYE reduction (in
 *                                                  currency units). Applied AFTER the percentage directive.
 *                                                  Floored at 0.
 * @param {number|null} [params.fdsAveragePAYEBasis]  Pre-computed average monthly gross for FDS_AVERAGE employees.
 *                                                  When provided, the PAYE tax bands are applied to this
 *                                                  averaged income rather than the current month's actual gross.
 *                                                  NSSA, pension, and net pay remain on actual current earnings.
 */
function calculatePaye({
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
  }) {
    // Resolve tax bands from DB brackets — no active tax table means zero PAYE
    const bands = (taxBrackets && taxBrackets.length > 0) ? normaliseBrackets(taxBrackets) : [];
  
    const ceiling = nssaCeiling ?? DEFAULT_NSSA_CEILING[currency] ?? 700;
  
    // Apply pension cap: ZIMRA allows pension deductions only up to a prescribed limit.
    const effectivePension = pensionCap !== null
      ? Math.min(pensionContribution, pensionCap)
      : pensionContribution;
  
    // Full cash earnings — all cash components, including full severance and bonus.
    // NSSA is applied to the full amount (capped at ceiling) per ZIMRA guidance.
    const cashEarnings = baseSalary + overtimeAmount + bonus + severanceAmount;
  
    // ZIMDEF: 1% of the gross wage bill (employer-only). 
    // Usually calculated on cashEarnings + benefits.
    const zimdefEmployer = (cashEarnings + taxableBenefits) * zimdefRate;
  
    // Exempt portions reduce the PAYE base but NOT the NSSA base.
  const exemptBonus     = Math.min(bonus, bonusExemption);
  const exemptSeverance = Math.min(severanceAmount, severanceExemption);

  // Motor vehicle benefit: deemed fringe benefit — taxable but excluded from NSSA.
  // loanBenefit: deemed interest on low-interest loans — taxable, excluded from NSSA.
  // payeExcludedEarnings: amounts from codes with affectsPaye=false (e.g. reimbursements).
  const grossForTax = cashEarnings + taxableBenefits + motorVehicleBenefit + loanBenefit
                      - exemptBonus - exemptSeverance - payeExcludedEarnings;

  // nssaExcludedEarnings: amounts from codes with affectsNssa=false (e.g. non-pensionable allowances).
  const nssaBasis    = Math.max(0, Math.min(cashEarnings - nssaExcludedEarnings, ceiling));
  const nssaEmployee = nssaBasis * nssaEmployeeRate;
  const nssaEmployer = nssaBasis * nssaEmployerRate;

  // Employer-only statutory contributions — do NOT reduce employee net pay.
  const wcifEmployer    = cashEarnings * wcifRate;
  const sdfContribution = cashEarnings * sdfRate;

  const taxableIncome = Math.max(0, grossForTax - nssaEmployee - effectivePension);

  // FDS_AVERAGE: caller supplies an average monthly gross for PAYE band computation.
  // This smooths deductions for employees with irregular earnings (bonus, commission).
  // NSSA, pension and net pay are always computed on actual current-month earnings.
  const payeBase = fdsAveragePAYEBasis != null
    ? Math.max(0, fdsAveragePAYEBasis - nssaEmployee - effectivePension)
    : taxableIncome;

  // FDS: annualise monthly taxable income, apply annual brackets, then divide by 12
  const taxBase = annualBrackets ? payeBase * 12 : payeBase;

  // NOTE: band.fixed (fixedAmount) is intentionally NOT added here.
  // ZIMRA tax tables print a pre-accumulated "cumulative tax to lower bound" as a
  // look-up shortcut, e.g. the $1,201 band shows fixed=$240 so an operator can
  // quickly compute: tax = $240 + (income − $1,200) × 20%.
  // This marginal accumulator re-derives those exact cumulative amounts band-by-band
  // and produces identical results without ever reading band.fixed.
  let annualPaye = 0;
  for (const band of bands) {
    if (taxBase <= band.lower) break;
    const taxableInThisBand = Math.min(taxBase, band.upper) - band.lower;
    annualPaye += taxableInThisBand * band.rate;
  }

  const payeBeforeLevy = annualBrackets ? annualPaye / 12 : annualPaye;

  const aidsLevyGross    = payeBeforeLevy * aidsLevyRate;
  const medicalAidCredit = medicalAid * medicalAidCreditRate;

  // Combined pre-credit tax (PAYE + AIDS levy)
  const combinedPreCredit = payeBeforeLevy + aidsLevyGross;

  // Apply credits to the combined tax, then apply any ZIMRA directives as reductions
  let totalPaye = Math.max(0, combinedPreCredit - medicalAidCredit - taxCredits);

  // Tax directive — REDUCTION mode (per ZIMRA directive instruments):
  //   taxDirectivePerc: percentage reduction of the post-credit PAYE total (e.g. 10 = −10%)
  //   taxDirectiveAmt:  fixed monthly reduction of the post-credit PAYE total
  if (taxDirectivePerc > 0) {
    totalPaye = totalPaye * (1 - Math.min(taxDirectivePerc, 100) / 100);
  }
  if (taxDirectiveAmt > 0) {
    totalPaye = Math.max(0, totalPaye - taxDirectiveAmt);
  }

  // Proportionally split totalPaye back into core PAYE and AIDS levy for payslip reporting.
  // This ensures aidsLevy shown on the payslip accurately reflects the actual deduction after
  // credits and directives (preventing a non-zero AIDS levy display when totalPaye = 0).
  const aidsLevy = combinedPreCredit > 0
    ? totalPaye * (aidsLevyGross / combinedPreCredit)
    : 0;
  const payeNet  = totalPaye - aidsLevy;

  const totalDeductions = nssaEmployee + effectivePension + medicalAid + totalPaye;
  const netSalary       = cashEarnings - totalDeductions;

  return {
    grossSalary: cashEarnings,
    taxableBenefits,
    exemptBonus,
    exemptSeverance,
    pensionApplied: effectivePension,
    nssaBasis,
    nssaEmployee,
    nssaEmployer,
    wcifEmployer,
    zimdefEmployer,
    sdfContribution,
    taxableIncome,
    payeBeforeLevy: payeNet,
    medicalAidCredit,
    aidsLevy,
    taxCreditsApplied: combinedPreCredit > 0 ? (combinedPreCredit - totalPaye) : (medicalAidCredit + taxCredits),
    totalPaye,
    netSalary,
  };
}

module.exports = { calculatePaye, STATUTORY_RATES };
