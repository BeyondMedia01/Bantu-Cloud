import { Hono } from 'hono';
import { z } from 'zod';
import { PayrollStatus } from '@prisma/client';
import { validateBody } from '../lib/validate';
import { prisma, getSql } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { audit } from '../lib/audit';
import { denyUnlessCompany, denyUnlessClient } from '../lib/ownership';
import { checkEmployeeCap } from '../lib/license';

const router = new Hono();

const updateInputSchema = z.object({
  employeeUSD: z.number().optional(),
  employeeZiG: z.number().optional(),
  employerUSD: z.number().optional(),
  employerZiG: z.number().optional(),
  units: z.number().optional(),
  notes: z.string().optional(),
  duration: z.string().optional(),
  transactionCodeId: z.string().optional(),
});

const updateCalendarSchema = z.object({
  periodType: z.string().optional(),
  year: z.number().int().optional(),
  month: z.number().int().min(1).max(12).optional(),
  payDay: z.number().int().min(1).max(31).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  isClosed: z.boolean().optional(),
});
const fmt2 = (n: number | null | undefined) => (n ?? 0).toFixed(2);

const VALID_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['PENDING_APPROVAL', 'APPROVED'],
  PENDING_APPROVAL: ['APPROVED', 'DRAFT'],
  APPROVED: ['DRAFT'],
};

const updateRunSchema = z.object({
  status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED']).optional(),
  notes: z.string().max(2000).optional(),
  exchangeRate: z.number().positive().finite().optional(),
});

async function checkClosedPeriod(clientId: string, startDate: Date, endDate: Date): Promise<boolean> {
  const cal = await prisma.payrollCalendar.findFirst({
    where: { clientId, isClosed: true, startDate: { lte: endDate }, endDate: { gte: startDate } },
  });
  return !!cal;
}

router.get('/', async (c) => {
  const companyId = c.get('companyId');
  const status = c.req.query('status');
  if (!companyId) return c.json({ message: 'x-company-id header required' }, 400);

  try {
    const sql = getSql();
    const runsQuery = status
      ? sql`
          SELECT
            pr.*,
            COUNT(ps.id)::int AS payslip_count,
            pc.id AS cal_id, pc."periodType" AS cal_period_type,
            pc.year AS cal_year, pc.month AS cal_month, pc."payDay" AS cal_pay_day,
            pc."startDate" AS cal_start, pc."endDate" AS cal_end, pc."isClosed" AS cal_closed
          FROM "PayrollRun" pr
          LEFT JOIN "Payslip" ps ON ps."payrollRunId" = pr.id
          LEFT JOIN "PayrollCalendar" pc ON pc.id = pr."payrollCalendarId"
          WHERE pr."companyId" = ${companyId} AND pr.status = ${status as PayrollStatus}
          GROUP BY pr.id, pc.id
          ORDER BY pr."runDate" DESC NULLS LAST
        `
      : sql`
          SELECT
            pr.*,
            COUNT(ps.id)::int AS payslip_count,
            pc.id AS cal_id, pc."periodType" AS cal_period_type,
            pc.year AS cal_year, pc.month AS cal_month, pc."payDay" AS cal_pay_day,
            pc."startDate" AS cal_start, pc."endDate" AS cal_end, pc."isClosed" AS cal_closed
          FROM "PayrollRun" pr
          LEFT JOIN "Payslip" ps ON ps."payrollRunId" = pr.id
          LEFT JOIN "PayrollCalendar" pc ON pc.id = pr."payrollCalendarId"
          WHERE pr."companyId" = ${companyId}
          GROUP BY pr.id, pc.id
          ORDER BY pr."runDate" DESC NULLS LAST
        `;

    const [runs, empRow] = await Promise.all([
      runsQuery,
      sql`SELECT COUNT(*)::int AS cnt FROM "Employee" WHERE "companyId" = ${companyId}`,
    ]);

    const employeeCount = empRow[0]?.cnt ?? 0;
    const data = runs.map((r: any) => ({
      id: r.id, companyId: r.companyId, startDate: r.startDate, endDate: r.endDate,
      runDate: r.runDate, status: r.status, currency: r.currency, exchangeRate: r.exchangeRate,
      dualCurrency: r.dualCurrency, notes: r.notes, createdAt: r.createdAt, updatedAt: r.updatedAt,
      payrollCalendarId: r.payrollCalendarId,
      _count: { payslips: r.payslip_count },
      payrollCalendar: r.cal_id ? {
        id: r.cal_id, periodType: r.cal_period_type, year: r.cal_year, month: r.cal_month,
        payDay: r.cal_pay_day, startDate: r.cal_start, endDate: r.cal_end, isClosed: r.cal_closed,
      } : null,
      employeeCount,
    }));

    return c.json({ data });
  } catch (err: any) {
    console.error('[payroll GET /]', err?.message, err?.stack?.split('\n')[0]);
    return c.json({ message: 'Failed to load payroll runs', error: err?.message }, 500);
  }
});

