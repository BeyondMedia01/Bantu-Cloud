import { Hono } from 'hono';
import { prisma, getSql } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const fmt2 = (n: number | null | undefined) => (n ?? 0).toFixed(2);

function yearPeriodFilter(companyId: string, year: string) {
  const y = parseInt(year);
  const yearStart = new Date(y, 0, 1);
  const yearEnd = new Date(y + 1, 0, 1);
  return {
    companyId,
    status: 'COMPLETED' as const,
    OR: [
      { payrollCalendar: { year: y } },
      { payrollCalendarId: null, startDate: { gte: yearStart, lt: yearEnd } },
    ],
  };
}

router.get('/summary', requirePermission('view_reports'), async (c) => {
  try {
    const companyId = c.get('companyId');
    const clientId = c.get('clientId');
    const eWhere: Record<string, unknown> = {};
    if (clientId) eWhere.clientId = clientId;
    if (companyId) eWhere.companyId = companyId;
    const employeeRelation: Record<string, unknown> = {};
    if (clientId) employeeRelation.clientId = clientId;
    if (companyId) employeeRelation.companyId = companyId;

    const nameSelect = { select: { id: true, firstName: true, lastName: true } };
    const [employeeCount, pendingLeave, activeLoans, noTinEmployees, noBankEmployees] = await Promise.all([
      prisma.employee.count({ where: eWhere }),
      prisma.leaveRequest.count({ where: { employee: employeeRelation, status: 'PENDING' } }),
      prisma.loan.count({ where: { employee: employeeRelation, status: 'ACTIVE' } }),
      prisma.employee.findMany({ where: { ...eWhere, tin: null, dischargeDate: null }, ...nameSelect }),
      prisma.employee.findMany({ where: { ...eWhere, accountNumber: null, paymentMethod: 'BANK', dischargeDate: null }, ...nameSelect }),
    ]);

    const currentRun = companyId ? await prisma.payrollRun.findFirst({
      where: { companyId, status: { in: ['DRAFT', 'PENDING_APPROVAL', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    }) : null;

    const lastRun = companyId ? await prisma.payrollRun.findFirst({
      where: { companyId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    }) : null;

    return c.json({
      employeeCount, pendingLeave, activeLoans, currentRun, lastRun,
      noTinCount: noTinEmployees.length,
      noBankCount: noBankEmployees.length,
      noTinEmployees,
      noBankEmployees,
    });
  } catch (err: any) {
    console.error('[reports/summary]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/payroll-trend', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  const runs = await prisma.payrollRun.findMany({
    where: { companyId: companyId ?? undefined, status: 'COMPLETED' },
    orderBy: { runDate: 'asc' },
    take: 6,
    include: { payslips: { select: { gross: true, netPay: true } } },
  });
  return c.json(runs.map(r => ({
    name: new Date(r.runDate).toLocaleDateString(undefined, { month: 'short', year: '2-digit' }),
    grossPay: Math.round(r.payslips.reduce((s, p) => s + Number(p.gross), 0)),
    netPay: Math.round(r.payslips.reduce((s, p) => s + Number(p.netPay), 0)),
    headcount: r.payslips.length,
  })));
});

router.get('/payslips', requirePermission('view_reports'), async (c) => {
  const runId = c.req.query('runId');
  const format = c.req.query('format') || 'csv';
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, select: { companyId: true } });
  if (!run) return c.json({ message: 'Not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, position: true, currency: true } } },
    orderBy: [{ employeeId: 'asc' }],
  });

  if (format === 'csv') {
    const header = 'Employee Code,Name,Position,Gross,PAYE,Medical Aid Credit,AIDS Levy,NSSA,Net Pay,Currency\n';
    const rows = payslips.map(p => [
      p.employee.employeeCode || '', `${p.employee.firstName} ${p.employee.lastName}`, p.employee.position || '',
      fmt2(p.gross), fmt2(p.paye), fmt2(p.medicalAidCredit ?? 0), fmt2(p.aidsLevy), fmt2(p.nssaEmployee), fmt2(p.netPay),
      p.employee.currency || 'USD',
    ].join(',')).join('\n');
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename=payslips-${runId}.csv`);
    return c.body(header + rows);
  }
  return c.json({ data: payslips });
});

router.get('/journals', requirePermission('view_reports'), async (c) => {
  const runId = c.req.query('runId');
  const format = c.req.query('format') || 'json';
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, select: { companyId: true } });
  if (!run) return c.json({ message: 'Not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const transactions = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: runId },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, transactionCode: { select: { code: true, name: true, type: true } } },
    orderBy: [{ employeeId: 'asc' }, { transactionCodeId: 'asc' }],
  });

  if (format === 'csv') {
    const header = 'Employee Code,Name,Transaction Code,Description,Type,Amount,Currency\n';
    const rows = transactions.map(t => [
      t.employee.employeeCode || '', `${t.employee.firstName} ${t.employee.lastName}`,
      t.transactionCode?.code || '', t.description || '', t.transactionCode?.type || '', fmt2(t.amount), t.currency,
    ].join(',')).join('\n');
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename=journals-${runId}.csv`);
    return c.body(header + rows);
  }
  return c.json({ data: transactions });
});

router.get('/eft', requirePermission('export_reports'), async (c) => {
  const runId = c.req.query('runId');
  const bankFormat = c.req.query('bankFormat') || 'generic';
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, select: { companyId: true } });
  if (!run) return c.json({ message: 'Not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: runId, employee: { paymentMethod: 'BANK' } },
    include: { employee: { include: { bankAccounts: { orderBy: { priority: 'asc' } } } }, payrollRun: { select: { startDate: true, endDate: true } } },
  });
  if (payslips.length === 0) return c.json({ message: 'No bank-based payslips found' }, 404);

  const period = `${new Date(payslips[0].payrollRun.startDate).toLocaleDateString()} ${new Date(payslips[0].payrollRun.endDate).toLocaleDateString()}`;
  let header = '';
  if (bankFormat === 'cbz') header = 'ACCOUNT_NUMBER,AMOUNT,ACCOUNT_NAME,REFERENCE,CURRENCY\n';
  else if (bankFormat === 'stanbic') header = 'Beneficiary Name,Beneficiary Account,Bank Code,Branch Code,Amount,Reference\n';
  else header = 'Account Name,Account Number,Bank Name,Branch Code,Amount,Currency,Reference\n';

  const rows: string[] = [];
  for (const p of payslips) {
    const netPay = p.netPay;
    const accounts = p.employee.bankAccounts;
    if (accounts.length === 0) {
      rows.push([`"${p.employee.firstName} ${p.employee.lastName}"`, p.employee.accountNumber || '', p.employee.bankName || '', p.employee.bankAccounts[0]?.branchCode || '', fmt2(netPay), p.employee.currency || 'USD', `PAYROLL-${period}`].join(','));
      continue;
    }
    let remainingBalance = netPay;
    const splitRows: { acc: any; amt: number }[] = [];
    for (const acc of accounts.filter(a => a.splitType === 'FIXED')) {
      const amt = Math.min(acc.splitValue, remainingBalance);
      if (amt > 0) { splitRows.push({ acc, amt }); remainingBalance -= amt; }
    }
    for (const acc of accounts.filter(a => a.splitType === 'PERCENTAGE')) {
      const amt = Math.min(netPay * (acc.splitValue / 100), remainingBalance);
      if (amt > 0) { splitRows.push({ acc, amt }); remainingBalance -= amt; }
    }
    const remAcc = accounts.find(a => a.splitType === 'REMAINDER');
    if (remAcc && remainingBalance > 0) { splitRows.push({ acc: remAcc, amt: remainingBalance }); remainingBalance = 0; }
    else if (remainingBalance > 0 && splitRows.length > 0) splitRows[splitRows.length - 1].amt += remainingBalance;

    for (const { acc, amt } of splitRows) {
      const name = acc.accountName || `${p.employee.firstName} ${p.employee.lastName}`;
      if (bankFormat === 'cbz') rows.push([acc.accountNumber, fmt2(amt), `"${name}"`, `PAYROLL-${period}`, acc.currency || 'USD'].join(','));
      else if (bankFormat === 'stanbic') rows.push([`"${name}"`, acc.accountNumber, 'STAN', acc.branchCode || '0000', fmt2(amt), `PAYROLL-${period}`].join(','));
      else rows.push([`"${name}"`, acc.accountNumber, acc.bankName, acc.branchCode || '', fmt2(amt), acc.currency || 'USD', `PAYROLL-${period}`].join(','));
    }
  }
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', `attachment; filename=EFT-${runId}.csv`);
  return c.body(header + rows.join('\n'));
});

router.get('/tax', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const year = c.req.query('year') || String(new Date().getFullYear());
  const format = c.req.query('format') || 'json';

  const sql = getSql();
  const y = parseInt(year);
  const yearStart = new Date(y, 0, 1).toISOString();
  const yearEnd = new Date(y + 1, 0, 1).toISOString();
  const payslips = await sql`
    SELECT ps.id, ps."employeeId", ps."payrollRunId", ps.gross, ps.paye, ps."aidsLevy",
      ps."nssaEmployee", ps."netPay", ps."wcifEmployer", ps."sdfContribution", ps."necLevy", ps."basicSalaryApplied",
      e.id AS emp_id, e."firstName", e."lastName", e."employeeCode", e.tin, e."nationalId", e."passportNumber",
      pr.id AS pr_id, pr."startDate", pr."endDate", pr.currency, pr."dualCurrency",
      co.id AS co_id, co.name AS co_name, co."taxId", co."registrationNumber", co.address
    FROM "Payslip" ps
    JOIN "Employee" e ON e.id = ps."employeeId"
    JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
    JOIN "Company" co ON co.id = pr."companyId"
    LEFT JOIN "PayrollCalendar" pc ON pc.id = pr."payrollCalendarId"
    WHERE pr."companyId" = ${companyId}
      AND pr.status = 'COMPLETED'
      AND (pc.year = ${y} OR (pr."payrollCalendarId" IS NULL AND pr."startDate" >= ${yearStart} AND pr."startDate" < ${yearEnd}))
  `;
  const payslipsMapped = (payslips as any[]).map(r => ({
    id: r.id, employeeId: r.employeeId, payrollRunId: r.pr_id,
    gross: r.gross, paye: r.paye, aidsLevy: r.aidsLevy, nssaEmployee: r.nssaEmployee,
    netPay: r.netPay, wcifEmployer: r.wcifEmployer, sdfContribution: r.sdfContribution,
    necLevy: r.necLevy, basicSalaryApplied: r.basicSalaryApplied,
    employee: { id: r.emp_id, firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode, tin: r.tin, nationalId: r.nationalId, passportNumber: r.passportNumber },
    payrollRun: { id: r.pr_id, startDate: r.startDate, endDate: r.endDate, currency: r.currency, dualCurrency: r.dualCurrency, company: { id: r.co_id, name: r.co_name, taxId: r.taxId, registrationNumber: r.registrationNumber, address: r.address } },
  }));

  const byEmployee: Record<string, any> = {};
  for (const ps of payslipsMapped) {
    const key = ps.employeeId;
    if (!byEmployee[key]) byEmployee[key] = { employee: ps.employee, company: ps.payrollRun.company, totalGross: 0, totalBasicSalary: 0, totalBonus: 0, totalGratuity: 0, totalAllowances: 0, totalOvertime: 0, totalCommission: 0, totalBenefits: 0, totalPaye: 0, totalAidsLevy: 0, totalNssa: 0, totalNet: 0, totalWcif: 0, totalSdf: 0, totalNecLevy: 0 };
    const e = byEmployee[key];
    e.totalGross += ps.gross || 0; e.totalPaye += ps.paye || 0; e.totalAidsLevy += ps.aidsLevy || 0;
    e.totalNssa += ps.nssaEmployee || 0; e.totalNet += ps.netPay || 0;
    e.totalWcif += ps.wcifEmployer || 0; e.totalSdf += ps.sdfContribution || 0; e.totalNecLevy += ps.necLevy || 0;
  }

  const runIds = [...new Set(payslipsMapped.map((p: any) => p.payrollRunId))];
  const employeeIds = Object.keys(byEmployee);
  const txRows = runIds.length > 0 && employeeIds.length > 0
    ? await sql`
        SELECT pt."employeeId", pt.amount, tc.type AS tc_type, tc."incomeCategory" AS tc_income_cat, tc.code AS tc_code
        FROM "PayrollTransaction" pt
        JOIN "TransactionCode" tc ON tc.id = pt."transactionCodeId"
        WHERE pt."payrollRunId" = ANY(${runIds as string[]}) AND pt."employeeId" = ANY(${employeeIds as string[]})
      `
    : [];

  for (const t of txRows as any[]) {
    const e = byEmployee[t.employeeId];
    if (!e) continue;
    if (!t.tc_type || t.tc_type !== 'EARNING') continue;
    const amt = Math.abs(t.amount || 0);
    const cat = t.tc_income_cat; const code = (t.tc_code || '').toUpperCase();
    if (cat === 'BASIC_SALARY' || (!cat && code.includes('BASIC'))) e.totalBasicSalary += amt;
    else if (cat === 'BONUS') e.totalBonus += amt;
    else if (cat === 'GRATUITY') e.totalGratuity += amt;
    else if (cat === 'ALLOWANCE') e.totalAllowances += amt;
    else if (cat === 'OVERTIME') e.totalOvertime += amt;
    else if (cat === 'COMMISSION') e.totalCommission += amt;
    else if (cat === 'BENEFIT') e.totalBenefits += amt;
  }

  const data = Object.values(byEmployee);

  if (format === 'pdf') {
    const first = data[0] as any;
    const company = first?.company;
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>P16 - ${year}</title><style>
      body{font-family:sans-serif;padding:40px;color:#1a2e4a}
      h1{text-align:center;font-size:18px;margin-bottom:4px}
      .sub{text-align:center;color:#64748b;font-size:12px;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{background:#1a2e4a;color:white;padding:6px 4px;text-align:left}
      td{padding:4px;border-bottom:1px solid #e2e8f0}
      tr:nth-child(even){background:#f8fafc}
      .total{background:#e2e8f0;font-weight:bold}
      .r{text-align:right}
    </style></head><body>
    <h1>P16 Tax Certificate - ${company?.name || ''}</h1>
    <p class="sub">Tax Year ${year}</p>
    <table><tr><th>Employee</th><th>TIN</th><th class="r">Gross</th><th class="r">Basic</th><th class="r">Bonus</th><th class="r">Allowances</th><th class="r">Overtime</th><th class="r">PAYE</th><th class="r">AIDS Levy</th><th class="r">NSSA</th><th class="r">Net</th></tr>`;
    for (const r of data as any[]) {
      html += `<tr><td>${r.employee.firstName} ${r.employee.lastName}</td><td>${r.employee.tin || ''}</td>
        <td class="r">${fmt2(r.totalGross)}</td><td class="r">${fmt2(r.totalBasicSalary)}</td><td class="r">${fmt2(r.totalBonus)}</td>
        <td class="r">${fmt2(r.totalAllowances)}</td><td class="r">${fmt2(r.totalOvertime)}</td>
        <td class="r">${fmt2(r.totalPaye)}</td><td class="r">${fmt2(r.totalAidsLevy)}</td><td class="r">${fmt2(r.totalNssa)}</td><td class="r">${fmt2(r.totalNet)}</td></tr>`;
    }
    html += '</body></html>';
    c.header('Content-Type', 'text/html');
    return c.html(html);
  }
  return c.json({ data });
});

router.get('/itf16', requirePermission('export_reports'), async (c) => {
  const companyId = c.get('companyId');
  const year = c.req.query('year');
  if (!companyId || !year) return c.json({ message: 'year is required' }, 400);
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { taxId: true, registrationNumber: true } });
  if (!company?.taxId) return c.json({ message: 'Company TIN is required' }, 422);
  if (!company?.registrationNumber) return c.json({ message: 'Company BP Number is required' }, 422);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRun: yearPeriodFilter(companyId, year) },
    select: { employeeId: true, payrollRunId: true, gross: true, paye: true, aidsLevy: true, nssaEmployee: true, netPay: true, pensionApplied: true,
      employee: { select: { employeeCode: true, firstName: true, lastName: true, tin: true, nationalId: true, passportNumber: true } } },
  });
  if (payslips.length === 0) return c.json({ message: 'No data for this year' }, 404);

  const byEmployee: Record<string, any> = {};
  for (const ps of payslips) {
    const key = ps.employeeId;
    if (!byEmployee[key]) byEmployee[key] = { employee: ps.employee, totalGross: 0, totalBasicSalary: 0, totalBonus: 0, totalGratuity: 0, totalAllowances: 0, totalOvertime: 0, totalCommission: 0, totalBenefits: 0, pensionContributions: 0, totalNssa: 0, totalPaye: 0, totalAidsLevy: 0, totalNet: 0 };
    const e = byEmployee[key];
    e.totalGross += ps.gross || 0; e.totalPaye += ps.paye || 0; e.totalAidsLevy += ps.aidsLevy || 0;
    e.totalNssa += ps.nssaEmployee || 0; e.pensionContributions += ps.pensionApplied || 0; e.totalNet += ps.netPay || 0;
  }

  const runIds = [...new Set(payslips.map(p => p.payrollRunId))];
  const employeeIds = Object.keys(byEmployee);
  const txns = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: { in: runIds }, employeeId: { in: employeeIds } },
    select: { employeeId: true, amount: true, transactionCode: { select: { type: true, incomeCategory: true, code: true } } },
  });
  for (const t of txns) {
    const e = byEmployee[t.employeeId]; if (!e) continue;
    const tc = t.transactionCode; if (!tc || tc.type !== 'EARNING') continue;
    const amt = Math.abs(t.amount || 0);
    const cat = tc.incomeCategory; const code = (tc.code || '').toUpperCase();
    if (cat === 'BASIC_SALARY' || (!cat && code.includes('BASIC'))) e.totalBasicSalary += amt;
    else if (cat === 'BONUS') e.totalBonus += amt;
    else if (cat === 'GRATUITY') e.totalGratuity += amt;
    else if (cat === 'ALLOWANCE') e.totalAllowances += amt;
    else if (cat === 'OVERTIME') e.totalOvertime += amt;
    else if (cat === 'COMMISSION') e.totalCommission += amt;
    else if (cat === 'BENEFIT') e.totalBenefits += amt;
  }

  const csvHeader = 'EmployerTIN,EmployerBPNumber,TaxYear,EmployeeTIN,IDPassport,EmployeeName,GrossIncome,BasicSalary,Bonus,Gratuity,Allowances,Overtime,Commission,Benefits,PensionContributions,NSSA,PAYE,AIDSLevy,TotalTaxDeducted\n';
  const rows = Object.values(byEmployee).map((r: any) => {
    const emp = r.employee;
    const name = `"${`${emp.lastName || ''}, ${emp.firstName || ''}`.replace(/"/g, '""')}"`;
    return [company.taxId, company.registrationNumber, year, emp.tin || '', emp.nationalId || emp.passportNumber || '', name,
      fmt2(r.totalGross), fmt2(r.totalBasicSalary), fmt2(r.totalBonus), fmt2(r.totalGratuity),
      fmt2(r.totalAllowances), fmt2(r.totalOvertime), fmt2(r.totalCommission), fmt2(r.totalBenefits),
      fmt2(r.pensionContributions), fmt2(r.totalNssa), fmt2(r.totalPaye), fmt2(r.totalAidsLevy), fmt2(r.totalPaye + r.totalAidsLevy)].join(',');
  }).join('\n');
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', `attachment; filename=ITF16-${year}.csv`);
  return c.body(csvHeader + rows);
});

router.get('/leave', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const format = c.req.query('format') || 'json';
  const empWhere: Record<string, unknown> = {};
  if (clientId) empWhere.clientId = clientId;
  if (companyId) empWhere.companyId = companyId;

  const records = await prisma.leaveRecord.findMany({
    where: { employee: empWhere, ...(startDate ? { startDate: { gte: new Date(startDate) } } : {}), ...(endDate ? { endDate: { lte: new Date(endDate) } } : {}) },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, position: true } } },
    orderBy: { startDate: 'desc' },
  });
  if (format === 'csv') {
    const header = 'Employee Code,Name,Type,Start Date,End Date,Days,Status\n';
    const rows = records.map(r => [r.employee.employeeCode || '', `${r.employee.firstName} ${r.employee.lastName}`, r.type, r.startDate.toLocaleDateString(), r.endDate.toLocaleDateString(), r.totalDays, r.status].join(',')).join('\n');
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', 'attachment; filename=leave-report.csv');
    return c.body(header + rows);
  }
  return c.json({ data: records });
});

