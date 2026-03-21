const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// List all exports for a company
router.get('/', async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  try {
    const exports = await prisma.payslipExport.findMany({
      where: { companyId },
      include: {
        employee: {
          select: {
            fullName: true,
            employeeID: true,
            bankAccountUSD: true,
            bankAccountZiG: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(exports);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch export records' });
  }
});

// Create a new export record
router.post('/', async (req, res) => {
  const companyId = req.headers['x-company-id'];
  if (!companyId) return res.status(400).json({ error: 'Company ID is required' });

  const {
    employeeId,
    payPeriod,
    exportType,
    netPayUSD,
    netPayZiG,
    bankAccountUSD,
    bankAccountZiG,
    exportFormat,
    exportStatus,
    exportedBy,
    notes
  } = req.body;

  try {
    const newExport = await prisma.payslipExport.create({
      data: {
        companyId,
        employeeId,
        payPeriod: new Date(payPeriod),
        exportType,
        netPayUSD,
        netPayZiG,
        bankAccountUSD,
        bankAccountZiG,
        exportFormat,
        exportStatus: exportStatus || 'PENDING',
        exportedBy,
        exportDate: new Date(),
        notes
      }
    });
    res.status(201).json(newExport);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create export record' });
  }
});

// Update export status (e.g. mark as exported or failed)
router.patch('/:id', async (req, res) => {
  const { id } = req.params;
  const { exportStatus, notes, exportedBy } = req.body;

  try {
    const updated = await prisma.payslipExport.update({
      where: { id },
      data: {
        exportStatus,
        notes,
        exportedBy,
        exportDate: exportStatus === 'EXPORTED' ? new Date() : undefined
      }
    });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update export record' });
  }
});

// Delete an export record
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.payslipExport.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete export record' });
  }
});

module.exports = router;
