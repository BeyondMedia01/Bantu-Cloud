const express = require('express');
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/permissions');
const { 
  generateP16PDF, 
  generateP2PDF, 
  generateNSSA_P4A,
  generateIT7PDF
} = require('../../utils/pdfService');

const { 
  getSettingAsNumber,
  getSettingAsString
} = require('../../lib/systemSettings');

const router = express.Router({ mergeParams: true });

// ─── Tax Report (P16) ─────────────────────────────────────────────────────────

// GET /api/reports/tax?year=&format=pdf|json
router.get('/tax', requirePermission('export_reports'), async (req, res) => {
  const { year, format = 'json' } = req.query;
  const targetCompanyId = req.companyId;
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

    res.json({ data });
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


module.exports = router;
