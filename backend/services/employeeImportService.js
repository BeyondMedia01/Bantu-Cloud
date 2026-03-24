const prisma = require('../lib/prisma');
const { parse: parseCSV } = require('csv-parse/sync');
const XLSX = require('xlsx');

function isValidTin(tin) {
  if (!tin) return true;
  const stripped = String(tin).trim();
  return /^\d{10}$/.test(stripped) || /^[A-Z0-9]{10,15}$/i.test(stripped);
}

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

async function processEmployeeImport(fileBuffer, originalName, scopedCompanyId) {
const company = await prisma.company.findUnique({ where: { id: scopedCompanyId } });
if (!company) throw new Error('Company not found');

// Parse file into array of objects
let rows = [];
const ext = originalName.toLowerCase().split('.').pop();
try {
  if (ext === 'csv') {
    rows = parseCSV(fileBuffer.toString('utf8'), {
      columns: true, skip_empty_lines: true, trim: true,
    });
  } else if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(fileBuffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  } else {
    throw new Error( 'Unsupported file. Upload a .csv or .xlsx file.');
  }
} catch (err) {
  throw new Error( 'Failed to parse file: ' + err.message);
}

if (!rows.length) throw new Error( 'No data rows found in file.');

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

  return { message: `Import complete: ${results.created} created, ${results.failed.length} failed.`, created: results.created, failed: results.failed };
}

module.exports = { processEmployeeImport };
