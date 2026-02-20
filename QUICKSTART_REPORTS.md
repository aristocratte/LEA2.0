# 🚀 Quick Start - Report System

## Prerequisites

- Node.js 18+ installed
- PostgreSQL database running
- LEA/EASM platform cloned

## 1. Database Setup

```bash
cd /Users/aris/Documents/LEA/backend

# Run Prisma migration
npx prisma migrate dev --name add_report_system

# Generate Prisma client
npx prisma generate
```

## 2. Install Dependencies

**Backend:**
```bash
cd /Users/aris/Documents/LEA/backend
npm install pdf-lib handlebars @types/handlebars
```

**Frontend:**
```bash
cd /Users/aris/Documents/LEA/lea-ui
npm install lucide-react
```

## 3. Start Development Servers

**Terminal 1 - Backend:**
```bash
cd /Users/aris/Documents/LEA/backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd /Users/aris/Documents/LEA/lea-ui
npm run dev
```

## 4. Test the System

### Option A: Via UI

1. Open http://localhost:5173
2. Start a new pentest
3. Wait for completion
4. Report auto-generates
5. Navigate to `/reports` to view

### Option B: Via API

```bash
# 1. Create a pentest (if not exists)
curl -X POST http://localhost:3001/api/pentests \
  -H "Content-Type: application/json" \
  -d '{"target": "example.com", "scope": {"domains": ["example.com"]}}'

# 2. Complete the pentest & generate report
curl -X POST http://localhost:3001/api/pentests/{id}/complete

# 3. Get the report
curl http://localhost:3001/api/pentests/{id}/report

# 4. Export as PDF
curl -O http://localhost:3001/api/reports/{id}/export/pdf

# 5. Export as HTML
curl -O http://localhost:3001/api/reports/{id}/export/html

# 6. Export as JSON
curl http://localhost:3001/api/reports/{id}/export/json
```

## 5. Verify Everything Works

### Check Database
```bash
psql $DATABASE_URL

# Should see reports table
\dt reports

# Should see export_jobs table
\dt export_jobs

# Check findings have report_id
\d findings

# Sample query
SELECT id, title, status FROM reports;
```

### Check Frontend
- Navigate to http://localhost:5173/reports
- Should see report list (empty initially)
- Filters and search should be visible
- Table headers should be clickable for sorting

### Test Export
1. Create a report via API
2. Click PDF export button
3. File should download with `.pdf` extension
4. Open PDF - should show formatted report

## Troubleshooting

### "Report not found" error

**Cause:** Report not created yet.

**Fix:**
```bash
# Manually create report
curl -X POST http://localhost:3001/api/pentests/{id}/complete
```

### "No findings in report"

**Cause:** Findings not persisted during pentest.

**Fix:**
```bash
# Check findings exist
psql $DATABASE_URL -c "SELECT COUNT(*) FROM findings WHERE pentest_id = '{id}';"

# If 0, findings were not persisted. Check FindingPersistencePipeline.
```

### PDF generation fails

**Cause:** pdf-lib not installed.

**Fix:**
```bash
cd backend
npm install pdf-lib
```

### CORS errors

**Cause:** Frontend can't reach backend.

**Fix:**
```bash
# Check backend is running on port 3001
curl http://localhost:3001/health

# Check frontend env
cat lea-ui/.env | grep VITE_API_BASE
```

## Next Steps

1. ✅ Report system installed and working
2. ➡️ Add custom branding to reports
3. ➡️ Create report templates
4. ➡️ Set up scheduled reports
5. ➡️ Add collaboration features

## Support

For issues or questions:
- Check [REPORT_IMPLEMENTATION.md](./REPORT_IMPLEMENTATION.md)
- Review API documentation
- Check database schema in `backend/prisma/schema.prisma`

---

**Generated:** 2025-02-16
**Version:** 1.0.0
