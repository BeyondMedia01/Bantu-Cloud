import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, getSql } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';

const router = new Hono();

const createTransactionSchema = z.object({
  employeeId: z.string().min(1),
  transactionCodeId: z.string().min(1),
  payrollRunId: z.string().optional(),
  amount: z.number(),
  currency: z.string().optional(),
  description: z.string().optional(),
});

router.get('/', requirePermission('view_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  try {
    const page = Math.max(1, parseInt(c.req.query('page') || '1'));
    const limit = Math.min(500, parseInt(c.req.query('limit') || '200'));
    const skip = (page - 1) * limit;

    const sql = getSql();
    const [rawTxs, countResult] = await Promise.all([
      sql`
        SELECT pt.*,
          e."firstName", e."lastName", e."employeeCode",
          tc.code AS tc_code, tc.name AS tc_name, tc.type AS tc_type,
          pr."startDate" AS pr_start_date, pr."endDate" AS pr_end_date, pr.currency AS pr_currency
        FROM "PayrollTransaction" pt
        JOIN "PayrollRun" pr ON pr.id = pt."payrollRunId"
        JOIN "Employee" e ON e.id = pt."employeeId"
        JOIN "TransactionCode" tc ON tc.id = pt."transactionCodeId"
        WHERE pr."companyId" = ${companyId}
        ORDER BY pt."createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `,
      sql`
        SELECT COUNT(*) AS cnt
        FROM "PayrollTransaction" pt
        JOIN "PayrollRun" pr ON pr.id = pt."payrollRunId"
        WHERE pr."companyId" = ${companyId}
      `,
    ]);
    const transactions = (rawTxs as any[]).map(r => ({
      ...r,
      employee: { firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode },
      transactionCode: { code: r.tc_code, name: r.tc_name, type: r.tc_type },
      payrollRun: { startDate: r.pr_start_date, endDate: r.pr_end_date, currency: r.pr_currency },
    }));
    const total = parseInt((countResult as any[])[0]?.cnt ?? '0', 10);

    return c.json({ data: transactions, total, page, limit });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to fetch transactions' }, 500);
  }
});

router.get('/:id', requirePermission('view_payroll'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  try {
    const sql = getSql();
    const rows = await sql`
      SELECT pt.*,
        e."firstName", e."lastName", e."employeeCode",
        tc.code AS tc_code, tc.name AS tc_name, tc.type AS tc_type,
        pr."companyId" AS pr_company_id, pr."startDate" AS pr_start_date, pr."endDate" AS pr_end_date
      FROM "PayrollTransaction" pt
      JOIN "PayrollRun" pr ON pr.id = pt."payrollRunId"
      JOIN "Employee" e ON e.id = pt."employeeId"
      JOIN "TransactionCode" tc ON tc.id = pt."transactionCodeId"
      WHERE pt.id = ${id}
    `;
    if (!(rows as any[]).length) return c.json({ message: 'Transaction not found' }, 404);
    const r = (rows as any[])[0];
    if (!companyId || r.pr_company_id !== companyId) {
      return c.json({ message: 'Access denied' }, 403);
    }
    const transaction = {
      ...r,
      employee: { firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode },
      transactionCode: { code: r.tc_code, name: r.tc_name, type: r.tc_type },
      payrollRun: { companyId: r.pr_company_id, startDate: r.pr_start_date, endDate: r.pr_end_date },
    };
    return c.json(transaction);
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to fetch transaction' }, 500);
  }
});

router.post('/', requirePermission('manage_payroll'), validateBody(createTransactionSchema), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);

  const body = c.req.valid('json');

  try {
    const employee = await prisma.employee.findUnique({
      where: { id: body.employeeId },
      select: { companyId: true },
    });
    if (!employee || employee.companyId !== companyId) {
      return c.json({ message: 'Access denied' }, 403);
    }

    const created = await prisma.payrollTransaction.create({
      data: {
        employeeId: body.employeeId,
        transactionCodeId: body.transactionCodeId,
        payrollRunId: body.payrollRunId,
        amount: body.amount,
        currency: body.currency || 'USD',
        description: body.description,
      },
    });
    const sql = getSql();
    const rows = await sql`
      SELECT pt.*, e."firstName", e."lastName", e."employeeCode",
        tc.code AS tc_code, tc.name AS tc_name
      FROM "PayrollTransaction" pt
      JOIN "Employee" e ON e.id = pt."employeeId"
      JOIN "TransactionCode" tc ON tc.id = pt."transactionCodeId"
      WHERE pt.id = ${created.id}
    `;
    const r = (rows as any[])[0] ?? created;
    const transaction = {
      ...r,
      employee: { firstName: r.firstName, lastName: r.lastName, employeeCode: r.employeeCode },
      transactionCode: { code: r.tc_code, name: r.tc_name },
    };
    return c.json(transaction, 201);
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to create transaction' }, 500);
  }
});

router.put('/:id', requirePermission('manage_payroll'), async (c) => {
  const companyId = c.get('companyId');
  if (!companyId) return c.json({ message: 'Company context missing' }, 400);
  const { id } = c.req.param();
  const sql = getSql();
  const existingRows = await sql`
    SELECT pt.id, pr."companyId" AS pr_company_id
    FROM "PayrollTransaction" pt
    JOIN "PayrollRun" pr ON pr.id = pt."payrollRunId"
    WHERE pt.id = ${id}
  `;
  if (!(existingRows as any[]).length) return c.json({ message: 'Transaction not found' }, 404);
  const existing = (existingRows as any[])[0];
  if (existing.pr_company_id !== companyId) return c.json({ message: 'Access denied' }, 403);
  const { amount, description, currency } = await c.req.json();
  const updated = await prisma.payrollTransaction.update({
    where: { id },
    data: {
      amount: typeof amount === 'number' ? amount : undefined,
      description: typeof description === 'string' ? description : undefined,
      currency: typeof currency === 'string' ? currency : undefined,
    },
  });
  return c.json(updated);
});

router.delete('/:id', requirePermission('manage_payroll'), async (c) => {
  const { id } = c.req.param();
  const companyId = c.get('companyId');

  try {
    const sql = getSql();
    const existingRows = await sql`
      SELECT pt.id, pr."companyId" AS pr_company_id
      FROM "PayrollTransaction" pt
      JOIN "PayrollRun" pr ON pr.id = pt."payrollRunId"
      WHERE pt.id = ${id}
    `;
    if (!(existingRows as any[]).length) return c.json({ message: 'Transaction not found' }, 404);
    if ((existingRows as any[])[0].pr_company_id !== companyId) {
      return c.json({ message: 'Access denied' }, 403);
    }

    await prisma.payrollTransaction.delete({ where: { id } });
    return c.json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error(error);
    return c.json({ message: 'Failed to delete transaction' }, 500);
  }
});

export default router;
