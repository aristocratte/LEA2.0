# LEA Platform - Complete Quick Start Guide

## Overview

LEA Platform is an AI-powered pentest automation platform that combines:
- **AI Orchestration**: Multiple AI providers (Anthropic, Zhipu, OpenAI)
- **MCP Integration**: Direct integration with Kali Linux tools via MCP protocol
- **Real Preflight Checks**: Actual security assessments before pentest
- **PostgreSQL Database**: Persistent storage for all pentest data
- **Docker Deployment**: Easy containerized setup

## System Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                        LEA Platform                           │
├───────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │   Frontend   │    │   Backend    │    │ PostgreSQL   │  │
│  │   (React)    │◀──▶│  (Fastify)   │◀──▶│  Database    │  │
│  │   :3000      │    │    :3001     │    │    :5432     │  │
│  └──────────────┘    └──────┬───────┘    └──────────────┘  │
│                             │                                 │
│                             ▼                                 │
│                      ┌──────────────┐                        │
│                      │   MCP Kali   │                        │
│                      │   Server     │                        │
│                      │   :3000      │                        │
│                      └──────────────┘                        │
└───────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Software

1. **Docker Desktop** (https://www.docker.com/products/docker-desktop/)
   - Minimum 4GB RAM allocated
   - At least 10GB disk space

2. **Git** (for cloning)

3. **Code Editor** (VS Code recommended)

### System Requirements

- **OS**: macOS, Linux, or Windows with WSL2
- **RAM**: 8GB+ recommended
- **Disk**: 20GB+ free space
- **Network**: Internet connection for AI providers

## Installation Steps

### Step 1: Clone Repository

```bash
# Navigate to your workspace
cd ~/Documents/LEA

# Verify structure
ls -la
# You should see: backend/, lea-ui/, docker-compose.yml, etc.
```

### Step 2: Configure Environment

```bash
# Create environment file
cat > backend/.env << 'EOF'
# Database
DATABASE_URL=postgresql://lea_admin:your_secure_password_here@localhost:5432/lea_platform

# MCP Configuration
MCP_KALI_ENDPOINT=http://localhost:3000
MCP_TIMEOUT=30000

# Default Provider
DEFAULT_PROVIDER=anthic
DEFAULT_MODEL=claude-sonnet-4-5-20250929

# Encryption (generate with: openssl rand -base64 32)
ENCRYPTION_KEY=dGVzdGtleWZvcmRldmVsb3BtZW50b25seQ==

# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug
EOF
```

### Step 3: Start Docker Services

```bash
# Start all services
docker-compose up -d

# Verify services are running
docker-compose ps
```

Expected output:
```
NAME                IMAGE              STATUS
lea-postgres        postgres:16        Up
lea-backend         node:20            Up
lea-frontend        nginx:alpine       Up
lea-pgadmin         dpage/pgadmin4     Up
```

### Step 4: Initialize Database

```bash
# Wait for PostgreSQL to be ready (10 seconds)
sleep 10

# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Verify database is ready
docker-compose exec backend npx prisma db pull
```

### Step 5: Access the Platform

Open your browser:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **PgAdmin** (database UI): http://localhost:5050

## Initial Configuration

### 1. Configure AI Providers

Navigate to **Configuration > Providers** in the UI and add your API keys:

**Anthropic Claude:**
```bash
API Key: sk-ant-xxxxx
Base URL: https://api.anthropic.com
```

**Zhipu AI:**
```bash
API Key: your-zhipu-api-key
Base URL: https://open.bigmodel.cn/api/paas/v4
```

**OpenAI:**
```bash
API Key: sk-proj-xxxxx
Base URL: https://api.openai.com/v1
```

### 2. Configure MCP Kali Linux

#### Option A: Use External MCP Server

If you have an MCP Kali server running:

```bash
# Update backend/.env
MCP_KALI_ENDPOINT=http://your-mcp-server:3000

# Restart backend
docker-compose restart backend
```

#### Option B: Run MCP in Docker

Uncomment the MCP service in `docker-compose.yml`:

```yaml
mcp-kali:
  image: your-mcp-kali-image
  container_name: lea-mcp-kali
  ports:
    - "3000:3000"
  networks:
    - lea-network
```

Then restart:

```bash
docker-compose up -d
```

### 3. Test Preflight Checks

Create a new pentest session:

```bash
# Via API
curl -X POST http://localhost:3001/api/pentests \
  -H "Content-Type: application/json" \
  -d '{
    "target": "example.com",
    "scope": ["example.com", "*.example.com"]
  }'
```

Or use the UI at http://localhost:3000

## Usage Guide

### Starting a Pentest

1. **Navigate to Configuration Screen**
   - Enter target domain/IP
   - Define scope (optional)
   - Select AI provider (optional)

2. **Run Preflight Checks**
   - DNS resolution
   - HTTP/HTTPS availability
   - MCP server connectivity
   - Tool availability
   - Port scanning
   - WAF detection
   - Technology stack detection
   - Security headers check

3. **Start Pentest**
   - Passive reconnaissance
   - Active reconnaissance
   - Vulnerability scanning
   - Analysis & reporting

### Monitoring Progress

The platform provides real-time updates:
- **Phase status**: Current pentest phase
- **Tool executions**: Tools being run
- **Findings**: Vulnerabilities discovered
- **Todos**: Action items for the AI

### Viewing Reports

Navigate to **Reports** to see:
- Executive summary
- All findings with severity
- Tools used
- Timeline and metrics

## MCP Tools Integration

### Available Tools

**Reconnaissance:**
- `nmap_scan` - Port scanning
- `dns_enum` - DNS enumeration
- `subdomain_search` - Subdomain discovery
- `whois_lookup` - Domain information

**Vulnerability Scanning:**
- `nikto_scan` - Web server scanning
- `nuclei_scan` - Template-based scanning
- `sqlmap_scan` - SQL injection detection

**Web Analysis:**
- `wappalyzer` - Technology detection
- `security_headers` - Headers analysis
- `waf_detect` - WAF detection

### Tool Execution Flow

```
1. AI Agent selects tool based on phase
2. Backend calls MCP service
3. MCP executes tool on Kali Linux
4. Results returned to backend
5. Findings parsed and stored
6. AI analyzes results
7. Next tool/phase initiated
```

## Database Schema Overview

### Core Tables

**Pentest:**
- `id` - UUID
- `target` - Target domain/IP
- `status` - Current status
- `phase` - Current phase
- `config` - Configuration JSON
- `created_at` - Timestamp

**Finding:**
- `id` - UUID
- `pentest_id` - FK to Pentest
- `severity` - CRITICAL/HIGH/MEDIUM/LOW/INFO
- `title` - Vulnerability title
- `description` - Details
- `tool_used` - Tool that found it

**ToolExecution:**
- `id` - UUID
- `pentest_id` - FK to Pentest
- `tool_name` - Tool name
- `status` - Execution status
- `output` - Tool output
- `duration_ms` - Execution time

**Provider:**
- `id` - UUID
- `name` - Provider name
- `api_key_encrypted` - Encrypted API key
- `enabled` - Active status

## Troubleshooting

### Common Issues

#### 1. PostgreSQL Connection Failed

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Restart if needed
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

#### 2. Backend API Not Responding

```bash
# Check backend logs
docker-compose logs backend

# Restart backend
docker-compose restart backend

# Verify DATABASE_URL
docker-compose exec backend env | grep DATABASE_URL
```

#### 3. MCP Connection Failed

```bash
# Test MCP endpoint
curl http://localhost:3000/health

# Check backend logs for MCP errors
docker-compose logs backend | grep -i mcp

# Verify MCP configuration
docker-compose exec backend cat .env | grep MCP
```

#### 4. Preflight Checks Failing

```bash
# Check DNS resolution
nslookup example.com

# Test HTTP connectivity
curl -I http://example.com

# Verify MCP tools available
docker-compose exec backend node -e "
const { McpService } = require('./dist/services/mcp/McpService.js');
const mcp = new McpService({ command: 'mcp-server' });
mcp.connect().then(() => {
  console.log('Tools:', mcp.getAvailableTools());
  mcp.disconnect();
});
"
```

### Reset Everything

```bash
# Stop all services
docker-compose down

# Remove volumes (WARNING: deletes all data)
docker-compose down -v

# Rebuild and start
docker-compose up -d --build

# Reinitialize database
docker-compose exec backend npx prisma migrate deploy
```

## Advanced Configuration

### Custom Pentest Phases

Edit `backend/src/services/PentestOrchestrator.ts`:

```typescript
const phases: PentestPhase[] = [
  {
    name: 'Custom Phase',
    status: 'pending',
    tools: ['custom_tool_1', 'custom_tool_2']
  }
];
```

### Add New MCP Tools

1. Add tool to MCP Kali server
2. Register in `backend/src/services/mcp/McpService.ts`
3. Add to pentest phase in `PentestOrchestrator.ts`
4. Implement parser for findings

### Customize Database Schema

```bash
# Modify prisma/schema.prisma
nano backend/prisma/schema.prisma

# Create migration
docker-compose exec backend npx prisma migrate dev --name custom_changes

# Apply migration
docker-compose exec backend npx prisma migrate deploy
```

## Performance Tuning

### PostgreSQL

```yaml
# In docker-compose.yml
postgres:
  command: >
    postgres
    -c shared_buffers=256MB
    -c effective_cache_size=1GB
    -c work_mem=16MB
    -c maintenance_work_mem=128MB
```

### Backend

```yaml
backend:
  environment:
    NODE_OPTIONS: "--max-old-space-size=2048"
    MAX_CONCURRENT_PENTESTS: "5"
    TOOL_EXECUTION_TIMEOUT: "120000"
```

## Security Best Practices

1. **Change Default Passwords**
   ```bash
   # Generate secure password
   openssl rand -base64 24

   # Update docker-compose.yml
   POSTGRES_PASSWORD: your_secure_password
   ```

2. **Generate Secure Encryption Key**
   ```bash
   openssl rand -base64 32

   # Update backend/.env
   ENCRYPTION_KEY=your_key_here
   ```

3. **Enable CORS Protection**
   ```bash
   # backend/.env
   CORS_ORIGIN=https://your-domain.com
   ```

4. **Set Up Firewall Rules**
   ```bash
   # Only expose necessary ports
   # 3000: Frontend (public)
   # 3001: Backend (internal)
   # 5432: PostgreSQL (internal only)
   ```

## Backup and Restore

### Backup

```bash
# Database backup
docker-compose exec postgres pg_dump -U lea_admin lea_platform > backup.sql

# Volume backup
docker run --rm -v lea-postgres-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/lea-db-$(date +%Y%m%d).tar.gz -C /data .
```

### Restore

```bash
# From SQL dump
docker-compose exec -T postgres psql -U lea_admin lea_platform < backup.sql

# From volume backup
docker run --rm -v lea-postgres-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/lea-db-20240216.tar.gz -C /data
```

## Next Steps

1. ✅ Complete initial setup
2. ✅ Configure AI providers
3. ✅ Set up MCP Kali integration
4. ✅ Run first pentest
5. ✅ Review preflight checks
6. ✅ Customize pentest phases
7. ✅ Set up monitoring
8. ✅ Configure backups

## Additional Documentation

- `BACKEND_DOCKER_SETUP.md` - Detailed Docker setup
- `PROVIDERS_QUICKSTART.md` - Provider configuration
- `PROVIDERS_IMPLEMENTATION_SUMMARY.md` - Provider architecture
- `REPORT_IMPLEMENTATION.md` - Report generation
- `QUICKSTART_REPORTS.md` - Export functionality

## Support and Contributing

For issues:
1. Check logs: `docker-compose logs -f`
2. Review troubleshooting section
3. Check database: `docker-compose exec postgres psql -U lea_admin -d lea_platform`
4. Verify MCP connectivity

## License

MIT License - See LICENSE file for details
