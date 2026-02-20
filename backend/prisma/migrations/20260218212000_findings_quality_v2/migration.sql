-- CreateEnum
CREATE TYPE "FindingVerificationState" AS ENUM ('PROVISIONAL', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "FindingSourceSignalType" AS ENUM ('TOOL_RESULT', 'PENTESTER_REPORTED');

-- AlterTable
ALTER TABLE "pentests"
  ADD COLUMN "failure_code" TEXT,
  ADD COLUMN "failure_reason" TEXT,
  ADD COLUMN "finalization_started_at" TIMESTAMP(3),
  ADD COLUMN "findings_locked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "findings"
  ADD COLUMN "source_signal_type" "FindingSourceSignalType",
  ADD COLUMN "verification_state" "FindingVerificationState" NOT NULL DEFAULT 'PROVISIONAL',
  ADD COLUMN "proposed_severity" "Severity",
  ADD COLUMN "evidence_score" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reason_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "findings_verification_state_idx" ON "findings"("verification_state");
