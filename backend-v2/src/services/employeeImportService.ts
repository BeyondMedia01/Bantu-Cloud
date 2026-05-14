import { prisma } from '../lib/prisma';

function isValidTin(tin: string): boolean {
  if (!tin) return true;
  const stripped = String(tin).trim();
  return /^\d{10}$/.test(stripped) || /^[A-Z0-9]{10,15}$/i.test(stripped);
}

function pickEmployeeFields(body: Record<string, unknown>) {
  const parseNum = (v: unknown) => v !== undefined && v !== '' ? parseFloat(v as string) : undefined;
  return {
    employeeCode: body.employeeCode,
    title: body.title,
    firstName: body.firstName,
    lastName: body.lastName,
    maidenName: body.maidenName,
    nationality: body.nationality,
    nationalId: body.nationalId,
    passportNumber: body.passportNumber,
    email: body.email,
    phone: body.phone,
    socialSecurityNum: body.socialSecurityNum,
    dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth as string) : undefined,
    gender: (body.gender as string) || undefined,
    maritalStatus: (body.maritalStatus as string) || undefined,
    homeAddress: body.homeAddress,
    postalAddress: body.postalAddress,
    nextOfKin: body.nextOfKin,
    nextOfKinName: body.nextOfKinName,
    nextOfKinContact: body.nextOfKinContact,
    occupation: body.occupation,
    position: body.position,
    employmentType: (body.employmentType as string) || undefined,
    startDate: body.startDate ? new Date(body.startDate as string) : undefined,
    branchId: (body.branchId as string) || undefined,
    departmentId: (body.departmentId as string) || undefined,
    costCenter: body.costCenter as string,
    gradeId: (body.gradeId as string) || undefined,
    leaveEntitlement: parseNum(body.leaveEntitlement),
    paymentMethod: (body.paymentMethod as string) || undefined,
    paymentBasis: (body.paymentBasis as string) || undefined,
    rateSource: (body.rateSource as string) || undefined,
    baseRate: parseNum(body.baseRate),
    currency: body.currency as string,
    hoursPerPeriod: parseNum(body.hoursPerPeriod),
    daysPerPeriod: parseNum(body.daysPerPeriod),
    bankName: body.bankName as string,
    bankBranch: body.bankBranch as string,
    accountNumber: body.accountNumber as string,
    taxMethod: (body.taxMethod as string) || undefined,
    taxTable: body.taxTable as string,
    taxDirective: body.taxDirective as string,
    taxDirectivePerc: parseNum(body.taxDirectivePerc),
    taxDirectiveAmt: parseNum(body.taxDirectiveAmt),
    accumulativeSetting: body.accumulativeSetting as string,
    taxCredits: parseNum(body.taxCredits),
    tin: body.tin as string,
    motorVehicleBenefit: parseNum(body.motorVehicleBenefit),
    motorVehicleType: body.motorVehicleType as string,
    vehicleEngineCategory: (body.vehicleEngineCategory as string) || undefined,
    grossingUp: body.grossingUp !== undefined ? Boolean(body.grossingUp) : undefined,
    leaveBalance: parseNum(body.annualLeaveAccrued),
    leaveTaken: parseNum(body.annualLeaveTaken),
    splitZigMode: body.splitZigMode as string,
    splitZigValue: parseNum(body.splitZigValue),
  };
}

export async function processEmployeeImport(fileText: string, companyId: string, clientId: string) {
  const rows = parseCsv(fileText);
  if (!rows.length) throw new Error('No data rows found in file.');

  const [allBranches, allDepts] = await Promise.all([
    prisma.branch.findMany({ where: { companyId }, select: { id: true, name: true } }),
    prisma.department.findMany({ where: { companyId }, select: { id: true, name: true } }),
  ]);
  const branchMap = Object.fromEntries(allBranches.map(b => [b.name.toLowerCase().trim(), b.id]));
  const deptMap = Object.fromEntries(allDepts.map(d => [d.name.toLowerCase().trim(), d.id]));

  const get = (row: Record<string, string>, header: string) => {
    const normalise = (s: string) => s.replace(/\s*\*$/, '').trim().toLowerCase();
    const needle = normalise(header);
    const key = Object.keys(row).find(k => normalise(k) === needle);
    return key ? String(row[key] ?? '').trim() : '';
  };

  const results = { created: 0, failed: [] as Array<{ row: number; name: string; reason: string }> };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    try {
      const body: Record<string, unknown> = {
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

      const tin = body.tin as string;
      if (tin && !isValidTin(tin)) throw new Error('Invalid TIN format (must be 10-digit or 10-15 alphanumeric)');

      const branchName = get(row, 'Branch Name');
      const deptName = get(row, 'Department Name');
      if (branchName) body.branchId = branchMap[branchName.toLowerCase()] || undefined;
      if (deptName) body.departmentId = deptMap[deptName.toLowerCase()] || undefined;

      const data = pickEmployeeFields(body);
      Object.keys(data).forEach(k => (data as any)[k] === undefined && delete (data as any)[k]);

      await prisma.employee.create({
        data: {
          ...data,
          id: crypto.randomUUID(),
          companyId,
          clientId,
          startDate: new Date(body.startDate as string),
          baseRate: parseFloat(body.baseRate as string),
        } as any,
      });

      results.created++;
    } catch (err) {
      const name = `${get(row, 'First Name')} ${get(row, 'Last Name')}`.trim() || `Row ${rowNum}`;
      results.failed.push({ row: rowNum, name, reason: (err as Error).message });
    }
  }

  return { message: `Import complete: ${results.created} created, ${results.failed.length} failed.`, created: results.created, failed: results.failed };
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return [];

  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  const result: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = values[idx] || ''; });
    result.push(row);
  }
  return result;
}
