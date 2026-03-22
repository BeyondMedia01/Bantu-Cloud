const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  // Find the first client to associate these codes with
  const client = await prisma.client.findFirst();

  if (!client) {
    console.error('No client found in the database. Please create a client first.');
    process.exit(1);
  }

  console.log(`Using client: ${client.name} (${client.id})`);

  const transactionCodes = [
    {
      code: '112',
      name: 'Housing Allowance',
      type: 'EARNING',
      incomeCategory: 'ALLOWANCE',
      taxable: true,
      pensionable: true,
      affectsPaye: true,
      affectsNssa: true,
      affectsAidsLevy: true,
    },
    {
      code: '113',
      name: 'Airtime Allowance',
      type: 'EARNING',
      incomeCategory: 'ALLOWANCE',
      taxable: true,
      pensionable: true,
      affectsPaye: true,
      affectsNssa: true,
      affectsAidsLevy: true,
    },
    {
      code: '114',
      name: 'overtime',
      type: 'EARNING',
      incomeCategory: 'OVERTIME',
      taxable: true,
      pensionable: true,
      affectsPaye: true,
      affectsNssa: true,
      affectsAidsLevy: true,
    },
    {
      code: '115',
      name: 'commission',
      type: 'EARNING',
      incomeCategory: 'COMMISSION',
      taxable: true,
      pensionable: true,
      affectsPaye: true,
      affectsNssa: true,
      affectsAidsLevy: true,
    },
    {
      code: '116',
      name: 'gratuity',
      type: 'EARNING',
      incomeCategory: 'GRATUITY',
      taxable: true,
      pensionable: true,
      affectsPaye: true,
      affectsNssa: true,
      affectsAidsLevy: true,
    },
    {
      code: '117',
      name: 'backpay',
      type: 'EARNING',
      incomeCategory: 'BASIC_SALARY',
      taxable: true,
      pensionable: true,
      affectsPaye: true,
      affectsNssa: true,
      affectsAidsLevy: true,
    },
    {
      code: '118',
      name: 'Responsibility allowance',
      type: 'EARNING',
      incomeCategory: 'ALLOWANCE',
      taxable: true,
      pensionable: true,
      affectsPaye: true,
      affectsNssa: true,
      affectsAidsLevy: true,
    },
    {
      code: '201',
      name: 'Shortime of days/hours not worked',
      type: 'DEDUCTION',
      incomeCategory: 'BASIC_SALARY',
      taxable: true,
      pensionable: true,
      preTax: true,
      affectsPaye: true,
      affectsNssa: true,
      affectsAidsLevy: true,
    },
  ];

  for (const tc of transactionCodes) {
    try {
      const created = await prisma.transactionCode.upsert({
        where: {
          clientId_code: {
            clientId: client.id,
            code: tc.code,
          },
        },
        update: tc,
        create: {
          ...tc,
          clientId: client.id,
        },
      });
      console.log(`Successfully created/updated code: ${created.code} (${created.name})`);
    } catch (error) {
      console.error(`Error creating code ${tc.code}:`, error.message);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
