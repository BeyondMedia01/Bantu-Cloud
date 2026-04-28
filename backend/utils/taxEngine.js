/**
 * Zimbabwean PAYE Calculation Engine (FDS)
 * Final Deduction System implementation based on ZIMRA guidelines.
 *
 * NSSA rates (nssaEmployeeRate / nssaEmployerRate) are passed in at call-time from
 * SystemSettings so that rate changes take effect without a code deployment.
 * The STATUTORY_RATES constants below serve as fallback defaults only.
 */

/** Round to 2 decimal places — Number.EPSILON prevents 1.005→1.00 float drift */
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

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
    if (!taxBrackets || taxBrackets.length === 0) {
      console.warn('[taxEngine] No tax brackets provided — PAYE will be zero. Check tax table configuration.');
    }
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
    if (taxBase <= (band.lower - 1)) break;
    const taxableInThisBand = Math.min(taxBase, band.upper) - (band.lower - 1);
    annualPaye += taxableInThisBand * band.rate;
  }

  const payeBeforeLevy = annualBrackets ? annualPaye / 12 : annualPaye;
  const medicalAidCredit = medicalAid * medicalAidCreditRate;

  // ZIMRA: Tax credits are deducted from the income tax determined BEFORE calculating the AIDS levy.
  // totalPayeNet = (PAYE - Credits) * 3% AIDS Levy
  const payeAfterCredits = Math.max(0, payeBeforeLevy - medicalAidCredit - taxCredits);
  const aidsLevy = payeAfterCredits * aidsLevyRate;
  const totalPaye = payeAfterCredits + aidsLevy;

  // Tax directive — REDUCTION mode (per ZIMRA directive instruments):
  //   taxDirectivePerc: percentage reduction of the post-credit PAYE total (e.g. 10 = −10%)
  //   taxDirectiveAmt:  fixed monthly reduction of the post-credit PAYE total
  let finalTotalPaye = totalPaye;
  if (taxDirectivePerc > 0) {
    finalTotalPaye = finalTotalPaye * (1 - Math.min(taxDirectivePerc, 100) / 100);
  }
  if (taxDirectiveAmt > 0) {
    finalTotalPaye = Math.max(0, finalTotalPaye - taxDirectiveAmt);
  }

  // Final split for reporting
  const finalAidsLevy = payeAfterCredits > 0 ? (finalTotalPaye * (aidsLevy / totalPaye)) : 0;
  const finalPayeNet  = finalTotalPaye - finalAidsLevy;

  const totalDeductions = nssaEmployee + effectivePension + medicalAid + finalTotalPaye;
  const netSalary       = cashEarnings - totalDeductions;

  return {
    grossSalary:      r2(cashEarnings),
    taxableBenefits:  r2(taxableBenefits),
    exemptBonus:      r2(exemptBonus),
    exemptSeverance:  r2(exemptSeverance),
    pensionApplied:   r2(effectivePension),
    nssaBasis:        r2(nssaBasis),
    nssaEmployee:     r2(nssaEmployee),
    nssaEmployer:     r2(nssaEmployer),
    wcifEmployer:     r2(wcifEmployer),
    zimdefEmployer:   r2(zimdefEmployer),
    sdfContribution:  r2(sdfContribution),
    taxableIncome:    r2(taxableIncome),
    payeBeforeLevy:   r2(finalPayeNet),
    medicalAidCredit: r2(medicalAidCredit),
    aidsLevy:         r2(finalAidsLevy),
    taxCreditsApplied: r2(payeBeforeLevy > 0 ? (payeBeforeLevy + (payeBeforeLevy * aidsLevyRate) - finalTotalPaye) : (medicalAidCredit + taxCredits)),
    totalPaye:        r2(finalTotalPaye),
    netSalary:        r2(netSalary),
  };
}

/**
 * Gross-up solver: finds the gross salary G such that calculatePaye(G).netSalary ≈ targetNet.
 * Uses binary search — converges to within $0.01 in <50 iterations for any realistic salary.
 *
 * The employer absorbs PAYE only. The employee still pays NSSA, pension, and medicalAid.
 * To compute the correct targetNet, callers should pass:
 *   targetNet = employeeBaseSalary + cappedPension + medicalAid
 * so that the solver finds gross where (gross - NSSA - pension - medAid - PAYE) = that sum,
 * meaning PAYE is the only extra cost absorbed by the employer.
 *
 * Accepts the same params as calculatePaye(), minus baseSalary (which is solved for).
 * Returns the same result object as calculatePaye().
 */