router.get('/loans', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  const status = c.req.query('status');
  const format = c.req.query('format') || 'json';
  const empWhere: Record<string, unknown> = {};
  if (clientId) empWhere.clientId = clientId;
  if (companyId) empWhere.companyId = companyId;

  const loans = await prisma.loan.findMany({
    where: { employee: empWhere, ...(status ? { status: status as any } : {}) },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } }, _count: { select: { repayments: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (format === 'csv') {
    const header = 'Employee Code,Name,Amount,Interest Rate,Term (Months),Status,Start Date\n';
    const rows = loans.map(l => { const e = (l as any).employee; return [e.employeeCode || '', `${e.firstName} ${e.lastName}`, fmt2(l.amount), fmt2(l.interestRate), l.termMonths, l.status, l.startDate.toLocaleDateString()].join(','); }).join('\n');
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', 'attachment; filename=loans-report.csv');
    return c.body(header + rows);
  }
  return c.json({ data: loans });
});

router.get('/departments', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  const where: Record<string, unknown> = {};
  if (clientId) where.clientId = clientId;
  if (companyId) where.companyId = companyId;

  const departments = await prisma.department.findMany({
    where,
    include: { _count: { select: { employees: true } }, company: { select: { name: true } }, branch: { select: { name: true } } },
    orderBy: { name: 'asc' },
  });
  const header = 'Company,Branch,Department,Headcount\n';
  const rows = departments.map(d => `"${d.company?.name || ''}","${d.branch?.name || ''}","${d.name}",${d._count.employees}`).join('\n');
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', 'attachment; filename=headcount-report.csv');
  return c.body(header + rows);
});

