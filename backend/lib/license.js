const crypto = require('crypto');
const prisma = require('./prisma');

const generateLicenseToken = () =>
  crypto.randomBytes(32).toString('hex');

const issueLicense = async (clientId, employeeCap = 10, expiryMonths = 12) => {
  const token = generateLicenseToken();
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

  return prisma.licenseToken.upsert({
    where: { clientId },
    update: { token, expiresAt, employeeCap, active: true },
    create: { clientId, token, expiresAt, employeeCap, active: true },
  });
};

const validateLicense = async (token) => {
  const license = await prisma.licenseToken.findUnique({
    where: { token },
    include: { client: true },
  });

  if (!license) return { valid: false, reason: 'License token not found' };
  if (!license.active) return { valid: false, reason: 'License has been revoked' };
  if (license.expiresAt < new Date()) return { valid: false, reason: 'License has expired' };

  return { valid: true, license };
};

const revokeLicense = async (clientId) =>
  prisma.licenseToken.update({
    where: { clientId },
    data: { active: false },
  });

const reactivateLicense = async (clientId, expiryMonths = 12) => {
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

  return prisma.licenseToken.update({
    where: { clientId },
    data: { active: true, expiresAt },
  });
};

const checkEmployeeCap = async (clientId) => {
  // Priority 1: License Token Cap
  const license = await prisma.licenseToken.findUnique({
    where: { clientId },
  });

  // Priority 2: Subscription Cap (Fallback)
  const subscription = await prisma.subscription.findUnique({
    where: { clientId },
  });

  const cap = license?.employeeCap ?? subscription?.employeeCap ?? 10;
  const count = await prisma.employee.count({ where: { clientId } });

  return {
    withinCap: count < cap,
    cap,
    count,
  };
};

module.exports = {
  generateLicenseToken,
  issueLicense,
  validateLicense,
  revokeLicense,
  reactivateLicense,
  checkEmployeeCap,
};
