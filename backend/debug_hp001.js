/**
 * ZIMRA dual-currency PAYE reconciliation for employee HP001.
 *
 * ZIMRA Apportionment Method (Finance Act Ch.23:04 + Practice Note on FDS):
 *   1. Convert ALL ZiG earnings to USD at the interbank rate
 *   2. Compute NSSA on the consolidated USD gross (capped at USD ceiling)
 *   3. Compute PAYE on the consolidated taxable income using USD annual brackets
 *   4. Apportion PAYE, AIDS Levy, and NSSA back to each currency by the
 *      proportion of remuneration earned in that currency
 *
 * Run: node backend/debug_hp001.js
 */
process.env.DATABASE_URL =
  'postgresql://neondb_owner:npg_tsT2DlyPZWK0@ep-orange-silence-amcx7i1b-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const hr  = () => console.log('─'.repeat(80));
const hr2 = () => console.log('═'.repeat(80));
const lbl = (k, v, note = '') => {
  const s = v === null || v === undefined ? 'N/A' : typeof v === 'number' ? v.toFixed(2) : String(v);
  console.log('  ' + String(k).padEnd(50) + s.toString().padStart(12) + (note ? '   ' + note : ''));
};
const chk = (label, stored, computed) => {
  const ok = Math.abs((stored || 0) - (computed || 0)) < 0.02;
  const mark = ok ? '✓' : '✗ MISMATCH';
  lbl(`${label} [${mark}]`, stored, ok ? `computed ${(computed||0).toFixed(2)}` : `!! computed ${(computed||0).toFixed(2)}`);
};

