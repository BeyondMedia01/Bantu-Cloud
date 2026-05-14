import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';

const router = new Hono();

const FORMATS = ['cbz', 'stanbic', 'fidelity'];

function csvRow(fields: (string | number | undefined | null)[]) {
  return fields
    .map((f) => {
      const s = String(f ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}

async function getPayslipsForRun(runId: string, companyId: string | undefined) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    select: { id: true, companyId: true, startDate: true, currency: true, dualCurrency: true, exchangeRate: true },
  });
  if (!run) return null;
  if (!companyId || run.companyId !== companyId) return null;

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, employeeCode: true,
          bankName: true, bankBranch: true, accountNumber: true,
          currency: true, paymentMethod: true,
          bankAccounts: {
            orderBy: { priority: 'asc' },
            take: 1,
            select: { accountNumber: true, bankName: true, bankBranch: true, branchCode: true },
          },
        },
      },
    },
    orderBy: { employee: { lastName: 'asc' } },
  });

  return { run, payslips };
}

router.get('/:format/:runId', requirePermission('export_reports'), async (c) => {
  const { format, runId } = c.req.param();
  const companyId = c.get('companyId');

  if (!FORMATS.includes(format)) {
    return c.json({ message: `Unsupported format. Use one of: ${FORMATS.join(', ')}` }, 400);
  }
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const result = await getPayslipsForRun(runId, companyId);
    if (!result) return c.json({ message: 'Payroll run not found' }, 404);

    const { run, payslips } = result;

    const period = run.startDate ? new Date(run.startDate) : new Date();
    const periodStr = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}`;

    const resolvedPayslips = payslips.map((p) => {
      const linked = p.employee.bankAccounts?.[0];
      return {
        ...p,
        _bank: {
          accountNumber: p.employee.accountNumber || linked?.accountNumber || '',
          bankName: p.employee.bankName || linked?.bankName || '',
          bankBranch: p.employee.bankBranch || linked?.bankBranch || '',
          branchCode: linked?.branchCode || p.employee.bankBranch || '',
        },
      };
    });

    const bankPayees = resolvedPayslips.filter(
      (p) => p.employee.paymentMethod !== 'CASH' && p._bank.accountNumber
    );

    if (bankPayees.length === 0) {
      return c.json({ message: 'No employees with bank account details found for this run.' }, 422);
    }

    let csvContent: string;
    let filename: string;

    if (format === 'cbz') {
      const header = csvRow(['BeneficiaryName', 'AccountNumber', 'BranchCode', 'Amount', 'Currency', 'Reference', 'Narration']);
      const rows = bankPayees.map((p) => {
        const net = run.dualCurrency ? (p.netPayUSD ?? p.netPay) : p.netPay;
        return csvRow([
          `${p.employee.firstName} ${p.employee.lastName}`,
          p._bank.accountNumber,
          p._bank.bankBranch,
          Number(net).toFixed(2),
          run.dualCurrency ? 'USD' : run.currency,
          `${p.employee.employeeCode}-${periodStr}`,
          `Salary ${periodStr}`,
        ]);
      });
      csvContent = [header, ...rows].join('\n');
      filename = `CBZ-Payments-${periodStr}.csv`;
    } else if (format === 'stanbic') {
      const header = csvRow([
        'SequenceNo', 'BeneficiaryName', 'BeneficiaryAccount',
        'BankCode', 'BranchCode', 'Amount', 'Currency',
        'PaymentReference', 'BeneficiaryNarration',
      ]);
      const rows = bankPayees.map((p, i) => {
        const net = run.dualCurrency ? (p.netPayUSD ?? p.netPay) : p.netPay;
        return csvRow([
          String(i + 1).padStart(6, '0'),
          `${p.employee.firstName} ${p.employee.lastName}`,
          p._bank.accountNumber,
          '003',
          p._bank.branchCode,
          Number(net).toFixed(2),
          run.dualCurrency ? 'USD' : run.currency,
          `${p.employee.employeeCode}-${periodStr}`,
          `Salary ${periodStr}`,
        ]);
      });
      csvContent = [header, ...rows].join('\n');
      filename = `Stanbic-EFT-${periodStr}.csv`;
    } else {
      const header = csvRow([
        'TransactionType', 'DebitAccount', 'BeneficiaryName',
        'BeneficiaryAccount', 'BeneficiaryBank', 'BeneficiaryBranch',
        'Amount', 'Currency', 'Reference', 'Narration',
      ]);
      const rows = bankPayees.map((p) => {
        const net = run.dualCurrency ? (p.netPayUSD ?? p.netPay) : p.netPay;
        return csvRow([
          'RTGS',
          '',
          `${p.employee.firstName} ${p.employee.lastName}`,
          p._bank.accountNumber,
          p._bank.bankName,
          p._bank.bankBranch,
          Number(net).toFixed(2),
          run.dualCurrency ? 'USD' : run.currency,
          `${p.employee.employeeCode}-${periodStr}`,
          `Salary ${periodStr}`,
        ]);
      });
      csvContent = [header, ...rows].join('\n');
      filename = `Fidelity-RTGS-${periodStr}.csv`;
    }

    await audit({
      c,
      action: 'BANK_FILE_EXPORTED',
      resource: 'payroll_run',
      resourceId: runId,
      details: { format, period: periodStr, payeeCount: bankPayees.length },
    });

    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename="${filename}"`);
    return c.body(csvContent);
  } catch (error) {
    console.error('Bank file export error:', error);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
