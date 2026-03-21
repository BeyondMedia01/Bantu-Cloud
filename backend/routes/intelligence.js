const express = require('express');
const router = express.Router();
const { detectFraud, generateSmartAlerts, predictCashflow } = require('../utils/intelligenceEngine');

// Ensure client/company context is present
router.use((req, res, next) => {
  if (!req.user || !req.user.clientId) {
    return res.status(403).json({ message: 'Unauthorized access to intelligence tools.' });
  }
  next();
});

// GET /api/intelligence/alerts
router.get('/alerts', async (req, res) => {
  try {
    const clientId = req.user.clientId;
    const companyId = req.companyId || req.query.companyId || req.user.companyId;

    if (!companyId) {
      return res.status(400).json({ message: 'Company ID required' });
    }

    const alerts = await generateSmartAlerts(clientId, companyId);
    res.json({ alerts });
  } catch (error) {
    console.error('Error generating smart alerts:', error);
    res.status(500).json({ message: 'Failed to generate smart alerts.' });
  }
});

// GET /api/intelligence/fraud
router.get('/fraud', async (req, res) => {
  try {
    const clientId = req.user.clientId;
    const companyId = req.companyId || req.query.companyId;
    const { skip = 0, take = 500 } = req.query;

    if (!companyId) return res.status(400).json({ message: 'Company ID required' });

    const fraudFlags = await detectFraud(clientId, companyId, parseInt(skip), parseInt(take));
    res.json({ flags: fraudFlags });
  } catch (error) {
    res.status(500).json({ message: 'Failed to run fraud detection.' });
  }
});

// GET /api/intelligence/cashflow
router.get('/cashflow', async (req, res) => {
  try {
    const { clientId } = req.user;
    const companyId = req.companyId || req.query.companyId;

    if (!companyId) return res.status(400).json({ message: 'Company ID required' });

    const forecast = await predictCashflow(clientId, companyId);
    res.json(forecast);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to generate cashflow forecast.' });
  }
});

module.exports = router;