async function main() {
  hr2();
  console.log('  ZIMRA DUAL-CURRENCY PAYE RECONCILIATION — HP001');
  hr2();

  // ── 1. Employee ────────────────────────────────────────────────────────────
  const emp = await prisma.employee.findFirst({
    where: { employeeCode: 'HP001' },
    include: { company: true },
  });
  if (!emp) {
    console.log('  !! Employee HP001 not found.');
    return;
  }

  lbl('Employee', `${emp.firstName} ${emp.lastName}  [${emp.employeeNumber}]`);
  lbl('Company', emp.company?.name ?? emp.companyId);
  lbl('Primary currency', emp.currency);
  lbl('Base rate', emp.baseRate);
  lbl('Tax method', emp.taxMethod);
  lbl('Split ZiG mode', emp.splitZigMode ?? 'NONE');
  lbl('Split ZiG value', emp.splitZigValue ?? 0);
  lbl('Split USD %', emp.splitUsdPercent ?? 'N/A');

  // ── 2. Most recent payroll run — prefer dual-currency ─────────────────────
  let run = await prisma.payrollRun.findFirst({
    where: { companyId: emp.companyId, status: 'COMPLETED', dualCurrency: true },
    orderBy: { startDate: 'desc' },
  });
  if (!run) {
    run = await prisma.payrollRun.findFirst({
      where: { companyId: emp.companyId, status: 'COMPLETED' },
      orderBy: { startDate: 'desc' },
    });
  }
  if (!run) {
    console.log('  !! No completed payroll run found for this company.');
    return;
  }

  hr2();
  console.log('  PAYROLL RUN');
  hr2();
  lbl('Run ID', run.id);
  lbl('Period', `${run.startDate?.toISOString().slice(0,10)} → ${run.endDate?.toISOString().slice(0,10)}`);
  lbl('Run currency', run.currency);
  lbl('Dual currency', String(run.dualCurrency));
  lbl('Exchange rate (1 USD = x ZiG)', run.exchangeRate ?? 'N/A');

  const xr = (run.exchangeRate && run.exchangeRate > 0) ? run.exchangeRate : 1;

  if (!run.dualCurrency) {
    console.log('\n  !! This run is NOT dual-currency. Multi-currency apportionment does not apply.');
    console.log('  For a dual-currency comparison you need a run with dualCurrency=true.');
  }

  // ── 3. Payslip ─────────────────────────────────────────────────────────────
  const ps = await prisma.payslip.findFirst({
    where: { employeeId: emp.id, payrollRunId: run.id },
  });
  if (!ps) {
    console.log('  !! No payslip found for HP001 in this run.');
    return;
  }

  hr2();
  console.log('  STORED PAYSLIP VALUES');
  hr2();
  lbl('Basic salary applied', ps.basicSalaryApplied);
  lbl('Gross USD', ps.grossUSD ?? 'n/a');
  lbl('Gross ZiG', ps.grossZIG ?? 'n/a');
  lbl('Gross (run currency)', ps.gross ?? ps.grossSalary);
  lbl('NSSA employee USD', ps.nssaUSD ?? 'n/a');
  lbl('NSSA employee ZiG', ps.nssaZIG ?? 'n/a');
  lbl('NSSA employee total', ps.nssaEmployee);
  lbl('Pension applied', ps.pensionApplied);
  lbl('Medical aid credit', ps.medicalAidCredit);
  lbl('PAYE USD', ps.payeUSD ?? 'n/a');
  lbl('PAYE ZiG', ps.payeZIG ?? 'n/a');
  lbl('PAYE before levy', ps.payeBeforeLevy ?? ps.paye);
  lbl('AIDS levy USD', ps.aidsLevyUSD ?? 'n/a');
  lbl('AIDS levy ZiG', ps.aidsLevyZIG ?? 'n/a');
  lbl('AIDS levy', ps.aidsLevy);
  lbl('Total PAYE (incl. levy)', ps.totalPaye ?? r2((ps.paye||0)+(ps.aidsLevy||0)));
  lbl('Net pay USD', ps.netPayUSD ?? 'n/a');
  lbl('Net pay ZiG', ps.netPayZIG ?? 'n/a');
  lbl('Net pay (run currency)', ps.netPay);

  // ── 4. System settings ─────────────────────────────────────────────────────
  const settingKeys = [
    'NSSA_CEILING_USD','NSSA_CEILING_ZIG','NSSA_EMPLOYEE_RATE','NSSA_EMPLOYER_RATE',
    'AIDS_LEVY_RATE','MEDICAL_AID_CREDIT_RATE','PENSION_CAP_USD','PENSION_CAP_ZIG',
    'BONUS_EXEMPTION_USD','ELDERLY_TAX_CREDIT_USD',
  ];
  const settingRows = await prisma.systemSetting.findMany({
    where: { settingName: { in: settingKeys }, isActive: true },
  });
  const S = Object.fromEntries(settingRows.map(r => [r.settingName, parseFloat(r.settingValue)]));
  const nssaCeilingUSD = S.NSSA_CEILING_USD ?? 700;
  const nssaEmpRate    = (S.NSSA_EMPLOYEE_RATE ?? 4.5) / 100;
  const aidsRate       = (S.AIDS_LEVY_RATE ?? 3) / 100;
  const medCreditRate  = (S.MEDICAL_AID_CREDIT_RATE ?? 50) / 100;
  const pensionCapAnnual = S.PENSION_CAP_USD ?? 0;
  const monthlyPensionCap = pensionCapAnnual > 0 ? r2(pensionCapAnnual / 12) : null;

  hr2();
  console.log('  SYSTEM SETTINGS IN USE');
  hr2();
  lbl('NSSA ceiling USD', nssaCeilingUSD);
  lbl('NSSA employee rate', S.NSSA_EMPLOYEE_RATE ?? 4.5, '%');
  lbl('AIDS levy rate', S.AIDS_LEVY_RATE ?? 3, '%');
  lbl('Medical aid credit rate', S.MEDICAL_AID_CREDIT_RATE ?? 50, '%');
  lbl('Pension cap (annual)', pensionCapAnnual, pensionCapAnnual > 0 ? 'USD/yr' : '(no cap)');
  lbl('Monthly pension cap', monthlyPensionCap ?? 'none');

  // ── 5. Active tax table ────────────────────────────────────────────────────
  const taxTable = await prisma.taxTable.findFirst({
    where: { currency: 'USD', isActive: true },
    include: { brackets: { orderBy: { lowerBound: 'asc' } } },
  });

  hr2();
  console.log(`  TAX TABLE: ${taxTable?.name ?? 'N/A'}  [${taxTable?.isAnnual ? 'ANNUAL' : 'MONTHLY'} brackets]`);
  hr2();
  if (taxTable?.brackets?.length) {
    console.log('  ' + 'Lower'.padStart(10) + 'Upper'.padStart(12) + 'Rate'.padStart(8));
    for (const b of taxTable.brackets) {
      const up = (b.upperBound > 1e9 || !b.upperBound) ? '∞' : b.upperBound.toFixed(2);
      console.log('  ' + b.lowerBound.toFixed(2).padStart(10) + up.padStart(12) + ((b.rate*100).toFixed(0)+'%').padStart(8));
    }
  } else {
    console.log('  !! No active USD tax table — PAYE will be zero');
  }

  // ── 6. Payroll transactions ────────────────────────────────────────────────
  const txns = await prisma.payrollTransaction.findMany({
    where: { employeeId: emp.id, payrollRunId: run.id },
    include: { transactionCode: true },
  });

  if (txns.length) {
    hr2();
    console.log('  PAYROLL TRANSACTION CODES');
    hr2();
    console.log('  ' + 'Code'.padEnd(10) + 'Name'.padEnd(30) + 'Type'.padEnd(12) +
      'Curr'.padEnd(6) + 'Amount'.padStart(12) +
      '  taxable  affectsPAYE  affectsNSSA');
    console.log('  ' + '─'.repeat(90));
    for (const t of txns) {
      const tc = t.transactionCode;
      console.log(
        '  ' + (tc?.code ?? '?').padEnd(10) +
        (tc?.name ?? '?').substring(0, 28).padEnd(30) +
        (t.type ?? tc?.type ?? '?').padEnd(12) +
        (t.currency ?? run.currency).padEnd(6) +
        (t.amount ?? 0).toFixed(2).padStart(12) +
        '  ' + String(tc?.taxable ?? '?').padEnd(9) +
        String(tc?.affectsPaye ?? '?').padEnd(13) +
        String(tc?.affectsNssa ?? '?')
      );
    }
  }

  // ── 7. ZIMRA step-by-step re-computation ──────────────────────────────────
  if (!run.dualCurrency) {
    console.log('\n  Skipping ZIMRA dual-currency re-computation — run is single-currency.');
    return;
  }

  // Categorise transaction codes
  let inputEarningsUSD = 0, inputEarningsZIG = 0;
  let inputPensionUSD = 0,  inputPensionZIG = 0;
  let inputMedAidUSD = 0,   inputMedAidZIG = 0;
  let inputNssaExclUSD = 0, inputNssaExclZIG = 0;
  let inputPayeExclUSD = 0, inputPayeExclZIG = 0;

  for (const t of txns) {
    const tc = t.transactionCode;
    const amt = t.amount ?? 0;
    const isUSD = (t.currency ?? 'USD') === 'USD';
    const isEarning  = tc?.type === 'EARNING' || tc?.type === 'BENEFIT';
    const isPreTax   = tc?.type === 'DEDUCTION' && tc?.preTax;
    const isMedAid   = tc?.type === 'DEDUCTION' && !tc?.preTax &&
      (tc?.incomeCategory === 'MEDICAL_AID' || /medical\s*aid/i.test(tc?.name ?? ''));

    if (isEarning) {
      if (isUSD) {
        inputEarningsUSD += amt;
        if (tc?.affectsNssa === false) inputNssaExclUSD += amt;
        if (tc?.affectsPaye === false || tc?.taxable === false) inputPayeExclUSD += amt;
      } else {
        inputEarningsZIG += amt;
        if (tc?.affectsNssa === false) inputNssaExclZIG += amt;
        if (tc?.affectsPaye === false || tc?.taxable === false) inputPayeExclZIG += amt;
      }
    } else if (isPreTax) {
      if (isUSD) inputPensionUSD += amt; else inputPensionZIG += amt;
    } else if (isMedAid) {
      if (isUSD) inputMedAidUSD += amt; else inputMedAidZIG += amt;
    }
  }

  // Derive the same base split that process.js performs
  const effectiveBaseSalary = Number(ps.basicSalaryApplied) || Number(emp.baseRate) || 0;
  const totalBasicUSD = emp.currency === 'USD' ? effectiveBaseSalary : effectiveBaseSalary / xr;

  let baseUSD = 0, baseZIG = 0;
  const mode = emp.splitZigMode ?? 'NONE';
  const modeVal = Number(emp.splitZigValue) || 0;

  if (mode === 'PERCENTAGE' && modeVal > 0) {
    const splitPerc = Math.min(100, Math.max(0, modeVal));
    baseUSD = totalBasicUSD * (1 - splitPerc / 100);
    baseZIG = totalBasicUSD * (splitPerc / 100) * xr;
  } else if (mode === 'FIXED' && modeVal > 0) {
    baseUSD = totalBasicUSD;
    baseZIG = modeVal;
  } else {
    if (emp.currency === 'ZiG') { baseZIG = effectiveBaseSalary; }
    else                        { baseUSD = effectiveBaseSalary; }
  }

  hr2();
  console.log('  ZIMRA STEP-BY-STEP DUAL-CURRENCY PAYE  (re-computed)');
  hr2();

  console.log('\n  [1] BASE SALARY SPLIT');
  lbl('Effective base salary', effectiveBaseSalary, `(in ${emp.currency})`);
  lbl('Total basic in USD', totalBasicUSD);
  lbl('Split mode', mode);
  lbl('Split value', modeVal, mode === 'PERCENTAGE' ? '% to ZiG' : mode === 'FIXED' ? 'fixed ZiG amount' : '');
  lbl('Base USD', baseUSD, '← USD salary component');
  lbl('Base ZiG', baseZIG, '← ZiG salary component');

  console.log('\n  [2] ADDITIONAL EARNINGS (transaction codes)');
  lbl('TC earnings USD', inputEarningsUSD);
  lbl('TC earnings ZiG', inputEarningsZIG);
  lbl('NSSA-excluded USD', inputNssaExclUSD);
  lbl('NSSA-excluded ZiG', inputNssaExclZIG);
  lbl('PAYE-excluded USD', inputPayeExclUSD);
  lbl('PAYE-excluded ZiG', inputPayeExclZIG);
  lbl('Pension (pre-tax) USD', inputPensionUSD);
  lbl('Pension (pre-tax) ZiG', inputPensionZIG);
  lbl('Medical aid USD', inputMedAidUSD);
  lbl('Medical aid ZiG', inputMedAidZIG);

  // Total earnings per currency (basic + TC earnings)
  const totalEarnUSD = r2(baseUSD + inputEarningsUSD);
  const totalEarnZIG = r2(baseZIG + inputEarningsZIG);
  const totalEarnZIG_asUSD = r2(totalEarnZIG / xr);
  const consolidatedEarnings = r2(totalEarnUSD + totalEarnZIG_asUSD);

  console.log('\n  [3] CONSOLIDATED GROSS  (ZIMRA: convert ZiG → USD at interbank rate)');
  lbl('Total earnings USD', totalEarnUSD);
  lbl(`Total earnings ZiG (${totalEarnZIG.toFixed(2)} ÷ ${xr})`, totalEarnZIG_asUSD, 'USD equivalent');
  lbl('Consolidated gross USD', consolidatedEarnings, '← NSSA basis');

  // NSSA
  const nssaBasis = r2(Math.min(consolidatedEarnings, nssaCeilingUSD));
  const nssaTotal = r2(nssaBasis * nssaEmpRate);
  const cashUSD   = totalEarnUSD;  // base + OT earnings (USD portion)
  const totalCashUSD = consolidatedEarnings;
  const usdRatio  = totalCashUSD > 0 ? cashUSD / totalCashUSD : 1;
  const zigRatio  = 1 - usdRatio;
  const nssaUSD_c = r2(nssaTotal * usdRatio);
  const nssaZIG_c = r2(nssaTotal * zigRatio * xr);

  console.log('\n  [4] NSSA  (ZIMRA: applied on consolidated gross, capped at USD ceiling)');
  lbl(`NSSA basis = min(${consolidatedEarnings.toFixed(2)}, ${nssaCeilingUSD})`, nssaBasis);
  lbl(`NSSA employee = ${nssaBasis.toFixed(2)} × ${(nssaEmpRate*100).toFixed(1)}%`, nssaTotal);

  console.log('\n  [5] APPORTIONMENT RATIO  (ZIMRA: proportion of remuneration in each currency)');
  lbl(`USD ratio = ${totalEarnUSD.toFixed(2)} / ${consolidatedEarnings.toFixed(2)}`, r2(usdRatio));
  lbl('ZiG ratio = 1 − USD ratio', r2(zigRatio));
  lbl('NSSA → USD', nssaUSD_c, 'USD');
  lbl('NSSA → ZiG', nssaZIG_c, 'ZiG');

  // PAYE
  const pensionUSD_eff = monthlyPensionCap !== null ? Math.min(inputPensionUSD, monthlyPensionCap) : inputPensionUSD;
  const pensionZIG_eff = inputPensionZIG;
  const pensionConsolidated = r2(pensionUSD_eff + pensionZIG_eff / xr);
  const medAidConsolidated  = r2(inputMedAidUSD + inputMedAidZIG / xr);
  const medAidCredit        = r2(medAidConsolidated * medCreditRate);
  const taxableConsolidated = r2(Math.max(0, consolidatedEarnings - nssaTotal - pensionConsolidated));
  const annualTaxable       = r2(taxableConsolidated * 12);

  console.log('\n  [6] PAYE BASIS  (ZIMRA: taxable = consolidated gross − NSSA − pension)');
  lbl('Pension (consolidated)', pensionConsolidated);
  lbl('Medical aid (consolidated)', medAidConsolidated);
  lbl('Medical aid credit (50%)', medAidCredit);
  lbl('Taxable income (monthly)', taxableConsolidated);
  lbl('Annualised (×12)', annualTaxable, '← applied to annual ZIMRA tax bands');

  // Band calculation
  let annualPaye = 0;
  const bandRows = [];
  if (taxTable?.brackets?.length) {
    const bands = [...taxTable.brackets].sort((a,b) => a.lowerBound - b.lowerBound);
    for (const b of bands) {
      const lower = b.lowerBound;
      const upper = b.upperBound ?? Infinity;
      if (annualTaxable <= (lower - 1)) break;
      const inBand = Math.min(annualTaxable, upper > 1e9 ? annualTaxable : upper) - (lower - 1);
      const tax = inBand * b.rate;
      annualPaye += tax;
      if (inBand > 0) bandRows.push({ lower, upper, rate: b.rate, inBand: r2(inBand), tax: r2(tax) });
    }
  }
  const monthlyPaye    = r2(annualPaye / 12);
  const payeAfterCredit = r2(Math.max(0, monthlyPaye - medAidCredit));
  const aidsLevy       = r2(payeAfterCredit * aidsRate);
  const totalPayeMonthly = r2(payeAfterCredit + aidsLevy);

  console.log('\n  [7] TAX BANDS (ZIMRA annual USD brackets on annualised taxable income)');
  console.log('  ' + 'Band'.padEnd(26) + 'Rate'.padStart(6) + 'In Band'.padStart(14) + 'Tax'.padStart(12));
  hr();
  for (const b of bandRows) {
    const hi = b.upper > 1e9 ? '∞' : '$' + b.upper.toLocaleString();
    console.log('  ' + ('$' + b.lower.toLocaleString() + ' – ' + hi).padEnd(26) +
      ((b.rate*100).toFixed(0) + '%').padStart(6) +
      b.inBand.toFixed(2).padStart(14) +
      b.tax.toFixed(2).padStart(12));
  }
  hr();
  lbl('Annual PAYE total', r2(annualPaye));
  lbl('Monthly PAYE = annual ÷ 12', monthlyPaye);

  console.log('\n  [8] CREDITS & AIDS LEVY');
  lbl('Medical aid credit', medAidCredit, '(50% of contributions)');
  lbl('PAYE after credits', payeAfterCredit);
  lbl(`AIDS levy = ${payeAfterCredit.toFixed(2)} × 3%`, aidsLevy);
  lbl('Total PAYE incl. levy', totalPayeMonthly);

  // Apportion
  const payeUSD_c = r2(payeAfterCredit * usdRatio);
  const payeZIG_c = r2(payeAfterCredit * zigRatio * xr);
  const alUSD_c   = r2(aidsLevy * usdRatio);
  const alZIG_c   = r2(aidsLevy * zigRatio * xr);

  console.log('\n  [9] DUAL-CURRENCY APPORTIONMENT  (apply USD/ZiG ratio)');
  lbl(`PAYE USD  = ${payeAfterCredit.toFixed(4)} × ${r2(usdRatio).toFixed(4)}`, payeUSD_c, 'USD');
  lbl(`PAYE ZiG  = ${payeAfterCredit.toFixed(4)} × ${r2(zigRatio).toFixed(4)} × ${xr}`, payeZIG_c, 'ZiG');
  lbl(`AIDS Levy USD = ${aidsLevy.toFixed(4)} × ${r2(usdRatio).toFixed(4)}`, alUSD_c, 'USD');
  lbl(`AIDS Levy ZiG = ${aidsLevy.toFixed(4)} × ${r2(zigRatio).toFixed(4)} × ${xr}`, alZIG_c, 'ZiG');

  // Net pay estimates
  const netUSD_c = r2(totalEarnUSD - payeUSD_c - alUSD_c - nssaUSD_c - pensionUSD_eff);
  const netZIG_c = r2(totalEarnZIG - payeZIG_c - alZIG_c - nssaZIG_c - pensionZIG_eff);

  hr2();
  console.log('  [10] TOTALS SUMMARY');
  hr2();
  lbl('Gross USD', totalEarnUSD);
  lbl('Gross ZiG', totalEarnZIG, 'ZiG');
  lbl('Gross ZiG (USD equiv)', totalEarnZIG_asUSD);
  lbl('Gross consolidated USD', consolidatedEarnings);
  hr();
  lbl('NSSA employee USD', nssaUSD_c);
  lbl('NSSA employee ZiG', nssaZIG_c, 'ZiG');
  lbl('PAYE (income tax) USD', payeUSD_c);
  lbl('PAYE (income tax) ZiG', payeZIG_c, 'ZiG');
  lbl('AIDS levy USD', alUSD_c);
  lbl('AIDS levy ZiG', alZIG_c, 'ZiG');
  lbl('Pension USD (applied)', pensionUSD_eff);
  lbl('Net pay USD (estimated)', netUSD_c);
  lbl('Net pay ZiG (estimated)', netZIG_c, 'ZiG');

  // ── 8. Reconcile against stored payslip ───────────────────────────────────
  hr2();
  console.log('  [11] RECONCILE — ZIMRA RE-COMPUTED vs STORED PAYSLIP');
  hr2();
  chk('Gross USD', ps.grossUSD, totalEarnUSD);
  chk('Gross ZiG', ps.grossZIG, totalEarnZIG);
  chk('NSSA USD', ps.nssaUSD, nssaUSD_c);
  chk('NSSA ZiG', ps.nssaZIG, nssaZIG_c);
  chk('PAYE USD', ps.payeUSD, payeUSD_c);
  chk('PAYE ZiG', ps.payeZIG, payeZIG_c);
  chk('AIDS levy USD', ps.aidsLevyUSD, alUSD_c);
  chk('AIDS levy ZiG', ps.aidsLevyZIG, alZIG_c);
  chk('Net pay USD', ps.netPayUSD, netUSD_c);
  chk('Net pay ZiG', ps.netPayZIG, netZIG_c);
  hr();

  // ── 9. ZIMRA compliance notes ─────────────────────────────────────────────
  hr2();
  console.log('  ZIMRA COMPLIANCE NOTES');
  hr2();

  // Check 1: is the split mode additive or proportional?
  if (mode === 'FIXED') {
    console.log('  ⚠  FIXED split mode: ZiG is ADDITIVE on top of USD salary.');
    console.log('     Tarms may treat this as USD-only salary + separate ZiG allowance.');
    console.log('     Confirm with ZIMRA whether the ZiG component is an independent');
    console.log('     allowance (additive) or a replacement of part of the USD salary.');
  } else if (mode === 'PERCENTAGE') {
    console.log('  ✓  PERCENTAGE mode: ZiG replaces a portion of USD salary (correct split).');
  } else {
    console.log('  ℹ  NONE mode: employee paid in primary currency only — no split applied.');
  }

  // Check 2: NSSA ceiling
  const storedNssaBasis = Number(ps.nssaBasis) || 0;
  if (storedNssaBasis > 0 && Math.abs(storedNssaBasis - nssaBasis) > 0.02) {
    console.log(`\n  ⚠  NSSA basis mismatch: stored=${storedNssaBasis.toFixed(2)}, recomputed=${nssaBasis.toFixed(2)}`);
    console.log('     Check whether NSSA ceiling or rate changed since this run was processed.');
  }

  // Check 3: is consolidated gross close to what Tarms would show?
  console.log(`\n  ℹ  Consolidated gross (what ZIMRA taxes): USD ${consolidatedEarnings.toFixed(2)}`);
  console.log(`     If Tarms shows a HIGHER gross, the likely causes are:`);
  console.log(`       a) Tarms is treating ZiG as ADDITIONAL income (FIXED mode)`);
  console.log(`          rather than a SPLIT of the USD salary (PERCENTAGE mode).`);
  console.log(`       b) Different exchange rate used in Tarms vs this run (${xr}).`);
  console.log(`       c) Tarms includes benefits or allowances not in this run.`);

  hr2();
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
}).finally(() => prisma.$disconnect());
