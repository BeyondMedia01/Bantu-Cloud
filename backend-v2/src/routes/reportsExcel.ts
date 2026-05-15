import { Hono } from 'hono';
import * as XLSX from 'xlsx';
import { prisma, getSql } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const n2 = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100;

function yearPeriodFilter(companyId: string, year: string, month?: string) {
  const y = parseInt(year);
  const base: Record<string, unknown> = { companyId, status: 'COMPLETED' as const };
  if (month) {
    const m = parseInt(month);
    const mStart = new Date(y, m - 1, 1);
    const mEnd = new Date(y, m, 1);
    base.OR = [
      { payrollCalendar: { year: y, month: m } },
      { payrollCalendarId: null, startDate: { gte: mStart }, endDate: { lt: mEnd } },
    ];
  } else {
    const yearStart = new Date(y, 0, 1);
    const yearEnd = new Date(y + 1, 0, 1);
    base.OR = [
      { payrollCalendar: { year: y } },
      { payrollCalendarId: null, startDate: { gte: yearStart }, lt: yearEnd },
    ];
  }
  return base;
}

/** Style the header row: dark-blue fill, white bold Calibri, centre-aligned. */
function styleHeaders(ws: XLSX.WorkSheet, numCols: number) {
  const headerStyle = {
    fill: { fgColor: { rgb: '1A2E4A' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: 'Calibri' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: { bottom: { style: 'thin', color: { rgb: 'B2DB64' } } },
  };
  for (let c = 0; c < numCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = headerStyle;
  }
}

/** Style totals row: same dark-blue fill, white bold. */
function styleTotalsRow(ws: XLSX.WorkSheet, rowIdx: number, numCols: number) {
  const style = {
    fill: { fgColor: { rgb: '1A2E4A' } },
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: 'Calibri' },
  };
  for (let c = 0; c < numCols; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
    if (!ws[addr]) ws[addr] = { t: 's', v: '' };
    ws[addr].s = style;
  }
}

function toXlsxBytes(wb: XLSX.WorkBook): Uint8Array {
  // Use base64 output — most portable across runtimes (Node, Workers, browser).
  // atob is available in all modern environments including Cloudflare Workers.
  const b64: string = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const raw = atob(b64);
  const buf = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
  return buf;
}

function sendXlsx(c: any, buf: Uint8Array, filename: string) {
  c.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  c.header('Content-Disposition', `attachment; filename=${filename}`);
  return c.body(buf.buffer);
}

// ─── NSSA P4A Excel ───────────────────────────────────────────────────────────

router.get('/nssa-p4a-excel', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  const month = c.req.query('month');
  const year = c.req.query('year');
  if (!companyId || !month || !year) return c.json({ message: 'month and year are required' }, 400);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { name: true, registrationNumber: true },
  });

  const y = parseInt(year);
  const m = parseInt(month);
  const mStart = new Date(y, m - 1, 1).toISOString();
  const mEnd = new Date(y, m, 1).toISOString();
  const sql = getSql();
  const rawPayslips = await sql`
    SELECT ps.*,
      e."employeeCode", e."socialSecurityNum", e."passportNumber",
      e."dateOfBirth", e."lastName", e."firstName", e."startDate" AS e_start_date,
      e."dischargeDate", e."baseRate"
    FROM "Payslip" ps
    JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
    JOIN "Employee" e ON e.id = ps."employeeId"
    WHERE pr."companyId" = ${companyId}
      AND pr.status = 'COMPLETED'
      AND (
        (pr."payrollCalendarId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "PayrollCalendar" pc WHERE pc.id = pr."payrollCalendarId" AND pc.year = ${y} AND pc.month = ${m}
        ))
        OR (pr."payrollCalendarId" IS NULL AND pr."startDate" >= ${mStart}::timestamptz AND pr."startDate" < ${mEnd}::timestamptz)
      )
    ORDER BY ps."employeeId" ASC
  `;
  const payslips = (rawPayslips as any[]).map(r => ({
    ...r,
    employee: {
      employeeCode: r.employeeCode, socialSecurityNum: r.socialSecurityNum,
      passportNumber: r.passportNumber, dateOfBirth: r.dateOfBirth,
      lastName: r.lastName, firstName: r.firstName,
      startDate: r.e_start_date, dischargeDate: r.dischargeDate, baseRate: r.baseRate,
    },
  }));
  if (payslips.length === 0) return c.json({ message: 'No completed payroll data for this period' }, 404);

  const ssrNumber = company?.registrationNumber || '';
  const periodStr = `${String(month).padStart(2, '0')}/${year}`;

  const HEADERS = [
    'SsrNumber', 'WorksNumber', 'SSNNumber', 'NationalIDNumber',
    'Period', 'BirthDate', 'Surname', 'Firstname',
    'StartDate', 'EndDate',
    'POBSInsurableEarnings', 'POBSContributions', 'BasicAPWCS', 'ActualInsurableEarnings',
  ];

  const COL_WIDTHS = [18, 16, 18, 20, 12, 14, 20, 20, 14, 14, 24, 22, 18, 26];

  const dataRows: (string | number | Date | null)[][] = [];
  let tot = { pobsIns: 0, pobsCon: 0, basic: 0, actual: 0 };

  for (const ps of payslips) {
    const emp = ps.employee;
    const pobsIns = n2(Number(ps.nssaBasis) > 0 ? ps.nssaBasis : ps.gross);
    const pobsCon = n2(Number(ps.nssaEmployee || 0) + Number(ps.nssaEmployer || ps.nssaEmployee || 0));
    const basic   = n2(Number(ps.basicSalaryApplied) > 0 ? ps.basicSalaryApplied : emp.baseRate || 0);
    dataRows.push([
      ssrNumber,
      emp.employeeCode || '',
      emp.socialSecurityNum || '',
      emp.passportNumber || '',
      periodStr,
      emp.dateOfBirth ? new Date(emp.dateOfBirth) : null,
      emp.lastName || '',
      emp.firstName || '',
      emp.startDate ? new Date(emp.startDate) : null,
      emp.dischargeDate ? new Date(emp.dischargeDate) : null,
      pobsIns, pobsCon, basic, n2(ps.gross),
    ]);
    tot.pobsIns += pobsIns; tot.pobsCon += pobsCon;
    tot.basic   += basic;   tot.actual  += n2(ps.gross);
  }

  const totalsRow = [
    'TOTALS', '', '', '', '', '', '', '', '', '',
    n2(tot.pobsIns), n2(tot.pobsCon), n2(tot.basic), n2(tot.actual),
  ];

  const aoa = [HEADERS, ...dataRows, totalsRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'DD/MM/YYYY' });

  // Column widths
  ws['!cols'] = COL_WIDTHS.map(w => ({ wch: w }));

  // Number format for financial columns (indices 10-13)
  const numFmt = '#,##0.00';
  for (let r = 1; r <= dataRows.length + 1; r++) {
    for (let c = 10; c <= 13; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (ws[addr] && ws[addr].t === 'n') ws[addr].z = numFmt;
    }
  }

  styleHeaders(ws, HEADERS.length);
  styleTotalsRow(ws, dataRows.length + 1, HEADERS.length);

  // Freeze header row + auto-filter (matches v1)
  ws['!freeze'] = { ySplit: 1 };
  ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(HEADERS.length - 1)}1` };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'NSSA P4A');

  const mm = String(month).padStart(2, '0');
  return sendXlsx(c, toXlsxBytes(wb), `NSSA-P4A-${year}-${mm}.xlsx`);
});

// ─── TaRMS PAYE Excel ─────────────────────────────────────────────────────────

router.get('/tarms-paye-excel', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  const month = c.req.query('month');
  const year = c.req.query('year');
  if (!companyId || !month || !year) return c.json({ message: 'month and year are required' }, 400);

  const ty = parseInt(year);
  const tm = parseInt(month);
  const tmStart = new Date(ty, tm - 1, 1).toISOString();
  const tmEnd = new Date(ty, tm, 1).toISOString();
  const sql = getSql();
  const rawPayslips = await sql`
    SELECT ps.*,
      e.tin, e."passportNumber", e."firstName", e."lastName", e.currency AS e_currency, e."taxMethod",
      pr.id AS pr_id, pr."startDate" AS pr_start_date, pr."dualCurrency", pr.currency AS pr_currency
    FROM "Payslip" ps
    JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
    JOIN "Employee" e ON e.id = ps."employeeId"
    WHERE pr."companyId" = ${companyId}
      AND pr.status = 'COMPLETED'
      AND (
        (pr."payrollCalendarId" IS NOT NULL AND EXISTS (
          SELECT 1 FROM "PayrollCalendar" pc WHERE pc.id = pr."payrollCalendarId" AND pc.year = ${ty} AND pc.month = ${tm}
        ))
        OR (pr."payrollCalendarId" IS NULL AND pr."startDate" >= ${tmStart}::timestamptz AND pr."startDate" < ${tmEnd}::timestamptz)
      )
    ORDER BY ps."employeeId" ASC
  `;
  const payslips = (rawPayslips as any[]).map(r => ({
    ...r,
    employee: { tin: r.tin, passportNumber: r.passportNumber, firstName: r.firstName, lastName: r.lastName, currency: r.e_currency, taxMethod: r.taxMethod },
    payrollRun: { id: r.pr_id, startDate: r.pr_start_date, dualCurrency: r.dualCurrency, currency: r.pr_currency },
  }));
  if (payslips.length === 0) return c.json({ message: 'No completed payroll data for this period' }, 404);

  const runIds = [...new Set(payslips.map(p => p.payrollRunId))];
  const employeeIds = payslips.map(p => p.employeeId);

  const rawTransactions = await sql`
    SELECT pt.*, tc.code AS tc_code, tc.name AS tc_name, tc.type AS tc_type, tc."preTax", tc."incomeCategory"
    FROM "PayrollTransaction" pt
    JOIN "TransactionCode" tc ON tc.id = pt."transactionCodeId"
    WHERE pt."payrollRunId" = ANY(${runIds}::text[])
      AND pt."employeeId" = ANY(${employeeIds}::text[])
  `;
  const transactions = (rawTransactions as any[]).map(r => ({
    ...r,
    transactionCode: { code: r.tc_code, name: r.tc_name, type: r.tc_type, preTax: r.preTax, incomeCategory: r.incomeCategory },
  }));

  const txByEmployee: Record<string, any[]> = {};
  for (const t of transactions) {
    if (!txByEmployee[t.employeeId]) txByEmployee[t.employeeId] = [];
    txByEmployee[t.employeeId].push(t);
  }

  const refDate = payslips[0].payrollRun.startDate;
  const taxYearStart = new Date(refDate) >= new Date(refDate.getFullYear(), 3, 1)
    ? new Date(refDate.getFullYear(), 3, 1)
    : new Date(refDate.getFullYear() - 1, 3, 1);

  const priorBonusTxs = await prisma.payrollTransaction.findMany({
    where: {
      employeeId: { in: employeeIds },
      payrollRun: { companyId, status: 'COMPLETED', startDate: { gte: taxYearStart, lt: refDate } },
      transactionCode: { OR: [{ incomeCategory: 'BONUS' }, { incomeCategory: 'GRATUITY' }, { name: { contains: 'bonus', mode: 'insensitive' } }] },
    },
    select: { employeeId: true, amount: true },
  });

  const priorBonusByEmployee: Record<string, number> = {};
  for (const t of priorBonusTxs) {
    priorBonusByEmployee[t.employeeId] = (priorBonusByEmployee[t.employeeId] || 0) + Number(t.amount || 0);
  }

  const splitAmt = (ps: any, amount: number) => {
    if (!amount) return { usd: 0, zwg: 0 };
    const isUSD = (ps.payrollRun.currency || 'USD').toUpperCase() === 'USD';
    return ps.payrollRun.dualCurrency ? { usd: amount, zwg: 0 } : isUSD ? { usd: amount, zwg: 0 } : { usd: 0, zwg: amount };
  };

  const categorise = (txs: any[], ps: any) => {
    const r: Record<string, { usd: number; zwg: number }> = {
      otherExemptions: { usd: 0, zwg: 0 }, overtime: { usd: 0, zwg: 0 }, bonus: { usd: 0, zwg: 0 },
      commission: { usd: 0, zwg: 0 }, otherIrregular: { usd: 0, zwg: 0 }, severanceExempt: { usd: 0, zwg: 0 },
      gratuityNoExempt: { usd: 0, zwg: 0 }, housingBenefit: { usd: 0, zwg: 0 }, vehicleBenefit: { usd: 0, zwg: 0 },
      educationBenefit: { usd: 0, zwg: 0 }, otherBenefits: { usd: 0, zwg: 0 }, nonTaxable: { usd: 0, zwg: 0 },
      pension: { usd: 0, zwg: 0 }, retirementAnnuity: { usd: 0, zwg: 0 }, otherDeductions: { usd: 0, zwg: 0 },
      medicalExpenses: { usd: 0, zwg: 0 }, blindCredit: { usd: 0, zwg: 0 }, disabledCredit: { usd: 0, zwg: 0 },
      elderlyCredit: { usd: 0, zwg: 0 },
    };
    const add = (bucket: { usd: number; zwg: number }, amt: number) => {
      const { usd, zwg } = splitAmt(ps, amt);
      bucket.usd += usd; bucket.zwg += zwg;
    };
    for (const t of txs) {
      const tc = t.transactionCode; if (!tc) continue;
      const cat = tc.incomeCategory;
      const code = (tc.code || '').toUpperCase();
      const name = (tc.name || '').toUpperCase();
      const amt = Math.abs(t.amount || 0);
      if (tc.type === 'EARNING' || tc.type === 'BENEFIT') {
        if (cat === 'OVERTIME' || name.includes('OVERTIME') || code.includes('OT')) add(r.overtime, amt);
        else if (cat === 'BONUS') add(r.bonus, amt);
        else if (cat === 'GRATUITY') add(r.gratuityNoExempt, amt);
        else if (cat === 'COMMISSION') add(r.commission, amt);
        else if (tc.type === 'BENEFIT') {
          if (name.includes('HOUS') || code.includes('HOUS')) add(r.housingBenefit, amt);
          else if (name.includes('VEH') || code.includes('VEH')) add(r.vehicleBenefit, amt);
          else if (name.includes('EDU') || code.includes('EDU')) add(r.educationBenefit, amt);
          else add(r.otherBenefits, amt);
        } else if (cat === 'ALLOWANCE') add(r.otherIrregular, amt);
        else add(r.nonTaxable, amt);
      } else if (tc.type === 'DEDUCTION') {
        if (cat === 'PENSION' || name.includes('PENSION')) add(r.pension, amt);
        else if (name.includes('RETIREM') || name.includes('ANNUITY')) add(r.retirementAnnuity, amt);
        else if (name.includes('MED') && name.includes('EXP')) add(r.medicalExpenses, amt);
        else if (name.includes('BLIND')) add(r.blindCredit, amt);
        else if (name.includes('DISAB')) add(r.disabledCredit, amt);
        else if (name.includes('ELDER')) add(r.elderlyCredit, amt);
        else add(r.otherDeductions, amt);
      }
    }
    return r;
  };

  // 52-column definition: [header, key, usd|zwg|null]
  const COL_DEF: [string, string, string | null][] = [
    ['TIN', 'tin', null], ['ID/Passport Number', 'id', null], ['Employee Name', 'name', null], ['Currency', 'currency', null],
    ['Current Salary... USD', 'salaryUSD', 'usd'], ['Current Salary... ZWG', 'salaryZWG', 'zwg'],
    ['Other Exemptions... USD', 'exemptUSD', 'usd'], ['Other Exemptions... ZWG', 'exemptZWG', 'zwg'],
    ['Current Overtime USD', 'overtimeUSD', 'usd'], ['Current Overtime ZWG', 'overtimeZWG', 'zwg'],
    ['Current Bonus USD', 'bonusUSD', 'usd'], ['Current Bonus ZWG', 'bonusZWG', 'zwg'],
    ['Current Irregular Commission USD', 'commissionUSD', 'usd'], ['Current Irregular Commission ZWG', 'commissionZWG', 'zwg'],
    ['Current Other Irregular earnings USD', 'otherIrregUSD', 'usd'], ['Current Other Irregular earnings ZWG', 'otherIrregZWG', 'zwg'],
    ['Current Severance/Gratuity (Exempt) USD', 'sevExemptUSD', 'usd'], ['Current Severance/Gratuity (Exempt) ZWG', 'sevExemptZWG', 'zwg'],
    ['Current Gratuity (No Exemption) USD', 'gratNoExemptUSD', 'usd'], ['Current Gratuity (No Exemption) ZWG', 'gratNoExemptZWG', 'zwg'],
    ['Current Housing Benefit USD', 'housingUSD', 'usd'], ['Current Housing Benefit ZWG', 'housingZWG', 'zwg'],
    ['Current Vehicle Benefit USD', 'vehicleUSD', 'usd'], ['Current Vehicle Benefit ZWG', 'vehicleZWG', 'zwg'],
    ['Current Education Benefit USD', 'educationUSD', 'usd'], ['Current Education Benefit ZWG', 'educationZWG', 'zwg'],
    ['Current Other Benefits USD', 'otherBenUSD', 'usd'], ['Current Other Benefits ZWG', 'otherBenZWG', 'zwg'],
    ['Current Non-Taxable Earnings USD', 'nonTaxUSD', 'usd'], ['Current Non-taxable earnings ZWG', 'nonTaxZWG', 'zwg'],
    ['Current Pension Contributions USD', 'pensionUSD', 'usd'], ['Current Pension Contributions ZWG', 'pensionZWG', 'zwg'],
    ['Current NSSA Contributions USD', 'nssaUSD', 'usd'], ['Current NSSA Contributions ZWG', 'nssaZWG', 'zwg'],
    ['Current Retirement Annuity USD', 'retirementUSD', 'usd'], ['Current Retirement Annuity ZWG', 'retirementZWG', 'zwg'],
    ['Current NEC/Subscriptions USD', 'necUSD', 'usd'], ['Current NEC/Subscriptions ZWG', 'necZWG', 'zwg'],
    ['Current Other Deductions USD', 'otherDedUSD', 'usd'], ['Current Other Deductions ZWG', 'otherDedZWG', 'zwg'],
    ['Current Medical Aid USD', 'medAidUSD', 'usd'], ['Current Medical Aid ZWG', 'medAidZWG', 'zwg'],
    ['Current Medical Expenses USD', 'medExpUSD', 'usd'], ['Current Medical Expenses ZWG', 'medExpZWG', 'zwg'],
    ['Current Blind persons credit USD', 'blindUSD', 'usd'], ['Current Blind persons credit ZWG', 'blindZWG', 'zwg'],
    ['Current Disabled persons credit USD', 'disabledUSD', 'usd'], ['Current Disabled persons credit ZWG', 'disabledZWG', 'zwg'],
    ['Current Elderly person credit USD', 'elderlyUSD', 'usd'], ['Current Elderly person credit ZWG', 'elderlyZWG', 'zwg'],
    ['Cumulative Bonus (Last Period) USD', 'cumBonusUSD', 'usd'], ['Cumulative Bonus (Last Period) ZWG', 'cumBonusZWG', 'zwg'],
  ];

  const HEADERS = COL_DEF.map(c => c[0]);
  const NUM_FMT = '#,##0.00';

  function buildSheet(slice: typeof payslips, sheetName: string): XLSX.WorkSheet {
    const dataRows: (string | number)[][] = [];
    const totals = new Array(52).fill(0);

    for (const ps of slice) {
      const emp = ps.employee;
      const txs = txByEmployee[ps.employeeId] || [];
      const cats = categorise(txs, ps);
      const isDual = ps.payrollRun.dualCurrency;
      const isUSD = (ps.payrollRun.currency || 'USD').toUpperCase() === 'USD';
      const nssaUSD = isDual ? n2((ps as any).nssaUSD ?? ps.nssaEmployee) : (isUSD ? n2(ps.nssaEmployee) : 0);
      const nssaZWG = isDual ? n2((ps as any).nssaZIG ?? 0) : (!isUSD ? n2(ps.nssaEmployee) : 0);
      const medAidUSD = isDual ? n2(ps.medicalAidCredit ?? 0) : (isUSD ? n2(ps.medicalAidCredit ?? 0) : 0);
      const medAidZWG = isDual ? 0 : (!isUSD ? n2(ps.medicalAidCredit ?? 0) : 0);
      const priorBonus = priorBonusByEmployee[ps.employeeId] || 0;
      const salUSD = isDual ? n2((ps as any).grossUSD ?? 0) : (isUSD ? n2(ps.basicSalaryApplied || 0) : 0);
      const salZWG = isDual ? n2((ps as any).grossZIG ?? 0) : (!isUSD ? n2(ps.basicSalaryApplied || 0) : 0);

      const numVals: number[] = [
        salUSD, salZWG,
        cats.otherExemptions.usd, cats.otherExemptions.zwg,
        cats.overtime.usd, cats.overtime.zwg,
        cats.bonus.usd, cats.bonus.zwg,
        cats.commission.usd, cats.commission.zwg,
        cats.otherIrregular.usd, cats.otherIrregular.zwg,
        cats.severanceExempt.usd, cats.severanceExempt.zwg,
        cats.gratuityNoExempt.usd, cats.gratuityNoExempt.zwg,
        cats.housingBenefit.usd, cats.housingBenefit.zwg,
        cats.vehicleBenefit.usd, cats.vehicleBenefit.zwg,
        cats.educationBenefit.usd, cats.educationBenefit.zwg,
        cats.otherBenefits.usd, cats.otherBenefits.zwg,
        cats.nonTaxable.usd, cats.nonTaxable.zwg,
        isDual ? n2(ps.pensionApplied ?? 0) : (isUSD ? n2(ps.pensionApplied ?? 0) : 0),
        !isDual && !isUSD ? n2(ps.pensionApplied ?? 0) : cats.pension.zwg,
        nssaUSD, nssaZWG,
        cats.retirementAnnuity.usd, cats.retirementAnnuity.zwg,
        isDual ? n2((ps as any).necLevy ?? 0) : (isUSD ? n2((ps as any).necLevy ?? 0) : 0),
        !isDual && !isUSD ? n2((ps as any).necLevy ?? 0) : 0,
        cats.otherDeductions.usd, cats.otherDeductions.zwg,
        medAidUSD, medAidZWG,
        cats.medicalExpenses.usd, cats.medicalExpenses.zwg,
        cats.blindCredit.usd, cats.blindCredit.zwg,
        cats.disabledCredit.usd, cats.disabledCredit.zwg,
        cats.elderlyCredit.usd, cats.elderlyCredit.zwg,
        isUSD ? priorBonus : 0, !isUSD ? priorBonus : 0,
      ];

      dataRows.push([emp.tin || '', emp.passportNumber || '', `${emp.firstName} ${emp.lastName}`, ps.payrollRun.currency || 'USD', ...numVals]);
      for (let i = 0; i < numVals.length; i++) totals[i] += numVals[i];
    }

    const totalsRow: (string | number)[] = ['TOTALS', '', '', '', ...totals.map(v => n2(v))];
    const aoa = [HEADERS, ...dataRows, totalsRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Column widths: first 4 wider, rest standard
    ws['!cols'] = HEADERS.map((_, i) => ({ wch: i < 4 ? 22 : 20 }));

    // Number format for numeric columns (col 4 onwards, skip first row)
    for (let r = 1; r <= dataRows.length + 1; r++) {
      for (let col = 4; col < 52; col++) {
        const addr = XLSX.utils.encode_cell({ r, c: col });
        if (ws[addr] && ws[addr].t === 'n') ws[addr].z = NUM_FMT;
      }
    }

    styleHeaders(ws, HEADERS.length);
    styleTotalsRow(ws, dataRows.length + 1, HEADERS.length);

    // Freeze first 3 columns + header row (matches v1 ExcelJS xSplit:3 ySplit:1)
    ws['!freeze'] = { xSplit: 3, ySplit: 1 };

    // Auto-filter on header row
    ws['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(HEADERS.length - 1)}1` };

    return ws;
  }

  const FDS_METHODS = new Set(['FDS_AVERAGE', 'FDS_FORECASTING']);
  const fdsPayslips = payslips.filter(p => FDS_METHODS.has(p.employee.taxMethod));
  const nonFdsPayslips = payslips.filter(p => !FDS_METHODS.has(p.employee.taxMethod));

  const wb = XLSX.utils.book_new();
  if (fdsPayslips.length > 0) XLSX.utils.book_append_sheet(wb, buildSheet(fdsPayslips, 'TaRMS PAYE (FDS)'), 'TaRMS PAYE (FDS)');
  if (nonFdsPayslips.length > 0) XLSX.utils.book_append_sheet(wb, buildSheet(nonFdsPayslips, 'TaRMS PAYE (Non-FDS)'), 'TaRMS PAYE (Non-FDS)');
  // Fallback if taxMethod isn't set on all employees
  if (fdsPayslips.length === 0 && nonFdsPayslips.length === 0) {
    XLSX.utils.book_append_sheet(wb, buildSheet(payslips, 'TaRMS PAYE'), 'TaRMS PAYE');
  }

  const mm = String(month).padStart(2, '0');
  return sendXlsx(c, toXlsxBytes(wb), `ZIMRA-TaRMS-PAYE-${year}-${mm}.xlsx`);
});

export default router;
