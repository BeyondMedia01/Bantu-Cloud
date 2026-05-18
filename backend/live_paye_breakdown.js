/**
 * Live PAYE breakdown — pulls actual data from the database and shows
 * step-by-step how PAYE was (or would be) calculated for real employees.
 */

process.env.DATABASE_URL =
  'postgresql://neondb_owner:npg_tsT2DlyPZWK0@ep-orange-silence-amcx7i1b-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

const { PrismaClient } = require('@prisma/client');
const { calculatePaye, calculateSplitSalaryPaye } = require('./utils/taxEngine');
const { getSettings } = require('./lib/systemSettings');

const prisma = new PrismaClient();

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const hr = () => console.log('─'.repeat(78));
const hr2 = () => console.log('═'.repeat(78));
const lbl = (k, v, note = '') => {
  const s = v === null || v === undefined ? 'N/A' : typeof v === 'number' ? v.toFixed(2) : String(v);
  console.log('  ' + String(k).padEnd(42) + s.toString().padStart(12) + (note ? '   ' + note : ''));
};
const step = (n, txt) => console.log(`\n  [${ n}] ${txt}`);

async function main() {
  // ── 1. Load system settings ────────────────────────────────────────────────
  const settings = await getSettings([
    'NSSA_CEILING_USD', 'NSSA_CEILING_ZIG',
    'NSSA_EMPLOYEE_RATE', 'NSSA_EMPLOYER_RATE',
    'AIDS_LEVY_RATE', 'MEDICAL_AID_CREDIT_RATE',
    'PENSION_CAP_USD', 'PENSION_CAP_ZIG',
    'BONUS_EXEMPTION_USD', 'BONUS_EXEMPTION_ZIG',
    'SEVERANCE_EXEMPTION_USD',
    'ELDERLY_TAX_CREDIT_USD', 'ELDERLY_TAX_CREDIT_ZIG',
    'VEHICLE_BENEFIT_CC_1500_USD', 'VEHICLE_BENEFIT_CC_2000_USD', 'VEHICLE_BENEFIT_CC_3000_USD', 'VEHICLE_BENEFIT_ABOVE_3000_USD', 'VEHICLE_BENEFIT_ABOVE_2000_USD',
  ]);
  const s = (k) => parseFloat(settings[k] ?? 0);

  const nssaCeilingUSD     = s('NSSA_CEILING_USD');
  const nssaEmpRate        = s('NSSA_EMPLOYEE_RATE') / 100;
  const nssaEmprRate       = s('NSSA_EMPLOYER_RATE') / 100;
  const aidsLevyRate       = s('AIDS_LEVY_RATE') / 100;
  const medAidCreditRate   = s('MEDICAL_AID_CREDIT_RATE') / 100;
  const pensionCapAnnual   = s('PENSION_CAP_USD');
  const monthlyPensionCap  = pensionCapAnnual > 0 ? r2(pensionCapAnnual / 12) : null;
  const bonusExemptionUSD  = s('BONUS_EXEMPTION_USD');
  const elderlyCreditUSD   = s('ELDERLY_TAX_CREDIT_USD');

  hr2();
  console.log('  SYSTEM SETTINGS (live from DB)');
  hr2();
  lbl('NSSA employee rate', s('NSSA_EMPLOYEE_RATE'), '%');
  lbl('NSSA employer rate', s('NSSA_EMPLOYER_RATE'), '%');
  lbl('NSSA ceiling (USD/month)', nssaCeilingUSD);
  lbl('AIDS levy rate', s('AIDS_LEVY_RATE'), '%  (on PAYE after credits)');
  lbl('Medical aid credit rate', s('MEDICAL_AID_CREDIT_RATE'), '%  (50% of contributions)');
  lbl('Pension cap (annual)', pensionCapAnnual, 'USD/year');
  lbl('Pension cap (monthly = annual÷12)', monthlyPensionCap, 'USD/month');
  lbl('Bonus exemption', bonusExemptionUSD, 'USD/year');
  lbl('Elderly tax credit (65+)', elderlyCreditUSD, 'USD/month');

  // ── 2. Load active USD tax table ──────────────────────────────────────────
  const taxTable = await prisma.taxTable.findFirst({
    where: { currency: 'USD', isActive: true },
    include: { brackets: { orderBy: { lowerBound: 'asc' } } },
  }) ?? await prisma.taxTable.findFirst({
    where: { currency: 'USD' },
    include: { brackets: { orderBy: { lowerBound: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });

  hr2();
  console.log(`  ACTIVE TAX TABLE: ${taxTable?.name ?? 'N/A'}  [${taxTable?.isAnnual ? 'ANNUAL' : 'MONTHLY'} brackets]`);
  hr2();
  if (!taxTable || !taxTable.brackets.length) {
    console.log('  !! No active tax table found — cannot show live calculation');
    return;
  }
  console.log('  ' + 'Lower'.padStart(12) + 'Upper'.padStart(14) + 'Rate'.padStart(8) + 'Fixed Amt'.padStart(12));
  console.log('  ' + '─'.repeat(48));
  for (const b of taxTable.brackets) {
    const up = b.upperBound > 1e9 ? '∞' : b.upperBound.toFixed(2);
    console.log(
      '  ' +
      String(b.lowerBound.toFixed(2)).padStart(12) +
      up.padStart(14) +
      (b.rate * 100).toFixed(0).padStart(7) + '%' +
      String((b.fixedAmount ?? 0).toFixed(2)).padStart(12),
    );
  }
  const annualBrackets = taxTable.isAnnual ?? true;

  // ── 3. Load most recent COMPLETED payroll run ─────────────────────────────
  const latestRun = await prisma.payrollRun.findFirst({
    where: { status: 'COMPLETED' },
    orderBy: { startDate: 'desc' },
    include: { company: true },
  });

  if (!latestRun) {
    console.log('\n  !! No completed payroll run found in the database.');
    await prisma.$disconnect();
    return;
  }

  hr2();
  console.log(`  PAYROLL RUN: ${latestRun.name ?? latestRun.id}`);
  console.log(`  Period  : ${new Date(latestRun.startDate).toLocaleDateString()} → ${new Date(latestRun.endDate).toLocaleDateString()}`);
  console.log(`  Currency: ${latestRun.currency}${latestRun.dualCurrency ? ' + ZiG (dual)' : ''}`);
  console.log(`  Company : ${latestRun.company?.name ?? latestRun.companyId}`);
  console.log(`  Exchange rate: ${latestRun.exchangeRate ?? 'N/A'}`);
  hr2();

  const xr = latestRun.exchangeRate > 0 ? latestRun.exchangeRate : 1;

  // ── 4. Load payslips for this run (up to 5) ───────────────────────────────
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: latestRun.id },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, employeeCode: true,
          baseRate: true, currency: true, taxMethod: true,
          dateOfBirth: true, motorVehicleBenefit: true, vehicleEngineCategory: true, vehicleStartDate: true, vehicleEndDate: true,
          splitUsdPercent: true,
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

  // Load transactions for these employees
  const empIds = payslips.map((p) => p.employeeId);
  const transactions = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: latestRun.id, employeeId: { in: empIds } },
    include: {
      transactionCode: {
        select: { type: true, preTax: true, name: true, code: true,
                  incomeCategory: true, taxable: true, affectsNssa: true, affectsPaye: true },
      },
    },
  });
  const txByEmp = {};
  for (const t of transactions) {
    (txByEmp[t.employeeId] = txByEmp[t.employeeId] || []).push(t);
  }

  // Helper: resolve motor vehicle benefit
  const vehicleBenefitTable = {
    UP_TO_1500CC:    s('VEHICLE_BENEFIT_CC_1500_USD'),
    CC_1501_TO_2000: s('VEHICLE_BENEFIT_CC_2000_USD'),
    CC_2001_TO_3000: s('VEHICLE_BENEFIT_CC_3000_USD'),
    ABOVE_3000CC:    s('VEHICLE_BENEFIT_ABOVE_3000_USD'),
    ABOVE_2000CC:    s('VEHICLE_BENEFIT_ABOVE_2000_USD'), // legacy
  };
  const resolveVehicle = (emp) => {
    const cat = emp.vehicleEngineCategory;
    const fullBenefit = (!cat || cat === 'NONE')
      ? (emp.motorVehicleBenefit || 0)
      : (vehicleBenefitTable[cat] ?? emp.motorVehicleBenefit ?? 0);

    if (!fullBenefit) return 0;

    const periodStart = new Date(latestRun.startDate);
    const periodEnd   = new Date(latestRun.endDate);
    const daysInMonth = Math.round((periodEnd - periodStart) / 86400000) + 1;

    const availFrom = emp.vehicleStartDate ? new Date(emp.vehicleStartDate) : null;
    const availTo   = emp.vehicleEndDate   ? new Date(emp.vehicleEndDate)   : null;

    const effectiveFrom = availFrom && availFrom > periodStart ? availFrom : periodStart;
    const effectiveTo   = availTo   && availTo   < periodEnd   ? availTo   : periodEnd;

    if (effectiveFrom > periodEnd || (availTo && effectiveTo < periodStart)) return 0;

    const daysAvailable = Math.round((effectiveTo - effectiveFrom) / 86400000) + 1;
    if (daysAvailable >= daysInMonth) return fullBenefit;
    return Math.round((fullBenefit * daysAvailable / daysInMonth) * 100) / 100;
  };

  // ── 5. Per-employee step-by-step breakdown ────────────────────────────────
  for (const ps of payslips) {
    const emp = ps.employee;
    const name = `${emp.firstName} ${emp.lastName}`;
    const txs = txByEmp[ps.employeeId] || [];

    // Categorise transactions
    let earnings = 0, pension = 0, medAid = 0, postTax = 0;
    let earningsUSD = 0, earningsZIG = 0, pensionUSD = 0, pensionZIG = 0;
    let medAidUSD = 0, medAidZIG = 0;
    let nssaExcluded = 0, payeExcluded = 0;

    const toRun = (usd, zig) => {
      if (latestRun.dualCurrency) return 0;
      return latestRun.currency === 'ZiG'
        ? (zig || 0) + (usd || 0) * xr
        : (usd || 0) + (zig || 0) / xr;
    };

    for (const t of txs) {
      const tc = t.transactionCode;
      const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
      const isPreTax  = tc.type === 'DEDUCTION' && tc.preTax;
      const isMedAid  = tc.type === 'DEDUCTION' && !tc.preTax && (
        tc.incomeCategory === 'MEDICAL_AID' ||
        /medical\s*aid|med\s*aid/i.test(tc.name) ||
        /MED_AID|MEDICAL_AID/i.test(tc.code) ||
        (tc.name.toLowerCase().includes('medical') && /^\d+$/.test(tc.code))
      );

      if (latestRun.dualCurrency) {
        if (isEarning) {
          earningsUSD += t.currency === 'USD' ? (t.amount || 0) : 0;
          earningsZIG += t.currency === 'ZiG' ? (t.amount || 0) : 0;
        } else if (isPreTax) {
          pensionUSD += t.currency === 'USD' ? (t.amount || 0) : 0;
          pensionZIG += t.currency === 'ZiG' ? (t.amount || 0) : 0;
        } else if (isMedAid) {
          medAidUSD += t.currency === 'USD' ? (t.amount || 0) : 0;
          medAidZIG += t.currency === 'ZiG' ? (t.amount || 0) : 0;
        }
      } else {
        const amt = toRun(t.currency === 'USD' ? t.amount : 0, t.currency === 'ZiG' ? t.amount : 0);
        if (isEarning) {
          earnings += amt;
          if (tc.affectsNssa === false) nssaExcluded += amt;
          if (tc.affectsPaye === false || tc.taxable === false) payeExcluded += amt;
        } else if (isPreTax) {
          pension += amt;
        } else if (isMedAid) {
          medAid += amt;
        } else {
          postTax += amt;
        }
      }
    }

    // Elderly?
    let elderlyCredit = 0, effectiveNssaEmpRate = nssaEmpRate;
    if (emp.dateOfBirth) {
      const runStart = new Date(latestRun.startDate);
      const dob = new Date(emp.dateOfBirth);
      const age = runStart.getFullYear() - dob.getFullYear();
      const bday = new Date(runStart.getFullYear(), dob.getMonth(), dob.getDate());
      if (age > 65 || (age === 65 && runStart >= bday)) {
        elderlyCredit = elderlyCreditUSD;
        effectiveNssaEmpRate = 0;
      }
    }

    const vehicleBenefit = resolveVehicle(emp);
    const baseRate = ps.basicSalaryApplied || emp.baseRate || 0;

    hr2();
    console.log(`  EMPLOYEE: ${name}  [${emp.employeeCode ?? '—'}]`);
    hr2();

    // ── Transaction code breakdown ──
    if (txs.length > 0) {
      console.log('\n  PAYROLL INPUTS (transaction codes):');
      console.log('  ' + 'Code'.padEnd(10) + 'Name'.padEnd(30) + 'Type'.padEnd(12) + 'Amount'.padStart(12));
      console.log('  ' + '─'.repeat(66));
      for (const t of txs) {
        const tc = t.transactionCode;
        const tag = tc.preTax ? '[PRE-TAX]' : tc.incomeCategory === 'MEDICAL_AID' ? '[MED AID]' : '';
        console.log(
          '  ' +
          tc.code.padEnd(10) +
          (tc.name + ' ' + tag).substring(0, 30).padEnd(30) +
          tc.type.padEnd(12) +
          (t.amount || 0).toFixed(2).padStart(12) +
          (t.currency !== latestRun.currency ? ` ${t.currency}` : ''),
        );
      }
    }

    // ── Single-currency step-by-step ──
    if (!latestRun.dualCurrency) {
      const cashEarnings = r2(baseRate + earnings);
      const nssaBasis    = r2(Math.max(0, Math.min(cashEarnings - nssaExcluded, nssaCeilingUSD)));
      const nssaEmployee = r2(nssaBasis * effectiveNssaEmpRate);
      const nssaEmployer = r2(nssaBasis * nssaEmprRate);
      const effectivePension = monthlyPensionCap !== null ? r2(Math.min(pension, monthlyPensionCap)) : r2(pension);
      const grossForTax  = r2(cashEarnings + vehicleBenefit - payeExcluded);
      const taxableIncome = r2(Math.max(0, grossForTax - nssaEmployee - effectivePension));
      const taxBase      = annualBrackets ? r2(taxableIncome * 12) : taxableIncome;

      // Marginal band calculation
      const normBrackets = taxTable.brackets
        .sort((a, b) => a.lowerBound - b.lowerBound)
        .map((b) => ({ lower: b.lowerBound, upper: b.upperBound ?? Infinity, rate: b.rate }));

      let annualPaye = 0;
      const bandRows = [];
      for (const band of normBrackets) {
        if (taxBase <= (band.lower - 1)) break;
        const inBand = r2(Math.min(taxBase, band.upper) - (band.lower - 1));
        const tax    = r2(inBand * band.rate);
        annualPaye  += tax;
        if (band.rate > 0 || inBand > 0) {
          bandRows.push({ lower: band.lower, upper: band.upper, rate: band.rate, inBand, tax });
        }
      }
      annualPaye = r2(annualPaye);

      const payeBeforeCredit  = annualBrackets ? r2(annualPaye / 12) : annualPaye;
      const medAidCredit      = r2(medAid * medAidCreditRate);
      const taxCredits        = elderlyCredit > 0 ? elderlyCredit : (/* emp.taxCredits */ 0);
      const payeAfterCredits  = r2(Math.max(0, payeBeforeCredit - medAidCredit - taxCredits));
      const aidsLevy          = r2(payeAfterCredits * aidsLevyRate);
      const totalPaye         = r2(payeAfterCredits + aidsLevy);
      const totalDeductions   = r2(nssaEmployee + effectivePension + medAid + totalPaye + postTax);
      const netSalary         = r2(cashEarnings - totalDeductions);

      console.log('\n  STEP-BY-STEP PAYE CALCULATION:');
      hr();
      step(1, 'CASH EARNINGS');
      lbl('Basic salary (applied)', baseRate);
      lbl('TC earnings (inputs)', earnings);
      lbl('─── Total cash earnings', cashEarnings, '← NSSA base before ceiling');

      step(2, 'NSSA');
      lbl('NSSA-excluded earnings', nssaExcluded, '(codes with affectsNssa=false)');
      lbl(`NSSA basis = min(${cashEarnings.toFixed(2)}-${nssaExcluded.toFixed(2)}, ${nssaCeilingUSD})`, nssaBasis);
      lbl(`NSSA employee = ${nssaBasis}×${(effectiveNssaEmpRate*100).toFixed(1)}%`, nssaEmployee, elderlyCredit > 0 ? '(0% — elderly)' : '');
      lbl(`NSSA employer = ${nssaBasis}×${(nssaEmprRate*100).toFixed(1)}%`, nssaEmployer);

      step(3, 'PAYE EXCLUDED EARNINGS');
      lbl('PAYE-excluded (affectsPaye=false)', payeExcluded, '(reimbursements, non-taxable)');
      lbl('Motor vehicle benefit', vehicleBenefit, vehicleBenefit ? '(deemed taxable fringe, excl. NSSA)' : '(none)');

      step(4, 'PRE-TAX DEDUCTIONS');
      lbl('Pension contribution (input)', pension);
      lbl(`Monthly cap = ${pensionCapAnnual}/12`, monthlyPensionCap);
      lbl('Effective pension (applied)', effectivePension, pension > (monthlyPensionCap ?? Infinity) ? '← CAPPED' : '← within cap');

      step(5, 'TAXABLE INCOME');
      lbl('grossForTax = cash + vehicle - payeExcluded', grossForTax);
      lbl('Taxable income = grossForTax - NSSA - pension', taxableIncome);
      if (annualBrackets) lbl('Annualised = taxable × 12', taxBase, '(FDS — annual brackets)');

      step(6, 'TAX BANDS (marginal accumulation)');
      console.log('  ' + 'Band'.padEnd(24) + 'Rate'.padStart(6) + 'In Band'.padStart(14) + 'Tax'.padStart(12));
      console.log('  ' + '─'.repeat(58));
      for (const b of bandRows) {
        const up = b.upper > 1e9 ? '∞' : b.upper.toFixed(0);
        const range = `$${b.lower}–$${up}`;
        console.log(
          '  ' +
          range.padEnd(24) +
          ((b.rate * 100).toFixed(0) + '%').padStart(6) +
          b.inBand.toFixed(2).padStart(14) +
          b.tax.toFixed(2).padStart(12),
        );
      }
      console.log('  ' + '─'.repeat(58));
      if (annualBrackets) {
        lbl('Annual PAYE total', annualPaye);
        lbl('Monthly PAYE = annual ÷ 12', payeBeforeCredit);
      } else {
        lbl('PAYE (monthly brackets)', payeBeforeCredit);
      }

      step(7, 'CREDITS');
      lbl('Medical aid contribution', medAid);
      lbl(`Medical aid credit = ${medAid}×${(medAidCreditRate*100).toFixed(0)}%`, medAidCredit);
      if (elderlyCredit > 0) lbl('Elderly credit (65+)', elderlyCredit);
      lbl('PAYE after credits', payeAfterCredits);

      step(8, 'AIDS LEVY');
      lbl(`AIDS Levy = ${payeAfterCredits.toFixed(2)} × ${(aidsLevyRate*100).toFixed(0)}%`, aidsLevy, '(3% of post-credit PAYE)');

      step(9, 'TOTALS');
      hr();
      lbl('PAYE (income tax)', payeAfterCredits);
      lbl('AIDS Levy', aidsLevy);
      lbl('Total PAYE', totalPaye);
      lbl('NSSA employee', nssaEmployee);
      lbl('Pension applied', effectivePension);
      lbl('Medical aid', medAid);
      lbl('Post-tax deductions', postTax);
      lbl('Total deductions', totalDeductions);
      lbl('Net salary', netSalary);
      hr();

      step(10, 'RECONCILE WITH STORED PAYSLIP');
      hr();
      const diff = (field, computed, stored) => {
        const ok = Math.abs(computed - (stored || 0)) < 0.02;
        lbl(field + (ok ? ' ✓' : ' ✗'), stored ?? 0,
            ok ? `matches computed ${computed.toFixed(2)}` : `!! computed ${computed.toFixed(2)}, stored ${(stored||0).toFixed(2)}`);
      };
      diff('Gross (stored)',         cashEarnings,     ps.gross);
      diff('PAYE (stored)',          payeAfterCredits, ps.paye);
      diff('AIDS Levy (stored)',     aidsLevy,         ps.aidsLevy);
      diff('Total PAYE (stored)',    totalPaye,        r2((ps.paye||0) + (ps.aidsLevy||0)));
      diff('NSSA employee (stored)', nssaEmployee,     ps.nssaEmployee);
      diff('Pension (stored)',       effectivePension, ps.pensionApplied);
      diff('Net pay (stored)',       netSalary - postTax, ps.netPay);
      hr();

    } else {
      // Dual-currency summary
      console.log('\n  [DUAL-CURRENCY RUN]');
      lbl('Gross USD', ps.grossUSD ?? 0);
      lbl('Gross ZiG', ps.grossZIG ?? 0);
      lbl('PAYE USD', ps.payeUSD ?? 0);
      lbl('PAYE ZiG', ps.payeZIG ?? 0);
      lbl('AIDS Levy USD', ps.aidsLevyUSD ?? 0);
      lbl('AIDS Levy ZiG', ps.aidsLevyZIG ?? 0);
      lbl('NSSA USD', ps.nssaUSD ?? 0);
      lbl('NSSA ZiG', ps.nssaZIG ?? 0);
      lbl('Net pay USD', ps.netPayUSD ?? 0);
      lbl('Net pay ZiG', ps.netPayZIG ?? 0);
      lbl('Exchange rate used', xr);
      const totalPayeUSD = r2((ps.payeUSD||0)+(ps.aidsLevyUSD||0));
      const totalPayeZIG = r2((ps.payeZIG||0)+(ps.aidsLevyZIG||0));
      lbl('Total PAYE USD', totalPayeUSD);
      lbl('Total PAYE ZiG', totalPayeZIG);
      lbl('Total PAYE (USD equiv)', r2(totalPayeUSD + totalPayeZIG/xr));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
