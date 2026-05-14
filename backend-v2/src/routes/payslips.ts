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

  const where: Record<string, unknown> = {};

  if (user.role === 'EMPLOYEE' && employeeIdFromCtx) {
    where.employeeId = employeeIdFromCtx;
  } else if (companyId) {
    where.payrollRun = { companyId };
  } else {
    const clientId = c.get('clientId');
    if (clientId) {
      where.payrollRun = { company: { clientId } };
    } else {
      return c.json({ data: [], total: 0, page, limit });
    }
  }

  const sql = getSql();

  let filterClause: string;
  let countClause: string;
  let params: unknown[];

  if (user.role === 'EMPLOYEE' && employeeIdFromCtx) {
    filterClause = `ps."employeeId" = $1`;
    countClause = filterClause;
    params = [employeeIdFromCtx];
  } else if (companyId) {
    filterClause = `pr."companyId" = $1`;
    countClause = filterClause;
    params = [companyId];
  } else {
    const clientId = c.get('clientId');
    if (clientId) {
      filterClause = `co."clientId" = $1`;
      countClause = `pr."companyId" IN (SELECT id FROM "Company" WHERE "clientId" = $1)`;
      params = [clientId];
    } else {
      return c.json({ data: [], total: 0, page, limit });
    }
  }

  const [rows, countRows] = await Promise.all([
    sql.unsafe(`
      SELECT
        ps.id, ps."employeeId", ps."payrollRunId", ps.gross, ps.paye, ps."aidsLevy",
        ps."nssaEmployee", ps."loanDeductions", ps."netPay", ps."pdfUrl", ps."createdAt",
        e."firstName", e."lastName", e."employeeCode",
        pr."startDate", pr."endDate", pr.currency, pr.status AS "runStatus", pr."runDate"
      FROM "Payslip" ps
      JOIN "Employee" e ON e.id = ps."employeeId"
      JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
      ${filterClause.includes('co.') ? 'JOIN "Company" co ON co.id = pr."companyId"' : ''}
      WHERE ${filterClause}
      ORDER BY pr."runDate" DESC NULLS LAST
      LIMIT ${limit} OFFSET ${skip}
    `, params),
    sql.unsafe(`
      SELECT COUNT(*)::int AS total
      FROM "Payslip" ps
      JOIN "PayrollRun" pr ON pr.id = ps."payrollRunId"
      WHERE ${countClause}
    `, params),
  ]);

  const payslips = rows.map((r: any) => ({
    id: r.id,
    employeeId: r.employeeId,
    payrollRunId: r.payrollRunId,
    gross: r.gross,
    paye: r.paye,
    aidsLevy: r.aidsLevy,
    nssaEmployee: r.nssaEmployee,
    loanDeductions: r.loanDeductions,
    netPay: r.netPay,
    pdfUrl: r.pdfUrl,
    createdAt: r.createdAt,
    employee: { firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode },
    payrollRun: { startDate: r.startDate, endDate: r.endDate, currency: r.currency, status: r.runStatus },
  }));

  return c.json({ data: payslips, total: countRows[0]?.total ?? 0, page, limit });
});

router.get('/:id', requirePermission('view_payroll'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');
  const user = c.get('user');
  const employeeIdFromCtx = c.get('employeeId');

  const payslip = await prisma.payslip.findUnique({
    where: { id },
    include: {
      employee: {
        select: {
          firstName: true, lastName: true, employeeCode: true, position: true,
          department: { select: { name: true } },
        },
      },
      payrollRun: {
        include: {
          company: {
            select: { id: true, name: true, registrationNumber: true, taxId: true, address: true },
          },
        },
      },
    },
  });

  if (!payslip) return c.json({ message: 'Payslip not found' }, 404);
  if (user.role === 'EMPLOYEE' && payslip.employeeId !== employeeIdFromCtx) {
    return c.json({ message: 'Access denied' }, 403);
  }
  if (!companyId || payslip.payrollRun.companyId !== companyId) {
    return c.json({ message: 'Access denied' }, 403);
  }

  return c.json({ data: payslip });
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
