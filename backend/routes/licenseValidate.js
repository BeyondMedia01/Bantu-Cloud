const express = require('express');
const { validateLicense } = require('../lib/license');

const router = express.Router();

// POST /api/license/validate — Public endpoint used during CLIENT_ADMIN registration.
router.post('/', async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ message: 'token is required' });

  const result = await validateLicense(token);
  if (!result.valid) return res.status(400).json({ message: result.reason });

  res.json({ valid: true, clientId: result.license.clientId, clientName: result.license.client.name });
});

module.exports = router;
