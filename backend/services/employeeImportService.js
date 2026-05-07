const prisma = require('../lib/prisma');
const { parse: parseCSV } = require('csv-parse/sync');
const XLSX = require('xlsx');
const { pickEmployeeFields, isValidTin } = require('../lib/employeeFields');

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
      throw new Error('Unsupported file. Upload a .csv or .xlsx file.');
    }
  } catch (err) {
    throw new Error('Failed to parse file: ' + err.message);
  }

  if (!rows.length) throw new Error('No data rows found in file.');

  // Resolve branch/department names → IDs for this company
  const [allBranches, allDepts] = await Promise.all([
    prisma.branch.findMany({ where: { companyId: scopedCompanyId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId: scopedCompanyId }, select: { id: true, name: true } }),
  ]);
  const branchMap = Object.fromEntries(allBranches.map((b) => [b.name.toLowerCase().trim(), b.id]));
  const deptMap = Object.fromEntries(allDepts.map((d) => [d.name.toLowerCase().trim(), d.id]));

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
        employeeCode: get(row, 'Employee Code'),
        title: get(row, 'Title'),
        firstName: get(row, 'First Name'),
        lastName: get(row, 'Last Name'),
        maidenName: get(row, 'Maiden Name'),
        nationality: get(row, 'Nationality'),
        nationalId: get(row, 'National ID'),
        passportNumber: get(row, 'Passport Number'),
        email: get(row, 'Email'),
        phone: get(row, 'Phone'),
        dateOfBirth: get(row, 'Date of Birth'),
        gender: get(row, 'Gender'),
        maritalStatus: get(row, 'Marital Status'),
        homeAddress: get(row, 'Home Address'),
        postalAddress: get(row, 'Postal Address'),
        nextOfKinName: get(row, 'Next of Kin Name'),
        nextOfKinContact: get(row, 'Next of Kin Contact'),
        socialSecurityNum: get(row, 'Social Security Number'),
        startDate: get(row, 'Start Date'),
        occupation: get(row, 'Occupation'),
        position: get(row, 'Position/Job Title'),
        costCenter: get(row, 'Cost Center'),
        employmentType: get(row, 'Employment Type') || 'PERMANENT',
        leaveEntitlement: get(row, 'Leave Entitlement (days)'),
        paymentMethod: get(row, 'Payment Method') || 'BANK',
        paymentBasis: get(row, 'Payment Basis') || 'MONTHLY',
        rateSource: get(row, 'Rate Source') || 'MANUAL',
        baseRate: get(row, 'Base Rate'),
        currency: get(row, 'Currency') || 'USD',
        hoursPerPeriod: get(row, 'Hours Per Period'),
        daysPerPeriod: get(row, 'Days Per Period'),
        bankName: get(row, 'Bank Name'),
        bankBranch: get(row, 'Bank Branch'),
        accountNumber: get(row, 'Account Number'),
        taxMethod: get(row, 'Tax Method') || 'NON_FDS',
        taxTable: get(row, 'Tax Table'),
        accumulativeSetting: get(row, 'Accumulative Setting') || 'NO',
        taxCredits: get(row, 'Tax Credits'),
        tin: get(row, 'TIN'),
        motorVehicleBenefit: get(row, 'Motor Vehicle Benefit'),
        motorVehicleType: get(row, 'Motor Vehicle Type'),
        taxDirectivePerc: get(row, 'Tax Directive %'),
        taxDirectiveAmt: get(row, 'Tax Directive Amount'),
        annualLeaveAccrued: get(row, 'Annual Leave Accrued'),
        annualLeaveTaken: get(row, 'Annual Leave Taken'),
      };

      if (!body.firstName) throw new Error('First Name is required');
      if (!body.lastName) throw new Error('Last Name is required');
      if (!body.position) throw new Error('Position/Job Title is required');
      if (!body.startDate) throw new Error('Start Date is required');
      if (!body.baseRate) throw new Error('Base Rate is required');
      if (body.tin && !isValidTin(body.tin)) throw new Error('Invalid TIN format (must be 10-digit or 10–15 alphanumeric)');

      // Resolve branch/department names
      const branchName = get(row, 'Branch Name');
      const deptName = get(row, 'Department Name');
      if (branchName) body.branchId = branchMap[branchName.toLowerCase()] || undefined;
      if (deptName) body.departmentId = deptMap[deptName.toLowerCase()] || undefined;

      const data = pickEmployeeFields(body);
      Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

      await prisma.employee.create({
        data: {
          ...data,
          companyId: scopedCompanyId,
          clientId: company.clientId,
          startDate: new Date(body.startDate),
          baseRate: parseFloat(body.baseRate),
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
