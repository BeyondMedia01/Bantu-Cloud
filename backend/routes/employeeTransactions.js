const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

// mergeParams allows access to :empId from the parent router
const router = express.Router({ mergeParams: true });

// ─── Helpers ─────────────────────────────────────────────────────────────────

const pick = (body) => ({
  transactionCodeId: body.transactionCodeId,
  value:             parseFloat(body.value) || 0,
  currency:          body.currency || 'USD',
  effectiveFrom:     body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
  effectiveTo:       body.effectiveTo ? new Date(body.effectiveTo) : null,
  isRecurring:       body.isRecurring !== false && body.isRecurring !== 'false',
  notes:             body.notes || null,
});

// Verify the employee exists and belongs to the caller's company
const getEmployee = async (empId, companyId) => {
  const emp = await prisma.employee.findUnique({ where: { id: empId }, select: { id: true, companyId: true } });
  if (!emp) return null;
  if (companyId && emp.companyId !== companyId) return null;
  return emp;
};

// ─── GET /api/employees/:empId/salary-structure ───────────────────────────────

router.get('/:empId/salary-structure', requirePermission('manage_employees'), async (req, res) => {
  const { empId } = req.params;
  const { active } = req.query; // ?active=true|false

  try {
    const emp = await getEmployee(empId, req.companyId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    const now = new Date();
    const where = { employeeId: empId };

    if (active === 'true') {
      where.effectiveFrom = { lte: now };
      where.OR = [{ effectiveTo: null }, { effectiveTo: { gte: now } }];
    } else if (active === 'false') {
      // Only inactive (expired) records
      where.effectiveTo = { lt: now };
    }

    const records = await prisma.employeeTransaction.findMany({
      where,
      include: {
        transactionCode: {
          select: { id: true, code: true, name: true, type: true, calculationType: true },
        },
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── POST /api/employees/:empId/salary-structure ─────────────────────────────

router.post('/:empId/salary-structure', requirePermission('manage_employees'), async (req, res) => {
  const { empId } = req.params;

  if (!req.body.transactionCodeId) {
    return res.status(400).json({ message: 'transactionCodeId is required' });
  }
  if (req.body.value === undefined || req.body.value === '') {
    return res.status(400).json({ message: 'value is required' });
  }
  if (!req.body.effectiveFrom) {
    return res.status(400).json({ message: 'effectiveFrom is required' });
  }

  try {
    const emp = await getEmployee(empId, req.companyId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });

    // Verify the transaction code belongs to the same client
    if (req.clientId) {
      const tc = await prisma.transactionCode.findFirst({
        where: { id: req.body.transactionCodeId, clientId: req.clientId },
        select: { id: true },
      });
      if (!tc) return res.status(400).json({ message: 'Transaction code not found or not accessible' });
    }
    const data = pick(req.body);
    if (data.effectiveTo && data.effectiveTo <= data.effectiveFrom) {
      return res.status(400).json({ message: 'effectiveTo must be after effectiveFrom' });
    }

    const record = await prisma.employeeTransaction.create({
      data: { employeeId: empId, ...data },
      include: {
        transactionCode: {
          select: { id: true, code: true, name: true, type: true, calculationType: true },
        },
      },
    });

    await audit({
      req,
      action: 'SALARY_COMPONENT_ADDED',
      resource: 'employee_transaction',
      resourceId: record.id,
      details: { empId, transactionCode: record.transactionCode.code, value: record.value, currency: record.currency }
    });

    res.status(201).json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── PUT /api/employees/:empId/salary-structure/:id ──────────────────────────

router.put('/:empId/salary-structure/:id', requirePermission('manage_employees'), async (req, res) => {
  const { empId, id } = req.params;

  try {
    const emp = await getEmployee(empId, req.companyId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    const existing = await prisma.employeeTransaction.findFirst({ where: { id, employeeId: empId } });
    if (!existing) return res.status(404).json({ message: 'Record not found' });

    const data = pick({ ...existing, ...req.body }); // merge — caller only needs to send changed fields
    if (data.effectiveTo && data.effectiveTo <= data.effectiveFrom) {
      return res.status(400).json({ message: 'effectiveTo must be after effectiveFrom' });
    }

    const updated = await prisma.employeeTransaction.update({
      where: { id },
      data,
      include: {
        transactionCode: {
          select: { id: true, code: true, name: true, type: true, calculationType: true },
        },
      },
    });

    await audit({
      req,
      action: 'SALARY_COMPONENT_UPDATED',
      resource: 'employee_transaction',
      resourceId: updated.id,
      details: { 
        empId, 
        transactionCode: updated.transactionCode.code, 
        oldValue: existing.value, 
        newValue: updated.value,
        oldEffectiveFrom: existing.effectiveFrom,
        newEffectiveFrom: updated.effectiveFrom
      }
    });

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── DELETE /api/employees/:empId/salary-structure/:id ───────────────────────
// Pass ?endDate=true to soft-end-date (set effectiveTo=today) instead of hard delete.

router.delete('/:empId/salary-structure/:id', requirePermission('manage_employees'), async (req, res) => {
  const { empId, id } = req.params;
  const softEnd = req.query.endDate === 'true';

  try {
    const emp = await getEmployee(empId, req.companyId);
    if (!emp) return res.status(404).json({ message: 'Employee not found' });
    const existing = await prisma.employeeTransaction.findFirst({ where: { id, employeeId: empId } });
    if (!existing) return res.status(404).json({ message: 'Record not found' });

    if (softEnd) {
      // End-date: set effectiveTo to today
      const updated = await prisma.employeeTransaction.update({
        where: { id },
        data: { effectiveTo: new Date() },
        include: {
          transactionCode: {
            select: { id: true, code: true, name: true, type: true, calculationType: true },
          },
        },
      });
      await audit({
        req,
        action: 'SALARY_COMPONENT_ENDED',
        resource: 'employee_transaction',
        resourceId: id,
        details: { empId, transactionCode: updated.transactionCode.code, effectiveTo: updated.effectiveTo }
      });
      return res.json(updated);
    }

    await prisma.employeeTransaction.delete({ where: { id } });
    await audit({
      req,
      action: 'SALARY_COMPONENT_DELETED',
      resource: 'employee_transaction',
      resourceId: id,
      details: { empId, transactionCodeId: existing.transactionCodeId }
    });
    res.json({ message: 'Deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
