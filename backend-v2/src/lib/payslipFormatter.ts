import type { YtdResult } from './ytdCalculator';

export interface LineItem {
  name: string;
  description?: string | null;
  allowance: number;
  allowanceZIG: number | null;
  deduction: number;
  deductionZIG: number | null;
  employer: number;
  ytd: number;
  ytdZIG: number | null;
  units?: number | null;
  unitsType?: string | null;
  taxCredit?: boolean;
}

interface BuildPayslipLineItemsParams {
  payslip: any;
  transactions: any[];
  ytdStat: any;
  ytdMap: Record<string, number>;
  ytdStatZIG: any;
  ytdMapZIG: Record<string, number>;
  basicSalary: number;
}

export function buildPayslipLineItems(params: BuildPayslipLineItemsParams): LineItem[] {
  const { payslip, transactions, ytdStat, ytdMap, ytdStatZIG, ytdMapZIG, basicSalary } = params;
  const isDual = payslip.payrollRun?.dualCurrency || (payslip.grossZIG != null && payslip.grossZIG !== 0);

  const isMedicalAidTc = (tc: any) => {
    const name = (tc.name || '').toLowerCase();
    const code = (tc.code || '').toUpperCase();
    return tc.incomeCategory === 'MEDICAL_AID'
      || /medical\s*aid|med\s*aid/.test(name)
      || /MED_AID|MEDICAL_AID/.test(code)
      || code === '301';
  };

  const groupTxsByTc = (txs: any[]) => {
    if (!isDual) return txs.map(t => ({
      tc: t.transactionCode, tcId: t.transactionCodeId,
      amountUSD: t.amount, amountZIG: null,
      description: t.description, units: t.units, unitsType: t.unitsType,
    }));
    const map = new Map<string, any>();
    for (const t of txs) {
      if (!map.has(t.transactionCodeId)) {
        map.set(t.transactionCodeId, {
          tc: t.transactionCode, tcId: t.transactionCodeId,
          amountUSD: 0, amountZIG: 0,
          description: t.description, units: t.units, unitsType: t.unitsType,
        });
      }
      const entry = map.get(t.transactionCodeId);
      if (t.currency === 'ZiG') entry.amountZIG += t.amount;
      else entry.amountUSD += t.amount;
    }
    return [...map.values()];
  };

  const isEarningTc = (tc: any) => tc.type === 'EARNING' || tc.type === 'BENEFIT';
  const isDeductionTc = (tc: any) => tc.type === 'DEDUCTION' && !isMedicalAidTc(tc);
  const isMedAidTc = (tc: any) => tc.type === 'DEDUCTION' && isMedicalAidTc(tc);

  const earningGroups = groupTxsByTc(transactions.filter((t: any) => isEarningTc(t.transactionCode)));
  const deductionGroups = groupTxsByTc(transactions.filter((t: any) => isDeductionTc(t.transactionCode)));
  const medicalAidGroups = groupTxsByTc(transactions.filter((t: any) => isMedAidTc(t.transactionCode)));

  const zigEarningsSum = isDual ? earningGroups.reduce((s, g) => s + (g.amountZIG || 0), 0) : 0;
  const basicSalaryZIG = isDual ? Math.max(0, (payslip.grossZIG || 0) - zigEarningsSum) : null;

  const lines: LineItem[] = [
    {
      name: 'Basic Salary',
      allowance: basicSalary, allowanceZIG: basicSalaryZIG,
      deduction: 0, deductionZIG: null,
      employer: 0, ytd: ytdStat.basicSalary, ytdZIG: isDual ? (basicSalaryZIG ?? null) : null,
    },
  ];

  for (const g of earningGroups) {
    lines.push({
      name: g.tc.name,
      description: g.description,
      allowance: g.amountUSD,
      allowanceZIG: isDual ? g.amountZIG : null,
      deduction: 0, deductionZIG: null,
      employer: 0,
      ytd: ytdMap[g.tcId] ?? g.amountUSD,
      ytdZIG: isDual ? (ytdMapZIG[g.tcId] ?? g.amountZIG ?? null) : null,
      units: g.units ?? null,
      unitsType: g.unitsType ?? null,
    });
  }

  lines.push({
    name: 'PAYE',
    allowance: 0, allowanceZIG: null,
    deduction: isDual ? (payslip.payeUSD ?? payslip.paye) : payslip.paye,
    deductionZIG: isDual ? (payslip.payeZIG ?? null) : null,
    employer: 0, ytd: ytdStat.paye, ytdZIG: isDual ? (ytdStatZIG?.paye ?? null) : null,
  });

  if ((payslip.medicalAidCredit || 0) > 0) {
    lines.push({
      name: 'Medical Aid Credit', allowance: payslip.medicalAidCredit, allowanceZIG: null,
      deduction: 0, deductionZIG: null, employer: 0,
      ytd: ytdStat.medicalAidCredit, ytdZIG: null, taxCredit: true,
    });
  }

  lines.push({
    name: 'AIDS Levy',
    allowance: 0, allowanceZIG: null,
    deduction: isDual ? (payslip.aidsLevyUSD ?? payslip.aidsLevy) : payslip.aidsLevy,
    deductionZIG: isDual ? (payslip.aidsLevyZIG ?? null) : null,
    employer: 0, ytd: ytdStat.aidsLevy, ytdZIG: isDual ? (ytdStatZIG?.aidsLevy ?? null) : null,
  });

  lines.push({
    name: 'NSSA Employee',
    allowance: 0, allowanceZIG: null,
    deduction: isDual ? (payslip.nssaUSD ?? payslip.nssaEmployee) : payslip.nssaEmployee,
    deductionZIG: isDual ? (payslip.nssaZIG ?? null) : null,
    employer: 0, ytd: ytdStat.nssaEmployee, ytdZIG: isDual ? (ytdStatZIG?.nssaEmployee ?? null) : null,
  });

  if (payslip.necLevy > 0) {
    lines.push({
      name: 'NEC Employee', allowance: 0, allowanceZIG: null,
      deduction: payslip.necLevy, deductionZIG: null, employer: 0,
      ytd: ytdStat.necLevy, ytdZIG: null,
    });
  }

  for (const g of deductionGroups) {
    lines.push({
      name: g.tc.name,
      allowance: 0, allowanceZIG: null,
      deduction: g.amountUSD,
      deductionZIG: isDual ? g.amountZIG : null,
      employer: 0,
      ytd: ytdMap[g.tcId] ?? g.amountUSD,
      ytdZIG: isDual ? (ytdMapZIG[g.tcId] ?? g.amountZIG ?? null) : null,
      units: g.units ?? null,
      unitsType: g.unitsType ?? null,
    });
  }

  if (payslip.loanDeductions > 0) {
    lines.push({
      name: 'Loan Repayments', allowance: 0, allowanceZIG: null,
      deduction: payslip.loanDeductions, deductionZIG: null, employer: 0,
      ytd: ytdStat.loanDeductions, ytdZIG: null,
    });
  }

  for (const g of medicalAidGroups) {
    lines.push({
      name: g.tc.name,
      allowance: 0, allowanceZIG: null,
      deduction: g.amountUSD,
      deductionZIG: isDual ? g.amountZIG : null,
      employer: g.amountUSD,
      ytd: ytdMap[g.tcId] ?? g.amountUSD,
      ytdZIG: isDual ? (ytdMapZIG[g.tcId] ?? g.amountZIG ?? null) : null,
      units: g.units ?? null,
      unitsType: g.unitsType ?? null,
    });
  }

  if (payslip.nssaEmployer > 0) {
    lines.push({
      name: 'NSSA Employer', allowance: 0, allowanceZIG: null,
      deduction: 0, deductionZIG: null, employer: payslip.nssaEmployer,
      ytd: ytdStat.nssaEmployer, ytdZIG: null,
    });
  }
  if (payslip.zimdefEmployer > 0) {
    lines.push({
      name: 'ZIMDEF (Manpower)', allowance: 0, allowanceZIG: null,
      deduction: 0, deductionZIG: null, employer: payslip.zimdefEmployer,
      ytd: ytdStat.zimdefEmployer, ytdZIG: null,
    });
  }
  if (payslip.sdfContribution > 0) {
    lines.push({
      name: 'SDF (Training)', allowance: 0, allowanceZIG: null,
      deduction: 0, deductionZIG: null, employer: payslip.sdfContribution,
      ytd: ytdStat.sdfContribution, ytdZIG: null,
    });
  }
  if (payslip.wcifEmployer > 0) {
    lines.push({
      name: 'WCIF (Insurance)', allowance: 0, allowanceZIG: null,
      deduction: 0, deductionZIG: null, employer: payslip.wcifEmployer,
      ytd: ytdStat.wcifEmployer, ytdZIG: null,
    });
  }
  if (payslip.necEmployer > 0) {
    lines.push({
      name: 'NEC Employer', allowance: 0, allowanceZIG: null,
      deduction: 0, deductionZIG: null, employer: payslip.necEmployer,
      ytd: ytdStat.necEmployer, ytdZIG: null,
    });
  }

  return lines;
}

