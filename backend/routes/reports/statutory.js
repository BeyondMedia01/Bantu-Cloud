const express = require('express');
const ExcelJS = require('exceljs');
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/permissions');

const router = express.Router({ mergeParams: true });

// ─── Shared helper ────────────────────────────────────────────────────────────
// Build a Prisma payrollRun filter that matches by payrollCalendar year/month
// OR (for runs not linked to a calendar) by startDate falling in that month.
// This prevents 404s when runs were created without a PayrollCalendar link.
function runPeriodFilter(companyId, year, month) {
  const y = parseInt(year);
  const m = parseInt(month);
  const periodStart = new Date(y, m - 1, 1);   // first day of month
  const periodEnd   = new Date(y, m, 1);        // first day of next month
  return {
    companyId,
    status: 'COMPLETED',
    OR: [
      { payrollCalendar: { year: y, month: m } },
      { payrollCalendarId: null, startDate: { gte: periodStart, lt: periodEnd } },
    ],
  };
}

function yearPeriodFilter(companyId, year) {
  const y = parseInt(year);
  const yearStart = new Date(y, 0, 1);
  const yearEnd   = new Date(y + 1, 0, 1);
  return {
    companyId,
    status: 'COMPLETED',
    OR: [
      { payrollCalendar: { year: y } },
      { payrollCalendarId: null, startDate: { gte: yearStart, lt: yearEnd } },
    ],
  };
}

// ─── Tax Report (P16) ─────────────────────────────────────────────────────────

