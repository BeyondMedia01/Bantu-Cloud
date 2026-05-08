'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ─── Device license keys (DESKTOP_LICENSE_*) ─────────────────────────────────
// Used for per-device activation tokens stored in the Tauri secure store.

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

// ─── Client license keys (CLIENT_LICENSE_*) ───────────────────────────────────
// Used for tb_ prefixed client license tokens that encode employeeCap + expiry.
// Private key lives on the cloud server only (for signing).
// Public key is embedded in the desktop sidecar binary (for offline verification).

let _clientPrivateKey = null;
let _clientPublicKey = null;

function getClientPrivateKey() {
  if (_clientPrivateKey) return _clientPrivateKey;
  const fromEnv = process.env.CLIENT_LICENSE_PRIVATE_KEY;
  if (fromEnv) {
    _clientPrivateKey = fromEnv.replace(/\\n/g, '\n');
    return _clientPrivateKey;
  }
  throw new Error('CLIENT_LICENSE_PRIVATE_KEY environment variable is required');
}

function getClientPublicKey() {
  if (_clientPublicKey) return _clientPublicKey;
  const fromEnv = process.env.CLIENT_LICENSE_PUBLIC_KEY;
  if (fromEnv) {
    _clientPublicKey = fromEnv.replace(/\\n/g, '\n');
    return _clientPublicKey;
  }
  throw new Error('CLIENT_LICENSE_PUBLIC_KEY environment variable is required');
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

// ─── Client license token (tb_ prefixed) ─────────────────────────────────────

/**
 * Sign a client license JWT.
 * Called only on the cloud server when issuing a new license to a client.
 * @param {{ clientId: string, clientName: string, employeeCap: number, expiryMonths?: number }} payload
 * @returns {string} JWT (without tb_ prefix — caller adds it)
 */
function signClientToken({ clientId, clientName, employeeCap, expiryMonths = 12 }) {
  const privateKey = getClientPrivateKey();
  return jwt.sign(
    { clientId, clientName, employeeCap, type: 'client' },
    privateKey,
    {
      algorithm: 'RS256',
      expiresIn: `${expiryMonths * 30}d`,
      issuer: 'bantu-license',
    }
  );
}

/**
 * Verify and decode a client license JWT.
 * Works fully offline — uses the public key embedded in the sidecar binary.
 * @param {string} token - Raw JWT (without tb_ prefix)
 * @returns {{ clientId: string, clientName: string, employeeCap: number, exp: number }}
 * @throws if token is invalid, expired, or wrong type
 */
function verifyClientToken(token) {
  const publicKey = getClientPublicKey();
  const payload = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: 'bantu-license',
  });
  if (payload.type !== 'client') {
    throw new Error('Token is not a client license token');
  }
  return payload;
}

module.exports = {
  signLicenseToken, verifyLicenseToken, hashDeviceId, generateTestKeyPair,
  signClientToken, verifyClientToken,
};
