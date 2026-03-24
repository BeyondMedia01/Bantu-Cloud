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

    res.json({ data: records });
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

    const rows = departments.map(d => [
      d.company?.name ?? '',
      d.branch?.name ?? '',
      d.name,
      d._count.employees,
    ]);
    const header = 'Company,Branch,Department,Headcount';
    const csv = [header, ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=headcount-report.csv');
    return res.send(csv);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


module.exports = router;