const LOGO = `<svg width="32" height="32" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M107.922 469.898L147.362 401.664C195.756 317.943 316.497 317.943 364.89 401.422L404.33 469.656L331.499 511.758L275.121 414.488C266.652 399.97 245.601 399.97 237.132 414.488L180.996 512L107.922 469.898Z" fill="#B2DB64"/><path d="M42.1022 107.917L110.336 147.357C194.057 195.751 194.057 316.491 110.579 364.885L42.3441 404.325L0.241907 331.493L97.5124 275.115C112.03 266.647 112.03 245.595 97.5124 237.127L0 180.991L42.1022 107.917Z" fill="#B2DB64"/><path d="M404.08 42.1021L364.64 110.336C316.247 194.057 195.506 194.057 147.112 110.579L107.672 42.3441L180.504 0.241907L236.882 97.5123C245.351 112.03 266.402 112.03 274.87 97.5123L331.249 0L404.08 42.1021Z" fill="#B2DB64"/><path d="M469.899 404.083L401.664 364.643C317.944 316.25 317.944 195.509 401.422 147.115L469.657 107.675L511.759 180.507L414.489 236.885C399.971 245.354 399.971 266.405 414.489 274.873L512.001 331.01L469.899 404.083Z" fill="#B2DB64"/><path d="M256.002 304.151C282.996 304.151 304.879 282.268 304.879 255.274C304.879 228.28 282.996 206.397 256.002 206.397C229.008 206.397 207.125 228.28 207.125 255.274C207.125 282.268 229.008 304.151 256.002 304.151Z" fill="#B2DB64"/></svg>`;
const fmt2 = (n: number | null | undefined) => Number(n ?? 0).toFixed(2);

