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
function _drawPayslip(doc, data) {
  const ccy = data.currency || 'USD';
  const fmt = (n) => Number(n || 0).toFixed(2);
  const LEFT = 60;
  const RIGHT_LABEL_END = 360;
  const PAGE_RIGHT = 545;
  const ROW_H = 18;

  // Draws a label + right-aligned value on the current doc.y
  const row = (label, value, opts = {}) => {
    const y = doc.y;
    const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
    const size = opts.size || 11;
    doc.font(font).fontSize(size);
    doc.text(label, LEFT, y, { width: RIGHT_LABEL_END - LEFT });
    doc.text(value, RIGHT_LABEL_END, y, { width: PAGE_RIGHT - RIGHT_LABEL_END, align: 'right' });
    doc.moveDown(opts.gap || 0.25);
  };

  const note = (text) => {
    doc.font('Helvetica').fontSize(8).fillColor('#777777')
      .text(text, LEFT + 12, doc.y, { width: PAGE_RIGHT - LEFT - 12 });
    doc.fillColor('black');
    doc.moveDown(0.2);
  };

  const sectionTitle = (title) => {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a2e4a').text(title, LEFT);
    doc.fillColor('black');
    doc.moveDown(0.3);
    doc.moveTo(LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).lineWidth(0.5).stroke('#dddddd');
    doc.moveDown(0.4);
  };

  const divider = (heavy = false) => {
    doc.moveTo(LEFT, doc.y)
      .lineTo(PAGE_RIGHT, doc.y)
      .lineWidth(heavy ? 1 : 0.5)
      .stroke(heavy ? '#1a2e4a' : '#dddddd');
    doc.moveDown(0.5);
  };

  // ── Header ────────────────────────────────────────────────────────────────
  doc.font('Helvetica-Bold').fontSize(22).fillColor('#1a2e4a')
    .text('PAYSLIP', LEFT, 50, { align: 'center', width: PAGE_RIGHT - LEFT });
  doc.fillColor('black');
  doc.font('Helvetica').fontSize(10).moveDown(0.4);
  doc.text(data.companyName, LEFT, doc.y, { align: 'center', width: PAGE_RIGHT - LEFT });
  doc.text(`Pay Period: ${data.period}`, LEFT, doc.y, { align: 'center', width: PAGE_RIGHT - LEFT });
  doc.moveDown(0.6);
  divider(true);

  // ── Employee Details ───────────────────────────────────────────────────────
  const detailY = doc.y;
  doc.font('Helvetica-Bold').fontSize(10).text('Employee Name', LEFT, detailY);
  doc.font('Helvetica').fontSize(10).text(data.employeeName, LEFT, detailY + ROW_H);

  doc.font('Helvetica-Bold').fontSize(10).text('National ID', 220, detailY);
  doc.font('Helvetica').fontSize(10).text(data.nationalId || '—', 220, detailY + ROW_H);

  doc.font('Helvetica-Bold').fontSize(10).text('Job Title', 380, detailY);
  doc.font('Helvetica').fontSize(10).text(data.jobTitle || '—', 380, detailY + ROW_H);

  doc.y = detailY + ROW_H * 2 + 6;
  doc.moveDown(0.5);
  divider();

  // ── Earnings ──────────────────────────────────────────────────────────────
  sectionTitle('Earnings');

  const earningLines = data.earnings && data.earnings.length > 0
    ? data.earnings
    : [{ code: 'BASIC', name: 'Basic Salary', amount: data.baseSalary || 0 }];

  for (const e of earningLines) {
    row(`${e.name}`, `${ccy} ${fmt(e.amount)}`);
  }

  doc.moveDown(0.2);
  divider();
  row('GROSS PAY', `${ccy} ${fmt(data.grossPay ?? data.baseSalary)}`, { bold: true, size: 12, gap: 0.4 });
  divider();

  // ── Employee Deductions ───────────────────────────────────────────────────
  sectionTitle('Employee Deductions');
  row('PAYE', `${ccy} ${fmt(data.paye)}`);
  row('AIDS Levy (3% of PAYE)', `${ccy} ${fmt(data.aidsLevy)}`);
  row('NSSA Employee (4.5%)', `${ccy} ${fmt(data.nssaEmployee)}`);
  if (data.pensionEmployee) row('Pension Fund', `${ccy} ${fmt(data.pensionEmployee)}`);
  if (data.medicalAid) row('Medical Aid', `${ccy} ${fmt(data.medicalAid)}`);
  for (const d of (data.otherDeductions || [])) {
    row(`${d.name}`, `${ccy} ${fmt(d.amount)}`);
  }
  if (data.loanDeductions) row('Loan Deductions', `${ccy} ${fmt(data.loanDeductions)}`);

  const totalDeductions =
    (data.paye || 0) + (data.aidsLevy || 0) + (data.nssaEmployee || 0) +
    (data.pensionEmployee || 0) + (data.medicalAid || 0) +
    (data.otherDeductions || []).reduce((s, d) => s + (d.amount || 0), 0) +
    (data.loanDeductions || 0);

  doc.moveDown(0.2);
  divider();
  row('TOTAL DEDUCTIONS', `${ccy} ${fmt(totalDeductions)}`, { bold: true, size: 12, gap: 0.4 });
  divider();

  // ── Employer Contributions (informational) ────────────────────────────────
  const hasEmployerItems = data.nssaEmployer || data.wcifEmployer || data.sdfContribution || data.necLevy;
  if (hasEmployerItems) {
    sectionTitle('Employer Contributions');
    note('These contributions are borne by your employer and do not reduce your net pay.');
    if (data.nssaEmployer != null) row('NSSA Employer (4.5%)', `${ccy} ${fmt(data.nssaEmployer)}`);
    if (data.wcifEmployer != null) row('WCIF (Workers Compensation)', `${ccy} ${fmt(data.wcifEmployer)}`);
    if (data.zimdefEmployer != null) row('ZIMDEF (Manpower Levy)', `${ccy} ${fmt(data.zimdefEmployer)}`);
    if (data.sdfContribution != null) row('SDF / Training Levy', `${ccy} ${fmt(data.sdfContribution)}`);
    if (data.necEmployer != null) row('NEC Employer Match', `${ccy} ${fmt(data.necEmployer)}`);
    if (data.necLevy != null && !data.necEmployer) row('NEC Levy', `${ccy} ${fmt(data.necLevy)}`);
    doc.moveDown(0.3);
    divider();
  }

  // ── Net Pay Summary ───────────────────────────────────────────────────────
  sectionTitle('Net Pay');

  if (data.netPayUSD != null && data.netPayZIG != null) {
    // ── Split-currency layout ──────────────────────────────────────────────
    const boxY = doc.y;
    const boxH = ROW_H * 2 + 20;
    doc.rect(LEFT, boxY, PAGE_RIGHT - LEFT, boxH)
      .fillAndStroke('#f0f6ff', '#3b82f6');

    doc.font('Helvetica-Bold').fontSize(12).fillColor('#1a2e4a');
    doc.text('Net Pay (USD)', LEFT + 10, boxY + 8, { width: 200 });
    doc.text(`USD ${fmt(data.netPayUSD)}`, RIGHT_LABEL_END, boxY + 8,
      { width: PAGE_RIGHT - RIGHT_LABEL_END - 10, align: 'right' });

    doc.text('Net Pay (ZiG)', LEFT + 10, boxY + 8 + ROW_H, { width: 200 });
    doc.text(`ZiG ${fmt(data.netPayZIG)}`, RIGHT_LABEL_END, boxY + 8 + ROW_H,
      { width: PAGE_RIGHT - RIGHT_LABEL_END - 10, align: 'right' });

    doc.fillColor('black');
    doc.y = boxY + boxH + 6;

    doc.font('Helvetica').fontSize(8).fillColor('#555555')
      .text(`Equivalent total: ${ccy} ${fmt(data.netSalary)}`, LEFT, doc.y);
    doc.fillColor('black');
  } else {
    // ── Single-currency layout ─────────────────────────────────────────────
    const boxY = doc.y;
    const boxH = ROW_H + 16;
    doc.rect(LEFT, boxY, PAGE_RIGHT - LEFT, boxH)
      .fillAndStroke('#f0f9f4', '#22c55e');

    doc.font('Helvetica-Bold').fontSize(13).fillColor('#14532d');
    doc.text(`Net Pay (${ccy})`, LEFT + 10, boxY + 8, { width: 200 });
    doc.text(`${ccy} ${fmt(data.netSalary)}`, RIGHT_LABEL_END, boxY + 8,
      { width: PAGE_RIGHT - RIGHT_LABEL_END - 10, align: 'right' });

    doc.fillColor('black');
    doc.y = boxY + boxH + 6;
  }
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
    { label: 'Code',      w: 45,  align: 'left'   },
    { label: 'Name',      w: 120, align: 'left'   },
    { label: 'Position',  w: 100, align: 'left'   },
    { label: 'Basic',     w: 70,  align: 'right'  },
    { label: 'Allow/Ben', w: 70,  align: 'right'  },
    { label: 'Gross',     w: 80,  align: 'right'  },
    { label: 'PAYE',      w: 70,  align: 'right'  },
    { label: 'AIDS',      w: 50,  align: 'right'  },
    { label: 'NSSA Emp',  w: 60,  align: 'right'  },
    { label: 'Nec Emp',   w: 60,  align: 'right'  },
    { label: 'Pension',   w: 65,  align: 'right'  },
    { label: 'Loans',     w: 65,  align: 'right'  },
    { label: 'Net Pay',   w: 85,  align: 'right'  },
    { label: 'NSSA Empr', w: 65,  align: 'right'  },
    { label: 'ZIMDEF',    w: 65,  align: 'right'  },
    { label: 'NEC Match', w: 70,  align: 'right'  },
    { label: 'CTC',       w: 90,  align: 'right'  }, // Cost to Company
  ];
  const HDR_H = 22, ROW_H = 18;

  const drawHeader = (y) => {
    doc.rect(20, y, 1150, HDR_H).fill(NAVY);
    let cx = 25;
    cols.forEach(col => {
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('white')
        .text(col.label, cx, y + 6, { width: col.w - 10, align: col.align });
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
        fmtN(p.necLevy),
        fmtN(p.pensionApplied), // Assuming we have this
        fmtN(p.loanDeductions),
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
      });

      currentY += ROW_H;
    });

    // Subtotal Row
    doc.rect(20, currentY, 1150, ROW_H).fill('#f1f5f9');
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(NAVY).text(`SUBTOTAL: ${group.name}`, 30, currentY + 5);
    
    // Display subtotals for main money columns
    const stCells = { 5: groupTotals.gross, 6: groupTotals.paye, 12: groupTotals.net, 16: groupTotals.ctc };
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
  const gtCells = { 5: grandTotals.gross, 6: grandTotals.paye, 8: grandTotals.nssaE, 12: grandTotals.net, 14: grandTotals.zimdef, 16: grandTotals.ctc };
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
