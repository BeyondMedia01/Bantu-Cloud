const express = require('express');
const multer = require('multer');
const { parse: parseCSV } = require('csv-parse/sync');
const XLSX = require('xlsx');
const prisma = require('../lib/prisma');
const { requirePermission } = require('../lib/permissions');
const { checkEmployeeCap } = require('../lib/license');
const { audit } = require('../lib/audit');
const { getSettingAsNumber } = require('../lib/systemSettings');
const { validate } = require('../lib/validate');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Column definitions for import template
const IMPORT_COLUMNS = [
  { header: 'Employee Code *',            key: 'employeeCode' },
  { header: 'Title',                      key: 'title',             hint: 'Mr/Mrs/Miss/Ms/Dr/Prof/Rev' },
  { header: 'First Name *',               key: 'firstName' },
  { header: 'Last Name *',                key: 'lastName' },
  { header: 'Maiden Name',                key: 'maidenName' },
  { header: 'Nationality *',              key: 'nationality' },
  { header: 'National ID *',              key: 'nationalId',        hint: 'e.g. 63-123456A78' },
  { header: 'Passport Number',            key: 'passportNumber' },
  { header: 'Email',                      key: 'email' },
  { header: 'Phone',                      key: 'phone' },
  { header: 'Date of Birth *',            key: 'dateOfBirth',       hint: 'YYYY-MM-DD' },
  { header: 'Gender *',                   key: 'gender',            hint: 'MALE/FEMALE/OTHER' },
  { header: 'Marital Status *',           key: 'maritalStatus',     hint: 'SINGLE/MARRIED/DIVORCED/WIDOWED' },
  { header: 'Home Address',               key: 'homeAddress' },
  { header: 'Postal Address',             key: 'postalAddress' },
  { header: 'Next of Kin Name',           key: 'nextOfKinName' },
  { header: 'Next of Kin Contact',        key: 'nextOfKinContact' },
  { header: 'Social Security Number',     key: 'socialSecurityNum' },
  { header: 'Start Date *',               key: 'startDate',         hint: 'YYYY-MM-DD' },
  { header: 'Occupation',                 key: 'occupation' },
  { header: 'Position/Job Title *',       key: 'position' },
  { header: 'Department Name',            key: '_departmentName',   hint: 'Must match existing department' },
  { header: 'Branch Name',                key: '_branchName',       hint: 'Must match existing branch' },
  { header: 'Cost Center',               key: 'costCenter' },
  { header: 'Employment Type *',          key: 'employmentType',    hint: 'PERMANENT/CONTRACT/TEMPORARY/PART_TIME' },
  { header: 'Leave Entitlement (days)',   key: 'leaveEntitlement' },
  { header: 'Payment Method *',           key: 'paymentMethod',     hint: 'BANK/CASH' },
  { header: 'Payment Basis *',            key: 'paymentBasis',      hint: 'MONTHLY/DAILY/HOURLY' },
  { header: 'Rate Source',               key: 'rateSource',         hint: 'MANUAL/NEC_GRADE' },
  { header: 'Base Rate *',                key: 'baseRate' },
  { header: 'Currency *',                 key: 'currency',          hint: 'USD/ZiG' },
  { header: 'Hours Per Period',           key: 'hoursPerPeriod' },
  { header: 'Days Per Period',            key: 'daysPerPeriod' },
  { header: 'Bank Name',                  key: 'bankName' },
  { header: 'Bank Branch',               key: 'bankBranch' },
  { header: 'Account Number',            key: 'accountNumber' },
  { header: 'Tax Method *',               key: 'taxMethod',         hint: 'NON_FDS/FDS_AVERAGE/FDS_FORECASTING' },
  { header: 'Tax Table *',                key: 'taxTable',          hint: 'e.g. USD 2024' },
  { header: 'Accumulative Setting',       key: 'accumulativeSetting', hint: 'YES/NO' },
  { header: 'Tax Credits',               key: 'taxCredits' },
  { header: 'TIN',                        key: 'tin' },
  { header: 'Motor Vehicle Benefit',      key: 'motorVehicleBenefit', hint: 'Monthly amount (ZIMRA annual deemed value ÷ 12, e.g. Class A $15 000/yr → enter 1250)' },
  { header: 'Motor Vehicle Type',         key: 'motorVehicleType' },
  { header: 'Tax Directive %',            key: 'taxDirectivePerc' },
  { header: 'Tax Directive Amount',       key: 'taxDirectiveAmt' },
  { header: 'Annual Leave Accrued',       key: 'annualLeaveAccrued' },
  { header: 'Annual Leave Taken',         key: 'annualLeaveTaken' },
];

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
  // Leave balances
  leaveBalance:      body.annualLeaveAccrued !== undefined && body.annualLeaveAccrued !== '' ? parseFloat(body.annualLeaveAccrued) : undefined,
  leaveTaken:        body.annualLeaveTaken !== undefined && body.annualLeaveTaken !== '' ? parseFloat(body.annualLeaveTaken) : undefined,
});

