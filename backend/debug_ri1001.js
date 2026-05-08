/**
 * PAYE breakdown for employee RI1001
 * Run: node backend/debug_ri1001.js
 */
require('dotenv').config();
const prisma = require('./lib/prisma');

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function main() {
  // 1. Find the employee
  const emp = await prisma.employee.findFirst({
    where: { employeeNumber: 'RI1001' },
    include: { company: true },
  });
  if (!emp) { console.log('Employee RI1001 not found'); return; }

  console.log('=== EMPLOYEE RI1001 ===');
  console.log(`Name        : ${emp.firstName} ${emp.lastName}`);
  console.log(`Currency    : ${emp.currency}`);
  console.log(`Base Rate   : ${emp.baseRate}`);
  console.log(`Tax Method  : ${emp.taxMethod}`);
  console.log(`Company     : ${emp.company?.name}`);
  console.log('');

  // 2. Find the most recent payroll run for this company
  const run = await prisma.payrollRun.findFirst({
    where: { companyId: emp.companyId },
    orderBy: { createdAt: 'desc' },
  });
  if (!run) { console.log('No payroll run found'); return; }

  console.log('=== PAYROLL RUN ===');
  console.log(`Run ID      : ${run.id}`);
  console.log(`Currency    : ${run.currency}`);
  console.log(`Dual        : ${run.dualCurrency}`);
  console.log(`Exchange Rate: ${run.exchangeRate}`);
  console.log(`Period      : ${run.startDate?.toISOString().slice(0,10)} → ${run.endDate?.toISOString().slice(0,10)}`);
  console.log('');

  // 3. Find the payslip for this employee in this run
  const payslip = await prisma.payslip.findFirst({
    where: { employeeId: emp.id, payrollRunId: run.id },
  });
  if (!payslip) { console.log('No payslip found for this run'); return; }

  console.log('=== PAYSLIP (stored values) ===');
  const p = payslip;
  console.log(`Basic Salary Applied : ${p.basicSalaryApplied}`);
  console.log(`Gross Salary         : ${p.grossSalary}`);
  console.log(`Gross USD            : ${p.grossUSD ?? 'n/a'}`);
  console.log(`Gross ZiG            : ${p.grossZIG ?? 'n/a'}`);
  console.log(`NSSA Employee        : ${p.nssaEmployee}`);
  console.log(`NSSA USD             : ${p.nssaUSD ?? 'n/a'}`);
  console.log(`NSSA ZiG             : ${p.nssaZIG ?? 'n/a'}`);
  console.log(`Pension Applied      : ${p.pensionApplied}`);
  console.log(`Taxable Income       : ${p.taxableIncome}`);
  console.log(`PAYE (before levy)   : ${p.payeBeforeLevy}`);
  console.log(`AIDS Levy            : ${p.aidsLevy}`);
  console.log(`Total PAYE           : ${p.totalPaye}`);
  console.log(`PAYE USD             : ${p.payeUSD ?? 'n/a'}`);
  console.log(`PAYE ZiG             : ${p.payeZIG ?? 'n/a'}`);
  console.log(`Net Pay              : ${p.netPay}`);
  console.log('');

  // 4. Pull the payroll transactions for this employee in this run
  const txns = await prisma.payrollTransaction.findMany({
    where: { payslipId: payslip.id },
    include: { transactionCode: true },
  });

  if (txns.length > 0) {
    console.log('=== PAYROLL TRANSACTIONS ===');
    for (const t of txns) {
      const tc = t.transactionCode;
      console.log(`  [${tc?.code ?? '?'}] ${tc?.name ?? '?'} (${t.type}) = ${t.amount}  | taxable=${tc?.taxable} affectsPaye=${tc?.affectsPaye} affectsNssa=${tc?.affectsNssa}`);
    }
    console.log('');
  }

  // 5. Pull active tax brackets
  const taxTable = await prisma.taxTable.findFirst({
    where: { companyId: emp.companyId, currency: 'USD', isActive: true },
    include: { brackets: { orderBy: { lowerBound: 'asc' } } },
  });

  if (taxTable) {
    console.log(`=== TAX TABLE (${taxTable.name}, annual=${taxTable.isAnnual}) ===`);
    for (const b of taxTable.brackets) {
      console.log(`  ${b.lowerBound} – ${b.upperBound ?? '∞'}  @ ${(b.rate * 100).toFixed(1)}%`);
    }
    console.log('');
  }

  // 6. Load NSSA settings
  const nssaKeys = ['NSSA_EMPLOYEE_RATE', 'NSSA_EMPLOYER_RATE', 'NSSA_EMPLOYEE_RATE_ZIG', 'NSSA_EMPLOYER_RATE_ZIG', 'NSSA_CEILING_USD', 'NSSA_CEILING_ZIG', 'AIDS_LEVY_RATE'];
  const settingRows = await prisma.systemSetting.findMany({
    where: { settingName: { in: nssaKeys }, isActive: true },
  });
  const settings = Object.fromEntries(settingRows.map(r => [r.settingName, parseFloat(r.settingValue)]));

  const isZIG = run.currency === 'ZiG';
  const nssaRate = isZIG ? (settings.NSSA_EMPLOYEE_RATE_ZIG ?? settings.NSSA_EMPLOYEE_RATE ?? 4.5) : (settings.NSSA_EMPLOYEE_RATE ?? 4.5);
  const nssaCeiling = isZIG ? (settings.NSSA_CEILING_ZIG ?? 18000) : (settings.NSSA_CEILING_USD ?? 700);
  const aidsLevyRate = (settings.AIDS_LEVY_RATE ?? 3) / 100;

  console.log('=== SETTINGS USED ===');
  console.log(`NSSA Rate (${isZIG ? 'ZiG' : 'USD'}) : ${nssaRate}%`);
  console.log(`NSSA Ceiling            : ${nssaCeiling}`);
  console.log(`AIDS Levy Rate          : ${settings.AIDS_LEVY_RATE ?? 3}%`);
  console.log('');

  // 7. Manual re-trace of PAYE for a single-currency run
  if (!run.dualCurrency) {
    const basic = Number(p.basicSalaryApplied) || Number(emp.baseRate) || 0;
    const gross = Number(p.grossSalary) || 0;
    const nssaEmployee = Number(p.nssaEmployee) || 0;
    const pension = Number(p.pensionApplied) || 0;

    const nssaBasis = Math.min(gross, nssaCeiling);
    const nssaCalc = r2(nssaBasis * nssaRate / 100);
    const taxableIncome = r2(gross - nssaEmployee - pension);
    const taxBase = taxTable?.isAnnual ? taxableIncome * 12 : taxableIncome;

    console.log('=== PAYE MANUAL RE-TRACE ===');
    console.log(`Gross salary           : ${gross}`);
    console.log(`NSSA basis             : min(${gross}, ${nssaCeiling}) = ${nssaBasis}`);
    console.log(`NSSA employee          : ${nssaBasis} × ${nssaRate}% = ${nssaCalc}`);
    console.log(`Pension applied        : ${pension}`);
    console.log(`Taxable income         : ${gross} − ${nssaEmployee} − ${pension} = ${taxableIncome}`);
    if (taxTable?.isAnnual) {
      console.log(`Annualised (×12)       : ${r2(taxBase)}`);
    }

    if (taxTable) {
      let annualPaye = 0;
      const bands = taxTable.brackets.sort((a,b) => a.lowerBound - b.lowerBound);
      for (const band of bands) {
        const lower = band.lowerBound;
        const upper = band.upperBound ?? Infinity;
        if (taxBase <= lower - 1) break;
        const taxableInBand = Math.min(taxBase, upper) - (lower - 1);
        const tax = taxableInBand * band.rate;
        annualPaye += tax;
        console.log(`  Band ${lower}–${upper === Infinity ? '∞' : upper} @ ${(band.rate*100).toFixed(1)}%: taxable=${r2(taxableInBand)} → tax=${r2(tax)}`);
      }
      const monthlyPaye = taxTable.isAnnual ? r2(annualPaye / 12) : r2(annualPaye);
      console.log(`${taxTable.isAnnual ? `Annual PAYE ${r2(annualPaye)} ÷ 12` : 'Monthly PAYE'} = ${monthlyPaye}`);
      const aidsLevy = r2(monthlyPaye * aidsLevyRate);
      const totalPaye = r2(monthlyPaye + aidsLevy);
      console.log(`AIDS Levy (3%)         : ${monthlyPaye} × 3% = ${aidsLevy}`);
      console.log(`Total PAYE incl. levy  : ${monthlyPaye} + ${aidsLevy} = ${totalPaye}`);
      console.log('');
      console.log(`Stored payslip PAYE    : ${p.payeBeforeLevy} (before levy) / ${p.totalPaye} (total)`);
    }
  } else {
    console.log('(Dual-currency run — see payslip stored values above for USD/ZiG split)');
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