router.get('/variance', requirePermission('view_reports'), async (c) => {
  const runId = c.req.query('runId');
  const format = c.req.query('format') || 'csv';
  if (!runId) return c.json({ message: 'runId is required' }, 400);
  const run = await prisma.payrollRun.findUnique({ where: { id: runId }, include: { company: true } });
  if (!run) return c.json({ message: 'Not found' }, 404);
  const companyId = c.get('companyId');
  if (companyId && run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const priorRun = await prisma.payrollRun.findFirst({
    where: { companyId: run.companyId, status: 'COMPLETED', startDate: { lt: run.startDate } },
    orderBy: { startDate: 'desc' },
  });
  const [currentPayslips, priorPayslips] = await Promise.all([
    prisma.payslip.findMany({ where: { payrollRunId: run.id }, include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } } }),
    priorRun ? prisma.payslip.findMany({ where: { payrollRunId: priorRun.id }, include: { employee: { select: { firstName: true, lastName: true, employeeCode: true } } } }) : Promise.resolve([]),
  ]);
  const priorMap = Object.fromEntries(priorPayslips.map(p => [p.employeeId, p]));
  const data = currentPayslips.map(cur => {
    const prior = priorMap[cur.employeeId];
    return { code: cur.employee.employeeCode, name: `${cur.employee.firstName} ${cur.employee.lastName}`, currentGross: cur.gross, priorGross: prior?.gross || 0, variance: cur.gross - (prior?.gross || 0), pct: prior?.gross ? ((cur.gross - prior.gross) / prior.gross) * 100 : 100 };
  });

  if (format === 'csv') {
    const header = 'Employee Code,Name,Prior Gross,Current Gross,Variance,Variance %\n';
    const rows = data.map(d => [d.code, `"${d.name}"`, fmt2(d.priorGross), fmt2(d.currentGross), fmt2(d.variance), `${d.pct.toFixed(2)}%`].join(',')).join('\n');
    c.header('Content-Type', 'text/csv');
    c.header('Content-Disposition', `attachment; filename=variance-${runId}.csv`);
    return c.body(header + rows);
  }
  return c.json({ data });
});

