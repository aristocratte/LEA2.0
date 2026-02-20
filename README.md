# LEA Platform - AI-Powered Pentest Automation

<div align="center">

![LEA Platform](https://img.shields.io/badge/LEA-Platform-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-1.0.0-green?style=for-the-badge)
![License](https://img.shields.io/badge/license-MIT-orange?style=for-the-badge)

**AI-Orchestrated Penetration Testing Platform with Real MCP Kali Linux Integration**

[Features](#features) • [Quick Start](#quick-start) • [Documentation](#documentation) • [Architecture](#architecture)

</div>

---

## Overview

LEA Platform is an enterprise-grade, AI-powered penetration testing automation platform that combines:

- **🤖 Multi-Provider AI Orchestration** - Anthropic Claude, Zhipu AI, OpenAI
- **🔧 Real MCP Kali Integration** - Direct integration with Kali Linux tools via MCP protocol
- **✅ Authentic Preflight Checks** - Real security assessments, not synthetic data
- **🗄️ PostgreSQL Database** - Persistent storage with Docker deployment
- **🐳 Containerized Architecture** - Easy deployment with Docker Compose
- **📊 Comprehensive Reporting** - PDF, Excel, JSON exports with customizable templates

---

## Features

### 🎯 Core Capabilities

- **Automated Pentest Execution**: Full pentest lifecycle from recon to reporting
- **Real Preflight Checks**: DNS, HTTP, port scanning, WAF detection, security headers
- **MCP Tool Integration**: 20+ Kali Linux tools via MCP protocol
- **Provider Selection**: Choose the best AI provider or let the system auto-select
- **Real-time Updates**: SSE streaming for live progress updates
- **Findings Management**: Comprehensive vulnerability tracking with CVSS scoring
- **Report Generation**: Professional pentest reports in multiple formats

### 🔒 Security Tools (via MCP Kali)

**Reconnaissance:**
- Nmap port scanning
- DNS enumeration
- Subdomain discovery
- WHOIS lookups
- Shodan/Censys integration

**Vulnerability Scanning:**
- Nikto web scanning
- Nuclei template-based scanning
- SQLMap SQL injection
- Nessus/OpenVAS integration

**Web Analysis:**
- Wappalyzer tech detection
- Security headers analysis
- WAF detection
- Directory bruteforcing
- Fuzzing with FFUF

### 🤖 AI Provider Support

- **Anthropic Claude** (Sonnet 4.5, Opus 4.5, Haiku)
- **Zhipu AI** (GLM-4, GLM-4 Plus)
- **OpenAI** (GPT-4, GPT-4 Turbo)
- **Custom Providers** (OpenAI-compatible APIs)

---

## Quick Start

### Prerequisites

- Docker Desktop (4GB+ RAM)
- Git
- Code editor (VS Code recommended)

### Installation

```bash
# 1. Navigate to project
cd ~/Documents/LEA

# 2. Start services
docker-compose up -d

# 3. Initialize database
docker-compose exec backend npx prisma migrate deploy

# 4. Access platform
open http://localhost:3000
```

**That's it!** The platform is now running.

### Initial Configuration

1. **Configure AI Providers**
   - Navigate to http://localhost:3000
   - Go to Configuration > Providers
   - Add your API keys

2. **Connect MCP Kali Server**
   - Edit `backend/.env`
   - Set `MCP_KALI_ENDPOINT=http://your-mcp-server:3000`
   - Restart: `docker-compose restart backend`

3. **Run Your First Pentest**
   - Enter target domain/IP
   - Click "Run Preflight"
   - Start pentest execution

---

## Documentation

### Setup & Installation

- **[COMPLETE_QUICKSTART.md](./COMPLETE_QUICKSTART.md)** - Complete installation guide
- **[BACKEND_DOCKER_SETUP.md](./BACKEND_DOCKER_SETUP.md)** - Docker setup details
- **[MCP_INTEGRATION_GUIDE.md](./MCP_INTEGRATION_GUIDE.md)** - MCP Kali integration

### Features & Configuration

- **[PROVIDERS_QUICKSTART.md](./PROVIDERS_QUICKSTART.md)** - AI provider setup
- **[PROVIDERS_IMPLEMENTATION_SUMMARY.md](./PROVIDERS_IMPLEMENTATION_SUMMARY.md)** - Provider architecture
- **[QUICKSTART_REPORTS.md](./QUICKSTART_REPORTS.md)** - Report generation
- **[REPORT_IMPLEMENTATION.md](./REPORT_IMPLEMENTATION.md)** - Report system details

### Scripts & Automation

- **[SCRIPTS_README.md](./SCRIPTS_README.md)** - Utility scripts

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        LEA Platform                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │   Frontend   │    │   Backend    │    │ PostgreSQL   │ │
│  │   (React)    │◀──▶│  (Fastify)   │◀──▶│  Database    │ │
│  │   :3000      │    │    :3001     │    │    :5432     │ │
│  └──────────────┘    └──────┬───────┘    └──────────────┘ │
│                             │                                │
│                             ▼                                │
│                      ┌──────────────┐                        │
│                      │   MCP Kali   │                        │
│                      │   Server     │                        │
│                      │   :3000      │                        │
│                      └──────────────┘                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Components

**Frontend (`lea-ui/`)**
- React 19 + TypeScript
- Tailwind CSS + shadcn/ui
- Real-time SSE streaming
- Pentest management UI

**Backend (`backend/`)**
- Fastify + TypeScript
- Prisma ORM
- MCP client service
- Provider orchestration

**Database**
- PostgreSQL 16
- Prisma schema management
- Automated migrations
- Full-text search

**MCP Integration**
- Kali Linux tools
- Custom MCP server support
- Tool result parsing
- Finding extraction

---

## Project Structure

```
LEA/
├── backend/                    # Backend API
│   ├── src/
│   │   ├── routes/            # API routes
│   │   ├── services/          # Business logic
│   │   │   ├── mcp/          # MCP client
│   │   │   ├── PreflightService.ts
│   │   │   ├── PentestOrchestrator.ts
│   │   │   ├── ProviderManager.ts
│   │   │   └── ReportService.ts
│   │   └── types/            # TypeScript types
│   ├── prisma/               # Database schema
│   ├── Dockerfile
│   └── package.json
│
├── lea-ui/                    # Frontend UI
│   ├── src/
│   │   ├── components/       # React components
│   │   ├── pages/            # Page components
│   │   ├── store/            # State management
│   │   └── lib/              # Utilities
│   ├── Dockerfile
│   └── package.json
│
├── docker/                    # Docker configs
│   └── postgres/
│       └── init/             # DB initialization
│
├── docker-compose.yml         # Service orchestration
├── COMPLETE_QUICKSTART.md
├── BACKEND_DOCKER_SETUP.md
├── MCP_INTEGRATION_GUIDE.md
└── README.md
```

---

## Key Features Deep Dive

### 🚀 Real Preflight Checks

Unlike synthetic preflight systems, LEA Platform performs **actual security assessments**:

```typescript
// Checks performed:
✓ DNS Resolution           - Real DNS queries
✓ HTTP/HTTPS Reachability  - Actual HTTP requests
✓ MCP Server Connectivity  - MCP protocol handshake
✓ Tool Availability        - Tool presence verification
✓ Open Ports Scan          - Nmap port scanning
✓ WAF Detection            - WAF header analysis
✓ Technology Stack         - Wappalyzer integration
✓ Security Headers         - Header security scoring
```

### 🤖 Multi-Provider AI Orchestration

Supports multiple AI providers with automatic failover:

```typescript
// Provider selection strategies:
- Manual Selection           - User chooses provider
- Auto-Selection            - System selects best available
- Priority-based            - Fallback chain
- Load-balancing            - Distribute across providers
```

### 🔧 MCP Kali Linux Integration

Direct integration with Kali tools via MCP protocol:

```typescript
// Tool execution flow:
1. AI Agent selects tool
2. Backend calls MCP service
3. MCP executes tool on Kali
4. Results returned to backend
5. Findings parsed & stored
6. AI analyzes results
7. Next phase initiated
```

### 📊 Comprehensive Reporting

Professional pentest reports with:

- Executive summary
- Detailed findings with CVSS scores
- Timeline and metrics
- Tool execution logs
- Remediation recommendations
- Multiple export formats (PDF, Excel, JSON)

---

## Environment Configuration

### Backend (.env)

```bash
# Database
DATABASE_URL=postgresql://lea_admin:password@localhost:5432/lea_platform

# MCP Configuration
MCP_KALI_ENDPOINT=http://localhost:3000
MCP_TIMEOUT=30000

# Default Provider
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4-5-20250929

# Encryption
ENCRYPTION_KEY=your-base64-encoded-key

# Server
PORT=3001
HOST=0.0.0.0
NODE_ENV=development
LOG_LEVEL=debug
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

---

## Development Workflow

### Starting Development Environment

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Restart specific service
docker-compose restart backend

# Enter container
docker-compose exec backend sh
```

### Database Management

```bash
# Run migrations
docker-compose exec backend npx prisma migrate deploy

# Open Prisma Studio
docker-compose exec backend npx prisma studio

# Reset database (WARNING: deletes data)
docker-compose exec backend npx prisma migrate reset
```

### Building for Production

```bash
# Build production images
docker-compose -f docker-compose.yml build

# Start production
docker-compose up -d

# Check health
curl http://localhost:3001/health
```

---

## API Endpoints

### Pentest Management

```bash
# Create pentest
POST /api/pentests
Body: { target: "example.com", scope: ["*.example.com"] }

# Get pentest status
GET /api/pentests/:id

# Start pentest
POST /api/pentests/:id/start

# Pause/Resume
POST /api/pentests/:id/pause
POST /api/pentests/:id/resume

# Cancel
DELETE /api/pentests/:id
```

### Preflight Checks

```bash
# Run preflight
POST /api/pentests/:id/preflight
Body: { target: "example.com" }

# Get preflight results
GET /api/pentests/:id/preflight
```

### Providers

```bash
# List providers
GET /api/providers

# Add provider
POST /api/providers
Body: { name: "anthropic", apiKey: "sk-ant-xxx" }

# Test provider
POST /api/providers/:id/test

# Set default
PUT /api/providers/:id/default
```

### Reports

```bash
# List reports
GET /api/reports

# Get report
GET /api/reports/:id

# Export report
POST /api/reports/:id/export
Body: { format: "pdf" }
```

---

## Troubleshooting

### Common Issues

**PostgreSQL connection failed**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Restart PostgreSQL
docker-compose restart postgres

# Check logs
docker-compose logs postgres
```

**Backend API not responding**
```bash
# Check logs
docker-compose logs backend

# Restart backend
docker-compose restart backend

# Verify environment
docker-compose exec backend env | grep DATABASE_URL
```

**MCP connection failed**
```bash
# Test MCP endpoint
curl http://localhost:3000/health

# Check backend logs
docker-compose logs backend | grep -i mcp

# Verify configuration
docker-compose exec backend cat .env | grep MCP
```

### Reset Everything

```bash
# Stop all services
docker-compose down

# Remove volumes (WARNING: deletes data)
docker-compose down -v

# Rebuild and start
docker-compose up -d --build

# Reinitialize database
docker-compose exec backend npx prisma migrate deploy
```

---

## Security Best Practices

1. **Change Default Passwords**
   ```bash
   # Generate secure password
   openssl rand -base64 24
   ```

2. **Generate Secure Encryption Key**
   ```bash
   openssl rand -base64 32
   ```

3. **Enable CORS Protection**
   ```bash
   CORS_ORIGIN=https://your-domain.com
   ```

4. **Set Up Firewall Rules**
   ```bash
   # Only expose necessary ports
   # 3000: Frontend (public)
   # 3001: Backend (internal)
   # 5432: PostgreSQL (internal only)
   ```

5. **Regular Backups**
   ```bash
   # Automated backup script
   ./scripts/backup-db.sh
   ```

---

## Performance Tuning

### PostgreSQL

```yaml
# docker-compose.yml
postgres:
  command: >
    postgres
    -c shared_buffers=256MB
    -c effective_cache_size=1GB
    -c max_connections=200
```

### Backend

```yaml
backend:
  environment:
    NODE_OPTIONS: "--max-old-space-size=2048"
    MAX_CONCURRENT_PENTESTS: "5"
    TOOL_EXECUTION_TIMEOUT: "120000"
```

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

## License

MIT License - See LICENSE file for details

---

## Roadmap

### v1.1 (Upcoming)
- [ ] Additional MCP tools
- [ ] Custom tool templates
- [ ] Advanced scheduling
- [ ] Team collaboration features

### v1.2 (Planned)
- [ ] Multi-tenant support
- [ ] API authentication
- [ ] Advanced analytics
- [ ] CI/CD integration

### v2.0 (Future)
- [ ] Distributed execution
- [ ] Cloud deployment
- [ ] Mobile app
- [ ] Plugin system

---

## Support

For issues and questions:

1. Check documentation in `/doc`
2. Review troubleshooting sections
3. Check logs: `docker-compose logs -f`
4. Review GitHub issues

---

## Acknowledgments

- **Anthropic** - Claude AI models
- **Zhipu AI** - GLM models
- **MCP Protocol** - Model Context Protocol
- **Kali Linux** - Penetration testing tools
- **Prisma** - Database ORM
- **Fastify** - Web framework

---

<div align="center">

**Built with ❤️ for the security community**

[⬆ Back to Top](#lea-platform---ai-powered-pentest-automation)

</div>
