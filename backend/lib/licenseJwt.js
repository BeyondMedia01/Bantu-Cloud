'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Key paths — in production, keys are loaded from environment variables
// DESKTOP_LICENSE_PRIVATE_KEY and DESKTOP_LICENSE_PUBLIC_KEY (PEM strings)
// In development, fall back to generated keys at runtime (for testing only)

let _privateKey = null;
let _publicKey = null;

function getPrivateKey() {
  if (_privateKey) return _privateKey;
  const fromEnv = process.env.DESKTOP_LICENSE_PRIVATE_KEY;
  if (fromEnv) {
    _privateKey = fromEnv.replace(/\\n/g, '\n');
    return _privateKey;
  }
  throw new Error('DESKTOP_LICENSE_PRIVATE_KEY environment variable is required');
}

function getPublicKey() {
  if (_publicKey) return _publicKey;
  const fromEnv = process.env.DESKTOP_LICENSE_PUBLIC_KEY;
  if (fromEnv) {
    _publicKey = fromEnv.replace(/\\n/g, '\n');
    return _publicKey;
  }
  throw new Error('DESKTOP_LICENSE_PUBLIC_KEY environment variable is required');
}

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

/**
 * Sign a license JWT token.
 * @param {object} payload - { accountId, deviceId, activatedAt }
 * @returns {string} signed JWT
 */
function signLicenseToken(payload) {
  const privateKey = getPrivateKey();
  return jwt.sign(
    {
      accountId: payload.accountId,
      deviceId: payload.deviceId,
      activatedAt: payload.activatedAt || new Date().toISOString(),
    },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: ONE_YEAR_SECONDS,
      issuer: 'bantu-license',
      subject: payload.deviceId,
    }
  );
}

/**
 * Verify and decode a license JWT token.
 * @param {string} token - The JWT string
 * @returns {object} decoded payload
 * @throws if token is invalid or expired
 */
function verifyLicenseToken(token) {
  const publicKey = getPublicKey();
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: 'bantu-license',
  });
}

/**
 * Generate a device ID from system information.
 * Uses a hash of MAC addresses for a stable hardware fingerprint.
 * @param {string} rawIdentifier - String of hardware identifiers
 * @returns {string} SHA-256 hash (hex)
 */
function hashDeviceId(rawIdentifier) {
  return crypto.createHash('sha256').update(rawIdentifier).digest('hex');
}

/**
 * Generate a test RSA key pair (for development/testing only).
 * Returns { privateKey, publicKey } as PEM strings.
 */
function generateTestKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'pkcs1', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  });
  return { privateKey, publicKey };
}

module.exports = { signLicenseToken, verifyLicenseToken, hashDeviceId, generateTestKeyPair };
