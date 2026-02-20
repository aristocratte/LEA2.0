#!/bin/bash
# ============================================
# LEA Platform - PostgreSQL Initialization
# ============================================

set -e

echo "================================"
echo "LEA Platform - Database Setup"
echo "================================"

# Create extensions
echo "Creating extensions..."
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Enable required extensions
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";
    CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

    -- Create indexes for performance
    -- (These will also be created by Prisma, but we add some extras)

    -- Full-text search index for findings
    CREATE INDEX IF NOT EXISTS idx_findings_fts ON findings USING gin(to_tsvector('english', title || ' ' || description));

    -- Index for tool executions by date
    CREATE INDEX IF NOT EXISTS idx_tool_executions_created ON tool_executions(created_at DESC);

    -- Index for messages by sequence and pentest
    CREATE INDEX IF NOT EXISTS idx_messages_pentest_sequence ON messages(pentest_id, sequence DESC);

    -- Composite index for pentest queries
    CREATE INDEX IF NOT EXISTS idx_pentests_status_created ON pentests(status, created_at DESC);

    -- Index for provider health checks
    CREATE INDEX IF NOT EXISTS idx_providers_health ON providers(health_status, enabled);

    -- Index for export jobs
    CREATE INDEX IF NOT EXISTS idx_export_jobs_status_created ON export_jobs(status, created_at DESC);

    -- Update timestamp function
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
    END;
    $$ language 'plpgsql';
EOSQL

echo "Database initialization completed successfully!"
echo "================================"
