# Report System Implementation

## 📋 Overview

This implementation adds a complete Report system to the LEA/EASM AI Platform, enabling users to:

1. **Automatically generate reports** after pentest completion
2. **View and manage** security assessment reports
3. **Export reports** in PDF, HTML, and JSON formats
4. **Filter and search** through report history

## 🎯 What Was Implemented

### Backend (Node.js + Fastify + Prisma)

#### 1. Database Schema (`/backend/prisma/schema.prisma`)

**New Models:**
- `Report` - Main report entity with executive summary, methodology, stats
- `ExportJob` - Async export job tracking
- `Finding` model updated with `report_id` relation

**Key Features:**
- One-to-one relationship between Pentest and Report
- One-to-many relationship between Report and Finding
- Denormalized statistics for performance
- Support for multiple export formats

#### 2. Services

**ReportService** (`/backend/src/services/ReportService.ts`)
- `createReportFromPentest()` - Auto-generates report when pentest completes
- `calculateStats()` - Computes vulnerability statistics
- `generateExecutiveSummary()` - Creates executive summary with risk assessment
- `getDefaultMethodology()` - Provides methodology description

**ExportService** (`/backend/src/services/ExportService.ts`)
- `generatePdf()` - PDF generation using pdf-lib (lightweight, no Puppeteer)
- `generateHtml()` - Interactive HTML with styling
- `generateJson()` - API-friendly JSON format

#### 3. API Routes (`/backend/src/routes/reports.ts`)

**Endpoints:**
- `GET /api/reports` - List reports with filtering, sorting, pagination
- `GET /api/reports/:id` - Get report details
- `PUT /api/reports/:id` - Update report
- `DELETE /api/reports/:id` - Delete report
- `GET /api/reports/:id/export/pdf` - Export as PDF
- `GET /api/reports/:id/export/html` - Export as HTML
- `GET /api/reports/:id/export/json` - Export as JSON
- `GET /api/pentests/:id/report` - Get report by pentest ID
- `POST /api/pentests/:id/complete` - Complete pentest & create report

### Frontend (React + TypeScript + Vite)

#### 1. API Client (`/lea-ui/src/lib/api/reports.ts`)

**Functions:**
- `fetchReports(filters)` - Fetch paginated report list
- `fetchReportDetail(reportId)` - Fetch single report
- `fetchReportByPentest(pentestId)` - Get report from pentest
- `completePentest(pentestId)` - Mark pentest complete & create report

#### 2. Components

**ReportList** (`/lea-ui/src/components/pages/ReportList.tsx`)
- Paginated table with all reports
- Filters: status, severity, search
- Sorting by column
- Quick export buttons
- Click to view details

**ReportDetail** (`/lea-ui/src/components/pages/ReportDetail.tsx`)
- Full report view with findings
- Statistics dashboard
- Executive summary display
- Export buttons (PDF, HTML, JSON)
- Findings grouped by severity

## 🔄 Flow

### 1. Pentest Completion Flow

```
1. User completes pentest
   ↓
2. Frontend calls POST /api/pentests/:id/complete
   ↓
3. Backend marks pentest as COMPLETED
   ↓
4. ReportService.createReportFromPentest() is called
   ↓
5. Findings are linked to report (relation DB)
   ↓
6. Stats are calculated and stored
   ↓
7. Executive summary is generated
   ↓
8. SSE event broadcasted to frontend
   ↓
9. Frontend redirects to ReportDetail
   ↓
10. User can view/export report
```

### 2. Report Persistence (Solution to REPORT-001)

**Problem:** Findings were not persisted to database, causing empty reports.

**Solution:**
- Findings are persisted immediately by `FindingPersistencePipeline` during pentest
- Report simply links existing findings via `report_id` foreign key
- No data loss, no synchronization issues

## 📦 Dependencies

### Backend

```json
{
  "pdf-lib": "^1.17.1",
  "handlebars": "^4.7.8",
  "@types/handlebars": "^4.7.3"
}
```

### Frontend

```json
{
  "lucide-react": "latest",
  "@tanstack/react-query": "^5.90.21"
}
```

## 🚀 Setup Instructions

### 1. Database Migration

```bash
cd backend
npx prisma migrate dev --name add_report_system
npx prisma generate
```

