const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const router = express.Router();

// POST /api/transactions/import — bulk import transaction codes via CSV body
// Expects: { rows: [{ code, name, type, taxable, pensionable, description }] }
router.post('/import', requirePermission('update_settings'), async (req, res) => {
  const { rows } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ message: 'rows array is required' });
  }

  try {
    const results = { created: 0, skipped: 0, errors: [] };

    for (const row of rows) {
      if (!row.code || !row.name || !row.type) {
        results.errors.push({ row, reason: 'Missing code, name, or type' });
        continue;
      }

      try {
        await prisma.transactionCode.upsert({
          where: { clientId_code: { clientId: req.clientId, code: row.code.toUpperCase() } },
          create: {
            clientId: req.clientId,
            code: row.code.toUpperCase(),
            name: row.name,
            description: row.description || null,
            type: row.type,
            taxable: row.taxable !== false && row.taxable !== 'false',
            pensionable: row.pensionable !== false && row.pensionable !== 'false',
          },
          update: {
            name: row.name,
            description: row.description || null,
            type: row.type,
            taxable: row.taxable !== false && row.taxable !== 'false',
            pensionable: row.pensionable !== false && row.pensionable !== 'false',
          },
        });
        results.created++;
      } catch (err) {
        results.errors.push({ row, reason: err.message });
        results.skipped++;
      }
    }

    res.json(results);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
