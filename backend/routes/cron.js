/**
 * Cron trigger endpoints — called by Render's native cron service (or any external scheduler).
 *
 * All routes require the CRON_SECRET header to prevent unauthorised triggers.
 * Set CRON_SECRET in your Render environment and configure a Cron Job to call:
 *   POST https://<your-app>.onrender.com/api/cron/leave-accrue
 * with header:  x-cron-secret: <CRON_SECRET>
 * on schedule:  5 0 1 * *   (00:05 on the 1st of every month)
 */

const express = require('express');
const { runLeaveAccrual } = require('../jobs/leaveAccrual');
const { runNotifications } = require('../jobs/notifications');

const router = express.Router();

function verifyCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[Cron] CRON_SECRET is not set — endpoint disabled');
    return res.status(503).json({ message: 'Cron endpoint not configured' });
  }
  const provided = req.headers['x-cron-secret'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!provided || provided !== secret) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  next();
}

// POST /api/cron/leave-accrue
router.post('/leave-accrue', verifyCronSecret, async (req, res) => {
  console.log('[Cron] /api/cron/leave-accrue triggered externally');
  try {
    const result = await runLeaveAccrual();
    console.log('[Cron] leave-accrue completed successfully:', result);
    res.json({ ok: true, message: 'Leave accrual completed', ...result });
  } catch (err) {
    console.error('[Cron] leave-accrue failed:', err.message);
    if (err.accrualErrors) {
      console.error('[Cron] Per-employee errors:', JSON.stringify(err.accrualErrors));
    }
    res.status(500).json({ ok: false, message: err.message, summary: err.accrualSummary, errors: err.accrualErrors });
  }
});

// POST /api/cron/notify
// Schedule on Render: 0 7 * * *  (07:00 every day)
router.post('/notify', verifyCronSecret, async (req, res) => {
  console.log('[Cron] /api/cron/notify triggered');
  try {
    const sent = await runNotifications();
    res.json({ ok: true, message: `Notifications job completed. ${sent} email(s) sent.` });
  } catch (err) {
    console.error('[Cron] notify failed:', err);
    res.status(500).json({ ok: false, message: err.message });
  }
});

module.exports = router;