const createRunSchema = z.object({
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  currency: z.string().optional(),
  exchangeRate: z.number().optional(),
  dualCurrency: z.boolean().optional(),
  payrollCalendarId: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/', requirePermission('manage_payroll'), validateBody(createRunSchema), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  if (!companyId) return c.json({ message: 'x-company-id header required' }, 400);

  if (clientId) {
    const capCheck = await checkEmployeeCap(clientId);
    if (!capCheck.withinCap) {
      const msg = capCheck.reason || `Employee cap reached (${capCheck.cap}). Upgrade your plan to run payroll.`;
      return c.json({ message: msg }, 403);
    }
  }

  const body = c.req.valid('json');
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);

  if (endDate <= startDate) return c.json({ message: 'endDate must be after startDate' }, 400);
  const isDual = body.dualCurrency === true;
  if (isDual && (!body.exchangeRate || body.exchangeRate <= 1)) {
    return c.json({ message: 'A valid USD→ZiG exchange rate (>1) is required for dual-currency payroll runs' }, 400);
  }
  if (clientId && await checkClosedPeriod(clientId, startDate, endDate)) {
    return c.json({ message: 'Cannot create payroll for a closed period' }, 400);
  }

  const run = await prisma.payrollRun.create({
    data: {
      companyId,
      payrollCalendarId: body.payrollCalendarId || null,
      startDate,
      endDate,
      currency: isDual ? 'USD' : (body.currency || 'USD'),
      exchangeRate: body.exchangeRate || 1,
      dualCurrency: isDual,
      status: 'DRAFT',
      notes: body.notes || null,
    },
  });

  await audit({ c, action: 'PAYROLL_RUN_CREATED', resource: 'payroll_run', resourceId: run.id, details: { currency: run.currency, startDate, endDate, status: 'DRAFT' } });
  return c.json(run, 201);
});

router.get('/:runId', async (c) => {
  const companyId = c.get('companyId');
  const runId = c.req.param('runId');
  try {
    const sql = getSql();
    const [runRows, calRows, payslipRows] = await Promise.all([
      sql`SELECT * FROM "PayrollRun" WHERE id = ${runId}`,
      sql`SELECT pc.* FROM "PayrollCalendar" pc JOIN "PayrollRun" pr ON pr."payrollCalendarId" = pc.id WHERE pr.id = ${runId}`,
      sql`
        SELECT ps.*, e."firstName", e."lastName", e.position
        FROM "Payslip" ps
        JOIN "Employee" e ON e.id = ps."employeeId"
        WHERE ps."payrollRunId" = ${runId}
        ORDER BY ps."createdAt" ASC
      `,
    ]);
    if (!runRows.length) return c.json({ message: 'Payroll run not found' }, 404);
    const run = runRows[0] as any;
    if (!companyId || run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    return c.json({
      data: {
        ...run,
        payrollCalendar: calRows[0] ?? null,
        payslips: payslipRows.map((r: any) => ({
          id: r.id, employeeId: r.employeeId, payrollRunId: r.payrollRunId,
          gross: r.gross, paye: r.paye, aidsLevy: r.aidsLevy, nssaEmployee: r.nssaEmployee,
          loanDeductions: r.loanDeductions, netPay: r.netPay, pdfUrl: r.pdfUrl,
          createdAt: r.createdAt, updatedAt: r.updatedAt,
          employee: { firstName: r.firstName, lastName: r.lastName, position: r.position },
        })),
        _count: { payslips: payslipRows.length },
      },
    });
  } catch (err: any) {
    console.error('[payroll GET /:runId]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:runId', requirePermission('approve_payroll'), validateBody(updateRunSchema), async (c) => {
  const companyId = c.get('companyId');
  const body = c.req.valid('json');
  const run = await prisma.payrollRun.findUnique({ where: { id: c.req.param('runId') }, include: { payrollCalendar: true, company: true } });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (!companyId || run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  if (body.status && VALID_TRANSITIONS[run.status] && !VALID_TRANSITIONS[run.status].includes(body.status)) {
    return c.json({ message: `Cannot transition from ${run.status} to ${body.status}` }, 400);
  }

  const updated = await prisma.payrollRun.update({
    where: { id: run.id },
    data: {
      ...(body.status && { status: body.status }),
      ...(body.notes !== undefined && { notes: body.notes }),
      ...(body.exchangeRate !== undefined && { exchangeRate: body.exchangeRate }),
    },
  });

  if (body.status) await audit({ c, action: `PAYROLL_STATUS_${body.status}`, required: true, resource: 'payroll_run', resourceId: run.id });
  return c.json({ data: updated });
});

router.delete('/:runId', requirePermission('manage_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const run = await prisma.payrollRun.findUnique({ where: { id: c.req.param('runId') } });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (run.status !== 'DRAFT') return c.json({ message: 'Only DRAFT runs can be deleted' }, 400);
  if (!companyId || run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  await prisma.payrollRun.delete({ where: { id: c.req.param('runId') } });
  await audit({ c, action: 'PAYROLL_RUN_DELETED', resource: 'payroll_run', resourceId: run.id });
  return c.body(null, 204);
});

router.post('/:runId/submit', requirePermission('manage_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  const run = await prisma.payrollRun.findUnique({ where: { id: c.req.param('runId') }, include: { payrollCalendar: true } });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (!companyId || run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (run.status !== 'DRAFT') return c.json({ message: 'Only DRAFT runs can be submitted for approval' }, 400);
  if (clientId && await checkClosedPeriod(clientId, run.startDate, run.endDate)) {
    return c.json({ message: 'A closed calendar period overlaps with this payroll run dates' }, 400);
  }

  const updated = await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'PENDING_APPROVAL' } });
  await audit({ c, action: 'PAYROLL_RUN_SUBMITTED', required: true, resource: 'payroll_run', resourceId: run.id });
  return c.json(updated);
});

router.post('/:runId/approve', requirePermission('approve_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  const run = await prisma.payrollRun.findUnique({ where: { id: c.req.param('runId') }, include: { payrollCalendar: true } });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (!companyId || run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
  if (!['PENDING_APPROVAL', 'DRAFT'].includes(run.status)) return c.json({ message: 'Only DRAFT or PENDING_APPROVAL runs can be approved' }, 400);
  if (clientId && await checkClosedPeriod(clientId, run.startDate, run.endDate)) {
    return c.json({ message: 'A closed calendar period overlaps with this payroll run dates' }, 400);
  }

  const updated = await prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'APPROVED' } });
  await audit({ c, action: 'PAYROLL_RUN_APPROVED', required: true, resource: 'payroll_run', resourceId: run.id });
  return c.json(updated);
});