function grossUpNet({ targetNet, currency = 'USD', maxIterations = 50, tolerance = 0.01, ...payeParams }) {
  // Lower bound: targetNet (zero tax scenario)
  // Upper bound: worst-case 40% top rate + 3% AIDS levy → net ≈ gross × 0.57; use 0.50 for safety
  let lo = targetNet;
  let hi = targetNet / 0.50;

  let best = null;
  for (let i = 0; i < maxIterations; i++) {
    const mid = (lo + hi) / 2;
    const result = calculatePaye({ baseSalary: mid, currency, ...payeParams });
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

/**
 * Calculates PAYE for a split salary (USD + ZiG) using the ZIMRA apportionment method.
 * 1. Consolidate: Convert all ZiG income components to USD using the exchange rate.
 * 2. Calculate: Apply the USD tax table to the total USD-denominated gross.
 * 3. Apportion: Split the resulting PAYE, AIDS Levy, and NSSA back into USD and ZiG
 *    portions based on the ratio of the currency components in the original gross.
 *
 * This ensures the employee is taxed correctly according to their total earnings
 * bracket while paying the appropriate amount in each respective currency.
 */
function calculateSplitSalaryPaye({
  usdParams,      // calculatePaye params in USD
  zigParams,      // calculatePaye params in ZiG
  exchangeRate,   // Interbank rate (USD to ZiG)
  taxBracketsUSD, // ZIMRA USD tax table
  annualBrackets,
  ...sharedParams // aidsLevyRate, nssaEmployeeRate, etc.
}) {
  const xr = (exchangeRate && exchangeRate > 0) ? exchangeRate : 1;
  const consolidate = (u, z) => (u || 0) + (z || 0) / xr;

  // consolidate all earnings/deductions into a single USD-denominated parameter set
  const consolidated = {
    ...sharedParams,
    currency: 'USD',
    taxBrackets: taxBracketsUSD,
    annualBrackets,
    baseSalary:          consolidate(usdParams.baseSalary, zigParams.baseSalary),
    taxableBenefits:     consolidate(usdParams.taxableBenefits, zigParams.taxableBenefits),
    motorVehicleBenefit: consolidate(usdParams.motorVehicleBenefit, zigParams.motorVehicleBenefit),
    overtimeAmount:      consolidate(usdParams.overtimeAmount, zigParams.overtimeAmount),
    bonus:               consolidate(usdParams.bonus, zigParams.bonus),
    severanceAmount:     consolidate(usdParams.severanceAmount, zigParams.severanceAmount),
    pensionContribution: consolidate(usdParams.pensionContribution, zigParams.pensionContribution),
    medicalAid:          consolidate(usdParams.medicalAid, zigParams.medicalAid),
    taxCredits:          consolidate(usdParams.taxCredits, zigParams.taxCredits),
    nssaExcludedEarnings: consolidate(usdParams.nssaExcludedEarnings, zigParams.nssaExcludedEarnings),
    payeExcludedEarnings: consolidate(usdParams.payeExcludedEarnings, zigParams.payeExcludedEarnings),
    loanBenefit:         consolidate(usdParams.loanBenefit, zigParams.loanBenefit),
    fdsAveragePAYEBasis: usdParams.fdsAveragePAYEBasis ? consolidate(usdParams.fdsAveragePAYEBasis, zigParams.fdsAveragePAYEBasis) : null,
    // Statutory thresholds remain in USD for the consolidated calculation.
    // NSSA ceiling: each currency stream has its own ceiling, so the consolidated
    // ceiling is the sum of both in USD (usdCeiling + zigCeiling/xr).
    bonusExemption:      usdParams.bonusExemption || 0,
    severanceExemption:  usdParams.severanceExemption || 0,
    nssaCeiling:         (usdParams.nssaCeiling || 0) + ((zigParams.nssaCeiling || 0) / xr),
    pensionCap:          usdParams.pensionCap,
  };

  const totalResult = calculatePaye(consolidated);

  /**
   * Determine the USD share based on Cash Earnings (base + overtime + bonus + severance)
   * which form the basis for PAYE and NSSA.
   */
  const cashUSD = (usdParams.baseSalary || 0) + (usdParams.overtimeAmount || 0) + (usdParams.bonus || 0) + (usdParams.severanceAmount || 0);
  const totalCashUSD = consolidated.baseSalary + consolidated.overtimeAmount + consolidated.bonus + consolidated.severanceAmount;
  
  const usdRatio = totalCashUSD > 0 ? (cashUSD / totalCashUSD) : 1;

  // Apportionment helpers for tax amounts (PAYE, NSSA, etc.)
  const apportionUSD = (val) => r2(val * usdRatio);
  const apportionZIG = (val) => r2(val * (1 - usdRatio) * xr);

  // Gross is computed directly from each currency's inputs to avoid float
  // drift from the USD→ZiG round-trip (e.g. 3000/xr*xr can yield 2999.99).
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
    usdRatio,
    usd: {
      gross:            grossUSD,
      paye:             apportionUSD(totalResult.payeBeforeLevy),
      aidsLevy:         apportionUSD(totalResult.aidsLevy),
      nssaEmployee:     apportionUSD(totalResult.nssaEmployee),
      nssaEmployer:     apportionUSD(totalResult.nssaEmployer),
      pensionApplied:   apportionUSD(totalResult.pensionApplied),
      netSalary:        apportionUSD(totalResult.netSalary),
      totalPaye:        apportionUSD(totalResult.totalPaye),
      exemptBonus:      apportionUSD(totalResult.exemptBonus),
      medicalAidCredit: apportionUSD(totalResult.medicalAidCredit),
    },
    zig: {
      gross:            grossZIG,
      paye:             apportionZIG(totalResult.payeBeforeLevy),
      aidsLevy:         apportionZIG(totalResult.aidsLevy),
      nssaEmployee:     apportionZIG(totalResult.nssaEmployee),
      nssaEmployer:     apportionZIG(totalResult.nssaEmployer),
      pensionApplied:   apportionZIG(totalResult.pensionApplied),
      netSalary:        apportionZIG(totalResult.netSalary),
      totalPaye:        apportionZIG(totalResult.totalPaye),
      exemptBonus:      apportionZIG(totalResult.exemptBonus),
      medicalAidCredit: apportionZIG(totalResult.medicalAidCredit),
    }
  };
}

module.exports = { calculatePaye, calculateSplitSalaryPaye, grossUpNet, STATUTORY_RATES };
