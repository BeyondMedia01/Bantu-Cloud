/**
 * Live DUAL-CURRENCY PAYE breakdown — step-by-step reconciliation.
 *
 * Algorithm (mirrors calculateSplitSalaryPaye in taxEngine.js):
 * 1. Consolidate USD + ZiG/xr earnings into a single USD figure
 * 2. Compute NSSA on the consolidated gross
 * 3. For FDS_AVERAGE: PAYE basis = USD-only monthly gross (not consolidated)
 *    For FDS_FORECASTING/NON_FDS: PAYE basis = consolidated gross
 * 4. Compute PAYE, then AIDS Levy (3% of post-credit PAYE)
 * 5. Apportion PAYE, AIDS Levy, NSSA back into USD/ZiG by usdRatio
 *    usdRatio = cashUSD (USD base+OT+bonus) / totalCashUSD (consolidated)
 */

process.env.DATABASE_URL =
  'postgresql://neondb_owner:npg_tsT2DlyPZWK0@ep-orange-silence-amcx7i1b-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const hr  = () => console.log('─'.repeat(78));
const hr2 = () => console.log('═'.repeat(78));
const lbl = (k, v, note) => {
  const s = v === null || v === undefined ? 'N/A' : typeof v === 'number' ? v.toFixed(2) : String(v);
  console.log('  ' + String(k).padEnd(48) + s.padStart(10) + (note ? '   ' + note : ''));
};
const chk = (k, stored, computed) => {
  const ok = Math.abs((stored || 0) - (computed || 0)) < 0.02;
  const mark = ok ? '\u2713' : '\u2717';
  const s = (stored || 0).toFixed(2);
  const c = (computed || 0).toFixed(2);
  console.log('  ' + String(k + ' (stored) ' + mark).padEnd(48) + s.padStart(10) +
    (ok ? '   matches computed ' + c : '   MISMATCH computed ' + c));
};

const TAX_BANDS = [
  { lo: 0,      hi: 1201,    rate: 0.00 },
  { lo: 1201,   hi: 3600,    rate: 0.20 },
  { lo: 3601,   hi: 12000,   rate: 0.25 },
  { lo: 12001,  hi: 24000,   rate: 0.30 },
  { lo: 24001,  hi: 36000,   rate: 0.35 },
  { lo: 36001,  hi: Infinity, rate: 0.40 },
];

function applyBands(annualIncome) {
  // Engine uses (band.lower - 1) as the lower threshold — mirrors taxEngine.js line 179-181
  let tax = 0;
  const rows = [];
  for (const b of TAX_BANDS) {
    if (annualIncome <= (b.lo - 1)) break;
    const inBand = Math.min(annualIncome, b.hi === Infinity ? annualIncome : b.hi) - (b.lo - 1);
    const t = inBand * b.rate;
    tax += t;
    if (inBand > 0) rows.push({ lo: b.lo, hi: b.hi, rate: b.rate, inBand: r2(inBand), tax: r2(t) });
  }
  return { annualTax: tax, rows }; // leave unrounded for /12 precision
}