router.get('/:runId/payslips', async (c) => {
  const sql = getSql();
  const runRows = await sql`SELECT id, "companyId" FROM "PayrollRun" WHERE id = ${c.req.param('runId')}`;
  const run = runRows[0] as any ?? null;
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (!denyUnlessCompany(c, run)) return c.json({ message: 'Access denied' }, 403);
  const runSql = getSql();
  const [payslipRows, txRows] = await Promise.all([
    runSql`
      SELECT ps.*,
        e."firstName", e."lastName", e."employeeCode", e.position, e.currency AS emp_currency, e."baseRate"
      FROM "Payslip" ps
      JOIN "Employee" e ON e.id = ps."employeeId"
      WHERE ps."payrollRunId" = ${c.req.param('runId')}
      ORDER BY ps."createdAt" ASC
    `,
    runSql`
      SELECT pt.*,
        tc.type AS tc_type, tc.code AS tc_code, tc.name AS tc_name, tc."preTax" AS tc_pre_tax
      FROM "PayrollTransaction" pt
      JOIN "TransactionCode" tc ON tc.id = pt."transactionCodeId"
      WHERE pt."payrollRunId" = ${c.req.param('runId')}
      ORDER BY pt."createdAt" ASC
    `,
  ]);

  const txByEmp: Record<string, any[]> = {};
  for (const t of txRows as any[]) {
    if (!txByEmp[t.employeeId]) txByEmp[t.employeeId] = [];
    txByEmp[t.employeeId].push(t);
  }

  const result = (payslipRows as any[]).map((r) => {
    const empTxs = txByEmp[r.employeeId] || [];
    const earningTxs = empTxs.filter(t => t.tc_type === 'EARNING' || t.tc_type === 'BENEFIT');
    const deductionTxs = empTxs.filter(t => t.tc_type === 'DEDUCTION');
    return {
      id: r.id, employeeId: r.employeeId, payrollRunId: r.payrollRunId,
      gross: r.gross, paye: r.paye, aidsLevy: r.aidsLevy, nssaEmployee: r.nssaEmployee,
      loanDeductions: r.loanDeductions, netPay: r.netPay, pdfUrl: r.pdfUrl,
      grossUSD: r.grossusd ?? r.grossUSD ?? null, grossZIG: r.grosszig ?? r.grossZIG ?? null,
      payeUSD: r.payeusd ?? r.payeUSD ?? null, payeZIG: r.payezig ?? r.payeZIG ?? null,
      aidsLevyUSD: r.aidslevyusd ?? r.aidsLevyUSD ?? null, aidsLevyZIG: r.aidslevyzig ?? r.aidsLevyZIG ?? null,
      nssaUSD: r.nssausd ?? r.nssaUSD ?? null, nssaZIG: r.nssazig ?? r.nssaZIG ?? null,
      netPayUSD: r.netpayusd ?? r.netPayUSD ?? null, netPayZIG: r.netpayzig ?? r.netPayZIG ?? null,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
      employee: { firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode, position: r.position, currency: r.emp_currency, baseRate: r.baseRate },
      basicSalary: r.baseRate ?? 0,
      allowancesTotal: earningTxs.reduce((s: number, t: any) => s + Number(t.amount), 0),
      earningLines: earningTxs.map((t: any) => ({ tcId: t.transactionCodeId, code: t.tc_code, name: t.tc_name, amount: t.amount, currency: t.currency })),
      deductionLines: deductionTxs.map((t: any) => ({ tcId: t.transactionCodeId, code: t.tc_code, name: t.tc_name, amount: t.amount, currency: t.currency })),
    };
  });

  return c.json({ data: result });
});

