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

    res.json({ data: loans });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


module.exports = router;
