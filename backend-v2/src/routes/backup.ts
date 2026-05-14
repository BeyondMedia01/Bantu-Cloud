import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const router = new Hono();

function getS3Client(c: any): S3Client {
  const env = c.env;
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
}

const BACKUP_BUCKET = 'backups';

async function generateBackupData(companyId: string, clientId: string) {
  const backupData: Record<string, any> = {
    version: '1.1',
    timestamp: new Date().toISOString(),
    companyId,
    clientId,
    data: {} as Record<string, any>,
  };

  const companyTables = ['Branch', 'Department', 'Employee', 'PayrollRun'];
  for (const model of companyTables) {
    const prismaModel = model.charAt(0).toLowerCase() + model.slice(1) as keyof typeof prisma;
    backupData.data[model] = await (prisma[prismaModel] as any).findMany({ where: { companyId } });
  }

  const employeeIds = (backupData.data.Employee || []).map((e: any) => e.id);
  const runIds = (backupData.data.PayrollRun || []).map((r: any) => r.id);

  const employeeLinkedTables = [
    'EmployeeBankAccount', 'EmployeeTransaction', 'LeaveRecord',
    'LeaveRequest', 'LeaveBalance', 'Loan', 'AttendanceRecord',
    'EmployeeDocument',
  ];
  for (const model of employeeLinkedTables) {
    const prismaModel = model.charAt(0).toLowerCase() + model.slice(1) as keyof typeof prisma;
    backupData.data[model] = await (prisma[prismaModel] as any).findMany({ where: { employeeId: { in: employeeIds } } });
  }

  const runLinkedTables = ['Payslip', 'PayrollTransaction', 'PayrollInput'];
  for (const model of runLinkedTables) {
    const prismaModel = model.charAt(0).toLowerCase() + model.slice(1) as keyof typeof prisma;
    backupData.data[model] = await (prisma[prismaModel] as any).findMany({
      where: { OR: [{ employeeId: { in: employeeIds } }, { payrollRunId: { in: runIds } }] },
    });
  }

  const loanIds = (backupData.data.Loan || []).map((l: any) => l.id);
  backupData.data.LoanRepayment = await prisma.loanRepayment.findMany({ where: { loanId: { in: loanIds } } });

  backupData.data.TransactionCode = await prisma.transactionCode.findMany({ where: { clientId } });
  backupData.data.Grade = await prisma.grade.findMany({ where: { clientId } });

  return backupData;
}

const ALLOWED_RESTORE_MODELS = [
  'TransactionCode', 'Grade', 'Branch', 'Department',
  'Employee', 'PayrollRun',
  'EmployeeBankAccount', 'EmployeeTransaction', 'LeaveRecord',
  'LeaveRequest', 'LeaveBalance', 'Loan', 'AttendanceRecord',
  'EmployeeDocument', 'Payslip', 'PayrollTransaction', 'PayrollInput',
  'LoanRepayment',
];

router.get('/export', requirePermission('manage_company'), async (c) => {
  const companyId = c.get('companyId') as string;
  const clientId = c.get('clientId') as string || '';
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const backupData = await generateBackupData(companyId, clientId);
    await audit({ c, action: 'EXPORT_BACKUP', resource: 'Backup', details: { companyId } });
    return c.json(backupData);
  } catch (error: any) {
    console.error('Backup export error:', error);
    return c.json({ message: 'Failed to generate backup' }, 500);
  }
});