router.post('/:runId/send-all', requirePermission('process_payroll'), async (c) => {
  const run = await prisma.payrollRun.findUnique({
    where: { id: c.req.param('runId') },
    select: { companyId: true, startDate: true, endDate: true },
  });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (!denyUnlessCompany(c, run)) return c.json({ message: 'Access denied' }, 403);
  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: c.req.param('runId') },
    include: { employee: { select: { firstName: true, lastName: true, email: true } }, payrollRun: { include: { company: { select: { name: true } } } } },
  });

  const period = `${new Date(run.startDate).toLocaleDateString()} – ${new Date(run.endDate).toLocaleDateString()}`;

  // Hoist all imports and shared queries before the loop
  const [
    { sendPayslip },
    { getYtdStartDate, calculateYTD },
    { generatePayslipHtml, generatePayslipEmailHtml },
    storageLib,
  ] = await Promise.all([
    import('../lib/mailer'),
    import('../lib/ytdCalculator'),
    import('../lib/payslipFormatter'),
    import('../lib/storage'),
  ]);

  const [allTransactions, firstRun] = await Promise.all([
    prisma.payrollTransaction.findMany({
      where: { payrollRunId: c.req.param('runId') },
      include: { transactionCode: { select: { code: true, name: true, type: true } } },
      orderBy: { transactionCodeId: 'asc' },
    }),
    prisma.payrollRun.findFirst({
      where: { companyId: run.companyId },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    }),
  ]);

  const txByEmp: Record<string, any[]> = {};
  for (const t of allTransactions) {
    if (!txByEmp[t.employeeId]) txByEmp[t.employeeId] = [];
    txByEmp[t.employeeId].push(t);
  }

  const ytdStart = getYtdStartDate(run.startDate, firstRun?.startDate || null);

  let sent = 0;
  const errors: string[] = [];

  // Process in batches of 5 to avoid exhausting connections and hitting CPU limits
  const BATCH = 5;
  for (let i = 0; i < payslips.length; i += BATCH) {
    const batch = payslips.slice(i, i + BATCH).filter(p => p.employee.email);
    await Promise.all(batch.map(async (p) => {
      try {
        let pdfUrl: string | null = null;
        let psHtml: string | undefined;
        if (p.pdfUrl) {
          pdfUrl = await storageLib.getSignedDownloadUrl(p.pdfUrl);
        } else {
          const transactions = txByEmp[p.employeeId] || [];
          const [historicalPayslips, historicalTransactions] = await Promise.all([
            prisma.payslip.findMany({
              where: { employeeId: p.employeeId, payrollRun: { startDate: { gte: ytdStart, lt: new Date(run.startDate) } } },
            }),
            prisma.payrollTransaction.findMany({
              where: { employeeId: p.employeeId, payrollRun: { startDate: { gte: ytdStart, lt: new Date(run.startDate) } } },
            }),
          ]);
          const ytd = calculateYTD({ currentPayslip: p, historicalPayslips, currentTransactions: transactions, historicalTransactions });
          const html = generatePayslipHtml({ payslip: p, transactions, ytd, run, emp: p.employee });
          const htmlKey = `payslips/${p.id}.html`;
          await storageLib.upload(htmlKey, html, 'text/html');
          pdfUrl = await storageLib.getSignedDownloadUrl(htmlKey);
          psHtml = generatePayslipEmailHtml({ payslip: p, transactions, run, emp: p.employee });
        }
        await sendPayslip(p.employee.email!, {
          employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
          companyName: (p as any).payrollRun.company.name,
          period,
          pdfUrl,
          payslipHtml: psHtml,
        });
        sent++;
      } catch (err: any) {
        errors.push(`${p.employee.firstName} ${p.employee.lastName}: ${err.message}`);
      }
    }));
  }
  return c.json({ message: `Sent ${sent} of ${payslips.length} payslips`, sent, errors: errors.length ? errors : undefined });
});

router.get('/:runId/payslips/:payslipId/pdf', async (c) => {
  const payslip = await prisma.payslip.findUnique({
    where: { id: c.req.param('payslipId') },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, employeeCode: true, position: true, tin: true,
          department: { select: { name: true } }, currency: true,
        },
      },
      payrollRun: {
        select: { companyId: true, startDate: true, endDate: true, currency: true, dualCurrency: true, company: { select: { name: true, address: true, taxId: true, registrationNumber: true } } },
      },
    },
  });
  if (!payslip) return c.json({ message: 'Payslip not found' }, 404);
  if (!denyUnlessCompany(c, payslip.payrollRun)) return c.json({ message: 'Access denied' }, 403);
  if (payslip.pdfUrl) {
    const url = await (await import('../lib/storage')).getSignedDownloadUrl(payslip.pdfUrl);
    return c.redirect(url);
  }

  const format = c.req.query('format');
  if (format && format !== 'html') return c.json({ message: 'PDF not generated yet' }, 404);
  const doPrint = c.req.query('print') === '1';

  const transactions = await prisma.payrollTransaction.findMany({
    where: { payrollRunId: c.req.param('runId'), employeeId: payslip.employeeId },
    include: { transactionCode: { select: { code: true, name: true, type: true } } },
    orderBy: { transactionCodeId: 'asc' },
  });

  const run = payslip.payrollRun;
  const emp = payslip.employee;

  const firstRun = await prisma.payrollRun.findFirst({
    where: { companyId: run.companyId },
    orderBy: { startDate: 'asc' },
    select: { startDate: true },
  });
  const { calculateYTD, getYtdStartDate } = await import('../lib/ytdCalculator');
  const ytdStart = getYtdStartDate(run.startDate, firstRun?.startDate || null);
  const [historicalPayslips, historicalTransactions] = await Promise.all([
    prisma.payslip.findMany({
      where: { employeeId: payslip.employeeId, payrollRun: { startDate: { gte: ytdStart, lt: new Date(run.startDate) } } },
    }),
    prisma.payrollTransaction.findMany({
      where: { employeeId: payslip.employeeId, payrollRun: { startDate: { gte: ytdStart, lt: new Date(run.startDate) } } },
    }),
  ]);
  const ytd = calculateYTD({
    currentPayslip: payslip,
    historicalPayslips,
    currentTransactions: transactions,
    historicalTransactions,
  });

  // Fetch leave balance (gracefully skip if tables not yet migrated)
  const leaveYear = new Date(run.startDate).getFullYear();
  let leaveBalance: number | null = null, leaveTaken: number | null = null;
  try {
    const annualPolicy = await prisma.leavePolicy.findFirst({
      where: { companyId: run.companyId, isActive: true, accrualRate: { gt: 0 }, leaveType: { name: { contains: 'Annual', mode: 'insensitive' } } },
    });
    if (annualPolicy) {
      const bal = await prisma.leaveBalance.findFirst({
        where: { employeeId: payslip.employeeId, companyId: run.companyId, year: leaveYear, leaveTypeId: annualPolicy.leaveTypeId },
      });
      if (bal) { leaveBalance = bal.balance; leaveTaken = bal.taken; }
    }
  } catch { /* leave balance unavailable */ }

  const { generatePayslipHtml } = await import('../lib/payslipFormatter');
  let html = generatePayslipHtml({ payslip, transactions, ytd, run, emp, leaveBalance, leaveTaken });
  if (doPrint) {
    html = html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script></body>');
  }
  return c.html(html);
});

