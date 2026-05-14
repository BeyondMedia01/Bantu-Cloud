import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requirePermission } from '../lib/permissions';
import { processEmployeeImport } from '../services/employeeImportService';

const router = new Hono();

const IMPORT_COLUMNS = [
  { header: 'Employee Code *', key: 'employeeCode' },
  { header: 'Title', key: 'title', hint: 'Mr/Mrs/Miss/Ms/Dr/Prof/Rev' },
  { header: 'First Name *', key: 'firstName' },
  { header: 'Last Name *', key: 'lastName' },
  { header: 'Maiden Name', key: 'maidenName' },
  { header: 'Nationality *', key: 'nationality' },
  { header: 'National ID *', key: 'nationalId', hint: 'e.g. 63-123456A78' },
  { header: 'Passport Number', key: 'passportNumber' },
  { header: 'Email', key: 'email' },
  { header: 'Phone', key: 'phone' },
  { header: 'Date of Birth *', key: 'dateOfBirth', hint: 'YYYY-MM-DD' },
  { header: 'Gender *', key: 'gender', hint: 'MALE/FEMALE/OTHER' },
  { header: 'Marital Status *', key: 'maritalStatus', hint: 'SINGLE/MARRIED/DIVORCED/WIDOWED' },
  { header: 'Home Address', key: 'homeAddress' },
  { header: 'Postal Address', key: 'postalAddress' },
  { header: 'Next of Kin Name', key: 'nextOfKinName' },
  { header: 'Next of Kin Contact', key: 'nextOfKinContact' },
  { header: 'Social Security Number', key: 'socialSecurityNum' },
  { header: 'Start Date *', key: 'startDate', hint: 'YYYY-MM-DD' },
  { header: 'Occupation', key: 'occupation' },
  { header: 'Position/Job Title *', key: 'position' },
  { header: 'Department Name', key: '_departmentName', hint: 'Must match existing department' },
  { header: 'Branch Name', key: '_branchName', hint: 'Must match existing branch' },
  { header: 'Cost Center', key: 'costCenter' },
  { header: 'Employment Type *', key: 'employmentType', hint: 'PERMANENT/CONTRACT/TEMPORARY/PART_TIME' },
  { header: 'Leave Entitlement (days)', key: 'leaveEntitlement' },
  { header: 'Payment Method *', key: 'paymentMethod', hint: 'BANK/CASH' },
  { header: 'Payment Basis *', key: 'paymentBasis', hint: 'MONTHLY/DAILY/HOURLY' },
  { header: 'Rate Source', key: 'rateSource', hint: 'MANUAL/NEC_GRADE' },
  { header: 'Base Rate *', key: 'baseRate' },
  { header: 'Currency *', key: 'currency', hint: 'USD/ZiG' },
  { header: 'Hours Per Period', key: 'hoursPerPeriod' },
  { header: 'Days Per Period', key: 'daysPerPeriod' },
  { header: 'Bank Name', key: 'bankName' },
  { header: 'Bank Branch', key: 'bankBranch' },
  { header: 'Account Number', key: 'accountNumber' },
  { header: 'Tax Method *', key: 'taxMethod', hint: 'NON_FDS/FDS_AVERAGE/FDS_FORECASTING' },
  { header: 'Tax Table *', key: 'taxTable', hint: 'e.g. USD 2024' },
  { header: 'Accumulative Setting', key: 'accumulativeSetting', hint: 'YES/NO' },
  { header: 'Tax Credits', key: 'taxCredits' },
  { header: 'TIN', key: 'tin' },
  { header: 'Motor Vehicle Benefit', key: 'motorVehicleBenefit', hint: 'Monthly amount' },
  { header: 'Motor Vehicle Type', key: 'motorVehicleType' },
  { header: 'Tax Directive %', key: 'taxDirectivePerc' },
  { header: 'Tax Directive Amount', key: 'taxDirectiveAmt' },
  { header: 'Annual Leave Accrued', key: 'annualLeaveAccrued' },
  { header: 'Annual Leave Taken', key: 'annualLeaveTaken' },
];

router.get('/template', async (c) => {
  const headers = IMPORT_COLUMNS.map(col => col.header);
  const escape = (v: string) => v.includes(',') ? `"${v}"` : v;
  const sample = [
    'EMP001', 'Mr', 'John', 'Doe', '', 'Zimbabwean', '63-123456A78', '', 'john@demo.com', '0771234567',
    '1985-03-15', 'MALE', 'MARRIED', '1 Main St Harare', '',
    'Jane Doe', '0771234567', '3001234567', '2024-01-01',
    'Software Engineer', 'Developer', 'Engineering', 'Main Branch',
    'CC001', 'PERMANENT', '30', 'BANK', 'MONTHLY', 'MANUAL',
    '1500.00', 'USD', '176', '22', 'CBZ Bank', 'Harare Main', '1234567890',
    'NON_FDS', 'USD 2024', 'NO', '0', '', '0', '', '0', '0', '0', '0',
  ];
  const csv = [headers.map(escape).join(','), sample.map(escape).join(',')].join('\n');
  c.header('Content-Type', 'text/csv');
  c.header('Content-Disposition', 'attachment; filename="employee_import_template.csv"');
  return c.body(csv);
});

router.post('/', requirePermission('manage_employees'), async (c) => {
  const companyId = c.get('companyId');
  const clientId = c.get('clientId');
  if (!companyId) return c.json({ message: 'Company context required' }, 400);

  try {
    const body = await c.req.parseBody();
    const file = body['file'] as File | undefined;
    if (!file) return c.json({ message: 'No file uploaded' }, 400);

    const text = await file.text();
    const result = await processEmployeeImport(text, companyId!, clientId!);
    return c.json(result);
  } catch (err) {
    return c.json({ message: (err as Error).message }, 400);
  }
});

export default router;
