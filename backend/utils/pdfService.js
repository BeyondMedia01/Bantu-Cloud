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
    "M469.899 404.083L401.664 364.643C317.944 316.25 317.944 195.509 401.422 147.115L469.657 107.675L511.759 180.507L414.489 236.885C399.971 245.354 399.971 266.405 414.489 274.873L512.001 331.01L469.899 404.083Z",
    "M256.002 304.151C282.996 304.151 304.879 282.268 304.879 255.274C304.879 228.28 282.996 206.397 256.002 206.397C229.008 206.397 207.125 228.28 207.125 255.274C207.125 282.268 229.008 304.151 256.002 304.151Z"
  ];
  doc.save();
  doc.translate(x, y).scale(scale);
  paths.forEach(p => doc.path(p).fill("#B2DB64"));
  doc.restore();
}

function _drawPayslip(doc, data) {
  const ccy = data.currency || 'USD';
  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const LEFT = 40;
  const PAGE_WIDTH = 555;
  const RIGHT = PAGE_WIDTH - 40;
  const TABLE_W = RIGHT - LEFT;
  let ROW_H = 16;
  const BLUE = '#1a2e4a';
  const TEXT_DARK = '#1e293b';
  const TEXT_MUTED = '#64748b';
  const LIGHT_GRAY = '#f8fafc';

  // ── Condensed Header ──────────────────────────────────────────────────────
  doc.rect(0, 0, PAGE_WIDTH, 85).fill(BLUE);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(20).text('PAYSLIP', LEFT, 25);
  doc.fontSize(11).text(data.companyName, LEFT, 50);
  doc.font('Helvetica').fontSize(9).text(`Pay Period: ${data.period}`, LEFT, 65);

  // ── Optimized Employee Info section ────────────────────────────────────────
  doc.y = 100;
  const infoData = [
    { label: 'Name', value: data.employeeName },
    { label: 'Code', value: data.employeeCode || '—' },
    { label: 'Position', value: data.jobTitle || '—' },
    { label: 'National ID', value: data.nationalId || '—' },
    { label: 'Currency', value: ccy },
    { label: 'Pay Date', value: new Date().toLocaleDateString() },
  ];

  const infoCols = 3;
  const infoColW = TABLE_W / infoCols;
  let startY = doc.y;

  infoData.forEach((item, index) => {
    const col = index % infoCols;
    const row = Math.floor(index / infoCols);
    const x = LEFT + (col * infoColW);
    const y = startY + (row * 30);
    doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7).text(item.label.toUpperCase(), x, y);
    doc.fillColor(TEXT_DARK).font('Helvetica-Bold').fontSize(9).text(item.value, x, y + 10);
  });

  doc.y = startY + 65;

  // ── Professional Table Layout ──────────────────────────────────────────────
  const cols = [
    { label: 'Description', w: 175, align: 'left' },
    { label: 'Allowances', w: 75, align: 'right' },
    { label: 'Deductions', w: 75, align: 'right' },
    { label: 'Company Cont.', w: 75, align: 'right' },
    { label: 'YTD Amount', w: 75, align: 'right' },
  ];

  // Table Header
  const headerY = doc.y;
  doc.rect(LEFT, headerY, TABLE_W, 20).fill(BLUE);
  let cx = LEFT + 5;
  doc.fillColor('white').font('Helvetica-Bold').fontSize(8);
  cols.forEach(c => {
    doc.text(c.label.toUpperCase(), cx, headerY + 6, { width: c.w - 10, align: c.align });
    cx += c.w;
  });

  // ── Dynamic Scaling to fit 1 page ─────────────────────────────────────────
  const maxTableHeight = 520; // 780 (footer) - 260 (header/info/summary/overhead)
  const numItems = (data.lineItems || []).length;
  let dynamicFontSize = 8.5;

  // If table is too long for 1 page, scale down
  if (numItems * ROW_H > maxTableHeight) {
    ROW_H = Math.max(8.5, Math.floor(maxTableHeight / Math.max(1, numItems)));
    dynamicFontSize = Math.max(4.5, (ROW_H / 16) * 8.5);
  }

  doc.y = headerY + 20;
  doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(dynamicFontSize);

  // Table Rows
  (data.lineItems || []).forEach((item, i) => {
    // No addPage() here - strictly 1 page for individual payslips.
    if (i % 2 === 0) doc.rect(LEFT, doc.y, TABLE_W, ROW_H).fill(LIGHT_GRAY).fillColor(TEXT_DARK);
    
    let rx = LEFT + 5;
    doc.text(item.name, rx, doc.y + (ROW_H * 0.2), { width: cols[0].w - 10 });
    rx += cols[0].w;
    doc.font('Helvetica-Bold');
    doc.text(item.allowance > 0 ? fmt(item.allowance) : '', rx, doc.y + (ROW_H * 0.2), { width: cols[1].w - 10, align: 'right' });
    rx += cols[1].w;
    doc.fillColor('#e11d48');
    doc.text(item.deduction > 0 ? fmt(item.deduction) : '', rx, doc.y + (ROW_H * 0.2), { width: cols[2].w - 10, align: 'right' });
    rx += cols[2].w;
    doc.fillColor(TEXT_DARK).font('Helvetica');
    doc.text(item.employer > 0 ? fmt(item.employer) : '', rx, doc.y + (ROW_H * 0.2), { width: cols[3].w - 10, align: 'right' });
    rx += cols[3].w;
    doc.fillColor(TEXT_MUTED).fontSize(dynamicFontSize * 0.85); // Slightly smaller for YTD
    doc.text(item.ytd > 0 ? fmt(item.ytd) : '—', rx, doc.y + (ROW_H * 0.2), { width: cols[4].w - 10, align: 'right' });
    doc.fillColor(TEXT_DARK).fontSize(dynamicFontSize);
    
    doc.y += ROW_H;
  });

  // ── Integrated Summary Row ────────────────────────────────────────────────
  doc.y += 5;
  const summaryY = doc.y;
  doc.rect(LEFT, summaryY, TABLE_W, 45).fill('#f1f5f9');
  
  const sumColW = TABLE_W / 3;
  doc.fontSize(8).fillColor(TEXT_MUTED).text('GROSS PAY', LEFT + 10, summaryY + 10);
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(11).text(`${ccy} ${fmt(data.grossPay)}`, LEFT + 10, summaryY + 22);
  
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(8).text('TOTAL DEDUCTIONS', LEFT + sumColW + 10, summaryY + 10);
  doc.fillColor('#e11d48').font('Helvetica-Bold').fontSize(11).text(`${ccy} ${fmt(data.totalDeductions)}`, LEFT + sumColW + 10, summaryY + 22);

  doc.rect(LEFT + (sumColW * 2), summaryY, sumColW, 45).fill(BLUE);
  doc.fillColor('white').font('Helvetica').fontSize(8).text('NET SALARY', LEFT + (sumColW * 2) + 10, summaryY + 10);
  doc.fontSize(13).font('Helvetica-Bold').text(`${ccy} ${fmt(data.netSalary)}`, LEFT + (sumColW * 2) + 10, summaryY + 22);

  // ── Compact Branding Footer ───────────────────────────────────────────────
  const footerY = 780;
  doc.moveTo(LEFT, footerY).lineTo(RIGHT, footerY).stroke('#e2e8f0');
  
  drawPlatformLogo(doc, LEFT, footerY + 10, 20);
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10).text('Bantu - HR & Payroll', LEFT + 30, footerY + 12);
  
  // Diagnostic Version Tag
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(6).text('v2.0 Professional', RIGHT - 60, footerY + 14);
  doc.fillColor(TEXT_MUTED).font('Helvetica').fontSize(7.5).text('Empowering Business Through Seamless Payroll Automation', LEFT + 30, footerY + 23);
  
  doc.fontSize(7).text('CONFIDENTIAL DOCUMENT', RIGHT - 100, footerY + 15, { align: 'right' });
}

