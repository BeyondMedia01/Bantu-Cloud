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
  // ── Data integrity guard ──────────────────────────────────────────────────
  if (data.bankMissing) {
    throw Object.assign(
      new Error(`Bank details incomplete for ${data.employeeName || 'employee'}. ` +
                'Both Bank Name and Account Number must be set before generating a payslip.'),
      { code: 'BANK_DETAILS_MISSING' }
    );
  }

  // ── Utilities ─────────────────────────────────────────────────────────────
  const fmt  = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const usd  = (n) => `USD ${fmt(n)}`; // every amount is prefixed with USD

  // ── Colours ───────────────────────────────────────────────────────────────
  const BANTU_GREEN  = '#B2DB64';
  const DARK_NAVY    = '#1a2e4a';
  const TEXT_DARK    = '#1e293b';
  const TEXT_MUTED   = '#64748b';
  const BG_LIGHT     = '#f8fafc';
  const BORDER_COLOR = '#e2e8f0';

  // ── Layout constants ──────────────────────────────────────────────────────
  const LEFT      = 40;
  const PAGE_W    = 595.28;
  const RIGHT     = PAGE_W - 40;
  const CONTENT_W = RIGHT - LEFT;           // 515pt
  const MID       = LEFT + CONTENT_W / 2;   // 297.5pt
  const GAP       = 8;                       // gap between table halves
  const HALF_W    = Math.floor((CONTENT_W - GAP) / 2); // 253pt per half
  const R_START   = LEFT + HALF_W + GAP;    // right table x-origin

  // Table sub-grid — same proportions for both halves AND employer section.
  // Every amount lives in a fixed 80pt bounding box, right-aligned.
  const T_PAD   = 8;   // inner left padding
  const T_AMT_W = 80;  // fixed amount column (user spec)
  const T_YTD_W = 65;  // fixed YTD column
  const T_DESC_W = HALF_W - T_PAD - T_AMT_W - T_YTD_W; // 100pt

  // Employer section (full-width) aligns its right edges to the table above
  const EMP_YTD_X  = RIGHT - T_YTD_W;
  const EMP_AMT_X  = EMP_YTD_X - T_AMT_W;
  const EMP_DESC_W = EMP_AMT_X - LEFT - T_PAD;

  const ROW_H  = 16;  // data row height
  const HDR_H  = 32;  // two-line table header (title + sub-headers)

  // ── Section 1: Identity Header ────────────────────────────────────────────
  // Navy bar with logo, company, period, PAYSLIP title, and leave entitlement
  const HEADER_H = 108;
  doc.rect(0, 0, PAGE_W, HEADER_H).fill(DARK_NAVY);
  drawPlatformLogo(doc, LEFT, 28, 42);

  // PAYSLIP label — top right
  doc.fillColor('white').font('Helvetica-Bold').fontSize(20)
    .text('PAYSLIP', RIGHT - 130, 30, { width: 130, align: 'right' });

  // Company + period — next to logo
  doc.fillColor(BANTU_GREEN).font('Helvetica-Bold').fontSize(14)
    .text((data.companyName || '').toUpperCase(), LEFT + 55, 30, { width: MID - LEFT - 55, lineBreak: false });
  doc.fillColor('white').font('Helvetica').fontSize(9)
    .text(`Period: ${data.period}`, LEFT + 55, 50);
  doc.fillColor(BANTU_GREEN).font('Helvetica').fontSize(8)
    .text(`Issued: ${data.issuedDate || new Date().toLocaleDateString('en-GB')}`, LEFT + 55, 64);

  // Annual Leave Balance — shaded entitlement box, top-right of header
  const LV_BOX_W = 130;
  const LV_BOX_H = 42;
  const LV_BOX_X = RIGHT - LV_BOX_W;
  const LV_BOX_Y = HEADER_H - LV_BOX_H - 8;
  doc.roundedRect(LV_BOX_X, LV_BOX_Y, LV_BOX_W, LV_BOX_H, 4).fill('rgba(255,255,255,0.1)');
  doc.fillColor('rgba(255,255,255,0.65)').font('Helvetica-Bold').fontSize(6.5)
    .text('ANNUAL LEAVE BALANCE', LV_BOX_X + 8, LV_BOX_Y + 7);
  doc.fillColor(BANTU_GREEN).font('Helvetica-Bold').fontSize(15)
    .text(`${(data.leaveBalance || 0).toFixed(1)} days`, LV_BOX_X + 8, LV_BOX_Y + 18);
  if (data.leaveTaken > 0) {
    doc.fillColor('rgba(255,255,255,0.5)').font('Helvetica').fontSize(6.5)
      .text(`${data.leaveTaken.toFixed(1)} days taken YTD`, LV_BOX_X + 8, LV_BOX_Y + 34);
  }

  // ── Section 2: Employee & Job Details Card ────────────────────────────────
  let currY = HEADER_H + 6;
  const CARD_H = 80;
  doc.roundedRect(LEFT, currY, CONTENT_W, CARD_H, 5).fill(BG_LIGHT);
  doc.lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();

  const drawField = (label, value, x, y, w) => {
    doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(6.5).text(label.toUpperCase(), x, y);
    doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(9)
      .text(value || '—', x, y + 9, { width: w, lineBreak: false });
  };

  const CW = (CONTENT_W - 28) / 4;
  drawField('Employee Name', data.employeeName,  LEFT + 12, currY + 10, CW * 1.5);
  drawField('Employee Code', data.employeeCode,  LEFT + 12 + CW * 1.5, currY + 10, CW);
  drawField('ID Number',     data.nationalId,    LEFT + 12 + CW * 2.5, currY + 10, CW * 1.5);
  drawField('Department',    data.department,    LEFT + 12, currY + 46, CW);
  drawField('Position',      data.jobTitle,      LEFT + 12 + CW,       currY + 46, CW);
  drawField('Cost Centre',   data.costCenter,    LEFT + 12 + CW * 2,   currY + 46, CW);
  drawField('Pay Method',    data.paymentMethod, LEFT + 12 + CW * 3,   currY + 46, CW);

  // ── Section 3: Payment Destination Bar ───────────────────────────────────
  currY += CARD_H + 5;
  const BANK_H = 32;
  doc.rect(LEFT, currY, CONTENT_W, BANK_H).fill('#edf2f7');
  doc.lineWidth(0.5).strokeColor(BORDER_COLOR).stroke();
  drawField('Bank Name',      data.bankName,      LEFT + 12, currY + 5,  MID - LEFT - 24);
  drawField('Account Number', data.accountNumber, MID  + 12, currY + 5,  RIGHT - MID - 12);

  // ── Section 4: Side-by-Side Financial Tables ──────────────────────────────
  currY += BANK_H + 6;

  const lineItems    = data.lineItems || [];
  const earnings     = lineItems.filter(i => i.allowance > 0);
  const deductions   = lineItems.filter(i => i.deduction > 0);
  const employers    = lineItems.filter(i => i.employer  > 0);

  /**
   * Draws one independent table (earnings or deductions side).
   * Returns the Y-coordinate immediately below the last row.
   */
  const drawTable = (xStart, tableTop, title, titleColor, rows, getAmt, getYtd) => {
    // Header bar (2 lines: title + sub-headers)
    doc.rect(xStart, tableTop, HALF_W, HDR_H).fill(DARK_NAVY);
    doc.fillColor(titleColor).font('Helvetica-Bold').fontSize(9)
      .text(title, xStart + T_PAD, tableTop + 5);
    doc.fillColor('rgba(255,255,255,0.55)').font('Helvetica').fontSize(6.5);
    doc.text('DESCRIPTION',  xStart + T_PAD,                     tableTop + 20, { width: T_DESC_W });
    doc.text('AMOUNT (USD)', xStart + T_PAD + T_DESC_W,          tableTop + 20, { width: T_AMT_W, align: 'right' });
    doc.text('YTD (USD)',    xStart + T_PAD + T_DESC_W + T_AMT_W, tableTop + 20, { width: T_YTD_W, align: 'right' });

    // Data rows — each in its own bounded strip
    rows.forEach((item, idx) => {
      const rowY = tableTop + HDR_H + idx * ROW_H;
      if (idx % 2 === 0) doc.rect(xStart, rowY, HALF_W, ROW_H).fill('#f7f9fc');

      const textY = rowY + 4;
      const amt   = getAmt(item);
      const ytd   = getYtd(item);
      const nameY = item.description ? textY - 1 : textY;

      doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(8)
        .text(item.name, xStart + T_PAD, nameY, { width: T_DESC_W, lineBreak: false });
      if (item.description) {
        doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(6.5)
          .text(item.description, xStart + T_PAD, nameY + 8, { width: T_DESC_W, lineBreak: false });
      }
      // Amount in fixed 80pt box — right-aligned, USD prefix
      doc.fillColor(DARK_NAVY).font('Helvetica-Bold').fontSize(8)
        .text(usd(amt), xStart + T_PAD + T_DESC_W, textY, { width: T_AMT_W, align: 'right' });
      // YTD in fixed 65pt box — right-aligned, USD prefix
      doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7.5)
        .text(usd(ytd ?? amt), xStart + T_PAD + T_DESC_W + T_AMT_W, textY, { width: T_YTD_W, align: 'right' });
    });

    return tableTop + HDR_H + rows.length * ROW_H;
  };

  const tableTop        = currY;
  const earningsBottom  = drawTable(LEFT,    tableTop, 'EARNINGS',   BANTU_GREEN, earnings,
    e => e.allowance, e => e.ytd);
  const deductionBottom = drawTable(R_START, tableTop, 'DEDUCTIONS', '#fb7185',   deductions,
    d => d.deduction, d => d.ytd);

  currY = Math.max(earningsBottom, deductionBottom);

  // ── Section 5: Dedicated Summary Box ─────────────────────────────────────
  // Single #f2f2f2 rectangle — never sits inside the deductions table.
  // Total Earnings and Total Deductions use the EXACT same x/width as the
  // AMOUNT (USD) column headers drawn by drawTable above.
  currY += 4;
  const SUM_H = 54;
  doc.rect(LEFT, currY, CONTENT_W, SUM_H).fill('#f2f2f2');

  // Earnings AMOUNT column — mirrors drawTable: xStart + T_PAD + T_DESC_W, w = T_AMT_W
  const E_SUM_X = LEFT    + T_PAD + T_DESC_W; // 148pt
  // Deductions AMOUNT column — same formula for R_START
  const D_SUM_X = R_START + T_PAD + T_DESC_W; // 409pt

  // Labels
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(6.5);
  doc.text('TOTAL EARNINGS',   LEFT    + T_PAD, currY + 10);
  doc.text('TOTAL DEDUCTIONS', R_START + T_PAD, currY + 10);

  // Amounts — forced to exact column x/width (no drift possible)
  doc.fillColor(DARK_NAVY).font('Helvetica-Bold').fontSize(10)
    .text(usd(data.grossPay),       E_SUM_X, currY + 22, { width: T_AMT_W, align: 'right' });
  doc.fillColor('#dc2626').font('Helvetica-Bold').fontSize(10)
    .text(usd(data.totalDeductions), D_SUM_X, currY + 22, { width: T_AMT_W, align: 'right' });

  // NET SALARY — bold anchor, right-aligned to page right edge
  const NET_LABEL_X = RIGHT - 150;
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(6.5)
    .text('NET SALARY', NET_LABEL_X, currY + 10, { width: 150 - T_PAD, align: 'right' });

  if (data.netPayUSD != null && data.netPayZIG != null) {
    doc.fillColor(DARK_NAVY).font('Helvetica-Bold').fontSize(11)
      .text(`USD ${fmt(data.netPayUSD)}`, NET_LABEL_X, currY + 22, { width: 150 - T_PAD, align: 'right' });
    doc.fillColor(TEXT_MUTED).font('Helvetica-Bold').fontSize(9)
      .text(`ZiG ${fmt(data.netPayZIG)}`, NET_LABEL_X, currY + 37, { width: 150 - T_PAD, align: 'right' });
  } else {
    doc.fillColor(DARK_NAVY).font('Helvetica-Bold').fontSize(14)
      .text(usd(data.netSalary), NET_LABEL_X, currY + 22, { width: 150 - T_PAD, align: 'right' });
  }

  currY += SUM_H;

  // ── Section 6: Statutory Employer Contributions ───────────────────────────
  // Same 3-column format (Description | Amount | YTD) as the main tables.
  // Right edges align with the deductions table's YTD column above.
  if (employers.length > 0) {
    currY += 6;

    // Section header
    doc.rect(LEFT, currY, CONTENT_W, HDR_H).fill('#1e3a5f'); // slightly lighter navy
    doc.fillColor('#a5b4fc').font('Helvetica-Bold').fontSize(8.5)
      .text('STATUTORY EMPLOYER CONTRIBUTIONS', LEFT + T_PAD, currY + 5);
    doc.fillColor('rgba(255,255,255,0.55)').font('Helvetica').fontSize(6.5);
    doc.text('DESCRIPTION',  LEFT + T_PAD, currY + 20, { width: EMP_DESC_W });
    doc.text('AMOUNT (USD)', EMP_AMT_X,    currY + 20, { width: T_AMT_W,  align: 'right' });
    doc.text('YTD (USD)',    EMP_YTD_X,    currY + 20, { width: T_YTD_W,  align: 'right' });
    currY += HDR_H;

    employers.forEach((c, idx) => {
      const rowY = currY + idx * ROW_H;
      if (idx % 2 === 0) doc.rect(LEFT, rowY, CONTENT_W, ROW_H).fill('#f0f4ff');

      const textY = rowY + 4;
      doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(8)
        .text(c.name, LEFT + T_PAD, textY, { width: EMP_DESC_W, lineBreak: false });
      doc.fillColor('#3730a3').font('Helvetica-Bold').fontSize(8)
        .text(usd(c.employer), EMP_AMT_X, textY, { width: T_AMT_W, align: 'right' });
      if (c.ytd != null) {
        doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7.5)
          .text(usd(c.ytd), EMP_YTD_X, textY, { width: T_YTD_W, align: 'right' });
      }
    });
  }

  // ── Section 7: Universal Bantu Footer ─────────────────────────────────────
  // Always anchored at doc.page.height - 60; never triggers a blank page 2.
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
  const {
    companyName,
    period,
    groups = [],
    date = new Date().toLocaleDateString('en-GB'),
    time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
  } = data;

  // ── Layout constants ────────────────────────────────────────────────────────
  const PAGE_W  = 595.28;
  const LEFT    = 30;
  const RIGHT   = PAGE_W - 30;   // 565
  const WIDTH   = RIGHT - LEFT;  // 535

  // Three-section fixed grid — 70pt amount boxes prevent any overlap
  // Section 1: Earnings  (35 → 220)
  const E_DESC_X = LEFT + 5;   const E_DESC_W = 115; // 35–150
  const E_AMT_X  = LEFT + 150; const E_AMT_W  = 70;  // 180–220 (right edge 220)
  // Section 2: Deductions (225 → 425)
  const D_DESC_X = LEFT + 195; const D_DESC_W = 125; // 225–350
  const D_AMT_X  = LEFT + 355; const D_AMT_W  = 70;  // 385–425 (right edge 425)
  // Section 3: Employer Contributions (430 → 565)
  const R_DESC_X = LEFT + 400; const R_DESC_W = 65;  // 430–495
  const R_AMT_X  = LEFT + 495; const R_AMT_W  = 70;  // 525–565 (right edge 565)

  // Vertical safety — drawBantuFooter anchors at page.height - 60 ≈ 781.89
  // Leave 45pt clearance above the footer rule line
  const FOOTER_Y    = 841.89 - 60;
  const SAFE_BOTTOM = FOOTER_Y - 45;

  const DARK_NAVY    = '#1a2e4a';
  const BANTU_GREEN  = '#B2DB64';
  const BORDER_COLOR = '#e2e8f0';
  const BLUE         = '#1a2e4a';
  const GREY         = '#64748b';
  const GREEN        = '#059669';

  const fmt = (n) =>
    Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Collapse verbose statutory labels to compact canonical forms
  const normalizeLabel = (name) => {
    if (!name) return '';
    const l = name.toLowerCase();
    if (
      l.includes('wcif') || l.includes('workers') ||
      l.includes('workmen') || l.includes('compensation insurance')
    ) {
      const rateMatch = name.match(/\(\s*[\d.]+\s*%\s*\)/);
      return rateMatch ? `WCIF ${rateMatch[0]}` : 'WCIF (1.25%)';
    }
    return name;
  };

  // ── Page header — redrawn on every page ────────────────────────────────────
  const drawHeader = () => {
    const HDR_H = 105;
    doc.rect(0, 0, PAGE_W, HDR_H).fill(DARK_NAVY);

    // Logo (left)
    drawPlatformLogo(doc, LEFT, 28, 42);

    // Company / period / timestamp (below logo, left)
    doc.fillColor(BANTU_GREEN).font('Helvetica-Bold').fontSize(15)
      .text((companyName || '').toUpperCase(), LEFT + 55, 36, { width: 220, lineBreak: false });
    doc.fillColor('white').font('Helvetica').fontSize(8.5)
      .text(`Period: ${period}`, LEFT + 55, 56)
      .text(`Generated: ${date}  ${time}`, LEFT + 55, 69);

    // Report title (right)
    doc.fillColor('white').font('Helvetica-Bold').fontSize(22)
      .text('PAYROLL SUMMARY', RIGHT - 210, 38, { width: 210, align: 'right' });

    // Column header band
    const hdrY = HDR_H + 12;
    doc.rect(LEFT, hdrY, WIDTH, 20).fill(DARK_NAVY);
    doc.fillColor('white').font('Helvetica-Bold').fontSize(8);
    doc.text('EARNINGS',          E_DESC_X, hdrY + 6, { width: E_DESC_W, lineBreak: false });
    doc.text('AMOUNT',            E_AMT_X,  hdrY + 6, { width: E_AMT_W,  align: 'right' });
    doc.text('DEDUCTIONS',        D_DESC_X, hdrY + 6, { width: D_DESC_W, lineBreak: false });
    doc.text('AMOUNT',            D_AMT_X,  hdrY + 6, { width: D_AMT_W,  align: 'right' });
    doc.text('EMPLOYER CONTRIB.', R_DESC_X, hdrY + 6, { width: R_DESC_W, lineBreak: false });
    doc.text('AMOUNT',            R_AMT_X,  hdrY + 6, { width: R_AMT_W,  align: 'right' });

    doc.lineWidth(0.4).strokeColor(BORDER_COLOR)
      .moveTo(LEFT, hdrY + 20).lineTo(RIGHT, hdrY + 20).stroke();

    return hdrY + 26; // first content y
  };

  // ── Page-break helper ───────────────────────────────────────────────────────
  const breakPage = () => {
    drawBantuFooter(doc);
    doc.addPage();
    return drawHeader();
  };

  let y = drawHeader();

  let grandTotalEarnings = 0, grandTotalDeductions = 0;
  let grandTotalEmployer = 0, grandTotalNetPay = 0;

  groups.forEach(group => {
    // Keep department label + at least first employee together
    if (y + 60 > SAFE_BOTTOM) y = breakPage();

    // Department / group label
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(9.5)
      .text((group.name || 'General').toUpperCase(), LEFT, y);
    y += 16;

    let groupTotalEarnings = 0, groupTotalDeductions = 0;
    let groupTotalEmployer = 0, groupTotalNetPay = 0;

    group.payslips.forEach(p => {
      const emp  = p.employee || {};
      const lines = p.displayLines || [];

      const earnings   = lines.filter(l => (l.allowance ?? 0) > 0);
      const deductions = lines.filter(l => (l.deduction  ?? 0) > 0);
      const employers  = lines.filter(l => (l.employer   ?? 0) > 0);
      const maxRows    = Math.max(earnings.length, deductions.length, employers.length, 1);

      // Pre-estimate block height to prevent mid-block page splits:
      // name(13) + rows(maxRows×11) + underline(8) + column-totals(12) + net-pay(16) + gap(20)
      const blockH = 13 + maxRows * 11 + 56;
      if (y + blockH > SAFE_BOTTOM) y = breakPage();

      // ── Employee name row ─────────────────────────────────────────────────
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8)
        .text(
          `${emp.employeeCode || ''}  ${(emp.lastName || '').toUpperCase()}, ${emp.firstName || ''}`,
          LEFT, y, { width: WIDTH, lineBreak: false }
        );
      y += 13;

      // ── Data rows — three-column grid ─────────────────────────────────────
      for (let i = 0; i < maxRows; i++) {
        const e = earnings[i]   || {};
        const d = deductions[i] || {};
        const r = employers[i]  || {};

        if (e.name) {
          doc.fillColor(BLUE).font('Helvetica').fontSize(7.5)
            .text(e.name, E_DESC_X, y, { width: E_DESC_W, lineBreak: false });
          doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(7.5)
            .text(fmt(e.allowance), E_AMT_X, y, { width: E_AMT_W, align: 'right' });
        }
        if (d.name) {
          doc.fillColor(BLUE).font('Helvetica').fontSize(7.5)
            .text(normalizeLabel(d.name), D_DESC_X, y, { width: D_DESC_W, lineBreak: false });
          doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(7.5)
            .text(fmt(d.deduction), D_AMT_X, y, { width: D_AMT_W, align: 'right' });
        }
        if (r.name) {
          doc.fillColor(GREY).font('Helvetica').fontSize(7.5)
            .text(normalizeLabel(r.name), R_DESC_X, y, { width: R_DESC_W, lineBreak: false });
          doc.fillColor(GREY).font('Helvetica-Bold').fontSize(7.5)
            .text(fmt(r.employer), R_AMT_X, y, { width: R_AMT_W, align: 'right' });
        }
        y += 11;
      }

      // ── Underlines above column totals ────────────────────────────────────
      y += 3;
      doc.lineWidth(0.4).strokeColor(GREY);
      doc.moveTo(E_AMT_X, y).lineTo(E_AMT_X + E_AMT_W, y).stroke();
      doc.moveTo(D_AMT_X, y).lineTo(D_AMT_X + D_AMT_W, y).stroke();
      doc.moveTo(R_AMT_X, y).lineTo(R_AMT_X + R_AMT_W, y).stroke();
      y += 5;

      const totalAllow = earnings.reduce((s, e) => s + (e.allowance ?? 0), 0);
      const totalDed   = deductions.reduce((s, d) => s + (d.deduction ?? 0), 0);
      const totalEmpr  = employers.reduce((s, r) => s + (r.employer  ?? 0), 0);
      const netPay     = p.netPay ?? (totalAllow - totalDed);
      const ccy        = p.currency || 'USD';

      // ── Column totals ─────────────────────────────────────────────────────
      doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(7.5);
      doc.text(fmt(totalAllow), E_AMT_X, y, { width: E_AMT_W, align: 'right' });
      doc.text(fmt(totalDed),   D_AMT_X, y, { width: D_AMT_W, align: 'right' });
      doc.text(fmt(totalEmpr),  R_AMT_X, y, { width: R_AMT_W, align: 'right' });
      y += 12;

      // ── NET PAY — bold anchor for this employee block ─────────────────────
      doc.fillColor(GREEN).font('Helvetica-Bold').fontSize(8.5)
        .text('NET PAY', D_AMT_X - 55, y, { width: 55, align: 'right' });
      doc.fillColor(DARK_NAVY).font('Helvetica-Bold').fontSize(8.5)
        .text(`${ccy} ${fmt(netPay)}`, R_AMT_X, y, { width: R_AMT_W, align: 'right' });

      groupTotalEarnings   += totalAllow;
      groupTotalDeductions += totalDed;
      groupTotalEmployer   += totalEmpr;
      groupTotalNetPay     += netPay;

      y += 20; // 20pt inter-employee padding
      doc.lineWidth(0.3).strokeColor(BORDER_COLOR)
        .moveTo(LEFT, y - 5).lineTo(RIGHT, y - 5).stroke();
    });

    // ── Group subtotal ────────────────────────────────────────────────────────
    if (y + 24 > SAFE_BOTTOM) y = breakPage();
    doc.rect(LEFT, y - 2, WIDTH, 18).fill('#f1f5f9');
    doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(8);
    doc.text(`SUBTOTAL — ${(group.name || 'General').toUpperCase()}`, LEFT + 5, y + 2, { width: 200, lineBreak: false });
    doc.text(fmt(groupTotalEarnings),   E_AMT_X, y + 2, { width: E_AMT_W, align: 'right' });
    doc.text(fmt(groupTotalDeductions), D_AMT_X, y + 2, { width: D_AMT_W, align: 'right' });
    doc.text(fmt(groupTotalNetPay),     R_AMT_X, y + 2, { width: R_AMT_W, align: 'right' });
    y += 26;

    grandTotalEarnings   += groupTotalEarnings;
    grandTotalDeductions += groupTotalDeductions;
    grandTotalEmployer   += groupTotalEmployer;
    grandTotalNetPay     += groupTotalNetPay;
  });

  // ── Grand Totals — full-width audit anchor ──────────────────────────────────
  if (y + 30 > SAFE_BOTTOM) y = breakPage();
  const gtCcy = (groups[0]?.payslips[0]?.currency) || 'USD';
  doc.rect(LEFT, y - 2, WIDTH, 24).fill(DARK_NAVY);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(9.5);
  doc.text('GRAND TOTALS', LEFT + 5, y + 4, { width: 180, lineBreak: false });
  doc.text(`${gtCcy} ${fmt(grandTotalEarnings)}`,   E_AMT_X, y + 4, { width: E_AMT_W, align: 'right' });
  doc.text(`${gtCcy} ${fmt(grandTotalDeductions)}`, D_AMT_X, y + 4, { width: D_AMT_W, align: 'right' });
  doc.text(`${gtCcy} ${fmt(grandTotalNetPay)}`,     R_AMT_X, y + 4, { width: R_AMT_W, align: 'right' });

  // Universal footer — fixed to page bottom, never causes a new page
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
