import { prisma } from './prisma';

export async function generateLicenseToken(): Promise<string> {
  const { randomBytes } = await import('node:crypto');
  return randomBytes(32).toString('hex');
}

export async function issueLicense(clientId: string, employeeCap = 10, expiryMonths = 12) {
  const token = await generateLicenseToken();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

  return prisma.licenseToken.upsert({
    where: { clientId },
    update: { token, expiresAt, employeeCap, active: true },
    create: { clientId, token, expiresAt, employeeCap, active: true },
  });
}

export async function validateLicense(token: string) {
  const license = await prisma.licenseToken.findUnique({
    where: { token },
    include: { client: true },
  });

  if (!license) return { valid: false as const, reason: 'License token not found' };
  if (!license.active) return { valid: false as const, reason: 'License has been revoked' };
  if (license.expiresAt < new Date()) return { valid: false as const, reason: 'License has expired' };

  return { valid: true as const, license };
}

export async function revokeLicense(clientId: string) {
  return prisma.licenseToken.update({
    where: { clientId },
    data: { active: false },
  });
}

export async function reactivateLicense(clientId: string, expiryMonths = 12) {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

  return prisma.licenseToken.update({
    where: { clientId },
    data: { active: true, expiresAt },
  });
}

export async function checkEmployeeCap(clientId: string) {
  const license = await prisma.licenseToken.findUnique({ where: { clientId } });
  const subscription = await prisma.subscription.findUnique({ where: { clientId } });
  const cap = license?.employeeCap ?? subscription?.employeeCap ?? 10;
  const count = await prisma.employee.count({ where: { clientId } });

  return { withinCap: count < cap, cap, count };
}
