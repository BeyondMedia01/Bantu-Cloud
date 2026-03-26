const PDFDocument = require('pdfkit');

/**
 * Generates a payslip PDF for an employee.
 *
 * data fields:
 *   companyName, period, employeeName, nationalId, jobTitle, currency
 *   baseSalary, overtimeAmount, bonus, exemptBonus, taxableBenefits
 *   severanceAmount, exemptSeverance
 *   paye, aidsLevy, nssaEmployee, nssaEmployer, pensionEmployee, medicalAid, loanDeductions
 *   wcifEmployer, sdfContribution, necLevy   (employer-only — shown in info section)
 *   netSalary
 *   netPayUSD, netPayZIG                     (set when employee has a split-currency arrangement)
 */
/**
 * Internal: draws all payslip content onto an existing PDFDocument.
 * Does NOT call doc.end() — callers are responsible for that.
 */
/**
 * Draws the official platform logo using SVG path data.
 */
function drawPlatformLogo(doc, x, y, size = 30) {
  const scale = size / 512;
  const paths = [
    "M107.922 469.898L147.362 401.664C195.756 317.943 316.497 317.943 364.89 401.422L404.33 469.656L331.499 511.758L275.121 414.488C266.652 399.97 245.601 399.97 237.132 414.488L180.996 512L107.922 469.898Z",
    "M42.1022 107.917L110.336 147.357C194.057 195.751 194.057 316.491 110.579 364.885L42.3441 404.325L0.241907 331.493L97.5124 275.115C112.03 266.647 112.03 245.595 97.5124 237.127L0 180.991L42.1022 107.917Z",
    "M404.08 42.1021L364.64 110.336C316.247 194.057 195.506 194.057 147.112 110.579L107.672 42.3441L180.504 0.241907L236.882 97.5123C245.351 112.03 266.402 112.03 274.87 97.5123L331.249 0L404.08 42.1021Z",
    "M404.08 42.1021L364.64 110.336C316.247 194.057 195.506 194.057 147.112 110.579L107.672 42.3441L180.504 0.241907L236.882 97.5123C245.351 112.03 266.402 112.03 274.870 97.5123L331.249 0L404.08 42.1021Z",
    "M469.899 404.083L401.664 364.643C317.944 316.25 317.944 195.509 401.422 147.115L469.657 107.675L511.759 180.507L414.489 236.885C399.971 245.354 399.971 266.405 414.489 274.873L512.001 331.01L469.899 404.083Z",
    "M256.002 304.151C282.996 304.151 304.879 282.268 304.879 255.274C304.879 228.28 282.996 206.397 256.002 206.397C229.008 206.397 207.125 228.28 207.125 255.274C207.125 282.268 229.008 304.151 256.002 304.151Z"
  ];
  doc.save();
  doc.translate(x, y).scale(scale);
  paths.forEach(p => doc.path(p).fill("#B2DB64"));
  doc.restore();
}

/**
 * Universal branded footer — identical branding on every PDF type.
 * Always anchored at doc.page.height - 60 so it never floats or creates a new page.
 * Logo left · "Bantu Modern HR & Payroll Automation" centre · CONFIDENTIAL right.
 */
function drawBantuFooter(doc) {
  const PAGE_H = doc.page.height;
  const PAGE_W = doc.page.width;
  const FOOTER_Y = PAGE_H - 60;
  const F_LEFT   = 50;
  const F_RIGHT  = PAGE_W - 50;
  const GREY = '#64748b';
  const BORDER_COLOR = '#e2e8f0';
  const TEXT_W = F_RIGHT - F_LEFT - 25; // usable width after logo

  doc.moveTo(F_LEFT, FOOTER_Y).lineTo(F_RIGHT, FOOTER_Y)
    .lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();

  drawPlatformLogo(doc, F_LEFT, FOOTER_Y + 8, 18);

  // Centre — company identity
  doc.fillColor(GREY).font('Helvetica-Bold').fontSize(8)
    .text('Bantu Modern HR & Payroll Automation',
      F_LEFT + 25, FOOTER_Y + 13,
      { width: TEXT_W - 140, align: 'center' });

  // Right — confidentiality notice
  doc.fillColor(GREY).font('Helvetica').fontSize(8)
    .text('CONFIDENTIAL DOCUMENT',
      F_RIGHT - 140, FOOTER_Y + 13,
      { width: 140, align: 'right' });
}

