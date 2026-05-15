import { Hono } from 'hono';
import { z } from 'zod';
import { validateBody } from '../lib/validate';
import { prisma, cache, getSql } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { checkEmployeeCap } from '../lib/license';
import { audit } from '../lib/audit';
import { denyUnlessCompany } from '../lib/ownership';
import employeeTerminationRoutes from './employeeTermination';
import employeeImportRoutes from './employeeImport';

const router = new Hono();

const EMPLOYEE_SELECT = {
  id: true, employeeCode: true, title: true,
  firstName: true, lastName: true, maidenName: true,
  email: true, phone: true,
  nationality: true, nationalId: true, passportNumber: true, socialSecurityNum: true, pensionNumber: true,
  dateOfBirth: true, gender: true, maritalStatus: true,
  homeAddress: true, postalAddress: true,
  nextOfKin: true, nextOfKinName: true, nextOfKinContact: true,
  occupation: true, position: true, employmentType: true,
  startDate: true, dischargeDate: true, dischargeReason: true,
  costCenter: true, leaveEntitlement: true,
  paymentMethod: true, paymentBasis: true, baseRate: true,
  currency: true, rateSource: true,
  hoursPerPeriod: true, daysPerPeriod: true,
  bankName: true, bankBranch: true, accountNumber: true,
  taxMethod: true, taxTable: true, tin: true,
  taxDirective: true, taxDirectivePerc: true, taxDirectiveAmt: true,
  taxDirectiveRef: true, taxDirectiveEffective: true, taxDirectiveExpiry: true,
  accumulativeSetting: true, taxCredits: true,
  motorVehicleBenefit: true, motorVehicleType: true, vehicleEngineCategory: true,
  grossingUp: true,
  splitUsdPercent: true, splitZigMode: true, splitZigValue: true,
  necGradeId: true,
  leaveBalance: true, leaveTaken: true,
  companyId: true, clientId: true, branchId: true, departmentId: true, gradeId: true,
  createdAt: true, updatedAt: true,
  branch: { select: { name: true } },
  department: { select: { name: true } },
  grade: { select: { name: true, minRate: true, maxRate: true } },
} as const;

router.get('/', async (c) => {
  try {
    const user = c.get('user');
    const employeeId = c.get('employeeId');

    if (user.role === 'EMPLOYEE') {
      if (!employeeId) return c.json({ message: 'Employee profile not found' }, 403);
      const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: EMPLOYEE_SELECT });
      if (!employee) return c.json({ message: 'Employee not found' }, 404);
      return c.json({ data: [employee], total: 1, page: 1, limit: 1 });
    }

    const ctxCompanyId = c.get('companyId');
    const clientId = c.get('clientId');
    if (!clientId && !ctxCompanyId) return c.json({ data: [], total: 0, page: 1, limit: 20 });

    const page = Math.max(1, parseInt(c.req.query('page') || '1') || 1);
    const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '20') || 20));
    const search = c.req.query('search');
    const branchId = c.req.query('branchId');
    const departmentId = c.req.query('departmentId');
    const employmentType = c.req.query('employmentType');
    const queryCompanyId = c.req.query('companyId');
    const companyId = ctxCompanyId || (ctxCompanyId === null ? queryCompanyId : null);

    const where: Record<string, unknown> = {};
    if (clientId) where.clientId = clientId;
    if (companyId) where.companyId = companyId;
    if (branchId) where.branchId = branchId;
    if (departmentId) where.departmentId = departmentId;
    if (employmentType) where.employmentType = employmentType;
    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { position: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;
    const [employees, total] = await Promise.all([
      prisma.employee.findMany({ where, select: EMPLOYEE_SELECT, skip, take: limit, orderBy: { firstName: 'asc' } ,
    }),
      prisma.employee.count({ where ,
    }),
    ]);

    return c.json({ data: employees, total, page, limit });
  } catch (err: any) {
    console.error('[employees GET /]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const createEmployeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  position: z.string().min(1),
  startDate: z.string().min(1),
  baseRate: z.number().min(0),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'TEMPORARY', 'PART_TIME']).optional(),
  currency: z.enum(['USD', 'ZiG']).optional(),
  paymentMethod: z.enum(['BANK', 'CASH']).optional(),
  paymentBasis: z.enum(['MONTHLY', 'DAILY', 'HOURLY']).optional(),
  taxMethod: z.enum(['FDS_AVERAGE', 'FDS_FORECASTING', 'NON_FDS']).optional(),
  companyId: z.string().optional(),
  branchId: z.string().optional(),
  departmentId: z.string().optional(),
  employeeCode: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional(),
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED']).optional(),
  dateOfBirth: z.string().optional(),
  nationalId: z.string().optional(),
  tin: z.string().optional(),
  bankName: z.string().optional(),
  bankBranch: z.string().optional(),
  accountNumber: z.string().optional(),
  gradeId: z.string().optional(),
  title: z.string().optional(),
  costCenter: z.string().optional(),
});

