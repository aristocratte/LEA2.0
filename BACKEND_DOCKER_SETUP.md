# LEA Platform - Backend Docker Setup

## Overview

This document explains how to set up and run the LEA Platform backend using Docker with PostgreSQL database.

## Prerequisites

- Docker Desktop installed (https://www.docker.com/products/docker-desktop/)
- At least 4GB RAM available for Docker
- Basic understanding of Docker commands

## Quick Start

### 1. Clone and Navigate

```bash
cd /path/to/LEA
```

### 2. Configure Environment

```bash
# Copy environment template
cp backend/.env.development backend/.env

# Edit with your settings
nano backend/.env
```

### 3. Start Services

```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps
```

### 4. Initialize Database

```bash
# Run database migrations
docker-compose exec backend npx prisma migrate deploy

# (Optional) Seed database
docker-compose exec backend npx prisma db seed
```

### 5. Access Services

- **Backend API**: http://localhost:3001
- **Frontend**: http://localhost:3000
- **PgAdmin**: http://localhost:5050 (User: `admin@lea.local`, Pass: `admin`)
- **PostgreSQL**: `localhost:5432`

## Architecture

```
┌─────────────────────────────────────────────────┐
│                   Docker Network                 │
│                                                 │
│  ┌──────────────┐    ┌──────────────┐          │
│  │   Frontend   │    │   Backend    │          │
│  │   (nginx)    │───▶│  (Fastify)   │          │
│  │   :3000      │    │    :3001     │          │
│  └──────────────┘    └──────┬───────┘          │
│                              │                  │
│                              ▼                  │
│                      ┌──────────────┐          │
│                      │  PostgreSQL  │          │
│                      │    :5432     │          │
│                      └──────────────┘          │
│                              │                  │
│                              ▼                  │
│                       ┌──────────┐             │
│                       │ PgAdmin  │             │
│                       │  :5050   │             │
│                       └──────────┘             │
└─────────────────────────────────────────────────┘
```

## Docker Services

### PostgreSQL

```yaml
- Image: postgres:16-alpine
- Port: 5432
- User: lea_admin
- Password: (set in docker-compose.yml)
- Database: lea_platform
```

**Connection String:**
```
postgresql://lea_admin:password@localhost:5432/lea_platform
```

### Backend

```yaml
- Image: node:20-alpine
- Port: 3001
- Type: API server
```

**Environment Variables:**
- `DATABASE_URL`: PostgreSQL connection string
- `MCP_KALI_ENDPOINT`: MCP Kali Linux server URL
- `ENCRYPTION_KEY`: For encrypting API keys
- `DEFAULT_PROVIDER`: Default AI provider

### Frontend

```yaml
- Image: nginx:alpine
- Port: 3000
- Type: Static file serving
```

### PgAdmin (Optional)

```yaml
- Port: 5050
- User: admin@lea.local
- Password: admin
```

## MCP Kali Linux Integration

### What is MCP?

MCP (Model Context Protocol) is a protocol for connecting AI systems to external tools and data sources.

### Integration Options

#### Option 1: External MCP Server

If you have an existing MCP Kali Linux server running:

```env
# backend/.env
MCP_KALI_ENDPOINT=http://your-kali-server:3000
```

#### Option 2: Docker MCP Service

Uncomment the `mcp-kali` service in `docker-compose.yml`:

```yaml
mcp-kali:
  image: your-mcp-kali-image
  container_name: lea-mcp-kali
  ports:
    - "3000:3000"
  networks:
    - lea-network
```

### MCP Tools

The platform integrates with these Kali Linux tools via MCP:

**Reconnaissance:**
- nmap_scan
- dns_enum
- subdomain_search
- whois_lookup

**Vulnerability Scanning:**
- nikto_scan
- nuclei_scan
- sqlmap_scan

**Web Tools:**
- wappalyzer
- security_headers
- waf_detect

## Database Schema

The database uses Prisma ORM with the following main models:

- **Pentest**: Main pentest sessions
- **Finding**: Vulnerabilities discovered
- **Todo**: Tasks and action items
- **Message**: Chat/AI messages
- **ToolExecution**: Tool execution records
- **Report**: Generated reports
- **Provider**: AI provider configurations
- **McpServer**: MCP server configurations

See `backend/prisma/schema.prisma` for full schema.

## Development Workflow

### Running in Development Mode

```bash
# Start with hot reload
docker-compose up --build

# View logs
docker-compose logs -f backend

# Enter backend container
docker-compose exec backend sh

# Run TypeScript in watch mode
docker-compose exec backend npm run dev
```

### Database Management

```bash
# View database logs
docker-compose logs postgres

# Connect to PostgreSQL
docker-compose exec postgres psql -U lea_admin -d lea_platform

# Run Prisma Studio
docker-compose exec backend npx prisma studio

# Create migration
docker-compose exec backend npx prisma migrate dev --name my_migration

# Reset database (WARNING: deletes all data)
docker-compose exec backend npx prisma migrate reset
```

### MCP Service Testing

```bash
# Test MCP connection
docker-compose exec backend node -e "
import { McpService } from './dist/services/mcp/McpService.js';
const mcp = new McpService({ command: 'mcp-server-command' });
await mcp.connect();
const tools = mcp.getAvailableTools();
console.log('Available tools:', tools);
await mcp.disconnect();
"
```

## Production Deployment

### 1. Update Environment

```bash
cp backend/.env.production backend/.env

# Edit production values
nano backend/.env
```

### 2. Secure Configuration

**Generate encryption key:**
```bash
openssl rand -base64 32
```

**Set strong password:**
```bash
# Generate random password
openssl rand -base64 24
```

**Update docker-compose.yml:**
```yaml
environment:
  POSTGRES_PASSWORD: your_secure_password_here
  DATABASE_URL: postgresql://lea_admin:your_secure_password@postgres:5432/lea_platform
  ENCRYPTION_KEY: your_base64_encoded_key
```

### 3. Build and Deploy

```bash
# Build production images
docker-compose -f docker-compose.yml build

# Start in production mode
docker-compose up -d

# Check health
curl http://localhost:3001/health
```

### 4. Database Setup

```bash
# Run migrations
docker-compose exec backend npx prisma migrate deploy

# (Optional) Create admin user
docker-compose exec backend npx prisma db seed
```

## Troubleshooting

### PostgreSQL Connection Issues

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Backend Not Starting

```bash
# Check logs
docker-compose logs backend

# Common issues:
# - DATABASE_URL incorrect
# - Port 3001 already in use
# - Node modules missing (rebuild)
```

### MCP Connection Failed

```bash
# Verify MCP server is accessible
curl http://localhost:3000/health

# Check backend logs
docker-compose logs backend | grep MCP

# Test MCP endpoint
docker-compose exec backend curl -v http://mcp-kali:3000
```

### Database Migrations Fail

```bash
# Reset database (WARNING: deletes data)
docker-compose exec backend npx prisma migrate reset

# Or manually drop and recreate
docker-compose exec postgres psql -U lea_admin -c "DROP DATABASE IF EXISTS lea_platform;"
docker-compose exec postgres psql -U lea_admin -c "CREATE DATABASE lea_platform;"
```

### Volume Issues

```bash
# List volumes
docker volume ls

# Remove volumes (WARNING: deletes data)
docker-compose down -v

# Rebuild from scratch
docker-compose up -d --force-recreate
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
    -c max_connections=200
```

### Backend

```yaml
backend:
  environment:
    NODE_OPTIONS: "--max-old-space-size=2048"
```

### Docker Resources

In Docker Desktop:
- Settings > Resources > Memory: 4GB+
- Settings > Resources > CPUs: 2+

## Backup and Restore

### Backup Database

```bash
# Dump database
docker-compose exec postgres pg_dump -U lea_admin lea_platform > backup.sql

# Backup with Docker volume
docker run --rm -v lea-postgres-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/lea-db-backup.tar.gz -C /data .
```

### Restore Database

```bash
# Restore from dump
docker-compose exec -T postgres psql -U lea_admin lea_platform < backup.sql

# Restore from volume backup
docker run --rm -v lea-postgres-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/lea-db-backup.tar.gz -C /data
```

## Monitoring

### Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f backend

# Last 100 lines
docker-compose logs --tail=100 backend
```

### Metrics

The backend exposes health metrics at `/health`:

```bash
curl http://localhost:3001/health
```

### Database Stats

```bash
# Connect and run queries
docker-compose exec postgres psql -U lea_admin -d lea_platform

LEA_PLATFORM=# SELECT COUNT(*) FROM pentests;
LEA_PLATFORM=# SELECT status, COUNT(*) FROM findings GROUP BY status;
```

## Security Checklist

- [ ] Change default PostgreSQL password
- [ ] Generate secure ENCRYPTION_KEY
- [ ] Set up CORS_ORIGIN for production
- [ ] Enable SSL/TLS for backend
- [ ] Configure firewall rules
- [ ] Set up database backups
- [ ] Enable log aggregation
- [ ] Configure rate limiting
- [ ] Review API key storage (encrypted)
- [ ] Set up monitoring and alerts

## Next Steps

1. Configure your AI providers (see `PROVIDERS_QUICKSTART.md`)
2. Set up MCP Kali Linux integration
3. Review preflight checks configuration
4. Customize pentest phases
5. Set up report templates

## Support

For issues and questions:
- Check logs: `docker-compose logs`
- Review documentation in `/doc`
- Check GitHub issues (if applicable)
