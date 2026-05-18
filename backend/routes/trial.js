const express = require('express');
const prisma = require('../lib/prisma');
const { getTransporter } = require('../lib/mailer');

const router = express.Router();

// ─── GET /api/trial/status ────────────────────────────────────────────────────

router.get('/status', async (req, res) => {
  try {
    const trial = await prisma.trial.findUnique({ where: { clientId: req.clientId } });
    if (!trial) return res.json({ trial: null });

    const employeeCount = await prisma.employee.count({ where: { clientId: req.clientId } });
    const msRemaining = new Date(trial.expiresAt) - new Date();
    const daysRemaining = Math.max(0, Math.ceil(msRemaining / 86400000));

    return res.json({
      trial: {
        status: trial.status,
        expiresAt: trial.expiresAt,
        daysRemaining,
        onboardingStep: trial.onboardingStep,
        employeeCap: trial.employeeCap,
        employeeCount,
      },
    });
  } catch (err) {
    console.error('[trial/status]', err);
    return res.status(500).json({ message: 'Failed to fetch trial status' });
  }
});

// ─── PATCH /api/trial/onboarding-step ────────────────────────────────────────

router.patch('/onboarding-step', async (req, res) => {
  const { step } = req.body;
  if (typeof step !== 'number') {
    return res.status(400).json({ message: 'step must be a number' });
  }

  try {
    const trial = await prisma.trial.findUnique({ where: { clientId: req.clientId } });
    if (!trial) return res.status(404).json({ message: 'No trial found' });

    if (step !== trial.onboardingStep + 1) {
      return res.status(400).json({ message: 'Steps must advance sequentially' });
    }

    const updated = await prisma.trial.update({
      where: { clientId: req.clientId },
      data: { onboardingStep: step },
    });

    return res.json({ onboardingStep: updated.onboardingStep });
  } catch (err) {
    console.error('[trial/onboarding-step]', err);
    return res.status(500).json({ message: 'Failed to update onboarding step' });
  }
});

// ─── POST /api/trial/upgrade-request ─────────────────────────────────────────

router.post('/upgrade-request', async (req, res) => {
  const { name, message } = req.body;
  if (!name || !message) {
    return res.status(400).json({ message: 'name and message are required' });
  }

  const to = process.env.UPGRADE_CONTACT_EMAIL || 'bechanibeyond@gmail.com';

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'Bantu Payroll <no-reply@bantu.io>',
      to,
      subject: `Trial Upgrade Request from ${name}`,
      text: `Name: ${name}\nUser ID: ${req.userId}\nClient ID: ${req.clientId}\n\nMessage:\n${message}`,
      html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;"><h2 style="color:#0f172a;">Trial Upgrade Request</h2><p><strong>Name:</strong> ${name}</p><p><strong>User ID:</strong> ${req.userId}</p><p><strong>Client ID:</strong> ${req.clientId}</p><hr /><p><strong>Message:</strong></p><p>${message.replace(/\n/g, '<br>')}</p></div>`,
    });
    return res.json({ sent: true });
  } catch (err) {
    console.error('[upgrade-request] email failed:', err);
    return res.status(500).json({ error: 'Failed to send request. Please email us directly.' });
  }
});

module.exports = router;