function _drawPayslip(doc, data) {
  const ccy = data.currency || 'USD';
  const fmt = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Branding Colors
  const BANTU_GREEN = '#B2DB64';
  const DARK_NAVY = '#1a2e4a';
  const TEXT_DARK = '#1e293b';
  const TEXT_MUTED = '#64748b';
  const BG_LIGHT = '#f8fafc';
  const BORDER_COLOR = '#e2e8f0';

  const LEFT = 40;
  const PAGE_WIDTH = 595.28;
  const RIGHT = PAGE_WIDTH - 40;
  const CONTENT_W = RIGHT - LEFT;
  const MID = LEFT + CONTENT_W / 2;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.rect(0, 0, PAGE_WIDTH, 100).fill(DARK_NAVY);
  drawPlatformLogo(doc, LEFT, 27, 42);

  doc.fillColor('white').font('Helvetica-Bold').fontSize(22)
    .text('PAYSLIP', RIGHT - 140, 32, { width: 140, align: 'right' });

  doc.fillColor(BANTU_GREEN).font('Helvetica-Bold').fontSize(15)
    .text((data.companyName || '').toUpperCase(), LEFT + 55, 35);
  doc.fillColor('white').font('Helvetica').fontSize(9.5)
    .text(`Period: ${data.period}`, LEFT + 55, 57);
  doc.fillColor(BANTU_GREEN).font('Helvetica').fontSize(8.5)
    .text(`Issued: ${data.issuedDate || new Date().toLocaleDateString('en-GB')}`, LEFT + 55, 73);

  // ── Employee & Employment Details Card ────────────────────────────────────
  let currY = 115;
  doc.roundedRect(LEFT, currY, CONTENT_W, 88, 6).fill(BG_LIGHT);
  doc.lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();

  const drawInfoField = (label, value, x, y, w) => {
    doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(7).text(label.toUpperCase(), x, y);
    doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(9.5)
      .text(value || '—', x, y + 11, { width: w, lineBreak: false });
  };

  const colWidth = (CONTENT_W - 40) / 4;
  drawInfoField('Employee Name', data.employeeName, LEFT + 15, currY + 14, colWidth * 1.5);
  drawInfoField('Employee Code', data.employeeCode, LEFT + 15 + colWidth * 1.5, currY + 14, colWidth);
  drawInfoField('ID Number', data.nationalId, LEFT + 15 + colWidth * 2.5, currY + 14, colWidth * 1.5);

  drawInfoField('Department', data.department, LEFT + 15, currY + 54, colWidth);
  drawInfoField('Position', data.jobTitle, LEFT + 15 + colWidth, currY + 54, colWidth);
  drawInfoField('Cost Centre', data.costCenter, LEFT + 15 + colWidth * 2, currY + 54, colWidth);
  drawInfoField('Pay Method', data.paymentMethod, LEFT + 15 + colWidth * 3, currY + 54, colWidth);

  // ── Bank Details (mandatory — show warning if missing) ────────────────────
  currY += 103;
  if (data.bankMissing) {
    doc.roundedRect(LEFT, currY, CONTENT_W, 36, 5).fill('#fef3c7');
    doc.lineWidth(1).strokeColor('#f59e0b').stroke();
    doc.fillColor('#92400e').font('Helvetica-Bold').fontSize(8.5)
      .text('⚠  PAYMENT PENDING: UPDATE BANKING DETAILS', LEFT + 12, currY + 8);
    doc.fillColor('#78350f').font('Helvetica').fontSize(8)
      .text('Bank name and account number are missing from this employee\'s profile. Please update before processing payment.',
        LEFT + 12, currY + 22, { width: CONTENT_W - 24, lineBreak: false });
  } else {
    doc.roundedRect(LEFT, currY, CONTENT_W, 36, 5).fill('#f1f5f9');
    doc.lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();
    drawInfoField('Bank Name', data.bankName, LEFT + 15, currY + 10, MID - LEFT - 20);
    drawInfoField('Account Number', data.accountNumber, MID + 10, currY + 10, RIGHT - MID - 15);
  }

  // ── Two-Column Earnings / Deductions Table ────────────────────────────────
  currY += 50;

  const lineItems = data.lineItems || [];
  const earnings = lineItems.filter(i => i.allowance > 0);
  const deductions = lineItems.filter(i => i.deduction > 0);
  const employerContribs = lineItems.filter(i => i.employer > 0);

  // Each half is (CONTENT_W - 8) / 2 wide with an 8px gap between
  const HALF_W = Math.floor((CONTENT_W - 8) / 2);
  const R_START = LEFT + HALF_W + 8;
  const PAD = 8;
  const DESC_W = 108;
  const AMT_W = 62;
  const YTD_W = HALF_W - PAD * 2 - DESC_W - AMT_W;

  // Column headers
  const drawHalfHeader = (xStart, title, titleColor) => {
    doc.rect(xStart, currY, HALF_W, 22).fill(DARK_NAVY);
    doc.fillColor(titleColor).font('Helvetica-Bold').fontSize(7.5)
      .text(title, xStart + PAD, currY + 3);
    doc.fillColor('rgba(255,255,255,0.65)').font('Helvetica').fontSize(7);
    doc.text('DESCRIPTION', xStart + PAD, currY + 13, { width: DESC_W });
    doc.text('AMOUNT', xStart + PAD + DESC_W, currY + 13, { width: AMT_W, align: 'right' });
    doc.text('YTD', xStart + PAD + DESC_W + AMT_W, currY + 13, { width: YTD_W, align: 'right' });
  };

  drawHalfHeader(LEFT, 'EARNINGS', BANTU_GREEN);
  drawHalfHeader(R_START, 'DEDUCTIONS', '#fb7185');
  currY += 22;

  const ROW_H = 19;
  const maxRows = Math.max(earnings.length, deductions.length);

  for (let i = 0; i < maxRows; i++) {
    const rowY = currY + i * ROW_H;
    const bg = i % 2 === 0 ? '#f7f9fc' : 'white';
    doc.rect(LEFT, rowY, HALF_W, ROW_H).fill(bg);
    doc.rect(R_START, rowY, HALF_W, ROW_H).fill(bg);

    const textY = rowY + 5;

    if (earnings[i]) {
      const e = earnings[i];
      const eNameY = e.description ? textY - 2 : textY;
      doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(8.5)
        .text(e.name, LEFT + PAD, eNameY, { width: DESC_W, lineBreak: false });
      if (e.description) {
        doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7)
          .text(e.description, LEFT + PAD, eNameY + 9, { width: DESC_W, lineBreak: false });
      }
      doc.fillColor('#059669').font('Helvetica-Bold').fontSize(8.5)
        .text(fmt(e.allowance), LEFT + PAD + DESC_W, textY, { width: AMT_W, align: 'right' });
      doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8)
        .text(fmt(e.ytd ?? e.allowance), LEFT + PAD + DESC_W + AMT_W, textY, { width: YTD_W, align: 'right' });
    }

    if (deductions[i]) {
      const d = deductions[i];
      const dNameY = d.description ? textY - 2 : textY;
      doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(8.5)
        .text(d.name, R_START + PAD, dNameY, { width: DESC_W, lineBreak: false });
      if (d.description) {
        doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7)
          .text(d.description, R_START + PAD, dNameY + 9, { width: DESC_W, lineBreak: false });
      }
      doc.fillColor('#e11d48').font('Helvetica-Bold').fontSize(8.5)
        .text(fmt(d.deduction), R_START + PAD + DESC_W, textY, { width: AMT_W, align: 'right' });
      doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8)
        .text(fmt(d.ytd ?? d.deduction), R_START + PAD + DESC_W + AMT_W, textY, { width: YTD_W, align: 'right' });
    }
  }
  currY += maxRows * ROW_H + 6;

  // ── Employer Statutory Contributions (horizontal box) ─────────────────────
  if (employerContribs.length > 0) {
    const BOX_H = 48;
    doc.roundedRect(LEFT, currY, CONTENT_W, BOX_H, 5).fill('#eef2ff');
    doc.lineWidth(0.5).strokeColor('#c7d2fe').stroke();
    doc.fillColor('#3730a3').font('Helvetica-Bold').fontSize(7.5)
      .text('STATUTORY EMPLOYER CONTRIBUTIONS', LEFT + 12, currY + 7);

    const itemW = Math.floor((CONTENT_W - 24) / employerContribs.length);
    employerContribs.forEach((c, idx) => {
      const cx = LEFT + 12 + idx * itemW;
      // Current
      doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7)
        .text(c.name.toUpperCase(), cx, currY + 19, { width: itemW - 8, lineBreak: false });
      doc.fillColor('#3730a3').font('Helvetica-Bold').fontSize(9)
        .text(`${ccy} ${fmt(c.employer)}`, cx, currY + 29, { width: itemW - 8, lineBreak: false });
      // YTD inline
      if (c.ytd != null) {
        doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7)
          .text(`YTD: ${fmt(c.ytd)}`, cx, currY + 40, { width: itemW - 8, lineBreak: false });
      }
    });
    currY += BOX_H + 8;
  }

  // ── Summary Totals ────────────────────────────────────────────────────────
  currY += 6;
  const SUM_H = 60;
  doc.rect(LEFT, currY, CONTENT_W, SUM_H).fill(DARK_NAVY);

  // Each of the three panels is CONTENT_W/3 wide.
  // Amounts are right-aligned within their panel so they line up with the
  // AMOUNT columns of the two-column table above (no drifting).
  const sumW  = CONTENT_W / 3;
  const panelW = Math.floor(sumW - 16); // usable inner width per panel
  const totalDeductions = data.totalDeductions ?? (data.grossPay - data.netSalary);

  // Panel 1 — Total Earnings
  doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica').fontSize(7.5)
    .text('TOTAL EARNINGS', LEFT + 10, currY + 14, { width: panelW });
  doc.fillColor('white').font('Helvetica-Bold').fontSize(14)
    .text(`${ccy} ${fmt(data.grossPay)}`, LEFT + 10, currY + 26, { width: panelW, align: 'right' });

  // Panel 2 — Total Deductions
  doc.fillColor('rgba(255,255,255,0.7)').font('Helvetica').fontSize(7.5)
    .text('TOTAL DEDUCTIONS', LEFT + sumW + 10, currY + 14, { width: panelW });
  doc.fillColor('#fb7185').font('Helvetica-Bold').fontSize(14)
    .text(`${ccy} ${fmt(totalDeductions)}`, LEFT + sumW + 10, currY + 26, { width: panelW, align: 'right' });

  // Panel 3 — Net Salary (green)
  doc.rect(LEFT + sumW * 2, currY, sumW, SUM_H).fill(BANTU_GREEN);
  if (data.netPayUSD != null && data.netPayZIG != null) {
    doc.fillColor(DARK_NAVY).font('Helvetica').fontSize(7.5)
      .text('NET PAY SPLIT', LEFT + sumW * 2 + 10, currY + 12, { width: panelW });
    doc.font('Helvetica-Bold').fontSize(12)
      .text(`USD ${fmt(data.netPayUSD)}`, LEFT + sumW * 2 + 10, currY + 25, { width: panelW, align: 'right' });
    doc.fontSize(11)
      .text(`ZiG ${fmt(data.netPayZIG)}`, LEFT + sumW * 2 + 10, currY + 40, { width: panelW, align: 'right' });
  } else {
    doc.fillColor(DARK_NAVY).font('Helvetica').fontSize(8)
      .text('NET SALARY', LEFT + sumW * 2 + 10, currY + 14, { width: panelW });
    doc.font('Helvetica-Bold').fontSize(17)
      .text(`${ccy} ${fmt(data.netSalary)}`, LEFT + sumW * 2 + 10, currY + 29, { width: panelW, align: 'right' });
  }

  // ── Leave Balances ────────────────────────────────────────────────────────
  currY += SUM_H + 10;
  doc.roundedRect(LEFT, currY, CONTENT_W, 36, 6).fill(BG_LIGHT);
  doc.lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();

  doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(7.5)
    .text('ANNUAL LEAVE BALANCE', LEFT + 15, currY + 10);
  doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(11)
    .text(`${(data.leaveBalance || 0).toFixed(1)} days`, LEFT + 15, currY + 22);

  if (data.leaveTaken > 0) {
    doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(7.5)
      .text('LEAVE TAKEN (YTD)', MID + 10, currY + 10);
    doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(11)
      .text(`${data.leaveTaken.toFixed(1)} days`, MID + 10, currY + 22);
  }

  // ── Branded Bantu Footer (universal — fixed at page bottom) ─────────────
  drawBantuFooter(doc);
}

