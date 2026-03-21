const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Get all payroll users for a company
router.get('/', async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  try {
    const users = await prisma.payrollUser.findMany({
      where: { companyId },
      orderBy: { fullName: 'asc' }
    });
    res.json(users);
  } catch (error) {
    console.error('Failed to fetch payroll users:', error);
    res.status(500).json({ error: 'Failed to fetch payroll users' });
  }
});

// Create a new payroll user
router.post('/', async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  const {
    fullName,
    email,
    role,
    isActive,
    canProcessPayroll,
    canEditEmployees,
    canViewReports,
    canExportData,
    createdBy,
    notes
  } = req.body;

  // If role is ADMIN, force all permissions to true
  const isAdmin = role === 'ADMIN';

  try {
    const newUser = await prisma.payrollUser.create({
      data: {
        companyId,
        fullName,
        email,
        role: role || 'VIEWER',
        isActive: isActive !== undefined ? isActive : true,
        canProcessPayroll: isAdmin ? true : !!canProcessPayroll,
        canEditEmployees: isAdmin ? true : !!canEditEmployees,
        canViewReports: isAdmin ? true : !!canViewReports,
        canExportData: isAdmin ? true : !!canExportData,
        createdBy,
        notes
      }
    });
    res.status(201).json(newUser);
  } catch (error) {
    console.error('Failed to create payroll user:', error);
    if (error.code === 'P2002') {
      return res.status(409).json({ error: 'A user with this email already exists.' });
    }
    res.status(500).json({ error: 'Failed to create payroll user' });
  }
});

// Update a payroll user
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const companyId = req.headers['x-company-id'];
  
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  const {
    fullName,
    role,
    isActive,
    canProcessPayroll,
    canEditEmployees,
    canViewReports,
    canExportData,
    notes
  } = req.body;

  try {
    const existing = await prisma.payrollUser.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Determine current role based on update or existing
    const updatedRole = role !== undefined ? role : existing.role;
    const isAdmin = updatedRole === 'ADMIN';

    const updatedUser = await prisma.payrollUser.update({
      where: { id },
      data: {
        ...(fullName !== undefined && { fullName }),
        ...(role !== undefined && { role }),
        ...(isActive !== undefined && { isActive }),
        ...(canProcessPayroll !== undefined && { canProcessPayroll: isAdmin ? true : canProcessPayroll }),
        ...(canEditEmployees !== undefined && { canEditEmployees: isAdmin ? true : canEditEmployees }),
        ...(canViewReports !== undefined && { canViewReports: isAdmin ? true : canViewReports }),
        ...(canExportData !== undefined && { canExportData: isAdmin ? true : canExportData }),
        ...(notes !== undefined && { notes })
      }
    });
    res.json(updatedUser);
  } catch (error) {
    console.error('Failed to update payroll user:', error);
    res.status(500).json({ error: 'Failed to update payroll user' });
  }
});

// Delete a payroll user
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  const companyId = req.headers['x-company-id'];

  try {
    const existing = await prisma.payrollUser.findUnique({ where: { id } });
    if (!existing || existing.companyId !== companyId) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.payrollUser.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error('Failed to delete payroll user:', error);
    res.status(500).json({ error: 'Failed to delete payroll user' });
  }
});

module.exports = router;
