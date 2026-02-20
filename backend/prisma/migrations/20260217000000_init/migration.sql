-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PentestStatus" AS ENUM ('CONFIGURING', 'PREFLIGHT', 'RUNNING', 'PAUSED', 'COMPLETED', 'CANCELLED', 'ERROR');

-- CreateEnum
CREATE TYPE "PentestPhase" AS ENUM ('INIT', 'PREFLIGHT', 'RECON_PASSIVE', 'RECON_ACTIVE', 'VULN_SCAN', 'EXPLOITATION', 'POST_EXPLOIT', 'REPORTING', 'COMPLETE');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'CONFIRMED', 'FALSE_POSITIVE', 'FIXED', 'RISK_ACCEPTED');

-- CreateEnum
CREATE TYPE "TodoStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('USER', 'ASSISTANT', 'THINKING', 'SYSTEM');

-- CreateEnum
CREATE TYPE "ToolStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMEOUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('DRAFT', 'COMPLETE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ExportFormat" AS ENUM ('PDF', 'HTML', 'JSON', 'DOCX');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ProviderType" AS ENUM ('ANTHROPIC', 'ZHIPU', 'OPENAI', 'CUSTOM');

-- CreateEnum
CREATE TYPE "HealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "McpTransport" AS ENUM ('STDIO', 'HTTP', 'WEBSOCKET');

-- CreateTable
CREATE TABLE "pentests" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "scope" JSONB,
    "config" JSONB,
    "status" "PentestStatus" NOT NULL DEFAULT 'CONFIGURING',
    "phase" "PentestPhase" NOT NULL DEFAULT 'INIT',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "pentests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "report_id" TEXT,
    "title" TEXT NOT NULL,
    "severity" "Severity" NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT,
    "impact" TEXT,
    "remediation" TEXT,
    "cvss_score" DOUBLE PRECISION,
    "cvss_vector" TEXT,
    "cve_id" TEXT,
    "cwe_id" TEXT,
    "target_host" TEXT,
    "endpoint" TEXT,
    "port" INTEGER,
    "protocol" TEXT,
    "phase_name" TEXT,
    "tool_used" TEXT,
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "false_positive" BOOLEAN NOT NULL DEFAULT false,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todos" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "TodoStatus" NOT NULL DEFAULT 'PENDING',
    "agent_role" TEXT,
    "depends_on" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "todos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "type" "MessageType" NOT NULL,
    "content" TEXT NOT NULL,
    "agent_role" TEXT,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tool_executions" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "status" "ToolStatus" NOT NULL DEFAULT 'PENDING',
    "output" TEXT,
    "error" TEXT,
    "exit_code" INTEGER,
    "duration_ms" INTEGER,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "agent_role" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tool_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pentest_events" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_data" JSONB NOT NULL,
    "sequence" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pentest_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "pentest_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "executive_summary" TEXT,
    "methodology" TEXT,
    "scope_description" TEXT,
    "status" "ReportStatus" NOT NULL DEFAULT 'DRAFT',
    "stats" JSONB,
    "template" TEXT NOT NULL DEFAULT 'standard',
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "format" "ExportFormat" NOT NULL,
    "options" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "file_path" TEXT,
    "file_size" INTEGER,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "type" "ProviderType" NOT NULL,
    "api_key_encrypted" TEXT,
    "api_key_iv" TEXT,
    "api_key_hash" TEXT,
    "api_key_auth_tag" TEXT,
    "base_url" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "health_status" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "last_health_check" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "transport" "McpTransport" NOT NULL,
    "endpoint" TEXT,
    "command" TEXT,
    "args" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "health" "HealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "last_ping" TIMESTAMP(3),
    "tools" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mcp_servers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_configs" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "context_window" INTEGER NOT NULL,
    "max_output_tokens" INTEGER NOT NULL,
    "supports_streaming" BOOLEAN NOT NULL DEFAULT true,
    "supports_vision" BOOLEAN NOT NULL DEFAULT false,
    "supports_tools" BOOLEAN NOT NULL DEFAULT true,
    "input_price_per_1k" DOUBLE PRECISION NOT NULL,
    "output_price_per_1k" DOUBLE PRECISION NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "last_used_at" TIMESTAMP(3),

    CONSTRAINT "model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tokens_input" INTEGER NOT NULL DEFAULT 0,
    "tokens_output" INTEGER NOT NULL DEFAULT 0,
    "requests_count" INTEGER NOT NULL DEFAULT 0,
    "cost_estimate_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate_limit_remaining" INTEGER,
    "rate_limit_reset" TIMESTAMP(3),

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pentests_status_idx" ON "pentests"("status");

-- CreateIndex
CREATE INDEX "pentests_target_idx" ON "pentests"("target");

-- CreateIndex
CREATE INDEX "pentests_created_at_idx" ON "pentests"("created_at");

-- CreateIndex
CREATE INDEX "findings_pentest_id_idx" ON "findings"("pentest_id");

-- CreateIndex
CREATE INDEX "findings_report_id_idx" ON "findings"("report_id");

-- CreateIndex
CREATE INDEX "findings_severity_idx" ON "findings"("severity");

-- CreateIndex
CREATE INDEX "findings_category_idx" ON "findings"("category");

-- CreateIndex
CREATE INDEX "todos_pentest_id_idx" ON "todos"("pentest_id");

-- CreateIndex
CREATE INDEX "todos_status_idx" ON "todos"("status");

-- CreateIndex
CREATE INDEX "messages_pentest_id_idx" ON "messages"("pentest_id");

-- CreateIndex
CREATE INDEX "messages_sequence_idx" ON "messages"("sequence");

-- CreateIndex
CREATE UNIQUE INDEX "messages_pentest_id_sequence_key" ON "messages"("pentest_id", "sequence");

-- CreateIndex
CREATE INDEX "tool_executions_pentest_id_idx" ON "tool_executions"("pentest_id");

-- CreateIndex
CREATE INDEX "tool_executions_tool_name_idx" ON "tool_executions"("tool_name");

-- CreateIndex
CREATE INDEX "tool_executions_status_idx" ON "tool_executions"("status");

-- CreateIndex
CREATE INDEX "pentest_events_pentest_id_idx" ON "pentest_events"("pentest_id");

-- CreateIndex
CREATE INDEX "pentest_events_event_type_idx" ON "pentest_events"("event_type");

-- CreateIndex
CREATE UNIQUE INDEX "pentest_events_pentest_id_sequence_key" ON "pentest_events"("pentest_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "reports_pentest_id_key" ON "reports"("pentest_id");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "export_jobs_reportId_idx" ON "export_jobs"("reportId");

-- CreateIndex
CREATE INDEX "export_jobs_status_idx" ON "export_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "providers_name_key" ON "providers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_servers_name_key" ON "mcp_servers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "model_configs_provider_id_model_id_key" ON "model_configs"("provider_id", "model_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_usage_provider_id_date_key" ON "provider_usage"("provider_id", "date");

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_pentest_id_fkey" FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todos" ADD CONSTRAINT "todos_pentest_id_fkey" FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_pentest_id_fkey" FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tool_executions" ADD CONSTRAINT "tool_executions_pentest_id_fkey" FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pentest_events" ADD CONSTRAINT "pentest_events_pentest_id_fkey" FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_pentest_id_fkey" FOREIGN KEY ("pentest_id") REFERENCES "pentests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_configs" ADD CONSTRAINT "model_configs_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

