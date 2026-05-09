const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission, requireModule } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();
router.use(requireModule('EXPENSES'));

// GET /api/expenses
router.get('/', requirePermission('view_loans'), async (req, res) => {
  const { employeeId, status, categoryId } = req.query;
  try {
    const where = {
      ...(req.companyId && { companyId: req.companyId }),
      ...(employeeId && { employeeId }),
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(req.user.role === 'EMPLOYEE' && req.employeeId && { employeeId: req.employeeId }),
    };

    const expenses = await prisma.expense.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        category: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: expenses });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/expenses/categories
router.get('/categories', async (req, res) => {
  try {
    const categories = await prisma.expenseCategory.findMany({
      where: req.companyId ? { companyId: req.companyId } : {},
      orderBy: { name: 'asc' },
    });
    res.json({ data: categories });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/expenses
router.post('/', requirePermission('manage_loans'), async (req, res) => {
  const { employeeId, categoryId, amount, currency, description, receiptUrl, notes } = req.body;
  if (!employeeId || !categoryId || !amount || !description) {
    return res.status(400).json({ message: 'employeeId, categoryId, amount, and description are required' });
  }
  if (parseFloat(amount) <= 0) return res.status(400).json({ message: 'amount must be greater than 0' });

  try {
    if (req.companyId) {
      const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } });
      if (!emp) return res.status(404).json({ message: 'Employee not found' });
      if (emp.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    }

    const expense = await prisma.expense.create({
      data: {
        companyId: req.companyId,
        employeeId,
        categoryId,
        amount: parseFloat(amount),
        currency: currency || 'USD',
        description,
        receiptUrl,
        notes,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        category: { select: { name: true } },
      },
    });

    await audit({
      req,
      action: 'EXPENSE_CREATED',
      resource: 'expense',
      resourceId: expense.id,
      details: { employeeId, amount: parseFloat(amount), categoryId },
    });

    res.status(201).json(expense);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/expenses/:id
router.get('/:id', async (req, res) => {
  try {
    const expense = await prisma.expense.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true, companyId: true } },
        category: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    });
    if (!expense) return res.status(404).json({ message: 'Expense not found' });
    if (req.companyId && expense.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json({ data: expense });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/expenses/:id
router.put('/:id', requirePermission('manage_loans'), async (req, res) => {
  const { amount, currency, description, receiptUrl, notes } = req.body;
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Expense not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (existing.status !== 'PENDING') return res.status(400).json({ message: 'Can only edit pending expenses' });

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: {
        ...(amount && { amount: parseFloat(amount) }),
        ...(currency && { currency }),
        ...(description && { description }),
        ...(receiptUrl !== undefined && { receiptUrl }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        category: { select: { name: true } },
      },
    });

    await audit({ req, action: 'EXPENSE_UPDATED', resource: 'expense', resourceId: expense.id, details: {} });
    res.json({ data: expense });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Expense not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/expenses/:id
router.delete('/:id', requirePermission('manage_loans'), async (req, res) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Expense not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (existing.status !== 'PENDING') return res.status(400).json({ message: 'Can only delete pending expenses' });

    await prisma.expense.delete({ where: { id: req.params.id } });
    await audit({ req, action: 'EXPENSE_DELETED', resource: 'expense', resourceId: req.params.id, details: {} });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Expense not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/expenses/:id/approve
router.put('/:id/approve', requirePermission('approve_loans'), async (req, res) => {
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Expense not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (existing.status !== 'PENDING') return res.status(400).json({ message: 'Can only approve pending expenses' });

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', approvedById: req.user.userId, approvedAt: new Date() },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        category: { select: { name: true } },
      },
    });

    await audit({ req, action: 'EXPENSE_APPROVED', resource: 'expense', resourceId: expense.id, details: {} });
    res.json({ data: expense });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Expense not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/expenses/:id/reject
router.put('/:id/reject', requirePermission('approve_loans'), async (req, res) => {
  const { reason } = req.body;
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Expense not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (existing.status !== 'PENDING') return res.status(400).json({ message: 'Can only reject pending expenses' });

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', notes: reason || existing.notes, approvedById: req.user.userId, approvedAt: new Date() },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        category: { select: { name: true } },
      },
    });

    await audit({ req, action: 'EXPENSE_REJECTED', resource: 'expense', resourceId: expense.id, details: { reason } });
    res.json({ data: expense });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Expense not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/expenses/:id/process — mark as paid in payroll
router.post('/:id/process', requirePermission('manage_loans'), async (req, res) => {
  const { payrollRunId } = req.body;
  try {
    const existing = await prisma.expense.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Expense not found' });
    if (req.companyId && existing.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });
    if (existing.status !== 'APPROVED') return res.status(400).json({ message: 'Can only process approved expenses' });

    const expense = await prisma.expense.update({
      where: { id: req.params.id },
      data: { status: 'PAID', paidInPayroll: true, ...(payrollRunId && { payrollRunId }) },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        category: { select: { name: true } },
      },
    });

    await audit({ req, action: 'EXPENSE_PAID', resource: 'expense', resourceId: expense.id, details: { payrollRunId } });
    res.json({ data: expense });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Expense not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
