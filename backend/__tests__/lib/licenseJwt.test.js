import { describe, it, expect, beforeAll } from 'vitest';
import { signLicenseToken, verifyLicenseToken, hashDeviceId, generateTestKeyPair } from '../../lib/licenseJwt.js';

describe('License JWT', () => {
  let privateKey, publicKey;

  beforeAll(() => {
    const pair = generateTestKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;
    process.env.DESKTOP_LICENSE_PRIVATE_KEY = privateKey;
    process.env.DESKTOP_LICENSE_PUBLIC_KEY = publicKey;
  });

  it('signs and verifies a license token', () => {
    const token = signLicenseToken({
      accountId: 'acc-1',
      deviceId: 'dev-abc',
    });
    expect(typeof token).toBe('string');

    const decoded = verifyLicenseToken(token);
    expect(decoded.accountId).toBe('acc-1');
    expect(decoded.deviceId).toBe('dev-abc');
    expect(decoded.iss).toBe('bantu-license');
  });

  it('throws on invalid token', () => {
    expect(() => verifyLicenseToken('not-a-token')).toThrow();
  });

  it('hashes device id consistently', () => {
    const id1 = hashDeviceId('my-mac-address');
    const id2 = hashDeviceId('my-mac-address');
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64); // SHA-256 hex
  });
});