### 2. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd lea-ui
npm install
```

### 3. Environment Variables

**Backend (`.env`):**
```env
DATABASE_URL="postgresql://user:password@localhost:5432/lea"
PORT=3001
```

**Frontend (`.env`):**
```env
VITE_API_BASE="http://localhost:3001"
```

### 4. Run Development Servers

```bash
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd lea-ui
npm run dev
```

## 🧪 Testing

### Manual Testing

1. **Create a Report:**
   ```bash
   # Start a pentest and let it complete
   # Report should auto-generate
   curl -X POST http://localhost:3001/api/pentests/:id/complete
   ```

2. **View Report List:**
   ```
   Navigate to http://localhost:5173/reports
   ```

3. **Export PDF:**
   ```bash
   curl -O http://localhost:3001/api/reports/:id/export/pdf
   ```

### Test Cases

- [ ] Report auto-created on pentest completion
- [ ] All findings appear in report
- [ ] Stats calculated correctly
- [ ] PDF export works
- [ ] HTML export works
- [ ] JSON export works
- [ ] Filters work in ReportList
- [ ] Sorting works in ReportList
- [ ] Pagination works

## 📁 File Structure

```
LEA/
├── backend/
│   ├── prisma/
│   │   └── schema.prisma              # Updated with Report & ExportJob
│   ├── src/
│   │   ├── services/
│   │   │   ├── ReportService.ts      # Report creation logic
│   │   │   └── ExportService.ts      # PDF/HTML/JSON generation
│   │   ├── routes/
│   │   │   └── reports.ts            # API endpoints
│   │   └── index.ts                  # Updated to register routes
│   └── package.json                  # Added pdf-lib, handlebars
│
└── lea-ui/
    ├── src/
    │   ├── components/
    │   │   └── pages/
    │   │       ├── ReportList.tsx    # Report list component
    │   │       └── ReportDetail.tsx  # Report detail component
    │   └── lib/
    │       └── api/
    │           └── reports.ts        # API client
    └── package.json                  # Added lucide-react
```

## 🎨 UI Features

### ReportList
- ✅ Responsive table with hover effects
- ✅ Real-time search
- ✅ Status and severity filters
- ✅ Column sorting
- ✅ Pagination
- ✅ Quick export buttons
- ✅ Framer Motion animations

### ReportDetail
- ✅ Statistics cards with severity colors
- ✅ Executive summary with markdown support
- ✅ Findings grouped by severity
- ✅ Export buttons (PDF, HTML, JSON)
- ✅ Smooth animations
- ✅ Responsive design

## 🔧 Customization

### Add Custom Export Templates

Edit `/backend/src/services/ExportService.ts`:

```typescript
private getHtmlTemplate(): string {
  return `your custom template here`;
}
```

### Modify Report Sections

Edit `/backend/src/services/ReportService.ts`:

```typescript
private getDefaultMethodology(): string {
  return `your custom methodology`;
}
```

### Change PDF Styling

Edit `/backend/src/services/ExportService.ts` in the `generatePdf()` method:

```typescript
const colors = {
  // Customize your colors
};
```

## 🐛 Troubleshooting

### Issue: Reports appear empty

**Solution:** Check that findings are persisted during pentest:
```bash
# Query database directly
psql $DATABASE_URL -c "SELECT * FROM findings WHERE pentest_id = 'your-pentest-id';"
```

### Issue: PDF generation fails

**Solution:** Ensure pdf-lib is installed:
```bash
cd backend
npm install pdf-lib
```

### Issue: Frontend can't connect to backend

**Solution:** Check CORS and environment variables:
```env
# backend/.env
CORS_ORIGIN=http://localhost:5173

# lea-ui/.env
VITE_API_BASE=http://localhost:3001
```

## 📝 Next Steps

### Phase 2 Enhancements
- [ ] Add custom report templates
- [ ] Support for Word (DOCX) export
- [ ] Report collaboration features
- [ ] Scheduled report generation
- [ ] Report comparison tool
- [ ] CVSS calculator integration

### Phase 3 Features
- [ ] Report comments/annotations
- [ ] Approval workflow
- [ ] Version history
- [ ] Email notifications
- [ ] Custom branding (logos, colors)

## 📚 API Documentation

See [API.md](./API.md) for detailed API documentation.

## 👥 Contributing

When adding new features:
1. Update both backend service and frontend component
2. Add TypeScript types
3. Test with different data volumes
4. Update this README

## 📄 License

MIT