// GET /api/employees
router.get('/', async (req, res) => {
  // EMPLOYEE role can only see their own record
  if (req.user.role === 'EMPLOYEE') {
    if (!req.employeeId) return res.status(403).json({ message: 'Employee profile not found' });
    try {
      const employee = await prisma.employee.findUnique({
        where: { id: req.employeeId },
        include: {
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
        include: {
          branch: { select: { name: true } },
          department: { select: { name: true } },
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

// GET /api/employees/import/template — download CSV or Excel template
router.get('/import/template', (req, res) => {
  const format = (req.query.format || 'csv').toLowerCase();
  const headers = IMPORT_COLUMNS.map((c) => c.header);
  const sample = [
    'EMP001', 'Mr', 'John', 'Doe', '', 'Zimbabwean', '63-123456A78', '', 'john@demo.com', '0771234567',
    '1985-03-15', 'MALE', 'MARRIED', '1 Main St Harare', '',
    'Jane Doe', '0771234567', '3001234567', '2024-01-01',
    'Software Engineer', 'Developer', 'Engineering', 'Main Branch',
    'CC001', 'PERMANENT', '30', 'BANK', 'MONTHLY', 'MANUAL',
    '1500.00', 'USD', '176', '22', 'CBZ Bank', 'Harare Main', '1234567890',
    'NON_FDS', 'USD 2024', 'NO', '0', '', '0', '', '0', '0', '0', '0',
  ];

  if (format === 'xlsx') {
    const wb = XLSX.utils.book_new();
    // Data sheet
    const ws = XLSX.utils.aoa_to_sheet([headers, sample]);
    ws['!cols'] = headers.map(() => ({ wch: 22 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    // Hints sheet
    const hintsData = [['Column', 'Required', 'Allowed Values / Format']];
    IMPORT_COLUMNS.forEach((c) => {
      hintsData.push([c.header, c.header.endsWith('*') ? 'Yes' : 'No', c.hint || '']);
    });
    const wsHints = XLSX.utils.aoa_to_sheet(hintsData);
    wsHints['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 45 }];
    XLSX.utils.book_append_sheet(wb, wsHints, 'Field Guide');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.xlsx"');
    return res.send(buf);
  }

  // Default: CSV
  const escape = (v) => (String(v).includes(',') ? `"${v}"` : v);
  const csv = [headers.map(escape).join(','), sample.map(escape).join(',')].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.csv"');
  return res.send(csv);
});

// POST /api/employees/import — bulk create from CSV or Excel
router.post('/import', requirePermission('manage_employees'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const scopedCompanyId = req.companyId;
  if (!scopedCompanyId) return res.status(400).json({ message: 'Company context required' });

  const company = await prisma.company.findUnique({ where: { id: scopedCompanyId } });
  if (!company) return res.status(404).json({ message: 'Company not found' });

  // Parse file into array of objects
  let rows = [];
  const ext = req.file.originalname.toLowerCase().split('.').pop();
  try {
    if (ext === 'csv') {
      rows = parseCSV(req.file.buffer.toString('utf8'), {
        columns: true, skip_empty_lines: true, trim: true,
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    } else {
      return res.status(400).json({ message: 'Unsupported file. Upload a .csv or .xlsx file.' });
    }
  } catch (err) {
    return res.status(400).json({ message: 'Failed to parse file: ' + err.message });
  }

  if (!rows.length) return res.status(400).json({ message: 'No data rows found in file.' });

  // Resolve branch/department names → IDs for this company
  const [allBranches, allDepts] = await Promise.all([
    prisma.branch.findMany({ where: { companyId: scopedCompanyId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId: scopedCompanyId }, select: { id: true, name: true } }),
  ]);
  const branchMap = Object.fromEntries(allBranches.map((b) => [b.name.toLowerCase().trim(), b.id]));
  const deptMap   = Object.fromEntries(allDepts.map((d) => [d.name.toLowerCase().trim(), d.id]));

  // Helper: get cell value by column header (strip trailing * and spaces)
  const get = (row, header) => {
    const normalise = (s) => s.replace(/\s*\*$/, '').trim().toLowerCase();
    const needle = normalise(header);
    const key = Object.keys(row).find((k) => normalise(k) === needle);
    return key ? String(row[key] ?? '').trim() : '';
  };

  const results = { created: 0, failed: [] };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // row 1 = headers

    try {
      const body = {
        employeeCode:       get(row, 'Employee Code'),
        title:              get(row, 'Title'),
        firstName:          get(row, 'First Name'),
        lastName:           get(row, 'Last Name'),
        maidenName:         get(row, 'Maiden Name'),
        nationality:        get(row, 'Nationality'),
        nationalId:         get(row, 'National ID'),
        passportNumber:     get(row, 'Passport Number'),
        email:              get(row, 'Email'),
        phone:              get(row, 'Phone'),
        dateOfBirth:        get(row, 'Date of Birth'),
        gender:             get(row, 'Gender'),
        maritalStatus:      get(row, 'Marital Status'),
        homeAddress:        get(row, 'Home Address'),
        postalAddress:      get(row, 'Postal Address'),
        nextOfKinName:      get(row, 'Next of Kin Name'),
        nextOfKinContact:   get(row, 'Next of Kin Contact'),
        socialSecurityNum:  get(row, 'Social Security Number'),
        startDate:          get(row, 'Start Date'),
        occupation:         get(row, 'Occupation'),
        position:           get(row, 'Position/Job Title'),
        costCenter:         get(row, 'Cost Center'),
        employmentType:     get(row, 'Employment Type') || 'PERMANENT',
        leaveEntitlement:   get(row, 'Leave Entitlement (days)'),
        paymentMethod:      get(row, 'Payment Method') || 'BANK',
        paymentBasis:       get(row, 'Payment Basis') || 'MONTHLY',
        rateSource:         get(row, 'Rate Source') || 'MANUAL',
        baseRate:           get(row, 'Base Rate'),
        currency:           get(row, 'Currency') || 'USD',
        hoursPerPeriod:     get(row, 'Hours Per Period'),
        daysPerPeriod:      get(row, 'Days Per Period'),
        bankName:           get(row, 'Bank Name'),
        bankBranch:         get(row, 'Bank Branch'),
        accountNumber:      get(row, 'Account Number'),
        taxMethod:          get(row, 'Tax Method') || 'NON_FDS',
        taxTable:           get(row, 'Tax Table'),
        accumulativeSetting: get(row, 'Accumulative Setting') || 'NO',
        taxCredits:         get(row, 'Tax Credits'),
        tin:                get(row, 'TIN'),
        motorVehicleBenefit: get(row, 'Motor Vehicle Benefit'),
        motorVehicleType:   get(row, 'Motor Vehicle Type'),
        taxDirectivePerc:   get(row, 'Tax Directive %'),
        taxDirectiveAmt:    get(row, 'Tax Directive Amount'),
        annualLeaveAccrued: get(row, 'Annual Leave Accrued'),
        annualLeaveTaken:   get(row, 'Annual Leave Taken'),
      };

      if (!body.firstName)  throw new Error('First Name is required');
      if (!body.lastName)   throw new Error('Last Name is required');
      if (!body.position)   throw new Error('Position/Job Title is required');
      if (!body.startDate)  throw new Error('Start Date is required');
      if (!body.baseRate)   throw new Error('Base Rate is required');
      if (body.tin && !isValidTin(body.tin)) throw new Error('Invalid TIN format (must be 10-digit or 10–15 alphanumeric)');

      // Resolve branch/department names
      const branchName = get(row, 'Branch Name');
      const deptName   = get(row, 'Department Name');
      if (branchName) body.branchId = branchMap[branchName.toLowerCase()] || undefined;
      if (deptName)   body.departmentId = deptMap[deptName.toLowerCase()] || undefined;

      const data = pickEmployeeFields(body);
      Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

      await prisma.employee.create({
        data: {
          ...data,
          companyId: scopedCompanyId,
          clientId:  company.clientId,
          startDate: new Date(body.startDate),
          baseRate:  parseFloat(body.baseRate),
        },
      });

      results.created++;
    } catch (err) {
      const name = `${get(row, 'First Name')} ${get(row, 'Last Name')}`.trim() || `Row ${rowNum}`;
      results.failed.push({ row: rowNum, name, reason: err.message });
    }
  }

  res.json({
    message: `Import complete: ${results.created} created, ${results.failed.length} failed.`,
    created: results.created,
    failed:  results.failed,
  });
});

// ─── TIN validation helper ────────────────────────────────────────────────────
// ZIMRA TIN: 10-digit numeric (legacy) or 10–15 alphanumeric (new format)
function isValidTin(tin) {
  if (!tin) return true; // TIN is optional
  const stripped = String(tin).trim();
  return /^\d{10}$/.test(stripped) || /^[A-Z0-9]{10,15}$/i.test(stripped);
}

// ─── GET /api/employees/:id/termination — calculate termination amounts ───────
/**
 * Returns a break-down of all amounts payable on termination:
 *   proRataSalary, noticePay, leavePayment, totalGross, taxEstimate, netEstimate
 *
 * Query params:
 *   terminationDate  — ISO date (defaults to today)
 *   noticeDays       — days notice owed (default 30)
 *   noticeGiven      — 'true' if employee worked their notice (no notice pay due)
 *   currency         — 'USD' | 'ZiG' (defaults to employee currency)
 */
router.get('/:id/termination', requirePermission('manage_employees'), async (req, res) => {
  try {
    const employee = await prisma.employee.findUnique({
      where: { id: req.params.id },
      include: { leaveBalances: { where: { leaveType: 'ANNUAL' }, orderBy: { year: 'desc' }, take: 1 } },
    });
    if (!employee) return res.status(404).json({ message: 'Employee not found' });
    if (req.companyId && employee.companyId !== req.companyId) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const terminationDate = req.query.terminationDate
      ? new Date(req.query.terminationDate)
      : new Date();
    const noticeDays   = parseInt(req.query.noticeDays || '30');
    const noticeGiven  = req.query.noticeGiven === 'true';
    const currency     = req.query.currency || employee.currency || 'USD';

    // Last drawn salary: use most recent completed payslip gross, fall back to baseRate
    const lastPayslip = await prisma.payslip.findFirst({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });
    const lastGross  = lastPayslip?.gross ?? employee.baseRate;
    const monthlyPay = lastGross; // assume gross = full monthly salary

    // Pro-rata salary for partial month of work
    const termDay         = terminationDate.getDate();
    const daysInTermMonth = new Date(
      terminationDate.getFullYear(), terminationDate.getMonth() + 1, 0
    ).getDate();
    const proRataSalary   = monthlyPay * (termDay / daysInTermMonth);

    // Configurable calendar constants from SystemSettings
    const daysPerMonth      = await getSettingAsNumber('DAYS_PER_MONTH', 30);
    const workingDaysPerMonth = await getSettingAsNumber('WORKING_DAYS_PER_MONTH', 22);

    // Notice pay — only if employee did NOT work out notice period
    // Formula: noticeDays × (monthlyPay / daysPerMonth) — per Zimbabwe Labour Act for monthly-paid employees
    // For daily-paid: noticeDays × baseRate; for hourly: noticeDays × hoursPerDay × baseRate
    let noticePay = 0;
    if (!noticeGiven) {
      if (employee.paymentBasis === 'DAILY') {
        noticePay = noticeDays * employee.baseRate;
      } else if (employee.paymentBasis === 'HOURLY') {
        const hoursPerDay = employee.hoursPerPeriod ? employee.hoursPerPeriod / (employee.daysPerPeriod || workingDaysPerMonth) : 8;
        noticePay = noticeDays * hoursPerDay * employee.baseRate;
      } else {
        noticePay = noticeDays * (monthlyPay / daysPerMonth);
      }
    }

    // Accrued leave pay
    const leaveBalance   = employee.leaveBalances?.[0]?.balance ?? employee.leaveBalance ?? 0;
    const dailyRate      = monthlyPay / daysPerMonth;
    const leavePayment   = leaveBalance * dailyRate;

    // Years of service (for information)
    const yearsOfService = Math.max(0,
      (terminationDate - new Date(employee.startDate)) / (1000 * 60 * 60 * 24 * 365.25)
    );

    const totalGross = proRataSalary + noticePay + leavePayment;

    res.json({
      employeeId:      employee.id,
      name:            `${employee.firstName} ${employee.lastName}`,
      employeeCode:    employee.employeeCode,
      currency,
      terminationDate: terminationDate.toISOString().slice(0, 10),
      yearsOfService:  parseFloat(yearsOfService.toFixed(2)),
      lastGross,
      monthlyPay,
      proRataSalary:   parseFloat(proRataSalary.toFixed(2)),
      noticeDays,
      noticeGiven,
      noticePay:       parseFloat(noticePay.toFixed(2)),
      leaveBalance:    parseFloat(leaveBalance.toFixed(2)),
      leavePayment:    parseFloat(leavePayment.toFixed(2)),
      totalGross:      parseFloat(totalGross.toFixed(2)),
      note: 'Tax on termination payments should be computed in the payroll run using the SEVERANCE transaction code.',
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

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
    res.json(logs);
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
    res.json(employee);
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

    res.json(employee);
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
