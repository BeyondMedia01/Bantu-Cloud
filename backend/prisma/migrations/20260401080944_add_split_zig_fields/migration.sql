/*
  Warnings:

  - The values [FORECASTING,STANDARD_PAYE] on the enum `TaxMethod` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `idPassport` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `PayrollInput` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[clientId,year,month]` on the table `PayrollCalendar` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "IncomeCategory" AS ENUM ('BASIC_SALARY', 'BONUS', 'GRATUITY', 'ALLOWANCE', 'OVERTIME', 'COMMISSION', 'BENEFIT', 'PENSION', 'MEDICAL_AID');

-- CreateEnum
CREATE TYPE "SplitZigMode" AS ENUM ('NONE', 'FIXED', 'PERCENTAGE');

-- AlterEnum
BEGIN;
CREATE TYPE "TaxMethod_new" AS ENUM ('FDS_AVERAGE', 'FDS_FORECASTING', 'NON_FDS');
ALTER TABLE "Employee" ALTER COLUMN "taxMethod" DROP DEFAULT;
ALTER TABLE "Employee" ALTER COLUMN "taxMethod" TYPE "TaxMethod_new" USING ("taxMethod"::text::"TaxMethod_new");
ALTER TYPE "TaxMethod" RENAME TO "TaxMethod_old";
ALTER TYPE "TaxMethod_new" RENAME TO "TaxMethod";
DROP TYPE "TaxMethod_old";
ALTER TABLE "Employee" ALTER COLUMN "taxMethod" SET DEFAULT 'NON_FDS';
COMMIT;

-- DropIndex
DROP INDEX "ClientAdmin_clientId_key";

-- DropIndex
DROP INDEX "PayrollCalendar_clientId_key";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "sdfRate" DOUBLE PRECISION,
ADD COLUMN     "wcifRate" DOUBLE PRECISION,
ADD COLUMN     "zimdefRate" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "idPassport",
ADD COLUMN     "email" TEXT,
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "necGradeId" TEXT,
ADD COLUMN     "passportNumber" TEXT,
ADD COLUMN     "pensionNumber" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "splitUsdPercent" DOUBLE PRECISION,
ADD COLUMN     "splitZigMode" "SplitZigMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "splitZigValue" DOUBLE PRECISION,
ADD COLUMN     "taxDirectiveEffective" TIMESTAMP(3),
ADD COLUMN     "taxDirectiveExpiry" TIMESTAMP(3),
ADD COLUMN     "taxDirectiveRef" TEXT,
ALTER COLUMN "taxMethod" SET DEFAULT 'NON_FDS';

-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'ANNUAL';

-- AlterTable
ALTER TABLE "LoanRepayment" ADD COLUMN     "payrollRunId" TEXT;

-- AlterTable
ALTER TABLE "PayrollInput" DROP COLUMN "amount",
ADD COLUMN     "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "duration" TEXT NOT NULL DEFAULT 'Indefinite',
ADD COLUMN     "employeeUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "employeeZiG" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "employerUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "employerZiG" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "units" DOUBLE PRECISION,
ADD COLUMN     "unitsType" TEXT,
ALTER COLUMN "payrollRunId" DROP NOT NULL,
ALTER COLUMN "period" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "dualCurrency" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Payslip" ADD COLUMN     "aidsLevyUSD" DOUBLE PRECISION,
ADD COLUMN     "aidsLevyZIG" DOUBLE PRECISION,
ADD COLUMN     "basicSalaryApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "exemptBonus" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "exemptBonusUSD" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "exemptBonusZIG" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "exemptSeverance" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "grossUSD" DOUBLE PRECISION,
ADD COLUMN     "grossZIG" DOUBLE PRECISION,
ADD COLUMN     "medicalAidCredit" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "necEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "necLevy" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "netPayUSD" DOUBLE PRECISION,
ADD COLUMN     "netPayZIG" DOUBLE PRECISION,
ADD COLUMN     "nssaBasis" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "nssaEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "nssaUSD" DOUBLE PRECISION,
ADD COLUMN     "nssaZIG" DOUBLE PRECISION,
ADD COLUMN     "payeUSD" DOUBLE PRECISION,
ADD COLUMN     "payeZIG" DOUBLE PRECISION,
ADD COLUMN     "pensionApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "sdfContribution" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "taxCreditsApplied" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "wcifEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "zimdefEmployer" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "TaxTable" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAnnual" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "TransactionCode" ADD COLUMN     "affectsAidsLevy" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "affectsNssa" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "affectsPaye" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "calculationType" TEXT NOT NULL DEFAULT 'fixed',
ADD COLUMN     "defaultValue" DOUBLE PRECISION,
ADD COLUMN     "formula" TEXT,
ADD COLUMN     "incomeCategory" "IncomeCategory",
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preTax" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EmployeeBankAccount" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "accountName" TEXT,
    "accountNumber" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "bankBranch" TEXT,
    "branchCode" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "splitType" TEXT NOT NULL DEFAULT 'REMAINDER',
    "splitValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeBankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "size" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCore" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "employeeCode" TEXT NOT NULL,
    "jobTitle" TEXT,
    "basicSalaryZiG" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "basicSalaryUSD" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "preferredCurrencySplit" JSONB,
    "paymentFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "bankName" TEXT,
    "bankBranch" TEXT,
    "accountNumber" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollCore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionCodeRule" (
    "id" TEXT NOT NULL,
    "transactionCodeId" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "conditionValue" TEXT,
    "calculationOverride" TEXT,
    "valueOverride" DOUBLE PRECISION,
    "formulaOverride" TEXT,
    "capAmount" DOUBLE PRECISION,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionCodeRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTransaction" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "transactionCodeId" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NecTable" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NecTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NecGrade" (
    "id" TEXT NOT NULL,
    "necTableId" TEXT NOT NULL,
    "gradeCode" TEXT NOT NULL,
    "description" TEXT,
    "minRate" DOUBLE PRECISION NOT NULL,
    "necLevyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NecGrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 60,
    "normalHours" DOUBLE PRECISION NOT NULL DEFAULT 8,
    "ot0Threshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ot1Threshold" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "ot0Multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "ot1Multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "ot2Multiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0,
    "isOvernight" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftAssignment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "daysOfWeek" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BiometricDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "model" TEXT,
    "ipAddress" TEXT,
    "port" INTEGER DEFAULT 4370,
    "serialNumber" TEXT,
    "location" TEXT,
    "username" TEXT,
    "password" TEXT,
    "webhookKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BiometricDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT,
    "deviceId" TEXT,
    "deviceUserId" TEXT,
    "punchTime" TIMESTAMP(3) NOT NULL,
    "punchType" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DEVICE',
    "rawPayload" JSONB,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftId" TEXT,
    "clockIn" TIMESTAMP(3),
    "clockOut" TIMESTAMP(3),
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "normalMinutes" INTEGER NOT NULL DEFAULT 0,
    "ot0Minutes" INTEGER NOT NULL DEFAULT 0,
    "ot1Minutes" INTEGER NOT NULL DEFAULT 0,
    "ot2Minutes" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PRESENT',
    "isPublicHoliday" BOOLEAN NOT NULL DEFAULT false,
    "isManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeavePolicy" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "accrualRate" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "maxAccumulation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carryOverLimit" DOUBLE PRECISION NOT NULL DEFAULT 30,
    "encashable" BOOLEAN NOT NULL DEFAULT true,
    "encashCap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeavePolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leavePolicyId" TEXT,
    "leaveType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "accrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "encashed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "forfeited" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastAccrualDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveEncashment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveBalanceId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "ratePerDay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "payrollInputId" TEXT,
    "requestedBy" TEXT,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveEncashment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyRate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL DEFAULT 'USD',
    "toCurrency" TEXT NOT NULL DEFAULT 'ZiG',
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicHoliday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "year" INTEGER NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'ZW',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "error" TEXT,
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeBankAccount_employeeId_idx" ON "EmployeeBankAccount"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_idx" ON "EmployeeDocument"("employeeId");

-- CreateIndex
CREATE INDEX "TransactionCodeRule_transactionCodeId_idx" ON "TransactionCodeRule"("transactionCodeId");

-- CreateIndex
CREATE INDEX "EmployeeTransaction_employeeId_idx" ON "EmployeeTransaction"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeTransaction_transactionCodeId_idx" ON "EmployeeTransaction"("transactionCodeId");

-- CreateIndex
CREATE INDEX "EmployeeTransaction_effectiveFrom_effectiveTo_idx" ON "EmployeeTransaction"("effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "NecGrade_necTableId_idx" ON "NecGrade"("necTableId");

-- CreateIndex
CREATE INDEX "ShiftAssignment_employeeId_startDate_idx" ON "ShiftAssignment"("employeeId", "startDate");

-- CreateIndex
CREATE INDEX "ShiftAssignment_companyId_startDate_idx" ON "ShiftAssignment"("companyId", "startDate");

-- CreateIndex
CREATE INDEX "AttendanceLog_companyId_punchTime_idx" ON "AttendanceLog"("companyId", "punchTime");

-- CreateIndex
CREATE INDEX "AttendanceLog_employeeId_punchTime_idx" ON "AttendanceLog"("employeeId", "punchTime");

-- CreateIndex
CREATE INDEX "AttendanceRecord_companyId_date_idx" ON "AttendanceRecord"("companyId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_shiftId_idx" ON "AttendanceRecord"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "LeavePolicy_companyId_leaveType_key" ON "LeavePolicy"("companyId", "leaveType");

-- CreateIndex
CREATE INDEX "LeaveBalance_companyId_idx" ON "LeaveBalance"("companyId");

-- CreateIndex
CREATE INDEX "LeaveBalance_leavePolicyId_idx" ON "LeaveBalance"("leavePolicyId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveType_year_key" ON "LeaveBalance"("employeeId", "leaveType", "year");

-- CreateIndex
CREATE INDEX "LeaveEncashment_employeeId_idx" ON "LeaveEncashment"("employeeId");

-- CreateIndex
CREATE INDEX "LeaveEncashment_leaveBalanceId_idx" ON "LeaveEncashment"("leaveBalanceId");

-- CreateIndex
CREATE INDEX "CurrencyRate_companyId_effectiveDate_idx" ON "CurrencyRate"("companyId", "effectiveDate");

-- CreateIndex
CREATE INDEX "PublicHoliday_year_country_idx" ON "PublicHoliday"("year", "country");

-- CreateIndex
CREATE UNIQUE INDEX "PublicHoliday_date_country_key" ON "PublicHoliday"("date", "country");

-- CreateIndex
CREATE INDEX "Job_status_runAt_idx" ON "Job"("status", "runAt");

-- CreateIndex
CREATE INDEX "ClientAdmin_clientId_idx" ON "ClientAdmin"("clientId");

-- CreateIndex
CREATE INDEX "Employee_companyId_idx" ON "Employee"("companyId");

-- CreateIndex
CREATE INDEX "Employee_clientId_idx" ON "Employee"("clientId");

-- CreateIndex
CREATE INDEX "Employee_branchId_idx" ON "Employee"("branchId");

-- CreateIndex
CREATE INDEX "Employee_departmentId_idx" ON "Employee"("departmentId");

-- CreateIndex
CREATE INDEX "Employee_gradeId_idx" ON "Employee"("gradeId");

-- CreateIndex
CREATE INDEX "Employee_necGradeId_idx" ON "Employee"("necGradeId");

-- CreateIndex
CREATE INDEX "Employee_clientId_companyId_idx" ON "Employee"("clientId", "companyId");

-- CreateIndex
CREATE INDEX "Employee_companyId_employmentType_idx" ON "Employee"("companyId", "employmentType");

-- CreateIndex
CREATE INDEX "LeaveRecord_employeeId_idx" ON "LeaveRecord"("employeeId");

-- CreateIndex
CREATE INDEX "LeaveRequest_employeeId_idx" ON "LeaveRequest"("employeeId");

-- CreateIndex
CREATE INDEX "Loan_employeeId_idx" ON "Loan"("employeeId");

-- CreateIndex
CREATE INDEX "LoanRepayment_loanId_idx" ON "LoanRepayment"("loanId");

-- CreateIndex
CREATE INDEX "LoanRepayment_payrollRunId_idx" ON "LoanRepayment"("payrollRunId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollCalendar_clientId_year_month_key" ON "PayrollCalendar"("clientId", "year", "month");

-- CreateIndex
CREATE INDEX "PayrollInput_employeeId_idx" ON "PayrollInput"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollInput_payrollRunId_idx" ON "PayrollInput"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollInput_transactionCodeId_idx" ON "PayrollInput"("transactionCodeId");

-- CreateIndex
CREATE INDEX "PayrollInput_payrollRunId_employeeId_idx" ON "PayrollInput"("payrollRunId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollInput_period_idx" ON "PayrollInput"("period");

-- CreateIndex
CREATE INDEX "PayrollInput_employeeId_period_idx" ON "PayrollInput"("employeeId", "period");

-- CreateIndex
CREATE INDEX "PayrollRun_companyId_idx" ON "PayrollRun"("companyId");

-- CreateIndex
CREATE INDEX "PayrollRun_payrollCalendarId_idx" ON "PayrollRun"("payrollCalendarId");

-- CreateIndex
CREATE INDEX "PayrollTransaction_payrollRunId_idx" ON "PayrollTransaction"("payrollRunId");

-- CreateIndex
CREATE INDEX "PayrollTransaction_employeeId_idx" ON "PayrollTransaction"("employeeId");

-- CreateIndex
CREATE INDEX "PayrollTransaction_transactionCodeId_idx" ON "PayrollTransaction"("transactionCodeId");

-- CreateIndex
CREATE INDEX "Payslip_employeeId_idx" ON "Payslip"("employeeId");

-- CreateIndex
CREATE INDEX "Payslip_payrollRunId_idx" ON "Payslip"("payrollRunId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "TaxBracket_taxTableId_idx" ON "TaxBracket"("taxTableId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_necGradeId_fkey" FOREIGN KEY ("necGradeId") REFERENCES "NecGrade"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeBankAccount" ADD CONSTRAINT "EmployeeBankAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCore" ADD CONSTRAINT "PayrollCore_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCore" ADD CONSTRAINT "PayrollCore_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionCodeRule" ADD CONSTRAINT "TransactionCodeRule_transactionCodeId_fkey" FOREIGN KEY ("transactionCodeId") REFERENCES "TransactionCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTransaction" ADD CONSTRAINT "EmployeeTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTransaction" ADD CONSTRAINT "EmployeeTransaction_transactionCodeId_fkey" FOREIGN KEY ("transactionCodeId") REFERENCES "TransactionCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecTable" ADD CONSTRAINT "NecTable_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NecGrade" ADD CONSTRAINT "NecGrade_necTableId_fkey" FOREIGN KEY ("necTableId") REFERENCES "NecTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShiftAssignment" ADD CONSTRAINT "ShiftAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BiometricDevice" ADD CONSTRAINT "BiometricDevice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "BiometricDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceLog" ADD CONSTRAINT "AttendanceLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeavePolicy" ADD CONSTRAINT "LeavePolicy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "LeavePolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEncashment" ADD CONSTRAINT "LeaveEncashment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEncashment" ADD CONSTRAINT "LeaveEncashment_leaveBalanceId_fkey" FOREIGN KEY ("leaveBalanceId") REFERENCES "LeaveBalance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveEncashment" ADD CONSTRAINT "LeaveEncashment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanRepayment" ADD CONSTRAINT "LoanRepayment_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyRate" ADD CONSTRAINT "CurrencyRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