router.get('/pension-export', requirePermission('view_reports'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);
  const month = c.req.query('month');
  const type = c.req.query('type') || 'generic';
  if (!month) return c.json({ message: 'Month (YYYY-MM) is required' }, 400);

  const startDate = new Date(`${month}-01`);
  const endDate = new Date(new Date(startDate).getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);

  const transactions = await prisma.payrollTransaction.findMany({
    where: {
      payrollRun: {
        startDate: { gte: startDate },
        endDate: { lte: endDate },
        status: 'COMPLETED',
        companyId,
      },
      transactionCode: {
        OR: [
          { name: { contains: 'Pension', mode: 'insensitive' } },
          { code: { startsWith: 'PEN', mode: 'insensitive' } },
        ],
      },
    },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, employeeCode: true,
          passportNumber: true, pensionNumber: true, baseRate: true,
        },
      },
      transactionCode: { select: { type: true, name: true } },
    },
  });

  if (transactions.length === 0) return c.json({ message: 'No pension transactions found for this period' }, 404);

  const grouped: Record<string, any> = {};
  for (const t of transactions) {
    if (!grouped[t.employeeId]) {
      grouped[t.employeeId] = { employee: t.employee, eeCont: 0, erCont: 0, earnings: Number(t.employee.baseRate || 0) };
    }
    if (t.transactionCode.type === 'DEDUCTION') grouped[t.employeeId].eeCont += Math.abs(t.amount);
    else grouped[t.employeeId].erCont += Math.abs(t.amount);
  }

  const rows = Object.values(grouped);
  let csvHeader = '';
  let csvRows: string[] = [];

  switch (type.toLowerCase()) {
    case 'mipf':
      csvHeader = 'Member No,Employee Name,Pensionable Earnings,EE Amount,ER Amount,Total\n';
      csvRows = rows.map((r: any) => [r.employee.pensionNumber || r.employee.employeeCode || '', `${r.employee.firstName} ${r.employee.lastName}`, fmt2(r.earnings), fmt2(r.eeCont), fmt2(r.erCont), fmt2(r.eeCont + r.erCont)].join(','));
      break;
    case 'comone':
      csvHeader = 'EE Code,National ID,Member No,Earnings,EE Cont,ER Cont,Total\n';
      csvRows = rows.map((r: any) => [r.employee.employeeCode || '', r.employee.passportNumber || '', r.employee.pensionNumber || '', fmt2(r.earnings), fmt2(r.eeCont), fmt2(r.erCont), fmt2(r.eeCont + r.erCont)].join(','));
      break;
    case 'oldmutual':
      csvHeader = 'Member ID,Surname,First Names,ID Number,Salary,EE Contribution,ER Contribution,Total\n';
      csvRows = rows.map((r: any) => [r.employee.pensionNumber || '', r.employee.lastName, r.employee.firstName, r.employee.passportNumber || '', fmt2(r.earnings), fmt2(r.eeCont), fmt2(r.erCont), fmt2(r.eeCont + r.erCont)].join(','));
      break;
    default:
      csvHeader = 'Code,Name,Basic,EE_Pension,ER_Pension,Total\n';
      csvRows = rows.map((r: any) => [r.employee.employeeCode || '', `${r.employee.firstName} ${r.employee.lastName}`, fmt2(r.earnings), fmt2(r.eeCont), fmt2(r.erCont), fmt2(r.eeCont + r.erCont)].join(','));
  }

  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', `attachment; filename=pension-${type}-${month}.csv`);
  return c.body(csvHeader + csvRows.join('\n'));
});

export default router;