async function main() {
  const runId = '8532744f-c3eb-4ead-87db-ebdb84327a06';

  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    select: {
      startDate: true, endDate: true, currency: true,
      exchangeRate: true, dualCurrency: true,
      company: { select: { name: true } },
    },
  });
  const xr = run.exchangeRate;

  hr2();
  console.log('  DUAL-CURRENCY PAYROLL RUN: ' + runId);
  console.log('  Period  : ' + run.startDate.toISOString().slice(0, 10) +
    ' \u2192 ' + run.endDate.toISOString().slice(0, 10));
  console.log('  Company : ' + run.company.name);
  console.log('  Exchange Rate: 1 USD = ' + xr + ' ZiG');
  hr2();

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    select: {
      employeeId: true,
      gross: true, paye: true, aidsLevy: true,
      nssaEmployee: true, nssaBasis: true,
      pensionApplied: true, netPay: true,
      medicalAidCredit: true, taxCreditsApplied: true,
      grossUSD: true, grossZIG: true,
      payeUSD: true, payeZIG: true,
      aidsLevyUSD: true, aidsLevyZIG: true,
      nssaUSD: true, nssaZIG: true,
      netPayUSD: true, netPayZIG: true,
      employee: {
        select: {
          firstName: true, lastName: true, employeeCode: true,
          baseRate: true, currency: true, taxMethod: true,
          dateOfBirth: true, splitUsdPercent: true,
        },
      },
    },
    take: 5,
    orderBy: { employee: { lastName: 'asc' } },
  });

  if (!payslips.length) {
    console.log('  No payslips found for this run.');
    await prisma.$disconnect();
    return;
  }

  for (const p of payslips) {
    const emp = p.employee;
    const name = emp.firstName + ' ' + emp.lastName;

    // Stored gross values are ground truth for the split
    const storedGrossUSD = p.grossUSD ?? 0;
    const storedGrossZIG = p.grossZIG ?? 0;
    const grossZIG_asUSD  = r2(storedGrossZIG / xr);
    const totalConsolidatedUSD = r2(storedGrossUSD + grossZIG_asUSD);

    // usdRatio mirrors taxEngine.js: cashUSD / totalCashUSD
    const usdRatio = totalConsolidatedUSD > 0 ? storedGrossUSD / totalConsolidatedUSD : 1;
    const zigRatio = 1 - usdRatio;

    // NSSA on full consolidated gross — keep UNROUNDED for PAYE base precision (mirrors engine)
    const nssaBasisRaw = Math.min(totalConsolidatedUSD, 700);
    const nssaTotalRaw = nssaBasisRaw * 0.045;         // unrounded — used in payeBase calc
    const nssaBasis    = r2(nssaBasisRaw);
    const nssaTotal    = r2(nssaTotalRaw);
    const nssaUSD_c    = r2(nssaTotal * usdRatio);
    const nssaZIG_c    = r2(nssaTotal * zigRatio * xr);

    const pensionApplied  = p.pensionApplied ?? 0;
    const medAidCredit    = p.medicalAidCredit ?? 0;

    // PAYE basis depends on taxMethod
    // FDS_AVERAGE: use USD-only gross as monthly basis (currGross in process.js only
    //              includes inputEarningsZIG/xr as TC ZiG earnings, but the ZiG basic
    //              salary goes to baseZIG which is NOT in currGross — FDS basis is USD-only)
    // FDS_FORECASTING / NON_FDS: use consolidated gross
    let payeBasisMonthly;
    let payeBasisNote;

    if (emp.taxMethod === 'FDS_AVERAGE') {
      // Jan 2026 = first month of tax year, YTD cumulative gross = 0
      // fdsAvgBasis = (0 + usdGross) / (0+1) = usdGross
      payeBasisMonthly = storedGrossUSD;
      payeBasisNote = 'FDS_AVERAGE — USD-only monthly gross (ZiG basic excluded from currGross in process.js)';
    } else if (emp.taxMethod === 'FDS_FORECASTING') {
      payeBasisMonthly = totalConsolidatedUSD;
      payeBasisNote = 'FDS_FORECASTING — consolidated monthly gross x 12 annualised';
    } else {
      payeBasisMonthly = totalConsolidatedUSD;
      payeBasisNote = 'NON_FDS — consolidated monthly gross';
    }

    // payeBase (unrounded) = payeBasis - nssaEmployee(unrounded) - pension
    // engine: const payeBase = fdsAveragePAYEBasis != null
    //   ? Math.max(0, fdsAveragePAYEBasis - nssaEmployee - effectivePension)
    //   : taxableIncome;
    const payeBaseRaw   = Math.max(0, payeBasisMonthly - nssaTotalRaw - pensionApplied);
    const annualTaxable = payeBaseRaw * 12; // annualBrackets=true so multiply by 12

    const { annualTax: annualTaxRaw, rows: bandRows } = applyBands(annualTaxable);
    const monthlyPayeRaw  = annualTaxRaw / 12;                // keep unrounded for apportionment
    const monthlyPaye     = r2(monthlyPayeRaw);
    const payeAfterCredit = r2(Math.max(0, monthlyPaye - medAidCredit));
    const aidsLevy        = r2(payeAfterCredit * 0.03);

    // Display values
    const annualPayeBasis = r2(payeBasisMonthly * 12);
    const annualNssa      = r2(nssaTotal * 12);
    const annualPension   = r2(pensionApplied * 12);
    const annualTaxableDisplay = r2(annualTaxable);

    // Apportion
    const computedPayeUSD     = r2(payeAfterCredit * usdRatio);
    const computedPayeZIG     = r2(payeAfterCredit * zigRatio * xr);
    const computedAidsLevyUSD = r2(aidsLevy * usdRatio);
    const computedAidsLevyZIG = r2(aidsLevy * zigRatio * xr);

    // Net pay check (using stored split deductions)
    const netUSD_c = r2(storedGrossUSD - (p.payeUSD || 0) - (p.aidsLevyUSD || 0) - (p.nssaUSD || 0) - r2(pensionApplied * usdRatio));
    const netZIG_c = r2(storedGrossZIG - (p.payeZIG || 0) - (p.aidsLevyZIG || 0) - (p.nssaZIG || 0) - r2(pensionApplied * zigRatio * xr));

    hr2();
    console.log('  EMPLOYEE: ' + name + '  [' + emp.employeeCode + ']');
    console.log('  Tax method: ' + emp.taxMethod);
    hr2();
    console.log('\n  STEP-BY-STEP DUAL-CURRENCY PAYE CALCULATION:');
    hr();

    // Step 1
    console.log('\n  [1] GROSS EARNINGS  (USD + ZiG stored in payslip)');
    lbl('Gross USD portion (stored)', storedGrossUSD, 'USD salary / USD TC earnings');
    lbl('Gross ZiG portion (stored)', storedGrossZIG, 'ZiG salary / ZiG TC earnings');
    lbl('ZiG as USD eq (' + storedGrossZIG.toFixed(0) + ' ZiG / ' + xr + ' rate)', grossZIG_asUSD);
    lbl('Total consolidated USD', totalConsolidatedUSD, '<-- used for NSSA');

    // Step 2
    console.log('\n  [2] APPORTIONMENT RATIO  (governs how PAYE/NSSA splits back into each currency)');
    lbl('USD ratio = ' + storedGrossUSD.toFixed(2) + ' / ' + totalConsolidatedUSD.toFixed(2), r2(usdRatio));
    lbl('ZiG ratio = 1 - USD ratio', r2(zigRatio));

    // Step 3
    console.log('\n  [3] NSSA  (on FULL consolidated gross — ZIMRA rule)');
    lbl('NSSA basis = min(' + totalConsolidatedUSD.toFixed(2) + ', $700 ceiling)', nssaBasis);
    lbl('Total NSSA employee = ' + nssaBasis.toFixed(2) + ' x 4.5%', nssaTotal);
    lbl('  => NSSA USD = ' + nssaTotal.toFixed(2) + ' x ' + r2(usdRatio).toFixed(4), nssaUSD_c);
    lbl('  => NSSA ZiG = ' + nssaTotal.toFixed(2) + ' x ' + r2(zigRatio).toFixed(4) + ' x ' + xr, nssaZIG_c, 'ZiG');

    // Step 4
    console.log('\n  [4] PAYE BASIS  (' + emp.taxMethod + ')');
    console.log('  NOTE: ' + payeBasisNote);
    lbl('Monthly PAYE basis', payeBasisMonthly);
    lbl('Annualised = ' + payeBasisMonthly.toFixed(2) + ' x 12', annualPayeBasis);
    lbl('Annual NSSA = ' + nssaTotal.toFixed(2) + ' x 12', annualNssa);
    lbl('Annual pension', annualPension);
    lbl('Annual taxable = annual - NSSA - pension', annualTaxableDisplay);

    // Step 5
    console.log('\n  [5] TAX BANDS (marginal accumulation on annual taxable)');
    console.log('  ' + 'Band'.padEnd(26) + 'Rate'.padStart(6) + 'In Band'.padStart(12) + 'Tax'.padStart(10));
    hr();
    for (const b of bandRows) {
      const hi = b.hi === Infinity ? 'max' : '$' + b.hi.toLocaleString();
      console.log('  ' + ('$' + b.lo.toLocaleString() + ' - ' + hi).padEnd(26) +
        (b.rate * 100).toFixed(0).padStart(5) + '%' +
        b.inBand.toFixed(2).padStart(12) + b.tax.toFixed(2).padStart(10));
    }
    hr();
    lbl('Annual PAYE total', r2(annualTaxRaw));
    lbl('Monthly PAYE = annual / 12', monthlyPaye);

    // Step 6
    console.log('\n  [6] CREDITS');
    lbl('Medical aid credit (stored)', medAidCredit);
    lbl('PAYE after credits', payeAfterCredit);

    // Step 7
    console.log('\n  [7] AIDS LEVY  (3% of post-credit PAYE)');
    lbl('AIDS Levy = ' + payeAfterCredit.toFixed(2) + ' x 3%', aidsLevy);

    // Step 8
    console.log('\n  [8] DUAL-CURRENCY APPORTIONMENT  (apply usdRatio / zigRatio)');
    lbl('PAYE USD  = ' + payeAfterCredit.toFixed(4) + ' x ' + r2(usdRatio).toFixed(4), computedPayeUSD, 'USD');
    lbl('PAYE ZiG  = ' + payeAfterCredit.toFixed(4) + ' x ' + r2(zigRatio).toFixed(4) + ' x ' + xr, computedPayeZIG, 'ZiG');
    lbl('AIDS Levy USD = ' + aidsLevy.toFixed(4) + ' x ' + r2(usdRatio).toFixed(4), computedAidsLevyUSD, 'USD');
    lbl('AIDS Levy ZiG = ' + aidsLevy.toFixed(4) + ' x ' + r2(zigRatio).toFixed(4) + ' x ' + xr, computedAidsLevyZIG, 'ZiG');

    // Step 9
    console.log('\n  [9] TOTALS SUMMARY');
    hr();
    lbl('Gross USD', storedGrossUSD);
    lbl('Gross ZiG', storedGrossZIG, 'ZiG');
    lbl('PAYE (income tax) USD', computedPayeUSD);
    lbl('PAYE (income tax) ZiG', computedPayeZIG, 'ZiG');
    lbl('AIDS Levy USD', computedAidsLevyUSD);
    lbl('AIDS Levy ZiG', computedAidsLevyZIG, 'ZiG');
    lbl('NSSA employee USD', nssaUSD_c);
    lbl('NSSA employee ZiG', nssaZIG_c, 'ZiG');
    lbl('Pension (USD portion)', r2(pensionApplied * usdRatio));
    lbl('Net Pay USD (estimated)', netUSD_c);
    lbl('Net Pay ZiG (estimated)', netZIG_c, 'ZiG');
    hr();

    // Step 10 — Reconcile
    console.log('\n  [10] RECONCILE WITH STORED PAYSLIP VALUES');
    hr();
    chk('NSSA USD', p.nssaUSD, nssaUSD_c);
    chk('NSSA ZiG', p.nssaZIG, nssaZIG_c);
    chk('PAYE USD', p.payeUSD, computedPayeUSD);
    chk('PAYE ZiG', p.payeZIG, computedPayeZIG);
    chk('AIDS Levy USD', p.aidsLevyUSD, computedAidsLevyUSD);
    chk('AIDS Levy ZiG', p.aidsLevyZIG, computedAidsLevyZIG);
    chk('Net Pay USD', p.netPayUSD, netUSD_c);
    chk('Net Pay ZiG', p.netPayZIG, netZIG_c);
    hr();
    console.log('');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
