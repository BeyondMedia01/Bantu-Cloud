const express = require('express');
const zlib = require('zlib');
const prisma = require('../lib/prisma');
const { requirePermission, requireModule } = require('../lib/permissions');
const { audit } = require('../lib/audit');
const { ensureBucket, uploadBuffer, listObjects, getSignedUrl } = require('../lib/supabase');

const router = express.Router();
router.use(requireModule('SETTINGS'));
const BACKUP_BUCKET = process.env.BACKUP_BUCKET || 'backups';

async function generateBackupData(companyId, clientId) {
  const backupData = {
    version: '1.1',
    timestamp: new Date().toISOString(),
    companyId,
    clientId,
    data: {}
  };

  const companyTables = ['Branch', 'Department', 'Employee', 'PayrollRun'];
  for (const model of companyTables) {
    const prismaModel = model.charAt(0).toLowerCase() + model.slice(1);
    backupData.data[model] = await prisma[prismaModel].findMany({ where: { companyId } });
  }

  const employeeIds = backupData.data.Employee.map(e => e.id);
  const runIds = backupData.data.PayrollRun.map(r => r.id);

  const employeeLinkedTables = [
    'EmployeeBankAccount', 'EmployeeTransaction', 'LeaveRecord',
    'LeaveRequest', 'LeaveBalance', 'Loan', 'AttendanceRecord',
    'EmployeeDocument'
  ];
  for (const model of employeeLinkedTables) {
    const prismaModel = model.charAt(0).toLowerCase() + model.slice(1);
    backupData.data[model] = await prisma[prismaModel].findMany({ where: { employeeId: { in: employeeIds } } });
  }

  const runLinkedTables = ['Payslip', 'PayrollTransaction', 'PayrollInput'];
  for (const model of runLinkedTables) {
    const prismaModel = model.charAt(0).toLowerCase() + model.slice(1);
    backupData.data[model] = await prisma[prismaModel].findMany({
      where: { OR: [{ employeeId: { in: employeeIds } }, { payrollRunId: { in: runIds } }] }
    });
  }

  const loanIds = backupData.data.Loan.map(l => l.id);
  backupData.data.LoanRepayment = await prisma.loanRepayment.findMany({ where: { loanId: { in: loanIds } } });

  backupData.data.TransactionCode = await prisma.transactionCode.findMany({ where: { clientId } });
  backupData.data.Grade = await prisma.grade.findMany({ where: { clientId } });

  return backupData;
}

// GET /api/backup/export
router.get('/export', requirePermission('manage_company'), async (req, res) => {
  const companyId = req.companyId;
  const clientId = req.clientId;
  if (!companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const backupData = await generateBackupData(companyId, clientId);

    await audit({
      userId: req.userId, clientId, action: 'EXPORT_BACKUP', resource: 'Backup', details: { companyId }
    });

    res.json(backupData);

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

    // Normalize companyId and clientId to prevent cross-tenant restore
    for (const model of Object.keys(backupData.data)) {
      const items = backupData.data[model];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.companyId !== undefined) item.companyId = companyId;
          if (item.clientId !== undefined) item.clientId = req.clientId;
        }
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

    await audit({
      userId: req.userId, clientId: req.clientId, action: 'RESTORE_BACKUP', resource: 'Backup', details: { companyId }
    });

    res.json({ message: 'Restore completed successfully' });

  } catch (error) {
    console.error('Backup restore error:', error);
    res.status(500).json({ message: 'Failed to restore backup: ' + error.message });
  }
});

// ─── Cloud Backups (Supabase Storage) ─────────────────────────────────────

// POST /api/backup/cloud-upload — generate, compress, upload to Supabase
router.post('/cloud-upload', requirePermission('manage_company'), async (req, res) => {
  const companyId = req.companyId;
  const clientId = req.clientId;
  if (!companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const backupData = await generateBackupData(companyId, clientId);
    const json = JSON.stringify(backupData);
    const gzipped = zlib.gzipSync(json);

    const filename = `company_${companyId}_${new Date().toISOString().replace(/[:.]/g, '-')}.json.gz`;
    const storagePath = `${clientId}/${companyId}/${filename}`;

    await ensureBucket(BACKUP_BUCKET);
    await uploadBuffer(BACKUP_BUCKET, storagePath, gzipped, 'application/gzip');

    await audit({
      userId: req.userId, clientId, action: 'CLOUD_BACKUP_UPLOAD', resource: 'Backup',
      details: { companyId, filename, size: gzipped.length },
    });

    const jsonSizeKB = (json.length / 1024).toFixed(1);
    const gzipSizeKB = (gzipped.length / 1024).toFixed(1);

    res.json({
      message: 'Backup uploaded to cloud storage',
      filename,
      rawSizeKB: jsonSizeKB,
      compressedSizeKB: gzipSizeKB,
      compressionRatio: ((1 - gzipped.length / json.length) * 100).toFixed(1) + '%',
    });

  } catch (error) {
    console.error('Cloud backup upload error:', error);
    res.status(500).json({ message: 'Failed to upload backup: ' + error.message });
  }
});

// GET /api/backup/cloud-list — list backups in Supabase bucket
router.get('/cloud-list', requirePermission('manage_company'), async (req, res) => {
  const clientId = req.clientId;
  const companyId = req.companyId;
  if (!companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    await ensureBucket(BACKUP_BUCKET);
    const objects = await listObjects(BACKUP_BUCKET, `${clientId}/${companyId}/`);

    const backups = objects.map(o => ({
      name: o.name.split('/').pop(),
      size: o.metadata?.size || o.size,
      created_at: o.created_at,
    }));

    res.json({ backups });

  } catch (error) {
    console.error('Cloud backup list error:', error);
    res.status(500).json({ message: 'Failed to list backups: ' + error.message });
  }
});

// GET /api/backup/cloud-download/:filename — signed URL redirect
router.get('/cloud-download/:filename', requirePermission('manage_company'), async (req, res) => {
  const clientId = req.clientId;
  const companyId = req.companyId;
  if (!companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    await ensureBucket(BACKUP_BUCKET);
    const storagePath = `${clientId}/${companyId}/${req.params.filename}`;
    const signedUrl = await getSignedUrl(BACKUP_BUCKET, storagePath, 3600);

    await audit({
      userId: req.userId, clientId, action: 'CLOUD_BACKUP_DOWNLOAD', resource: 'Backup',
      details: { companyId, filename: req.params.filename },
    });

    res.redirect(302, signedUrl);

  } catch (error) {
    console.error('Cloud backup download error:', error);
    res.status(500).json({ message: 'Failed to download backup: ' + error.message });
  }
});

module.exports = router;
