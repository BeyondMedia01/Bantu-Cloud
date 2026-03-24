'use strict';

const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const { requirePermission } = require('../../lib/permissions');
const { processEmployeeImport } = require('../../services/employeeImportService');

const router = express.Router();

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

// GET /api/employees/import/template — download CSV or Excel template
router.get('/template', (req, res) => {
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
router.post('/', requirePermission('manage_employees'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  if (!req.companyId) return res.status(400).json({ message: 'Company context required' });
  try {
    const result = await processEmployeeImport(req.file.buffer, req.file.originalname, req.companyId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;
