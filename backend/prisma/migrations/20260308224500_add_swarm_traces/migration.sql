-- CreateTable
CREATE TABLE "swarm_traces" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "runtime_mode" TEXT NOT NULL,
    "scenario_id" TEXT,
    "source_trace_id" TEXT,
    "status" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "event_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "validation_path" TEXT,
    "correlation_path" TEXT,
    "projection_path" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "swarm_traces_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "swarm_traces_pentest_id_idx" ON "swarm_traces"("pentest_id");

-- CreateIndex
CREATE INDEX "swarm_traces_runtime_mode_idx" ON "swarm_traces"("runtime_mode");

-- CreateIndex
CREATE INDEX "swarm_traces_created_at_idx" ON "swarm_traces"("created_at");

-- AddForeignKey
ALTER TABLE "swarm_traces" ADD CONSTRAINT "swarm_traces_pentest_id_fkey"
  FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
