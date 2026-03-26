const { autoSeedTransactionCodes } = require('./utils/transactionCodes');
const prisma = require('./lib/prisma');

async function main() {
  console.log('Manually triggering transaction code seeding...');
  await autoSeedTransactionCodes();
  console.log('Seeding complete.');
  const codes = await prisma.transactionCode.findMany({
    where: { code: '122' }
  });
  console.log('Found "Overtime 1.0x" codes:', JSON.stringify(codes, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
