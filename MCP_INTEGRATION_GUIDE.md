# LEA Platform - MCP Integration Guide

## Overview

This guide explains how to integrate the LEA Platform with your existing MCP (Model Context Protocol) Kali Linux server.

## What is MCP?

MCP (Model Context Protocol) is a standardized protocol for connecting AI systems to external tools, data sources, and services. LEA Platform uses MCP to communicate with Kali Linux penetration testing tools.

## Architecture

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   LEA UI     │────────▶│  LEA Backend │────────▶│  MCP Kali    │
│  (React)     │◀────────│  (Fastify)   │◀────────│   Server     │
└──────────────┘         └──────────────┘         └──────────────┘
                              │
                              ▼
                        ┌──────────────┐
                        │ PostgreSQL   │
                        │  Database    │
                        └──────────────┘
```

## MCP Tools Integration

### Supported Tools

LEA Platform integrates with these MCP tools:

**Reconnaissance:**
- `nmap_scan` - Port scanning
- `dns_enum` - DNS enumeration
- `subdomain_search` - Subdomain discovery
- `whois_lookup` - Domain information
- `shodan_search` - Shodan integration
- `censys_search` - Censys integration

**Vulnerability Scanning:**
- `nikto_scan` - Web server scanning
- `nuclei_scan` - Template-based scanning
- `nessus_scan` - Nessus integration
- `openvas_scan` - OpenVAS integration
- `sqlmap_scan` - SQL injection detection

**Exploitation:**
- `metasploit_exploit` - Metasploit framework
- `searchsploit` - Exploit-db search
- `exploitdb_search` - Exploit database search

**Web Tools:**
- `wappalyzer` - Technology detection
- `security_headers` - Security headers analysis
- `waf_detect` - WAF detection
- `dirbuster_scan` - Directory bruteforcing
- `gobuster_scan` - Directory enumeration
- `ffuf_fuzz` - Fuzzing

### MCP Tool Categories

See `backend/src/services/mcp/McpService.ts` for full categorization:

```typescript
export const MCP_PENTEST_TOOLS = {
  RECON: ['nmap_scan', 'dns_enum', 'subdomain_search', ...],
  VULN_SCAN: ['nikto_scan', 'nuclei_scan', 'sqlmap_scan', ...],
  EXPLOIT: ['metasploit_exploit', 'searchsploit', ...],
  PASSWORD: ['john_hash', 'hashcat_crack', 'hydra_brute'],
  NETWORK: ['netcat_connect', 'socat_tunnel', 'wireshark_capture'],
  WEB: ['burp_scan', 'dirbuster_scan', 'gobuster_scan', 'ffuf_fuzz']
};
```

## Setup Instructions

### Option 1: Connect to Existing MCP Server

If you already have an MCP Kali server running:

#### Step 1: Configure Endpoint

```bash
# backend/.env
MCP_KALI_ENDPOINT=http://your-mcp-server:3000
MCP_TIMEOUT=30000
```

#### Step 2: Test Connection

```bash
# Test MCP endpoint
curl http://your-mcp-server:3000/health

# Or from within Docker
docker-compose exec backend curl -v http://your-mcp-server:3000/health
```

#### Step 3: Restart Backend

```bash
docker-compose restart backend
```

#### Step 4: Verify Integration

```bash
# Check logs for MCP connection
docker-compose logs backend | grep -i mcp

# Should see:
# [Preflight] MCP service connected
# [MCP] Loaded XX tools
```

### Option 2: Run MCP Server in Docker

#### Step 1: Build MCP Docker Image

```dockerfile
# Dockerfile.mcp-kali
FROM kalilinux/kali-rolling:latest

# Install MCP server and tools
RUN apt-get update && apt-get install -y \
    nmap \
    nikto \
    nuclei \
    sqlmap \
    whois \
    curl \
    python3 \
    python3-pip

# Install MCP server
RUN pip3 install mcp-server

# Copy MCP server configuration
COPY mcp-server.json /etc/mcp/

# Expose MCP port
EXPOSE 3000

# Start MCP server
CMD ["mcp-server", "--config", "/etc/mcp/mcp-server.json"]
```

#### Step 2: Update docker-compose.yml

Uncomment the MCP service:

```yaml
mcp-kali:
  build:
    context: .
    dockerfile: Dockerfile.mcp-kali
  container_name: lea-mcp-kali
  restart: unless-stopped
  ports:
    - "3000:3000"
  volumes:
    - kali_tools:/root/tools
  networks:
    - lea-network
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

#### Step 3: Start MCP Service

```bash
docker-compose up -d mcp-kali

# Check status
docker-compose ps mcp-kali

# View logs
docker-compose logs -f mcp-kali
```

### Option 3: External MCP Server (Non-Docker)

If your MCP server is running on a separate machine:

#### Step 1: Configure Backend

