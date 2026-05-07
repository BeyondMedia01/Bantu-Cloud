'use strict';

const express = require('express');
const router = express.Router();

/**
 * GET /api/desktop/updates
 * Tauri updater checks this endpoint for new versions.
 * Returns a Tauri-compatible update manifest or 204 if no update.
 *
 * Tauri expects either:
 * - 200 with { version, notes, pub_date, platforms: { ... } } if update available
 * - 204 with no body if no update
 */
router.get('/updates', (req, res) => {
  // In production, compare req.query.current_version with latest release
  // For now, always respond with 204 (no update)
  return res.status(204).end();
});

module.exports = router;
