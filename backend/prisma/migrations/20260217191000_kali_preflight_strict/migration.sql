-- CreateEnum
CREATE TYPE "PreflightState" AS ENUM ('NOT_RUN', 'RUNNING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "KaliAuditStatus" AS ENUM ('SUCCESS', 'FAILED', 'BLOCKED');

-- AlterTable
ALTER TABLE "pentests"
  ADD COLUMN "preflight_state" "PreflightState" NOT NULL DEFAULT 'NOT_RUN',
  ADD COLUMN "preflight_summary" JSONB,
  ADD COLUMN "kali_workspace" TEXT;

-- CreateTable
CREATE TABLE "kali_audit_logs" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "command" TEXT,
    "arguments" JSONB,
    "cwd" TEXT,
    "status" "KaliAuditStatus" NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "exit_code" INTEGER,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kali_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kali_audit_logs_pentest_id_idx" ON "kali_audit_logs"("pentest_id");

-- CreateIndex
CREATE INDEX "kali_audit_logs_created_at_idx" ON "kali_audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "kali_audit_logs" ADD CONSTRAINT "kali_audit_logs_pentest_id_fkey"
  FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
