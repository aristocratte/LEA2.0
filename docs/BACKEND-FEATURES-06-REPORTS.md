# Backend Features - Reports & Export

## Current Implementation 🟡

### Implemented Endpoints
```
GET    /api/pentests/:id/report        - Get generated report
POST   /api/pentests/:id/complete      - Complete pentest and generate report
```

## Report Generation

### Current Flow
1. Pentest completes (`POST /api/pentests/:id/complete`)
2. Backend generates report from findings
3. Report stored in database
4. Available via `GET /api/pentests/:id/report`

### Report Data Model
```typescript
interface Report {
  id: string;
  pentestId: string;
  status: 'generating' | 'completed' | 'failed';
  executiveSummary: string;
  riskRating: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  findings: ReportFinding[];
  methodology: string;
  scope: string;
  limitations: string;
  appendices?: string;
  generatedAt: string;
  error?: string;
}

interface ReportFinding {
  id: string;
  title: string;
  severity: string;
  cvssScore?: number;
  description: string;
  evidence: string;
  impact: string;
  remediation: string;
  references?: string[];
}
```

## Missing/Needs Improvement 🔴

### 1. Export Formats
**Current:** Only JSON API response
**Need:**
```
GET /api/pentests/:id/report?format=pdf     - PDF report
GET /api/pentests/:id/report?format=docx    - Word document
GET /api/pentests/:id/report?format=html    - HTML report
GET /api/pentests/:id/report?format=md      - Markdown
```

### 2. Custom Report Templates
**Need:**
```
GET    /api/report-templates              - List available templates
POST   /api/report-templates              - Create custom template
PUT    /api/report-templates/:id          - Update template
DELETE /api/report-templates/:id          - Delete template

POST   /api/pentests/:id/report/generate  - Generate with template
{
  templateId: string;
  sections: string[];  // Which sections to include
  includeEvidence: boolean;
  includeRemediation: boolean;
}
```

### 3. Report Sections Configuration
**Need ability to customize:**
- Executive Summary (auto-generated from findings)
- Methodology Overview
- Detailed Findings
- Risk Matrix/Heat Map
- Compliance Mapping (OWASP, NIST, etc.)
- Appendices (tool outputs, logs)

### 4. Conversation Export
**Frontend implemented, backend missing:**
```
GET /api/pentests/:id/export/conversation?format=pdf|md|json|txt
```

**Features:**
- Include/exclude timestamps
- Include/exclude system messages
- Include/exclude thinking blocks
- Filter by date range

### 5. Findings Export
**Frontend implemented, backend missing:**
```
GET /api/pentests/:id/export/findings?format=pdf|csv|json&severity=critical,high
```

**Features:**
- Filter by severity
- Filter by status (open/resolved)
- Include/exclude evidence
- Include/exclude remediation

### 6. Batch Export
**Need:**
```
POST /api/export/batch
{
  pentestIds: string[];
  format: 'pdf' | 'csv' | 'json';
  include: ['findings', 'conversation', 'audit'];
}
```
Returns a zip file with all exports.

## Report Templates

### Default Template Sections
1. **Cover Page**
   - Client name
   - Target
   - Date
   - Classification level

2. **Executive Summary**
   - Overall risk rating
   - Key findings count by severity
   - High-level recommendations

3. **Methodology**
   - Pentest type
   - Tools used
   - Timeline

4. **Findings** (main content)
   - Each finding with severity badge
   - Description
   - Evidence (screenshots, logs)
   - Impact
   - Remediation steps

5. **Appendices**
   - Tool outputs
   - Scan logs
   - Scope verification

## PDF Generation Options

### Option 1: Puppeteer/Playwright
- Pros: Full CSS support, easy HTML→PDF
- Cons: Heavy dependency, memory intensive

### Option 2: jsPDF (Frontend)
- Already implemented in frontend export
- Pros: No backend changes needed
- Cons: Limited styling, client-side only

### Option 3: WeasyPrint/wkhtmltopdf
- Pros: Lightweight, good CSS support
- Cons: Additional service/binary required

### Option 4: LaTeX
- Pros: Professional quality, academic standard
- Cons: Complex setup, steep learning curve

## Recommended: Hybrid Approach

1. **Quick Export** - Use frontend jsPDF for immediate needs
2. **Professional Reports** - Backend Puppeteer for final deliverables
3. **Data Export** - CSV/JSON for further processing

## SysReptor Integration

### Current
- Findings pushed to SysReptor during swarm execution
- Bidirectional sync not implemented

### Need
```
POST /api/pentests/:id/report/sysreptor/sync
GET  /api/pentests/:id/report/sysreptor/status
```

### Two-way Sync
1. Finding edited in LEA → Push to SysReptor
2. Finding edited in SysReptor → Pull to LEA
3. Conflict resolution strategy

## Report Storage

### Current
- Reports stored in PostgreSQL as JSON
- No file storage

### Recommended
```sql
-- Add to reports table
ALTER TABLE reports ADD COLUMN file_path VARCHAR(500);
ALTER TABLE reports ADD COLUMN file_size BIGINT;
ALTER TABLE reports ADD COLUMN download_url VARCHAR(1000);
```

Store generated PDFs in:
- Local: `./storage/reports/`
- Docker: Volume mount
- Cloud: S3-compatible storage

## Report Access Control

### Sharing
```
POST   /api/reports/:id/share        - Create shareable link
DELETE /api/reports/:id/share/:token - Revoke link
GET    /api/reports/shared/:token    - Public access (read-only)
```

### Expiration
- Share links expire after configurable period (default 30 days)
- Password protection optional
- Access logging

## Frontend Components

### ExportConversation
- Format selector (Markdown, PDF, TXT, JSON)
- Timestamp toggle
- Download button

### ExportFindings
- Format selector (Markdown, PDF, CSV, JSON)
- Severity filter
- Include details toggle

### ReportViewer
- HTML preview
- Download buttons
- Share functionality

## Implementation Priority

### Phase 1 - Basic Export
- [ ] Backend conversation export endpoint
- [ ] Backend findings export endpoint
- [ ] PDF generation service

### Phase 2 - Templates
- [ ] Template system
- [ ] Custom template builder
- [ ] Section configuration

### Phase 3 - Advanced
- [ ] Batch export
- [ ] Scheduled reports
- [ ] Email delivery
- [ ] SysReptor bidirectional sync