router.post('/:runId/payslips/:payslipId/send', requirePermission('process_payroll'), async (c) => {
  try {
  const payslip = await prisma.payslip.findUnique({
    where: { id: c.req.param('payslipId') },
    include: {
      employee: { select: { firstName: true, lastName: true, email: true, employeeCode: true, position: true, tin: true, department: { select: { name: true } } } },
      payrollRun: { select: { companyId: true, startDate: true, endDate: true, currency: true, dualCurrency: true, company: { select: { name: true, address: true, taxId: true } } } },
    },
  });
  if (!payslip) return c.json({ message: 'Payslip not found' }, 404);
  if (!denyUnlessCompany(c, payslip.payrollRun)) return c.json({ message: 'Access denied' }, 403);
  if (!payslip.employee.email) return c.json({ message: 'Employee has no email address' }, 400);

  const period = `${new Date(payslip.payrollRun.startDate).toLocaleDateString()} – ${new Date(payslip.payrollRun.endDate).toLocaleDateString()}`;

  let pdfUrl: string | null = null;
  let payslipHtml: string | undefined;
  if (payslip.pdfUrl) {
    pdfUrl = await (await import('../lib/storage')).getSignedDownloadUrl(payslip.pdfUrl);
  } else {
    const transactions = await prisma.payrollTransaction.findMany({
      where: { payrollRunId: c.req.param('runId'), employeeId: payslip.employeeId },
      include: { transactionCode: { select: { code: true, name: true, type: true } } },
      orderBy: { transactionCodeId: 'asc' },
    });
    const run = payslip.payrollRun;
    const emp = payslip.employee;
    const firstRun = await prisma.payrollRun.findFirst({
      where: { companyId: run.companyId },
      orderBy: { startDate: 'asc' },
      select: { startDate: true },
    });
    const { getYtdStartDate } = await import('../lib/ytdCalculator');
    const ytdStart = getYtdStartDate(run.startDate, firstRun?.startDate || null);
    const [historicalPayslips, historicalTransactions] = await Promise.all([
      prisma.payslip.findMany({
        where: { employeeId: payslip.employeeId, payrollRun: { startDate: { gte: ytdStart, lt: new Date(run.startDate) } } },
      }),
      prisma.payrollTransaction.findMany({
        where: { employeeId: payslip.employeeId, payrollRun: { startDate: { gte: ytdStart, lt: new Date(run.startDate) } } },
      }),
    ]);
    const { calculateYTD: calcYTD } = await import('../lib/ytdCalculator');
    const ytd = calcYTD({
      currentPayslip: payslip,
      historicalPayslips,
      currentTransactions: transactions,
      historicalTransactions,
    });

    // Fetch leave balance (gracefully skip if tables not yet migrated)
    const leaveYear = new Date(run.startDate).getFullYear();
    let leaveBalance: number | null = null, leaveTaken: number | null = null;
    try {
      const annualPolicy = await prisma.leavePolicy.findFirst({
        where: { companyId: run.companyId, isActive: true, accrualRate: { gt: 0 }, leaveType: { name: { contains: 'Annual', mode: 'insensitive' } } },
      });
      if (annualPolicy) {
        const bal = await prisma.leaveBalance.findFirst({
          where: { employeeId: payslip.employeeId, companyId: run.companyId, year: leaveYear, leaveTypeId: annualPolicy.leaveTypeId },
        });
        if (bal) { leaveBalance = bal.balance; leaveTaken = bal.taken; }
      }
    } catch { /* leave balance unavailable */ }

    const { generatePayslipHtml, generatePayslipEmailHtml } = await import('../lib/payslipFormatter');
    const html = generatePayslipHtml({ payslip, transactions, ytd, run, emp, leaveBalance, leaveTaken });
    const htmlKey = `payslips/${payslip.id}.html`;
    await (await import('../lib/storage')).upload(htmlKey, html, 'text/html');
    pdfUrl = await (await import('../lib/storage')).getSignedDownloadUrl(htmlKey);
    payslipHtml = generatePayslipEmailHtml({ payslip, transactions, run, emp });
  }

  const { sendPayslip } = await import('../lib/mailer');
  await sendPayslip(payslip.employee.email, {
    employeeName: `${payslip.employee.firstName} ${payslip.employee.lastName}`,
    companyName: payslip.payrollRun.company.name,
    period,
    pdfUrl,
    payslipHtml,
  });

  return c.json({ message: 'Payslip sent', to: payslip.employee.email });
  } catch (err: any) {
    console.error('[payslip send]', err?.message, err?.stack?.split('\n')[0]);
    return c.json({ message: err?.message || 'Failed to send payslip' }, 500);
  }
});

