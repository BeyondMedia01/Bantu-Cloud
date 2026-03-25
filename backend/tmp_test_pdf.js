const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

// Mock drawPlatformLogo
function drawPlatformLogo(doc, x, y, size = 30) {
  doc.rect(x, y, size, size).stroke();
  doc.text('LOGO', x+2, y+10);
}

const fmt = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function _drawPayslip(doc, data) {
  const ccy = data.currency || 'USD';
  const LEFT = 40;
  const PAGE_WIDTH = 555;
  const RIGHT = PAGE_WIDTH - 40;
  const TABLE_W = RIGHT - LEFT;
  const ROW_H = 16;
  const BLUE = '#1a2e4a';
  const TEXT_DARK = '#1e293b';
  const TEXT_MUTED = '#64748b';
  const LIGHT_GRAY = '#f8fafc';

  doc.rect(0, 0, PAGE_WIDTH, 85).fill(BLUE);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(20).text('PAYSLIP', LEFT, 25);
  doc.fontSize(11).text(data.companyName, LEFT, 50);
  doc.font('Helvetica').fontSize(9).text(`Pay Period: ${data.period}`, LEFT, 65);

  doc.y = 100;
  const infoData = [
    { label: 'Name', value: data.employeeName },
    { label: 'Code', value: data.employeeCode || '—' },
    { label: 'Position', value: data.jobTitle || '—' },
    { label: 'National ID', value: data.nationalId || '—' },
    { label: 'Currency', value: ccy },
    { label: 'Pay Date', value: '22/03/2026' },
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

  const cols = [
    { label: 'Description', w: 175, align: 'left' },
    { label: 'Allowances', w: 75, align: 'right' },
    { label: 'Deductions', w: 75, align: 'right' },
    { label: 'Company Cont.', w: 75, align: 'right' },
    { label: 'YTD Amount', w: 75, align: 'right' },
  ];

  const headerY = doc.y;
  doc.rect(LEFT, headerY, TABLE_W, 20).fill(BLUE);
  let cx = LEFT + 5;
  doc.fillColor('white').font('Helvetica-Bold').fontSize(8);
  cols.forEach(c => {
    doc.text(c.label.toUpperCase(), cx, headerY + 6, { width: c.w - 10, align: c.align });
    cx += c.w;
  });

  doc.y = headerY + 20;
  doc.fillColor(TEXT_DARK).font('Helvetica').fontSize(8.5);

  (data.lineItems || []).forEach((item, i) => {
    if (doc.y > 750) doc.addPage();
    if (i % 2 === 0) doc.rect(LEFT, doc.y, TABLE_W, ROW_H).fill(LIGHT_GRAY).fillColor(TEXT_DARK);
    
    let rx = LEFT + 5;
    doc.text(item.name, rx, doc.y + 4, { width: cols[0].w - 10 });
    rx += cols[0].w;
    doc.font('Helvetica-Bold');
    doc.text(item.allowance > 0 ? fmt(item.allowance) : '', rx, doc.y + 4, { width: cols[1].w - 10, align: 'right' });
    rx += cols[1].w;
    doc.fillColor('#e11d48');
    doc.text(item.deduction > 0 ? fmt(item.deduction) : '', rx, doc.y + 4, { width: cols[2].w - 10, align: 'right' });
    rx += cols[2].w;
    doc.fillColor(TEXT_DARK).font('Helvetica');
    doc.text(item.employer > 0 ? fmt(item.employer) : '', rx, doc.y + 4, { width: cols[3].w - 10, align: 'right' });
    rx += cols[3].w;
    doc.fillColor(TEXT_MUTED).fontSize(7.5);
    doc.text(item.ytd > 0 ? fmt(item.ytd) : '—', rx, doc.y + 4, { width: cols[4].w - 10, align: 'right' });
    doc.fillColor(TEXT_DARK).fontSize(8.5);
    
    doc.y += ROW_H;
  });

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

  const footerY = 780;
  doc.moveTo(LEFT, footerY).lineTo(RIGHT, footerY).stroke('#e2e8f0');
  drawPlatformLogo(doc, LEFT, footerY + 10, 20);
  doc.fillColor(BLUE).font('Helvetica-Bold').fontSize(10).text('Bantu - HR & Payroll', LEFT + 30, footerY + 12);
}

const doc = new PDFDocument({ margin: 50, size: 'A4' });
const mockData = {
  companyName: "Bantu HR Test",
  period: "01/03/2026 - 31/03/2026",
  employeeName: "John Doe",
  employeeCode: "EMP001",
  jobTitle: "Senior Developer",
  nationalId: "12-345678-A-90",
  currency: "USD",
  lineItems: [
    { name: 'Basic Salary', allowance: 5000, deduction: 0, employer: 0, ytd: 15000 },
    { name: 'Housing Allowance', allowance: 500, deduction: 0, employer: 0, ytd: 1500 },
    { name: 'PAYE', allowance: 0, deduction: 800, employer: 0, ytd: 2400 },
    { name: 'NSSA', allowance: 0, deduction: 150, employer: 150, ytd: 450 },
  ],
  grossPay: 5500,
  totalDeductions: 950,
  netSalary: 4550
};

doc.pipe(fs.createWriteStream('test_payslip.pdf'));
_drawPayslip(doc, mockData);
doc.end();

console.log('PDF generated. Please check page count.');