function currencySymbol(cur: string | null | undefined) {
  return cur === 'ZiG' || cur === 'ZWG' || cur === 'ZIG' ? 'ZiG' : '$';
}

export function generatePayslipHtml(params: {
  payslip: any;
  transactions: any[];
  ytd: YtdResult;
  run: any;
  emp: any;
  leaveBalance?: number | null;
  leaveTaken?: number | null;
}): string {
  const { payslip, transactions, ytd, run, emp, leaveBalance, leaveTaken } = params;
  const isDual = !!run.dualCurrency || (payslip.grossZIG != null && payslip.grossZIG !== 0) || (payslip.netPayZIG != null && payslip.netPayZIG !== 0);
  const sym = currencySymbol(run.currency);
  const period = `${new Date(run.startDate).toLocaleDateString()} - ${new Date(run.endDate).toLocaleDateString()}`;

  // Use the same buildPayslipLineItems logic as v1 to ensure identical data preparation
  const basicSalary = Number(payslip.basicSalaryApplied ?? payslip.basicSalary ?? 0);
  const payslipForLines = { ...payslip, payrollRun: { ...(payslip.payrollRun ?? run), dualCurrency: isDual } };
  const lineItems = buildPayslipLineItems({
    payslip: payslipForLines,
    transactions,
    ytdStat: ytd.ytdStat,
    ytdMap: ytd.ytdMap,
    ytdStatZIG: ytd.ytdStatZIG,
    ytdMapZIG: ytd.ytdMapZIG,
    basicSalary,
  });

  const earnings   = lineItems.filter(i => (i.allowance ?? 0) > 0 || (i.allowanceZIG ?? 0) > 0);
  const deductions = lineItems.filter(i => (i.deduction ?? 0) > 0 || (i.deductionZIG ?? 0) > 0);

  const zigCol    = isDual ? `<th class="r zig">ZiG</th>` : '';
  const zigYtdCol = isDual ? `<th class="r ytd zig">ZiG YTD</th>` : '';

  const earnRow = (item: LineItem) => isDual
    ? `<tr><td>${item.name}</td><td class="r">${(item.allowance ?? 0) > 0 ? fmt2(item.allowance) : '—'}</td><td class="r ytd">${fmt2(item.ytd)}</td><td class="r zig">${(item.allowanceZIG ?? 0) > 0 ? fmt2(item.allowanceZIG!) : '—'}</td><td class="r ytd zig">${fmt2(item.ytdZIG ?? 0)}</td></tr>`
    : `<tr><td>${item.name}</td><td class="r">${fmt2(item.allowance)}</td><td class="r ytd">${fmt2(item.ytd)}</td></tr>`;

  const dedRow = (item: LineItem) => isDual
    ? `<tr><td>${item.name}</td><td class="r">${(item.deduction ?? 0) > 0 ? fmt2(item.deduction) : '—'}</td><td class="r ytd">${fmt2(item.ytd)}</td><td class="r zig">${(item.deductionZIG ?? 0) > 0 ? fmt2(item.deductionZIG!) : '—'}</td><td class="r ytd zig">${fmt2(item.ytdZIG ?? 0)}</td></tr>`
    : `<tr><td>${item.name}</td><td class="r">${fmt2(item.deduction)}</td><td class="r ytd">${fmt2(item.ytd)}</td></tr>`;

  const earningRows   = earnings.map(earnRow).join('');
  const deductionRows = deductions.map(dedRow).join('');

  const earnTotalUSD  = earnings.reduce((s, i) => s + (i.allowance ?? 0), 0);
  const earnTotalZIG  = earnings.reduce((s, i) => s + (i.allowanceZIG ?? 0), 0);
  const deductTotalUSD = deductions.reduce((s, i) => s + (i.deduction ?? 0), 0);
  const deductTotalZIG = deductions.reduce((s, i) => s + (i.deductionZIG ?? 0), 0);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Payslip - ${emp.firstName} ${emp.lastName}</title>
<style>
  @page{size:A4 portrait;margin:12mm 10mm}
  *{box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a2e4a;font-size:10px;line-height:1.5;margin:0;padding:16px;background:#fff}
  .header{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2.5px solid #1a2e4a}
  .header-left{display:flex;align-items:center;gap:10px}
  .logo-box{width:40px;height:40px;background:#1a2e4a;border-radius:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .company-name{font-size:16px;font-weight:700;color:#1a2e4a;margin:0}
  .company-sub{font-size:8px;color:#64748b;margin:2px 0 0}
  .header-right{text-align:right}
  .payslip-title{font-size:20px;font-weight:700;color:#1a2e4a;letter-spacing:-0.5px}
  .period-badge{display:inline-block;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:4px;padding:2px 8px;font-size:8px;color:#64748b;margin-top:3px}
  .emp-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:12px;overflow:hidden;display:flex}
  .emp-card-accent{width:4px;background:#1a2e4a;flex-shrink:0}
  .emp-card-body{flex:1;padding:10px 14px;display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:4px 12px}
  .emp-name-block{grid-column:1/2;grid-row:1/3;display:flex;flex-direction:column;justify-content:center;border-right:1px solid #e2e8f0;padding-right:12px}
  .emp-name{font-size:13px;font-weight:700;color:#1a2e4a;line-height:1.2;margin-bottom:2px}
  .emp-id{font-size:8px;color:#94a3b8;font-weight:600;letter-spacing:0.5px;text-transform:uppercase}
  .emp-field .label{font-size:7px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:0.5px}
  .emp-field .value{font-size:9px;font-weight:600;color:#1a2e4a;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tables-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
  .section h3{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 0;padding:5px 8px;background:#1a2e4a;color:#b2db64;border-radius:3px 3px 0 0}
  table{width:100%;border-collapse:collapse;font-size:9px}
  thead th{background:#f1f5f9;padding:4px 8px;text-align:left;font-weight:600;color:#64748b;border-bottom:1px solid #e2e8f0}
  thead th.r{text-align:right}
  tbody td{padding:3px 8px;border-bottom:1px solid #f8fafc;color:#334155}
  tbody tr:nth-child(even) td{background:#fafbfc}
  .r{text-align:right}
  .ytd{color:#94a3b8!important;font-size:8px}
  .zig{color:#0369a1!important}
  .total-row td{border-top:1.5px solid #1a2e4a;font-weight:700;padding:5px 8px;background:#f8fafc}
  .net-bar{background:#1a2e4a;color:#fff;border-radius:6px;padding:12px 20px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
  .net-label{font-size:11px;font-weight:600;opacity:0.8}
  .net-amount{font-size:24px;font-weight:700;color:#b2db64}
  .net-zig{font-size:24px;font-weight:700;color:#b2db64;opacity:0.85;margin-top:2px}
  .footer{text-align:center;color:#94a3b8;font-size:7.5px;padding-top:8px;border-top:1px solid #e2e8f0}
  .print-btn{position:fixed;bottom:20px;right:20px;background:#1a2e4a;color:#b2db64;border:none;padding:10px 20px;border-radius:20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2)}
  @media print{.print-btn{display:none}body{padding:0}}
</style></head>
<body>
<div class="header">
  <div class="header-left">
    <div class="logo-box">${LOGO}</div>
    <div>
      <p class="company-name">${run.company?.name || 'Company'}</p>
      <p class="company-sub">${run.company?.address || ''}${run.company?.taxId ? ` · TIN: ${run.company.taxId}` : ''}</p>
    </div>
  </div>
  <div class="header-right">
    <div class="payslip-title">PAYSLIP</div>
    <div class="period-badge">${run.company?.registrationNumber ? `Reg: ${run.company.registrationNumber}` : new Date(run.startDate).toLocaleString('default',{month:'long',year:'numeric'})}</div>
  </div>
</div>

<div class="emp-card">
  <div class="emp-card-accent"></div>
  <div class="emp-card-body">
    <div class="emp-name-block">
      <div class="emp-name">${emp.firstName} ${emp.lastName}</div>
      ${emp.employeeCode ? `<div class="emp-id">ID: ${emp.employeeCode}</div>` : ''}
    </div>
    <div class="emp-field"><div class="label">Job Title</div><div class="value">${emp.position || '—'}</div></div>
    <div class="emp-field"><div class="label">Department</div><div class="value">${emp.department?.name || '—'}</div></div>
    <div class="emp-field"><div class="label">Currency</div><div class="value">${isDual ? 'USD + ZiG' : run.currency || 'USD'}</div></div>
    <div class="emp-field"><div class="label">TIN</div><div class="value">${emp.tin || '—'}</div></div>
    <div class="emp-field"><div class="label">Pay Period</div><div class="value">${period}</div></div>
    <div class="emp-field"><div class="label">Pay Date</div><div class="value">${run.paymentDate ? new Date(run.paymentDate).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—'}</div></div>
  </div>
</div>

${leaveBalance != null ? `
<div style="display:flex;align-items:center;gap:16px;background:#edf7e3;border:1px solid #c3e6a0;border-radius:6px;padding:8px 14px;margin-bottom:12px">
  <div style="flex:1">
    <div style="font-size:7px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px">Annual Leave Balance</div>
    <div style="font-size:11px;font-weight:700;color:#1a2e4a;margin-top:2px">${(leaveBalance ?? 0).toFixed(1)} days</div>
  </div>
  <div style="width:1px;height:28px;background:#c3e6a0"></div>
  <div style="flex:1">
    <div style="font-size:7px;font-weight:700;text-transform:uppercase;color:#64748b;letter-spacing:0.5px">Leave Taken (YTD)</div>
    <div style="font-size:11px;font-weight:700;color:#1a2e4a;margin-top:2px">${(leaveTaken ?? 0).toFixed(1)} days</div>
  </div>
</div>
` : ''}

<div class="tables-row">
  <div class="section">
    <h3>Earnings</h3>
    <table>
      <thead><tr><th>Description</th><th class="r">USD</th><th class="r ytd">YTD USD</th>${zigCol}${zigYtdCol}</tr></thead>
      <tbody>${earningRows || `<tr><td colspan="${isDual ? 5 : 3}">—</td></tr>`}
      <tr class="total-row"><td>Total Earnings</td><td class="r">${fmt2(earnTotalUSD)}</td><td class="r ytd">${fmt2(earnings.reduce((s, i) => s + (i.ytd ?? 0), 0))}</td>${isDual ? `<td class="r zig">${fmt2(earnTotalZIG)}</td><td class="r ytd zig">${fmt2(earnings.reduce((s, i) => s + (i.ytdZIG ?? 0), 0))}</td>` : ''}</tr>
      </tbody>
    </table>
  </div>
  <div class="section">
    <h3>Deductions</h3>
    <table>
      <thead><tr><th>Description</th><th class="r">USD</th><th class="r ytd">YTD USD</th>${zigCol}${zigYtdCol}</tr></thead>
      <tbody>${deductionRows}
      <tr class="total-row"><td>Total Deductions</td><td class="r">${fmt2(deductTotalUSD)}</td><td class="r ytd">${fmt2(deductions.reduce((s, i) => s + (i.ytd ?? 0), 0))}</td>${isDual ? `<td class="r zig">${fmt2(deductTotalZIG)}</td><td class="r ytd zig">${fmt2(deductions.reduce((s, i) => s + (i.ytdZIG ?? 0), 0))}</td>` : ''}</tr>
      </tbody>
    </table>
  </div>
</div>

<div class="net-bar">
  <div>
    <div class="net-label">NET PAY</div>
    <div class="net-amount">USD ${fmt2(isDual ? (payslip.netPayUSD ?? payslip.netPay) : payslip.netPay)}</div>
    ${isDual ? `<div class="net-zig">ZiG ${fmt2(payslip.netPayZIG ?? 0)}</div>` : ''}
  </div>
  <div style="text-align:right;opacity:0.7">
    <div style="font-size:9px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">YTD Net Pay</div>
    <div style="font-size:16px;font-weight:700;color:#b2db64">USD ${fmt2(ytd.ytdStat.basicSalary - ytd.ytdStat.paye - ytd.ytdStat.aidsLevy - ytd.ytdStat.nssaEmployee - (ytd.ytdStat.loanDeductions ?? 0))}</div>
    ${isDual ? `<div style="font-size:16px;font-weight:700;color:#b2db64;opacity:0.85;margin-top:2px">ZiG ${fmt2((ytd.ytdStatZIG?.basicSalary ?? 0) - (ytd.ytdStatZIG?.paye ?? 0) - (ytd.ytdStatZIG?.aidsLevy ?? 0) - (ytd.ytdStatZIG?.nssaEmployee ?? 0))}</div>` : ''}
  </div>
</div>

<div class="footer">Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · Bantu Payroll · This is a computer-generated document</div>
<button class="print-btn" onclick="window.print()">⬇ Save as PDF</button>
</body></html>`;
}

export function generatePayslipEmailHtml(params: {
  payslip: any;
  transactions: any[];
  run: any;
  emp: any;
}): string {
  const { payslip, transactions, run, emp } = params;
  const sym = run.currency === 'ZiG' || run.currency === 'ZWG' ? 'ZiG' : '$';

  const basicSalaryEmail = Number(payslip.basicSalaryApplied ?? payslip.basicSalary ?? 0);
  const basicRow = basicSalaryEmail > 0
    ? `<tr><td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:12px;font-family:Arial,sans-serif">Basic Salary</td><td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:12px;font-family:Arial,sans-serif;text-align:right">${fmt2(basicSalaryEmail)}</td></tr>`
    : '';
  let earnRows = basicRow;
  let deductRows = '';
  let earnTotal = basicSalaryEmail, deductTotal = 0;
  for (const t of transactions) {
    const tc = t.transactionCode;
    if (!tc) continue;
    const amt = Number(t.amount || 0);
    const row = `<tr><td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:12px;font-family:Arial,sans-serif">${tc.name || tc.code}</td><td style="padding:3px 8px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:12px;font-family:Arial,sans-serif;text-align:right">${fmt2(Math.abs(amt))}</td></tr>`;
    if (tc.type === 'EARNING' || tc.type === 'BENEFIT') {
      earnRows += row; earnTotal += amt;
    } else {
      deductRows += row; deductTotal += Math.abs(amt);
    }
  }

  const td = 'padding:3px 8px;border-bottom:1px solid #e2e8f0;font-size:12px;font-family:Arial,sans-serif';
  const tdr = `${td};text-align:right`;
  const totd = `padding:5px 8px;border-top:2px solid #1a2e4a;font-weight:bold;font-size:12px;font-family:Arial,sans-serif;background:#f8fafc`;
  const totdr = `${totd};text-align:right`;
  const th = 'padding:5px 8px;text-align:left;font-weight:bold;font-size:11px;color:#64748b;background:#f1f5f9;font-family:Arial,sans-serif;border-bottom:1px solid #e2e8f0';

  return `
<table cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;margin:0 auto;font-family:Arial,sans-serif">
<tr><td style="padding:16px 0 10px;border-bottom:2px solid #1a2e4a">
  <table cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td style="font-size:18px;font-weight:bold;color:#1a2e4a;font-family:Arial,sans-serif">PAYSLIP</td>
    <td style="text-align:right;font-size:11px;color:#64748b;font-family:Arial,sans-serif">${run.company?.name || ''} · ${new Date(run.startDate).toLocaleDateString()} – ${new Date(run.endDate).toLocaleDateString()}</td>
  </tr>
  </table>
</td></tr>
<tr><td style="padding:12px 0;font-size:12px;color:#1a2e4a;font-family:Arial,sans-serif">
  <strong>${emp.firstName} ${emp.lastName}</strong>
  ${emp.employeeCode ? ` · ${emp.employeeCode}` : ''}
  ${emp.position ? ` · ${emp.position}` : ''}
  ${emp.department?.name ? ` · ${emp.department.name}` : ''}
</td></tr>
<tr><td>
  <table cellpadding="0" cellspacing="0" style="width:100%">
  <tr>
    <td style="width:50%;vertical-align:top;padding-right:6px">
      <table cellpadding="0" cellspacing="0" style="width:100%">
      <tr><td style="${th}">Earnings</td><td style="${th};text-align:right">Amount (${sym})</td></tr>
      ${earnRows || '<tr><td style="' + td + '" colspan="2">—</td></tr>'}
      <tr><td style="${totd}">Total Earnings</td><td style="${totdr}">${fmt2(earnTotal)}</td></tr>
      </table>
    </td>
    <td style="width:50%;vertical-align:top;padding-left:6px">
      <table cellpadding="0" cellspacing="0" style="width:100%">
      <tr><td style="${th}">Deductions</td><td style="${th};text-align:right">Amount (${sym})</td></tr>
      ${deductRows}
      <tr><td style="${td}">PAYE</td><td style="${tdr}">${fmt2(payslip.paye)}</td></tr>
      <tr><td style="${td}">AIDS Levy</td><td style="${tdr}">${fmt2(payslip.aidsLevy)}</td></tr>
      <tr><td style="${td}">NSSA (Employee)</td><td style="${tdr}">${fmt2(payslip.nssaEmployee)}</td></tr>
      ${Number(payslip.pensionApplied) > 0 ? `<tr><td style="${td}">Pension</td><td style="${tdr}">${fmt2(payslip.pensionApplied)}</td></tr>` : ''}
      ${Number(payslip.loanDeductions) > 0 ? `<tr><td style="${td}">Loan Repayment</td><td style="${tdr}">${fmt2(payslip.loanDeductions)}</td></tr>` : ''}
      <tr><td style="${totd}">Total Deductions</td><td style="${totdr}">${fmt2(Number(payslip.paye) + Number(payslip.aidsLevy) + Number(payslip.nssaEmployee) + Number(payslip.pensionApplied ?? 0) + Number(payslip.loanDeductions ?? 0) + deductTotal)}</td></tr>
      </table>
    </td>
  </tr>
  </table>
</td></tr>
<tr><td style="background:#1a2e4a;color:#fff;border-radius:6px;padding:10px 16px;margin-top:12px;text-align:center;font-family:Arial,sans-serif">
  <span style="font-size:12px;opacity:0.8">NET PAY</span>
  <span style="display:block;font-size:22px;font-weight:bold;color:#b2db64">${sym} ${fmt2(payslip.netPay)}</span>
</td></tr>
<tr><td style="text-align:center;color:#94a3b8;font-size:10px;padding-top:8px;border-top:1px solid #e2e8f0;margin-top:12px;font-family:Arial,sans-serif">
Generated on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · Bantu Payroll
</td></tr>
</table>`;
}