router.get('/payroll-inputs', requirePermission('view_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  if (!companyId && !clientId) return c.json([]);
  const payrollRunId = c.req.query('payrollRunId');
  const employeeId = c.req.query('employeeId');
  const processed = c.req.query('processed');
  const period = c.req.query('period');

  const where: Record<string, unknown> = {};
  if (payrollRunId) where.payrollRunId = payrollRunId;
  if (employeeId) where.employeeId = employeeId;
  if (processed !== undefined && processed !== '') where.processed = processed === 'true';
  if (companyId) where.employee = { companyId };
  else if (clientId) where.employee = { clientId };
  if (period) {
    where.OR = [{ period }, { period: { lte: period }, duration: 'Indefinite' }];
  }

  const inputs = await prisma.payrollInput.findMany({
    where,
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      transactionCode: { select: { code: true, name: true, type: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  return c.json(inputs);
});

const createInputSchema = z.object({
  employeeId: z.string().min(1),
  payrollRunId: z.string().optional(),
  transactionCodeId: z.string().min(1),
  period: z.string().min(1),
  employeeUSD: z.number().optional(),
  employeeZiG: z.number().optional(),
  employerUSD: z.number().optional(),
  employerZiG: z.number().optional(),
  units: z.number().optional(),
  unitsType: z.string().optional(),
  duration: z.string().optional(),
  balance: z.number().optional(),
  notes: z.string().optional(),
});

router.post('/payroll-inputs', requirePermission('process_payroll'), validateBody(createInputSchema), async (c) => {
  const body = c.req.valid('json');
  const companyId = c.get('companyId');

  if (body.period && companyId) {
    const [yyyy, mm] = body.period.split('-').map(Number);
    if (yyyy && mm) {
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { clientId: true } });
      if (company) {
        const lockedCal = await prisma.payrollCalendar.findFirst({
          where: { clientId: company.clientId, isClosed: true, startDate: { lte: new Date(yyyy, mm, 0, 23, 59, 59) }, endDate: { gte: new Date(yyyy, mm - 1, 1) } },
        });
        if (lockedCal) return c.json({ message: `Period ${body.period} is locked. Unlock the payroll calendar before adding inputs.` }, 423);
      }
    }
  }

  const data: Record<string, unknown> = {
    employeeUSD: body.employeeUSD || 0,
    employeeZiG: body.employeeZiG || 0,
    employerUSD: body.employerUSD || 0,
    employerZiG: body.employerZiG || 0,
    units: body.units ?? null,
    unitsType: body.unitsType || null,
    duration: body.duration || 'Indefinite',
    balance: body.balance || 0,
    notes: body.notes || null,
  };

  const created = await prisma.payrollInput.create({
    data: { employeeId: body.employeeId, payrollRunId: body.payrollRunId || null, transactionCodeId: body.transactionCodeId, period: body.period, ...data },
  });
  const input = await prisma.payrollInput.findUnique({
    where: { id: created.id },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      transactionCode: { select: { code: true, name: true, type: true } },
    },
  });
  return c.json(input, 201);
});

router.put('/payroll-inputs/:id', requirePermission('process_payroll'), validateBody(updateInputSchema), async (c) => {
  const existing = await prisma.payrollInput.findUnique({
    where: { id: c.req.param('id') },
    include: { employee: { select: { companyId: true, clientId: true } } },
  });
  if (!existing) return c.json({ message: 'Payroll input not found' }, 404);
  if (!denyUnlessCompany(c, { companyId: existing.employee.companyId })) return c.json({ message: 'Access denied' }, 403);
  if (existing.processed) return c.json({ message: 'Cannot edit a processed input' }, 400);

  const body = c.req.valid('json' as any);
  const data: Record<string, unknown> = {};
  if (body.employeeUSD !== undefined) data.employeeUSD = body.employeeUSD;
  if (body.employeeZiG !== undefined) data.employeeZiG = body.employeeZiG;
  if (body.employerUSD !== undefined) data.employerUSD = body.employerUSD;
  if (body.employerZiG !== undefined) data.employerZiG = body.employerZiG;
  if (body.units !== undefined) data.units = body.units;
  if (body.notes !== undefined) data.notes = body.notes;
  if (body.duration !== undefined) data.duration = body.duration;
  if (body.transactionCodeId) data.transactionCodeId = body.transactionCodeId;

  await prisma.payrollInput.update({ where: { id: c.req.param('id') }, data });
  const input = await prisma.payrollInput.findUnique({
    where: { id: c.req.param('id') },
    include: {
      employee: { select: { firstName: true, lastName: true, employeeCode: true } },
      transactionCode: { select: { code: true, name: true, type: true } },
    },
  });
  return c.json(input);
});

router.delete('/payroll-inputs/processed', requirePermission('process_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ deleted: 0 });
  const where: Record<string, unknown> = { processed: true, employee: { companyId } };
  const { count } = await prisma.payrollInput.deleteMany({ where });
  return c.json({ deleted: count });
});

router.delete('/payroll-inputs/:id', requirePermission('process_payroll'), async (c) => {
  const input = await prisma.payrollInput.findUnique({
    where: { id: c.req.param('id') },
    include: { employee: { select: { companyId: true, clientId: true } } },
  });
  if (!input) return c.json({ message: 'Payroll input not found' }, 404);
  if (!denyUnlessCompany(c, { companyId: input.employee.companyId })) return c.json({ message: 'Access denied' }, 403);
  if (input.processed) return c.json({ message: 'Cannot delete a processed input' }, 400);
  await prisma.payrollInput.delete({ where: { id: c.req.param('id') } });
  return c.body(null, 204);
});

router.get('/payroll-calendar', requirePermission('view_payroll'), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json([]);
  const year = c.req.query('year');
  const isClosed = c.req.query('isClosed');
  const where: Record<string, unknown> = { clientId };
  if (year) where.year = parseInt(year);
  if (isClosed !== undefined) where.isClosed = isClosed === 'true';

  const calendars = await prisma.payrollCalendar.findMany({ where, orderBy: [{ year: 'desc' }, { month: 'desc' }] });
  return c.json(calendars);
});