router.post('/', requirePermission('manage_employees'), validateBody(createEmployeeSchema), async (c) => {
  const body = c.req.valid('json');
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  const capCheck = await checkEmployeeCap(clientId);
  if (!capCheck.withinCap) {
    return c.json({ message: `Employee cap reached (${capCheck.cap}). Upgrade your plan to add more employees.` }, 403);
  }

  try {
    const employee = await prisma.employee.create({
      data: {
        ...body,
        clientId,
        companyId: body.companyId || c.get('companyId') || '',
        startDate: new Date(body.startDate),
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
        baseRate: body.baseRate,
      },
      select: EMPLOYEE_SELECT,
    });

    await audit({ c, action: 'EMPLOYEE_CREATED', resource: 'employee', resourceId: employee.id, details: { name: `${employee.firstName} ${employee.lastName}` } });
    return c.json(employee, 201);
  } catch (err: any) {
    if (err.code === 'P2002') return c.json({ message: 'Employee code already exists for this client' }, 409);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/:id', async (c) => {
  try {
    const employeeId2 = c.get('employeeId');
    if (employeeId2 && employeeId2 !== c.req.param('id')) {
      return c.json({ message: 'Access denied' }, 403);
    }
  const employee = await prisma.employee.findUnique({
    where: { id: c.req.param('id') },
    select: { ...EMPLOYEE_SELECT, salaryStructure: { select: { id: true, transactionCodeId: true, value: true, currency: true, effectiveFrom: true, effectiveTo: true, isRecurring: true, notes: true, transactionCode: { select: { id: true, name: true, code: true, type: true } } }, orderBy: { effectiveFrom: 'desc' } } },
  });
    if (!employee) return c.json({ message: 'Employee not found' }, 404);
    const companyId = c.get('companyId');
    const clientId = c.get('clientId');
    if (companyId && employee.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    if (!companyId && !clientId) return c.json({ message: 'Access denied' }, 403);
    return c.json({ data: employee });
  } catch (err: any) {
    console.error('[employee GET /:id]', err?.message ?? err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

const VALID_FIELDS = new Set([
  'employeeCode', 'title', 'firstName', 'lastName', 'maidenName', 'email', 'phone',
  'nationality', 'nationalId', 'passportNumber', 'socialSecurityNum', 'pensionNumber',
  'dateOfBirth', 'gender', 'maritalStatus',
  'homeAddress', 'postalAddress',
  'nextOfKin', 'nextOfKinName', 'nextOfKinContact',
  'occupation', 'position', 'employmentType',
  'startDate', 'dischargeDate', 'dischargeReason',
  'costCenter', 'leaveEntitlement',
  'paymentMethod', 'paymentBasis', 'baseRate',
  'currency', 'rateSource',
  'hoursPerPeriod', 'daysPerPeriod',
  'bankName', 'bankBranch', 'accountNumber',
  'taxMethod', 'taxTable', 'tin',
  'taxDirective', 'taxDirectivePerc', 'taxDirectiveAmt',
  'taxDirectiveRef', 'taxDirectiveEffective', 'taxDirectiveExpiry',
  'accumulativeSetting', 'taxCredits',
  'motorVehicleBenefit', 'motorVehicleType', 'vehicleEngineCategory',
  'grossingUp',
  'splitUsdPercent', 'splitZigMode', 'splitZigValue',
  'necGradeId',
  'branchId', 'departmentId', 'gradeId',
]);

router.put('/:id', requirePermission('manage_employees'), async (c) => {
  try {
    const existing = await prisma.employee.findUnique({ where: { id: c.req.param('id') }, select: { companyId: true } });
    if (!existing) return c.json({ message: 'Employee not found' }, 404);
    const companyId = c.get('companyId');
    const clientId = c.get('clientId');
    if (companyId && existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    if (!companyId && !clientId) return c.json({ message: 'Access denied' }, 403);

    const body = await c.req.json();
    const data: Record<string, unknown> = {};
    const NUMERIC_FIELDS = new Set(['baseRate','hoursPerPeriod','daysPerPeriod','leaveEntitlement','taxCredits','motorVehicleBenefit','taxDirectivePerc','taxDirectiveAmt','splitUsdPercent','splitZigValue']);
    const DATE_FIELDS = new Set(['startDate','dateOfBirth','dischargeDate','taxDirectiveEffective','taxDirectiveExpiry']);
    const FK_FIELDS = new Set(['branchId','departmentId','gradeId','necGradeId']);
    for (const key of Object.keys(body)) {
      if (!VALID_FIELDS.has(key)) continue;
      const val = body[key];
      if (DATE_FIELDS.has(key)) {
        data[key] = val ? new Date(val as string) : null;
      } else if (NUMERIC_FIELDS.has(key)) {
        data[key] = val !== '' && val !== null && val !== undefined ? Number(val) : null;
      } else if (FK_FIELDS.has(key)) {
        data[key] = val || null;
      } else {
        if (val !== undefined) data[key] = val;
      }
    }

    await prisma.employee.update({ where: { id: c.req.param('id') }, data });
    const employee = await prisma.employee.findUnique({ where: { id: c.req.param('id') }, select: EMPLOYEE_SELECT });
    return c.json(employee);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Employee not found' }, 404);
    if (err.code === 'P2002') return c.json({ message: 'Employee code already exists' }, 409);
    console.error('[employee PUT]', err?.message ?? err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/:id', requirePermission('manage_employees'), async (c) => {
  try {
    const existing = await prisma.employee.findUnique({ where: { id: c.req.param('id') }, select: { companyId: true } });
    if (!existing) return c.json({ message: 'Employee not found' }, 404);
    const companyId = c.get('companyId');
    const clientId = c.get('clientId');
    if (companyId && existing.companyId !== companyId) return c.json({ message: 'Access denied' }, 403);
    if (!companyId && !clientId) return c.json({ message: 'Access denied' }, 403);
    await prisma.employee.delete({ where: { id: c.req.param('id') } });
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Employee not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/:id/audit-logs', async (c) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: { resource: 'employee', resourceId: c.req.param('id') },
      orderBy: { createdAt: 'desc' },
    });
    return c.json(logs);
  } catch (err: any) {
    console.error('[employees GET /:id/audit-logs]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

async function checkEmployeeAccess(c: any, employeeId: string): Promise<boolean> {
  const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { companyId: true } });
  if (!emp) return false;
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  if (companyId && emp.companyId !== companyId) return false;
  if (!companyId && !clientId) return false;
  return true;
}

router.get('/:id/salary-structure', async (c) => {
  try {
    const employeeId = c.req.param('id');
    if (!(await checkEmployeeAccess(c, employeeId))) return c.json({ message: 'Access denied' }, 403);
    const active = c.req.query('active');
    const sql = getSql();
    const rows = active === 'true'
      ? await sql`
          SELECT et.*, tc.id AS tc_id, tc.code AS tc_code, tc.name AS tc_name, tc.type AS tc_type,
            tc."calculationType" AS tc_calc_type, tc."incomeCategory" AS tc_income_cat,
            tc."preTax" AS tc_pre_tax, tc."taxable" AS tc_taxable, tc."active" AS tc_active
          FROM "EmployeeTransaction" et
          JOIN "TransactionCode" tc ON tc.id = et."transactionCodeId"
          WHERE et."employeeId" = ${employeeId} AND et."effectiveTo" IS NULL
          ORDER BY et."effectiveFrom" DESC
        `
      : await sql`
          SELECT et.*, tc.id AS tc_id, tc.code AS tc_code, tc.name AS tc_name, tc.type AS tc_type,
            tc."calculationType" AS tc_calc_type, tc."incomeCategory" AS tc_income_cat,
            tc."preTax" AS tc_pre_tax, tc."taxable" AS tc_taxable, tc."active" AS tc_active
          FROM "EmployeeTransaction" et
          JOIN "TransactionCode" tc ON tc.id = et."transactionCodeId"
          WHERE et."employeeId" = ${employeeId}
          ORDER BY et."effectiveFrom" DESC
        `;
    const items = (rows as any[]).map(r => ({
      id: r.id, employeeId: r.employeeId, transactionCodeId: r.transactionCodeId,
      value: r.value, currency: r.currency, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
      isRecurring: r.isRecurring, notes: r.notes, createdAt: r.createdAt, updatedAt: r.updatedAt,
      transactionCode: {
        id: r.tc_id, code: r.tc_code, name: r.tc_name, type: r.tc_type,
        calculationType: r.tc_calc_type, incomeCategory: r.tc_income_cat,
        preTax: r.tc_pre_tax, taxable: r.tc_taxable, active: r.tc_active,
      },
    }));
    return c.json(items);
  } catch (err: any) {
    console.error('[employees GET /:id/salary-structure]', err?.message);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/:id/salary-structure', requirePermission('manage_employees'), async (c) => {
  try {
    const employeeId = c.req.param('id');
    if (!employeeId) return c.json({ message: 'Employee ID required' }, 400);
    if (!(await checkEmployeeAccess(c, employeeId))) return c.json({ message: 'Access denied' }, 403);
    const body = await c.req.json();
    const item = await prisma.employeeTransaction.create({
      data: {
        employeeId,
        transactionCodeId: body.transactionCodeId,
        value: parseFloat(body.value),
        currency: body.currency || 'USD',
        effectiveFrom: new Date(body.effectiveFrom),
        isRecurring: body.isRecurring !== false,
        notes: body.notes,
      },
      include: { transactionCode: true },
    });
    return c.json(item, 201);
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.put('/:empId/salary-structure/:id', requirePermission('manage_employees'), async (c) => {
  try {
    const empId = c.req.param('empId');
    if (!empId || !(await checkEmployeeAccess(c, empId))) return c.json({ message: 'Access denied' }, 403);
    const existing = await prisma.employeeTransaction.findUnique({
      where: { id: c.req.param('id') },
      select: { employeeId: true },
    });
    if (!existing || existing.employeeId !== empId) return c.json({ message: 'Entry not found' }, 404);
    const body = await c.req.json();
    await prisma.employeeTransaction.update({ where: { id: c.req.param('id') }, data: body });
    const item = await prisma.employeeTransaction.findUnique({ where: { id: c.req.param('id') }, include: { transactionCode: true } });
    return c.json(item);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Salary structure entry not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.delete('/:empId/salary-structure/:id', requirePermission('manage_employees'), async (c) => {
  try {
    const empId = c.req.param('empId');
    if (!empId || !(await checkEmployeeAccess(c, empId))) return c.json({ message: 'Access denied' }, 403);
    const existing = await prisma.employeeTransaction.findUnique({
      where: { id: c.req.param('id') },
      select: { employeeId: true },
    });
    if (!existing || existing.employeeId !== empId) return c.json({ message: 'Entry not found' }, 404);
    const endDate = c.req.query('endDate');
    if (endDate === 'true') {
      await prisma.employeeTransaction.update({
        where: { id: c.req.param('id') },
        data: { effectiveTo: new Date() },
      });
    } else {
      await prisma.employeeTransaction.delete({ where: { id: c.req.param('id') } });
    }
    return c.body(null, 204);
  } catch (err: any) {
    if (err.code === 'P2025') return c.json({ message: 'Entry not found' }, 404);
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.route('/import', employeeImportRoutes);
router.route('/:id/termination', employeeTerminationRoutes);

export default router;
