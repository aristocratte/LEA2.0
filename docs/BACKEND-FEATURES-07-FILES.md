# Backend Features - File Upload & Processing

## Current Implementation 🔴

**Status:** Frontend has UI components but no backend endpoints exist.

### Frontend Components (Ready)
```typescript
// FileUploadZone - Drag & drop area
// FileAttachButton - Button to select files
// FileAttachmentPill - Shows attached file with remove button

interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  content?: string;  // For text files
}
```

## Required Backend Implementation

### 1. File Upload Endpoint
```
POST /api/pentests/:id/files/upload
```

**Request:**
- Content-Type: `multipart/form-data`
- Body: File binary

**Response:**
```typescript
{
  id: string;           // File ID
  name: string;         // Original filename
  size: number;         // File size in bytes
  mimeType: string;     // Detected MIME type
  url: string;          // Download URL
  extractedText?: string; // For text files
  status: 'uploaded' | 'processing' | 'ready' | 'error';
}
```

### 2. File Management
```
GET    /api/pentests/:id/files           - List uploaded files
GET    /api/pentests/:id/files/:id       - Get file metadata
GET    /api/pentests/:id/files/:id/download - Download file
DELETE /api/pentests/:id/files/:id       - Delete file
```

### 3. Text Extraction Pipeline

#### Supported File Types

| Extension | MIME Type | Extraction Method |
|-----------|-----------|-------------------|
| .txt | text/plain | Direct read |
| .json | application/json | Parse & format |
| .csv | text/csv | Parse as table |
| .xml | application/xml | Parse & format |
| .yaml, .yml | application/yaml | Direct read |
| .nmap | text/xml | Parse Nmap XML |
| .md | text/markdown | Direct read |
| .log | text/plain | Direct read |

#### Unsupported (Binary)
- .pcap (packet capture)
- Images (.png, .jpg)
- Archives (.zip, .tar)
- Binaries (.exe, .bin)

### 4. Processing Pipeline

```typescript
interface FileProcessingJob {
  id: string;
  fileId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  operations: Array<{
    type: 'text_extraction' | 'parsing' | 'validation';
    status: string;
    result?: unknown;
    error?: string;
  }>;
  startedAt: string;
  completedAt?: string;
}
```

**Processing Steps:**
1. **Upload** - Save to storage
2. **Virus Scan** - ClamAV or similar
3. **Type Detection** - Magic numbers + extension
4. **Text Extraction** - For supported types
5. **Parsing** - Structure validation (JSON, XML, CSV)
6. **Indexing** - Add to search index
7. **Notify** - SSE event to frontend

## Database Schema

```sql
CREATE TABLE uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pentest_id UUID REFERENCES pentests(id) ON DELETE CASCADE,
  original_name VARCHAR(255) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,  -- Randomized for security
  size_bytes BIGINT NOT NULL,
  mime_type VARCHAR(100),
  extension VARCHAR(20),
  storage_path VARCHAR(500) NOT NULL,
  extracted_text TEXT,
  extracted_metadata JSONB,
  uploaded_by UUID,  -- User ID (when auth added)
  status VARCHAR(50) DEFAULT 'uploaded',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_uploaded_files_pentest ON uploaded_files(pentest_id);
```

## Storage Options

### Local Filesystem (Development)
```
./storage/uploads/{pentestId}/{fileId}-{random}.{ext}
```

### Docker Volume (Production)
```yaml
volumes:
  - uploads:/app/storage/uploads
```

### Cloud Storage (Scale)
- AWS S3
- MinIO (S3-compatible)
- Google Cloud Storage

## Security Considerations

### 1. File Size Limits
- Max file size: 10MB (configurable)
- Max total per pentest: 100MB
- Reject oversized files before processing

### 2. Type Validation
- Whitelist allowed extensions
- MIME type verification (magic numbers)
- Reject executable files

### 3. Storage Security
- Randomized filenames (UUID)
- No direct path access
- All access through API with auth

### 4. Content Scanning
- ClamAV for virus scanning
- Content sanitization for HTML/XML
- No SVG (XSS risk) unless sanitized

## Integration with Messages

When a file is attached to a message:

```
POST /api/pentests/:id/messages
{
  type: 'USER',
  content: 'Please analyze this scan result',
  attachments: ['file-uuid-1', 'file-uuid-2']
}
```

Backend should:
1. Validate file IDs exist
2. Include extracted text in context for AI
3. Mark files as referenced

## Frontend Integration

### FileUploadZone
```typescript
interface FileUploadZoneProps {
  onFilesUploaded: (files: UploadedFile[]) => void;
  disabled?: boolean;
  maxFileSize?: number;  // bytes
  acceptedTypes?: string;  // MIME types
}
```

### Upload Progress
```typescript
interface UploadProgress {
  fileId: string;
  fileName: string;
  loaded: number;
  total: number;
  percentage: number;
  status: 'uploading' | 'processing' | 'complete' | 'error';
}
```

## Implementation Priority

### Phase 1 - Basic Upload
- [ ] POST /api/pentests/:id/files/upload
- [ ] GET /api/pentests/:id/files
- [ ] GET /api/pentests/:id/files/:id/download
- [ ] DELETE /api/pentests/:id/files/:id
- [ ] Local storage backend

### Phase 2 - Text Extraction
- [ ] Text file extraction (txt, md, log)
- [ ] JSON parsing and formatting
- [ ] CSV parsing as table
- [ ] XML parsing (including Nmap)
- [ ] YAML parsing

### Phase 3 - Advanced Features
- [ ] Virus scanning
- [ ] Progress tracking (SSE)
- [ ] Batch upload
- [ ] File deduplication
- [ ] Search within files

## Error Handling

### Upload Errors
```typescript
interface UploadError {
  code: 'FILE_TOO_LARGE' | 'INVALID_TYPE' | 'VIRUS_DETECTED' | 'STORAGE_ERROR';
  message: string;
  fileName: string;
}
```

### Frontend Feedback
- Toast notifications for errors
- Progress bars for uploads
- Inline validation before upload
- Retry mechanism for failed uploads
