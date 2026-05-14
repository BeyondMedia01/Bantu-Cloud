import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const fmt2 = (n: number | null | undefined) => (n ?? 0).toFixed(2);
const currencySymbol = (cur: string | null | undefined) => (cur === 'ZiG' || cur === 'ZWG' || cur === 'ZIG' ? 'ZiG' : '$');

const LOGO = `<svg width="28" height="28" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M107.922 469.898L147.362 401.664C195.756 317.943 316.497 317.943 364.89 401.422L404.33 469.656L331.499 511.758L275.121 414.488C266.652 399.97 245.601 399.97 237.132 414.488L180.996 512L107.922 469.898Z" fill="#B2DB64"/><path d="M42.1022 107.917L110.336 147.357C194.057 195.751 194.057 316.491 110.579 364.885L42.3441 404.325L0.241907 331.493L97.5124 275.115C112.03 266.647 112.03 245.595 97.5124 237.127L0 180.991L42.1022 107.917Z" fill="#B2DB64"/><path d="M404.08 42.1021L364.64 110.336C316.247 194.057 195.506 194.057 147.112 110.579L107.672 42.3441L180.504 0.241907L236.882 97.5123C245.351 112.03 266.402 112.03 274.87 97.5123L331.249 0L404.08 42.1021Z" fill="#B2DB64"/><path d="M469.899 404.083L401.664 364.643C317.944 316.25 317.944 195.509 401.422 147.115L469.657 107.675L511.759 180.507L414.489 236.885C399.971 245.354 399.971 266.405 414.489 274.873L512.001 331.01L469.899 404.083Z" fill="#B2DB64"/><path d="M256.002 304.151C282.996 304.151 304.879 282.268 304.879 255.274C304.879 228.28 282.996 206.397 256.002 206.397C229.008 206.397 207.125 228.28 207.125 255.274C207.125 282.268 229.008 304.151 256.002 304.151Z" fill="#B2DB64"/></svg>`;

function yearPeriodFilter(companyId: string, year: string, month?: string) {
  const y = parseInt(year);
  const yearStart = new Date(y, 0, 1);
  const yearEnd = new Date(y + 1, 0, 1);
  const base: Record<string, unknown> = {
    companyId,
    status: 'COMPLETED',
    OR: [
      { payrollCalendar: { year: y } },
      { payrollCalendarId: null, startDate: { gte: yearStart, lt: yearEnd } },
    ],
  };
  if (month) {
    const m = parseInt(month);
    const mStart = new Date(y, m - 1, 1);
    const mEnd = new Date(y, m, 1);
    base.OR = [
      { payrollCalendar: { year: y, month: m } },
      { payrollCalendarId: null, startDate: { gte: mStart }, endDate: { lt: mEnd } },
    ];
  }
  return base;
}

