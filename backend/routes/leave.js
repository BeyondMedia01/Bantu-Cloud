const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

// GET /api/leave
router.get('/', async (req, res) => {
  const { employeeId, status, type } = req.query;
  try {
    const where = {
      ...(req.companyId && { employee: { companyId: req.companyId } }),
      ...(employeeId && { employeeId }),
      ...(status && { status }),
      ...(type && { type }),
    };

    // EMPLOYEE can only see their own
    if (req.user.role === 'EMPLOYEE' && req.employeeId) {
      where.employeeId = req.employeeId;
    }

    const [records, requests] = await Promise.all([
      prisma.leaveRecord.findMany({
        where,
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
        orderBy: { startDate: 'desc' },
      }),
      prisma.leaveRequest.findMany({
        where,
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    res.json({ records, requests });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/leave — create a leave record (CLIENT_ADMIN) or request (EMPLOYEE)
router.post('/', async (req, res) => {
  const { employeeId, type, startDate, endDate, totalDays, days, reason } = req.body;

  try {
    if (req.user.role === 'EMPLOYEE') {
      // Self-service: create a LeaveRequest
      const emp = await prisma.employee.findUnique({ where: { userId: req.user.userId } });
      if (!emp) return res.status(404).json({ message: 'Employee record not found' });

      const request = await prisma.leaveRequest.create({
        data: {
          employeeId: emp.id,
          type: type || 'ANNUAL',
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          days: parseFloat(days || totalDays),
          reason,
        },
      });
      return res.status(201).json(request);
    }

    // CLIENT_ADMIN / PLATFORM_ADMIN: create a LeaveRecord directly
    if (!employeeId || !type || !startDate || !endDate) {
      return res.status(400).json({ message: 'employeeId, type, startDate, endDate are required' });
    }

    const days_f = parseFloat(totalDays || days);
    const year = new Date(startDate).getFullYear();

    const [empRecord, leaveBalance] = await Promise.all([
      prisma.employee.findUnique({ where: { id: employeeId }, select: { leaveBalance: true } }),
      prisma.leaveBalance.findUnique({
        where: { employeeId_leaveType_year: { employeeId, leaveType: type, year } },
        select: { id: true, balance: true },
      }),
    ]);
    if (!empRecord) return res.status(404).json({ message: 'Employee not found' });

    // Check balance: prefer LeaveBalance model, fall back to legacy Employee.leaveBalance
    const availableBalance = leaveBalance ? leaveBalance.balance : empRecord.leaveBalance;
    if (availableBalance < days_f) {
      return res.status(400).json({ message: `Insufficient leave balance. Available: ${availableBalance}, Requested: ${days_f}` });
    }

    let record;
    await prisma.$transaction(async (tx) => {
      record = await tx.leaveRecord.create({
        data: {
          employeeId,
          type,
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          totalDays: days_f,
          reason,
          status: 'APPROVED',
        },
      });
      await tx.employee.update({
        where: { id: employeeId },
        data: {
          leaveBalance: { decrement: days_f },
          leaveTaken: { increment: days_f },
        },
      });
      // Keep LeaveBalance model in sync when it exists
      if (leaveBalance) {
        await tx.leaveBalance.update({
          where: { id: leaveBalance.id },
          data: {
            taken: { increment: days_f },
            balance: { decrement: days_f },
          },
        });
      }
    });
    res.status(201).json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/leave/:id
router.get('/:id', async (req, res) => {
  try {
    const record = await prisma.leaveRecord.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { firstName: true, lastName: true, companyId: true } } },
    });
    if (!record) return res.status(404).json({ message: 'Leave record not found' });
    if (req.companyId && record.employee?.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/leave/:id
router.put('/:id', requirePermission('manage_leave'), async (req, res) => {
  const { type, startDate, endDate, totalDays, reason, status } = req.body;
  try {
    const record = await prisma.leaveRecord.update({
      where: { id: req.params.id },
      data: {
        ...(type && { type }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(totalDays !== undefined && { totalDays: parseFloat(totalDays) }),
        ...(reason !== undefined && { reason }),
        ...(status && { status }),
      },
    });
    res.json(record);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Leave record not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/leave/request/:id/approve
router.put('/request/:id/approve', requirePermission('approve_leave'), async (req, res) => {
  try {
    const request = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', reviewedBy: req.user.userId, reviewNote: req.body.note },
    });

    const year = new Date(request.startDate).getFullYear();
    const leaveType = request.type || 'ANNUAL';

    // Prefer LeaveBalance; fall back to legacy Employee.leaveBalance
    const leaveBalance = await prisma.leaveBalance.findUnique({
      where: { employeeId_leaveType_year: { employeeId: request.employeeId, leaveType, year } },
      select: { id: true, balance: true, companyId: true },
    });

    if (leaveBalance) {
      if (leaveBalance.balance < request.days) {
        return res.status(400).json({ message: `Insufficient leave balance. Available: ${leaveBalance.balance}, Requested: ${request.days}` });
      }
    } else {
      const empToCheck = await prisma.employee.findUnique({ where: { id: request.employeeId }, select: { leaveBalance: true } });
      if (empToCheck && empToCheck.leaveBalance < request.days) {
        return res.status(400).json({ message: `Insufficient leave balance. Available: ${empToCheck.leaveBalance}, Requested: ${request.days}` });
      }
    }

    // Create LeaveRecord, update LeaveBalance (or legacy Employee balance), atomically
    const ops = [
      prisma.leaveRecord.create({
        data: {
          employeeId: request.employeeId,
          type: leaveType,
          startDate: request.startDate,
          endDate: request.endDate,
          totalDays: request.days,
          reason: request.reason,
          status: 'APPROVED',
          approvedBy: req.user.userId,
        },
      }),
      prisma.employee.update({
        where: { id: request.employeeId },
        data: {
          leaveBalance: { decrement: request.days },
          leaveTaken: { increment: request.days },
        },
      }),
    ];

    if (leaveBalance) {
      ops.push(
        prisma.leaveBalance.update({
          where: { id: leaveBalance.id },
          data: {
            taken: { increment: request.days },
            balance: { decrement: request.days },
          },
        })
      );
    }

    await prisma.$transaction(ops);

    await audit({
      req,
      action: 'LEAVE_REQUEST_APPROVED',
      resource: 'leave_request',
      resourceId: request.id,
      details: { employeeId: request.employeeId, days: request.days },
    });

    res.json(request);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Leave request not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/leave/request/:id/reject
router.put('/request/:id/reject', requirePermission('reject_leave'), async (req, res) => {
  try {
    const request = await prisma.leaveRequest.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', reviewedBy: req.user.userId, reviewNote: req.body.note },
    });

    await audit({
      req,
      action: 'LEAVE_REQUEST_REJECTED',
      resource: 'leave_request',
      resourceId: request.id,
      details: { employeeId: request.employeeId, note: req.body.note },
    });

    res.json(request);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Leave request not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/leave/:id
router.delete('/:id', requirePermission('manage_leave'), async (req, res) => {
  try {
    await prisma.leaveRecord.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Leave record not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
