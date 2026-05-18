-- Create LeaveType table
CREATE TABLE "LeaveType" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "accrualType" VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
  "entitlementDays" FLOAT NOT NULL,
  "carryForwardDays" FLOAT,
  "maxAccumulation" FLOAT,
  "allowNegative" BOOLEAN NOT NULL DEFAULT false,
  "isPaid" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "LeaveType_companyId_name_key" ON "LeaveType"("companyId", "name");
CREATE INDEX "LeaveType_companyId_idx" ON "LeaveType"("companyId");

-- Create LeaveTransaction table (the ledger)
CREATE TABLE "LeaveTransaction" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" UUID NOT NULL,
  "leaveTypeId" UUID NOT NULL,
  "transactionType" VARCHAR(20) NOT NULL,
  "amount" FLOAT NOT NULL,
  "balance" FLOAT NOT NULL,
  "transactionDate" TIMESTAMP NOT NULL DEFAULT NOW(),
  "expiryDate" TIMESTAMP,
  "referenceDocType" VARCHAR(50),
  "referenceId" UUID,
  "description" TEXT,
  "createdBy" UUID,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;
ALTER TABLE "LeaveTransaction" ADD CONSTRAINT "LeaveTransaction_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE;
CREATE INDEX "LeaveTransaction_employeeId_idx" ON "LeaveTransaction"("employeeId");
CREATE INDEX "LeaveTransaction_employeeId_leaveTypeId_idx" ON "LeaveTransaction"("employeeId", "leaveTypeId");
CREATE INDEX "LeaveTransaction_transactionDate_idx" ON "LeaveTransaction"("transactionDate");

-- Create LeaveAllocation table
CREATE TABLE "LeaveAllocation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" UUID NOT NULL,
  "leaveTypeId" UUID NOT NULL,
  "year" INT NOT NULL,
  "entitlement" FLOAT NOT NULL,
  "used" FLOAT NOT NULL DEFAULT 0,
  "carriedForward" FLOAT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE "LeaveAllocation" ADD CONSTRAINT "LeaveAllocation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;
ALTER TABLE "LeaveAllocation" ADD CONSTRAINT "LeaveAllocation_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE;
CREATE UNIQUE INDEX "LeaveAllocation_employeeId_leaveTypeId_year_key" ON "LeaveAllocation"("employeeId", "leaveTypeId", "year");
CREATE INDEX "LeaveAllocation_employeeId_year_idx" ON "LeaveAllocation"("employeeId", "year");

-- Create LeavePolicyAssignment table
CREATE TABLE "LeavePolicyAssignment" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "employeeId" UUID NOT NULL,
  "leavePolicyId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "effectiveFrom" TIMESTAMP NOT NULL DEFAULT NOW(),
  "effectiveTo" TIMESTAMP,
  "reason" VARCHAR(255),
  "createdBy" UUID,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE "LeavePolicyAssignment" ADD CONSTRAINT "LeavePolicyAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE;
ALTER TABLE "LeavePolicyAssignment" ADD CONSTRAINT "LeavePolicyAssignment_leavePolicyId_fkey" FOREIGN KEY ("leavePolicyId") REFERENCES "LeavePolicy"("id") ON DELETE CASCADE;
ALTER TABLE "LeavePolicyAssignment" ADD CONSTRAINT "LeavePolicyAssignment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE;
CREATE INDEX "LeavePolicyAssignment_employeeId_idx" ON "LeavePolicyAssignment"("employeeId");
CREATE INDEX "LeavePolicyAssignment_employeeId_effectiveFrom_idx" ON "LeavePolicyAssignment"("employeeId", "effectiveFrom");

-- Migration: Seed existing ANNUAL leave type for each company
INSERT INTO "LeaveType" ("id", "companyId", "name", "accrualType", "entitlementDays", "carryForwardDays", "maxAccumulation", "allowNegative", "isPaid", "isActive")
SELECT
  gen_random_uuid(),
  c.id,
  'ANNUAL',
  'YEARLY',
  COALESCE(
    (SELECT CAST("settingValue" AS FLOAT) FROM "SystemSetting" WHERE "settingName" = 'DEFAULT_ANNUAL_LEAVE_DAYS' AND "isActive" = true LIMIT 1),
    21.0
  ),
  COALESCE(
    (SELECT CAST("settingValue" AS FLOAT) FROM "SystemSetting" WHERE "settingName" = 'DEFAULT_CARRY_FORWARD_DAYS' AND "isActive" = true LIMIT 1),
    5.0
  ),
  NULL,
  false,
  true,
  true
FROM "Company" c
WHERE NOT EXISTS (
  SELECT 1 FROM "LeaveType" lt WHERE lt."companyId" = c.id AND lt.name = 'ANNUAL'
);

-- Migration: Update existing LeavePolicy to reference LeaveType
UPDATE "LeavePolicy" lp
SET "leaveTypeId" = (
  SELECT lt.id FROM "LeaveType" lt
  WHERE lt."companyId" = lp."companyId" AND lt.name = lp."leaveType"
  LIMIT 1
)
WHERE lp."leaveTypeId" IS NULL
AND EXISTS (
  SELECT 1 FROM "LeaveType" lt
  WHERE lt."companyId" = lp."companyId" AND lt.name = lp."leaveType"
);

-- Migration: Assign default policy to employees who have a LeaveBalance record
INSERT INTO "LeavePolicyAssignment" ("id", "employeeId", "leavePolicyId", "companyId", "effectiveFrom", "reason")
SELECT
  gen_random_uuid(),
  e.id,
  lp.id,
  e."companyId",
  e."createdAt",
  'Auto-assigned during leave ledger migration'
FROM "Employee" e
JOIN "LeaveBalance" lb ON lb."employeeId" = e.id
JOIN "LeavePolicy" lp ON lp."companyId" = e."companyId"
JOIN "LeaveType" lt ON lt.id = lp."leaveTypeId" AND lt.name = lb."leaveType"
WHERE NOT EXISTS (
  SELECT 1 FROM "LeavePolicyAssignment" lpa
  WHERE lpa."employeeId" = e.id AND lpa."leavePolicyId" = lp.id
);

-- Migration: Seed OPENING ledger entry for each employee with existing balance
INSERT INTO "LeaveTransaction" ("id", "employeeId", "leaveTypeId", "transactionType", "amount", "balance", "transactionDate", "description", "createdAt")
SELECT
  gen_random_uuid(),
  e.id,
  (SELECT id FROM "LeaveType" lt WHERE lt."companyId" = e."companyId" AND lt.name = 'ANNUAL' LIMIT 1),
  'OPENING',
  COALESCE(e."leaveBalance", 0),
  COALESCE(e."leaveBalance", 0),
  e."createdAt",
  'Opening balance migrated from legacy leaveBalance field',
  NOW()
FROM "Employee" e
WHERE COALESCE(e."leaveBalance", 0) > 0
AND EXISTS (SELECT 1 FROM "LeaveType" lt WHERE lt."companyId" = e."companyId" AND lt.name = 'ANNUAL')
ON CONFLICT DO NOTHING;