```bash
# backend/.env
MCP_KALI_ENDPOINT=http://192.168.1.100:3000
MCP_TIMEOUT=30000
```

#### Step 2: Update docker-compose.yml

Add extra_hosts to backend service:

```yaml
backend:
  extra_hosts:
    - "mcp-kali:192.168.1.100"
```

#### Step 3: Restart Services

```bash
docker-compose restart backend
```

## MCP Server Implementation

### Creating a Custom MCP Server

Here's a basic MCP server implementation:

```typescript
// mcp-server.ts
import { MCPServer } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new MCPServer({
  name: 'kali-pentest-tools',
  version: '1.0.0'
});

// Register tools
server.registerTool({
  name: 'nmap_scan',
  description: 'Scan ports using nmap',
  inputSchema: {
    type: 'object',
    properties: {
      target: { type: 'string' },
      ports: { type: 'string' }
    }
  }
});

// Handle tool execution
server.on('tool:execute', async (request) => {
  const { toolName, args } = request;

  switch (toolName) {
    case 'nmap_scan':
      return executeNmap(args.target, args.ports);
    // ... other tools
  }
});

async function executeNmap(target: string, ports: string) {
  const { exec } = require('child_process');
  return new Promise((resolve, reject) => {
    exec(`nmap -p${ports} ${target}`, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

// Start server
const transport = new StdioServerTransport();
server.connect(transport);
```

### MCP Tool Specification

Each MCP tool must provide:

```typescript
interface MCPTool {
  name: string;                    // Unique tool identifier
  description: string;             // What the tool does
  inputSchema: {                   // Input validation
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}
```

Example tool definition:

```typescript
{
  name: 'dns_enum',
  description: 'Enumerate DNS records for a target',
  inputSchema: {
    type: 'object',
    properties: {
      target: {
        type: 'string',
        description: 'Target domain or IP'
      },
      recordTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'DNS record types (A, AAAA, MX, etc.)'
      }
    },
    required: ['target']
  }
}
```

## Tool Execution Flow

### 1. Preflight Checks

```
User Request → Backend → PreflightService → McpService → MCP Kali
                                     ↓
                              Run preflight checks
                                     ↓
                              Store results in DB
```

### 2. Pentest Execution

```
PentestOrchestrator → Phase Selection
                         ↓
                    Select Tools for Phase
                         ↓
              McpService.executeTool(toolName, args)
                         ↓
                    MCP Kali executes tool
                         ↓
              Return results to backend
                         ↓
              Parse and store findings
                         ↓
              Select next tool/phase
```

### 3. Example: Nmap Scan

```typescript
// Backend request
const result = await mcpService.executeTool('nmap_scan', {
  target: 'example.com',
  ports: '1-1000',
  flags: '-sV -sC'
});

// MCP Kali executes
$ nmap -sV -sC -p1-1000 example.com

// MCP returns
{
  success: true,
  toolName: 'nmap_scan',
  output: 'Starting Nmap...\n[scan results]',
  duration: 5234
}
```

## Error Handling

### Common MCP Errors

#### 1. Connection Failed

```bash
# Symptom: [MCP] Connection failed

# Check MCP server is running
curl http://localhost:3000/health

# Check endpoint configuration
docker-compose exec backend env | grep MCP

# Restart MCP server
docker-compose restart mcp-kali
```

#### 2. Tool Not Found

```bash
# Symptom: [MCP] Tool not found: xxx

# List available tools
curl http://localhost:3000/tools

# Verify tool name matches MCP server
docker-compose logs mcp-kali | grep "Registered tools"
```

#### 3. Execution Timeout

```bash
# Symptom: [MCP] Tool execution timeout

# Increase timeout
# backend/.env
MCP_TIMEOUT=60000

# Or per-tool timeout in tool call
await mcpService.executeTool('nmap_scan', args, { timeout: 120000 });
```

## Testing MCP Integration

### Manual Testing

```bash
# Test MCP connection
curl http://localhost:3000/health

# List available tools
curl http://localhost:3000/tools

# Execute specific tool
curl -X POST http://localhost:3000/tools/nmap_scan \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com", "ports": "80,443"}'
```

### Automated Testing

```typescript
// test-mcp.ts
import { McpService } from './services/mcp/McpService.js';

async function testMCP() {
  const mcp = new McpService({
    command: 'mcp-server'
  });

  try {
    await mcp.connect();
    console.log('✓ MCP Connected');

    const tools = mcp.getAvailableTools();
    console.log(`✓ Found ${tools.length} tools`);

    const result = await mcp.executeTool('nmap_scan', {
      target: 'example.com',
      ports: '80'
    });

    console.log('✓ Tool executed:', result.success);
    console.log('Output:', result.output);

    await mcp.disconnect();
    console.log('✓ Test complete');
  } catch (error) {
    console.error('✗ Test failed:', error);
  }
}

testMCP();
```

