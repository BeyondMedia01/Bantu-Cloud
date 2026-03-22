const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { parse: parseCSV } = require('csv-parse/sync');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');

const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

const pick = (body) => ({
  // Support both explicit employeeUSD/ZiG fields (from grid) and a generic `amount` + `currency`
  // field (from the list-view form). When only `amount` is provided, route it to the right field.
  employeeUSD: body.employeeUSD !== undefined
    ? parseFloat(body.employeeUSD) || 0
    : (body.amount !== undefined && body.currency !== 'ZiG' ? parseFloat(body.amount) || 0 : undefined),
  employeeZiG: body.employeeZiG !== undefined
    ? parseFloat(body.employeeZiG) || 0
    : (body.amount !== undefined && body.currency === 'ZiG' ? parseFloat(body.amount) || 0 : undefined),
  employerUSD: body.employerUSD !== undefined ? parseFloat(body.employerUSD) || 0 : undefined,
  employerZiG: body.employerZiG !== undefined ? parseFloat(body.employerZiG) || 0 : undefined,
  units:       body.units !== undefined && body.units !== '' ? parseFloat(body.units) : null,
  unitsType:   body.unitsType !== undefined ? body.unitsType || null : undefined,
  duration:    body.duration || 'Indefinite',
  balance:     body.balance !== undefined && body.balance !== '' ? parseFloat(body.balance) : 0,
  period:      body.period,
  notes:       body.notes !== undefined ? body.notes || null : undefined,
});

const INCLUDE = {
  employee: { select: { firstName: true, lastName: true, employeeCode: true } },
  transactionCode: { select: { code: true, name: true, type: true } },
};