const createCalendarSchema = z.object({
  periodType: z.string().optional(),
  year: z.number(),
  month: z.number().optional(),
  payDay: z.number().optional(),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
});

router.post('/payroll-calendar', requirePermission('manage_payroll'), validateBody(createCalendarSchema), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  const body = c.req.valid('json');
  const existing = await prisma.payrollCalendar.findFirst({
    where: { clientId, year: body.year, month: body.month || null },
  });
  if (existing) return c.json({ message: 'A payroll calendar already exists for this year and month' }, 400);

  const d = new Date(body.startDate);
  const calendar = await prisma.payrollCalendar.create({
    data: {
      clientId,
      periodType: body.periodType || 'MONTHLY',
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      payDay: body.payDay || 25,
      startDate: d,
      endDate: new Date(body.endDate),
    },
  });
  return c.json(calendar, 201);
});

router.get('/payroll-calendar/:id', async (c) => {
  const calendar = await prisma.payrollCalendar.findUnique({
    where: { id: c.req.param('id') },
    include: { _count: { select: { payrollRuns: true } } },
  });
  if (!calendar) return c.json({ message: 'Payroll calendar not found' }, 404);
  if (!denyUnlessClient(c, calendar)) return c.json({ message: 'Access denied' }, 403);
  return c.json(calendar);
});

router.put('/payroll-calendar/:id', requirePermission('manage_payroll'), validateBody(updateCalendarSchema), async (c) => {
  const existing = await prisma.payrollCalendar.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'Payroll calendar not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);
  try {
    const body = c.req.valid('json' as any);
    const calendar = await prisma.payrollCalendar.update({
      where: { id: c.req.param('id') },
      data: {
        ...body,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
      },
    });
    return c.json(calendar);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Payroll calendar not found' }, 404);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/payroll-calendar/:id/close', requirePermission('process_payroll'), async (c) => {
  try {
    const calendar = await prisma.payrollCalendar.findUnique({ where: { id: c.req.param('id') } });
    if (!calendar) return c.json({ message: 'Payroll calendar not found' }, 404);
    const clientCtx = c.get('clientId');
    if (!clientCtx || calendar.clientId !== clientCtx) return c.json({ message: 'Access denied' }, 403);
    if (calendar.isClosed) return c.json({ message: 'Calendar already closed' }, 400);

    await prisma.payrollCalendar.update({ where: { id: c.req.param('id') }, data: { isClosed: true } });

    const { count: runsCompleted } = await prisma.payrollRun.updateMany({
      where: { payrollCalendarId: c.req.param('id'), status: 'PROCESSING' },
      data: { status: 'COMPLETED' },
    });

    const { count: repaymentsMarked } = await prisma.loanRepayment.updateMany({
      where: {
        status: 'UNPAID',
        dueDate: { gte: calendar.startDate, lte: calendar.endDate },
        loan: { employee: { clientId: calendar.clientId } },
      },
      data: { status: 'OVERDUE' },
    });

    const activeEmployees = await prisma.employee.findMany({
      where: { clientId: calendar.clientId, dischargeDate: null },
      select: { id: true, leaveEntitlement: true, leaveBalance: true },
    });

    for (const emp of activeEmployees) {
      const annualEntitlement = emp.leaveEntitlement || 30;
      const monthlyAccrual = annualEntitlement / 12;
      await prisma.employee.update({
        where: { id: emp.id },
        data: { leaveBalance: { increment: monthlyAccrual }, leaveTaken: 0 },
      });
    }

    await prisma.employee.updateMany({
      where: { clientId: calendar.clientId, dischargeDate: { not: null } },
      data: { leaveTaken: 0 },
    });

    return c.json({ message: 'Period closed', runsCompleted, repaymentsMarked });
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/payroll-calendar/:id', requirePermission('manage_payroll'), async (c) => {
  const existing = await prisma.payrollCalendar.findUnique({ where: { id: c.req.param('id') }, select: { clientId: true } });
  if (!existing) return c.json({ message: 'Payroll calendar not found' }, 404);
  if (!denyUnlessClient(c, existing)) return c.json({ message: 'Access denied' }, 403);
  try {
    await prisma.payrollCalendar.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Payroll calendar not found' }, 404);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/:runId/reconcile', requirePermission('process_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const run = await prisma.payrollRun.findUnique({
    where: { id: c.req.param('runId') },
    include: { company: true },
  });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const year = parseInt(c.req.query('year') || new Date(run.startDate).getFullYear().toString());
  const yearStart = new Date(year, 3, 1);
  const yearEnd = new Date(year + 1, 2, 31, 23, 59, 59);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRun: { companyId, status: 'COMPLETED', startDate: { gte: yearStart, lte: yearEnd } } },
    select: { employeeId: true, gross: true, paye: true, aidsLevy: true, nssaEmployee: true },
    orderBy: { payrollRunId: 'asc' },
  });

  const byEmployee: Record<string, { cumulativeGross: number; cumulativePaye: number; cumulativeAidsLevy: number; months: number }> = {};
  for (const ps of payslips) {
    if (!byEmployee[ps.employeeId]) byEmployee[ps.employeeId] = { cumulativeGross: 0, cumulativePaye: 0, cumulativeAidsLevy: 0, months: 0 };
    byEmployee[ps.employeeId].cumulativeGross += Number(ps.gross || 0);
    byEmployee[ps.employeeId].cumulativePaye += Number(ps.paye || 0);
    byEmployee[ps.employeeId].cumulativeAidsLevy += Number(ps.aidsLevy || 0);
    byEmployee[ps.employeeId].months++;
  }

  const employees = await prisma.employee.findMany({
    where: { id: { in: Object.keys(byEmployee) }, companyId },
    select: { id: true, firstName: true, lastName: true, employeeCode: true, taxCredits: true },
  });
  const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

  const results = [];
  for (const [empId, agg] of Object.entries(byEmployee)) {
    const emp = empMap[empId];
    if (!emp) continue;
    const correctAnnual = agg.cumulativeGross * 0.2; // Simplified — real tax engine would be used
    const deducted = agg.cumulativePaye + agg.cumulativeAidsLevy;
    const adjustment = parseFloat((correctAnnual - deducted).toFixed(2));
    results.push({
      employeeId: empId, name: `${emp.firstName} ${emp.lastName}`, employeeCode: emp.employeeCode,
      year, months: agg.months, cumulativeGross: parseFloat(agg.cumulativeGross.toFixed(2)),
      deductedPaye: parseFloat(deducted.toFixed(2)), correctAnnualPaye: parseFloat(correctAnnual.toFixed(2)),
      adjustment, adjustmentType: adjustment > 0 ? 'UNDERPAID' : adjustment < 0 ? 'OVERPAID' : 'BALANCED',
    });
  }

  return c.json({ runId: run.id, year, currency: run.currency || 'USD', summary: { totalEmployees: results.length, note: 'Apply adjustments as PAYE_ADJUSTMENT PayrollInputs.' }, results });
});

