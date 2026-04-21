const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { audit } = require('../lib/audit');

const router = express.Router();

// ─── Supported formats ────────────────────────────────────────────────────────
// cbz      — Commercial Bank of Zimbabwe bulk payment CSV
// stanbic  — Stanbic Bank Zimbabwe EFT file
// fidelity — Fidelity/FBC RTGS bulk payment CSV

const FORMATS = ['cbz', 'stanbic', 'fidelity'];

// ─── Helper ───────────────────────────────────────────────────────────────────

function csvRow(fields) {
  return fields
    .map((f) => {
      const s = String(f ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    })
    .join(',');
}

async function getPayslipsForRun(runId, companyId) {
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    select: { id: true, companyId: true, startDate: true, currency: true, dualCurrency: true, exchangeRate: true },
  });
  if (!run) return null;
  if (companyId && run.companyId !== companyId) return null;

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

// ─── GET /api/bank-files/:format/:runId ───────────────────────────────────────
/**
 * Generate a bank payment file for a completed payroll run.
 * format: cbz | stanbic | fidelity
 * Query: currency=USD|ZiG (defaults to run currency)
 */
router.get('/:format/:runId', requirePermission('export_reports'), async (req, res) => {
  const { format, runId } = req.params;

  if (!FORMATS.includes(format)) {
    return res.status(400).json({ message: `Unsupported format. Use one of: ${FORMATS.join(', ')}` });
  }
  if (!req.companyId) return res.status(400).json({ message: 'Company context missing' });

  try {
    const result = await getPayslipsForRun(runId, req.companyId);
    if (!result) return res.status(404).json({ message: 'Payroll run not found' });

    const { run, payslips } = result;

    const period = run.startDate ? new Date(run.startDate) : new Date();
    const periodStr = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}`;

    // Resolve bank details: prefer legacy fields, fall back to EmployeeBankAccount
    const resolvedPayslips = payslips.map((p) => {
      const linked = p.employee.bankAccounts?.[0];
      return {
        ...p,
        _bank: {
          accountNumber: p.employee.accountNumber || linked?.accountNumber || '',
          bankName:      p.employee.bankName      || linked?.bankName      || '',
          bankBranch:    p.employee.bankBranch     || linked?.bankBranch    || '',
          branchCode:    linked?.branchCode || p.employee.bankBranch || '',
        },
      };
    });

    // Filter to bank-payment employees only
    const bankPayees = resolvedPayslips.filter(
      (p) => p.employee.paymentMethod !== 'CASH' && p._bank.accountNumber
    );

    if (bankPayees.length === 0) {
      return res.status(422).json({ message: 'No employees with bank account details found for this run.' });
    }

    let csvContent;
    let filename;

    if (format === 'cbz') {
      // CBZ Bulk Payments — CSV format accepted by CBZ Internet Banking
      const header = csvRow(['BeneficiaryName', 'AccountNumber', 'BranchCode', 'Amount', 'Currency', 'Reference', 'Narration']);
      const rows = bankPayees.map((p) => {
        const net = run.dualCurrency ? (p.netPayUSD ?? p.netPay) : p.netPay;
        return csvRow([
          `${p.employee.firstName} ${p.employee.lastName}`,
          p._bank.accountNumber,
          p._bank.bankBranch,
          net.toFixed(2),
          run.dualCurrency ? 'USD' : run.currency,
          `${p.employee.employeeCode}-${periodStr}`,
          `Salary ${periodStr}`,
        ]);
      });
      csvContent = [header, ...rows].join('\n');
      filename = `CBZ-Payments-${periodStr}.csv`;

    } else if (format === 'stanbic') {
      // Stanbic Bank Zimbabwe EFT file format
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
          '003',                          // Stanbic BIC/bank code in ZW clearing
          p._bank.branchCode,
          net.toFixed(2),
          run.dualCurrency ? 'USD' : run.currency,
          `${p.employee.employeeCode}-${periodStr}`,
          `Salary ${periodStr}`,
        ]);
      });
      csvContent = [header, ...rows].join('\n');
      filename = `Stanbic-EFT-${periodStr}.csv`;

    } else {
      // Fidelity (FBC) RTGS / ZIPIT bulk payment format
      const header = csvRow([
        'TransactionType', 'DebitAccount', 'BeneficiaryName',
        'BeneficiaryAccount', 'BeneficiaryBank', 'BeneficiaryBranch',
        'Amount', 'Currency', 'Reference', 'Narration',
      ]);
      const rows = bankPayees.map((p) => {
        const net = run.dualCurrency ? (p.netPayUSD ?? p.netPay) : p.netPay;
        return csvRow([
          'RTGS',
          '',                             // populated by the uploading user in their portal
          `${p.employee.firstName} ${p.employee.lastName}`,
          p._bank.accountNumber,
          p._bank.bankName,
          p._bank.bankBranch,
          net.toFixed(2),
          run.dualCurrency ? 'USD' : run.currency,
          `${p.employee.employeeCode}-${periodStr}`,
          `Salary ${periodStr}`,
        ]);
      });
      csvContent = [header, ...rows].join('\n');
      filename = `Fidelity-RTGS-${periodStr}.csv`;
    }

    await audit({
      req,
      action: 'BANK_FILE_EXPORTED',
      resource: 'payroll_run',
      resourceId: runId,
      details: { format, period: periodStr, payeeCount: bankPayees.length },
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Bank file export error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
