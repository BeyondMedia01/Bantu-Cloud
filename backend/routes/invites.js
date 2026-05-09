const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, requireRole } = require('../lib/auth');
const { sendEmployeeInvite } = require('../lib/mailer');

// Ownership guard — PLATFORM_ADMIN bypasses; CLIENT_ADMIN must own the company
async function assertCompanyOwnership(req, res, companyId) {
  if (req.user.role === 'PLATFORM_ADMIN') return true;
  if (!companyId) { res.status(400).json({ message: 'companyId is required' }); return false; }
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { clientId: true } });
  if (!company || company.clientId !== req.user.clientId) {
    res.status(403).json({ message: 'Access denied' });
    return false;
  }
  return true;
}

// ── Send invite (Client Admin only) ──────────────────────────────────────────

router.post('/', authenticateToken, requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (req, res) => {
  const { companyId, email, roleIds } = req.body;
  if (!companyId || !email || !Array.isArray(roleIds) || !roleIds.length) {
    return res.status(400).json({ message: 'companyId, email, and roleIds[] are required' });
  }
  if (!await assertCompanyOwnership(req, res, companyId)) return;

  try {
    // Validate all roleIds belong to the target company
    const validRoles = await prisma.role.findMany({
      where: { id: { in: roleIds }, companyId },
      select: { id: true },
    });
    if (validRoles.length !== roleIds.length) {
      return res.status(400).json({ message: 'One or more roleIds are invalid for this company' });
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Cancel any existing pending invite for this email+company before creating a new one
    await prisma.invite.updateMany({
      where: { companyId, email: email.toLowerCase().trim(), status: 'PENDING' },
      data: { status: 'CANCELLED' },
    });

    const invite = await prisma.invite.create({
      data: {
        companyId,
        email: email.toLowerCase().trim(),
        roleIds,
        invitedBy: req.user.userId,
        expiresAt,
      },
    });

    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
    const inviteUrl = `${process.env.FRONTEND_URL}/accept-invite?token=${invite.token}`;

    await sendEmployeeInvite(email, inviteUrl, company?.name ?? 'Bantu-Cloud');

    res.status(201).json({ message: 'Invite sent', inviteId: invite.id });
  } catch (err) {
    console.error('POST /invites:', err);
    res.status(500).json({ message: 'Failed to send invite' });
  }
});

// ── Validate and Accept moved to routes/publicInvites.js ──────────────────────
//   GET  /api/invites/validate/:token
//   POST /api/invites/accept

// ── List invites for a company (Client Admin only) ────────────────────────────

router.get('/', authenticateToken, requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (req, res) => {
  const { companyId } = req.query;
  if (!companyId) return res.status(400).json({ message: 'companyId is required' });
  if (!await assertCompanyOwnership(req, res, companyId)) return;

  try {
    const invites = await prisma.invite.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
    res.json(invites);
  } catch (err) {
    console.error('GET /invites:', err);
    res.status(500).json({ message: 'Failed to fetch invites' });
  }
});

// ── Cancel an invite ──────────────────────────────────────────────────────────

router.delete('/:id', authenticateToken, requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (req, res) => {
  try {
    // Look up invite first to verify company ownership
    const invite = await prisma.invite.findUnique({
      where: { id: req.params.id },
      select: { id: true, companyId: true },
    });
    if (!invite) return res.status(404).json({ message: 'Invite not found' });
    if (!await assertCompanyOwnership(req, res, invite.companyId)) return;

    await prisma.invite.update({
      where: { id: req.params.id },
      data: { status: 'CANCELLED' },
    });
    res.json({ message: 'Invite cancelled' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ message: 'Invite not found' });
    console.error('DELETE /invites/:id:', err);
    res.status(500).json({ message: 'Failed to cancel invite' });
  }
});

module.exports = router;
