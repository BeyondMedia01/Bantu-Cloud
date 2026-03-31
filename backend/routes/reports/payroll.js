const express = require('express');
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/permissions');
const { 
  generateP16PDF, 
  generateP2PDF, 
  generateNSSA_P4A,
  generateIT7PDF
} = require('../../utils/pdfService');


const router = express.Router({ mergeParams: true });

// ─── Payslip Report ───────────────────────────────────────────────────────────

// GET /api/reports/payslips?runId=&format=csv|pdf
router.get('/payslips', requirePermission('view_reports'), async (req, res) => {
  const { runId, format = 'csv' } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });

  try {
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: true,
        payrollRun: { include: { company: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }],
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Position,Gross,PAYE,Medical Aid Credit,AIDS Levy,NSSA,Net Pay,Currency\n';
      const rows = payslips.map((p) =>
        [
          p.employee.employeeCode || '',
          `${p.employee.firstName} ${p.employee.lastName}`,
          p.employee.position || '',
          p.gross.toFixed(2),
          p.paye.toFixed(2),
          (p.medicalAidCredit || 0).toFixed(2),
          p.aidsLevy.toFixed(2),
          p.nssaEmployee.toFixed(2),
          p.netPay.toFixed(2),
          p.employee.currency || 'USD',
        ].join(',')
      ).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=payslips-${runId}.csv`);
      return res.send(header + rows);
    }

    res.json({ data: payslips });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Journals Report ──────────────────────────────────────────────────────────

// GET /api/reports/journals?runId=&format=csv|json
router.get('/journals', requirePermission('view_reports'), async (req, res) => {
  const { runId, format = 'json' } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });

  try {
    const transactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        transactionCode: { select: { code: true, name: true, type: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { transactionCode: { code: 'asc' } }],
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Transaction Code,Description,Type,Amount,Currency\n';
      const rows = transactions.map((t) =>
        [
          t.employee.employeeCode || '',
          `${t.employee.firstName} ${t.employee.lastName}`,
          t.transactionCode?.code || '',
          t.description || '',
          t.transactionCode?.type || '',
          t.amount.toFixed(2),
          t.currency,
        ].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=journals-${runId}.csv`);
      return res.send(header + rows);
    }

    res.json({ data: transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Summary Stats ────────────────────────────────────────────────────────────

// GET /api/reports/summary — high-level dashboard stats
router.get('/summary', requirePermission('view_reports'), async (req, res) => {
  try {
    const companyWhere = req.companyId ? { companyId: req.companyId } : (req.clientId ? { clientId: req.clientId } : {});
    const runWhere = req.companyId ? { companyId: req.companyId } : (req.clientId ? { company: { clientId: req.clientId } } : {});

    let [employeeCount, lastRun, pendingLeave, activeLoans, currentRun, noTinCount, noBankCount] = await Promise.all([
      prisma.employee.count({ where: companyWhere }),
      prisma.payrollRun.findFirst({ where: { ...runWhere, status: 'COMPLETED' }, orderBy: { runDate: 'desc' } }),
      prisma.leaveRequest.count({ where: { status: 'PENDING', ...(req.companyId ? { employee: { companyId: req.companyId } } : (req.clientId ? { employee: { clientId: req.clientId } } : {})) } }),
      prisma.loan.count({ where: { status: 'ACTIVE', ...(req.companyId ? { employee: { companyId: req.companyId } } : (req.clientId ? { employee: { clientId: req.clientId } } : {})) } }),
      prisma.payrollRun.findFirst({
        where: { ...runWhere, status: { notIn: ['COMPLETED', 'ERROR'] } },
        orderBy: { runDate: 'desc' },
        select: { id: true, status: true, runDate: true, startDate: true, endDate: true, currency: true },
      }),
      prisma.employee.count({
        where: { ...companyWhere, dischargeDate: null, OR: [{ tin: null }, { tin: '' }] },
      }),
      prisma.employee.count({
        where: { ...companyWhere, dischargeDate: null, paymentMethod: 'BANK', OR: [{ accountNumber: null }, { accountNumber: '' }] },
      }),
    ]);

    if (currentRun) {
      const getFormattedDate = (d) => {
        const date = new Date(d);
        return `${date.getDate().toString().padStart(2, '0')} ${date.toLocaleString('en-GB', { month: 'short' })} ${date.getFullYear()}`;
      };
      currentRun.name = `${getFormattedDate(currentRun.startDate)} - ${getFormattedDate(currentRun.endDate)}`;
    }

    res.json({ data: { employeeCount, lastRun, pendingLeave, activeLoans, currentRun, noTinCount, noBankCount } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Payroll Trend ────────────────────────────────────────────────────────────

// GET /api/reports/payroll-trend — last 6 completed runs with total net pay
router.get('/payroll-trend', requirePermission('view_reports'), async (req, res) => {
  try {
    const runs = await prisma.payrollRun.findMany({
      where: {
        ...(req.companyId ? { companyId: req.companyId } : (req.clientId ? { company: { clientId: req.clientId } } : {})),
        status: 'COMPLETED',
      },
      orderBy: { runDate: 'asc' },
      take: -6, // last 6
      include: {
        payslips: { select: { netPay: true } },
      },
    });

    const data = runs.map((run) => {
      const totalNet = run.payslips.reduce((sum, p) => sum + (p.netPay || 0), 0);
      const totalGross = run.payslips.reduce((sum, p) => sum + (p.gross || 0), 0);
      return {
        name: new Date(run.runDate).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
        netPay: Math.round(totalNet),
        grossPay: Math.round(totalGross),
        headcount: run.payslips.length,
      };
    });

    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Bank EFT / Bulk Pay Export ───────────────────────────────────────────────

// GET /api/reports/eft?runId=
router.get('/eft', requirePermission('export_reports'), async (req, res) => {
    const { runId, bankFormat = 'generic' } = req.query;
    if (!runId) return res.status(400).json({ message: 'runId is required' });

    try {
      const payslips = await prisma.payslip.findMany({
        where: { payrollRunId: runId, employee: { paymentMethod: 'BANK' } },
        include: { 
          employee: { 
            include: { bankAccounts: { orderBy: { priority: 'asc' } } } 
          }, 
          payrollRun: true 
        },
      });

      if (payslips.length === 0) return res.status(404).json({ message: 'No bank-based payslips found for this run' });

      let header = '';
      if (bankFormat === 'cbz') header = 'ACCOUNT_NUMBER,AMOUNT,ACCOUNT_NAME,REFERENCE,CURRENCY\n';
      else if (bankFormat === 'stanbic') header = 'Beneficiary Name,Beneficiary Account,Bank Code,Branch Code,Amount,Reference\n';
      else header = 'Account Name,Account Number,Bank Name,Branch Code,Amount,Currency,Reference\n';
    
    let rows = [];

    for (const p of payslips) {
      const netPay = p.netPay;
      const accounts = p.employee.bankAccounts;

      if (accounts.length === 0) {
        // Fallback to legacy single account
        rows.push([
          `"${p.employee.firstName} ${p.employee.lastName}"`,
          p.employee.accountNumber || '',
          p.employee.bankName || '',
          p.employee.branchCode || '',
          netPay.toFixed(2),
          p.employee.currency || 'USD',
          `PAYROLL-${p.payrollRun.name}`
        ].join(','));
        continue;
      }

      let remainingBalance = netPay;
      const splitRows = [];

      // 1. Process FIXED splits
      const fixedAccounts = accounts.filter(a => a.splitType === 'FIXED');
      for (const acc of fixedAccounts) {
        const amt = Math.min(acc.splitValue, remainingBalance);
        if (amt > 0) {
          splitRows.push({ acc, amt });
          remainingBalance -= amt;
        }
      }

      // 2. Process PERCENTAGE splits (of original net pay)
      const percentAccounts = accounts.filter(a => a.splitType === 'PERCENTAGE');
      for (const acc of percentAccounts) {
        const amt = Math.min(netPay * (acc.splitValue / 100), remainingBalance);
        if (amt > 0) {
          splitRows.push({ acc, amt });
          remainingBalance -= amt;
        }
      }

      // 3. Process REMAINDER
      const remainderAccount = accounts.find(a => a.splitType === 'REMAINDER');
      if (remainderAccount && remainingBalance > 0) {
        splitRows.push({ acc: remainderAccount, amt: remainingBalance });
        remainingBalance = 0;
      } else if (remainingBalance > 0 && splitRows.length > 0) {
        // Fallback: If no remainder account but balance left, add to last split account
        splitRows[splitRows.length - 1].amt += remainingBalance;
      }

      // Generate rows for this employee
      splitRows.forEach(({ acc, amt }) => {
        if (bankFormat === 'cbz') {
          rows.push([
            acc.accountNumber,
            amt.toFixed(2),
            `"${acc.accountName || (p.employee.firstName + ' ' + p.employee.lastName)}"`,
            `PAYROLL-${p.payrollRun.name}`,
            acc.currency || 'USD'
          ].join(','));
        } else if (bankFormat === 'stanbic') {
          rows.push([
            `"${acc.accountName || (p.employee.firstName + ' ' + p.employee.lastName)}"`,
            acc.accountNumber,
            'STAN',
            acc.branchCode || '0000',
            amt.toFixed(2),
            `PAYROLL-${p.payrollRun.name}`
          ].join(','));
        } else {
          rows.push([
            `"${acc.accountName || (p.employee.firstName + ' ' + p.employee.lastName)}"`,
            acc.accountNumber,
            acc.bankName,
            acc.branchCode || '',
            amt.toFixed(2),
            acc.currency || 'USD',
            `PAYROLL-${p.payrollRun.name}`
          ].join(','));
        }
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=EFT-${runId}.csv`);
    return res.send(header + rows.join('\n'));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Payroll Variance Report ──────────────────────────────────────────────────

// GET /api/reports/variance?runId=
// Re-uses logic from payroll.js but exposed as a downloadable CSV for senior review
router.get('/variance', requirePermission('view_reports'), async (req, res) => {
  const { runId, format = 'csv' } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });

  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { company: true },
    });
    if (!run) return res.status(404).json({ message: 'Payroll run not found' });

    // Fetch variance data from the same logic used in the UI
    const priorRun = await prisma.payrollRun.findFirst({
      where: {
        companyId: run.companyId,
        status: 'COMPLETED',
        startDate: { lt: run.startDate },
      },
      orderBy: { startDate: 'desc' },
    });

    const [currentPayslips, priorPayslips] = await Promise.all([
      prisma.payslip.findMany({
        where: { payrollRunId: run.id },
        include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
      }),
      priorRun
        ? prisma.payslip.findMany({
            where: { payrollRunId: priorRun.id },
            include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
          })
        : Promise.resolve([]),
    ]);

    const priorMap = Object.fromEntries(priorPayslips.map((p) => [p.employeeId, p]));
    const data = currentPayslips.map((cur) => {
      const prior = priorMap[cur.employeeId];
      return {
        code: cur.employee.employeeCode,
        name: `${cur.employee.firstName} ${cur.employee.lastName}`,
        currentGross: cur.gross,
        priorGross: prior?.gross || 0,
        variance: cur.gross - (prior?.gross || 0),
        pct: prior?.gross ? ((cur.gross - prior.gross) / prior.gross) * 100 : 100
      };
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Prior Gross,Current Gross,Variance,Variance %\n';
      const rows = data.map(d => [
        d.code,
        `"${d.name}"`,
        d.priorGross.toFixed(2),
        d.currentGross.toFixed(2),
        d.variance.toFixed(2),
        d.pct.toFixed(2) + '%'
      ].join(',')).join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=variance-${runId}.csv`);
      return res.send(header + rows);
    }

    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


module.exports = router;
