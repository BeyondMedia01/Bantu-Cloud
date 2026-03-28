const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');
const { getSettings } = require('../lib/systemSettings');

const router = express.Router();

// ─── GET /api/leave-encashments — list all for company ────────────────────────

router.get('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  const where = { companyId: req.companyId };
  // EMPLOYEE sees only own
  if (req.user.role === 'EMPLOYEE' && req.employeeId) {
    where.employeeId = req.employeeId;
  }

  try {
    const encashments = await prisma.leaveEncashment.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(encashments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/leave-encashments — request encashment ────────────────────────

router.post('/', async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  const { employeeId: bodyEmpId, leaveType, days, notes } = req.body;

  if (!leaveType || !days) return res.status(400).json({ message: 'leaveType and days are required' });

  try {
    // Resolve employee — EMPLOYEE role uses their own record
    let employeeId = bodyEmpId;
    if (req.user.role === 'EMPLOYEE') {
      const emp = await prisma.employee.findUnique({ where: { userId: req.user.userId }, select: { id: true, basicSalaryUSD: true, basicSalaryZiG: true } });
      if (!emp) return res.status(404).json({ message: 'Employee record not found' });
      employeeId = emp.id;
    }

    const year = new Date().getFullYear();
    const daysFloat = parseFloat(days);

    // Get leave balance
    const balance = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveType_year: { employeeId, leaveType, year } },
      include: { leavePolicy: true },
    });

    if (!balance) return res.status(400).json({ message: 'No leave balance found for this type and year' });
    if (balance.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (balance.balance < daysFloat) {
      return res.status(400).json({ message: `Insufficient leave balance. Available: ${balance.balance}, Requested: ${daysFloat}` });
    }

    // Check policy allows encashment
    if (balance.leavePolicy && !balance.leavePolicy.encashable) {
      return res.status(400).json({ message: `${leaveType} leave is not encashable per company policy` });
    }

    // Check encash cap
    if (balance.leavePolicy && balance.leavePolicy.encashCap > 0) {
      const alreadyEncashed = balance.encashed;
      if (alreadyEncashed + daysFloat > balance.leavePolicy.encashCap) {
        const remaining = balance.leavePolicy.encashCap - alreadyEncashed;
        return res.status(400).json({ message: `Encashment cap reached. Remaining encashable: ${remaining} days` });
      }
    }

    const wdSettings = await getSettings(['WORKING_DAYS_PER_PERIOD', 'WORKING_DAYS_PER_MONTH']);
    const workingDaysPerPeriodDefault = parseFloat(wdSettings['WORKING_DAYS_PER_PERIOD'] ?? wdSettings['WORKING_DAYS_PER_MONTH'] ?? 0);
    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { basicSalaryUSD: true, basicSalaryZiG: true, currency: true, daysPerPeriod: true },
    });
    
    const divisor = emp?.daysPerPeriod || workingDaysPerPeriodDefault;
    const monthlySalary = emp?.basicSalaryUSD || 0;
    const ratePerDay = monthlySalary > 0 ? monthlySalary / divisor : 0;
    const totalAmount = parseFloat((daysFloat * ratePerDay).toFixed(2));
    const currency = emp?.currency || 'USD';

    // Deduct from balance immediately (pending approval)
    const [encashment] = await prisma.$transaction([
      prisma.leaveEncashment.create({
        data: {
          employeeId,
          leaveBalanceId: balance.id,
          companyId: req.companyId,
          leaveType,
          days: daysFloat,
          ratePerDay,
          totalAmount,
          currency,
          requestedBy: req.user.userId,
          notes: notes || null,
        },
      }),
      prisma.leaveBalance.update({
        where: { id: balance.id },
        data: {
          encashed: { increment: daysFloat },
          balance: { decrement: daysFloat },
        },
      }),
    ]);

    await audit({
      req,
      action: 'LEAVE_ENCASHMENT_REQUESTED',
      resource: 'leave_encashment',
      resourceId: encashment.id,
      details: { employeeId, leaveType, days: daysFloat, totalAmount },
    });

    res.status(201).json(encashment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/leave-encashments/:id/approve ──────────────────────────────────

router.put('/:id/approve', requirePermission('manage_leave'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const enc = await prisma.leaveEncashment.findUnique({ where: { id: req.params.id }, select: { companyId: true, status: true } });
    if (!enc) return res.status(404).json({ message: 'Encashment not found' });
    if (enc.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (enc.status !== 'PENDING') return res.status(400).json({ message: `Cannot approve a ${enc.status} encashment` });

    const updated = await prisma.leaveEncashment.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', approvedBy: req.user.userId },
    });

    await audit({ req, action: 'LEAVE_ENCASHMENT_APPROVED', resource: 'leave_encashment', resourceId: req.params.id, details: {} });
    res.json(updated);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Encashment not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/leave-encashments/:id/reject ───────────────────────────────────

router.put('/:id/reject', requirePermission('manage_leave'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });
  try {
    const enc = await prisma.leaveEncashment.findUnique({
      where: { id: req.params.id },
      select: { companyId: true, status: true, days: true, leaveBalanceId: true },
    });
    if (!enc) return res.status(404).json({ message: 'Encashment not found' });
    if (enc.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (enc.status !== 'PENDING') return res.status(400).json({ message: `Cannot reject a ${enc.status} encashment` });

    // Reverse the balance deduction
    await prisma.$transaction([
      prisma.leaveEncashment.update({
        where: { id: req.params.id },
        data: { status: 'REJECTED', notes: req.body.reason || null },
      }),
      prisma.leaveBalance.update({
        where: { id: enc.leaveBalanceId },
        data: {
          encashed: { decrement: enc.days },
          balance: { increment: enc.days },
        },
      }),
    ]);

    await audit({ req, action: 'LEAVE_ENCASHMENT_REJECTED', resource: 'leave_encashment', resourceId: req.params.id, details: { reason: req.body.reason } });
    res.json({ message: 'Encashment rejected and balance restored' });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Encashment not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/leave-encashments/:id/process — convert to PayrollInput ───────
// This creates a taxable EARNING PayrollInput so the amount is included in the next payroll run.

router.post('/:id/process', requirePermission('manage_payroll'), async (req, res) => {
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const enc = await prisma.leaveEncashment.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { id: true, companyId: true, clientId: true, currency: true } } },
    });
    if (!enc) return res.status(404).json({ message: 'Encashment not found' });
    if (enc.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (enc.status !== 'APPROVED') return res.status(400).json({ message: 'Encashment must be APPROVED before processing' });

    // Find the "LEAVE_ENCASHMENT" transaction code — the company must have one configured
    const tc = await prisma.transactionCode.findFirst({
      where: { clientId: enc.employee.clientId, code: 'LEAVE_ENCASHMENT', type: 'EARNING' },
    });

    if (!tc) {
      return res.status(400).json({
        message: 'No LEAVE_ENCASHMENT transaction code found. Please create an EARNING transaction code with code "LEAVE_ENCASHMENT" in Utilities → Transactions.',
      });
    }

    const period = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    // Create the PayrollInput
    const input = await prisma.payrollInput.create({
      data: {
        employeeId: enc.employeeId,
        transactionCodeId: tc.id,
        employeeUSD: enc.currency === 'USD' ? enc.totalAmount : 0,
        employeeZiG: enc.currency === 'ZIG' ? enc.totalAmount : 0,
        duration: 'Once',
        period,
        notes: `Leave encashment: ${enc.days} days ${enc.leaveType}`,
      },
    });

    // Mark encashment as processed
    await prisma.leaveEncashment.update({
      where: { id: req.params.id },
      data: { status: 'PROCESSED', payrollInputId: input.id },
    });

    await audit({
      req,
      action: 'LEAVE_ENCASHMENT_PROCESSED',
      resource: 'leave_encashment',
      resourceId: req.params.id,
      details: { payrollInputId: input.id, totalAmount: enc.totalAmount },
    });

    res.json({ message: 'Encashment processed into payroll inputs', payrollInputId: input.id });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Encashment not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
