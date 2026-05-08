/**
 * Updates the payroll run exchange rate from 27.5 to 25.6 and
 * recomputes HP001's payslip using the corrected rate.
 */
process.env.DATABASE_URL =
  'postgresql://neondb_owner:npg_tsT2DlyPZWK0@ep-orange-silence-amcx7i1b-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const { PrismaClient } = require('@prisma/client');
const { calculateSplitSalaryPaye } = require('./utils/taxEngine');
const prisma = new PrismaClient();

const RUN_ID = '8532744f-c3eb-4ead-87db-ebdb84327a06';
const NEW_XR  = 25.6;
const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  // ── 1. Fetch run ────────────────────────────────────────────────────────────
  const run = await prisma.payrollRun.findUnique({
    where: { id: RUN_ID },
    include: { company: true, _count: { select: { payslips: true } } },
  });

  console.log('Run status    :', run.status);
  console.log('Current rate  :', run.exchangeRate?.toString());
  console.log('Payslip count :', run._count.payslips);

  if (!run.dualCurrency) {
    console.log('Run is not dual-currency — no rate change needed.');
    return;
  }

  // ── 2. Fetch all payslips so we know the full scope ─────────────────────────
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: RUN_ID },
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
  });

  console.log('\nEmployees in this run:');
  for (const ps of payslips) {
    console.log(' ', ps.employee.employeeCode, ps.employee.firstName, ps.employee.lastName,
      '| gross USD', Number(ps.grossUSD).toFixed(2), '| gross ZiG', Number(ps.grossZIG).toFixed(2));
  }

  // ── 3. Fetch tax table + settings ───────────────────────────────────────────
  const clientId = run.company?.clientId;
  const taxTable = await prisma.taxTable.findFirst({
    where: { clientId, currency: 'USD', isActive: true },
    include: { brackets: { orderBy: { lowerBound: 'asc' } } },
  });
  const settingRows = await prisma.systemSetting.findMany({
    where: {
      settingName: {
        in: ['NSSA_CEILING_USD','NSSA_CEILING_ZIG','NSSA_EMPLOYEE_RATE','NSSA_EMPLOYER_RATE',
             'AIDS_LEVY_RATE','MEDICAL_AID_CREDIT_RATE','PENSION_CAP_USD'],
      },
      isActive: true,
    },
  });
  const S = Object.fromEntries(settingRows.map(r => [r.settingName, parseFloat(r.settingValue)]));
  const nssaCeilingUSD = S.NSSA_CEILING_USD  || 700;
  const nssaCeilingZIG = S.NSSA_CEILING_ZIG  || 18000;
  const nssaEmpRate    = (S.NSSA_EMPLOYEE_RATE  || 4.5) / 100;
  const nssaEmprRate   = (S.NSSA_EMPLOYER_RATE  || 4.5) / 100;
  const aidsRate       = (S.AIDS_LEVY_RATE       || 3)   / 100;
  const medCreditRate  = (S.MEDICAL_AID_CREDIT_RATE || 50) / 100;
  const pensionCapAnnual = S.PENSION_CAP_USD || 0;
  const monthlyPensionCap = pensionCapAnnual > 0 ? r2(pensionCapAnnual / 12) : null;

  // ── 4. Preview: recompute each payslip at new rate ──────────────────────────
  console.log('\n=== PREVIEW at xr =', NEW_XR, '===');
  const updates = [];

  for (const ps of payslips) {
    const basicUSD = Number(ps.grossUSD);
    const basicZIG = Number(ps.grossZIG);

    if (!basicUSD && !basicZIG) {
      console.log('  Skipping', ps.employee.employeeCode, '— no dual-currency gross on payslip');
      continue;
    }

    // Fetch transactions for this employee in this run
    const txns = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: RUN_ID, employeeId: ps.employeeId },
      include: { transactionCode: true },
    });

    let inputEarningsUSD = 0, inputEarningsZIG = 0;
    let inputPensionUSD  = 0, inputPensionZIG  = 0;
    let inputMedAidUSD   = 0, inputMedAidZIG   = 0;
    let inputNssaExclUSD = 0, inputNssaExclZIG = 0;
    let inputPayeExclUSD = 0, inputPayeExclZIG = 0;

    for (const t of txns) {
      const tc   = t.transactionCode;
      const amt  = Number(t.amount || 0);
      const isUSD = (t.currency ?? 'USD') === 'USD';
      const isEarning = tc?.type === 'EARNING' || tc?.type === 'BENEFIT';
      const isPreTax  = tc?.type === 'DEDUCTION' && tc?.preTax;
      const isMedAid  = tc?.type === 'DEDUCTION' && !tc?.preTax &&
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

    // Derive base salary split from stored grossUSD/grossZIG minus TC earnings
    const baseUSD = r2(basicUSD - inputEarningsUSD);
    const baseZIG = r2(basicZIG - inputEarningsZIG);

    const splitResult = calculateSplitSalaryPaye({
      usdParams: {
        baseSalary:          baseUSD,
        overtimeAmount:      inputEarningsUSD,
        pensionContribution: inputPensionUSD,
        pensionCap:          monthlyPensionCap,
        medicalAid:          inputMedAidUSD,
        taxCredits:          Number(ps.medicalAidCredit || 0) > 0 ? 0 : (Number(ps.employee?.taxCredits) || 0),
        nssaCeiling:         nssaCeilingUSD,
        nssaExcludedEarnings: inputNssaExclUSD,
        payeExcludedEarnings: inputPayeExclUSD,
      },
      zigParams: {
        baseSalary:          baseZIG,
        overtimeAmount:      inputEarningsZIG,
        pensionContribution: inputPensionZIG,
        pensionCap:          null,
        medicalAid:          inputMedAidZIG,
        taxCredits:          0,
        nssaCeiling:         nssaCeilingZIG,
        nssaExcludedEarnings: inputNssaExclZIG,
        payeExcludedEarnings: inputPayeExclZIG,
      },
      exchangeRate:    NEW_XR,
      taxBracketsUSD:  taxTable.brackets,
      annualBrackets:  taxTable.isAnnual ?? true,
      aidsLevyRate:    aidsRate,
      medicalAidCreditRate: medCreditRate,
      nssaEmployeeRate: nssaEmpRate,
      nssaEmployerRate: nssaEmprRate,
    });

    const newNetUSD = r2(basicUSD - splitResult.usd.nssaEmployee - splitResult.usd.paye - splitResult.usd.aidsLevy - inputPensionUSD - inputMedAidUSD);
    const newNetZIG = r2(basicZIG - splitResult.zig.nssaEmployee - splitResult.zig.paye - splitResult.zig.aidsLevy - inputPensionZIG - inputMedAidZIG);
    // Run-currency net (USD for this run)
    const newNetPay = newNetUSD;

    console.log('\n  Employee:', ps.employee.employeeCode, ps.employee.firstName, ps.employee.lastName);
    console.log('  Gross     USD', basicUSD.toFixed(2), ' ZiG', basicZIG.toFixed(2));
    console.log('  NSSA      USD', splitResult.usd.nssaEmployee, ' ZiG', splitResult.zig.nssaEmployee,
      '  (was USD', Number(ps.nssaUSD).toFixed(2), ' ZiG', Number(ps.nssaZIG).toFixed(2), ')');
    console.log('  PAYE      USD', splitResult.usd.paye, ' ZiG', splitResult.zig.paye,
      '  (was USD', Number(ps.payeUSD).toFixed(2), ' ZiG', Number(ps.payeZIG).toFixed(2), ')');
    console.log('  AIDS Levy USD', splitResult.usd.aidsLevy, ' ZiG', splitResult.zig.aidsLevy,
      '  (was USD', Number(ps.aidsLevyUSD).toFixed(2), ' ZiG', Number(ps.aidsLevyZIG).toFixed(2), ')');
    console.log('  Net USD  ', newNetUSD.toFixed(2), '  (was', Number(ps.netPayUSD).toFixed(2), ')');
    console.log('  Net ZiG  ', newNetZIG.toFixed(2), '  (was', Number(ps.netPayZIG).toFixed(2), ')');

    updates.push({
      payslipId: ps.id,
      employeeCode: ps.employee.employeeCode,
      nssaUSD:    splitResult.usd.nssaEmployee,
      nssaZIG:    splitResult.zig.nssaEmployee,
      payeUSD:    splitResult.usd.paye,
      payeZIG:    splitResult.zig.paye,
      aidsLevyUSD: splitResult.usd.aidsLevy,
      aidsLevyZIG: splitResult.zig.aidsLevy,
      nssaEmployee: r2(splitResult.totalResult.nssaEmployee),
      paye:          r2(splitResult.totalResult.payeBeforeLevy),
      aidsLevy:      r2(splitResult.totalResult.aidsLevy),
      netPayUSD: newNetUSD,
      netPayZIG: newNetZIG,
      netPay:    newNetPay,
    });
  }

  if (updates.length === 0) {
    console.log('\nNothing to update.');
    return;
  }

  // ── 5. Apply changes ────────────────────────────────────────────────────────
  console.log('\n=== APPLYING CHANGES ===');

  // Update run exchange rate
  await prisma.payrollRun.update({
    where: { id: RUN_ID },
    data: { exchangeRate: NEW_XR },
  });
  console.log('  Run exchange rate updated to', NEW_XR);

  // Update each payslip
  for (const u of updates) {
    await prisma.payslip.update({
      where: { id: u.payslipId },
      data: {
        nssaUSD:    u.nssaUSD,
        nssaZIG:    u.nssaZIG,
        payeUSD:    u.payeUSD,
        payeZIG:    u.payeZIG,
        aidsLevyUSD: u.aidsLevyUSD,
        aidsLevyZIG: u.aidsLevyZIG,
        nssaEmployee: u.nssaEmployee,
        paye:         u.paye,
        aidsLevy:     u.aidsLevy,
        netPayUSD:  u.netPayUSD,
        netPayZIG:  u.netPayZIG,
        netPay:     u.netPay,
      },
    });
    console.log('  Payslip updated for', u.employeeCode,
      '| USD PAYE', u.payeUSD, '| ZiG PAYE', u.payeZIG,
      '| USD NSSA', u.nssaUSD, '| ZiG NSSA', u.nssaZIG);
  }

  console.log('\nDone. Run', RUN_ID, 'now uses xr =', NEW_XR);
}

main().catch(console.error).finally(() => prisma.$disconnect());
