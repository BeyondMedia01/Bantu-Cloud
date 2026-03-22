/**
 * Seed script: adds earning codes 112–118 for every existing client.
 * Run with: node backend/scripts/seed_earning_codes.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EARNING_CODES = [
  {
    code: '112',
    name: 'Housing Allowance',
    type: 'EARNING',
    description: 'Monthly housing allowance',
    incomeCategory: 'ALLOWANCE',
    taxable: true,
    pensionable: true,
    affectsPaye: true,
    affectsNssa: true,
    affectsAidsLevy: true,
    preTax: false,
    calculationType: 'fixed',
    defaultValue: null,
    isActive: true,
  },
  {
    code: '113',
    name: 'Airtime Allowance',
    type: 'EARNING',
    description: 'Monthly airtime/communication allowance',
    incomeCategory: 'ALLOWANCE',
    taxable: false,
    pensionable: false,
    affectsPaye: false,
    affectsNssa: false,
    affectsAidsLevy: false,
    preTax: false,
    calculationType: 'fixed',
    defaultValue: null,
    isActive: true,
  },
  {
    code: '114',
    name: 'Overtime',
    type: 'EARNING',
    description: 'Overtime pay',
    incomeCategory: 'OVERTIME',
    taxable: true,
    pensionable: true,
    affectsPaye: true,
    affectsNssa: true,
    affectsAidsLevy: true,
    preTax: false,
    calculationType: 'fixed',
    defaultValue: null,
    isActive: true,
  },
  {
    code: '115',
    name: 'Commission',
    type: 'EARNING',
    description: 'Sales or performance commission',
    incomeCategory: 'COMMISSION',
    taxable: true,
    pensionable: true,
    affectsPaye: true,
    affectsNssa: true,
    affectsAidsLevy: true,
    preTax: false,
    calculationType: 'fixed',
    defaultValue: null,
    isActive: true,
  },
  {
    code: '116',
    name: 'Gratuity',
    type: 'EARNING',
    description: 'Terminal gratuity payment',
    incomeCategory: 'GRATUITY',
    taxable: true,
    pensionable: false,
    affectsPaye: true,
    affectsNssa: false,
    affectsAidsLevy: true,
    preTax: false,
    calculationType: 'fixed',
    defaultValue: null,
    isActive: true,
  },
  {
    code: '117',
    name: 'Backpay',
    type: 'EARNING',
    description: 'Retrospective salary or wage backpay',
    incomeCategory: null,
    taxable: true,
    pensionable: true,
    affectsPaye: true,
    affectsNssa: true,
    affectsAidsLevy: true,
    preTax: false,
    calculationType: 'fixed',
    defaultValue: null,
    isActive: true,
  },
  {
    code: '118',
    name: 'Responsibility Allowance',
    type: 'EARNING',
    description: 'Acting or responsibility allowance',
    incomeCategory: 'ALLOWANCE',
    taxable: true,
    pensionable: true,
    affectsPaye: true,
    affectsNssa: true,
    affectsAidsLevy: true,
    preTax: false,
    calculationType: 'fixed',
    defaultValue: null,
    isActive: true,
  },
];

async function main() {
  const clients = await prisma.client.findMany({ select: { id: true, name: true } });
  console.log(`Found ${clients.length} client(s). Seeding earning codes 112–118...\n`);

  for (const client of clients) {
    console.log(`Client: ${client.name} (${client.id})`);
    for (const entry of EARNING_CODES) {
      await prisma.transactionCode.upsert({
        where: { clientId_code: { clientId: client.id, code: entry.code } },
        update: {
          name: entry.name,
          description: entry.description,
          incomeCategory: entry.incomeCategory,
          taxable: entry.taxable,
          pensionable: entry.pensionable,
          affectsPaye: entry.affectsPaye,
          affectsNssa: entry.affectsNssa,
          affectsAidsLevy: entry.affectsAidsLevy,
          calculationType: entry.calculationType,
          isActive: entry.isActive,
        },
        create: {
          clientId: client.id,
          ...entry,
        },
      });
      console.log(`  ✓ ${entry.code} – ${entry.name}`);
    }
  }

  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
