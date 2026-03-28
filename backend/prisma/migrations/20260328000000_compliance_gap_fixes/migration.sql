-- CreateEnum
CREATE TYPE "VehicleEngineCategory" AS ENUM ('NONE', 'UP_TO_1500CC', 'CC_1501_TO_2000', 'ABOVE_2000CC');

-- AlterTable: Employee - add vehicleEngineCategory and grossingUp
ALTER TABLE "Employee"
  ADD COLUMN IF NOT EXISTS "vehicleEngineCategory" "VehicleEngineCategory" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "grossingUp" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: TransactionCode - add deemedBenefitPercent
ALTER TABLE "TransactionCode"
  ADD COLUMN IF NOT EXISTS "deemedBenefitPercent" DOUBLE PRECISION;
