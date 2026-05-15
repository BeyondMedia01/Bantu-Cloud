import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, getSql } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const createPayslipSchema = z.object({
  employeeId: z.string().min(1),
  payrollRunId: z.string().min(1),
  gross: z.number(),
  paye: z.number(),
  aidsLevy: z.number().optional(),
  nssaEmployee: z.number().optional(),
  loanDeductions: z.number().optional(),
  netPay: z.number(),
});

router.get('/', requirePermission('view_payroll'), async (c) => {
  const companyId = c.get('companyId');
  const user = c.get('user');
  const employeeIdFromCtx = c.get('employeeId');
  const page = Math.max(1, parseInt(c.req.query('page') || '1') || 1);
  const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') || '20') || 20));
  const skip = (page - 1) * limit;

  try {
    const sql = getSql();
    const limitLit = sql.unsafe(String(limit));
    const skipLit = sql.unsafe(String(skip));

    let rows: any[], total: number;

    if (user.role === 'EMPLOYEE' && employeeIdFromCtx) {
      const [data, cnt] = await Promise.all([
        sql`
          SELECT ps.*,
            e."firstName", e."lastName", e."employeeCode",
            pr."startDate" AS pr_start, pr."endDate" AS pr_end, pr.currency AS pr_currency, pr.status AS pr_status
          FROM "Payslip" ps
          JOIN "Employee" e ON e.id = ps."employeeId"
          JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
          WHERE ps."employeeId" = ${employeeIdFromCtx}
          ORDER BY ps."createdAt" DESC
          LIMIT ${limitLit} OFFSET ${skipLit}
        `,
        sql`SELECT COUNT(*)::int AS cnt FROM "Payslip" WHERE "employeeId" = ${employeeIdFromCtx}`,
      ]);
      rows = data;
      total = cnt[0]?.cnt ?? 0;
    } else if (companyId) {
      const [data, cnt] = await Promise.all([
        sql`
          SELECT ps.*,
            e."firstName", e."lastName", e."employeeCode",
            pr."startDate" AS pr_start, pr."endDate" AS pr_end, pr.currency AS pr_currency, pr.status AS pr_status
          FROM "Payslip" ps
          JOIN "Employee" e ON e.id = ps."employeeId"
          JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
          WHERE pr."companyId" = ${companyId}
          ORDER BY ps."createdAt" DESC
          LIMIT ${limitLit} OFFSET ${skipLit}
        `,
        sql`SELECT COUNT(ps.*)::int AS cnt FROM "Payslip" ps JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId" WHERE pr."companyId" = ${companyId}`,
      ]);
      rows = data;
      total = cnt[0]?.cnt ?? 0;
    } else {
      const clientId = c.get('clientId');
      if (!clientId) return c.json({ data: [], total: 0, page, limit });
      const [data, cnt] = await Promise.all([
        sql`
          SELECT ps.*,
            e."firstName", e."lastName", e."employeeCode",
            pr."startDate" AS pr_start, pr."endDate" AS pr_end, pr.currency AS pr_currency, pr.status AS pr_status
          FROM "Payslip" ps
          JOIN "Employee" e ON e.id = ps."employeeId"
          JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
          JOIN "Company" co ON co.id = pr."companyId"
          WHERE co."clientId" = ${clientId}
          ORDER BY ps."createdAt" DESC
          LIMIT ${limitLit} OFFSET ${skipLit}
        `,
        sql`SELECT COUNT(ps.*)::int AS cnt FROM "Payslip" ps JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId" JOIN "Company" co ON co.id = pr."companyId" WHERE co."clientId" = ${clientId}`,
      ]);
      rows = data;
      total = cnt[0]?.cnt ?? 0;
    }

    const data = rows.map((r: any) => ({
      id: r.id, employeeId: r.employeeId, payrollRunId: r.payrollRunId,
      gross: r.gross, paye: r.paye, aidsLevy: r.aidsLevy, nssaEmployee: r.nssaEmployee,
      loanDeductions: r.loanDeductions, netPay: r.netPay, pdfUrl: r.pdfUrl,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
      employee: { firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode },
      payrollRun: { startDate: r.pr_start, endDate: r.pr_end, currency: r.pr_currency, status: r.pr_status },
    }));

    return c.json({ data, total, page, limit });
  } catch (err: any) {
    console.error('[payslips GET]', err?.message);
    return c.json({ message: 'Failed to load payslips', error: err?.message }, 500);
  }
});

