const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

// GET /api/loans
router.get('/', async (req, res) => {
  const { employeeId, status } = req.query;
  try {
    const where = {
      ...(req.clientId && { employee: { clientId: req.clientId } }),
      ...(req.companyId && { employee: { companyId: req.companyId } }),
      ...(employeeId && { employeeId }),
      ...(status && { status }),
      ...(req.user.role === 'EMPLOYEE' && req.employeeId && { employeeId: req.employeeId }),
    };

    const loans = await prisma.loan.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        _count: { select: { repayments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(loans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/loans
router.post('/', requirePermission('manage_loans'), async (req, res) => {
  const { employeeId, amount, interestRate, termMonths, startDate, repaymentMethod, notes } = req.body;
  if (!employeeId || !amount || !termMonths || !startDate) {
    return res.status(400).json({ message: 'employeeId, amount, termMonths, startDate are required' });
  }
  if (parseFloat(amount) <= 0) return res.status(400).json({ message: 'amount must be greater than 0' });
  if (parseInt(termMonths) <= 0) return res.status(400).json({ message: 'termMonths must be greater than 0' });

  try {
    const monthlyPayment = (parseFloat(amount) * (1 + (parseFloat(interestRate || 0) / 100))) / parseInt(termMonths);

    const loan = await prisma.loan.create({
      data: {
        employeeId,
        amount: parseFloat(amount),
        interestRate: parseFloat(interestRate || 0),
        termMonths: parseInt(termMonths),
        startDate: new Date(startDate),
        repaymentMethod: repaymentMethod || 'SALARY_DEDUCTION',
        notes,
        repayments: {
          create: Array.from({ length: parseInt(termMonths) }, (_, i) => {
            const dueDate = new Date(startDate);
            dueDate.setMonth(dueDate.getMonth() + i + 1);
            return { amount: parseFloat(monthlyPayment.toFixed(2)), dueDate };
          }),
        },
      },
      include: { repayments: true },
    });

    await audit({
      req,
      action: 'LOAN_CREATED',
      resource: 'loan',
      resourceId: loan.id,
      details: { employeeId, amount: parseFloat(amount), termMonths: parseInt(termMonths) },
    });

    res.status(201).json(loan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/loans/:id
router.get('/:id', async (req, res) => {
  try {
    const loan = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true, companyId: true } },
        repayments: { orderBy: { dueDate: 'asc' } },
      },
    });
    if (!loan) return res.status(404).json({ message: 'Loan not found' });

    if (req.companyId && loan.employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(loan);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/loans/:id
router.put('/:id', requirePermission('manage_loans'), async (req, res) => {
  const { status, notes, repaymentMethod } = req.body;
  try {
    const existing = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { companyId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Loan not found' });
    if (req.companyId && existing.employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const loan = await prisma.loan.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes }),
        ...(repaymentMethod && { repaymentMethod }),
      },
    });

    await audit({
      req,
      action: status ? `LOAN_STATUS_${status}` : 'LOAN_UPDATED',
      resource: 'loan',
      resourceId: loan.id,
      details: { status, repaymentMethod },
    });

    res.json(loan);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Loan not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/loans/:id
router.delete('/:id', requirePermission('manage_loans'), async (req, res) => {
  try {
    const existing = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { companyId: true } } },
    });
    if (!existing) return res.status(404).json({ message: 'Loan not found' });
    if (req.companyId && existing.employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await prisma.loan.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Loan not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/loans/:id/repayments
router.get('/:id/repayments', async (req, res) => {
  try {
    const loan = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { companyId: true } } },
    });
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (req.companyId && loan.employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const repayments = await prisma.loanRepayment.findMany({
      where: { loanId: req.params.id },
      orderBy: { dueDate: 'asc' },
    });
    res.json(repayments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PATCH /api/loans/repayments/:id — mark repayment paid
router.patch('/repayments/:id', requirePermission('manage_loans'), async (req, res) => {
  try {
    const repayment = await prisma.loanRepayment.update({
      where: { id: req.params.id },
      data: { status: 'PAID', paidDate: new Date() },
    });
    res.json(repayment);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Repayment not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
