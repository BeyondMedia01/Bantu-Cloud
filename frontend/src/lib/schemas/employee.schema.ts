import { z } from 'zod';
import { ZW_NATIONAL_ID_REGEX, isValidZwPhone, isValidAccountNumber } from '../validators/zw';

export const bankAccountSchema = z.object({
  accountName: z.string().optional(),
  accountNumber: z.string()
    .min(1, 'Required')
    .transform(v => v.replace(/[\s-]/g, ''))
    .refine(isValidAccountNumber, 'Please enter a valid card or bank account number (8–20 digits)'),
  bankName: z.string().min(1, 'Required'),
  bankBranch: z.string().optional(),
  branchCode: z.string().optional(),
  splitType: z.enum(['REMAINDER', 'FIXED', 'PERCENTAGE']),
  splitValue: z.coerce.number().min(0),
  priority: z.number(),
  currency: z.enum(['USD', 'ZiG']),
});

export const employeeSchema = z.object({
  // Personal
  employeeCode: z.string().min(1, 'Required'),
  title: z.string().optional(),
  firstName: z.string().min(1, 'Required'),
  lastName: z.string().min(1, 'Required'),
  maidenName: z.string().optional(),
  nationality: z.string().min(1, 'Required'),
  nationalId: z.string()
    .optional()
    .refine(v => !v || ZW_NATIONAL_ID_REGEX.test(v), 'Please enter a valid Zimbabwe National ID (e.g. 63-1234567 A 12)'),
  passportNumber: z.string().optional(),
  email: z.string().email('Invalid email').or(z.literal('')).optional(),
  phone: z.string()
    .optional()
    .refine(v => !v || isValidZwPhone(v), 'Please enter a valid Zimbabwe phone number'),
  dateOfBirth: z.date().optional(),
  gender: z.string().min(1, 'Required'),
  maritalStatus: z.string().min(1, 'Required'),
  homeAddress: z.string().optional(),
  postalAddress: z.string().optional(),
  nextOfKinName: z.string().optional(),
  nextOfKinContact: z.string().optional(),
  socialSecurityNum: z.string().optional(),
  pensionNumber: z.string().optional(),
  // Work
  startDate: z.date().optional(),
  occupation: z.string().optional(),
  position: z.string().min(1, 'Required'),
  departmentId: z.string().optional(),
  branchId: z.string().optional(),
  costCenter: z.string().optional(),
  grade: z.string().optional(),
  employmentType: z.enum(['PERMANENT', 'CONTRACT', 'TEMPORARY', 'PART_TIME']),
  leaveEntitlement: z.coerce.number().optional(),
  dischargeDate: z.date().optional(),
  dischargeReason: z.string().optional(),
  // Pay
  paymentMethod: z.enum(['BANK', 'CASH']),
  paymentBasis: z.enum(['MONTHLY', 'DAILY', 'HOURLY']),
  rateSource: z.enum(['MANUAL', 'NEC_GRADE']),
  baseRate: z.coerce.number().min(0, 'Must be ≥ 0'),
  currency: z.enum(['USD', 'ZiG']),
  hoursPerPeriod: z.coerce.number().optional(),
  daysPerPeriod: z.coerce.number().optional(),
  bankAccounts: z.array(bankAccountSchema),
  necGradeId: z.string().optional(),
  splitUsdPercent: z.coerce.number().optional(),
  // Tax
  taxDirectivePerc: z.coerce.number().min(0).max(100).optional(),
  taxDirectiveAmt: z.coerce.number().min(0).optional(),
  taxMethod: z.enum(['NON_FDS', 'FDS_AVERAGE', 'FDS_FORECASTING']),
  taxTable: z.string().min(1, 'Required'),
  accumulativeSetting: z.enum(['YES', 'NO']),
  taxCredits: z.coerce.number().min(0).optional(),
  tin: z.string().optional(),
  motorVehicleBenefit: z.coerce.number().min(0).optional(),
  motorVehicleType: z.string().optional(),
  // Leave
  annualLeaveAccrued: z.coerce.number().min(0).optional(),
  annualLeaveTaken: z.coerce.number().min(0).optional(),
  // Split basic salary
  splitZigMode: z.enum(['NONE', 'FIXED', 'PERCENTAGE']),
  splitZigValue: z.coerce.number().optional(),
}).superRefine((data, ctx) => {
  if (data.nationality === 'Zimbabwean' && !data.nationalId) {
    ctx.addIssue({ code: 'custom', message: 'Required for Zimbabwean nationals', path: ['nationalId'] });
  }
  if (data.paymentMethod === 'BANK' && data.bankAccounts.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'At least one bank account required', path: ['bankAccounts'] });
  }
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;