const generatePayslipPDF = (data, stream) => {
  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  doc.pipe(stream);
  _drawPayslip(doc, data);
  doc.end();
};

/**
 * Generates a payslip PDF and resolves with a Buffer.
 * More reliable than piping through PassThrough because we listen
 * directly to the PDFDocument's own 'data' and 'end' events.
 */
function generatePayslipBuffer(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 0, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      _drawPayslip(doc, data);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generates a ZIMRA P16 Annual Summary PDF
 *
 * data fields:
 *   company  { name, taxId }
 *   year     number
 *   rows[]   { employee { firstName, lastName, idPassport, tin },
 *              totalGross, totalPaye, totalAidsLevy, totalNssa, totalNet,
 *              totalWcif, totalSdf, totalNecLevy }
 */
const generateP16PDF = (data, stream) => {
  const doc = new PDFDocument({ margin: 30, layout: 'landscape', size: 'A3' });
  doc.pipe(stream);

  const fmt = (n) => Number(n || 0).toFixed(2);

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(14).fillColor('#1a2e4a')
    .text('ZIMRA P16 — ANNUAL SUMMARY OF REMUNERATION AND TAX DEDUCTED', { align: 'center' });
  doc.fillColor('black').font('Helvetica').fontSize(10).moveDown(0.4);
  doc.text(`Tax Year: ${data.year}   |   Employer: ${data.company?.name || ''}   |   BP Number: ${data.company?.taxId || '—'}`,
    { align: 'center' });
  doc.moveDown(0.8);

  // ── Column definitions ──────────────────────────────────────────────────────
  const COLS = [
    { label: 'Employee', key: 'name', x: 30, w: 130 },
    { label: 'ID / Passport', key: 'idPassport', x: 162, w: 80 },
    { label: 'TIN', key: 'tin', x: 244, w: 70 },
    { label: 'Gross Pay', key: 'totalGross', x: 316, w: 75 },
    { label: 'NSSA Employee', key: 'totalNssa', x: 393, w: 75 },
    { label: 'PAYE', key: 'totalPaye', x: 470, w: 70 },
    { label: 'AIDS Levy', key: 'totalAidsLevy', x: 542, w: 65 },
    { label: 'Net Pay', key: 'totalNet', x: 609, w: 75 },
    { label: 'WCIF (Empr)', key: 'totalWcif', x: 686, w: 55 },
    { label: 'ZIMDEF (Empr)', key: 'totalZimdef', x: 742, w: 55 },
    { label: 'SDF (Empr)', key: 'totalSdf', x: 798, w: 50 },
    { label: 'NEC (Empr)', key: 'totalNecEmpr', x: 849, w: 50 },
  ];

  const ROW_H = 18;
  const PAGE_BOTTOM = 540;

  const drawHeader = (y) => {
    // Header background
    doc.rect(28, y - 3, 862, ROW_H + 2).fill('#1a2e4a');
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor('white');
    COLS.forEach(col => {
      doc.text(col.label, col.x, y, { width: col.w, align: col.key === 'name' || col.key === 'idPassport' || col.key === 'tin' ? 'left' : 'right' });
    });
    doc.fillColor('black');
    return y + ROW_H;
  };

  let y = doc.y;
  y = drawHeader(y);

  doc.font('Helvetica').fontSize(8);

  (data.rows || []).forEach((row, i) => {
    if (y > PAGE_BOTTOM) {
      doc.addPage({ layout: 'landscape', size: 'A3', margin: 30 });
      y = 40;
      y = drawHeader(y);
      doc.font('Helvetica').fontSize(8);
    }

    const bg = i % 2 === 0 ? '#f8fafc' : '#ffffff';
    doc.rect(28, y - 2, 862, ROW_H).fill(bg);
    doc.fillColor('#1a2e4a');

    const emp = row.employee || {};
    const cells = {
      name: `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      idPassport: emp.idPassport || '—',
      tin: emp.tin || '—',
      totalGross: fmt(row.totalGross),
      totalNssa: fmt(row.totalNssa),
      totalPaye: fmt(row.totalPaye),
      totalAidsLevy: fmt(row.totalAidsLevy),
      totalNet: fmt(row.totalNet),
      totalWcif: fmt(row.totalWcif),
      totalZimdef: fmt(row.totalZimdef),
      totalSdf: fmt(row.totalSdf),
      totalNecEmpr: fmt(row.totalNecEmpr),
    };

    COLS.forEach(col => {
      const isNum = !['name', 'idPassport', 'tin'].includes(col.key);
      doc.text(cells[col.key], col.x, y, { width: col.w, align: isNum ? 'right' : 'left' });
    });

    doc.fillColor('black');
    y += ROW_H;
  });

  // ── Totals row ───────────────────────────────────────────────────────────────
  if ((data.rows || []).length > 0) {
    const totals = (data.rows || []).reduce((acc, r) => {
      acc.totalGross += r.totalGross || 0;
      acc.totalNssa += r.totalNssa || 0;
      acc.totalPaye += r.totalPaye || 0;
      acc.totalAidsLevy += r.totalAidsLevy || 0;
      acc.totalNet += r.totalNet || 0;
      acc.totalWcif += r.totalWcif || 0;
      acc.totalZimdef += r.totalZimdef || 0;
      acc.totalSdf += r.totalSdf || 0;
      acc.totalNecEmpr += r.totalNecEmpr || 0;
      return acc;
    }, { totalGross: 0, totalNssa: 0, totalPaye: 0, totalAidsLevy: 0, totalNet: 0, totalWcif: 0, totalZimdef: 0, totalSdf: 0, totalNecEmpr: 0 });

    y += 4;
    doc.moveTo(28, y).lineTo(890, y).lineWidth(1).stroke('#1a2e4a');
    y += 6;
    doc.rect(28, y - 2, 862, ROW_H).fill('#e8f0fe');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1a2e4a');

    const totalCells = {
      name: 'TOTALS', idPassport: '', tin: '',
      totalGross: fmt(totals.totalGross),
      totalNssa: fmt(totals.totalNssa),
      totalPaye: fmt(totals.totalPaye),
      totalAidsLevy: fmt(totals.totalAidsLevy),
      totalNet: fmt(totals.totalNet),
      totalWcif: fmt(totals.totalWcif),
      totalZimdef: fmt(totals.totalZimdef),
      totalSdf: fmt(totals.totalSdf),
      totalNecEmpr: fmt(totals.totalNecEmpr),
    };
    COLS.forEach(col => {
      const isNum = !['name', 'idPassport', 'tin'].includes(col.key);
      doc.text(totalCells[col.key], col.x, y, { width: col.w, align: isNum ? 'right' : 'left' });
    });
    doc.fillColor('black');
  }

  // ── Footer note ──────────────────────────────────────────────────────────────
  doc.moveDown(2);
  doc.font('Helvetica').fontSize(7.5).fillColor('#777777')
    .text('WCIF, SDF and NEC Levy are employer-borne contributions and do not reduce employee net pay.', 30);
  doc.fillColor('black');

  doc.end();
};

/**
 * Generates an NSSA P4A Monthly Return PDF
 */
const generateNSSA_P4A = (data, stream) => {
  const doc = new PDFDocument({ margin: 50 });

  doc.pipe(stream);

  doc.fontSize(16).text('NSSA FORM P4A - MONTHLY RETURN', { align: 'center' });
  doc.moveDown();

  doc.fontSize(12).text(`Employer: ${data.companyName}`);
  doc.text(`NSSA Number: ${data.nssaNumber || 'N/A'}`);
  doc.text(`Month: ${data.month}`);
  doc.text(`Year: ${data.year}`);
  doc.moveDown();

  doc.text('Contribution Summary', { underline: true });
  doc.moveDown(0.5);
  doc.text(`Total Insurable Earnings: ${data.currency} ${data.totalInsurableEarnings.toFixed(2)}`);
  doc.text(`Employee Contributions (4.5%): ${data.currency} ${data.totalEmployeeNssa.toFixed(2)}`);
  doc.text(`Employer Contributions (4.5%): ${data.currency} ${data.totalEmployerNssa.toFixed(2)}`);
  doc.moveDown();

  doc.fontSize(14).text(`Total Remittance: ${data.currency} ${data.totalRemittance.toFixed(2)}`, { bold: true });

  doc.end();
};

/**
 * Generates a ZIMRA P2 Monthly Return PDF.
 *
 * data fields:
 *   company { name, taxId }
 *   month, year
 *   totalRemuneration, totalPaye, totalAidsLevy, employeeCount, currency
 */
const generateP2PDF = (data, stream) => {
  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(stream);

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ccy = data.currency || 'USD';

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a2e4a')
    .text('ZIMRA P2 — RETURN OF REMUNERATION AND INCOME TAX', { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(10).fillColor('black')
    .text(`MONTHLY RETURN FOR: ${data.month.toUpperCase()} ${data.year}`, { align: 'center' });
  doc.moveDown(1.5);

  // ── Employer Details ───────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(12).text('1. EMPLOYER DETAILS');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#dddddd');
  doc.moveDown(0.5);

  doc.font('Helvetica').fontSize(10);
  doc.text(`Name of Employer: ${data.company?.name || ''}`);
  doc.text(`Business Partner (BP) Number: ${data.company?.taxId || '—'}`);
  doc.moveDown(1.5);

  // ── Remuneration Summary ───────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(12).text('2. REMUNERATION AND TAX SUMMARY');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#dddddd');
  doc.moveDown(0.8);

  const row = (label, value, bold = false) => {
    const y = doc.y;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    doc.text(label, 60, y, { width: 300 });
    doc.text(value, 360, y, { width: 185, align: 'right' });
    doc.moveDown(0.8);
  };

  row('Total Number of Employees', data.employeeCount.toString());
  row(`Total Remuneration (${ccy})`, `${ccy} ${fmt(data.totalRemuneration)}`);
  row(`Total PAYE Deducted (${ccy})`, `${ccy} ${fmt(data.totalPaye)}`);
  row(`Total AIDS Levy Deducted (${ccy})`, `${ccy} ${fmt(data.totalAidsLevy)}`);

  doc.moveDown(0.5);
  doc.moveTo(350, doc.y).lineTo(545, doc.y).lineWidth(1).stroke('#1a2e4a');
  doc.moveDown(0.5);

  const totalDue = (data.totalPaye || 0) + (data.totalAidsLevy || 0);
  row('TOTAL TAX DUE TO ZIMRA', `${ccy} ${fmt(totalDue)}`, true);

  // ── Declaration ────────────────────────────────────────────────────────────
  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(12).text('3. DECLARATION');
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#dddddd');
  doc.moveDown(0.8);

  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#444444')
    .text('I declare that the information given in this return is true and correct in every detail.');
  doc.moveDown(2);

  const sigY = doc.y;
  doc.moveTo(60, sigY).lineTo(250, sigY).lineWidth(0.5).stroke('#000000');
  doc.moveTo(350, sigY).lineTo(540, sigY).lineWidth(0.5).stroke('#000000');

  doc.font('Helvetica').fontSize(8).fillColor('black');
  doc.text('Signature of Employer/Public Officer', 60, sigY + 5);
  doc.text('Date', 350, sigY + 5);

  doc.end();
};

/**
 * Generates a ZIMRA IT7 Employee Tax Certificate.
 *
 * data fields:
 *   year, employeeName, nationalId, tin, address, jobTitle, periodFrom, periodTo
 *   company { name, taxId, address }
 *   totalGross, totalBonus, totalBenefits, totalAllowances
 *   totalNssa, totalPension, totalPaye, totalAidsLevy
 *   currency
 */
const generateIT7PDF = (data, stream) => {
  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  doc.pipe(stream);

  const ccy = data.currency || 'USD';
  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const LEFT = 60;
  const PAGE_RIGHT = 545;

  const row = (label, value, opts = {}) => {
    const y = doc.y;
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size || 10);
    doc.text(label, LEFT, y);
    doc.text(value, 350, y, { width: PAGE_RIGHT - 350, align: 'right' });
    doc.moveDown(0.6);
  };

  const sectionTitle = (title) => {
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a2e4a').text(title, LEFT);
    doc.fillColor('black');
    doc.moveTo(LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(1).stroke('#1a2e4a');
    doc.moveDown(0.6);
  };

  // ── Header ────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a2e4a')
    .text('ZIMRA IT7 — EMPLOYEE TAX CERTIFICATE', LEFT, 50, { align: 'center', width: PAGE_RIGHT - LEFT });
  doc.fontSize(12).text(`TAX YEAR: ${data.year}`, { align: 'center', width: PAGE_RIGHT - LEFT });
  doc.moveDown(1.5);

  // ── Section A: Employee ───────────────────────────────────────────────────
  sectionTitle('SECTION A: EMPLOYEE DETAILS');
  row('Full Name', data.employeeName, { bold: true });
  row('National ID / Passport', data.nationalId || '—');
  row('Taxpayer Identification Number (TIN)', data.tin || '—');
  row('Designation / Job Title', data.jobTitle || '—');
  row('Period of Employment', `${data.periodFrom} to ${data.periodTo}`);
  doc.moveDown(0.5);

  // ── Section B: Employer ───────────────────────────────────────────────────
  sectionTitle('SECTION B: EMPLOYER DETAILS');
  row('Name of Employer', data.company?.name || '', { bold: true });
  row('BP (Business Partner) Number', data.company?.taxId || '—');
  row('Employer Physical Address', data.company?.address || '—');
  doc.moveDown(0.5);

  // ── Section C: Remuneration & Deductions ──────────────────────────────────
  sectionTitle('SECTION C: REMUNERATION AND TAX DEDUCTED');

  doc.font('Helvetica-Bold').fontSize(10).text('DESCRIPTION', LEFT);
  doc.text(`AMOUNT (${ccy})`, 350, doc.y - 12, { align: 'right', width: PAGE_RIGHT - 350 });
  doc.moveDown(0.4);
  doc.moveTo(LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(0.5).stroke('#dddddd');
  doc.moveDown(0.6);

  row('1. Gross Salary / Wages', `${ccy} ${fmt(data.totalGross)}`);
  row('2. Bonuses and Gratuities', `${ccy} ${fmt(data.totalBonus)}`);
  row('3. Allowances (Taxable)', `${ccy} ${fmt(data.totalAllowances)}`);
  row('4. Taxable Benefits (Non-Cash)', `${ccy} ${fmt(data.totalBenefits)}`);

  doc.moveDown(0.2);
  doc.moveTo(350, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(1).stroke('#1a2e4a');
  doc.moveDown(0.4);
  const totalRem = (data.totalGross || 0) + (data.totalBonus || 0) + (data.totalAllowances || 0) + (data.totalBenefits || 0);
  row('TOTAL REMUNERATION', `${ccy} ${fmt(totalRem)}`, { bold: true });
  doc.moveDown(0.8);

  row('5. NSSA Contributions (Employee Portion)', `${ccy} ${fmt(data.totalNssa)}`);
  row('6. Pension Fund Contributions (Employee Portion)', `${ccy} ${fmt(data.totalPension)}`);
  row('7. PAYE Deducted (Income Tax)', `${ccy} ${fmt(data.totalPaye)}`);
  row('8. AIDS Levy Deducted', `${ccy} ${fmt(data.totalAidsLevy)}`);

  doc.moveDown(0.2);
  doc.moveTo(350, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(1).stroke('#1a2e4a');
  doc.moveDown(0.4);
  const totalTax = (data.totalPaye || 0) + (data.totalAidsLevy || 0);
  row('TOTAL TAX DEDUCTED (PAYE + LEVY)', `${ccy} ${fmt(totalTax)}`, { bold: true });

  // ── Section D: Declaration ────────────────────────────────────────────────
  doc.moveDown(2);
  sectionTitle('SECTION D: DECLARATION');
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#444444')
    .text('I certify that the particulars given in this certificate are true and correct and have been correctly extracted from the payroll records of the employer as of this date.');

  doc.moveDown(2.5);
  const sigY = doc.y;
  doc.moveTo(LEFT, sigY).lineTo(250, sigY).lineWidth(0.5).stroke('#000000');
  doc.moveTo(350, sigY).lineTo(PAGE_RIGHT, sigY).lineWidth(0.5).stroke('#000000');

  doc.fillColor('black').font('Helvetica').fontSize(8);
  doc.text('Authorized Signature / Public Officer', LEFT, sigY + 5);
  doc.text('Date of Issue', 350, sigY + 5);

  doc.end();
};

/**
 * Generates a high-density, A3 landscape Master Roll (Belina style).
 * 
 * @param {object} data
 *   - companyName, period, currency
 *   - groups[] { name, payslips[] }
 */
const generatePayrollSummaryPDF = (data, stream) => {
  const doc = new PDFDocument({ margin: 20, size: 'A3', layout: 'landscape' });
  doc.pipe(stream);

  const { companyName, period, currency: ccy = 'USD', groups = [] } = data;
  const fmtN = (n) => (Number(n) > 0 || Number(n) < 0) ? Number(n).toFixed(2) : '—';
  const NAVY = '#1a2e4a', GREY = '#64748b';

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text(companyName, 20, 25);
  doc.font('Helvetica').fontSize(11).fillColor(GREY)
    .text(`MASTER ROLL  ·  ${period}  ·  ${ccy}`, 20, doc.y + 2);
  doc.moveDown(0.5);
  doc.moveTo(20, doc.y).lineTo(1170, doc.y).lineWidth(1.5).stroke(NAVY);
  doc.moveDown(0.8);

  // ── Column Definitions ──────────────────────────────────────────────────────
  const cols = [
    { label: 'Code', w: 40, align: 'left' },
    { label: 'Name', w: 100, align: 'left' },
    { label: 'Position', w: 80, align: 'left' },
    { label: 'Basic', w: 65, align: 'right' },
    { label: 'Allow/Ben', w: 65, align: 'right' },
    { label: 'Gross', w: 75, align: 'right' },
    { label: 'PAYE', w: 65, align: 'right' },
    { label: 'AIDS', w: 45, align: 'right' },
    { label: 'NSSA Emp', w: 60, align: 'right' },
    { label: 'Pension', w: 60, align: 'right' },
    { label: 'Loans', w: 60, align: 'right' },
    { label: 'Other Ded', w: 60, align: 'right' },
    { label: 'Net Pay', w: 85, align: 'right' },
    { label: 'NSSA Empr', w: 60, align: 'right' },
    { label: 'ZIMDEF', w: 60, align: 'right' },
    { label: 'NEC Match', w: 65, align: 'right' },
    { label: 'CTC', w: 85, align: 'right' }, // Cost to Company
  ];
  const HDR_H = 20, ROW_H = 16;

  const drawHeader = (y) => {
    doc.rect(20, y, 1150, HDR_H).fill(NAVY);
    let cx = 25;
    cols.forEach(col => {
      doc.font('Helvetica-Bold').fontSize(8).fillColor('white')
        .text(col.label, cx, y + 5, { width: col.w - 10, align: col.align });
      cx += col.w;
    });
    return y + HDR_H;
  };

  let currentY = drawHeader(doc.y);

  const grandTotals = { gross: 0, paye: 0, aids: 0, nssaE: 0, nssaR: 0, net: 0, necE: 0, necR: 0, zimdef: 0, ctc: 0 };

  groups.forEach((group) => {
    if (currentY > 780) { doc.addPage({ size: 'A3', layout: 'landscape', margin: 20 }); currentY = drawHeader(30); }

    // Group Header
    doc.rect(20, currentY, 1150, ROW_H).fill('#e2e8f0');
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY).text(group.name.toUpperCase(), 30, currentY + 4);
    currentY += ROW_H;

    const groupTotals = { gross: 0, paye: 0, aids: 0, nssaE: 0, nssaR: 0, net: 0, necE: 0, necR: 0, zimdef: 0, ctc: 0 };

    group.payslips.forEach((p, idx) => {
      if (currentY > 800) { doc.addPage({ size: 'A3', layout: 'landscape', margin: 20 }); currentY = drawHeader(30); }
      doc.rect(20, currentY, 1150, ROW_H).fill(idx % 2 === 0 ? 'white' : '#f8fafc');

      const emp = p.employee || {};
      // Calculate Allowances/Benefits (Gross - Basic)
      const allowBen = (p.gross || 0) - (p.basicSalaryApplied || emp.baseRate || 0);
      const ctc = (p.gross || 0) + (p.nssaEmployer || 0) + (p.zimdefEmployer || 0) + (p.wcifEmployer || 0) + (p.necEmployer || 0);

      const cells = [
        emp.employeeCode || '—',
        `${emp.firstName || ''} ${emp.lastName || ''}`,
        emp.position || '—',
        fmtN(p.basicSalaryApplied || emp.baseRate),
        fmtN(allowBen),
        fmtN(p.gross),
        fmtN(p.paye),
        fmtN(p.aidsLevy),
        fmtN(p.nssaEmployee),
        fmtN(p.pensionActual || p.pensionApplied || 0),
        fmtN(p.loanDeductions),
        fmtN(p.otherDeductionsActual || 0),
        fmtN(p.netPay),
        fmtN(p.nssaEmployer),
        fmtN(p.zimdefEmployer),
        fmtN(p.necEmployer),
        fmtN(ctc),
      ];

      let cx = 25;
      cells.forEach((val, ci) => {
        const col = cols[ci];
        const font = (ci === 5 || ci === 12 || ci === 16) ? 'Helvetica-Bold' : 'Helvetica';
        doc.font(font).fontSize(8.5).fillColor('#1e293b').text(val, cx, currentY + 5, { width: col.w - 10, align: col.align });
        cx += col.w;
      });

      // Accumulate
      [groupTotals, grandTotals].forEach(t => {
        t.gross += p.gross || 0;
        t.paye += p.paye || 0;
        t.aids += p.aidsLevy || 0;
        t.nssaE += p.nssaEmployee || 0;
        t.nssaR += p.nssaEmployer || 0;
        t.net += p.netPay || 0;
        t.necE += p.necLevy || 0;
        t.necR += p.necEmployer || 0;
        t.zimdef += p.zimdefEmployer || 0;
        t.ctc += ctc;
        t.otherDed = (t.otherDed || 0) + (p.otherDeductionsActual || 0);
        t.pension = (t.pension || 0) + (p.pensionActual || p.pensionApplied || 0);
      });

      currentY += ROW_H;
    });

    // Subtotal Row
    doc.rect(20, currentY, 1150, ROW_H).fill('#f1f5f9');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(`SUBTOTAL: ${group.name}`, 30, currentY + 5);

    // Display subtotals for main money columns
    const stCells = { 5: groupTotals.gross, 6: groupTotals.paye, 9: groupTotals.pension, 11: groupTotals.otherDed, 12: groupTotals.net, 16: groupTotals.ctc };
    let scx = 25;
    cols.forEach((col, ci) => {
      if (stCells[ci] !== undefined) {
        doc.text(fmtN(stCells[ci]), scx, currentY + 5, { width: col.w - 10, align: col.align });
      }
      scx += col.w;
    });
    currentY += ROW_H + 4;
  });

  // Grand Total Section
  doc.moveDown(1);
  const footerY = currentY + 10;
  doc.rect(20, footerY, 1150, 30).fill('#cbd5e1');
  doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text('GRAND TOTALS', 30, footerY + 10);

  let gcx = 25;
  const gtCells = { 5: grandTotals.gross, 6: grandTotals.paye, 8: grandTotals.nssaE, 9: grandTotals.pension, 11: grandTotals.otherDed, 12: grandTotals.net, 14: grandTotals.zimdef, 16: grandTotals.ctc };
  cols.forEach((col, ci) => {
    if (gtCells[ci] !== undefined) {
      doc.text(fmtN(gtCells[ci]), gcx, footerY + 10, { width: col.w - 10, align: col.align });
    }
    gcx += col.w;
  });

  doc.end();
};


/**
 * Generates a "Payslip Summary" report matching the user's reference image.
 * Vertical block-style per employee, grouped by department.
 */
/**
 * Internal: shared logic to draw the Payslip Summary report.
 */
function _drawPayslipSummary(doc, data) {
  const { companyName, period, groups = [], date = new Date().toLocaleDateString(), time = new Date().toLocaleTimeString() } = data;

  // ── Layout constants (fixed — prevents all column overlaps) ───────────────
  const LEFT = 30, RIGHT = 565, WIDTH = RIGHT - LEFT;
  const PAGE_WIDTH = 595.28;

  // Fixed column grid: three sections each with description + right-aligned amount
  // Section 1 — Earnings (width 185px)
  const E_DESC_X = LEFT + 5;   const E_DESC_W = 120; // description
  const E_AMT_X  = LEFT + 125; const E_AMT_W  = 55;  // amount, right-aligned
  // Section 2 — Deductions (width 185px, starts at LEFT+185)
  const D_DESC_X = LEFT + 190; const D_DESC_W = 130; // description (min 130px covers long labels)
  const D_AMT_X  = LEFT + 320; const D_AMT_W  = 55;  // amount, right-aligned
  // Section 3 — Employer Contributions (width 165px, starts at LEFT+375)
  const R_DESC_X = LEFT + 380; const R_DESC_W = 95;  // description
  const R_AMT_X  = LEFT + 475; const R_AMT_W  = 90;  // amount, right-aligned (reaches RIGHT=565)

  // Page safety: drawBantuFooter paints at doc.page.height - 60 (≈782 for A4).
  // Content must stop at SAFE_BOTTOM to leave clearance above the footer line.
  const FOOTER_Y    = 841.89 - 60; // matches drawBantuFooter's anchor
  const SAFE_BOTTOM = FOOTER_Y - 45;

  const DARK_NAVY   = '#1a2e4a';
  const BANTU_GREEN = '#B2DB64';
  const BORDER_COLOR = '#e2e8f0';
  const BLUE  = '#1a2e4a';
  const GREY  = '#64748b';
  const GREEN = '#059669';

  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Normalize long statutory labels to their canonical short form ─────────
  // Handles: "Workers' Compensation Insurance Fund", "Workmen's Compensation",
  //          "Workers Comp", "WCIF Employer", "WCF Employer" etc.
  const normalizeLabel = (name) => {
    if (!name) return '';
    const l = name.toLowerCase();
    const isWcif = l.includes('wcif') || l.includes('workers') ||
                   l.includes('workmen') || l.includes('compensation insurance');
    if (isWcif) {
      // Preserve any parenthetical rate already in the original name, e.g. "(1.25%)"
      const rateMatch = name.match(/\(\s*[\d.]+\s*%\s*\)/);
      return rateMatch ? `WCIF ${rateMatch[0]}` : 'WCIF (1.25%)';
    }
    return name;
  };

  // ── Page header (redrawn on every page) ───────────────────────────────────
  const drawHeader = () => {
    doc.rect(0, 0, PAGE_WIDTH, 110).fill(DARK_NAVY);
    drawPlatformLogo(doc, LEFT, 30, 45);

    doc.fillColor('white').font('Helvetica-Bold').fontSize(24)
      .text('PAYSLIP SUMMARY', RIGHT - 200, 35, { width: 200, align: 'right' });
    doc.fillColor(BANTU_GREEN).font('Helvetica-Bold').fontSize(16)
      .text((companyName || '').toUpperCase(), LEFT + 60, 40);
    doc.fillColor('white').font('Helvetica').fontSize(9)
      .text(`Period: ${period}`, LEFT + 60, 60)
      .text(`Date: ${date}   Time: ${time}`, LEFT + 60, 74);

    // Column header band — mirrors fixed grid above
    const hdrY = 125;
    doc.rect(LEFT, hdrY, WIDTH, 20).fill(DARK_NAVY);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8.5);
    doc.text('EARNINGS',          E_DESC_X, hdrY + 5);
    doc.text('AMOUNT',            E_AMT_X,  hdrY + 5, { width: E_AMT_W, align: 'right' });
    doc.text('DEDUCTIONS',        D_DESC_X, hdrY + 5);
    doc.text('AMOUNT',            D_AMT_X,  hdrY + 5, { width: D_AMT_W, align: 'right' });
    doc.text('EMPLOYER CONTRIB.', R_DESC_X, hdrY + 5);
    doc.text('AMOUNT',            R_AMT_X,  hdrY + 5, { width: R_AMT_W, align: 'right' });

    doc.lineWidth(0.5).strokeColor(BORDER_COLOR)
      .moveTo(LEFT, hdrY + 20).lineTo(RIGHT, hdrY + 20).stroke();

    return hdrY + 28;
  };

  // ── Page-break helper ─────────────────────────────────────────────────────
  const breakPage = () => {
    drawBantuFooter(doc);  // stamp universal footer on the page being left
    doc.addPage();
    return drawHeader();   // returns new y start
  };

  let y = drawHeader();

  let grandTotalEarnings = 0, grandTotalDeductions = 0;
  let grandTotalEmployer = 0, grandTotalNetPay = 0;

  groups.forEach(group => {
    // Keep department label + at least one employee block together
    if (y + 60 > SAFE_BOTTOM) y = breakPage();

    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10)
      .text((group.name || 'General').toUpperCase(), LEFT, y);
    y += 18;

    let groupTotalEarnings = 0, groupTotalDeductions = 0;
    let groupTotalEmployer = 0, groupTotalNetPay = 0;

    group.payslips.forEach(p => {
      const emp = p.employee || {};
      const lines = p.displayLines || [];

      const earnings   = lines.filter(l => (l.allowance || 0) > 0);
      const deductions = lines.filter(l => (l.deduction || 0) > 0);
      const employers  = lines.filter(l => (l.employer  || 0) > 0);
      const maxRows    = Math.max(earnings.length, deductions.length, employers.length);

      // Estimate full block height before painting — prevents mid-block page splits
      // name(12) + rows(maxRows×11) + underline(6) + subtotal-row(12) + net-pay(14) + gap(30)
      const blockH = 12 + maxRows * 11 + 62;
      if (y + blockH > SAFE_BOTTOM) y = breakPage();

      // Employee name — constrained to prevent wrapping into data rows
      doc.font('Helvetica-Bold').fontSize(8).fillColor(BLUE);
      doc.text(
        `${emp.employeeCode || ''}  ${(emp.lastName || '').toUpperCase()}, ${emp.firstName || ''}`,
        LEFT, y, { width: WIDTH, lineBreak: false }
      );
      y += 12;

      // Data rows — fixed column positions, no substring truncation needed
      doc.font('Helvetica').fontSize(8).fillColor(BLUE);
      for (let i = 0; i < maxRows; i++) {
        const e = earnings[i]   || {};
        const d = deductions[i] || {};
        const r = employers[i]  || {};

        if (e.name) {
          doc.fillColor(BLUE).font('Helvetica').fontSize(8)
            .text(e.name, E_DESC_X, y, { width: E_DESC_W, lineBreak: false });
          doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
            .text(fmt(e.allowance), E_AMT_X, y, { width: E_AMT_W, align: 'right' });
        }
        if (d.name) {
          doc.fillColor(BLUE).font('Helvetica').fontSize(8)
            .text(normalizeLabel(d.name), D_DESC_X, y, { width: D_DESC_W, lineBreak: false });
          doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
            .text(fmt(d.deduction), D_AMT_X, y, { width: D_AMT_W, align: 'right' });
        }
        if (r.name) {
          doc.fillColor(GREY).font('Helvetica').fontSize(7.5)
            .text(normalizeLabel(r.name), R_DESC_X, y, { width: R_DESC_W, lineBreak: false });
          doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
            .text(fmt(r.employer), R_AMT_X, y, { width: R_AMT_W, align: 'right' });
        }
        y += 11;
      }

      // Underlines above column totals
      y += 3;
      doc.lineWidth(0.5).strokeColor(GREY);
      doc.moveTo(E_AMT_X, y).lineTo(E_AMT_X + E_AMT_W, y).stroke();
      doc.moveTo(D_AMT_X, y).lineTo(D_AMT_X + D_AMT_W, y).stroke();
      doc.moveTo(R_AMT_X, y).lineTo(R_AMT_X + R_AMT_W, y).stroke();
      y += 3;

      const totalAllow = earnings.reduce((s, e) => s + (e.allowance || 0), 0);
      const totalDed   = deductions.reduce((s, d) => s + (d.deduction || 0), 0);
      const totalEmpr  = employers.reduce((s, r) => s + (r.employer  || 0), 0);
      const netPay     = p.netPay || (totalAllow - totalDed);

      // Column totals — all right-aligned
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8);
      doc.text(fmt(totalAllow), E_AMT_X, y, { width: E_AMT_W, align: 'right' });
      doc.text(fmt(totalDed),   D_AMT_X, y, { width: D_AMT_W, align: 'right' });
      doc.text(fmt(totalEmpr),  R_AMT_X, y, { width: R_AMT_W, align: 'right' });
      y += 14;

      // Net pay — right-aligned in the same columns
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(8)
        .text('NET PAY:', D_AMT_X - 60, y, { width: 60, align: 'right' });
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
        .text(`${p.currency || 'USD'} ${fmt(netPay)}`, R_AMT_X, y, { width: R_AMT_W, align: 'right' });
      doc.fillColor(BLUE);

      groupTotalEarnings   += totalAllow;
      groupTotalDeductions += totalDed;
      groupTotalEmployer   += totalEmpr;
      groupTotalNetPay     += netPay;

      y += 30; // 30px padding between employee blocks prevents overlap
      doc.moveTo(LEFT, y - 10).lineTo(RIGHT, y - 10).lineWidth(0.3).strokeColor(BORDER_COLOR).stroke();
    });

    // Group subtotal — kept together (page-break-inside: avoid equivalent)
    if (y + 26 > SAFE_BOTTOM) y = breakPage();
    doc.rect(LEFT, y - 2, WIDTH, 18).fill('#f1f5f9');
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8.5);
    doc.text(`SUBTOTAL: ${(group.name || 'General').toUpperCase()}`, LEFT + 5, y + 1);
    doc.text(fmt(groupTotalEarnings),   E_AMT_X, y + 1, { width: E_AMT_W, align: 'right' });
    doc.text(fmt(groupTotalDeductions), D_AMT_X, y + 1, { width: D_AMT_W, align: 'right' });
    doc.text(fmt(groupTotalNetPay),     R_AMT_X, y + 1, { width: R_AMT_W, align: 'right' });
    y += 26;

    grandTotalEarnings   += groupTotalEarnings;
    grandTotalDeductions += groupTotalDeductions;
    grandTotalEmployer   += groupTotalEmployer;
    grandTotalNetPay     += groupTotalNetPay;
  });

  // Grand totals — kept together (page-break-inside: avoid equivalent)
  if (y + 28 > SAFE_BOTTOM) y = breakPage();
  doc.rect(LEFT, y - 2, WIDTH, 22).fill(DARK_NAVY);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(10);
  const gtCcy = (groups[0]?.payslips[0]?.currency) || 'USD';
  doc.text('GRAND TOTALS',                              LEFT + 5,  y + 3);
  doc.text(`${gtCcy} ${fmt(grandTotalEarnings)}`,   E_AMT_X, y + 3, { width: E_AMT_W, align: 'right' });
  doc.text(`${gtCcy} ${fmt(grandTotalDeductions)}`, D_AMT_X, y + 3, { width: D_AMT_W, align: 'right' });
  doc.text(`${gtCcy} ${fmt(grandTotalNetPay)}`,     R_AMT_X, y + 3, { width: R_AMT_W, align: 'right' });

  // Universal footer — always at doc.page.height - 60, never on a new page
  drawBantuFooter(doc);
}

const generatePayslipSummaryPDF = (data, res) => {
  const doc = new PDFDocument({ margin: 0, size: 'A4' });
  doc.pipe(res);
  _drawPayslipSummary(doc, data);
  doc.end();
};

const generatePayslipSummaryBuffer = (data) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    _drawPayslipSummary(doc, data);
    doc.end();
  });
};

module.exports = {
  generatePayslipPDF,
  _drawPayslip,
  generatePayrollSummaryPDF,
  generatePayslipSummaryPDF,
  generatePayslipSummaryBuffer,
  generatePayslipBuffer,
  generateP16PDF,
  generateNSSA_P4A,
  generateP2PDF,
  generateIT7PDF,
};
