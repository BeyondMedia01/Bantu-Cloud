const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const prisma = new PrismaClient();

async function main() {
  const tokenStr = 'BANTU-' + crypto.randomBytes(6).toString('hex').toUpperCase();
  const client = await prisma.client.create({ data: { name: 'Demo Client ' + Date.now() } });
  const token = await prisma.licenseToken.create({
    data: {
      clientId: client.id,
      token: tokenStr,
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year
      employeeCap: 100,
      active: true
    }
  });
  console.log('NEW_TOKEN=' + token.token);
}
main().catch(console.error).finally(() => prisma.$disconnect());
