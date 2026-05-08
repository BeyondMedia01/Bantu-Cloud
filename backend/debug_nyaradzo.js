#!/usr/bin/env node
/**
 * Debug script: find Nyaradzo TC and trace why it's not showing on payslips
 */
process.env.DATABASE_URL = 'postgresql://neondb_owner:npg_tsT2DlyPZWK0@ep-orange-silence-amcx7i1b-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // 1. Find the Nyaradzo transaction code
  const nyaradzoCodes = await prisma.transactionCode.findMany({
    where: {
      OR: [
        { name: { contains: 'nyaradzo', mode: 'insensitive' } },
        { name: { contains: 'funeral', mode: 'insensitive' } },
        { code: { contains: 'nyaradzo', mode: 'insensitive' } },
      ]
    },
    select: { id: true, code: true, name: true, type: true, preTax: true, incomeCategory: true, clientId: true }
  });

  console.log('\n=== Nyaradzo / Funeral Transaction Codes ===');
  console.table(nyaradzoCodes);

  if (nyaradzoCodes.length === 0) {
    console.log('No Nyaradzo TC found. Searching all DEDUCTION codes...');
    const allDeductions = await prisma.transactionCode.findMany({
      where: { type: 'DEDUCTION' },
      select: { id: true, code: true, name: true, type: true, preTax: true, incomeCategory: true },
      orderBy: { code: 'asc' }
    });
    console.log('\n=== All DEDUCTION codes ===');
    console.table(allDeductions);
    return;
  }

  const nyaTcId = nyaradzoCodes[0].id;

  // 2. Find PayrollTransactions for Nyaradzo (most recent 10)
  const ptxs = await prisma.payrollTransaction.findMany({
    where: { transactionCodeId: nyaTcId },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      payrollRun: { select: { id: true, currency: true, dualCurrency: true, status: true, startDate: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  console.log('\n=== Recent PayrollTransactions for Nyaradzo ===');
  if (ptxs.length === 0) {
    console.log('NO PayrollTransaction records found for this TC!');
    console.log('Check EmployeeTransaction (salary structure) records...');
  } else {
    for (const p of ptxs) {
      console.log(`  ${p.employee.firstName} ${p.employee.lastName} | run: ${p.payrollRun.startDate.toISOString().slice(0,7)} | currency: ${p.currency} | amount: ${p.amount} | runCurrency: ${p.payrollRun.currency} | dual: ${p.payrollRun.dualCurrency}`);
    }
  }

  // 3. Check EmployeeTransaction (salary structure defaults) for Nyaradzo
  const etxs = await prisma.employeeTransaction.findMany({
    where: { transactionCodeId: nyaTcId },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      transactionCode: { select: { name: true, type: true, incomeCategory: true } },
    },
    take: 10,
  });

  console.log('\n=== Active EmployeeTransactions (salary structure) for Nyaradzo ===');
  if (etxs.length === 0) {
    console.log('No active EmployeeTransaction defaults for Nyaradzo.');
  } else {
    for (const e of etxs) {
      console.log(`  ${e.employee.firstName} ${e.employee.lastName} | value: ${e.value} | currency: ${e.currency}`);
    }
  }

  // 4. Find the most recent COMPLETED payroll run and check what transactions that employee has
  if (ptxs.length > 0) {
    const sampleEmp = ptxs[0].employee;
    const sampleRunId = ptxs[0].payrollRunId;
    const allTxsForEmp = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: sampleRunId, employeeId: ptxs[0].employeeId },
      include: { transactionCode: { select: { code: true, name: true, type: true, incomeCategory: true, preTax: true } } },
      orderBy: { createdAt: 'asc' },
    });
    console.log(`\n=== All PayrollTransactions for ${sampleEmp.firstName} ${sampleEmp.lastName} in run ${sampleRunId} ===`);
    for (const t of allTxsForEmp) {
      const tc = t.transactionCode;
      console.log(`  [${tc.type}] ${tc.code} ${tc.name} | ${t.currency} ${t.amount} | preTax:${tc.preTax} | incomeCategory:${tc.incomeCategory}`);
    }

    // 5. Simulate the formatter filter
    const isDeductionTc = (tc) => tc.type === 'DEDUCTION' && !isMedicalAidTc(tc);
    const isMedicalAidTc = (tc) => {
      const name = (tc.name || '').toLowerCase();
      const code = (tc.code || '').toUpperCase();
      return tc.incomeCategory === 'MEDICAL_AID' ||
        /medical\s*aid|med\s*aid/.test(name) ||
        /MED_AID|MEDICAL_AID/.test(code) ||
        code === '301';
    };

    console.log('\n=== Formatter classification for each TC ===');
    for (const t of allTxsForEmp) {
      const tc = t.transactionCode;
      const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
      const isMedAid = isMedicalAidTc(tc);
      const isDed = isDeductionTc(tc);
      console.log(`  ${tc.name}: earning=${isEarning}, medAid=${isMedAid}, deduction=${isDed}`);
    }
  } else if (etxs.length > 0) {
    // No processed transactions, but has salary structure — find latest run
    const latestRun = await prisma.payrollRun.findFirst({
      where: { companyId: etxs[0].employee?.companyId, status: 'COMPLETED' },
      orderBy: { startDate: 'desc' },
    });
    if (latestRun) {
      console.log(`\nLatest run: ${latestRun.id} (${latestRun.startDate.toISOString().slice(0,10)})`);
      const empId = etxs[0].employeeId;
      const txCount = await prisma.payrollTransaction.count({ where: { payrollRunId: latestRun.id, employeeId: empId } });
      console.log(`Transactions in that run for this employee: ${txCount}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
