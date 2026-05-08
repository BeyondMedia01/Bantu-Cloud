'use strict';

const prisma = require('./prisma');
const { signClientToken, verifyClientToken } = require('./licenseJwt');

const TOKEN_PREFIX = 'tb_';

/**
 * Issue a new client license token.
 * Signs a JWT containing clientId, clientName, and employeeCap, then prefixes
 * it with "tb_" so it is instantly recognisable as a Bantu license token.
 *
 * Called on the CLOUD SERVER only — requires CLIENT_LICENSE_PRIVATE_KEY.
 * The resulting token is given to the client to enter during registration.
 *
 * @param {string} clientId
 * @param {string} clientName
 * @param {number} employeeCap   - Maximum number of active employees allowed
 * @param {number} expiryMonths  - License validity in months (default 12)
 */
const issueLicense = async (clientId, clientName, employeeCap = 10, expiryMonths = 12) => {
  const rawJwt = signClientToken({ clientId, clientName, employeeCap, expiryMonths });
  const token = TOKEN_PREFIX + rawJwt;

  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + expiryMonths);

  // Persist on cloud so the admin dashboard can list/revoke/renew tokens.
  await prisma.licenseToken.upsert({
    where: { clientId },
    update: { token, expiresAt, employeeCap, active: true },
    create: { clientId, token, expiresAt, employeeCap, active: true },
  });

  return { token, expiresAt, employeeCap };
};

/**
 * Validate a client license token.
 *
 * Verification is a pure RSA-SHA256 signature check against the public key —
 * no database lookup required, so it works fully offline.
 *
 * On success, the token payload is cached in the local LicenseToken table so
 * that checkEmployeeCap() can read the cap without re-parsing the JWT.
 *
 * @param {string} token - Full license token including the "tb_" prefix
 * @returns {{ valid: boolean, license?: { clientId, clientName, employeeCap, expiresAt }, reason?: string }}
 */
const validateLicense = async (token) => {
  if (!token?.startsWith(TOKEN_PREFIX)) {
    return { valid: false, reason: 'License token must start with tb_' };
  }

  let payload;
  try {
    payload = verifyClientToken(token.slice(TOKEN_PREFIX.length));
  } catch (err) {
    return { valid: false, reason: 'Invalid or expired license token' };
  }

  if (!payload.clientId || !payload.employeeCap) {
    return { valid: false, reason: 'Malformed license token payload' };
  }

  const expiresAt = new Date(payload.exp * 1000);

  // Cache locally so checkEmployeeCap works without re-parsing the JWT.
  await prisma.licenseToken.upsert({
    where: { clientId: payload.clientId },
    update: { token, employeeCap: payload.employeeCap, expiresAt, active: true },
    create: {
      clientId: payload.clientId,
      token,
      employeeCap: payload.employeeCap,
      expiresAt,
      active: true,
    },
  });

  return {
    valid: true,
    license: {
      clientId: payload.clientId,
      clientName: payload.clientName,
      employeeCap: payload.employeeCap,
      expiresAt,
    },
  };
};

/**
 * Revoke a client's license (cloud only — sets active = false in the DB).
 */
const revokeLicense = async (clientId) =>
  prisma.licenseToken.update({
    where: { clientId },
    data: { active: false },
  });

/**
 * Reactivate a client's license by re-issuing a fresh token.
 */
const reactivateLicense = async (clientId, clientName, expiryMonths = 12) => {
  const existing = await prisma.licenseToken.findUnique({ where: { clientId } });
  if (!existing) throw new Error('No license found for this client');
  return issueLicense(clientId, clientName || clientId, existing.employeeCap, expiryMonths);
};

/**
 * Check whether a client is within their licensed employee cap.
 * Reads the cached cap from the local LicenseToken table — works offline.
 */
const checkEmployeeCap = async (clientId) => {
  const license = await prisma.licenseToken.findUnique({ where: { clientId } });
  const subscription = await prisma.subscription.findUnique({ where: { clientId } }).catch(() => null);

  // License token cap takes priority over subscription cap.
  const cap = license?.employeeCap ?? subscription?.employeeCap ?? 10;
  const count = await prisma.employee.count({ where: { clientId } });

  return { withinCap: count < cap, cap, count };
};

module.exports = {
  issueLicense,
  validateLicense,
  revokeLicense,
  reactivateLicense,
  checkEmployeeCap,
};
