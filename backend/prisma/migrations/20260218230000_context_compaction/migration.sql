-- CreateEnum
CREATE TYPE "ContextSnapshotTrigger" AS ENUM ('PHASE_END', 'URGENT', 'ERROR_RECOVERY', 'MANUAL');

-- CreateTable
CREATE TABLE "context_snapshots" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "trigger" "ContextSnapshotTrigger" NOT NULL,
    "phase_from" TEXT,
    "phase_to" TEXT,
    "summary_markdown" TEXT NOT NULL,
    "summary_json" JSONB NOT NULL,
    "workspace_file" TEXT,
    "archived_until_message_seq" INTEGER,
    "archived_until_tool_ts" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "context_recall_logs" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "results_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "context_recall_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "context_snapshots_pentest_id_idx" ON "context_snapshots"("pentest_id");

-- CreateIndex
CREATE INDEX "context_snapshots_created_at_idx" ON "context_snapshots"("created_at");

-- CreateIndex
CREATE INDEX "context_recall_logs_pentest_id_idx" ON "context_recall_logs"("pentest_id");

-- CreateIndex
CREATE INDEX "context_recall_logs_created_at_idx" ON "context_recall_logs"("created_at");

-- AddForeignKey
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_pentest_id_fkey"
  FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "context_recall_logs" ADD CONSTRAINT "context_recall_logs_pentest_id_fkey"
  FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
