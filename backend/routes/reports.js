const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { 
  generatePayslipPDF, 
  generateP16PDF, 
  generateP2PDF, 
  generateNSSA_P4A,
  generateIT7PDF
} = require('../utils/pdfService');

const { 
  getSettingAsNumber,
  getSettingAsString
} = require('../lib/systemSettings');

const router = express.Router();

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
      const header = 'Employee Code,Name,Position,Gross,PAYE,AIDS Levy,NSSA,Net Pay,Currency\n';
      const rows = payslips.map((p) =>
        [
          p.employee.employeeCode || '',
          `${p.employee.firstName} ${p.employee.lastName}`,
          p.employee.position || '',
          p.gross.toFixed(2),
          p.paye.toFixed(2),
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

    res.json(payslips);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Tax Report (P16) ─────────────────────────────────────────────────────────

// GET /api/reports/tax?companyId=&year=&format=pdf|json
router.get('/tax', requirePermission('export_reports'), async (req, res) => {
  const { companyId, year, format = 'json' } = req.query;
  const targetCompanyId = companyId || req.companyId;
  if (!targetCompanyId) return res.status(400).json({ message: 'companyId required' });

  try {
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: {
          companyId: targetCompanyId,
          payrollCalendar: {
            year: parseInt(year) || new Date().getFullYear(),
          },
          status: 'COMPLETED',
        },
      },
      include: {
        employee: true,
        payrollRun: { include: { company: true } },
      },
    });

    // Aggregate per employee
    const byEmployee = {};
    for (const ps of payslips) {
      const key = ps.employeeId;
      if (!byEmployee[key]) {
        byEmployee[key] = {
          employee: ps.employee,
          company: ps.payrollRun.company,
          totalGross: 0,
          totalPaye: 0,
          totalAidsLevy: 0,
          totalNssa: 0,
          totalNet: 0,
          totalWcif: 0,
          totalSdf: 0,
          totalNecLevy: 0,
        };
      }
      byEmployee[key].totalGross      += ps.gross;
      byEmployee[key].totalPaye       += ps.paye;
      byEmployee[key].totalAidsLevy   += ps.aidsLevy;
      byEmployee[key].totalNssa       += ps.nssaEmployee;
      byEmployee[key].totalNet        += ps.netPay;
      byEmployee[key].totalWcif       += ps.wcifEmployer   || 0;
      byEmployee[key].totalSdf        += ps.sdfContribution || 0;
      byEmployee[key].totalNecLevy    += ps.necLevy        || 0;
    }

    const data = Object.values(byEmployee);

    if (format === 'pdf' && data.length > 0) {
      const firstCompany = data[0].company;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=P16-${year || new Date().getFullYear()}.pdf`);
      return generateP16PDF({ company: firstCompany, year: year || new Date().getFullYear(), rows: data }, res);
    }

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Leave Report ─────────────────────────────────────────────────────────────

// GET /api/reports/leave?startDate=&endDate=&format=csv|json
router.get('/leave', requirePermission('view_reports'), async (req, res) => {
  const { startDate, endDate, format = 'json' } = req.query;
  try {
    const where = {
      ...(req.clientId && { employee: { clientId: req.clientId } }),
      ...(req.companyId && { employee: { companyId: req.companyId } }),
      ...(startDate && { startDate: { gte: new Date(startDate) } }),
      ...(endDate && { endDate: { lte: new Date(endDate) } }),
    };

    const records = await prisma.leaveRecord.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true, position: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Type,Start Date,End Date,Days,Status\n';
      const rows = records.map((r) =>
        [
          r.employee.employeeCode || '',
          `${r.employee.firstName} ${r.employee.lastName}`,
          r.type,
          r.startDate.toLocaleDateString(),
          r.endDate.toLocaleDateString(),
          r.totalDays,
          r.status,
        ].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=leave-report.csv');
      return res.send(header + rows);
    }

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Loans Report ─────────────────────────────────────────────────────────────

// GET /api/reports/loans?status=&format=csv|json
router.get('/loans', requirePermission('view_reports'), async (req, res) => {
  const { status, format = 'json' } = req.query;
  try {
    const where = {
      ...(req.clientId && { employee: { clientId: req.clientId } }),
      ...(req.companyId && { employee: { companyId: req.companyId } }),
      ...(status && { status }),
    };

    const loans = await prisma.loan.findMany({
      where,
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        _count: { select: { repayments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (format === 'csv') {
      const header = 'Employee Code,Name,Amount,Interest Rate,Term (Months),Status,Start Date\n';
      const rows = loans.map((l) =>
        [
          l.employee.employeeCode || '',
          `${l.employee.firstName} ${l.employee.lastName}`,
          l.amount.toFixed(2),
          l.interestRate.toFixed(2),
          l.termMonths,
          l.status,
          l.startDate.toLocaleDateString(),
        ].join(',')
      ).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=loans-report.csv');
      return res.send(header + rows);
    }

    res.json(loans);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── Departments / Headcount Report ──────────────────────────────────────────

// GET /api/reports/departments
router.get('/departments', requirePermission('view_reports'), async (req, res) => {
  try {
    const where = req.companyId ? { companyId: req.companyId } : (req.clientId ? { company: { clientId: req.clientId } } : {});

    const departments = await prisma.department.findMany({
      where,
      include: {
        _count: { select: { employees: true } },
        company: { select: { name: true } },
        branch: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    res.json(departments);
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

    res.json(transactions);
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

    res.json({ employeeCount, lastRun, pendingLeave, activeLoans, currentRun, noTinCount, noBankCount });
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

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── ZIMRA P2 Monthly Return ──────────────────────────────────────────────────

// GET /api/reports/p2?companyId=&month=&year=
router.get('/p2', requirePermission('export_reports'), async (req, res) => {
  const { companyId, month, year } = req.query;
  const targetCompanyId = companyId || req.companyId;
  if (!targetCompanyId || !month || !year) {
    return res.status(400).json({ message: 'companyId, month, and year are required' });
  }

  try {
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: {
          companyId: targetCompanyId,
          payrollCalendar: {
            year: parseInt(year),
            month: parseInt(month),
          },
          status: 'COMPLETED',
        },
      },
      include: { payrollRun: { include: { company: true } } },
    });

    if (payslips.length === 0) return res.status(404).json({ message: 'No completed payroll data for this period' });

    const company = payslips[0].payrollRun.company;
    
    // Group totals by currency
    const byCurrency = payslips.reduce((acc, ps) => {
      const curr = ps.currency || 'USD';
      if (!acc[curr]) acc[curr] = { totalRemuneration: 0, totalPaye: 0, totalAidsLevy: 0, employeeIds: new Set() };
      acc[curr].totalRemuneration += ps.gross;
      acc[curr].totalPaye += ps.paye;
      acc[curr].totalAidsLevy += ps.aidsLevy;
      acc[curr].employeeIds.add(ps.employeeId);
      return acc;
    }, {});

    // For PDF export, we'll pick the USD total if it exists, otherwise the first found.
    // In a future update, we could generate multiple PDFs or a concatenated one.
    const selectedCurrency = byCurrency['USD'] ? 'USD' : Object.keys(byCurrency)[0];
    const totals = byCurrency[selectedCurrency];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=P2-${month}-${year}-${selectedCurrency}.pdf`);
    return generateP2PDF({
      company,
      month,
      year,
      totalRemuneration: totals.totalRemuneration,
      totalPaye: totals.totalPaye,
      totalAidsLevy: totals.totalAidsLevy,
      employeeCount: totals.employeeIds.size,
      currency: selectedCurrency
    }, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── NSSA P4A Monthly Return ──────────────────────────────────────────────────

// GET /api/reports/nssa-p4a?companyId=&month=&year=
router.get('/nssa-p4a', requirePermission('export_reports'), async (req, res) => {
  const { companyId, month, year } = req.query;
  const targetCompanyId = companyId || req.companyId;
  if (!targetCompanyId || !month || !year) {
    return res.status(400).json({ message: 'companyId, month, and year are required' });
  }

  try {
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: {
          companyId: targetCompanyId,
          payrollCalendar: {
            year: parseInt(year),
            month: parseInt(month),
          },
          status: 'COMPLETED',
        },
      },
      include: { payrollRun: { include: { company: true } } },
    });

    if (payslips.length === 0) return res.status(404).json({ message: 'No completed payroll data for this period' });

    const company = payslips[0].payrollRun.company;

    // Group totals by currency
    const byCurrency = payslips.reduce((acc, ps) => {
      const curr = ps.currency || 'USD';
      if (!acc[curr]) acc[curr] = { totalInsurableEarnings: 0, totalEmployeeNssa: 0, totalEmployerNssa: 0 };
      
      // Use stored nssaBasis (ceiling-capped) from the payslip
      const insurable = ps.nssaBasis || ps.gross;
      acc[curr].totalInsurableEarnings += insurable;
      acc[curr].totalEmployeeNssa += ps.nssaEmployee;
      acc[curr].totalEmployerNssa += ps.nssaEmployer || ps.nssaEmployee;
      return acc;
    }, {});

    const selectedCurrency = byCurrency['USD'] ? 'USD' : Object.keys(byCurrency)[0];
    const totals = byCurrency[selectedCurrency];

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=NSSA-P4A-${month}-${year}-${selectedCurrency}.pdf`);
    return generateNSSA_P4A({
      companyName: company.name,
      nssaNumber: company.nssaNumber || 'N/A',
      month,
      year,
      totalInsurableEarnings: totals.totalInsurableEarnings,
      totalEmployeeNssa: totals.totalEmployeeNssa,
      totalEmployerNssa: totals.totalEmployerNssa,
      totalRemittance: totals.totalEmployeeNssa + totals.totalEmployerNssa,
      currency: selectedCurrency
    }, res);
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

// ─── IT7 Tax Certificate ──────────────────────────────────────────────────────

// GET /api/reports/it7/:employeeId/:year
router.get('/it7/:employeeId/:year', requirePermission('view_reports'), async (req, res) => {
  const { employeeId, year } = req.params;

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { company: true },
    });

    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && employee.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const startDate = new Date(`${year}-01-01`);
    const endDate = new Date(`${year}-12-31`);

    const [payslips, transactions] = await Promise.all([
      prisma.payslip.findMany({
        where: {
          employeeId,
          payrollRun: {
            startDate: { gte: startDate },
            endDate: { lte: endDate },
            status: 'COMPLETED',
          },
        },
      }),
      prisma.payrollTransaction.findMany({
        where: {
          employeeId,
          payrollRun: {
            startDate: { gte: startDate },
            endDate: { lte: endDate },
            status: 'COMPLETED',
          },
        },
        include: { transactionCode: true },
      }),
    ]);

    if (payslips.length === 0) return res.status(404).json({ message: 'No completed payroll data for this year' });

    // Aggregate payslip totals
    const totals = payslips.reduce((acc, ps) => {
      acc.totalNssa += ps.nssaEmployee;
      acc.totalPaye += ps.paye;
      acc.totalAidsLevy += ps.aidsLevy;
      return acc;
    }, { totalNssa: 0, totalPaye: 0, totalAidsLevy: 0 });

    // Aggregate transaction-level details for IT7 breakdown
    let totalGross = 0, totalBonus = 0, totalBenefits = 0, totalAllowances = 0, totalPension = 0;

    for (const tx of transactions) {
      const tc = tx.transactionCode;
      const amt = tx.amount || 0;
      // Use incomeCategory enum when set; fall back to code-string matching for
      // legacy transaction codes that pre-date the enum field.
      const cat  = tc?.incomeCategory;
      const code = (tc?.code || '').toUpperCase();

      if (tc?.type === 'EARNING') {
        const isBonus     = cat === 'BONUS'    || cat === 'GRATUITY'
                          || (!cat && (code.includes('BONUS') || code.includes('GRATUITY')));
        const isAllowance = cat === 'ALLOWANCE' || cat === 'OVERTIME' || cat === 'COMMISSION'
                          || (!cat && code.includes('ALLOWANCE'));
        if (isBonus)          totalBonus      += amt;
        else if (isAllowance) totalAllowances += amt;
        else                  totalGross      += amt;
      } else if (tc?.type === 'BENEFIT') {
        totalBenefits += amt;
      } else if (tc?.type === 'DEDUCTION' && tc?.preTax) {
        totalPension += amt;
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=IT7-${employee.employeeCode || employeeId}-${year}.pdf`);

    return generateIT7PDF({
      year,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      nationalId: employee.idPassport,
      tin: employee.tin,
      jobTitle: employee.position,
      periodFrom: `01/01/${year}`,
      periodTo: `31/12/${year}`,
      company: {
        name: employee.company.name,
        taxId: employee.company.taxId,
        address: employee.company.address,
      },
      totalGross,
      totalBonus,
      totalBenefits,
      totalAllowances,
      totalNssa: totals.totalNssa,
      totalPension,
      totalPaye: totals.totalPaye,
      totalAidsLevy: totals.totalAidsLevy,
      currency: employee.currency || 'USD',
    }, res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


// ─── Pension Fund Exports ────────────────────────────────────────────────────

// GET /api/reports/pension-export?month=YYYY-MM&type=mipf|comone|oldmutual|generic
router.get('/pension-export', requirePermission('view_reports'), async (req, res) => {
  const { month, type = 'generic' } = req.query;
  if (!month) return res.status(400).json({ message: 'Month (YYYY-MM) is required' });

  try {
    const startDate = new Date(`${month}-01`);
    const endDate = new Date(new Date(startDate).setMonth(startDate.getMonth() + 1) - 1);

    const where = {
      payrollRun: {
        startDate: { gte: startDate },
        endDate: { lte: endDate },
        status: 'COMPLETED',
        ...(req.companyId && { companyId: req.companyId }),
      },
      transactionCode: {
        OR: [
          { name: { contains: 'Pension', mode: 'insensitive' } },
          { code: { startsWith: 'PEN', mode: 'insensitive' } },
        ],
      },
    };

    const transactions = await prisma.payrollTransaction.findMany({
      where,
      include: {
        employee: {
          select: {
            firstName: true,
            lastName: true,
            employeeCode: true,
            idPassport: true,
            pensionNumber: true,
            baseRate: true,
          },
        },
        transactionCode: { select: { type: true, name: true } },
      },
    });

    if (transactions.length === 0) {
      return res.status(404).json({ message: 'No pension transactions found for this period' });
    }

    // Group by employee
    const grouped = transactions.reduce((acc, t) => {
      const eid = t.employeeId;
      if (!acc[eid]) {
        acc[eid] = {
          employee: t.employee,
          eeCont: 0,
          erCont: 0,
          earnings: t.employee.baseRate, // Simplified
        };
      }
      if (t.transactionCode.type === 'DEDUCTION') {
        acc[eid].eeCont += Math.abs(t.amount);
      } else {
        acc[eid].erCont += Math.abs(t.amount);
      }
      return acc;
    }, {});

    const rows = Object.values(grouped);
    let csvHeader = '';
    let csvRows = [];

    switch (type.toLowerCase()) {
      case 'mipf':
        csvHeader = 'Member No,Employee Name,Pensionable Earnings,EE Amount,ER Amount,Total\n';
        csvRows = rows.map(r => [
          r.employee.pensionNumber || r.employee.employeeCode || '',
          `${r.employee.firstName} ${r.employee.lastName}`,
          r.earnings.toFixed(2),
          r.eeCont.toFixed(2),
          r.erCont.toFixed(2),
          (r.eeCont + r.erCont).toFixed(2)
        ].join(','));
        break;

      case 'comone':
        csvHeader = 'EE Code,National ID,Member No,Earnings,EE Cont,ER Cont,Total\n';
        csvRows = rows.map(r => [
          r.employee.employeeCode || '',
          r.employee.idPassport || '',
          r.employee.pensionNumber || '',
          r.earnings.toFixed(2),
          r.eeCont.toFixed(2),
          r.erCont.toFixed(2),
          (r.eeCont + r.erCont).toFixed(2)
        ].join(','));
        break;

      case 'oldmutual':
        csvHeader = 'Member ID,Surname,First Names,ID Number,Salary,EE Contribution,ER Contribution,Total\n';
        csvRows = rows.map(r => [
          r.employee.pensionNumber || '',
          r.employee.lastName,
          r.employee.firstName,
          r.employee.idPassport || '',
          r.earnings.toFixed(2),
          r.eeCont.toFixed(2),
          r.erCont.toFixed(2),
          (r.eeCont + r.erCont).toFixed(2)
        ].join(','));
        break;

      default:
        csvHeader = 'Code,Name,Basic,EE_Pension,ER_Pension,Total\n';
        csvRows = rows.map(r => [
          r.employee.employeeCode || '',
          `${r.employee.firstName} ${r.employee.lastName}`,
          r.earnings.toFixed(2),
          r.eeCont.toFixed(2),
          r.erCont.toFixed(2),
          (r.eeCont + r.erCont).toFixed(2)
        ].join(','));
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=pension-${type}-${month}.csv`);
    return res.send(csvHeader + csvRows.join('\n'));

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

    res.json(data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


module.exports = router;
