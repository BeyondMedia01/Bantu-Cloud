const express = require('express');
const PDFDocument = require('pdfkit');
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/permissions');

const router = express.Router({ mergeParams: true });

// ─── Shared helpers ───────────────────────────────────────────────────────────

const fmt = (n) => Number(n || 0).toFixed(2);
const num = (v) => Number(v ?? 0);

/**
 * Draws a standard A4 portrait PDF table.
 * cols: [{ label, key, x, w, align? }]
 * rows: [{ [key]: value }]
 * Returns the PDFDocument (already ended).
 */
function buildTablePDF({ title, subtitle, cols, rows, totals, res }) {
  const doc = new PDFDocument({ margin: 36, size: 'A4' });
  doc.pipe(res);

  const PAGE_BOTTOM = doc.page.height - 60;
  const ROW_H = 16;

  const drawPageHeader = () => {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a2e4a')
      .text(title, { align: 'center' });
    if (subtitle) {
      doc.font('Helvetica').fontSize(9).fillColor('#64748b')
        .text(subtitle, { align: 'center' });
    }
    doc.moveDown(0.6);
  };

  const drawColHeader = (y) => {
    const tableWidth = cols.reduce((s, c) => s + c.w, 0);
    const startX = cols[0].x;
    doc.rect(startX, y - 2, tableWidth, ROW_H + 1).fill('#1a2e4a');
    doc.font('Helvetica-Bold').fontSize(7).fillColor('white');
    cols.forEach(col => {
      doc.text(col.label, col.x, y, { width: col.w, align: col.align || 'left', lineBreak: false });
    });
    doc.fillColor('black');
    return y + ROW_H;
  };

  drawPageHeader();
  let y = doc.y;
  y = drawColHeader(y);

  doc.font('Helvetica').fontSize(7.5);

  (rows || []).forEach((row, i) => {
    if (y > PAGE_BOTTOM) {
      doc.addPage({ size: 'A4', margin: 36 });
      drawPageHeader();
      y = doc.y;
      y = drawColHeader(y);
      doc.font('Helvetica').fontSize(7.5);
    }

    const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    const tableWidth = cols.reduce((s, c) => s + c.w, 0);
    doc.rect(cols[0].x, y - 2, tableWidth, ROW_H).fill(bg);
    doc.fillColor('#1a2e4a');

    cols.forEach(col => {
      const val = row[col.key] ?? '—';
      doc.text(String(val), col.x, y, { width: col.w, align: col.align || 'left', lineBreak: false });
    });
    y += ROW_H;
  });

  // Totals row
  if (totals) {
    const tableWidth = cols.reduce((s, c) => s + c.w, 0);
    doc.rect(cols[0].x, y - 2, tableWidth, ROW_H + 2).fill('#e2e8f0');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1a2e4a');
    cols.forEach(col => {
      const val = totals[col.key] ?? '';
      doc.text(String(val), col.x, y, { width: col.w, align: col.align || 'left', lineBreak: false });
    });
  }

  doc.end();
}

