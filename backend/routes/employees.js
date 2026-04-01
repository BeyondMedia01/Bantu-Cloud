const express = require('express');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { checkEmployeeCap } = require('../lib/license');
const { audit } = require('../lib/audit');
const { validate } = require('../lib/validate');

const importRouter = require('./employees/import');
const terminationRouter = require('./employees/termination');

const EMPLOYEE_CREATE_SCHEMA = {
  firstName:      { required: true, type: 'string', minLength: 1 },
  lastName:       { required: true, type: 'string', minLength: 1 },
  position:       { required: true, type: 'string', minLength: 1 },
  startDate:      { required: true, isDate: true },
  baseRate:       { required: true, type: 'number', min: 0 },
  employmentType: { enum: ['PERMANENT', 'CONTRACT', 'TEMPORARY', 'PART_TIME'] },
  currency:       { enum: ['USD', 'ZiG'] },
  paymentMethod:  { enum: ['BANK', 'CASH'] },
  paymentBasis:   { enum: ['MONTHLY', 'DAILY', 'HOURLY'] },
  taxMethod:      { enum: ['FDS_AVERAGE', 'FDS_FORECASTING', 'NON_FDS'] },
};

const router = express.Router();

// ─── Sub-routers ──────────────────────────────────────────────────────────────
router.use('/import', importRouter);
router.use('/:id/termination', terminationRouter);

const pickEmployeeFields = (body) => ({
  // Personal
  employeeCode:      body.employeeCode,
  title:             body.title,
  firstName:         body.firstName,
  lastName:          body.lastName,
  maidenName:        body.maidenName,
  nationality:       body.nationality,
  nationalId:        body.nationalId,
  passportNumber:    body.passportNumber,
  email:             body.email,
  phone:             body.phone,
  socialSecurityNum: body.socialSecurityNum,
  dateOfBirth:       body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
  gender:            body.gender || undefined,
  maritalStatus:     body.maritalStatus || undefined,
  homeAddress:       body.homeAddress,
  postalAddress:     body.postalAddress,
  nextOfKin:         body.nextOfKin,
  nextOfKinName:     body.nextOfKinName,
  nextOfKinContact:  body.nextOfKinContact,
  // Work
  occupation:        body.occupation,
  position:          body.position,
  employmentType:    body.employmentType || undefined,
  startDate:         body.startDate ? new Date(body.startDate) : undefined,
  branchId:          body.branchId || undefined,
  departmentId:      body.departmentId || undefined,
  costCenter:        body.costCenter,
  gradeId:           body.gradeId || undefined,
  leaveEntitlement:  body.leaveEntitlement !== undefined && body.leaveEntitlement !== '' ? parseFloat(body.leaveEntitlement) : undefined,
  dischargeDate:     body.dischargeDate ? new Date(body.dischargeDate) : undefined,
  dischargeReason:   body.dischargeReason,
  // Pay
  paymentMethod:     body.paymentMethod || undefined,
  paymentBasis:      body.paymentBasis || undefined,
  rateSource:        body.rateSource || undefined,
  baseRate:          body.baseRate !== undefined && body.baseRate !== '' ? parseFloat(body.baseRate) : undefined,
  currency:          body.currency,
  hoursPerPeriod:    body.hoursPerPeriod !== undefined && body.hoursPerPeriod !== '' ? parseFloat(body.hoursPerPeriod) : undefined,
  daysPerPeriod:     body.daysPerPeriod !== undefined && body.daysPerPeriod !== '' ? parseFloat(body.daysPerPeriod) : undefined,
  bankName:          body.bankName,
  bankBranch:        body.bankBranch,
  accountNumber:     body.accountNumber,
  // Tax
  taxMethod:         body.taxMethod || undefined,
  taxTable:          body.taxTable,
  taxDirective:      body.taxDirective,
  taxDirectivePerc:  body.taxDirectivePerc !== undefined && body.taxDirectivePerc !== '' ? parseFloat(body.taxDirectivePerc) : undefined,
  taxDirectiveAmt:   body.taxDirectiveAmt !== undefined && body.taxDirectiveAmt !== '' ? parseFloat(body.taxDirectiveAmt) : undefined,
  accumulativeSetting: body.accumulativeSetting,
  taxCredits:        body.taxCredits !== undefined && body.taxCredits !== '' ? parseFloat(body.taxCredits) : undefined,
  tin:               body.tin,
  motorVehicleBenefit: body.motorVehicleBenefit !== undefined && body.motorVehicleBenefit !== '' ? parseFloat(body.motorVehicleBenefit) : undefined,
  motorVehicleType:  body.motorVehicleType,
  vehicleEngineCategory: body.vehicleEngineCategory || undefined,
  grossingUp:        body.grossingUp !== undefined ? Boolean(body.grossingUp) : undefined,
  // Leave balances
  leaveTaken:        body.annualLeaveTaken !== undefined && body.annualLeaveTaken !== '' ? parseFloat(body.annualLeaveTaken) : undefined,
  // Split salary
  splitZigMode:      body.splitZigMode,
  splitZigValue:     body.splitZigValue !== undefined && body.splitZigValue !== '' ? parseFloat(body.splitZigValue) : undefined,
});

