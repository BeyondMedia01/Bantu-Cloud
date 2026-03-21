export interface Employee {
  id: string;
  clientId: string;
  companyId: string;
  branchId?: string | null;
  departmentId?: string | null;
  userId?: string | null;
  gradeId?: string | null;

  // Personal
  employeeCode?: string | null;
  title?: string | null;
  firstName: string;
  lastName: string;
  maidenName?: string | null;
  nationality?: string | null;
  idPassport?: string | null;
  dateOfBirth?: string | Date | null;
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | null;
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED' | null;
  homeAddress?: string | null;
  postalAddress?: string | null;
  nextOfKin?: string | null;
  nextOfKinName?: string | null;
  nextOfKinContact?: string | null;
  socialSecurityNum?: string | null;
  pensionNumber?: string | null;

  // Work
  position: string;
  occupation?: string | null;
  employmentType?: 'PERMANENT' | 'CONTRACT' | 'TEMPORARY' | 'PART_TIME' | null;
  startDate?: string | Date | null;
  costCenter?: string | null;
  leaveEntitlement?: number | null;
  dischargeDate?: string | Date | null;
  dischargeReason?: string | null;
  leaveBalance?: number | null;
  leaveTaken?: number | null;

  // Pay
  baseRate: number;
  currency?: string | null;
  paymentMethod?: 'BANK' | 'CASH' | null;
  paymentBasis?: 'MONTHLY' | 'DAILY' | 'HOURLY' | null;
  rateSource?: string | null;
  hoursPerPeriod?: number | null;
  daysPerPeriod?: number | null;
  bankName?: string | null;
  bankBranch?: string | null;
  accountNumber?: string | null;
  necGradeId?: string | null;
  splitUsdPercent?: number | null;

  // Tax
  taxMethod?: 'FDS_AVERAGE' | 'FDS_FORECASTING' | 'NON_FDS' | null;
  taxTable?: string | null;
  taxDirective?: string | null;
  taxDirectivePerc?: number | null;
  taxDirectiveAmt?: number | null;
  accumulativeSetting?: string | null;
  taxCredits?: number | null;
  tin?: string | null;
  motorVehicleBenefit?: number | null;
  motorVehicleType?: string | null;
  bankAccounts?: EmployeeBankAccount[] | null;

  createdAt: string;
  updatedAt: string;

  // Nested relations (optional depending on query)
  department?: { id?: string; name: string } | null;
  branch?: { id?: string; name: string } | null;
  company?: { id?: string; name: string } | null;
  grade?: { id?: string; name: string } | null;
}

export interface EmployeeFilters {
  search: string;
  branch: string;
  department: string;
  employmentType: string;
}

export interface EmployeeBankAccount {
  id?: string;
  employeeId?: string;
  accountName?: string | null;
  accountNumber: string;
  bankName: string;
  bankBranch?: string | null;
  branchCode?: string | null;
  currency: string;
  splitType: 'FIXED' | 'PERCENTAGE' | 'REMAINDER';
  splitValue: number;
  priority: number;
  createdAt?: string;
  updatedAt?: string;
}
