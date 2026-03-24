const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

// GET /api/backup/export
router.get('/export', requirePermission('manage_company'), async (req, res) => {
  const companyId = req.companyId;
  const clientId = req.clientId;
  if (!companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const backupData = {
      version: '1.1',
      timestamp: new Date().toISOString(),
      companyId,
      clientId,
      data: {}
    };

    // 1. Independent Company Tables
    const companyTables = ['Branch', 'Department', 'Employee', 'PayrollRun'];
    for (const model of companyTables) {
      const prismaModel = model.charAt(0).toLowerCase() + model.slice(1);
      backupData.data[model] = await prisma[prismaModel].findMany({
        where: { companyId }
      });
    }

    const employeeIds = backupData.data.Employee.map(e => e.id);
    const runIds = backupData.data.PayrollRun.map(r => r.id);

    // 2. Employee-linked Tables
    const employeeLinkedTables = [
      'EmployeeBankAccount', 'EmployeeTransaction', 'LeaveRecord',
      'LeaveRequest', 'LeaveBalance', 'Loan', 'AttendanceRecord',
      'EmployeeDocument'
    ];
    for (const model of employeeLinkedTables) {
      const prismaModel = model.charAt(0).toLowerCase() + model.slice(1);
      backupData.data[model] = await prisma[prismaModel].findMany({
        where: { employeeId: { in: employeeIds } }
      });
    }

    // 3. Run-linked Tables
    const runLinkedTables = ['Payslip', 'PayrollTransaction', 'PayrollInput'];
    for (const model of runLinkedTables) {
      const prismaModel = model.charAt(0).toLowerCase() + model.slice(1);
      backupData.data[model] = await prisma[prismaModel].findMany({
        where: { OR: [
          { employeeId: { in: employeeIds } },
          { payrollRunId: { in: runIds } }
        ]}
      });
    }

    // 4. Loan Repayments (linked to loans)
    const loanIds = backupData.data.Loan.map(l => l.id);
    backupData.data.LoanRepayment = await prisma.loanRepayment.findMany({
      where: { loanId: { in: loanIds } }
    });

    // 5. Shared Client Tables (TransactionCodes, Grades)
    backupData.data.TransactionCode = await prisma.transactionCode.findMany({
      where: { clientId }
    });
    backupData.data.Grade = await prisma.grade.findMany({
      where: { clientId }
    });

    res.json(backupData);
    
    await audit({
      userId: req.userId, clientId, action: 'EXPORT_BACKUP', resource: 'Backup', details: { companyId }
    });

  } catch (error) {
    console.error('Backup export error:', error);
    res.status(500).json({ message: 'Failed to generate backup' });
  }
});

// Allowed models for restore — explicit whitelist prevents untrusted mass-upsert
const ALLOWED_RESTORE_MODELS = [
  'TransactionCode', 'Grade', 'Branch', 'Department',
  'Employee', 'PayrollRun',
  'EmployeeBankAccount', 'EmployeeTransaction', 'LeaveRecord',
  'LeaveRequest', 'LeaveBalance', 'Loan', 'AttendanceRecord',
  'EmployeeDocument', 'Payslip', 'PayrollTransaction', 'PayrollInput',
  'LoanRepayment'
];

// POST /api/backup/restore
router.post('/restore', requirePermission('manage_company'), async (req, res) => {
  const companyId = req.companyId;
  const { backupData } = req.body;

  if (!companyId || !backupData) {
    return res.status(400).json({ message: 'Invalid restore request' });
  }

  try {
    if (!backupData.data || typeof backupData.data !== 'object') {
      return res.status(400).json({ message: 'Invalid backup format' });
    }

    // Reject any model key in the backup that is not in the whitelist
    for (const model of Object.keys(backupData.data)) {
      if (!ALLOWED_RESTORE_MODELS.includes(model)) {
        return res.status(400).json({ error: `Model ${model} is not restorable` });
      }
    }

    // Helper: batch upserts for a model in parallel chunks (reduces sequential round-trips)
    async function batchUpsert(tx, prismaModelName, items, chunkSize = 50) {
      if (!items || items.length === 0) return;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((item) => tx[prismaModelName].upsert({ where: { id: item.id }, update: item, create: item }))
        );
      }
    }

    await prisma.$transaction(async (tx) => {
      // ORDER MATTERS due to foreign keys

      // 1. Transaction Codes & Grades (can run in parallel — no FK between them)
      await Promise.all([
        batchUpsert(tx, 'transactionCode', backupData.data.TransactionCode),
        batchUpsert(tx, 'grade', backupData.data.Grade),
      ]);

      // 2. Org Structure (Branch & Department can run in parallel)
      await Promise.all([
        batchUpsert(tx, 'branch', backupData.data.Branch),
        batchUpsert(tx, 'department', backupData.data.Department),
      ]);

      // 3. Employees
      await batchUpsert(tx, 'employee', backupData.data.Employee);

      // 4. Payroll Runs
      await batchUpsert(tx, 'payrollRun', backupData.data.PayrollRun);

      // 5. The rest (whitelisted relational tables only)
      const RELATIONAL_TABLES = [
        'EmployeeBankAccount', 'EmployeeTransaction', 'LeaveRecord',
        'LeaveRequest', 'LeaveBalance', 'Loan', 'AttendanceRecord',
        'EmployeeDocument', 'Payslip', 'PayrollTransaction', 'PayrollInput',
        'LoanRepayment'
      ];

      for (const model of RELATIONAL_TABLES) {
        const items = backupData.data[model];
        if (!items) continue;
        const prismaModel = model.charAt(0).toLowerCase() + model.slice(1);
        await batchUpsert(tx, prismaModel, items);
      }
    }, {
      timeout: 30000 // Extended timeout for large restores
    });

    res.json({ message: 'Restore completed successfully' });

    await audit({
      userId: req.userId, clientId: req.clientId, action: 'RESTORE_BACKUP', resource: 'Backup', details: { companyId }
    });

  } catch (error) {
    console.error('Backup restore error:', error);
    res.status(500).json({ message: 'Failed to restore backup: ' + error.message });
  }
});

module.exports = router;
