# Backend Features - Provider Management

## Implemented Endpoints ✅

### CRUD Operations
```
GET    /api/providers              - List all providers
POST   /api/providers              - Create new provider
GET    /api/providers/:id          - Get provider details
PUT    /api/providers/:id          - Update provider
DELETE /api/providers/:id          - Delete provider
```

### Provider Testing
```
POST   /api/providers/:id/test     - Test provider connection
```

### OAuth Flows
```
GET    /api/providers/gemini/cli-status           - Check Gemini CLI auth status
POST   /api/providers/oauth/gemini                - Gemini OAuth callback
POST   /api/providers/oauth/antigravity           - Antigravity OAuth
```

### Usage & Models
```
GET    /api/providers/:id/usage     - Get usage statistics
GET    /api/providers/:id/models    - Get available models
```

## Frontend Store Mapping

### useProviderStore expects:
```typescript
interface Provider {
  id: string;
  name: string;
  type: 'anthropic' | 'zhipu' | 'openai' | 'gemini' | 'antigravity' | 'codex' | 'opencode' | 'custom';
  displayName: string;
  enabled: boolean;
  apiKey: string;
  apiKeyConfigured: boolean;
  baseUrl?: string;
  organizationId?: string;
  models: ModelConfig[];
  isDefault: boolean;
  priority: number;
  healthStatus: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  lastHealthCheck?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

interface ModelConfig {
  id: string;
  modelId: string;
  displayName: string;
  contextWindow: number;
  maxOutputTokens?: number;
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsTools: boolean;
  inputPricePer1k?: number;
  outputPricePer1k?: number;
  enabled: boolean;
  usageCount?: number;
  lastUsedAt?: string;
}
```

## API Data Transform

### Backend → Frontend (fromApiProvider)
- `api_key_hash` → `apiKeyConfigured` (boolean)
- `oauth_configured` → `apiKeyConfigured` (for OAuth providers)
- `health_status` → `healthStatus` (lowercased)
- `models` → mapped with snake_case to camelCase conversion

### Frontend → Backend (toApiProvider)
- `type` → uppercase
- `apiKey` → `api_key`
- `baseUrl` → `base_url`
- `displayName` → `display_name`

## Missing/Needs Improvement 🟡

### 1. Model Management
**Current:** Models are nested in provider, no standalone endpoints
**Need:**
```
POST   /api/providers/:id/models              - Add model
PUT    /api/providers/:id/models/:modelId     - Update model
DELETE /api/providers/:id/models/:modelId     - Remove model
POST   /api/providers/:id/models/:id/enable   - Enable model
POST   /api/providers/:id/models/:id/disable  - Disable model
```

### 2. Health Check Automation
**Current:** Manual test only (`POST /api/providers/:id/test`)
**Need:**
- Background health checks every 5 minutes
- Automatic health status updates
- Health history tracking

### 3. Provider Templates
**Need:**
```
GET /api/providers/templates - Get predefined provider templates
```
Returns templates for common providers (OpenAI, Anthropic, etc.) with default models and settings.

### 4. Provider Fallback Chain
**Need:**
```
GET    /api/providers/fallback-chain     - Get fallback priority
PUT    /api/providers/fallback-chain     - Update fallback order
```

### 5. Usage Analytics
**Current:** Basic usage endpoint
**Need:**
```
GET /api/providers/:id/usage/timeseries?from=&to= - Time series data
GET /api/providers/usage/summary - Cross-provider summary
```

## Provider Types Support

| Provider | API Key | OAuth | Base URL Custom | Models |
|----------|---------|-------|-----------------|--------|
| Anthropic | ✅ | ❌ | ❌ | Claude 3.5 Sonnet, Claude 3 Opus |
| OpenAI | ✅ | ❌ | ❌ | GPT-4, GPT-4o, GPT-3.5 |
| Zhipu AI | ✅ | ❌ | ❌ | GLM-4, GLM-4V |
| Gemini | ✅ | ✅ | ❌ | Gemini Pro, Gemini Ultra |
| Antigravity | ❌ | ✅ | ❌ | AG-Security |
| Codex | ✅ | ❌ | ❌ | Codex |
| OpenCode | ✅ | ❌ | ✅ | Custom |
| Custom | ✅ | ❌ | ✅ | User defined |

## Known Issues ⚠️

1. **Type Mismatch** - Backend `ProviderType` enum missing 'CODEX' and 'OPENCODE' values
2. **OAuth Token Refresh** - No automatic token refresh for Gemini/Antigravity
3. **Model Discovery** - No endpoint to fetch available models from provider API

## Frontend Mock Data

Currently using `mockProviders` from `@/lib/mock-data` when API fails.
Should be removed once backend is fully operational.

## Security Considerations

1. API keys are encrypted at rest using `CryptoService`
2. Keys are never returned in full - only masked or hash indication
3. OAuth tokens stored separately with refresh logic
4. Provider credentials isolated per user (when multi-tenant)
