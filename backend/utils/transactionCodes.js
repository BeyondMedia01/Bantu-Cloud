const prisma = require('../lib/prisma');

async function autoSeedTransactionCodes() {
  try {
    const clients = await prisma.client.findMany({ select: { id: true } });
    
    if (clients.length === 0) {
      console.log('No clients found, skipping transaction code seeding.');
      return;
    }

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
        pensionable: false,
        affectsPaye: true,
        affectsNssa: false,
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
        pensionable: false,
        affectsPaye: true,
        affectsNssa: false,
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

    // Batch all upserts into a single transaction to avoid O(clients × codes) round-trips
    let totalUpserted = 0;
    const upsertOps = [];
    for (const client of clients) {
      for (const tc of transactionCodes) {
        upsertOps.push(
          prisma.transactionCode.upsert({
            where: { clientId_code: { clientId: client.id, code: tc.code } },
            update: {
              name: tc.name,
              incomeCategory: tc.incomeCategory,
              taxable: tc.taxable,
              pensionable: tc.pensionable,
              preTax: tc.preTax || false,
              affectsPaye: tc.affectsPaye,
              affectsNssa: tc.affectsNssa,
              affectsAidsLevy: tc.affectsAidsLevy,
            },
            create: { ...tc, clientId: client.id },
          })
        );
        totalUpserted++;
      }
    }
    await prisma.$transaction(upsertOps);

    if (totalUpserted > 0) {
      console.log(`Auto-seeded ${totalUpserted} transaction codes across ${clients.length} clients.`);
    }
  } catch (error) {
    console.error('Failed to auto-seed transaction codes:', error);
  }
}

module.exports = { autoSeedTransactionCodes };
