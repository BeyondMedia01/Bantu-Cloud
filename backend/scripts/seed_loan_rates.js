const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const effectiveDate = new Date('2024-01-01T00:00:00Z');
  const settings = [
    {
      settingName: 'LOAN_PRESCRIBED_RATE_USD',
      settingValue: '15',
      dataType: 'NUMBER',
      description: 'ZIMRA prescribed interest rate for USD loans (%)',
      isActive: true,
      effectiveFrom: effectiveDate,
    },
    {
      settingName: 'LOAN_PRESCRIBED_RATE_ZIG',
      settingValue: '150',
      dataType: 'NUMBER',
      description: 'ZIMRA prescribed interest rate for ZiG loans (%)',
      isActive: true,
      effectiveFrom: effectiveDate,
    }
  ];

  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { 
        settingName_effectiveFrom: {
          settingName: s.settingName,
          effectiveFrom: s.effectiveFrom
        }
      },
      update: s,
      create: s,
    });
    console.log(`Upserted setting: ${s.settingName}`);
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
