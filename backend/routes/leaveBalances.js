const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Upsert-or-create a LeaveBalance and return it.
async function getOrCreateBalance(employeeId, companyId, leaveType, year, policyId) {
  return prisma.leaveBalance.upsert({
    where: { employeeId_leaveType_year: { employeeId, leaveType, year } },
    create: { employeeId, companyId, leaveType, year, leavePolicyId: policyId || null, balance: 0 },
    update: {},
  });
}

// ─── GET /api/leave-balances — all employees for the active company ───────────

router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  const year = parseInt(req.query.year) || new Date().getFullYear();
  const { employeeId } = req.query;

  // EMPLOYEE may only see own balances
  const resolvedEmployeeId = req.user.role === 'EMPLOYEE' ? req.employeeId : (employeeId || undefined);

  try {
    const balances = await prisma.leaveBalance.findMany({
      where: {
        companyId: req.companyId,
        year,
        ...(resolvedEmployeeId && { employeeId: resolvedEmployeeId }),
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        leavePolicy: { select: { accrualRate: true, maxAccumulation: true, carryOverLimit: true, encashable: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { leaveType: 'asc' }],
    });
    res.json(balances);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── GET /api/leave-balances/:employeeId — one employee all types ─────────────

router.get('/:employeeId', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  // EMPLOYEE can only fetch own
  if (req.user.role === 'EMPLOYEE' && req.employeeId !== req.params.employeeId) {
    return res.status(403).json({ message: 'Access denied' });
  }

  const year = parseInt(req.query.year) || new Date().getFullYear();
  try {
    const balances = await prisma.leaveBalance.findMany({
      where: { employeeId: req.params.employeeId, companyId: req.companyId, year },
      include: { leavePolicy: true },
      orderBy: { leaveType: 'asc' },
    });
    res.json(balances);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/leave-balances/accrue — run monthly accrual for all employees ──

router.post('/accrue', requirePermission('manage_leave'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  const now = new Date();
  const year = now.getFullYear();
  const monthKey = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`; // e.g. "2025-03"

  try {
    const policies = await prisma.leavePolicy.findMany({
      where: { companyId: req.companyId, isActive: true },
    });

    if (policies.length === 0) {
      return res.status(400).json({ message: 'No active leave policies configured for this company' });
    }

    const employees = await prisma.employee.findMany({
      where: { companyId: req.companyId, status: 'ACTIVE' },
      select: { id: true },
    });

    let credited = 0;
    let skipped = 0;

    for (const emp of employees) {
      for (const policy of policies) {
        const balance = await getOrCreateBalance(emp.id, req.companyId, policy.leaveType, year, policy.id);

        // Skip if already accrued this month
        if (balance.lastAccrualDate) {
          const lastKey = `${balance.lastAccrualDate.getFullYear()}-${String(balance.lastAccrualDate.getMonth() + 1).padStart(2, '0')}`;
          if (lastKey >= monthKey) { skipped++; continue; }
        }

        // Apply cap: don't exceed maxAccumulation
        const currentHolding = balance.openingBalance + balance.accrued - balance.taken - balance.encashed;
        const room = policy.maxAccumulation - currentHolding;
        if (room <= 0) { skipped++; continue; }

        const credit = Math.min(policy.accrualRate, room);

        await prisma.leaveBalance.update({
          where: { id: balance.id },
          data: {
            accrued: { increment: credit },
            balance: { increment: credit },
            lastAccrualDate: now,
          },
        });
        credited++;
      }
    }

    await audit({
      req,
      action: 'LEAVE_ACCRUAL_RUN',
      resource: 'leave_balance',
      resourceId: req.companyId,
      details: { year, monthKey, credited, skipped, policies: policies.length, employees: employees.length },
    });

    res.json({ message: 'Accrual run complete', monthKey, credited, skipped });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/leave-balances/year-end — year-end carry-over + forfeit ────────

router.post('/year-end', requirePermission('manage_leave'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  // Default: roll over from the just-completed year
  const closingYear = parseInt(req.body.year) || (new Date().getFullYear() - 1);
  const newYear = closingYear + 1;

  try {
    const policies = await prisma.leavePolicy.findMany({
      where: { companyId: req.companyId, isActive: true },
    });

    const balances = await prisma.leaveBalance.findMany({
      where: { companyId: req.companyId, year: closingYear },
    });

    let carried = 0;
    let forfeited = 0;

    for (const bal of balances) {
      const policy = policies.find((p) => p.leaveType === bal.leaveType);
      const unused = Math.max(0, bal.balance);

      const carryLimit = policy ? policy.carryOverLimit : 0;
      const carryAmount = Math.min(unused, carryLimit);
      const forfeitAmount = unused - carryAmount;

      // Mark closing year as processed
      await prisma.leaveBalance.update({
        where: { id: bal.id },
        data: { forfeited: forfeitAmount, balance: carryAmount },
      });

      // Seed new year balance with carry-over as opening
      if (carryAmount > 0) {
        await prisma.leaveBalance.upsert({
          where: { employeeId_leaveType_year: { employeeId: bal.employeeId, leaveType: bal.leaveType, year: newYear } },
          create: {
            employeeId: bal.employeeId,
            companyId: bal.companyId,
            leaveType: bal.leaveType,
            year: newYear,
            leavePolicyId: bal.leavePolicyId,
            openingBalance: carryAmount,
            balance: carryAmount,
          },
          update: { openingBalance: { increment: carryAmount }, balance: { increment: carryAmount } },
        });
        carried++;
      }

      if (forfeitAmount > 0) forfeited++;
    }

    await audit({
      req,
      action: 'LEAVE_YEAR_END',
      resource: 'leave_balance',
      resourceId: req.companyId,
      details: { closingYear, newYear, carried, forfeited },
    });

    res.json({ message: 'Year-end processing complete', closingYear, newYear, carried, forfeited });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/leave-balances/:id/adjust — manual balance correction ───────────

router.put('/:id/adjust', requirePermission('manage_leave'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  const { adjustment, note } = req.body;
  if (adjustment === undefined) return res.status(400).json({ message: 'adjustment is required' });

  try {
    const existing = await prisma.leaveBalance.findUnique({ where: { id: req.params.id }, select: { companyId: true, balance: true } });
    if (!existing) return res.status(404).json({ message: 'Leave balance not found' });
    if (existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const adj = parseFloat(adjustment);
    const updated = await prisma.leaveBalance.update({
      where: { id: req.params.id },
      data: {
        accrued: { increment: adj },
        balance: { increment: adj },
      },
    });

    await audit({
      req,
      action: 'LEAVE_BALANCE_ADJUSTED',
      resource: 'leave_balance',
      resourceId: req.params.id,
      details: { adjustment: adj, newBalance: updated.balance, note },
    });

    res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Leave balance not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