## Advanced Configuration

### Custom Tool Mappings

```typescript
// backend/src/services/mcp/customTools.ts
export const CUSTOM_TOOLS = {
  my_custom_scan: {
    name: 'my_custom_scan',
    category: 'RECON',
    description: 'My custom scanning tool',
    timeout: 60000
  }
};
```

### Tool Execution Strategies

```typescript
// Sequential execution
for (const tool of tools) {
  await mcpService.executeTool(tool, args);
}

// Parallel execution
const results = await Promise.all(
  tools.map(tool => mcpService.executeTool(tool, args))
);

// Parallel with limit
const limit = 3;
const chunks = chunkArray(tools, limit);
for (const chunk of chunks) {
  await Promise.all(
    chunk.map(tool => mcpService.executeTool(tool, args))
  );
}
```

### Tool Result Parsing

```typescript
// backend/src/services/parsers/nmapParser.ts
export function parseNmapOutput(output: string) {
  const lines = output.split('\n');
  const findings = [];

  for (const line of lines) {
    if (line.includes('open')) {
      findings.push({
        type: 'open_port',
        data: parsePortLine(line)
      });
    }
  }

  return findings;
}
```

## Monitoring and Debugging

### Enable MCP Debug Logging

```bash
# backend/.env
LOG_LEVEL=debug
MCP_DEBUG=true
```

### View MCP Traffic

```bash
# All MCP calls
docker-compose logs backend | grep -A 5 "\[MCP\]"

# Tool executions
docker-compose logs backend | grep "executeTool"

# Tool results
docker-compose logs backend | grep "McpToolResult"
```

### Performance Metrics

```typescript
// Track tool execution time
const startTime = Date.now();
const result = await mcpService.executeTool(tool, args);
const duration = Date.now() - startTime;

console.log(`[MCP] ${tool} executed in ${duration}ms`);

// Store in database
await prisma.toolExecution.create({
  data: {
    tool_name: tool,
    duration_ms: duration,
    status: result.success ? 'COMPLETED' : 'FAILED'
  }
});
```

## Security Considerations

### 1. Network Isolation

```yaml
# docker-compose.yml
networks:
  lea-network:
    driver: bridge
    internal: false  # Set to true for complete isolation
```

### 2. MCP Authentication

```typescript
// Add authentication to MCP server
const mcpServer = new MCPServer({
  auth: {
    type: 'bearer',
    secret: process.env.MCP_SECRET
  }
});
```

### 3. Tool Whitelisting

```typescript
// Only allow specific tools
const ALLOWED_TOOLS = ['nmap_scan', 'dns_enum', 'nikto_scan'];

if (!ALLOWED_TOOLS.includes(toolName)) {
  throw new Error('Tool not allowed');
}
```

### 4. Sandboxing

```yaml
# Run MCP tools in isolated container
mcp-kali:
  security_opt:
    - no-new-privileges:true
  cap_drop:
    - ALL
  cap_add:
    - NET_BIND_SERVICE
    - NET_RAW
```

## Troubleshooting Guide

### MCP Not Connecting

```bash
# Check endpoint
curl -v http://localhost:3000/health

# Check firewall
sudo ufw status

# Test from within Docker
docker-compose exec backend curl -v http://mcp-kali:3000/health
```

### Tools Not Executing

```bash
# Check MCP server logs
docker-compose logs mcp-kali | tail -50

# Verify tool is registered
curl http://localhost:3000/tools | jq .

# Test tool manually
docker-compose exec mcp-kali nmap -p80 example.com
```

### Database Not Storing Results

```bash
# Check backend logs
docker-compose logs backend | grep -i error

# Verify database connection
docker-compose exec backend npx prisma db pull

# Check database
docker-compose exec postgres psql -U lea_admin -d lea_platform \
  -c "SELECT * FROM tool_executions ORDER BY created_at DESC LIMIT 5;"
```

## Best Practices

1. **Always use HTTPS for production MCP endpoints**
2. **Implement rate limiting for tool execution**
3. **Log all tool executions for audit trails**
4. **Validate all tool inputs before execution**
5. **Set appropriate timeouts for long-running tools**
6. **Implement retry logic for failed tool executions**
7. **Monitor MCP server health and resource usage**
8. **Keep MCP tools updated to latest versions**

## Next Steps

1. ✅ Connect MCP Kali server
2. ✅ Test tool execution
3. ✅ Configure custom tools
4. ✅ Set up monitoring
5. ✅ Implement error handling
6. ✅ Configure security settings
7. ✅ Document custom integrations

## Additional Resources

- MCP Protocol Specification
- Kali Linux Tools Documentation
- Docker Networking Documentation
- Backend API Documentation

## Support

For issues:
1. Check MCP server logs
2. Review backend logs
3. Test MCP endpoint manually
4. Verify tool configuration
5. Check network connectivity