// GET /api/payroll-inputs
router.get('/', async (req, res) => {
    const { payrollRunId, employeeId, processed, period } = req.query;
  try {
    const where = {
      ...(payrollRunId && { payrollRunId }),
      ...(employeeId && { employeeId }),
      ...(processed !== undefined && processed !== '' && { processed: processed === 'true' }),
    };

    if (period) {
      where.OR = [
        { period: period },
        {
          period: { lte: period },
          duration: 'Indefinite',
        }
      ];
    }
    if (req.companyId) {
      where.employee = { companyId: req.companyId };
    } else if (req.clientId) {
      where.employee = { clientId: req.clientId };
    }
    const inputs = await prisma.payrollInput.findMany({
      where,
      include: INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    res.json(inputs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/payroll-inputs
router.post('/', requirePermission('process_payroll'), async (req, res) => {
  const { employeeId, payrollRunId, transactionCodeId, period } = req.body;
  if (!employeeId || !transactionCodeId || !period) {
    return res.status(400).json({ message: 'employeeId, transactionCodeId, and period are required' });
  }
  try {
    // Period-lock check: reject inputs for any PayrollCalendar period marked isClosed.
    // period format: "YYYY-MM"
    if (period && req.companyId) {
      const [yyyy, mm] = period.split('-').map(Number);
      if (yyyy && mm) {
        const periodStart = new Date(yyyy, mm - 1, 1);
        const periodEnd   = new Date(yyyy, mm, 0, 23, 59, 59);
        // Resolve clientId for this company first, then check the calendar
        const company = await prisma.company.findUnique({
          where: { id: req.companyId },
          select: { clientId: true },
        });
        if (company) {
          const lockedCal = await prisma.payrollCalendar.findFirst({
            where: {
              clientId: company.clientId,
              isClosed: true,
              startDate: { lte: periodEnd },
              endDate:   { gte: periodStart },
            },
            select: { id: true },
          });
          if (lockedCal) {
            return res.status(423).json({
              message: `Period ${period} is locked. Unlock the payroll calendar before adding inputs.`,
            });
          }
        }
      }
    }

    const data = pick(req.body);
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);
    const input = await prisma.payrollInput.create({
      data: { employeeId, payrollRunId: payrollRunId || null, transactionCodeId, ...data },
      include: INCLUDE,
    });
    res.status(201).json(input);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/payroll-inputs/:id
router.put('/:id', requirePermission('process_payroll'), async (req, res) => {
  try {
    const existing = await prisma.payrollInput.findUnique({ 
      where: { id: req.params.id },
      include: { employee: { select: { companyId: true, clientId: true } } }
    });
    if (!existing) return res.status(404).json({ message: 'Payroll input not found' });
    if (existing.processed) return res.status(400).json({ message: 'Cannot edit a processed input' });

    // Period-lock check
    const lockedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: existing.employee.clientId,
        isClosed: true,
        startDate: { lte: new Date(existing.period + '-31') }, // roughly check month
        endDate:   { gte: new Date(existing.period + '-01') },
      },
    });
    if (lockedCal) return res.status(423).json({ message: `Period ${existing.period} is locked.` });

    const { transactionCodeId } = req.body;
    const data = pick(req.body);
    Object.keys(data).forEach(k => data[k] === undefined && delete data[k]);

    const input = await prisma.payrollInput.update({
      where: { id: req.params.id },
      data: { ...(transactionCodeId && { transactionCodeId }), ...data },
      include: INCLUDE,
    });
    res.json(input);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/payroll-inputs/processed — clear all processed once-off inputs for the company
router.delete('/processed', requirePermission('process_payroll'), async (req, res) => {
  try {
    const where = { processed: true };
    if (req.companyId) {
      where.employee = { companyId: req.companyId };
    } else if (req.clientId) {
      where.employee = { clientId: req.clientId };
    }
    const { count } = await prisma.payrollInput.deleteMany({ where });
    res.json({ deleted: count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/payroll-inputs/:id
router.delete('/:id', requirePermission('process_payroll'), async (req, res) => {
  try {
    const input = await prisma.payrollInput.findUnique({ 
      where: { id: req.params.id },
      include: { employee: { select: { clientId: true } } }
    });
    if (!input) return res.status(404).json({ message: 'Payroll input not found' });
    if (input.processed) return res.status(400).json({ message: 'Cannot delete a processed input' });

    // Period-lock check
    const lockedCal = await prisma.payrollCalendar.findFirst({
      where: {
        clientId: input.employee.clientId,
        isClosed: true,
        startDate: { lte: new Date(input.period + '-31') },
        endDate:   { gte: new Date(input.period + '-01') },
      },
    });
    if (lockedCal) return res.status(423).json({ message: `Period ${input.period} is locked.` });

    await prisma.payrollInput.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/payroll-inputs/import — bulk create inputs from CSV or Excel
router.post('/import', requirePermission('process_payroll'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const scopedCompanyId = req.companyId;
  if (!scopedCompanyId) return res.status(400).json({ message: 'Company context required' });

  let rows = [];
  const ext = req.file.originalname.toLowerCase().split('.').pop();
  try {
    if (ext === 'csv') {
      rows = parseCSV(req.file.buffer.toString('utf8'), { columns: true, skip_empty_lines: true, trim: true });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } else {
      return res.status(400).json({ message: 'Unsupported file format.' });
    }
  } catch (err) {
    return res.status(400).json({ message: 'Parse error: ' + err.message });
  }

  const get = (row, header) => {
    const normalise = (s) => s.replace(/\s*\*$/, '').trim().toLowerCase();
    const needle = normalise(header);
    const key = Object.keys(row).find((k) => normalise(k) === needle);
    return key ? String(row[key] ?? '').trim() : '';
  };

  // Pre-fetch employees and transaction codes for mapping
  const [employees, codes] = await Promise.all([
    prisma.employee.findMany({ where: { companyId: scopedCompanyId }, select: { id: true, employeeCode: true } }),
    prisma.transactionCode.findMany({ select: { id: true, code: true } }),
  ]);
  const empMap = Object.fromEntries(employees.map(e => [String(e.employeeCode).trim().toLowerCase(), e.id]));
  const tcMap  = Object.fromEntries(codes.map(c => [String(c.code).trim().toLowerCase(), c.id]));

  const results = { created: 0, failed: [] };
  const period = req.body.period; // Optional period from body, else from row

  // ─── Period-Lock Pre-check ──────────────────────────────────────────────
  // We check the single 'period' if provided in body, or scan all rows for unique periods.
  // If ANY target period is locked, we fail the entire import to maintain integrity.
  try {
    const company = await prisma.company.findUnique({
      where: { id: scopedCompanyId },
      select: { clientId: true },
    });
    if (!company) throw new Error('Company not found');

    const uniqueRowPeriods = [...new Set(rows.map(r => get(r, 'Period') || period).filter(Boolean))];
    
    for (const p of uniqueRowPeriods) {
      const [yyyy, mm] = p.split('-').map(Number);
      if (!yyyy || !mm) continue;
      const periodStart = new Date(yyyy, mm - 1, 1);
      const periodEnd   = new Date(yyyy, mm, 0, 23, 59, 59);

      const lockedCal = await prisma.payrollCalendar.findFirst({
        where: {
          clientId: company.clientId,
          isClosed: true,
          startDate: { lte: periodEnd },
          endDate:   { gte: periodStart },
        },
        select: { id: true, name: true },
      });

      if (lockedCal) {
        return res.status(423).json({
          message: `Import failed: Period ${p} is locked in the ${lockedCal.name || 'payroll'} calendar.`,
        });
      }
    }
  } catch (err) {
    return res.status(500).json({ message: 'Lock check failed: ' + err.message });
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      const eCode = get(row, 'Employee Code');
      const tCode = get(row, 'Transaction Code');
      const amtUSD = parseFloat(get(row, 'Amount USD')) || 0;
      const amtZIG = parseFloat(get(row, 'Amount ZiG')) || 0;
      const rowPeriod = get(row, 'Period') || period;
      
      const empId = empMap[eCode.toLowerCase()];
      const tcId  = tcMap[tCode.toLowerCase()];

      if (!empId) throw new Error(`Employee code "${eCode}" not found`);
      if (!tcId)  throw new Error(`Transaction code "${tCode}" not found`);
      if (!rowPeriod) throw new Error('Period is required (YYYY-MM)');

      await prisma.payrollInput.create({
        data: {
          employeeId: empId,
          transactionCodeId: tcId,
          employeeUSD: amtUSD,
          employeeZiG: amtZIG,
          units: parseFloat(get(row, 'Units')) || null,
          unitsType: get(row, 'Units Type') || null,
          period: rowPeriod,
          notes: get(row, 'Notes') || null,
          duration: 'Once', // Bulk imports usually for one-off monthly variables
        }
      });
      results.created++;
    } catch (err) {
      results.failed.push({ row: rowNum, reason: err.message });
    }
  }

  res.json(results);
});

module.exports = router;
