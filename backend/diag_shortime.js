const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkShortime() {
  try {
    const codes = await prisma.transactionCode.findMany({
      where: { code: '201' },
      include: { client: { select: { name: true } } }
    });
    console.log('--- Transaction Codes (201) ---');
    console.log(JSON.stringify(codes, null, 2));

    const inputs = await prisma.payrollInput.findMany({
      where: { transactionCode: { code: '201' } },
      include: { employee: { select: { firstName: true, lastName: true } } }
    });
    console.log('--- Payroll Inputs for 201 ---');
    console.log(JSON.stringify(inputs, null, 2));

    const txs = await prisma.payrollTransaction.findMany({
      where: { transactionCode: { code: '201' } },
      include: { employee: { select: { firstName: true, lastName: true } } }
    });
    console.log('--- Payroll Transactions for 201 ---');
    console.log(JSON.stringify(txs, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

checkShortime();