// GET /api/reports/tax?year=&format=pdf|json
router.get('/tax', requirePermission('export_reports'), async (req, res) => {
  const { year, format = 'json' } = req.query;
  const targetCompanyId = req.companyId;
  if (!targetCompanyId) return res.status(400).json({ message: 'companyId required' });

  try {
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: yearPeriodFilter(targetCompanyId, year || new Date().getFullYear()),
      },
      include: {
        employee: true,
        payrollRun: { include: { company: true } },
      },
    });

    // Aggregate per employee — base statutory totals
    const byEmployee = {};
    for (const ps of payslips) {
      const key = ps.employeeId;
      if (!byEmployee[key]) {
        byEmployee[key] = {
          employee: ps.employee,
          company: ps.payrollRun.company,  // needed by generateP16PDF header
          totalGross: 0,
          totalBasicSalary: 0,
          totalBonus: 0,
          totalGratuity: 0,
          totalAllowances: 0,
          totalOvertime: 0,
          totalCommission: 0,
          totalBenefits: 0,
          totalPaye: 0,
          totalAidsLevy: 0,
          totalNssa: 0,
          totalNet: 0,
          totalWcif: 0,
          totalSdf: 0,
          totalNecLevy: 0,
        };
      }
      const e = byEmployee[key];
      e.totalGross      += ps.gross        || 0;
      e.totalPaye       += ps.paye         || 0;
      e.totalAidsLevy   += ps.aidsLevy     || 0;
      e.totalNssa       += ps.nssaEmployee || 0;
      e.totalNet        += ps.netPay       || 0;
      e.totalWcif       += ps.wcifEmployer   || 0;
      e.totalSdf        += ps.sdfContribution || 0;
      e.totalNecLevy    += ps.necLevy        || 0;
    }

    // Pull transactions to populate IT7 category breakdown
    const runIds = [...new Set(payslips.map(p => p.payrollRunId))];
    const employeeIds = Object.keys(byEmployee);
    const transactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: { in: runIds }, employeeId: { in: employeeIds } },
      select: {
        employeeId: true,
        amount: true,
        transactionCode: { select: { type: true, incomeCategory: true, code: true } },
      },
    });

    for (const t of transactions) {
      const e = byEmployee[t.employeeId];
      if (!e) continue;
      const tc = t.transactionCode;
      if (!tc || tc.type !== 'EARNING') continue;
      const amt = Math.abs(t.amount || 0);
      const cat = tc.incomeCategory;
      const code = (tc.code || '').toUpperCase();
      if (cat === 'BASIC_SALARY' || (!cat && code.includes('BASIC'))) e.totalBasicSalary += amt;
      else if (cat === 'BONUS')       e.totalBonus      += amt;
      else if (cat === 'GRATUITY')    e.totalGratuity   += amt;
      else if (cat === 'ALLOWANCE')   e.totalAllowances += amt;
      else if (cat === 'OVERTIME')    e.totalOvertime   += amt;
      else if (cat === 'COMMISSION')  e.totalCommission += amt;
      else if (cat === 'BENEFIT')     e.totalBenefits   += amt;
    }

    const data = Object.values(byEmployee);

    if (format === 'pdf' && data.length > 0) {
      const firstCompany = data[0].company;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=P16-${year || new Date().getFullYear()}.pdf`);
      return generateP16PDF({ company: firstCompany, year: year || new Date().getFullYear(), rows: data }, res);
    }

    res.json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── ITF16 Annual Electronic Return (CSV) ────────────────────────────────────
// GET /api/reports/itf16?year=2025
// ZIMRA e-Tax bulk upload format — one row per employee, annual income categories.

router.get('/itf16', requirePermission('export_reports'), async (req, res) => {
  const { year } = req.query;
  const companyId = req.companyId;
  if (!companyId || !year) {
    return res.status(400).json({ message: 'year is required' });
  }

  try {
    // Gate: TIN + BP Number required (same as P2)
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, taxId: true, registrationNumber: true },
    });
    if (!company?.taxId) {
      return res.status(422).json({ message: 'Company TIN (taxId) is required for ITF16 export. Configure it under Company Settings.' });
    }
    if (!company?.registrationNumber) {
      return res.status(422).json({ message: 'Company BP Number (registrationNumber) is required for ITF16 export. Configure it under Company Settings.' });
    }

    const payslips = await prisma.payslip.findMany({
      where: { payrollRun: yearPeriodFilter(companyId, year) },
      include: {
        employee: {
          select: {
            employeeCode: true, firstName: true, lastName: true,
            tin: true, nationalId: true, passportNumber: true,
          },
        },
      },
    });

    if (payslips.length === 0) {
      return res.status(404).json({ message: 'No completed payroll data for this year' });
    }

    // Aggregate statutory totals per employee
    const byEmployee = {};
    for (const ps of payslips) {
      const key = ps.employeeId;
      if (!byEmployee[key]) {
        byEmployee[key] = {
          employee: ps.employee,
          totalGross: 0, totalBasicSalary: 0, totalBonus: 0, totalGratuity: 0,
          totalAllowances: 0, totalOvertime: 0, totalCommission: 0, totalBenefits: 0,
          pensionContributions: 0, totalNssa: 0, totalPaye: 0, totalAidsLevy: 0, totalNet: 0,
        };
      }
      const e = byEmployee[key];
      e.totalGross           += ps.gross        || 0;
      e.totalPaye            += ps.paye         || 0;
      e.totalAidsLevy        += ps.aidsLevy     || 0;
      e.totalNssa            += ps.nssaEmployee || 0;
      e.pensionContributions += ps.pensionApplied || 0;
      e.totalNet             += ps.netPay       || 0;
    }

    // Categorise earnings from transactions
    const runIds = [...new Set(payslips.map(p => p.payrollRunId))];
    const employeeIds = Object.keys(byEmployee);
    const transactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: { in: runIds }, employeeId: { in: employeeIds } },
      select: {
        employeeId: true, amount: true,
        transactionCode: { select: { type: true, incomeCategory: true, code: true } },
      },
    });

    for (const t of transactions) {
      const e = byEmployee[t.employeeId];
      if (!e) continue;
      const tc = t.transactionCode;
      if (!tc || tc.type !== 'EARNING') continue;
      const amt = Math.abs(t.amount || 0);
      const cat = tc.incomeCategory;
      const code = (tc.code || '').toUpperCase();
      if (cat === 'BASIC_SALARY' || (!cat && code.includes('BASIC'))) e.totalBasicSalary += amt;
      else if (cat === 'BONUS')       e.totalBonus      += amt;
      else if (cat === 'GRATUITY')    e.totalGratuity   += amt;
      else if (cat === 'ALLOWANCE')   e.totalAllowances += amt;
      else if (cat === 'OVERTIME')    e.totalOvertime   += amt;
      else if (cat === 'COMMISSION')  e.totalCommission += amt;
      else if (cat === 'BENEFIT')     e.totalBenefits   += amt;
    }

    const fmt2 = (n) => Number(n || 0).toFixed(2);

    const header = [
      'EmployerTIN', 'EmployerBPNumber', 'TaxYear',
      'EmployeeTIN', 'IDPassport', 'EmployeeName',
      'GrossIncome',
      'BasicSalary', 'Bonus', 'Gratuity', 'Allowances', 'Overtime', 'Commission', 'Benefits',
      'PensionContributions', 'NSSA',
      'PAYE', 'AIDSLevy', 'TotalTaxDeducted',
    ].join(',');

    const rows = Object.values(byEmployee).map((r) => {
      const emp = r.employee;
      const name = `"${`${emp.lastName || ''}, ${emp.firstName || ''}`.replace(/"/g, '""')}"`;
      return [
        company.taxId,
        company.registrationNumber,
        year,
        emp.tin || '',
        emp.nationalId || emp.passportNumber || '',
        name,
        fmt2(r.totalGross),
        fmt2(r.totalBasicSalary), fmt2(r.totalBonus), fmt2(r.totalGratuity),
        fmt2(r.totalAllowances), fmt2(r.totalOvertime), fmt2(r.totalCommission), fmt2(r.totalBenefits),
        fmt2(r.pensionContributions), fmt2(r.totalNssa),
        fmt2(r.totalPaye), fmt2(r.totalAidsLevy),
        fmt2(r.totalPaye + r.totalAidsLevy),
      ].join(',');
    });

    const filename = `ZIMRA-ITF16-${year}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send([header, ...rows].join('\n'));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── ZIMRA P2 Monthly Return ──────────────────────────────────────────────────

// GET /api/reports/p2?month=&year=
router.get('/p2', requirePermission('export_reports'), async (req, res) => {
  const { month, year } = req.query;
  const targetCompanyId = req.companyId;
  if (!targetCompanyId || !month || !year) {
    return res.status(400).json({ message: 'companyId, month, and year are required' });
  }

  try {
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: runPeriodFilter(targetCompanyId, year, month),
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
        payrollRun: runPeriodFilter(targetCompanyId, year, month),
      },
      include: { payrollRun: { include: { company: true } } },
    });

    if (payslips.length === 0) return res.status(404).json({ message: 'No completed payroll data for this period' });

    const company = payslips[0].payrollRun.company;

    if (!company?.nssaNumber) {
      return res.status(422).json({
        message: 'NSSA employer registration number is required for P4A export. Configure it under Company Settings.',
      });
    }

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
      nssaNumber: company.nssaNumber,
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
        if (cat === 'PENSION' || (!cat && (code.includes('PENSION') || code.includes('PEN')))) {
          totalPension += amt;
        } else {
          // Other pre-tax deductions (like Shortime) reduce the reported gross on IT7
          totalGross -= amt;
        }
      }
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=IT7-${employee.employeeCode || employeeId}-${year}.pdf`);

    return generateIT7PDF({
      year,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      nationalId: employee.passportNumber,
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
            passportNumber: true,
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
          r.employee.passportNumber || '',
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
          r.employee.passportNumber || '',
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


// ─── ZIMRA TaRMS Monthly PAYE Return (Excel) ─────────────────────────────────
// GET /api/reports/tarms-paye-excel?month=&year=
//
// Generates the 52-column TaRMS bulk upload template pre-populated with payroll
// data for the selected period.

router.get('/tarms-paye-excel', requirePermission('export_reports'), async (req, res) => {
  const { month, year } = req.query;
  const companyId = req.companyId;
  if (!companyId || !month || !year) {
    return res.status(400).json({ message: 'month and year are required' });
  }

  try {
    // ── 1. Fetch payslips + employee + transactions ───────────────────────────
    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: runPeriodFilter(companyId, year, month),
      },
      include: {
        employee: { select: { tin: true, passportNumber: true, firstName: true, lastName: true, currency: true, taxMethod: true } },
        payrollRun: { select: { id: true, startDate: true, dualCurrency: true, currency: true } },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    // Collect all run IDs so we can fetch transactions in one query
    const runIds = [...new Set(payslips.map(p => p.payrollRunId))];
    const employeeIds = payslips.map(p => p.employeeId);

    const transactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: { in: runIds }, employeeId: { in: employeeIds } },
      include: {
        transactionCode: {
          select: { code: true, name: true, type: true, preTax: true, incomeCategory: true },
        },
      },
    });

    // Group transactions by employeeId
    const txByEmployee = transactions.reduce((acc, t) => {
      if (!acc[t.employeeId]) acc[t.employeeId] = [];
      acc[t.employeeId].push(t);
      return acc;
    }, {});

    // ── 2. Fetch prior-period cumulative bonus (YTD excl. current run) ────────
    // We look at completed runs earlier in the same tax year (April 1 start)
    const refDate = payslips[0].payrollRun.startDate;
    const taxYearStart = new Date(refDate) >= new Date(refDate.getFullYear(), 3, 1)
      ? new Date(refDate.getFullYear(), 3, 1)      // Apr 1 this year
      : new Date(refDate.getFullYear() - 1, 3, 1); // Apr 1 prior year

    const priorBonusTxs = await prisma.payrollTransaction.findMany({
      where: {
        employeeId: { in: employeeIds },
        payrollRun: {
          companyId,
          status: 'COMPLETED',
          startDate: { gte: taxYearStart, lt: refDate },
        },
        transactionCode: {
          OR: [
            { incomeCategory: 'BONUS' },
            { incomeCategory: 'GRATUITY' },
            { name: { contains: 'bonus', mode: 'insensitive' } },
          ],
        },
      },
      select: { employeeId: true, amount: true },
    });

    const priorBonusByEmployee = priorBonusTxs.reduce((acc, t) => {
      acc[t.employeeId] = (acc[t.employeeId] || 0) + (t.amount || 0);
      return acc;
    }, {});

    // ── 3. Helper: split amount into USD / ZWG based on run currency ──────────
    const split = (ps, amount) => {
      if (!amount) return { usd: 0, zwg: 0 };
      const isUSD = (ps.payrollRun.currency || 'USD').toUpperCase() === 'USD';
      return ps.payrollRun.dualCurrency
        ? { usd: amount, zwg: 0 }           // dual-currency runs store USD amounts
        : isUSD
          ? { usd: amount, zwg: 0 }
          : { usd: 0, zwg: amount };
    };

    // ── 4. Categorise transactions per employee ───────────────────────────────
    const categorise = (txs, ps) => {
      const s = split;
      const r = {
        otherExemptions: { usd: 0, zwg: 0 },
        overtime:        { usd: 0, zwg: 0 },
        bonus:           { usd: 0, zwg: 0 },
        commission:      { usd: 0, zwg: 0 },
        otherIrregular:  { usd: 0, zwg: 0 },
        severanceExempt: { usd: 0, zwg: 0 },
        gratuityNoExempt:{ usd: 0, zwg: 0 },
        housingBenefit:  { usd: 0, zwg: 0 },
        vehicleBenefit:  { usd: 0, zwg: 0 },
        educationBenefit:{ usd: 0, zwg: 0 },
        otherBenefits:   { usd: 0, zwg: 0 },
        nonTaxable:      { usd: 0, zwg: 0 },
        pension:         { usd: 0, zwg: 0 },
        retirementAnnuity:{ usd: 0, zwg: 0 },
        otherDeductions: { usd: 0, zwg: 0 },
        medicalExpenses: { usd: 0, zwg: 0 },
        blindCredit:     { usd: 0, zwg: 0 },
        disabledCredit:  { usd: 0, zwg: 0 },
        elderlyCredit:   { usd: 0, zwg: 0 },
      };

      const add = (bucket, amt) => {
        const { usd, zwg } = s(ps, amt);
        bucket.usd += usd;
        bucket.zwg += zwg;
      };

      for (const t of txs) {
        const tc = t.transactionCode;
        const cat = tc?.incomeCategory;
        const code = (tc?.code || '').toUpperCase();
        const name = (tc?.name || '').toUpperCase();
        const amt = Math.abs(t.amount || 0);
        if (tc?.type === 'EARNING' || tc?.type === 'BENEFIT') {
          if (cat === 'OVERTIME' || name.includes('OVERTIME') || code.includes('OT'))
            add(r.overtime, amt);
          else if (cat === 'BONUS')
            add(r.bonus, amt);
          else if (cat === 'GRATUITY')
            add(r.gratuityNoExempt, amt);
          else if (cat === 'COMMISSION')
            add(r.commission, amt);
          else if (tc?.type === 'BENEFIT') {
            if (name.includes('HOUS') || code.includes('HOUS'))      add(r.housingBenefit, amt);
            else if (name.includes('VEH') || code.includes('VEH'))   add(r.vehicleBenefit, amt);
            else if (name.includes('EDU') || code.includes('EDU'))   add(r.educationBenefit, amt);
            else                                                       add(r.otherBenefits, amt);
          }
          else if (cat === 'ALLOWANCE')                               add(r.otherIrregular, amt);
          else                                                         add(r.nonTaxable, amt);
        } else if (tc?.type === 'DEDUCTION') {
          if (cat === 'PENSION' || name.includes('PENSION'))           add(r.pension, amt);
          else if (name.includes('RETIREM') || name.includes('ANNUITY')) add(r.retirementAnnuity, amt);
          else if (name.includes('MED') && name.includes('EXP'))       add(r.medicalExpenses, amt);
          else if (name.includes('BLIND'))                             add(r.blindCredit, amt);
          else if (name.includes('DISAB'))                             add(r.disabledCredit, amt);
          else if (name.includes('ELDER'))                             add(r.elderlyCredit, amt);
          else                                                          add(r.otherDeductions, amt);
        }
      }
      return r;
    };

    // ── 5. Define the 52 columns ──────────────────────────────────────────────
    const DARK_BLUE  = 'FF1A2E4A';
    const LIGHT_BLUE = 'FFD6E4F7';
    const LIGHT_GREEN= 'FFD6F0D6';
    const WHITE_FONT = 'FFFFFFFF';

    // [header, key, currency? 'usd'|'zwg'|null]
    const COL_DEF = [
      ['TIN',                                        'tin',               null],
      ['ID/Passport Number',                         'id',                null],
      ['Employee Name',                              'name',              null],
      ['Currency',                                   'currency',          null],
      ['Current Salary... USD',                      'salaryUSD',         'usd'],
      ['Current Salary... ZWG',                      'salaryZWG',         'zwg'],
      ['Other Exemptions... USD',                    'exemptUSD',         'usd'],
      ['Other Exemptions... ZWG',                    'exemptZWG',         'zwg'],
      ['Current Overtime USD',                       'overtimeUSD',       'usd'],
      ['Current Overtime ZWG',                       'overtimeZWG',       'zwg'],
      ['Current Bonus USD',                          'bonusUSD',          'usd'],
      ['Current Bonus ZWG',                          'bonusZWG',          'zwg'],
      ['Current Irregular Commission USD',           'commissionUSD',     'usd'],
      ['Current Irregular Commission ZWG',           'commissionZWG',     'zwg'],
      ['Current Other Irregular earnings USD',       'otherIrregUSD',     'usd'],
      ['Current Other Irregular earnings ZWG',       'otherIrregZWG',     'zwg'],
      ['Current Severance/Gratuity (Exempt) USD',    'sevExemptUSD',      'usd'],
      ['Current Severance/Gratuity (Exempt) ZWG',    'sevExemptZWG',      'zwg'],
      ['Current Gratuity (No Exemption) USD',        'gratNoExemptUSD',   'usd'],
      ['Current Gratuity (No Exemption) ZWG',        'gratNoExemptZWG',   'zwg'],
      ['Current Housing Benefit USD',                'housingUSD',        'usd'],
      ['Current Housing Benefit ZWG',                'housingZWG',        'zwg'],
      ['Current Vehicle Benefit USD',                'vehicleUSD',        'usd'],
      ['Current Vehicle Benefit ZWG',                'vehicleZWG',        'zwg'],
      ['Current Education Benefit USD',              'educationUSD',      'usd'],
      ['Current Education Benefit ZWG',              'educationZWG',      'zwg'],
      ['Current Other Benefits USD',                 'otherBenUSD',       'usd'],
      ['Current Other Benefits ZWG',                 'otherBenZWG',       'zwg'],
      ['Current Non-Taxable Earnings USD',           'nonTaxUSD',         'usd'],
      ['Current Non-taxable earnings ZWG',           'nonTaxZWG',         'zwg'],
      ['Current Pension Contributions USD',          'pensionUSD',        'usd'],
      ['Current Pension Contributions ZWG',          'pensionZWG',        'zwg'],
      ['Current NSSA Contributions USD',             'nssaUSD',           'usd'],
      ['Current NSSA Contributions ZWG',             'nssaZWG',           'zwg'],
      ['Current Retirement Annuity USD',             'retirementUSD',     'usd'],
      ['Current Retirement Annuity ZWG',             'retirementZWG',     'zwg'],
      ['Current NEC/Subscriptions USD',              'necUSD',            'usd'],
      ['Current NEC/Subscriptions ZWG',              'necZWG',            'zwg'],
      ['Current Other Deductions USD',               'otherDedUSD',       'usd'],
      ['Current Other Deductions ZWG',               'otherDedZWG',       'zwg'],
      ['Current Medical Aid USD',                    'medAidUSD',         'usd'],
      ['Current Medical Aid ZWG',                    'medAidZWG',         'zwg'],
      ['Current Medical Expenses USD',               'medExpUSD',         'usd'],
      ['Current Medical Expenses ZWG',               'medExpZWG',         'zwg'],
      ['Current Blind persons credit USD',           'blindUSD',          'usd'],
      ['Current Blind persons credit ZWG',           'blindZWG',          'zwg'],
      ['Current Disabled persons credit USD',        'disabledUSD',       'usd'],
      ['Current Disabled persons credit ZWG',        'disabledZWG',       'zwg'],
      ['Current Elderly person credit USD',          'elderlyUSD',        'usd'],
      ['Current Elderly person credit ZWG',          'elderlyZWG',        'zwg'],
      ['Cumulative Bonus (Last Period) USD',         'cumBonusUSD',       'usd'],
      ['Cumulative Bonus (Last Period) ZWG',         'cumBonusZWG',       'zwg'],
    ];

    // ── 6. Helper: build one TaRMS worksheet into the given workbook ─────────
    const NUM_FMT = '#,##0.00';

    const buildTarmsSheet = (wb, sheetName, sheetPayslips, ctx) => {
      const { categorise, txByEmployee, priorBonusByEmployee, COL_DEF, DARK_BLUE, LIGHT_BLUE, LIGHT_GREEN, WHITE_FONT, NUM_FMT } = ctx;

      const ws = wb.addWorksheet(sheetName, {
        pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      });

      // Column widths
      ws.columns = COL_DEF.map(([header, key], i) => ({
        key,
        width: i < 4 ? 22 : 20,
        header,
      }));

      // Style header row
      const headerRow = ws.getRow(1);
      headerRow.height = 45;
      COL_DEF.forEach(([, , ccyType], i) => {
        const cell = headerRow.getCell(i + 1);
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
        cell.font   = { bold: true, color: { argb: WHITE_FONT }, size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = { bottom: { style: 'medium', color: { argb: 'FF4472C4' } } };
      });

      // Add data rows (2 – N)
      sheetPayslips.forEach((ps) => {
        const emp = ps.employee;
        const txs = txByEmployee[ps.employeeId] || [];
        const cats = categorise(txs, ps);
        const isDual = ps.payrollRun.dualCurrency;
        const isUSD  = (ps.payrollRun.currency || 'USD').toUpperCase() === 'USD';

        const nssaUSD = isDual ? (ps.nssaUSD ?? ps.nssaEmployee) : (isUSD ? ps.nssaEmployee : 0);
        const nssaZWG = isDual ? (ps.nssaZIG ?? 0) : (!isUSD ? ps.nssaEmployee : 0);
        const medAidUSD = isDual ? (ps.medicalAidCredit ?? 0) : (isUSD ? (ps.medicalAidCredit ?? 0) : 0);
        const medAidZWG = isDual ? 0 : (!isUSD ? (ps.medicalAidCredit ?? 0) : 0);
        const priorBonus = priorBonusByEmployee[ps.employeeId] || 0;

        const salUSD = isDual ? (ps.grossUSD ?? 0) : (isUSD ? (ps.basicSalaryApplied || 0) : 0);
        const salZWG = isDual ? (ps.grossZIG ?? 0) : (!isUSD ? (ps.basicSalaryApplied || 0) : 0);

        const rowValues = {
          tin:            emp.tin || '',
          id:             emp.passportNumber || '',
          name:           `${emp.firstName} ${emp.lastName}`,
          currency:       ps.payrollRun.currency || 'USD',
          salaryUSD:      salUSD,
          salaryZWG:      salZWG,
          exemptUSD:      cats.otherExemptions.usd,
          exemptZWG:      cats.otherExemptions.zwg,
          overtimeUSD:    cats.overtime.usd,
          overtimeZWG:    cats.overtime.zwg,
          bonusUSD:       cats.bonus.usd,
          bonusZWG:       cats.bonus.zwg,
          commissionUSD:  cats.commission.usd,
          commissionZWG:  cats.commission.zwg,
          otherIrregUSD:  cats.otherIrregular.usd,
          otherIrregZWG:  cats.otherIrregular.zwg,
          sevExemptUSD:   cats.severanceExempt.usd,
          sevExemptZWG:   cats.severanceExempt.zwg,
          gratNoExemptUSD:cats.gratuityNoExempt.usd,
          gratNoExemptZWG:cats.gratuityNoExempt.zwg,
          housingUSD:     cats.housingBenefit.usd,
          housingZWG:     cats.housingBenefit.zwg,
          vehicleUSD:     cats.vehicleBenefit.usd,
          vehicleZWG:     cats.vehicleBenefit.zwg,
          educationUSD:   cats.educationBenefit.usd,
          educationZWG:   cats.educationBenefit.zwg,
          otherBenUSD:    cats.otherBenefits.usd,
          otherBenZWG:    cats.otherBenefits.zwg,
          nonTaxUSD:      cats.nonTaxable.usd,
          nonTaxZWG:      cats.nonTaxable.zwg,
          pensionUSD:     isDual ? (ps.pensionApplied ?? 0) : (isUSD ? (ps.pensionApplied ?? 0) : 0),
          pensionZWG:     !isDual && !isUSD ? (ps.pensionApplied ?? 0) : (cats.pension.zwg),
          nssaUSD,
          nssaZWG,
          retirementUSD:  cats.retirementAnnuity.usd,
          retirementZWG:  cats.retirementAnnuity.zwg,
          necUSD:         isDual ? (ps.necLevy ?? 0) : (isUSD ? (ps.necLevy ?? 0) : 0),
          necZWG:         !isDual && !isUSD ? (ps.necLevy ?? 0) : 0,
          otherDedUSD:    cats.otherDeductions.usd,
          otherDedZWG:    cats.otherDeductions.zwg,
          medAidUSD,
          medAidZWG,
          medExpUSD:      cats.medicalExpenses.usd,
          medExpZWG:      cats.medicalExpenses.zwg,
          blindUSD:       cats.blindCredit.usd,
          blindZWG:       cats.blindCredit.zwg,
          disabledUSD:    cats.disabledCredit.usd,
          disabledZWG:    cats.disabledCredit.zwg,
          elderlyUSD:     cats.elderlyCredit.usd,
          elderlyZWG:     cats.elderlyCredit.zwg,
          cumBonusUSD:    isUSD ? priorBonus : 0,
          cumBonusZWG:    !isUSD ? priorBonus : 0,
        };

        const row = ws.addRow(rowValues);

        // Apply currency fill + number format to financial columns (5–52)
        COL_DEF.forEach(([, , ccyType], i) => {
          if (!ccyType) return;
          const cell = row.getCell(i + 1);
          cell.fill = {
            type: 'pattern', pattern: 'solid',
            fgColor: { argb: ccyType === 'usd' ? LIGHT_BLUE : LIGHT_GREEN },
          };
          cell.numFmt = NUM_FMT;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.font = { size: 10, name: 'Calibri' };
        });
        // Style the first 4 identifier columns
        for (let i = 1; i <= 4; i++) {
          const cell = row.getCell(i);
          cell.font = { size: 10, name: 'Calibri' };
          cell.alignment = { vertical: 'middle' };
        }
        row.height = 18;
      });

      // Totals row
      const dataStart = 2;
      const dataEnd   = sheetPayslips.length + 1;
      const totalsRow = ws.addRow({});
      totalsRow.height = 22;

      // Label in col 3 (Employee Name)
      totalsRow.getCell(3).value = 'TOTALS';
      totalsRow.getCell(3).font  = { bold: true, size: 10, name: 'Calibri' };

      // SUBTOTAL formulas for cols 5–52
      COL_DEF.forEach(([, key, ccyType], i) => {
        if (!ccyType) return;
        const colLetter = ws.getColumn(i + 1).letter;
        const cell = totalsRow.getCell(i + 1);
        cell.value  = { formula: `SUBTOTAL(9,${colLetter}${dataStart}:${colLetter}${dataEnd})` };
        cell.numFmt = NUM_FMT;
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
        cell.font   = { bold: true, color: { argb: WHITE_FONT }, size: 10, name: 'Calibri' };
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      });
      // Style the label cells
      for (let i = 1; i <= 4; i++) {
        const cell = totalsRow.getCell(i);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_BLUE } };
        cell.font = { bold: true, color: { argb: WHITE_FONT }, size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'middle' };
      }

      // Freeze first 3 columns + header
      ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1, topLeftCell: 'D2' }];

      // Auto-filter on header row
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COL_DEF.length } };
    };

    // ── 7. Classify payslips and build workbook with two sheets ───────────────
    const FDS_METHODS = new Set(['FDS_AVERAGE', 'FDS_FORECASTING']);
    const fdsPayslips    = payslips.filter(p => FDS_METHODS.has(p.employee.taxMethod));
    const nonFdsPayslips = payslips.filter(p => !FDS_METHODS.has(p.employee.taxMethod));

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bantu HR';
    wb.created = new Date();

    const ctx = { categorise, txByEmployee, priorBonusByEmployee, COL_DEF, DARK_BLUE, LIGHT_BLUE, LIGHT_GREEN, WHITE_FONT, NUM_FMT };

    if (fdsPayslips.length > 0)    buildTarmsSheet(wb, 'TaRMS PAYE (FDS)',     fdsPayslips,    ctx);
    if (nonFdsPayslips.length > 0) buildTarmsSheet(wb, 'TaRMS PAYE (Non-FDS)', nonFdsPayslips, ctx);

    if (wb.worksheets.length === 0) {
      return res.status(404).json({ message: 'No completed payroll data for this period' });
    }

    // ── 8. Stream ─────────────────────────────────────────────────────────────
    const mm   = String(month).padStart(2, '0');
    const filename = `ZIMRA-TaRMS-PAYE-${year}-${mm}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('TaRMS PAYE Excel error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── NSSA P4A Excel (detailed per-employee) ──────────────────────────────────
// GET /api/reports/nssa-p4a-excel?month=&year=

router.get('/nssa-p4a-excel', requirePermission('export_reports'), async (req, res) => {
  const { month, year } = req.query;
  const targetCompanyId = req.companyId;
  if (!targetCompanyId || !month || !year) {
    return res.status(400).json({ message: 'month and year are required' });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: targetCompanyId },
      select: { name: true, registrationNumber: true },
    });

    const payslips = await prisma.payslip.findMany({
      where: {
        payrollRun: runPeriodFilter(targetCompanyId, year, month),
      },
      include: {
        employee: {
          select: {
            employeeCode: true,
            socialSecurityNum: true,
            passportNumber: true,
            dateOfBirth: true,
            lastName: true,
            firstName: true,
            startDate: true,
            dischargeDate: true,
            baseRate: true,
          },
        },
        payrollRun: {
          select: { startDate: true, endDate: true },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    if (payslips.length === 0) {
      return res.status(404).json({ message: 'No completed payroll data for this period' });
    }

    const ssrNumber = company?.registrationNumber || '';
    const periodStr = `${String(month).padStart(2, '0')}/${year}`;

    // ── Build workbook ────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Bantu HR';
    wb.created = new Date();
    const ws = wb.addWorksheet('NSSA P4A', {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    const COLUMNS = [
      { header: 'SsrNumber',               key: 'ssrNumber',             width: 18 },
      { header: 'WorksNumber',              key: 'worksNumber',           width: 16 },
      { header: 'SSNNumber',                key: 'ssnNumber',             width: 18 },
      { header: 'NationalIDNumber',         key: 'nationalIdNumber',      width: 20 },
      { header: 'Period',                   key: 'period',                width: 12 },
      { header: 'BirthDate',               key: 'birthDate',             width: 14, numFmt: 'DD/MM/YYYY' },
      { header: 'Surname',                  key: 'surname',               width: 20 },
      { header: 'Firstname',               key: 'firstname',             width: 20 },
      { header: 'StartDate',               key: 'startDate',             width: 14, numFmt: 'DD/MM/YYYY' },
      { header: 'EndDate',                 key: 'endDate',               width: 14, numFmt: 'DD/MM/YYYY' },
      { header: 'POBSInsurableEarnings',   key: 'pobsInsurableEarnings', width: 24, numFmt: '#,##0.00' },
      { header: 'POBSContributions',       key: 'pobsContributions',     width: 22, numFmt: '#,##0.00' },
      { header: 'BasicAPWCS',              key: 'basicAPWCS',            width: 18, numFmt: '#,##0.00' },
      { header: 'ActualInsurableEarnings', key: 'actualInsurableEarnings', width: 26, numFmt: '#,##0.00' },
    ];

    ws.columns = COLUMNS.map(c => ({ key: c.key, width: c.width, header: c.header }));

    // ── Style header row ─────────────────────────────────────────────────────
    const headerRow = ws.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2E4A' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFB2DB64' } },
      };
    });
    headerRow.height = 30;

    // ── Data rows ─────────────────────────────────────────────────────────────
    const LIGHT_GRAY = 'FFF5F5F5';
    const WHITE = 'FFFFFFFF';
    const financialKeys = new Set([
      'pobsInsurableEarnings', 'pobsContributions', 'basicAPWCS', 'actualInsurableEarnings',
    ]);
    const dateKeys = new Set(['birthDate', 'startDate', 'endDate']);

    payslips.forEach((ps, idx) => {
      const emp = ps.employee;
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? WHITE : LIGHT_GRAY;

      const pobsInsurable = ps.nssaBasis != null && ps.nssaBasis > 0 ? ps.nssaBasis : ps.gross;
      const pobsContribs  = (ps.nssaEmployee || 0) + (ps.nssaEmployer || ps.nssaEmployee || 0);
      const basicSalary   = ps.basicSalaryApplied > 0 ? ps.basicSalaryApplied : (emp.baseRate || 0);

      const rowData = {
        ssrNumber:              ssrNumber,
        worksNumber:            emp.employeeCode || '',
        ssnNumber:              emp.socialSecurityNum || '',
        nationalIdNumber:       emp.passportNumber || '',
        period:                 periodStr,
        birthDate:              emp.dateOfBirth ? new Date(emp.dateOfBirth) : null,
        surname:                emp.lastName || '',
        firstname:              emp.firstName || '',
        startDate:              emp.startDate ? new Date(emp.startDate) : null,
        endDate:                emp.dischargeDate ? new Date(emp.dischargeDate) : null,
        pobsInsurableEarnings:  pobsInsurable,
        pobsContributions:      pobsContribs,
        basicAPWCS:             basicSalary,
        actualInsurableEarnings: ps.gross || 0,
      };

      const row = ws.addRow(rowData);

      row.eachCell((cell, colNumber) => {
        const colKey = COLUMNS[colNumber - 1]?.key;
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.font = { size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'middle' };

        if (financialKeys.has(colKey)) {
          cell.numFmt = '#,##0.00';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        }
        if (dateKeys.has(colKey)) {
          cell.numFmt = 'DD/MM/YYYY';
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        }
      });
      row.height = 20;
    });

    // ── Totals row ─────────────────────────────────────────────────────────────
    const dataRowStart = 2;
    const dataRowEnd   = payslips.length + 1;

    const totalsRow = ws.addRow({
      ssrNumber:               'TOTALS',
      worksNumber:             '',
      ssnNumber:               '',
      nationalIdNumber:        '',
      period:                  '',
      birthDate:               null,
      surname:                 '',
      firstname:               '',
      startDate:               null,
      endDate:                 null,
      pobsInsurableEarnings:   { formula: `SUM(K${dataRowStart}:K${dataRowEnd})` },
      pobsContributions:       { formula: `SUM(L${dataRowStart}:L${dataRowEnd})` },
      basicAPWCS:              { formula: `SUM(M${dataRowStart}:M${dataRowEnd})` },
      actualInsurableEarnings: { formula: `SUM(N${dataRowStart}:N${dataRowEnd})` },
    });

    totalsRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A2E4A' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
      cell.alignment = { vertical: 'middle' };
    });
    // Format financial cells in totals row
    ['K', 'L', 'M', 'N'].forEach(col => {
      const cell = totalsRow.getCell(col);
      cell.numFmt = '#,##0.00';
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalsRow.height = 22;

    // ── Freeze header ─────────────────────────────────────────────────────────
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    // ── Stream to response ────────────────────────────────────────────────────
    const filename = `NSSA-P4A-${year}-${String(month).padStart(2, '0')}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('NSSA P4A Excel error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