// GET /api/employees
router.get('/', async (req, res) => {
  // EMPLOYEE role can only see their own record
  if (req.user.role === 'EMPLOYEE') {
    if (!req.employeeId) return res.status(403).json({ message: 'Employee profile not found' });
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: req.employeeId },
        select: {
          id: true, employeeCode: true, title: true,
          firstName: true, lastName: true, maidenName: true,
          email: true, phone: true,
          nationality: true, nationalId: true,
          dateOfBirth: true, gender: true, maritalStatus: true,
          homeAddress: true, postalAddress: true,
          nextOfKin: true, nextOfKinName: true, nextOfKinContact: true,
          occupation: true, position: true, employmentType: true,
          startDate: true, dischargeDate: true, dischargeReason: true,
          costCenter: true,
          paymentMethod: true, paymentBasis: true, baseRate: true,
          currency: true, rateSource: true,
          hoursPerPeriod: true, daysPerPeriod: true,
          bankName: true, bankBranch: true, accountNumber: true,
          taxMethod: true, taxTable: true,
          vehicleEngineCategory: true,
          grossingUp: true,
          leaveBalance: true, leaveTaken: true, leaveEntitlement: true,
          splitUsdPercent: true, splitZigMode: true, splitZigValue: true,
          companyId: true, clientId: true, branchId: true, departmentId: true, gradeId: true,
          createdAt: true, updatedAt: true,
          branch: { select: { name: true } },
          department: { select: { name: true } },
        },
      });
      if (!employee) return res.status(404).json({ message: 'Employee not found' });
      return res.json({ data: [employee], total: 1, page: 1, limit: 1 });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Internal server error' });
    }
  }

  const { page = 1, limit = 20, search, branchId, departmentId, employmentType, companyId } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const scopedCompanyId = req.companyId || companyId;

  try {
    const where = {
      ...(req.clientId && { clientId: req.clientId }),
      ...(scopedCompanyId && { companyId: scopedCompanyId }),
      ...(branchId && { branchId }),
      ...(departmentId && { departmentId }),
      ...(employmentType && { employmentType }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
          { nationalId: { contains: search, mode: 'insensitive' } },
          { passportNumber: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [employees, total] = await Promise.all([
      prisma.employee.findMany({
        where,
        select: {
          id: true, employeeCode: true, title: true,
          firstName: true, lastName: true, maidenName: true,
          email: true, phone: true,
          nationality: true, nationalId: true,
          dateOfBirth: true, gender: true, maritalStatus: true,
          homeAddress: true, postalAddress: true,
          nextOfKin: true, nextOfKinName: true, nextOfKinContact: true,
          occupation: true, position: true, employmentType: true,
          startDate: true, dischargeDate: true, dischargeReason: true,
          costCenter: true,
          paymentMethod: true, paymentBasis: true, baseRate: true,
          currency: true, rateSource: true,
          hoursPerPeriod: true, daysPerPeriod: true,
          bankName: true, bankBranch: true, accountNumber: true,
          taxMethod: true, taxTable: true,
          vehicleEngineCategory: true,
          grossingUp: true,
          leaveBalance: true, leaveTaken: true, leaveEntitlement: true,
          splitUsdPercent: true, splitZigMode: true, splitZigValue: true,
          companyId: true, clientId: true, branchId: true, departmentId: true, gradeId: true,
          createdAt: true, updatedAt: true,
          branch: { select: { name: true } },
          department: { select: { name: true } },
          // Excluded: tin, idPassport, socialSecurityNum, bankAccountUSD, bankAccountZiG, bankRoutingUSD, bankRoutingZiG
        },
        skip,
        take: parseInt(limit),
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.employee.count({ where }),
    ]);

    res.json({ data: employees, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/employees
router.post('/', requirePermission('manage_employees'), async (req, res) => {
  const { companyId } = req.body;
  const scopedCompanyId = req.companyId || companyId;
  if (!scopedCompanyId) return res.status(400).json({ message: 'companyId is required' });

  const { ok, errors } = validate(req.body, EMPLOYEE_CREATE_SCHEMA);
  if (!ok) return res.status(400).json({ message: errors[0], errors });

  if (req.body.tin && !isValidTin(req.body.tin)) {
    return res.status(400).json({ message: 'TIN must be 10 digits (legacy) or 10–15 alphanumeric characters (new ZIMRA format)' });
  }

  if (req.body.nationality === 'Zimbabwean' && req.body.nationalId) {
    if (!/^\d{2}-?\d{6,7}\s?[A-Z]\s?\d{2}$/i.test(req.body.nationalId)) {
      return res.status(400).json({ message: 'Invalid Zimbabwe National ID format. Example: 63-123456A78' });
    }
  }

  if (req.body.bankAccounts && req.body.bankAccounts.length > 0) {
    for (const acc of req.body.bankAccounts) {
      if (!/^\d+$/.test(acc.accountNumber)) {
        return res.status(400).json({ message: 'Bank account number must contain only digits.' });
      }
    }
  }

  try {
    const company = await prisma.company.findUnique({ where: { id: scopedCompanyId } });
    if (!company) return res.status(404).json({ message: 'Company not found' });

    const capCheck = await checkEmployeeCap(company.clientId);
    if (!capCheck.withinCap) {
      return res.status(403).json({
        message: `Employee cap reached (${capCheck.count}/${capCheck.cap}). Upgrade your subscription.`,
      });
    }

    if (req.body.accountNumber) {
      const duplicate = await prisma.employee.findFirst({
        where: { companyId: scopedCompanyId, accountNumber: req.body.accountNumber },
        select: { id: true, firstName: true, lastName: true },
      });
      if (duplicate) {
        return res.status(409).json({
          message: `Account number already assigned to ${duplicate.firstName} ${duplicate.lastName}`,
        });
      }
    }

    if (req.body.employeeCode) {
      const duplicate = await prisma.employee.findFirst({
        where: {
          clientId: company.clientId,
          employeeCode: { equals: req.body.employeeCode, mode: 'insensitive' },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (duplicate) {
        return res.status(409).json({
          message: `Employee code '${req.body.employeeCode}' is already in use by ${duplicate.firstName} ${duplicate.lastName}`,
        });
      }
    }

    const data = pickEmployeeFields(req.body);
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    const { bankAccounts } = req.body;

    const employee = await prisma.employee.create({
      data: {
        ...data,
        companyId: scopedCompanyId,
        clientId: company.clientId,
        startDate: new Date(req.body.startDate),
        baseRate: parseFloat(req.body.baseRate),
        bankAccounts: bankAccounts?.length > 0 ? {
          create: bankAccounts.map((acc) => ({
            accountName: acc.accountName,
            accountNumber: acc.accountNumber,
            bankName: acc.bankName,
            bankBranch: acc.bankBranch,
            branchCode: acc.branchCode,
            splitType: acc.splitType || 'REMAINDER',
            splitValue: parseFloat(acc.splitValue || 0),
            priority: parseInt(acc.priority || 0),
            currency: acc.currency || 'USD',
          })),
        } : undefined,
      },
      include: { bankAccounts: true },
    });

    await audit({
      req,
      action: 'EMPLOYEE_CREATED',
      resource: 'employee',
      resourceId: employee.id,
      details: { name: `${employee.firstName} ${employee.lastName}`, position: employee.position },
    });

    res.status(201).json(employee);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ─── TIN validation helper ────────────────────────────────────────────────────
// ZIMRA TIN: 10-digit numeric (legacy) or 10–15 alphanumeric (new format)
function isValidTin(tin) {
  if (!tin) return true; // TIN is optional
  const stripped = String(tin).trim();
  return /^\d{10}$/.test(stripped) || /^[A-Z0-9]{10,15}$/i.test(stripped);
}

// GET /api/employees/:id/audit-logs — fetch history for this employee
router.get('/:id/audit-logs', requirePermission('view_employees'), async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      select: { companyId: true }
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { resource: 'employee', resourceId: req.params.id },
          // Also include logs where this employee is mentioned in details (optional but thorough)
          { details: { path: ['employeeId'], equals: req.params.id } },
          { details: { path: ['id'], equals: req.params.id } },
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json({ data: logs });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/employees/:id
router.get('/:id', async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: {
        company: { select: { name: true } },
        branch: { select: { name: true } },
        department: { select: { name: true } },
        grade: { select: { name: true } },
        bankAccounts: { orderBy: { priority: 'asc' } },
      },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    res.json({ data: employee });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// PUT /api/employees/:id
router.put('/:id', requirePermission('manage_employees'), async (req, res) => {
  // Partial update — only validate fields that are present
  const partialSchema = {};
  for (const [k, v] of Object.entries(EMPLOYEE_CREATE_SCHEMA)) {
    if (req.body[k] !== undefined) partialSchema[k] = { ...v, required: false };
  }
  const { ok, errors } = validate(req.body, partialSchema);
  if (!ok) return res.status(400).json({ message: errors[0], errors });

  if (req.body.tin && !isValidTin(req.body.tin)) {
    return res.status(400).json({ message: 'TIN must be 10 digits (legacy) or 10–15 alphanumeric characters (new ZIMRA format)' });
  }

  if (req.body.nationality === 'Zimbabwean' && req.body.nationalId) {
    if (!/^\d{2}-?\d{6,7}\s?[A-Z]\s?\d{2}$/i.test(req.body.nationalId)) {
      return res.status(400).json({ message: 'Invalid Zimbabwe National ID format. Example: 63-123456A78' });
    }
  }

  if (req.body.bankAccounts && req.body.bankAccounts.length > 0) {
    for (const acc of req.body.bankAccounts) {
      if (!/^\d+$/.test(acc.accountNumber)) {
        return res.status(400).json({ message: 'Bank account number must contain only digits.' });
      }
    }
  }

  try {
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && existing.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (req.body.accountNumber) {
      const duplicate = await prisma.employee.findFirst({
        where: {
          companyId: existing.companyId,
          accountNumber: req.body.accountNumber,
          id: { not: req.params.id },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (duplicate) {
        return res.status(409).json({
          message: `Account number already assigned to ${duplicate.firstName} ${duplicate.lastName}`,
        });
      }
    }

    if (req.body.employeeCode && req.body.employeeCode !== existing.employeeCode) {
      const duplicate = await prisma.employee.findFirst({
        where: {
          clientId: existing.clientId,
          employeeCode: { equals: req.body.employeeCode, mode: 'insensitive' },
          id: { not: req.params.id },
        },
        select: { id: true, firstName: true, lastName: true },
      });
      if (duplicate) {
        return res.status(409).json({
          message: `Employee code '${req.body.employeeCode}' is already in use by ${duplicate.firstName} ${duplicate.lastName}`,
        });
      }
    }

    const data = pickEmployeeFields(req.body);
    Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

    const { bankAccounts } = req.body;

    const employee = await prisma.$transaction(async (tx) => {
      if (bankAccounts) {
        await tx.employeeBankAccount.deleteMany({ where: { employeeId: req.params.id } });
        await tx.employee.update({
          where: { id: req.params.id },
          data: {
            bankAccounts: {
              create: bankAccounts.map((acc) => ({
                accountName: acc.accountName,
                accountNumber: acc.accountNumber,
                bankName: acc.bankName,
                bankBranch: acc.bankBranch,
                branchCode: acc.branchCode,
                splitType: acc.splitType || 'REMAINDER',
                splitValue: parseFloat(acc.splitValue || 0),
                priority: parseInt(acc.priority || 0),
                currency: acc.currency || 'USD',
              })),
            },
          },
        });
      }
      return tx.employee.update({
        where: { id: req.params.id },
        data,
        include: { bankAccounts: true },
      });
    });

    const auditDetails = { fields: Object.keys(data) };
    if (data.baseRate !== undefined && data.baseRate !== existing.baseRate) {
      auditDetails.salaryChange = {
        from: existing.baseRate,
        to: data.baseRate,
        currency: data.currency || existing.currency,
      };
    }

    await audit({
      req,
      action: 'EMPLOYEE_UPDATED',
      resource: 'employee',
      resourceId: employee.id,
      details: auditDetails,
    });

    res.json({ data: employee });
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Employee not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', requirePermission('manage_employees'), async (req, res) => {
  try {
    const existing = await prisma.employee.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && existing.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }
    await prisma.employee.delete({ where: { id: req.params.id } });

    await audit({
      req,
      action: 'EMPLOYEE_DELETED',
      resource: 'employee',
      resourceId: req.params.id,
      details: { name: `${existing.firstName} ${existing.lastName}` },
    });

    res.status(204).send();
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Employee not found' });
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
