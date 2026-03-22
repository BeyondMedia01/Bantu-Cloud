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

    await prisma.$transaction(async (tx) => {
      // ORDER MATTERS due to foreign keys
      
      // 1. Transaction Codes & Grades
      for (const tc of (backupData.data.TransactionCode || [])) {
        await tx.transactionCode.upsert({
          where: { id: tc.id }, update: tc, create: tc
        });
      }
      for (const grade of (backupData.data.Grade || [])) {
        await tx.grade.upsert({
          where: { id: grade.id }, update: grade, create: grade
        });
      }

      // 2. Org Structure
      for (const branch of (backupData.data.Branch || [])) {
        await tx.branch.upsert({
          where: { id: branch.id }, update: branch, create: branch
        });
      }
      for (const dept of (backupData.data.Department || [])) {
        await tx.department.upsert({
          where: { id: dept.id }, update: dept, create: dept
        });
      }

      // 3. Employees
      for (const emp of (backupData.data.Employee || [])) {
        await tx.employee.upsert({
          where: { id: emp.id }, update: emp, create: emp
        });
      }

      // 4. Payroll Runs
      for (const run of (backupData.data.PayrollRun || [])) {
        await tx.payrollRun.upsert({
          where: { id: run.id }, update: run, create: run
        });
      }

      // 5. The rest (unordered)
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
        for (const item of items) {
          await tx[prismaModel].upsert({
            where: { id: item.id }, update: item, create: item
          });
        }
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