router.post('/restore', requirePermission('manage_company'), async (c) => {
  const _companyId = c.get('companyId') as string;
  const _clientId = c.get('clientId') as string || '';
  if (!_companyId) return c.json({ message: 'Company context missing' }, 400);

  const { backupData } = await c.req.json();
  if (!backupData || !backupData.data || typeof backupData.data !== 'object') {
    return c.json({ message: 'Invalid backup format' }, 400);
  }

  try {
    for (const model of Object.keys(backupData.data)) {
      if (!ALLOWED_RESTORE_MODELS.includes(model)) {
        return c.json({ error: `Model ${model} is not restorable` }, 400);
      }
    }

    for (const model of Object.keys(backupData.data)) {
      const items = backupData.data[model];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.companyId !== undefined) item.companyId = _companyId;
          if (item.clientId !== undefined) item.clientId = _clientId;
        }
      }
    }

    async function batchUpsert(prismaModelName: string, items: any[], chunkSize = 50) {
      if (!items || items.length === 0) return;
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        await Promise.all(
          chunk.map((item: any) => (prisma as any)[prismaModelName].upsert({ where: { id: item.id }, update: item, create: item })),
        );
      }
    }

    await Promise.all([
      batchUpsert('transactionCode', backupData.data.TransactionCode),
      batchUpsert('grade', backupData.data.Grade),
    ]);

    await Promise.all([
      batchUpsert('branch', backupData.data.Branch),
      batchUpsert('department', backupData.data.Department),
    ]);

    await batchUpsert('employee', backupData.data.Employee);
    await batchUpsert('payrollRun', backupData.data.PayrollRun);

    const RELATIONAL_TABLES = [
      'EmployeeBankAccount', 'EmployeeTransaction', 'LeaveRecord',
      'LeaveRequest', 'LeaveBalance', 'Loan', 'AttendanceRecord',
      'EmployeeDocument', 'Payslip', 'PayrollTransaction', 'PayrollInput',
      'LoanRepayment',
    ];
    for (const model of RELATIONAL_TABLES) {
      const items = backupData.data[model];
      if (!items) continue;
      const prismaModel = model.charAt(0).toLowerCase() + model.slice(1);
      await batchUpsert(prismaModel, items);
    }

    await audit({ c, action: 'RESTORE_BACKUP', resource: 'Backup', details: { companyId: _companyId } });
    return c.json({ message: 'Restore completed successfully' });
  } catch (error: any) {
    console.error('Backup restore error:', error);
    return c.json({ message: 'Failed to restore backup: ' + error.message }, 500);
  }
});

router.post('/cloud-upload', requirePermission('manage_company'), async (c) => {
  const companyId = c.get('companyId') as string;
  const clientId = c.get('clientId') as string || '';
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const backupData = await generateBackupData(companyId, clientId);
    const json = JSON.stringify(backupData);
    const body = new TextEncoder().encode(json);

    const filename = `company_${companyId}_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const storagePath = `${clientId}/${companyId}/${filename}`;

    const s3 = getS3Client(c);
    await s3.send(new PutObjectCommand({
      Bucket: BACKUP_BUCKET,
      Key: storagePath,
      Body: body,
      ContentType: 'application/json',
    }));

    await audit({
      c,
      action: 'CLOUD_BACKUP_UPLOAD',
      resource: 'Backup',
      details: { companyId, filename, size: json.length },
    });

    const sizeKB = (json.length / 1024).toFixed(1);

    return c.json({
      message: 'Backup uploaded to cloud storage',
      filename,
      rawSizeKB: sizeKB,
    });
  } catch (error: any) {
    console.error('Cloud backup upload error:', error);
    return c.json({ message: 'Failed to upload backup: ' + error.message }, 500);
  }
});

router.get('/cloud-list', requirePermission('manage_company'), async (c) => {
  const companyId = c.get('companyId') as string;
  const clientId = c.get('clientId') as string || '';
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const s3 = getS3Client(c);
    const result = await s3.send(new ListObjectsV2Command({
      Bucket: BACKUP_BUCKET,
      Prefix: `${clientId}/${companyId}/`,
    }));

    const backups = (result.Contents || []).map((o) => ({
      name: (o.Key || '').split('/').pop(),
      size: o.Size,
      lastModified: o.LastModified,
    }));

    return c.json({ backups });
  } catch (error: any) {
    console.error('Cloud backup list error:', error);
    return c.json({ message: 'Failed to list backups: ' + error.message }, 500);
  }
});

router.get('/cloud-download/:filename', requirePermission('manage_company'), async (c) => {
  const companyId = c.get('companyId') as string;
  const clientId = c.get('clientId') as string || '';
  const filename = c.req.param('filename');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const s3 = getS3Client(c);
    const storagePath = `${clientId}/${companyId}/${filename}`;
    const command = new GetObjectCommand({ Bucket: BACKUP_BUCKET, Key: storagePath });
    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    await audit({
      c,
      action: 'CLOUD_BACKUP_DOWNLOAD',
      resource: 'Backup',
      details: { companyId, filename },
    });

    return c.redirect(signedUrl);
  } catch (error: any) {
    console.error('Cloud backup download error:', error);
    return c.json({ message: 'Failed to download backup: ' + error.message }, 500);
  }
});

export default router;