function runHeader(run) {
  const period = run
    ? `${new Date(run.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} – ${new Date(run.endDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : '';
  const company = run?.company?.name || '';
  return `${company}  |  Period: ${period}`;
}

function startReport(res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
}

// ─── 1. PAYE Report ───────────────────────────────────────────────────────────
router.get('/pdf/paye-report', requirePermission('view_reports'), async (req, res) => {
  const { runId } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });
  try {
    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { company: true },
    });
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: runId },
      include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const isDual = !!run.dualCurrency;
    const cols = isDual ? [
      { label: 'Code',       key: 'code',      x: 36,  w: 50,  align: 'left'  },
      { label: 'Employee',   key: 'name',      x: 88,  w: 110, align: 'left'  },
      { label: 'Gross USD',  key: 'grossUSD',  x: 200, w: 65,  align: 'right' },
      { label: 'Gross ZiG',  key: 'grossZIG',  x: 267, w: 65,  align: 'right' },
      { label: 'PAYE USD',   key: 'payeUSD',   x: 334, w: 65,  align: 'right' },
      { label: 'PAYE ZiG',   key: 'payeZIG',   x: 401, w: 65,  align: 'right' },
      { label: 'AIDS Levy',  key: 'aidsLevy',  x: 468, w: 60,  align: 'right' },
      { label: 'Total PAYE', key: 'totalPaye', x: 530, w: 65,  align: 'right' },
    ] : [
      { label: 'Code',       key: 'code',      x: 36,  w: 60,  align: 'left'  },
      { label: 'Employee',   key: 'name',      x: 98,  w: 150, align: 'left'  },
      { label: 'Gross',      key: 'gross',     x: 250, w: 80,  align: 'right' },
      { label: 'PAYE',       key: 'paye',      x: 332, w: 80,  align: 'right' },
      { label: 'AIDS Levy',  key: 'aidsLevy',  x: 414, w: 70,  align: 'right' },
      { label: 'Total PAYE', key: 'totalPaye', x: 486, w: 80,  align: 'right' },
    ];

    let totGrossUSD = 0, totGrossZIG = 0, totPayeUSD = 0, totPayeZIG = 0, totAids = 0, totPaye = 0, totGross = 0;
    const rows = payslips.map(ps => {
      const gUSD = num(ps.grossUSD); const gZIG = num(ps.grossZIG);
      const pUSD = num(ps.payeUSD);  const pZIG = num(ps.payeZIG);
      const aids = num(ps.aidsLevy); const paye = num(ps.paye);
      const gross = num(ps.gross);
      totGrossUSD += gUSD; totGrossZIG += gZIG; totPayeUSD += pUSD;
      totPayeZIG += pZIG; totAids += aids; totPaye += paye; totGross += gross;
      return isDual ? {
        code: ps.employee.employeeCode,
        name: `${ps.employee.firstName} ${ps.employee.lastName}`,
        grossUSD: fmt(gUSD), grossZIG: fmt(gZIG),
        payeUSD: fmt(pUSD), payeZIG: fmt(pZIG),
        aidsLevy: fmt(aids), totalPaye: fmt(pUSD + pZIG + aids),
      } : {
        code: ps.employee.employeeCode,
        name: `${ps.employee.firstName} ${ps.employee.lastName}`,
        gross: fmt(gross), paye: fmt(paye), aidsLevy: fmt(aids), totalPaye: fmt(paye + aids),
      };
    });

    const totals = isDual ? {
      code: 'TOTAL', name: '',
      grossUSD: fmt(totGrossUSD), grossZIG: fmt(totGrossZIG),
      payeUSD: fmt(totPayeUSD), payeZIG: fmt(totPayeZIG),
      aidsLevy: fmt(totAids), totalPaye: fmt(totPayeUSD + totPayeZIG + totAids),
    } : {
      code: 'TOTAL', name: '',
      gross: fmt(totGross), paye: fmt(totPaye), aidsLevy: fmt(totAids), totalPaye: fmt(totPaye + totAids),
    };

    startReport(res, `PAYE_Report_${runId}.pdf`);
    buildTablePDF({ title: 'PAYE Report', subtitle: runHeader(run), cols, rows, totals, res });
  } catch (e) {
    console.error('PAYE Report error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate PAYE report' });
  }
});

// ─── 2. NSSA Report ───────────────────────────────────────────────────────────
router.get('/pdf/nssa-report', requirePermission('view_reports'), async (req, res) => {
  const { runId } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: runId },
      include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const isDual = !!run.dualCurrency;
    const cols = isDual ? [
      { label: 'Code',         key: 'code',       x: 36,  w: 50,  align: 'left'  },
      { label: 'Employee',     key: 'name',       x: 88,  w: 100, align: 'left'  },
      { label: 'Gross USD',    key: 'grossUSD',   x: 190, w: 60,  align: 'right' },
      { label: 'Gross ZiG',    key: 'grossZIG',   x: 252, w: 60,  align: 'right' },
      { label: 'NSSA Emp USD', key: 'nssaEmpUSD', x: 314, w: 65,  align: 'right' },
      { label: 'NSSA Emp ZiG', key: 'nssaEmpZIG', x: 381, w: 65,  align: 'right' },
      { label: 'NSSA Empr',    key: 'nssaEmpr',   x: 448, w: 65,  align: 'right' },
      { label: 'Total NSSA',   key: 'totalNssa',  x: 515, w: 65,  align: 'right' },
    ] : [
      { label: 'Code',      key: 'code',      x: 36,  w: 70,  align: 'left'  },
      { label: 'Employee',  key: 'name',      x: 108, w: 160, align: 'left'  },
      { label: 'Gross',     key: 'gross',     x: 270, w: 80,  align: 'right' },
      { label: 'NSSA Emp',  key: 'nssaEmp',   x: 352, w: 80,  align: 'right' },
      { label: 'NSSA Empr', key: 'nssaEmpr',  x: 434, w: 80,  align: 'right' },
      { label: 'Total',     key: 'totalNssa', x: 516, w: 65,  align: 'right' },
    ];

    let totGrossUSD = 0, totGrossZIG = 0, totEmpUSD = 0, totEmpZIG = 0, totEmpr = 0, totGross = 0, totEmp = 0;
    const rows = payslips.map(ps => {
      const gUSD = num(ps.grossUSD); const gZIG = num(ps.grossZIG);
      const eUSD = num(ps.nssaUSD);  const eZIG = num(ps.nssaZIG);
      const empr = num(ps.nssaEmployer);
      const gross = num(ps.gross); const emp = num(ps.nssaEmployee);
      totGrossUSD += gUSD; totGrossZIG += gZIG; totEmpUSD += eUSD;
      totEmpZIG += eZIG; totEmpr += empr; totGross += gross; totEmp += emp;
      return isDual ? {
        code: ps.employee.employeeCode,
        name: `${ps.employee.firstName} ${ps.employee.lastName}`,
        grossUSD: fmt(gUSD), grossZIG: fmt(gZIG),
        nssaEmpUSD: fmt(eUSD), nssaEmpZIG: fmt(eZIG),
        nssaEmpr: fmt(empr), totalNssa: fmt(eUSD + eZIG + empr),
      } : {
        code: ps.employee.employeeCode,
        name: `${ps.employee.firstName} ${ps.employee.lastName}`,
        gross: fmt(gross), nssaEmp: fmt(emp), nssaEmpr: fmt(empr), totalNssa: fmt(emp + empr),
      };
    });

    const totals = isDual ? {
      code: 'TOTAL', name: '',
      grossUSD: fmt(totGrossUSD), grossZIG: fmt(totGrossZIG),
      nssaEmpUSD: fmt(totEmpUSD), nssaEmpZIG: fmt(totEmpZIG),
      nssaEmpr: fmt(totEmpr), totalNssa: fmt(totEmpUSD + totEmpZIG + totEmpr),
    } : {
      code: 'TOTAL', name: '',
      gross: fmt(totGross), nssaEmp: fmt(totEmp), nssaEmpr: fmt(totEmpr), totalNssa: fmt(totEmp + totEmpr),
    };

    startReport(res, `NSSA_Report_${runId}.pdf`);
    buildTablePDF({ title: 'NSSA Report', subtitle: runHeader(run), cols, rows, totals, res });
  } catch (e) {
    console.error('NSSA Report error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate NSSA report' });
  }
});

// ─── 3. Total Journal ─────────────────────────────────────────────────────────
router.get('/pdf/total-journal', requirePermission('view_reports'), async (req, res) => {
  const { runId } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const txns = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: runId },
      include: { transactionCode: { select: { code: true, name: true, type: true } } },
      orderBy: [{ transactionCode: { type: 'asc' } }, { transactionCode: { code: 'asc' } }],
    });

    // Aggregate by TC
    const tcMap = {};
    for (const t of txns) {
      const tc = t.transactionCode;
      const key = tc?.code || 'UNKNOWN';
      if (!tcMap[key]) tcMap[key] = { code: key, name: tc?.name || '', type: tc?.type || '', total: 0 };
      tcMap[key].total += num(t.amount);
    }

    const cols = [
      { label: 'TC Code',     key: 'code',   x: 36,  w: 70,  align: 'left'  },
      { label: 'Description', key: 'name',   x: 108, w: 180, align: 'left'  },
      { label: 'Type',        key: 'type',   x: 290, w: 80,  align: 'left'  },
      { label: 'Debit',       key: 'debit',  x: 372, w: 90,  align: 'right' },
      { label: 'Credit',      key: 'credit', x: 464, w: 90,  align: 'right' },
    ];

    let totDebit = 0, totCredit = 0;
    const rows = Object.values(tcMap).map(tc => {
      const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
      const debit  = isEarning ? 0 : tc.total;
      const credit = isEarning ? tc.total : 0;
      totDebit += debit; totCredit += credit;
      return { code: tc.code, name: tc.name, type: tc.type, debit: debit ? fmt(debit) : '—', credit: credit ? fmt(credit) : '—' };
    });

    const totals = { code: 'TOTAL', name: '', type: '', debit: fmt(totDebit), credit: fmt(totCredit) };

    startReport(res, `Total_Journal_${runId}.pdf`);
    buildTablePDF({ title: 'Total Payroll Journal', subtitle: runHeader(run), cols, rows, totals, res });
  } catch (e) {
    console.error('Total Journal error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate Total Journal' });
  }
});

// ─── 4. Department Journal ────────────────────────────────────────────────────
router.get('/pdf/department-journal', requirePermission('view_reports'), async (req, res) => {
  const { runId } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const txns = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: runId },
      include: {
        transactionCode: { select: { code: true, name: true, type: true } },
        employee: { include: { department: { select: { name: true } } } },
      },
      orderBy: [{ employee: { department: { name: 'asc' } } }, { transactionCode: { code: 'asc' } }],
    });

    // Aggregate by department + TC
    const deptMap = {};
    for (const t of txns) {
      const dept = t.employee?.department?.name || t.employee?.costCenter || 'General';
      const tc = t.transactionCode;
      const key = `${dept}__${tc?.code || 'UNKNOWN'}`;
      if (!deptMap[key]) deptMap[key] = { dept, code: tc?.code || 'UNKNOWN', name: tc?.name || '', type: tc?.type || '', total: 0 };
      deptMap[key].total += num(t.amount);
    }

    const cols = [
      { label: 'Department',  key: 'dept',   x: 36,  w: 100, align: 'left'  },
      { label: 'TC Code',     key: 'code',   x: 138, w: 55,  align: 'left'  },
      { label: 'Description', key: 'name',   x: 195, w: 140, align: 'left'  },
      { label: 'Type',        key: 'type',   x: 337, w: 70,  align: 'left'  },
      { label: 'Debit',       key: 'debit',  x: 409, w: 75,  align: 'right' },
      { label: 'Credit',      key: 'credit', x: 486, w: 75,  align: 'right' },
    ];

    let totDebit = 0, totCredit = 0;
    const rows = Object.values(deptMap).map(tc => {
      const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
      const debit  = isEarning ? 0 : tc.total;
      const credit = isEarning ? tc.total : 0;
      totDebit += debit; totCredit += credit;
      return { dept: tc.dept, code: tc.code, name: tc.name, type: tc.type, debit: debit ? fmt(debit) : '—', credit: credit ? fmt(credit) : '—' };
    });

    const totals = { dept: 'TOTAL', code: '', name: '', type: '', debit: fmt(totDebit), credit: fmt(totCredit) };

    startReport(res, `Department_Journal_${runId}.pdf`);
    buildTablePDF({ title: 'Department Payroll Journal', subtitle: runHeader(run), cols, rows, totals, res });
  } catch (e) {
    console.error('Department Journal error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate Department Journal' });
  }
});

// ─── 5. Medical Aid Report ────────────────────────────────────────────────────
router.get('/pdf/medical-aid', requirePermission('view_reports'), async (req, res) => {
  const { runId } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const txns = await prisma.payrollTransaction.findMany({
      where: {
        payrollRunId: runId,
        transactionCode: {
          OR: [
            { incomeCategory: 'MEDICAL_AID' },
            { name: { contains: 'medical', mode: 'insensitive' } },
          ],
          type: 'DEDUCTION',
        },
      },
      include: {
        transactionCode: { select: { code: true, name: true } },
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const cols = [
      { label: 'Code',     key: 'code',     x: 36,  w: 60,  align: 'left'  },
      { label: 'Employee', key: 'name',     x: 98,  w: 150, align: 'left'  },
      { label: 'TC Code',  key: 'tcCode',   x: 250, w: 60,  align: 'left'  },
      { label: 'Plan',     key: 'plan',     x: 312, w: 110, align: 'left'  },
      { label: 'Amount',   key: 'amount',   x: 424, w: 70,  align: 'right' },
      { label: 'Currency', key: 'currency', x: 496, w: 55,  align: 'left'  },
    ];

    let total = 0;
    const rows = txns.map(t => {
      const amt = num(t.amount); total += amt;
      return {
        code: t.employee.employeeCode,
        name: `${t.employee.firstName} ${t.employee.lastName}`,
        tcCode: t.transactionCode.code,
        plan: t.transactionCode.name,
        amount: fmt(amt),
        currency: t.currency || run.currency || 'USD',
      };
    });

    const totals = { code: 'TOTAL', name: '', tcCode: '', plan: '', amount: fmt(total), currency: '' };

    startReport(res, `Medical_Aid_Report_${runId}.pdf`);
    buildTablePDF({ title: 'Medical Aid Report', subtitle: runHeader(run), cols, rows, totals, res });
  } catch (e) {
    console.error('Medical Aid Report error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate Medical Aid report' });
  }
});

// ─── 6. Overtime Report ───────────────────────────────────────────────────────
router.get('/pdf/overtime', requirePermission('view_reports'), async (req, res) => {
  const { runId } = req.query;
  if (!runId) return res.status(400).json({ message: 'runId is required' });
  try {
    const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
    if (!run) return res.status(404).json({ message: 'Run not found' });
    if (req.companyId && run.companyId !== req.companyId) return res.status(403).json({ message: 'Access denied' });

    const txns = await prisma.payrollTransaction.findMany({
      where: {
        payrollRunId: runId,
        transactionCode: {
          type: 'EARNING',
          OR: [
            { incomeCategory: 'OVERTIME' },
            { name: { contains: 'overtime', mode: 'insensitive' } },
            { name: { contains: 'over time', mode: 'insensitive' } },
            { code: { startsWith: 'OT' } },
          ],
        },
      },
      include: {
        transactionCode: { select: { code: true, name: true } },
        employee: { select: { employeeCode: true, firstName: true, lastName: true } },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    // Also get units from PayrollInput
    const empTcPairs = txns.map(t => ({ employeeId: t.employeeId, transactionCodeId: t.transactionCodeId }));
    const inputs = empTcPairs.length > 0 ? await prisma.payrollInput.findMany({
      where: {
        payrollRunId: runId,
        OR: empTcPairs,
      },
      select: { employeeId: true, transactionCodeId: true, units: true, unitsType: true },
    }) : [];
    const unitsMap = {};
    for (const inp of inputs) {
      unitsMap[`${inp.employeeId}:${inp.transactionCodeId}`] = inp;
    }

    const cols = [
      { label: 'Code',     key: 'code',     x: 36,  w: 55,  align: 'left'  },
      { label: 'Employee', key: 'name',     x: 93,  w: 140, align: 'left'  },
      { label: 'OT Type',  key: 'otType',   x: 235, w: 110, align: 'left'  },
      { label: 'Units',    key: 'units',    x: 347, w: 50,  align: 'right' },
      { label: 'Amount',   key: 'amount',   x: 399, w: 80,  align: 'right' },
      { label: 'Currency', key: 'currency', x: 481, w: 55,  align: 'left'  },
    ];

    let total = 0;
    const rows = txns.map(t => {
      const amt = num(t.amount); total += amt;
      const inp = unitsMap[`${t.employeeId}:${t.transactionCodeId}`];
      return {
        code: t.employee.employeeCode,
        name: `${t.employee.firstName} ${t.employee.lastName}`,
        otType: t.transactionCode.name,
        units: inp?.units != null ? String(inp.units) : '—',
        amount: fmt(amt),
        currency: t.currency || run.currency || 'USD',
      };
    });

    if (rows.length === 0) rows.push({ code: '—', name: 'No overtime transactions found for this run', otType: '', units: '', amount: '', currency: '' });

    const totals = { code: 'TOTAL', name: '', otType: '', units: '', amount: fmt(total), currency: '' };

    startReport(res, `Overtime_Report_${runId}.pdf`);
    buildTablePDF({ title: 'Overtime Report', subtitle: runHeader(run), cols, rows, totals, res });
  } catch (e) {
    console.error('Overtime Report error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate Overtime report' });
  }
});

// ─── 7. Salary Advance Report ─────────────────────────────────────────────────
router.get('/pdf/salary-advance', requirePermission('view_reports'), async (req, res) => {
  try {
    const where = req.companyId ? { employee: { companyId: req.companyId } } : {};
    const loans = await prisma.loan.findMany({
      where: {
        ...where,
        OR: [
          { type: 'SALARY_ADVANCE' },
          { type: { contains: 'advance', mode: 'insensitive' } },
        ],
      },
      include: {
        employee: {
          select: { employeeCode: true, firstName: true, lastName: true, company: { select: { name: true } } },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    const cols = [
      { label: 'Code',       key: 'code',      x: 36,  w: 55,  align: 'left'  },
      { label: 'Employee',   key: 'name',      x: 93,  w: 130, align: 'left'  },
      { label: 'Principal',  key: 'principal', x: 225, w: 75,  align: 'right' },
      { label: 'Balance',    key: 'balance',   x: 302, w: 75,  align: 'right' },
      { label: 'Monthly',    key: 'monthly',   x: 379, w: 70,  align: 'right' },
      { label: 'Status',     key: 'status',    x: 451, w: 65,  align: 'left'  },
      { label: 'Start Date', key: 'startDate', x: 518, w: 65,  align: 'left'  },
    ];

    let totPrincipal = 0, totBalance = 0;
    const rows = loans.map(l => {
      const principal = num(l.amount); const balance = num(l.balance ?? l.amount);
      totPrincipal += principal; totBalance += balance;
      return {
        code: l.employee.employeeCode,
        name: `${l.employee.firstName} ${l.employee.lastName}`,
        principal: fmt(principal),
        balance: fmt(balance),
        monthly: l.installmentAmount ? fmt(l.installmentAmount) : '—',
        status: l.status || '—',
        startDate: l.startDate ? new Date(l.startDate).toLocaleDateString('en-GB') : '—',
      };
    });

    if (rows.length === 0) rows.push({ code: '—', name: 'No salary advances on record', principal: '', balance: '', monthly: '', status: '', startDate: '' });

    const totals = { code: 'TOTAL', name: '', principal: fmt(totPrincipal), balance: fmt(totBalance), monthly: '', status: '', startDate: '' };

    startReport(res, `Salary_Advance_Report.pdf`);
    buildTablePDF({ title: 'Salary Advance Report', subtitle: `As at ${new Date().toLocaleDateString('en-GB')}`, cols, rows, totals, res });
  } catch (e) {
    console.error('Salary Advance Report error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate Salary Advance report' });
  }
});

// ─── 8. Leave Provision Report ────────────────────────────────────────────────
router.get('/pdf/leave-provision', requirePermission('view_reports'), async (req, res) => {
  try {
    const where = req.companyId ? { employee: { companyId: req.companyId } } : {};
    const balances = await prisma.leaveBalance.findMany({
      where,
      include: {
        employee: { select: { employeeCode: true, firstName: true, lastName: true, baseRate: true, currency: true } },
      },
      orderBy: [{ employee: { lastName: 'asc' } }, { leaveType: 'asc' }],
    });

    const cols = [
      { label: 'Code',       key: 'code',      x: 36,  w: 55,  align: 'left'  },
      { label: 'Employee',   key: 'name',      x: 93,  w: 120, align: 'left'  },
      { label: 'Leave Type', key: 'leaveType', x: 215, w: 90,  align: 'left'  },
      { label: 'Balance Days', key: 'balance', x: 307, w: 65,  align: 'right' },
      { label: 'Daily Rate', key: 'dailyRate', x: 374, w: 70,  align: 'right' },
      { label: 'Provision',  key: 'provision', x: 446, w: 80,  align: 'right' },
      { label: 'Currency',   key: 'currency',  x: 528, w: 50,  align: 'left'  },
    ];

    let totProvision = 0;
    const rows = balances.map(b => {
      const days = num(b.balance);
      const monthlyRate = num(b.employee?.baseRate);
      const dailyRate = monthlyRate > 0 ? monthlyRate / 30 : 0;
      const provision = days * dailyRate;
      totProvision += provision;
      return {
        code: b.employee.employeeCode,
        name: `${b.employee.firstName} ${b.employee.lastName}`,
        leaveType: b.leaveType || '—',
        balance: days.toFixed(1),
        dailyRate: fmt(dailyRate),
        provision: fmt(provision),
        currency: b.employee.currency || 'USD',
      };
    });

    if (rows.length === 0) rows.push({ code: '—', name: 'No leave balances on record', leaveType: '', balance: '', dailyRate: '', provision: '', currency: '' });

    const totals = { code: 'TOTAL', name: '', leaveType: '', balance: '', dailyRate: '', provision: fmt(totProvision), currency: '' };

    startReport(res, `Leave_Provision_Report.pdf`);
    buildTablePDF({ title: 'Leave Provision Report', subtitle: `As at ${new Date().toLocaleDateString('en-GB')}`, cols, rows, totals, res });
  } catch (e) {
    console.error('Leave Provision Report error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate Leave Provision report' });
  }
});

// ─── 9. Employee Listing ──────────────────────────────────────────────────────
router.get('/pdf/employee-listing', requirePermission('view_reports'), async (req, res) => {
  try {
    const where = req.companyId ? { companyId: req.companyId } : {};
    const employees = await prisma.employee.findMany({
      where: { ...where, status: { not: 'TERMINATED' } },
      include: { department: { select: { name: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    const cols = [
      { label: 'Code',       key: 'code',       x: 36,  w: 50,  align: 'left' },
      { label: 'First Name', key: 'firstName',  x: 88,  w: 80,  align: 'left' },
      { label: 'Last Name',  key: 'lastName',   x: 170, w: 80,  align: 'left' },
      { label: 'Department', key: 'dept',       x: 252, w: 90,  align: 'left' },
      { label: 'Position',   key: 'position',   x: 344, w: 90,  align: 'left' },
      { label: 'Type',       key: 'empType',    x: 436, w: 65,  align: 'left' },
      { label: 'Start Date', key: 'startDate',  x: 503, w: 60,  align: 'left' },
    ];

    const rows = employees.map(e => ({
      code: e.employeeCode || '—',
      firstName: e.firstName || '—',
      lastName: e.lastName || '—',
      dept: e.department?.name || e.costCenter || '—',
      position: e.position || '—',
      empType: (e.employmentType || '').replace(/_/g, ' '),
      startDate: e.hireDate ? new Date(e.hireDate).toLocaleDateString('en-GB') : '—',
    }));

    const totals = { code: `${rows.length} employees`, firstName: '', lastName: '', dept: '', position: '', empType: '', startDate: '' };

    startReport(res, `Employee_Listing.pdf`);
    buildTablePDF({ title: 'Employee Listing', subtitle: `Active employees as at ${new Date().toLocaleDateString('en-GB')}`, cols, rows, totals, res });
  } catch (e) {
    console.error('Employee Listing error:', e);
    if (!res.headersSent) res.status(500).json({ message: e.message || 'Failed to generate Employee Listing' });
  }
});

module.exports = router;
