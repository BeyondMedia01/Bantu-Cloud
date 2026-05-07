'use strict';

const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { signLicenseToken, verifyLicenseToken, hashDeviceId } = require('../lib/licenseJwt.js');

// Auth middleware — assumes req.user is populated by existing auth middleware
// The main app mounts auth middleware before this router

/**
 * POST /api/license/activate
 * Body: { deviceId: string } — raw hardware identifier (will be hashed server-side)
 * Requires: authenticated user (req.user.accountId or req.user.id)
 * Returns: { token: string, expiresAt: string }
 */
router.post('/activate', async (req, res) => {
  const { deviceId: rawDeviceId } = req.body;

  if (!rawDeviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  // Use authenticated user's account
  const accountId = req.user?.accountId || req.user?.id;
  if (!accountId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const deviceId = hashDeviceId(rawDeviceId);
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  try {
    // Check if this device already has a license
    const existing = await prisma.desktopLicense.findUnique({ where: { deviceId } });

    if (existing && !existing.revokedAt) {
      // Already activated — return renewed token
      const token = signLicenseToken({ accountId, deviceId, activatedAt: existing.activatedAt.toISOString() });
      return res.json({ token, expiresAt: expiresAt.toISOString() });
    }

    if (existing?.revokedAt) {
      return res.status(403).json({ error: 'This device license has been revoked' });
    }

    // Create new license record
    await prisma.desktopLicense.create({
      data: {
        accountId,
        deviceId,
        activatedAt: now,
        expiresAt,
      },
    });

    const token = signLicenseToken({
      accountId,
      deviceId,
      activatedAt: now.toISOString(),
    });

    return res.status(201).json({ token, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error('[License] Activation error:', err.message);
    return res.status(500).json({ error: 'Activation failed' });
  }
});

/**
 * POST /api/license/renew
 * Body: { token: string } — current license JWT
 * Returns: { token: string, expiresAt: string } — new token with fresh 1-year expiry
 */
router.post('/renew', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'token is required' });
  }

  let decoded;
  try {
    decoded = verifyLicenseToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired license token' });
  }

  const { deviceId, accountId } = decoded;

  try {
    const license = await prisma.desktopLicense.findUnique({ where: { deviceId } });

    if (!license) {
      return res.status(404).json({ error: 'License not found' });
    }

    if (license.revokedAt) {
      return res.status(403).json({ error: 'License has been revoked' });
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await prisma.desktopLicense.update({
      where: { deviceId },
      data: { lastRenewedAt: now, expiresAt },
    });

    const newToken = signLicenseToken({
      accountId,
      deviceId,
      activatedAt: license.activatedAt.toISOString(),
    });

    return res.json({ token: newToken, expiresAt: expiresAt.toISOString() });
  } catch (err) {
    console.error('[License] Renewal error:', err.message);
    return res.status(500).json({ error: 'Renewal failed' });
  }
});

module.exports = router;
