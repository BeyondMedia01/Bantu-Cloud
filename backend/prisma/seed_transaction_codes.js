const prisma = require('../lib/prisma');
const { autoSeedTransactionCodes } = require('../utils/transactionCodes');

/**
 * Manual seed script for transaction codes.
 * This can be run with: node prisma/seed_transaction_codes.js
 * (Or via npm: npm run seed:tcs)
 */
async function main() {
  console.log('--- Starting Manual Transaction Code Seed ---');
  await autoSeedTransactionCodes();
  console.log('--- Manual Seed Complete ---');
}

main()
  .catch((e) => {
    console.error('Fatal error during manual seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
