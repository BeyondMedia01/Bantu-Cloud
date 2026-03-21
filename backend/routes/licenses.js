const express = require('express');
const { requireRole } = require('../lib/auth');
const { issueLicense, revokeLicense, reactivateLicense } = require('../lib/license');
const prisma = require('../lib/prisma');

const router = express.Router();
const adminOnly = requireRole('PLATFORM_ADMIN');

// POST /api/license/issue
router.post('/issue', adminOnly, async (req, res) => {
  const { clientId, employeeCap, expiryMonths } = req.body;
  if (!clientId) return res.status(400).json({ message: 'clientId is required' });

  try {
    const license = await issueLicense(clientId, employeeCap || 10, expiryMonths || 12);
    res.status(201).json(license);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/license/revoke
router.post('/revoke', adminOnly, async (req, res) => {
  const { clientId } = req.body;
  if (!clientId) return res.status(400).json({ message: 'clientId is required' });

  try {
    const license = await revokeLicense(clientId);
    res.json(license);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'License not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/license/reactivate
router.post('/reactivate', adminOnly, async (req, res) => {
  const { clientId, expiryMonths } = req.body;
  if (!clientId) return res.status(400).json({ message: 'clientId is required' });

  try {
    const license = await reactivateLicense(clientId, expiryMonths || 12);
    res.json(license);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'License not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/license — list all licenses (PLATFORM_ADMIN)
router.get('/', adminOnly, async (req, res) => {
  try {
    const licenses = await prisma.licenseToken.findMany({
      include: { client: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(licenses);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