function wrapHtml(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page{size:A4 landscape;margin:12mm 10mm}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a2e4a;font-size:9px;line-height:1.4}
  .header{text-align:center;margin-bottom:8px;border-bottom:2px solid #1a2e4a;padding-bottom:6px}
  .header .logo-row{display:flex;align-items:center;justify-content:center;gap:6px;margin-bottom:2px}
  .header .logo-row h1{font-size:16px;margin:0}
  .header .sub{color:#64748b;font-size:10px;margin:0}
  table{width:100%;border-collapse:collapse;margin-top:6px}
  th{background:#1a2e4a;color:#fff;padding:5px 4px;text-align:left;font-size:9px}
  td{padding:4px;border-bottom:1px solid #e2e8f0}
  tr:nth-child(even){background:#f8fafc}
  .r{text-align:right}
  .c{text-align:center}
  .total{background:#e2e8f0!important;font-weight:bold}
  .group-header{background:#dbeafe!important;font-weight:bold;font-size:9px}
  .group-header td{color:#1e40af;padding:6px 4px}
  .footer{text-align:center;color:#94a3b8;font-size:7px;margin-top:16px;padding-top:6px;border-top:1px solid #e2e8f0}
  .print-btn{position:fixed;bottom:20px;right:20px;background:#1a2e4a;color:#b2db64;border:none;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2)}
  @media print{.print-btn{display:none}}
</style></head>
<body>${body}<button class="print-btn" onclick="window.print()">⬇ Save as PDF</button></body></html>`;
}

function wrapSummaryHtml(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
  @page{size:A4 portrait;margin:10mm 8mm}
  *{box-sizing:border-box}
  body{font-family:Helvetica,Arial,sans-serif;color:#1e293b;font-size:7.5px;line-height:1.4;margin:0;padding:0;background:#fff}
  .page-header{background:#1a2e4a;padding:10px 12px;display:flex;justify-content:space-between;align-items:flex-start}
  .co-name{color:#B2DB64;font-weight:bold;font-size:14px}
  .co-meta{color:rgba(255,255,255,0.85);font-size:8px;margin-top:3px}
  .doc-title{color:#fff;font-weight:bold;font-size:20px;text-align:right}
  .dept-label{background:#d1dce8;padding:4px 10px;margin-top:8px;font-weight:bold;font-size:9px;color:#1a2e4a;letter-spacing:0.4px;text-transform:uppercase}
  .emp-header{display:flex;padding:4px 10px;border-bottom:0.5px solid #e2e8f0;background:#f8fafc;gap:0}
  .emp-hf{font-size:7.5px;color:#64748b;margin-right:2px}
  .emp-hv{font-weight:bold;font-size:7.5px;color:#1a2e4a;margin-right:14px}
  .two-col{display:flex;margin:0 10px}
  .col-left{flex:1;border-right:0.5px solid #e2e8f0}
  .col-right{flex:1}
  .col-hdr{display:flex;background:#eef2f7;padding:3px 4px;border-bottom:0.3px solid #e2e8f0}
  .col-hdr-lbl{flex:1;font-weight:bold;font-size:6.5px;color:#1a2e4a}
  .col-hdr-units{width:30px;font-weight:bold;font-size:6.5px;text-align:right;color:#64748b}
  .col-hdr-amt{width:52px;font-weight:bold;font-size:6.5px;text-align:right;color:#1a2e4a}
  .col-hdr-zig{width:52px;font-weight:bold;font-size:6.5px;text-align:right;color:#0369a1}
  .data-row{display:flex;padding:1.5px 4px}
  .data-desc{flex:1;color:#1e293b;font-size:7.5px}
  .data-desc-credit{flex:1;color:#64748b;font-size:7px;font-style:italic}
  .data-units{width:30px;text-align:right;color:#64748b;font-size:7px}
  .data-amt{width:52px;text-align:right;font-weight:bold;color:#1a2e4a;font-size:7.5px}
  .data-amt-zig{width:52px;text-align:right;font-weight:bold;color:#0369a1;font-size:7.5px}
  .data-amt-muted{width:52px;text-align:right;color:#64748b;font-size:7px}
  .empc-divider{border-top:0.3px solid #e2e8f0;margin:3px 4px}
  .empc-label{padding:2px 4px 1px;font-size:6px;color:#64748b;font-weight:bold;text-transform:uppercase}
  .emp-total-row{display:flex;border-top:0.8px solid #1a2e4a;padding:2px 4px}
  .emp-total-lbl{flex:1;font-weight:bold;font-size:7.5px;color:#1a2e4a}
  .emp-total-amt{width:52px;text-align:right;font-weight:bold;color:#1a2e4a;font-size:7.5px}
  .emp-total-zig{width:52px;text-align:right;font-weight:bold;color:#0369a1;font-size:7.5px}
  .net-row{display:flex;padding:3px 4px;background:#f0fdf4}
  .net-lbl{flex:1;font-weight:bold;font-size:7.5px;color:#059669}
  .net-amt{width:52px;text-align:right;font-weight:bold;color:#059669;font-size:7.5px}
  .net-zig{width:52px;text-align:right;font-weight:bold;color:#0369a1;font-size:7.5px}
  .emp-spacer{height:4px}
  .dept-total-bar{display:flex;align-items:center;padding:4px 10px;background:#dde4ee;margin-top:2px;border-top:0.5px solid #b0bbcc}
  .dept-total-for{font-weight:bold;font-size:8px;color:#1a2e4a}
  .dept-total-emps{font-weight:bold;font-size:8px;color:#1a2e4a;margin-left:10px}
  .dept-total-spacer{flex:1}
  .dept-total-net-lbl{font-weight:bold;font-size:8px;color:#1a2e4a;margin-right:6px}
  .dept-total-amt{width:58px;text-align:right;font-weight:bold;color:#1a2e4a;font-size:8px}
  .dept-total-zig{width:58px;text-align:right;font-weight:bold;color:#0369a1;font-size:8px}
  .dept-stat-row{display:flex;padding:3px 10px;background:#eef2f7;border-top:0.3px solid #b0bbcc}
  .dept-stat-item{display:flex;align-items:center;margin-right:14px}
  .dept-stat-lbl{font-size:6.5px;color:#64748b;margin-right:3px}
  .dept-stat-amt{font-size:7px;font-weight:bold;color:#1a2e4a}
  .grand-bar{background:#1a2e4a;display:flex;align-items:center;padding:7px 10px;margin-top:10px}
  .gt-lbl{flex:1;color:#fff;font-weight:bold;font-size:9px}
  .gt-stat-lbl{color:rgba(255,255,255,0.7);font-weight:bold;font-size:7.5px;margin-right:4px}
  .gt-stat-amt{color:#fff;font-weight:bold;font-size:8px;margin-right:14px}
  .gt-stat-amt-zig{color:#B2DB64;font-weight:bold;font-size:8px;margin-right:14px}
  .gt-net-lbl{color:rgba(255,255,255,0.7);font-weight:bold;font-size:8px;margin-right:6px}
  .gt-net-amt{width:62px;text-align:right;color:#fff;font-weight:bold;font-size:9px}
  .gt-net-zig{width:62px;text-align:right;color:#B2DB64;font-weight:bold;font-size:9px}
  .end-note{text-align:center;padding:14px 0 6px;font-size:8px;color:#64748b}
  .page-footer{text-align:center;color:#94a3b8;font-size:7px;margin-top:12px;padding-top:5px;border-top:0.5px solid #e2e8f0}
  .print-btn{position:fixed;bottom:20px;right:20px;background:#1a2e4a;color:#B2DB64;border:none;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2)}
  @media print{.print-btn{display:none}}
</style></head>
<body>${body}<button class="print-btn" onclick="window.print()">⬇ Save as PDF</button></body></html>`;
}

const normalizeLabel = (name: string) => {
  if (!name) return '';
  const l = name.toLowerCase();
  if (l.includes('wcif') || l.includes('workers') || l.includes('workmen') || l.includes('compensation insurance')) {
    const m = name.match(/\(\s*[\d.]+\s*%\s*\)/);
    return m ? `WCIF ${m[0]}` : 'WCIF (1.25%)';
  }
  return name;
};

router.get('/summary/pdf', requirePermission('export_reports'), async (c) => {
  const runId = c.req.query('runId');
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { company: true },
  });
  if (!run) return c.json({ message: 'Not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    include: { employee: { include: { department: true } } },
    orderBy: { employee: { lastName: 'asc' } },
  });

  const transactions = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: runId },
    include: { transactionCode: { select: { type: true, incomeCategory: true } } },
  });
  const txByEmp: Record<string, { pension: number; otherDed: number }> = {};
  for (const t of transactions) {
    if (!txByEmp[t.employeeId]) txByEmp[t.employeeId] = { pension: 0, otherDed: 0 };
    const cat = t.transactionCode?.incomeCategory;
    if (t.transactionCode?.type === 'DEDUCTION') {
      if (cat === 'PENSION') txByEmp[t.employeeId].pension += Math.abs(t.amount);
      else txByEmp[t.employeeId].otherDed += Math.abs(t.amount);
    }
  }

  const groupsMap: Record<string, typeof payslips> = {};
  for (const ps of payslips) {
    const g = ps.employee.department?.name || 'General';
    if (!groupsMap[g]) groupsMap[g] = [];
    groupsMap[g].push(ps);
  }
  const sortedGroups = Object.keys(groupsMap).sort().map(k => ({ name: k, payslips: groupsMap[k] }));

  const sym = currencySymbol(run.currency);
  const period = `${new Date(run.startDate).toLocaleDateString()} - ${new Date(run.endDate).toLocaleDateString()}`;

  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>${run.company?.name || 'Payroll Summary'}</h1></div><p class="sub">Pay Period: ${period} | Currency: ${run.dualCurrency ? 'USD + ZiG' : (run.currency || 'USD')}</p></div>`;
  cuerpo += `<table><tr><th>Department</th><th>Headcount</th><th class="r">Gross (${sym})</th><th class="r">PAYE</th><th class="r">AIDS Levy</th><th class="r">NSSA</th><th class="r">Pension</th><th class="r">Other Deductions</th><th class="r">Net Pay (${sym})</th></tr>`;

  let grand = { headcount: 0, gross: 0, paye: 0, aids: 0, nssa: 0, pension: 0, otherDed: 0, net: 0 };
  for (const g of sortedGroups) {
    const d = { headcount: g.payslips.length, gross: 0, paye: 0, aids: 0, nssa: 0, pension: 0, otherDed: 0, net: 0 };
    for (const p of g.payslips) {
      const b = txByEmp[p.employeeId] || { pension: 0, otherDed: 0 };
      d.gross += Number(p.gross); d.paye += Number(p.paye); d.aids += Number(p.aidsLevy);
      d.nssa += Number(p.nssaEmployee); d.net += Number(p.netPay);
      d.pension += b.pension; d.otherDed += b.otherDed;
    }
    cuerpo += `<tr class="group-header"><td colspan="9">${g.name}</td></tr>`;
    cuerpo += `<tr><td style="padding-left:12px">Total</td><td class="c">${d.headcount}</td><td class="r">${fmt2(d.gross)}</td><td class="r">${fmt2(d.paye)}</td><td class="r">${fmt2(d.aids)}</td><td class="r">${fmt2(d.nssa)}</td><td class="r">${fmt2(d.pension)}</td><td class="r">${fmt2(d.otherDed)}</td><td class="r">${fmt2(d.net)}</td></tr>`;
    grand.headcount += d.headcount; grand.gross += d.gross; grand.paye += d.paye; grand.aids += d.aids;
    grand.nssa += d.nssa; grand.pension += d.pension; grand.otherDed += d.otherDed; grand.net += d.net;
  }
  cuerpo += `<tr class="total"><td>GRAND TOTAL</td><td class="c">${grand.headcount}</td><td class="r">${fmt2(grand.gross)}</td><td class="r">${fmt2(grand.paye)}</td><td class="r">${fmt2(grand.aids)}</td><td class="r">${fmt2(grand.nssa)}</td><td class="r">${fmt2(grand.pension)}</td><td class="r">${fmt2(grand.otherDed)}</td><td class="r">${fmt2(grand.net)}</td></tr>`;
  cuerpo += `</table><div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;

  return c.html(wrapHtml('Payroll Summary', cuerpo));
});

router.get('/payslip-summary', requirePermission('export_reports'), async (c) => {
  const runId = c.req.query('runId');
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({
    where: { id: runId },
    include: { company: true },
  });
  if (!run) return c.json({ message: 'Not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    include: { employee: { include: { department: true } } },
    orderBy: { employee: { lastName: 'asc' } },
  });

  const allTransactions = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: runId },
    include: { transactionCode: { select: { code: true, name: true, type: true, incomeCategory: true } } },
  });

  const runPeriod = `${new Date(run.startDate).getFullYear()}-${String(new Date(run.startDate).getMonth() + 1).padStart(2, '0')}`;
  const allInputs = await prisma.payrollInput.findMany({
    where: {
      OR: [
        { payrollRunId: runId },
        { payrollRunId: null, period: { lte: runPeriod } },
      ],
    },
    select: { employeeId: true, transactionCodeId: true, units: true, unitsType: true },
  });

  const inputUnitsMap: Record<string, { units: number | null; unitsType: string | null }> = {};
  for (const inp of allInputs) {
    inputUnitsMap[`${inp.employeeId}:${inp.transactionCodeId}`] = {
      units: inp.units ?? null,
      unitsType: inp.unitsType ?? null,
    };
  }

  const txByEmp: Record<string, any[]> = {};
  for (const t of allTransactions) {
    if (!txByEmp[t.employeeId]) txByEmp[t.employeeId] = [];
    txByEmp[t.employeeId].push(t);
  }

  const isDual = !!run.dualCurrency;
  const ccy = isDual ? 'USD' : (run.currency || 'USD');
  const sym = currencySymbol(run.currency);
  const period = `${new Date(run.startDate).toLocaleDateString()} - ${new Date(run.endDate).toLocaleDateString()}`;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const groupsMap: Record<string, typeof payslips> = {};
  for (const ps of payslips) {
    const g = ps.employee.department?.name || 'General';
    if (!groupsMap[g]) groupsMap[g] = [];
    groupsMap[g].push(ps);
  }
  const sortedGroups = Object.keys(groupsMap).sort().map(k => ({ name: k, payslips: groupsMap[k] }));

  const { buildPayslipLineItems } = await import('../lib/payslipFormatter');

  const jsonGroups = [];

  // Grand totals accumulators
  const grandEarnMap = new Map<string, { usd: number; zig: number; taxCredit: boolean }>();
  const grandDedMap = new Map<string, { usd: number; zig: number }>();
  const grandEmprMap = new Map<string, { usd: number }>();
  let grandNetUSD = 0, grandNetZIG = 0, grandHeadcount = 0;
  let grandPayeUSD = 0, grandAidsUSD = 0, grandNssaUSD = 0;

  // ── Page header
  let cuerpo = `
<div class="page-header">
  <div>
    <div class="co-name">${(run.company?.name || '').toUpperCase()}</div>
    <div class="co-meta">Period: ${period}</div>
    <div class="co-meta">Generated: ${dateStr} &nbsp; ${timeStr}</div>
    ${isDual && run.exchangeRate ? `<div class="co-meta" style="opacity:0.6;font-size:7px">Rate: 1 USD = ${Number(run.exchangeRate).toFixed(4)} ZiG</div>` : ''}
  </div>
  <div class="doc-title">PAYROLL SUMMARY</div>
</div>`;

  for (const g of sortedGroups) {
    let gNetUSD = 0, gNetZIG = 0, gPayeUSD = 0, gAidsUSD = 0, gNssaUSD = 0;
    const gHeadcount = g.payslips.length;
    const jsonPayslips: any[] = [];

    cuerpo += `<div class="dept-label">${g.name.toUpperCase()}</div>`;

    for (const p of g.payslips) {
      const txs = txByEmp[p.employeeId] || [];
      const empTxs = txs.filter((t: any) => t.transactionCode).map((t: any) => {
        const key = `${p.employeeId}:${t.transactionCodeId}`;
        const ud = inputUnitsMap[key] || {};
        return { ...t, amount: Number(t.amount), ...ud };
      });

      const basic = Number(p.basicSalaryApplied || 0);
      const displayLines = buildPayslipLineItems({
        payslip: { ...p, payrollRun: run },
        transactions: empTxs,
        basicSalary: basic,
        ytdStat: {}, ytdMap: {}, ytdStatZIG: {}, ytdMapZIG: {},
      });

      const earnings   = displayLines.filter(l => (l.allowance ?? 0) > 0);
      const deductions = displayLines.filter(l => (l.deduction ?? 0) > 0);
      const employers  = displayLines.filter(l => (l.employer  ?? 0) > 0);
      const earnSumRows = earnings.filter(l => !l.taxCredit);

      const totAllowUSD = earnSumRows.reduce((a, e) => a + (e.allowance ?? 0), 0);
      const totAllowZIG = isDual ? earnSumRows.reduce((a, e) => a + (e.allowanceZIG ?? 0), 0) : 0;
      const totDedUSD   = deductions.reduce((a, d) => a + (d.deduction ?? 0), 0);
      const totDedZIG   = isDual ? deductions.reduce((a, d) => a + (d.deductionZIG ?? 0), 0) : 0;
      const netUSD = Number(p.netPayUSD ?? p.netPay ?? (totAllowUSD - totDedUSD));
      const netZIG = isDual ? Number((p as any).netPayZIG ?? 0) : 0;

      gNetUSD += netUSD; gNetZIG += netZIG;
      gPayeUSD += Number(p.paye ?? 0);
      gAidsUSD += Number(p.aidsLevy ?? 0);
      gNssaUSD += Number(p.nssaEmployee ?? 0);

      // accumulate grand totals
      for (const e of earnings) {
        const ex = grandEarnMap.get(e.name) || { usd: 0, zig: 0, taxCredit: !!e.taxCredit };
        ex.usd += e.allowance ?? 0;
        ex.zig += isDual ? (e.allowanceZIG ?? 0) : 0;
        grandEarnMap.set(e.name, ex);
      }
      for (const d of deductions) {
        const key = normalizeLabel(d.name);
        const ex = grandDedMap.get(key) || { usd: 0, zig: 0 };
        ex.usd += d.deduction ?? 0;
        ex.zig += isDual ? (d.deductionZIG ?? 0) : 0;
        grandDedMap.set(key, ex);
      }
      for (const r of employers) {
        const key = normalizeLabel(r.name);
        const ex = grandEmprMap.get(key) || { usd: 0 };
        ex.usd += r.employer ?? 0;
        grandEmprMap.set(key, ex);
      }
      grandNetUSD += netUSD; grandNetZIG += netZIG; grandHeadcount++;
      grandPayeUSD += Number(p.paye ?? 0);
      grandAidsUSD += Number(p.aidsLevy ?? 0);
      grandNssaUSD += Number(p.nssaEmployee ?? 0);

      const emp = p.employee as any;
      const deptName = emp.department?.name || g.name;

      // Employee header line
      cuerpo += `<div class="emp-header">
        <span class="emp-hf">CODE: </span><span class="emp-hv">${emp.employeeCode || '—'}</span>
        <span class="emp-hf">NAME: </span><span class="emp-hv">${(emp.lastName || '').toUpperCase()}${emp.firstName ? ', ' + emp.firstName : ''}</span>
        <span class="emp-hf">DEPARTMENT: </span><span class="emp-hv">${deptName.toUpperCase()}</span>
      </div>`;

      // Earnings column sub-header
      const earnsHdr = `<div class="col-hdr">
        <span class="col-hdr-lbl">EARNINGS</span>
        <span class="col-hdr-units">UNITS</span>
        <span class="col-hdr-amt">${isDual ? 'USD' : ccy}</span>
        ${isDual ? '<span class="col-hdr-zig">ZiG</span>' : ''}
      </div>`;
      const dedsHdr = `<div class="col-hdr">
        <span class="col-hdr-lbl">DEDUCTIONS</span>
        <span class="col-hdr-units">UNITS</span>
        <span class="col-hdr-amt">${isDual ? 'USD' : ccy}</span>
        ${isDual ? '<span class="col-hdr-zig">ZiG</span>' : ''}
      </div>`;

      let earnsHtml = earnsHdr;
      for (const e of earnings) {
        const isCr = !!e.taxCredit;
        earnsHtml += `<div class="data-row">
          <span class="${isCr ? 'data-desc-credit' : 'data-desc'}">${e.name}${isCr ? ' *' : ''}</span>
          <span class="data-units">${e.units != null ? `${e.units}${e.unitsType ? ' ' + e.unitsType : ''}` : ''}</span>
          <span class="${isCr ? 'data-amt-muted' : 'data-amt'}">${fmt2(e.allowance)}</span>
          ${isDual ? `<span class="${isCr ? 'data-amt-muted' : 'data-amt-zig'}">${(e.allowanceZIG ?? 0) !== 0 ? fmt2(e.allowanceZIG) : '—'}</span>` : ''}
        </div>`;
      }
      if (earnings.length === 0) earnsHtml += `<div class="data-row" style="height:14px"></div>`;

      let dedsHtml = dedsHdr;
      for (const d of deductions) {
        dedsHtml += `<div class="data-row">
          <span class="data-desc">${normalizeLabel(d.name)}</span>
          <span class="data-units">${d.units != null ? `${d.units}${d.unitsType ? ' ' + d.unitsType : ''}` : ''}</span>
          <span class="data-amt">${fmt2(d.deduction)}</span>
          ${isDual ? `<span class="data-amt-zig">${(d.deductionZIG ?? 0) !== 0 ? fmt2(d.deductionZIG) : '—'}</span>` : ''}
        </div>`;
      }
      if (deductions.length === 0) dedsHtml += `<div class="data-row" style="height:14px"></div>`;
      if (employers.length > 0) {
        dedsHtml += `<div class="empc-divider"></div><div class="empc-label">EMPLOYER CONTRIBUTIONS</div>`;
        for (const r of employers) {
          dedsHtml += `<div class="data-row">
            <span class="data-desc" style="color:#64748b;font-size:7px">${normalizeLabel(r.name)}</span>
            <span class="data-amt-muted">${fmt2(r.employer)}</span>
            ${isDual ? '<span class="data-amt-muted">—</span>' : ''}
          </div>`;
        }
      }

      cuerpo += `<div class="two-col">
        <div class="col-left">${earnsHtml}</div>
        <div class="col-right">${dedsHtml}</div>
      </div>`;

      // Totals row
      cuerpo += `<div class="two-col">
        <div class="col-left" style="border-right:0.5px solid #e2e8f0">
          <div class="emp-total-row">
            <span class="emp-total-lbl">TOTAL EARNINGS</span>
            <span class="emp-total-amt">${fmt2(totAllowUSD)}</span>
            ${isDual ? `<span class="emp-total-zig">${fmt2(totAllowZIG)}</span>` : ''}
          </div>
        </div>
        <div class="col-right">
          <div class="emp-total-row">
            <span class="emp-total-lbl">TOTAL DEDUCTIONS</span>
            <span class="emp-total-amt">${fmt2(totDedUSD)}</span>
            ${isDual ? `<span class="emp-total-zig">${fmt2(totDedZIG)}</span>` : ''}
          </div>
          <div class="net-row">
            <span class="net-lbl">NET PAY</span>
            <span class="net-amt">${ccy} ${fmt2(netUSD)}</span>
            ${isDual && netZIG > 0 ? `<span class="net-zig">ZiG ${fmt2(netZIG)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="emp-spacer"></div>`;

      jsonPayslips.push({
        employeeId: p.employeeId,
        employeeName: `${emp.firstName} ${emp.lastName}`,
        employeeCode: emp.employeeCode,
        department: g.name,
        basicSalary: basic,
        gross: Number(p.gross),
        paye: Number(p.paye),
        aidsLevy: Number(p.aidsLevy),
        nssaEmployee: Number(p.nssaEmployee),
        netPay: Number(p.netPay),
        isDual,
        displayLines: displayLines.map(l => ({
          name: l.name, allowance: l.allowance, allowanceZIG: l.allowanceZIG,
          deduction: l.deduction, deductionZIG: l.deductionZIG,
          employer: l.employer, taxCredit: l.taxCredit,
          units: l.units, unitsType: l.unitsType,
        })),
      });
    }

    // Department total footer
    cuerpo += `<div class="dept-total-bar">
      <span class="dept-total-for">TOTAL FOR: ${g.name.toUpperCase()}</span>
      <span class="dept-total-emps">EMPLOYEES: ${gHeadcount}</span>
      <span class="dept-total-spacer"></span>
      <span class="dept-total-net-lbl">NET PAY:</span>
      <span class="dept-total-amt">${ccy} ${fmt2(gNetUSD)}</span>
      ${isDual && gNetZIG > 0 ? `<span class="dept-total-zig">ZiG ${fmt2(gNetZIG)}</span>` : ''}
    </div>
    <div class="dept-stat-row">
      <div class="dept-stat-item"><span class="dept-stat-lbl">PAYE:</span><span class="dept-stat-amt">${ccy} ${fmt2(gPayeUSD)}</span></div>
      <div class="dept-stat-item"><span class="dept-stat-lbl">AIDS LEVY:</span><span class="dept-stat-amt">${ccy} ${fmt2(gAidsUSD)}</span></div>
      <div class="dept-stat-item"><span class="dept-stat-lbl">NSSA EMP:</span><span class="dept-stat-amt">${ccy} ${fmt2(gNssaUSD)}</span></div>
    </div>`;

    jsonGroups.push({ name: g.name, payslips: jsonPayslips });
  }

  // ── Grand Totals
  const grandEarnLines = [...grandEarnMap.entries()].map(([name, v]) => ({ name, ...v }));
  const grandDedLines  = [...grandDedMap.entries()].map(([name, v]) => ({ name, ...v }));
  const grandEmprLines = [...grandEmprMap.entries()].map(([name, v]) => ({ name, ...v }));
  const gtEarnUSD = grandEarnLines.filter(l => !l.taxCredit).reduce((a, l) => a + l.usd, 0);
  const gtEarnZIG = grandEarnLines.filter(l => !l.taxCredit).reduce((a, l) => a + l.zig, 0);
  const gtDedUSD  = grandDedLines.reduce((a, l) => a + l.usd, 0);
  const gtDedZIG  = grandDedLines.reduce((a, l) => a + l.zig, 0);

  const earnsHdrG = `<div class="col-hdr">
    <span class="col-hdr-lbl">EARNINGS</span>
    <span class="col-hdr-amt">${isDual ? 'USD' : ccy}</span>
    ${isDual ? '<span class="col-hdr-zig">ZiG</span>' : ''}
  </div>`;
  const dedsHdrG = `<div class="col-hdr">
    <span class="col-hdr-lbl">DEDUCTIONS</span>
    <span class="col-hdr-amt">${isDual ? 'USD' : ccy}</span>
    ${isDual ? '<span class="col-hdr-zig">ZiG</span>' : ''}
  </div>`;

  let gtEarnsHtml = earnsHdrG;
  for (const e of grandEarnLines) {
    const isCr = !!e.taxCredit;
    gtEarnsHtml += `<div class="data-row">
      <span class="${isCr ? 'data-desc-credit' : 'data-desc'}">${e.name}${isCr ? ' *' : ''}</span>
      <span class="${isCr ? 'data-amt-muted' : 'data-amt'}">${fmt2(e.usd)}</span>
      ${isDual ? `<span class="${isCr ? 'data-amt-muted' : 'data-amt-zig'}">${e.zig !== 0 ? fmt2(e.zig) : '—'}</span>` : ''}
    </div>`;
  }

  let gtDedsHtml = dedsHdrG;
  for (const d of grandDedLines) {
    gtDedsHtml += `<div class="data-row">
      <span class="data-desc">${d.name}</span>
      <span class="data-amt">${fmt2(d.usd)}</span>
      ${isDual ? `<span class="data-amt-zig">${d.zig !== 0 ? fmt2(d.zig) : '—'}</span>` : ''}
    </div>`;
  }
  if (grandEmprLines.length > 0) {
    gtDedsHtml += `<div class="empc-divider"></div><div class="empc-label">EMPLOYER CONTRIBUTIONS</div>`;
    for (const r of grandEmprLines) {
      gtDedsHtml += `<div class="data-row">
        <span class="data-desc" style="color:#64748b;font-size:7px">${r.name}</span>
        <span class="data-amt-muted">${fmt2(r.usd)}</span>
        ${isDual ? '<span class="data-amt-muted">—</span>' : ''}
      </div>`;
    }
  }

  cuerpo += `
  <div class="grand-bar"><span class="gt-lbl">GRAND TOTALS</span></div>
  <div class="two-col">
    <div class="col-left">${gtEarnsHtml}</div>
    <div class="col-right">${gtDedsHtml}</div>
  </div>
  <div class="two-col">
    <div class="col-left" style="border-right:0.5px solid #e2e8f0">
      <div class="emp-total-row">
        <span class="emp-total-lbl">TOTAL EARNINGS</span>
        <span class="emp-total-amt">${fmt2(gtEarnUSD)}</span>
        ${isDual ? `<span class="emp-total-zig">${fmt2(gtEarnZIG)}</span>` : ''}
      </div>
    </div>
    <div class="col-right">
      <div class="emp-total-row">
        <span class="emp-total-lbl">TOTAL DEDUCTIONS</span>
        <span class="emp-total-amt">${fmt2(gtDedUSD)}</span>
        ${isDual ? `<span class="emp-total-zig">${fmt2(gtDedZIG)}</span>` : ''}
      </div>
      <div class="net-row">
        <span class="net-lbl">NET PAY</span>
        <span class="net-amt">${ccy} ${fmt2(grandNetUSD)}</span>
        ${isDual && grandNetZIG > 0 ? `<span class="net-zig">ZiG ${fmt2(grandNetZIG)}</span>` : ''}
      </div>
    </div>
  </div>
  <div class="grand-bar" style="margin-top:6px">
    <span class="gt-lbl">STATUTORY TOTALS</span>
    <span class="gt-stat-lbl">PAYE:</span><span class="gt-stat-amt">${ccy} ${fmt2(grandPayeUSD)}</span>
    <span class="gt-stat-lbl">AIDS LEVY:</span><span class="gt-stat-amt">${ccy} ${fmt2(grandAidsUSD)}</span>
    <span class="gt-stat-lbl">NSSA EMP:</span><span class="gt-stat-amt">${ccy} ${fmt2(grandNssaUSD)}</span>
    <span style="flex:1"></span>
    <span class="gt-net-lbl">TOTAL EMP:</span>
    <span class="gt-net-amt">${grandHeadcount}</span>
  </div>
  <div class="end-note">END OF REPORT...</div>
  <div class="page-footer">${LOGO} &nbsp; Bantu Modern HR &amp; Payroll Automation &nbsp;|&nbsp; CONFIDENTIAL DOCUMENT</div>`;

  const jsonData = {
    runId,
    companyName: run.company?.name || '',
    period,
    currency: run.dualCurrency ? 'USD + ZiG' : (run.currency || 'USD'),
    exchangeRate: run.exchangeRate ?? null,
    isDual,
    groups: jsonGroups,
  };

  const format = c.req.query('format');
  if (format === 'json') {
    return c.json({ data: jsonData });
  }

  return c.html(wrapSummaryHtml('Payslip Summary', cuerpo));
});

router.get('/nssa-p4a', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  const month = c.req.query('month');
  const year = c.req.query('year');
  if (!companyId || !month || !year) return c.json({ message: 'companyId, month, and year are required' }, 400);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRun: yearPeriodFilter(companyId, year, month) as any },
    include: { payrollRun: { include: { company: true } } },
  });
  if (payslips.length === 0) return c.json({ message: 'No completed payroll data for this period' }, 404);

  const company = payslips[0].payrollRun.company;
  if (!company.nssaNumber) return c.json({ message: 'NSSA employer registration number is required' }, 422);

  const byCurrency: Record<string, any> = {};
  for (const ps of payslips) {
    const curr = (ps as any).currency || 'USD';
    if (!byCurrency[curr]) byCurrency[curr] = { totalInsurable: 0, totalEmpNssa: 0, totalEmprNssa: 0 };
    const insurable = ps.nssaBasis || ps.gross || 0;
    byCurrency[curr].totalInsurable += Number(insurable);
    byCurrency[curr].totalEmpNssa += Number(ps.nssaEmployee || 0);
    byCurrency[curr].totalEmprNssa += Number(ps.nssaEmployer || ps.nssaEmployee || 0);
  }

  const selectedCurrency = byCurrency['USD'] ? 'USD' : Object.keys(byCurrency)[0];
  const t = byCurrency[selectedCurrency];
  const totalRemittance = t.totalEmpNssa + t.totalEmprNssa;

  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>NSSA P4A Return</h1></div><p class="sub">${company.name} | NSSA#: ${company.nssaNumber}</p></div>`;
  cuerpo += `<table style="width:auto;margin:12px auto"><tr><th style="padding:8px">Item</th><th class="r" style="padding:8px">Amount (${selectedCurrency})</th></tr>`;
  cuerpo += `<tr><td>Period</td><td class="r">${month}/${year}</td></tr>`;
  cuerpo += `<tr><td>Total Insurable Earnings</td><td class="r">${fmt2(t.totalInsurable)}</td></tr>`;
  cuerpo += `<tr><td>Total Employee NSSA</td><td class="r">${fmt2(t.totalEmpNssa)}</td></tr>`;
  cuerpo += `<tr><td>Total Employer NSSA</td><td class="r">${fmt2(t.totalEmprNssa)}</td></tr>`;
  cuerpo += `<tr class="total"><td>Total Remittance Due</td><td class="r">${fmt2(totalRemittance)}</td></tr>`;
  cuerpo += `</table><p style="text-align:center;color:#64748b;font-size:10px">This is a print-ready view. Use your browser's Print → Save as PDF to generate the official document.</p>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;

  return c.html(wrapHtml(`NSSA P4A - ${month}/${year}`, cuerpo));
});

router.get('/it7/:employeeId/:year', requirePermission('view_reports'), async (c) => {
  const { employeeId, year } = c.req.param();
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: { company: true },
  });
  if (!employee) return c.json({ message: 'Employee not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && employee.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const y = parseInt(year);
  const yearStart = new Date(y, 0, 1);
  const yearEnd = new Date(y + 1, 0, 1);

  const [payslips, transactions] = await Promise.all([
    prisma.payslip.findMany({
      where: { employeeId, payrollRun: { startDate: { gte: yearStart }, endDate: { lt: yearEnd }, status: 'COMPLETED' } },
    }),
    prisma.payrollTransaction.findMany({
      where: { employeeId, payrollRun: { startDate: { gte: yearStart }, endDate: { lt: yearEnd }, status: 'COMPLETED' } },
      include: { transactionCode: { select: { type: true, code: true, incomeCategory: true } } },
    }),
  ]);
  if (payslips.length === 0) return c.json({ message: 'No completed payroll data for this year' }, 404);

  const totals = payslips.reduce((acc, ps) => ({
    totalNssa: acc.totalNssa + Number(ps.nssaEmployee || 0),
    totalPaye: acc.totalPaye + Number(ps.paye || 0),
    totalAidsLevy: acc.totalAidsLevy + Number(ps.aidsLevy || 0),
  }), { totalNssa: 0, totalPaye: 0, totalAidsLevy: 0 });

  let totalGross = 0, totalBonus = 0, totalBenefits = 0, totalAllowances = 0, totalPension = 0;
  for (const tx of transactions) {
    const tc = tx.transactionCode; if (!tc) continue;
    const amt = Math.abs(tx.amount || 0);
    const cat = tc.incomeCategory;
    const code = (tc.code || '').toUpperCase();
    if (tc.type === 'EARNING') {
      if (cat === 'BONUS' || cat === 'GRATUITY' || (!cat && (code.includes('BONUS') || code.includes('GRATUITY')))) totalBonus += amt;
      else if (cat === 'ALLOWANCE' || cat === 'OVERTIME' || cat === 'COMMISSION' || (!cat && code.includes('ALLOWANCE'))) totalAllowances += amt;
      else totalGross += amt;
    } else if (tc.type === 'BENEFIT') {
      totalBenefits += amt;
    } else if (tc.type === 'DEDUCTION' && cat === 'PENSION') {
      totalPension += amt;
    }
  }

  const sym = currencySymbol(employee.currency);
  const empName = `${employee.firstName} ${employee.lastName}`;

  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>IT7 Tax Certificate</h1></div><p class="sub">Tax Year ${year} | ${empName}</p></div>`;
  cuerpo += `<table style="width:100%;margin:8px 0"><tr><td style="width:50%;vertical-align:top;padding-right:12px"><table style="width:100%"><tr><th colspan="2">Employee Details</th></tr>`;
  cuerpo += `<tr><td>Name</td><td>${empName}</td></tr>`;
  cuerpo += `<tr><td>TIN</td><td>${employee.tin || '—'}</td></tr>`;
  cuerpo += `<tr><td>National ID</td><td>${employee.passportNumber || '—'}</td></tr>`;
  cuerpo += `<tr><td>Job Title</td><td>${employee.position || '—'}</td></tr>`;
  cuerpo += `<tr><td>Currency</td><td>${employee.currency || 'USD'}</td></tr>`;
  cuerpo += `<tr><td>Period</td><td>01 Jan ${year} - 31 Dec ${year}</td></tr>`;
  cuerpo += `</table></td><td style="width:50%;vertical-align:top"><table style="width:100%"><tr><th colspan="2">Employer Details</th></tr>`;
  cuerpo += `<tr><td>Name</td><td>${employee.company?.name || '—'}</td></tr>`;
  cuerpo += `<tr><td>TIN</td><td>${employee.company?.taxId || '—'}</td></tr>`;
  cuerpo += `<tr><td>Address</td><td>${employee.company?.address || '—'}</td></tr>`;
  cuerpo += `</table></td></tr></table>`;

  cuerpo += `<h3 style="margin:10px 0 4px">Income & Deductions Summary (${sym})</h3>`;
  cuerpo += `<table><tr><th>Item</th><th class="r">Amount</th></tr>`;
  cuerpo += `<tr><td>Gross Employment Income</td><td class="r">${fmt2(totalGross)}</td></tr>`;
  cuerpo += `<tr><td>Bonus & Gratuity</td><td class="r">${fmt2(totalBonus)}</td></tr>`;
  cuerpo += `<tr><td>Allowances (Overtime/Commission)</td><td class="r">${fmt2(totalAllowances)}</td></tr>`;
  cuerpo += `<tr><td>Benefits in Kind</td><td class="r">${fmt2(totalBenefits)}</td></tr>`;
  cuerpo += `<tr><td>Pension Contributions</td><td class="r">${fmt2(totalPension)}</td></tr>`;
  cuerpo += `<tr><td>NSSA Contributions</td><td class="r">${fmt2(totals.totalNssa)}</td></tr>`;
  cuerpo += `<tr><td>PAYE Tax Deducted</td><td class="r">${fmt2(totals.totalPaye)}</td></tr>`;
  cuerpo += `<tr><td>AIDS Levy</td><td class="r">${fmt2(totals.totalAidsLevy)}</td></tr>`;
  cuerpo += `<tr class="total"><td>Total Tax Deducted</td><td class="r">${fmt2(totals.totalPaye + totals.totalAidsLevy)}</td></tr>`;
  cuerpo += `</table>`;
  cuerpo += `<p style="text-align:center;color:#64748b;font-size:10px;margin-top:12px">This is a print-ready view. Use your browser's Print → Save as PDF to generate the official document.</p>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;

  return c.html(wrapHtml(`IT7 - ${empName} ${year}`, cuerpo));
});

router.get('/p2', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  const month = c.req.query('month');
  const year = c.req.query('year');
  if (!companyId || !month || !year) return c.json({ message: 'companyId, month, and year are required' }, 400);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRun: yearPeriodFilter(companyId, year, month) as any },
    include: { payrollRun: { include: { company: true } } },
  });
  if (payslips.length === 0) return c.json({ message: 'No completed payroll data for this period' }, 404);

  const company = payslips[0].payrollRun.company;
  const byCurrency: Record<string, { totalRemuneration: number; totalPaye: number; totalAidsLevy: number; employeeCount: number }> = {};
  for (const ps of payslips) {
    const curr = (ps as any).currency || 'USD';
    if (!byCurrency[curr]) byCurrency[curr] = { totalRemuneration: 0, totalPaye: 0, totalAidsLevy: 0, employeeCount: 0 };
    byCurrency[curr].totalRemuneration += Number(ps.gross || 0);
    byCurrency[curr].totalPaye += Number(ps.paye || 0);
    byCurrency[curr].totalAidsLevy += Number(ps.aidsLevy || 0);
    byCurrency[curr].employeeCount++;
  }
  const curr = byCurrency['USD'] ? 'USD' : Object.keys(byCurrency)[0];
  const t = byCurrency[curr];
  const sym = currencySymbol(curr);

  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>ZIMRA P2 Monthly PAYE Return</h1></div><p class="sub">${company.name} | Period: ${month}/${year} (${curr})</p></div>`;
  cuerpo += `<table style="width:auto;margin:12px auto"><tr><th style="padding:8px">Item</th><th class="r" style="padding:8px">Amount (${sym})</th></tr>`;
  cuerpo += `<tr><td>Number of Employees</td><td class="r">${t.employeeCount}</td></tr>`;
  cuerpo += `<tr><td>Total Remuneration</td><td class="r">${fmt2(t.totalRemuneration)}</td></tr>`;
  cuerpo += `<tr><td>PAYE Deducted</td><td class="r">${fmt2(t.totalPaye)}</td></tr>`;
  cuerpo += `<tr><td>AIDS Levy</td><td class="r">${fmt2(t.totalAidsLevy)}</td></tr>`;
  cuerpo += `<tr class="total"><td>Total PAYE Due</td><td class="r">${fmt2(t.totalPaye + t.totalAidsLevy)}</td></tr>`;
  cuerpo += `</table><p style="text-align:center;color:#64748b;font-size:10px">Print-ready view. Use browser Print → Save as PDF.</p>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;
  return c.html(wrapHtml(`P2 - ${month}/${year}`, cuerpo));
});

router.get('/total-journal', requirePermission('view_reports'), async (c) => {
  const runId = c.req.query('runId');
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
  if (!run) return c.json({ message: 'Run not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const txns = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: runId },
    include: { transactionCode: { select: { code: true, name: true, type: true } } },
    orderBy: [{ transactionCode: { type: 'asc' } }, { transactionCode: { code: 'asc' } }],
  });

  const tcMap: Record<string, any> = {};
  for (const t of txns) {
    if (!t.transactionCode) continue;
    const key = t.transactionCode.code || 'UNKNOWN';
    if (!tcMap[key]) tcMap[key] = { code: key, name: t.transactionCode.name, type: t.transactionCode.type, total: 0 };
    tcMap[key].total += Number(t.amount || 0);
  }

  const period = `${new Date(run.startDate).toLocaleDateString()} - ${new Date(run.endDate).toLocaleDateString()}`;
  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>Total Payroll Journal</h1></div><p class="sub">${run.company?.name || ''} | ${period}</p></div>`;
  cuerpo += `<table><tr><th>TC Code</th><th>Description</th><th>Type</th><th class="r">Debit</th><th class="r">Credit</th></tr>`;
  let totDebit = 0, totCredit = 0;
  for (const tc of Object.values(tcMap) as any[]) {
    const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
    const debit = isEarning ? 0 : tc.total;
    const credit = isEarning ? tc.total : 0;
    totDebit += debit; totCredit += credit;
    cuerpo += `<tr><td>${tc.code}</td><td>${tc.name}</td><td>${tc.type}</td><td class="r">${debit ? fmt2(debit) : '—'}</td><td class="r">${credit ? fmt2(credit) : '—'}</td></tr>`;
  }
  cuerpo += `<tr class="total"><td>TOTAL</td><td></td><td></td><td class="r">${fmt2(totDebit)}</td><td class="r">${fmt2(totCredit)}</td></tr></table>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;
  return c.html(wrapHtml('Total Payroll Journal', cuerpo));
});

router.get('/department-journal', requirePermission('view_reports'), async (c) => {
  const runId = c.req.query('runId');
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
  if (!run) return c.json({ message: 'Run not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const txns = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: runId },
    include: {
      transactionCode: { select: { code: true, name: true, type: true } },
      employee: { include: { department: { select: { name: true } } } },
    },
    orderBy: [{ employee: { department: { name: 'asc' } } }, { transactionCode: { code: 'asc' } }],
  });

  const deptMap: Record<string, any> = {};
  for (const t of txns) {
    const dept = t.employee?.department?.name || 'General';
    const tc = t.transactionCode;
    const key = `${dept}__${tc?.code || 'UNKNOWN'}`;
    if (!deptMap[key]) deptMap[key] = { dept, code: tc?.code || 'UNKNOWN', name: tc?.name || '', type: tc?.type || '', total: 0 };
    deptMap[key].total += Number(t.amount || 0);
  }

  const period = `${new Date(run.startDate).toLocaleDateString()} - ${new Date(run.endDate).toLocaleDateString()}`;
  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>Department Payroll Journal</h1></div><p class="sub">${run.company?.name || ''} | ${period}</p></div>`;
  cuerpo += `<table><tr><th>Department</th><th>TC Code</th><th>Description</th><th>Type</th><th class="r">Debit</th><th class="r">Credit</th></tr>`;
  let totDebit = 0, totCredit = 0;
  for (const tc of Object.values(deptMap) as any[]) {
    const isEarning = tc.type === 'EARNING' || tc.type === 'BENEFIT';
    const debit = isEarning ? 0 : tc.total;
    const credit = isEarning ? tc.total : 0;
    totDebit += debit; totCredit += credit;
    cuerpo += `<tr><td>${tc.dept}</td><td>${tc.code}</td><td>${tc.name}</td><td>${tc.type}</td><td class="r">${debit ? fmt2(debit) : '—'}</td><td class="r">${credit ? fmt2(credit) : '—'}</td></tr>`;
  }
  cuerpo += `<tr class="total"><td>TOTAL</td><td></td><td></td><td></td><td class="r">${fmt2(totDebit)}</td><td class="r">${fmt2(totCredit)}</td></tr></table>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;
  return c.html(wrapHtml('Department Payroll Journal', cuerpo));
});

router.get('/medical-aid', requirePermission('view_reports'), async (c) => {
  const runId = c.req.query('runId');
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
  if (!run) return c.json({ message: 'Run not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const txns = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: runId, transactionCode: { OR: [{ incomeCategory: 'MEDICAL_AID' }, { name: { contains: 'medical' } }], type: 'DEDUCTION' } },
    include: { transactionCode: { select: { code: true, name: true } }, employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
    orderBy: { employee: { lastName: 'asc' } },
  });

  const period = `${new Date(run.startDate).toLocaleDateString()} - ${new Date(run.endDate).toLocaleDateString()}`;
  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>Medical Aid Report</h1></div><p class="sub">${run.company?.name || ''} | ${period}</p></div>`;
  cuerpo += `<table><tr><th>Code</th><th>Employee</th><th>TC Code</th><th>Plan</th><th class="r">Amount</th></tr>`;
  let total = 0;
  for (const t of txns) {
    const amt = Number(t.amount || 0); total += amt;
    cuerpo += `<tr><td>${t.employee.employeeCode}</td><td>${t.employee.firstName} ${t.employee.lastName}</td><td>${t.transactionCode.code}</td><td>${t.transactionCode.name}</td><td class="r">${fmt2(amt)}</td></tr>`;
  }
  if (txns.length === 0) cuerpo += `<tr><td colspan="5" class="c">No medical aid transactions found</td></tr>`;
  cuerpo += `<tr class="total"><td>TOTAL</td><td></td><td></td><td></td><td class="r">${fmt2(total)}</td></tr></table>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;
  return c.html(wrapHtml('Medical Aid Report', cuerpo));
});

router.get('/overtime', requirePermission('view_reports'), async (c) => {
  const runId = c.req.query('runId');
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
  if (!run) return c.json({ message: 'Run not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const txns = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: runId, transactionCode: { type: 'EARNING', OR: [{ incomeCategory: 'OVERTIME' }, { name: { contains: 'overtime' } }, { code: { startsWith: 'OT' } }] } },
    include: { transactionCode: { select: { code: true, name: true } }, employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
    orderBy: { employee: { lastName: 'asc' } },
  });

  const period = `${new Date(run.startDate).toLocaleDateString()} - ${new Date(run.endDate).toLocaleDateString()}`;
  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>Overtime Report</h1></div><p class="sub">${run.company?.name || ''} | ${period}</p></div>`;
  cuerpo += `<table><tr><th>Code</th><th>Employee</th><th>OT Type</th><th class="r">Amount</th></tr>`;
  let total = 0;
  for (const t of txns) {
    const amt = Number(t.amount || 0); total += amt;
    cuerpo += `<tr><td>${t.employee.employeeCode}</td><td>${t.employee.firstName} ${t.employee.lastName}</td><td>${t.transactionCode.name}</td><td class="r">${fmt2(amt)}</td></tr>`;
  }
  if (txns.length === 0) cuerpo += `<tr><td colspan="4" class="c">No overtime transactions found</td></tr>`;
  cuerpo += `<tr class="total"><td>TOTAL</td><td></td><td></td><td class="r">${fmt2(total)}</td></tr></table>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;
  return c.html(wrapHtml('Overtime Report', cuerpo));
});

router.get('/salary-advance', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  const where: Record<string, unknown> = {};
  if (companyId) where.employee = { companyId };
  where.OR = [{ type: 'SALARY_ADVANCE' }, { type: { contains: 'advance' } }];

  const loans = await prisma.loan.findMany({
    where,
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true } } },
    orderBy: { employee: { lastName: 'asc' } },
  });

  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>Salary Advance Report</h1></div><p class="sub">As at ${new Date().toLocaleDateString()}</p></div>`;
  cuerpo += `<table><tr><th>Code</th><th>Employee</th><th class="r">Principal</th><th class="r">Balance</th><th class="r">Monthly</th><th>Status</th><th>Start Date</th></tr>`;
  let totPrincipal = 0, totBalance = 0;
  for (const l of loans) {
    const principal = Number(l.amount || 0); const balance = Number((l as any).balance || l.amount || 0);
    totPrincipal += principal; totBalance += balance;
    cuerpo += `<tr><td>${l.employee.employeeCode}</td><td>${l.employee.firstName} ${l.employee.lastName}</td><td class="r">${fmt2(principal)}</td><td class="r">${fmt2(balance)}</td><td class="r">${(l as any).installmentAmount ? fmt2((l as any).installmentAmount) : '—'}</td><td>${l.status || '—'}</td><td>${l.startDate ? new Date(l.startDate).toLocaleDateString() : '—'}</td></tr>`;
  }
  if (loans.length === 0) cuerpo += `<tr><td colspan="7" class="c">No salary advances on record</td></tr>`;
  cuerpo += `<tr class="total"><td>TOTAL</td><td></td><td class="r">${fmt2(totPrincipal)}</td><td class="r">${fmt2(totBalance)}</td><td></td><td></td><td></td></tr></table>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;
  return c.html(wrapHtml('Salary Advance Report', cuerpo));
});

router.get('/leave-provision', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  const where: Record<string, unknown> = {};
  if (companyId) where.employee = { companyId };

  const balances = await prisma.leaveBalance.findMany({
    where,
    include: { employee: { select: { employeeCode: true, firstName: true, lastName: true, baseRate: true, currency: true } } },
    orderBy: [{ employee: { lastName: 'asc' } }, { leaveType: 'asc' }],
  });

  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>Leave Provision Report</h1></div><p class="sub">As at ${new Date().toLocaleDateString()}</p></div>`;
  cuerpo += `<table><tr><th>Code</th><th>Employee</th><th>Leave Type</th><th class="r">Balance Days</th><th class="r">Daily Rate</th><th class="r">Provision</th><th>Currency</th></tr>`;
  let totProvision = 0;
  for (const b of balances) {
    const days = Number(b.balance || 0);
    const monthlyRate = Number(b.employee?.baseRate || 0);
    const dailyRate = monthlyRate > 0 ? monthlyRate / 30 : 0;
    const provision = days * dailyRate;
    totProvision += provision;
    cuerpo += `<tr><td>${b.employee.employeeCode}</td><td>${b.employee.firstName} ${b.employee.lastName}</td><td>${b.leaveType || '—'}</td><td class="r">${days.toFixed(1)}</td><td class="r">${fmt2(dailyRate)}</td><td class="r">${fmt2(provision)}</td><td>${b.employee.currency || 'USD'}</td></tr>`;
  }
  if (balances.length === 0) cuerpo += `<tr><td colspan="7" class="c">No leave balances on record</td></tr>`;
  cuerpo += `<tr class="total"><td>TOTAL</td><td></td><td></td><td></td><td></td><td class="r">${fmt2(totProvision)}</td><td></td></tr></table>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;
  return c.html(wrapHtml('Leave Provision Report', cuerpo));
});

router.get('/employee-listing', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  const where: Record<string, unknown> = {};
  if (companyId) where.companyId = companyId;
  where.status = { not: 'TERMINATED' };

  const employees = await prisma.employee.findMany({
    where,
    include: { department: { select: { name: true } } },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  let cuerpo = `<div class="header"><div class="logo-row">${LOGO}<h1>Employee Listing</h1></div><p class="sub">Active employees as at ${new Date().toLocaleDateString()}</p></div>`;
  cuerpo += `<table><tr><th>Code</th><th>First Name</th><th>Last Name</th><th>Department</th><th>Position</th><th>Type</th><th>Start Date</th></tr>`;
  for (const e of employees) {
    cuerpo += `<tr><td>${e.employeeCode || '—'}</td><td>${e.firstName || '—'}</td><td>${e.lastName || '—'}</td><td>${e.department?.name || '—'}</td><td>${e.position || '—'}</td><td>${(e.employmentType || '').replace(/_/g, ' ')}</td><td>${e.startDate ? new Date(e.startDate).toLocaleDateString() : '—'}</td></tr>`;
  }
  if (employees.length === 0) cuerpo += `<tr><td colspan="7" class="c">No active employees found</td></tr>`;
  cuerpo += `<tr class="total"><td>${employees.length} employees</td><td></td><td></td><td></td><td></td><td></td><td></td></tr></table>`;
  cuerpo += `<div class="footer">Generated on ${new Date().toLocaleString()} | Bantu Payroll</div>`;
  return c.html(wrapHtml('Employee Listing', cuerpo));
});

export default router;