const generatePayslipPDF = (data, stream) => {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
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
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    _drawPayslip(doc, data);
    doc.end();
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
    { label: 'Employee',        key: 'name',          x: 30,  w: 130 },
    { label: 'ID / Passport',   key: 'idPassport',    x: 162, w: 80 },
    { label: 'TIN',             key: 'tin',           x: 244, w: 70 },
    { label: 'Gross Pay',       key: 'totalGross',    x: 316, w: 75 },
    { label: 'NSSA Employee',   key: 'totalNssa',     x: 393, w: 75 },
    { label: 'PAYE',            key: 'totalPaye',     x: 470, w: 70 },
    { label: 'AIDS Levy',       key: 'totalAidsLevy', x: 542, w: 65 },
    { label: 'Net Pay',         key: 'totalNet',      x: 609, w: 75 },
    { label: 'WCIF (Empr)',     key: 'totalWcif',     x: 686, w: 55 },
    { label: 'ZIMDEF (Empr)',   key: 'totalZimdef',   x: 742, w: 55 },
    { label: 'SDF (Empr)',      key: 'totalSdf',      x: 798, w: 50 },
    { label: 'NEC (Empr)',      key: 'totalNecEmpr',  x: 849, w: 50 },
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
      name:           `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
      idPassport:     emp.idPassport || '—',
      tin:            emp.tin || '—',
      totalGross:     fmt(row.totalGross),
      totalNssa:      fmt(row.totalNssa),
      totalPaye:      fmt(row.totalPaye),
      totalAidsLevy:  fmt(row.totalAidsLevy),
      totalNet:       fmt(row.totalNet),
      totalWcif:      fmt(row.totalWcif),
      totalZimdef:    fmt(row.totalZimdef),
      totalSdf:       fmt(row.totalSdf),
      totalNecEmpr:   fmt(row.totalNecEmpr),
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
      acc.totalGross    += r.totalGross    || 0;
      acc.totalNssa     += r.totalNssa     || 0;
      acc.totalPaye     += r.totalPaye     || 0;
      acc.totalAidsLevy += r.totalAidsLevy || 0;
      acc.totalNet      += r.totalNet      || 0;
      acc.totalWcif     += r.totalWcif     || 0;
      acc.totalZimdef   += r.totalZimdef   || 0;
      acc.totalSdf      += r.totalSdf      || 0;
      acc.totalNecEmpr  += r.totalNecEmpr  || 0;
      return acc;
    }, { totalGross: 0, totalNssa: 0, totalPaye: 0, totalAidsLevy: 0, totalNet: 0, totalWcif: 0, totalZimdef: 0, totalSdf: 0, totalNecEmpr: 0 });

    y += 4;
    doc.moveTo(28, y).lineTo(890, y).lineWidth(1).stroke('#1a2e4a');
    y += 6;
    doc.rect(28, y - 2, 862, ROW_H).fill('#e8f0fe');
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#1a2e4a');

    const totalCells = {
      name: 'TOTALS', idPassport: '', tin: '',
      totalGross:    fmt(totals.totalGross),
      totalNssa:     fmt(totals.totalNssa),
      totalPaye:     fmt(totals.totalPaye),
      totalAidsLevy: fmt(totals.totalAidsLevy),
      totalNet:      fmt(totals.totalNet),
      totalWcif:     fmt(totals.totalWcif),
      totalZimdef:   fmt(totals.totalZimdef),
      totalSdf:      fmt(totals.totalSdf),
      totalNecEmpr:  fmt(totals.totalNecEmpr),
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
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(stream);

  const ccy = data.currency || 'USD';
  const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const LEFT = 60;
  const PAGE_RIGHT = 545;
  const ROW_H = 20;

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
  const fmtN = (n) => Number(n || 0).toFixed(2);
  const NAVY = '#1a2e4a', GREY = '#64748b', RED = '#dc2626', GREEN = '#059669', LINE = '#cbd5e1';

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text(companyName, 20, 25);
  doc.font('Helvetica').fontSize(11).fillColor(GREY)
    .text(`MASTER ROLL  ·  ${period}  ·  ${ccy}`, 20, doc.y + 2);
  doc.moveDown(0.5);
  doc.moveTo(20, doc.y).lineTo(1170, doc.y).lineWidth(1.5).stroke(NAVY);
  doc.moveDown(0.8);

  // ── Column Definitions ──────────────────────────────────────────────────────
  const cols = [
    { label: 'Code',      w: 40,  align: 'left'   },
    { label: 'Name',      w: 100, align: 'left'   },
    { label: 'Position',  w: 80,  align: 'left'   },
    { label: 'Basic',     w: 65,  align: 'right'  },
    { label: 'Allow/Ben', w: 65,  align: 'right'  },
    { label: 'Gross',     w: 75,  align: 'right'  },
    { label: 'PAYE',      w: 65,  align: 'right'  },
    { label: 'AIDS',      w: 45,  align: 'right'  },
    { label: 'NSSA Emp',  w: 60,  align: 'right'  },
    { label: 'Pension',   w: 60,  align: 'right'  },
    { label: 'Loans',     w: 60,  align: 'right'  },
    { label: 'Other Ded', w: 60,  align: 'right'  },
    { label: 'Net Pay',   w: 85,  align: 'right'  },
    { label: 'NSSA Empr', w: 60,  align: 'right'  },
    { label: 'ZIMDEF',    w: 60,  align: 'right'  },
    { label: 'NEC Match', w: 65,  align: 'right'  },
    { label: 'CTC',       w: 85,  align: 'right'  }, // Cost to Company
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
        t.gross  += p.gross || 0;
        t.paye   += p.paye || 0;
        t.aids   += p.aidsLevy || 0;
        t.nssaE  += p.nssaEmployee || 0;
        t.nssaR  += p.nssaEmployer || 0;
        t.net    += p.netPay || 0;
        t.necE   += p.necLevy || 0;
        t.necR   += p.necEmployer || 0;
        t.zimdef += p.zimdefEmployer || 0;
        t.ctc    += ctc;
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

module.exports = {
  generatePayslipPDF,
  generatePayslipBuffer,
  generateP16PDF,
  generateNSSA_P4A,
  generateP2PDF,
  generateIT7PDF,
  generatePayrollSummaryPDF,
};