router.get('/:id', requirePermission('view_payroll'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const user = c.get('user');
  const employeeIdFromCtx = c.get('employeeId');

  const sql = getSql();
  const rows = await sql`
    SELECT
      ps.*,
      e."firstName", e."lastName", e."employeeCode", e.position,
      d.name AS dept_name,
      pr.id AS pr_id, pr."companyId" AS pr_company_id, pr."startDate" AS pr_start, pr."endDate" AS pr_end,
      pr.currency AS pr_currency, pr.status AS pr_status, pr."exchangeRate" AS pr_xr,
      pr."dualCurrency" AS pr_dual, pr."runDate" AS pr_run_date,
      co.id AS co_id, co.name AS co_name, co."registrationNumber" AS co_reg, co."taxId" AS co_tax, co.address AS co_address
    FROM "Payslip" ps
    JOIN "Employee" e ON e.id = ps."employeeId"
    LEFT JOIN "Department" d ON d.id = e."departmentId"
    JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
    JOIN "Company" co ON co.id = pr."companyId"
    WHERE ps.id = ${id}
  `;

  if (!rows.length) return c.json({ message: 'Payslip not found' }, 404);
  const r = rows[0] as any;
  if (user.role === 'EMPLOYEE' && r.employeeId !== employeeIdFromCtx) {
    return c.json({ message: 'Access denied' }, 403);
  }
  if (!companyId || r.pr_company_id !== companyId) {
    return c.json({ message: 'Access denied' }, 403);
  }

  return c.json({
    data: {
      id: r.id, employeeId: r.employeeId, payrollRunId: r.payrollRunId,
      gross: r.gross, paye: r.paye, aidsLevy: r.aidsLevy, nssaEmployee: r.nssaEmployee,
      loanDeductions: r.loanDeductions, netPay: r.netPay, pdfUrl: r.pdfUrl,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
      employee: {
        firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode, position: r.position,
        department: r.dept_name ? { name: r.dept_name } : null,
      },
      payrollRun: {
        id: r.pr_id, companyId: r.pr_company_id, startDate: r.pr_start, endDate: r.pr_end,
        currency: r.pr_currency, status: r.pr_status, exchangeRate: r.pr_xr,
        dualCurrency: r.pr_dual, runDate: r.pr_run_date,
        company: { id: r.co_id, name: r.co_name, registrationNumber: r.co_reg, taxId: r.co_tax, address: r.co_address },
      },
    },
  });
});

router.post('/', requirePermission('manage_payroll'), validateBody(createPayslipSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const body = c.req.valid('json');

  const run = await prisma.payrollRun.findUnique({
    where: { id: body.payrollRunId },
    select: { companyId: true },
  });
  if (!run) return c.json({ message: 'Payroll run not found' }, 404);
  if (run.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  const employee = await prisma.employee.findUnique({
    where: { id: body.employeeId },
    select: { companyId: true },
  });
  if (!employee || employee.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

  try {
    const payslip = await prisma.payslip.create({
      data: {
        employeeId: body.employeeId,
        payrollRunId: body.payrollRunId,
        gross: body.gross,
        paye: body.paye,
        aidsLevy: body.aidsLevy ?? 0,
        nssaEmployee: body.nssaEmployee ?? 0,
        loanDeductions: body.loanDeductions ?? 0,
        netPay: body.netPay,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        payrollRun: { select: { startDate: true, endDate: true } },
      },
    });
    return c.json(payslip, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ message: 'Payslip already exists for this employee and payroll run' }, 409);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:id', requirePermission('manage_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const { id } = c.req.param();

  try {
    const existing = await prisma.payslip.findUnique({
      where: { id },
      include: { payrollRun: { select: { companyId: true } } },
    });
    if (!existing) return c.json({ message: 'Payslip not found' }, 404);
    if (existing.payrollRun.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);

    const body = await c.req.json();
    const payslip = await prisma.payslip.update({
      where: { id },
      data: {
        ...(body.gross !== undefined && { gross: body.gross }),
        ...(body.paye !== undefined && { paye: body.paye }),
        ...(body.aidsLevy !== undefined && { aidsLevy: body.aidsLevy }),
        ...(body.nssaEmployee !== undefined && { nssaEmployee: body.nssaEmployee }),
        ...(body.loanDeductions !== undefined && { loanDeductions: body.loanDeductions }),
        ...(body.netPay !== undefined && { netPay: body.netPay }),
        ...(body.pdfUrl !== undefined && { pdfUrl: body.pdfUrl }),
      },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        payrollRun: { select: { startDate: true, endDate: true } },
      },
    });
    return c.json(payslip);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Payslip not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