router.get('/:runId/input-reconciliation', requirePermission('process_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const run = await prisma.payrollRun.findUnique({
    where: { id: c.req.param('runId') },
    select: { id: true, companyId: true, currency: true, exchangeRate: true, dualCurrency: true },
  });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const [payslips, inputs] = await Promise.all([
    prisma.payslip.findMany({
      where: { payrollRunId: run.id },
      select: { employeeId: true, gross: true, employee: { select: { firstName: true, lastName: true, employeeCode: true } } },
    }),
    prisma.payrollInput.findMany({
      where: { payrollRunId: run.id, processed: true },
      include: { transactionCode: { select: { type: true } } },
    }),
  ]);

  const inputTotals: Record<string, number> = {};
  for (const inp of inputs) {
    if (inp.transactionCode?.type === 'EARNING' || inp.transactionCode?.type === 'BENEFIT') {
      inputTotals[inp.employeeId] = (inputTotals[inp.employeeId] || 0) + Number(inp.employeeUSD || 0);
    }
  }

  const results = payslips.map(ps => {
    const inputAmt = inputTotals[ps.employeeId] || 0;
    const diff = parseFloat((Number(ps.gross) - inputAmt).toFixed(4));
    return { employeeId: ps.employeeId, name: `${ps.employee.firstName} ${ps.employee.lastName}`, employeeCode: ps.employee.employeeCode, payslipGross: Number(ps.gross), inputEarnings: inputAmt, diff, status: Math.abs(diff) < 0.01 ? 'OK' : 'MISMATCH' };
  });

  return c.json({ runId: run.id, summary: { total: results.length, mismatches: results.filter(r => r.status === 'MISMATCH').length }, results });
});

router.get('/:runId/export', requirePermission('export_reports'), async (c) => {
  const run = await prisma.payrollRun.findUnique({ where: { id: c.req.param('runId') }, select: { companyId: true } });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (!denyUnlessCompany(c, run)) return c.json({ message: 'Access denied' }, 403);

  const payslips = await prisma.payslip.findMany({
    where: { payrollRunId: c.req.param('runId') },
    include: { employee: { select: { firstName: true, lastName: true, employeeCode: true, position: true, currency: true } } },
    orderBy: { employeeId: 'asc' },
  });

  const header = 'Employee Code,Name,Position,Gross,PAYE,AIDS Levy,NSSA,Loan Deductions,Net Pay,Currency\n';
  const rows = payslips.map(p =>
    [
      p.employee.employeeCode || '',
      `${p.employee.firstName} ${p.employee.lastName}`,
      p.employee.position || '',
      fmt2(p.gross), fmt2(p.paye), fmt2(p.aidsLevy), fmt2(p.nssaEmployee),
      fmt2((p as any).loanDeductions ?? 0), fmt2(p.netPay),
      p.employee.currency || 'USD',
    ].join(',')
  ).join('\n');

  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', `attachment; filename=payroll-export-${c.req.param('runId')}.csv`);
  return c.body(header + rows);
});

export default router;
