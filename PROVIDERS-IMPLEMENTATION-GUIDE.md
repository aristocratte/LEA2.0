# Guide d'Implémentation : Intégration des Providers AI

## Date : 16 Mars 2026
## Projet : LEA Platform - Configuration des Providers

---

## 🎯 Objectif

Implémenter 3 providers AI additionnels :
1. **Claude Code (Anthropic)** - Via API officielle
2. **ChatGPT via Codex** - Modèles Codex OpenAI
3. **OpenCode Go** - Endpoint OpenAI-compatible

---

## 📊 État Actuel

### Architecture Existante

Le système supporte déjà plusieurs providers via une architecture modulaire :

| Provider | Type | Auth | Status |
|----------|------|------|--------|
| Anthropic | `ANTHROPIC` | API Key | ✅ Implémenté |
| Zhipu (GLM) | `ZHIPU` | API Key | ✅ Implémenté |
| OpenAI | `OPENAI` | API Key | ✅ Partiel |
| Gemini | `GEMINI` | OAuth/API Key | ✅ Implémenté |
| Antigravity | `ANTIGRAVITY` | OAuth | ✅ Implémenté |
| **Codex** | ❌ | - | **À implémenter** |
| **OpenCode** | ❌ | - | **À implémenter** |

### Fichiers Clés

```
backend/
├── prisma/
│   └── schema.prisma           # Modèle Provider (lignes 548-598)
├── src/
│   ├── routes/
│   │   └── providers.ts        # API endpoints (lignes 1-742)
│   ├── services/
│   │   ├── ProviderManager.ts  # Orchestration (lignes 1-438)
│   │   ├── CryptoService.ts    # Chiffrement AES-256-GCM
│   │   └── ai/
│   │       ├── AIClient.ts     # Interface (lignes 1-110)
│   │       ├── AnthropicClient.ts
│   │       ├── ZhipuClient.ts  # Gère aussi OpenAI-compatible
│   │       ├── GeminiClient.ts
│   │       └── AntigravityClient.ts
│   └── types/
│       └── fastify.d.ts

lea-app/
├── types/
│   └── index.ts                # Types Provider/Model (lignes 204-286)
├── lib/
│   └── api.ts                  # Client API
├── store/
│   └── provider-store.ts       # State management
└── components/
    └── providers/
        └── provider-form.tsx   # UI configuration
```

---

## 🔐 1. Configuration Docker pour les Credentials

### 1.1 Méthode Recommandée : Docker Secrets (Production)

**Créer les fichiers de secrets :**

```bash
# Créer le répertoire des secrets
mkdir -p /Users/aris/Documents/LEA/secrets

# Créer les fichiers (ne pas commiter !)
echo "sk-ant-api03-..." > /Users/aris/Documents/LEA/secrets/anthropic_api_key.txt
echo "sk-proj-..." > /Users/aris/Documents/LEA/secrets/openai_api_key.txt
echo "opencode-api-key-..." > /Users/aris/Documents/LEA/secrets/opencode_api_key.txt

# Permissions restrictives
chmod 600 /Users/aris/Documents/LEA/secrets/*.txt
```

**Modifier `docker-compose.yml` :**

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    secrets:
      - anthropic_api_key
      - openai_api_key
      - opencode_api_key
    environment:
      # Référencer les secrets via fichiers
      ANTHROPIC_API_KEY_FILE: /run/secrets/anthropic_api_key
      OPENAI_API_KEY_FILE: /run/secrets/openai_api_key
      OPENCODE_API_KEY_FILE: /run/secrets/opencode_api_key
      # ... autres variables
    volumes:
      - ./secrets:/run/secrets:ro
    # Sécurité renforcée
    read_only: true
    tmpfs:
      - /tmp
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL

  postgres:
    # ... configuration existante
    secrets:
      - postgres_password
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password

secrets:
  anthropic_api_key:
    file: ./secrets/anthropic_api_key.txt
  openai_api_key:
    file: ./secrets/openai_api_key.txt
  opencode_api_key:
    file: ./secrets/opencode_api_key.txt
  postgres_password:
    file: ./secrets/postgres_password.txt
```

### 1.2 Méthode Alternative : Variables d'Environnement (Développement)

**Créer/modifier `.env` :**

```bash
# .env (déjà supporté par le backend)
ANTHROPIC_API_KEY=sk-ant-api03-votre-clé-anthropic
OPENAI_API_KEY=sk-proj-votre-clé-openai
OPENCODE_API_KEY=votre-clé-opencode-go

# Configuration par défaut
DEFAULT_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4-5-20250929
```

**Note :** Le backend lit déjà ces variables via `process.env`.

### 1.3 Lecture des Credentials dans le Backend

**Créer `backend/src/services/SecretLoader.ts` :**

```typescript
import fs from 'fs';
import path from 'path';

/**
 * Charge un secret depuis un fichier Docker ou une variable d'environnement
 * Ordre de priorité : fichier > env var > default
 */
export function loadSecret(secretName: string, envVarName?: string): string | undefined {
  // 1. Essayer de lire depuis un fichier (Docker secrets)
  const secretFile = process.env[`${secretName}_FILE`];
  if (secretFile) {
    try {
      return fs.readFileSync(secretFile, 'utf-8').trim();
    } catch (err) {
      console.warn(`[SecretLoader] Failed to read secret file: ${secretFile}`);
    }
  }

  // 2. Fallback sur la variable d'environnement
  const envVar = envVarName || secretName;
  const envValue = process.env[envVar];
  if (envValue) {
    return envValue;
  }

  return undefined;
}

// Helpers spécifiques
export const getAnthropicKey = () => loadSecret('ANTHROPIC_API_KEY');
export const getOpenAIKey = () => loadSecret('OPENAI_API_KEY');
export const getOpenCodeKey = () => loadSecret('OPENCODE_API_KEY');
```

---

## 🛠️ 2. Implémentation des Providers

### 2.1 Provider 1 : ChatGPT Codex

#### Étape 1 : Mettre à jour le Schéma Prisma

**Fichier :** `backend/prisma/schema.prisma`

```prisma
enum ProviderType {
  ANTHROPIC
  ZHIPU
  OPENAI
  CUSTOM
  GEMINI
  ANTIGRAVITY
  CODEX        // ➕ AJOUTER
}
```

**Migration :**

```bash
cd backend
npx prisma migrate dev --name add_codex_provider
```

#### Étape 2 : Créer le Client Codex

**Fichier :** `backend/src/services/ai/CodexClient.ts`

```typescript
/**
 * CodexClient - OpenAI Codex API implementation
 * 
 * Codex est un modèle spécialisé pour le code et la sécurité.
 * Utilise l'API OpenAI avec modèles codex-latest ou codex-mini.
 */

import type {
    AIClient,
    StreamChatParams,
    StreamResult,
    ContentBlock,
    ChatMessage,
    ToolDefinition,
    TextContent,
    ToolUseContent,
    ToolResultContent,
} from './AIClient.js';

const CODEX_BASE_URL = 'https://api.openai.com/v1';

interface OpenAIToolCall {
    id?: string;
    type?: 'function';
    function?: {
        name?: string;
        arguments?: string;
    };
}

interface OpenAIChoice {
    index?: number;
    delta?: {
        role?: string;
        content?: string | null;
        tool_calls?: OpenAIToolCall[];
    };
    finish_reason?: string | null;
}

interface OpenAIStreamChunk {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices?: OpenAIChoice[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}

export class CodexClient implements AIClient {
    private apiKey: string;
    private baseUrl: string;

    constructor(apiKey: string, baseUrl?: string) {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl || CODEX_BASE_URL;
    }

    getProviderName(): string {
        return 'codex';
    }

    async streamChat(params: StreamChatParams): Promise<StreamResult> {
        const {
            model,
            messages,
            tools,
            systemPrompt,
            maxTokens = 4096,
            onEvent,
            signal,
        } = params;

        const openaiMessages = this.toOpenAIMessages(messages, systemPrompt);
        const openaiTools = this.toOpenAITools(tools);

        const body: Record<string, unknown> = {
            model: model || 'codex-latest',
            messages: openaiMessages,
            max_completion_tokens: maxTokens,
            stream: true,
            temperature: 0.1,  // Faible température pour le code/sécurité
        };

        if (openaiTools.length > 0) {
            body.tools = openaiTools;
            body.tool_choice = 'auto';
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Codex API error: ${response.status} - ${error}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body');
        }

        const contentBlocks: ContentBlock[] = [];
        let currentTextBlock: TextContent | null = null;
        let currentToolUse: {
            id: string;
            name: string;
            argumentsJson: string;
            index: number;
        } | null = null;
        let finalUsage = { prompt_tokens: 0, completion_tokens: 0 };
        let stopReason: string = 'stop';

        onEvent({ type: 'message_start' });

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed: OpenAIStreamChunk = JSON.parse(data);
                            const choice = parsed.choices?.[0];

                            if (choice?.delta?.content) {
                                if (!currentTextBlock) {
                                    currentTextBlock = { type: 'text', text: '' };
                                }
                                currentTextBlock.text += choice.delta.content;
                                onEvent({ type: 'text_delta', text: choice.delta.content });
                            }

                            if (choice?.delta?.tool_calls) {
                                const toolCall = choice.delta.tool_calls[0];
                                if (toolCall?.id) {
                                    // Nouvel appel d'outil
                                    currentToolUse = {
                                        id: toolCall.id,
                                        name: toolCall.function?.name || '',
                                        argumentsJson: toolCall.function?.arguments || '',
                                        index: toolCall.index || 0,
                                    };
                                } else if (currentToolUse && toolCall?.function?.arguments) {
                                    // Arguments supplémentaires
                                    currentToolUse.argumentsJson += toolCall.function.arguments;
                                }
                            }

                            if (choice?.finish_reason) {
                                stopReason = choice.finish_reason;
                                
                                // Finaliser les blocs
                                if (currentTextBlock) {
                                    contentBlocks.push(currentTextBlock);
                                    currentTextBlock = null;
                                }
                                
                                if (currentToolUse) {
                                    let input: Record<string, unknown> = {};
                                    try {
                                        input = JSON.parse(currentToolUse.argumentsJson || '{}');
                                    } catch {
                                        console.warn('[CodexClient] Failed to parse tool arguments');
                                    }
                                    
                                    const toolBlock: ToolUseContent = {
                                        type: 'tool_use',
                                        id: currentToolUse.id,
                                        name: currentToolUse.name,
                                        input,
                                    };
                                    contentBlocks.push(toolBlock);
                                    onEvent({
                                        type: 'tool_use',
                                        id: currentToolUse.id,
                                        name: currentToolUse.name,
                                        input,
                                    });
                                    currentToolUse = null;
                                }
                            }

                            if (parsed.usage) {
                                finalUsage = {
                                    prompt_tokens: parsed.usage.prompt_tokens || 0,
                                    completion_tokens: parsed.usage.completion_tokens || 0,
                                };
                            }
                        } catch (err) {
                            console.warn('[CodexClient] Failed to parse SSE chunk:', err);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        onEvent({ type: 'message_end' });
        onEvent({
            type: 'usage',
            inputTokens: finalUsage.prompt_tokens,
            outputTokens: finalUsage.completion_tokens,
        });
        onEvent({
            type: 'message_stop',
            stopReason,
        });

        return {
            stopReason: this.mapStopReason(stopReason),
            content: contentBlocks,
            usage: {
                inputTokens: finalUsage.prompt_tokens,
                outputTokens: finalUsage.completion_tokens,
            },
        };
    }

    private toOpenAIMessages(
        messages: ChatMessage[],
        systemPrompt?: string
    ): Array<{ role: string; content: string }> {
        const result: Array<{ role: string; content: string }> = [];

        if (systemPrompt) {
            result.push({ role: 'system', content: systemPrompt });
        }

        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                result.push({
                    role: msg.role,
                    content: msg.content,
                });
            } else {
                // Pour les messages avec content blocks
                const textParts: string[] = [];
                for (const block of msg.content) {
                    if (block.type === 'text') {
                        textParts.push(block.text);
                    } else if (block.type === 'tool_result') {
                        textParts.push(`Tool result: ${block.content}`);
                    }
                }
                result.push({
                    role: msg.role,
                    content: textParts.join('\n'),
                });
            }
        }

        return result;
    }

    private toOpenAITools(tools: ToolDefinition[]): Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }> {
        return tools.map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        }));
    }

    private mapStopReason(
        reason: string | null
    ): StreamResult['stopReason'] {
        switch (reason) {
            case 'tool_calls':
                return 'tool_use';
            case 'length':
                return 'max_tokens';
            case 'stop':
            default:
                return 'end_turn';
        }
    }
}
```

#### Étape 3 : Mettre à jour les Routes API

**Fichier :** `backend/src/routes/providers.ts`

Ajouter dans `testProviderConnection()` (ligne ~575) :

```typescript
async function testProviderConnection(
  type: ProviderType,
  apiKey: string,
  baseUrl?: string | null,
  provider?: any
): Promise<{ success: boolean; error?: string; models?: string[] }> {
  // ... code existant ...

  switch (type) {
    // ... cas existants ...

    case 'CODEX':
      endpoint = 'https://api.openai.com/v1/models';
      headers = {
        'authorization': `Bearer ${apiKey}`,
      };
      break;

    // ... reste du code ...
  }
}
```

Ajouter dans `createDefaultModels()` (ligne ~686) :

```typescript
const defaultModels: Record<string, Array<...>> = {
  // ... modèles existants ...

  CODEX: [
    { 
      model_id: 'codex-latest', 
      display_name: 'Codex Latest', 
      context_window: 128000, 
      max_output_tokens: 4096 
    },
    { 
      model_id: 'codex-mini', 
      display_name: 'Codex Mini', 
      context_window: 128000, 
      max_output_tokens: 4096 
    },
  ],

  // ... reste ...
};
```

Mettre à jour le schéma de validation Zod (lignes 14-28) :

```typescript
const CreateProviderSchema = z.object({
  type: z.enum(['ANTHROPIC', 'ZHIPU', 'OPENAI', 'CUSTOM', 'GEMINI', 'ANTIGRAVITY', 'CODEX']),
  // ... reste inchangé ...
});
```

#### Étape 4 : Mettre à jour ProviderManager

**Fichier :** `backend/src/services/ProviderManager.ts`

Ajouter dans `FALLBACK_ORDER` (ligne ~43) :

```typescript
const FALLBACK_ORDER: Record<string, string[]> = {
  // ... ordres existants ...
  CODEX: ['ANTHROPIC', 'ZHIPU', 'OPENAI'],
};
```

#### Étape 5 : Mettre à jour les Types Frontend

**Fichier :** `lea-app/types/index.ts`

```typescript
// Ligne ~204
export type ApiProviderType = 
  | 'ANTHROPIC' 
  | 'ZHIPU' 
  | 'OPENAI' 
  | 'GEMINI' 
  | 'CUSTOM' 
  | 'ANTIGRAVITY'
  | 'CODEX';  // ➕ AJOUTER

export type ProviderType = 
  | 'anthropic' 
  | 'zhipu' 
  | 'openai' 
  | 'gemini' 
  | 'custom' 
  | 'antigravity'
  | 'codex';  // ➕ AJOUTER
```

---

### 2.2 Provider 2 : OpenCode Go

#### Étape 1 : Mettre à jour le Schéma Prisma

**Fichier :** `backend/prisma/schema.prisma`

```prisma
enum ProviderType {
  ANTHROPIC
  ZHIPU
  OPENAI
  CUSTOM
  GEMINI
  ANTIGRAVITY
  CODEX
  OPENCODE    // ➕ AJOUTER
}
```

**Migration :**

```bash
cd backend
npx prisma migrate dev --name add_opencode_provider
```

#### Étape 2 : Créer le Client OpenCode

**Fichier :** `backend/src/services/ai/OpenCodeClient.ts`

```typescript
/**
 * OpenCodeClient - OpenCode Go API implementation
 * 
 * OpenCode Go expose un endpoint OpenAI-compatible.
 * Utilise la même structure que ZhipuClient avec base URL configurable.
 */

import type {
    AIClient,
    StreamChatParams,
    StreamResult,
    ContentBlock,
    ChatMessage,
    ToolDefinition,
    TextContent,
    ToolUseContent,
} from './AIClient.js';

// Configuration par défaut pour OpenCode Go
const OPENCODE_DEFAULT_BASE_URL = 'https://api.opencode.ai/v1';

interface OpenCodeToolCall {
    id?: string;
    type?: 'function';
    function?: {
        name?: string;
        arguments?: string;
    };
}

interface OpenCodeChoice {
    index?: number;
    delta?: {
        role?: string;
        content?: string | null;
        tool_calls?: OpenCodeToolCall[];
    };
    finish_reason?: string | null;
}

interface OpenCodeStreamChunk {
    id?: string;
    object?: string;
    created?: number;
    model?: string;
    choices?: OpenCodeChoice[];
}

interface OpenCodeConfig {
    baseUrl: string;
    apiKey: string;
    defaultModel: string;
}

export class OpenCodeClient implements AIClient {
    private config: OpenCodeConfig;

    constructor(apiKey: string, baseUrl?: string, defaultModel?: string) {
        this.config = {
            baseUrl: baseUrl || OPENCODE_DEFAULT_BASE_URL,
            apiKey,
            defaultModel: defaultModel || 'opencode-go',
        };
    }

    getProviderName(): string {
        return 'opencode';
    }

    async streamChat(params: StreamChatParams): Promise<StreamResult> {
        const {
            model,
            messages,
            tools,
            systemPrompt,
            maxTokens = 4096,
            onEvent,
            signal,
        } = params;

        const openCodeMessages = this.toOpenCodeMessages(messages, systemPrompt);
        const openCodeTools = this.toOpenCodeTools(tools);

        const body: Record<string, unknown> = {
            model: model || this.config.defaultModel,
            messages: openCodeMessages,
            max_tokens: maxTokens,
            stream: true,
            temperature: 0.7,
        };

        if (openCodeTools.length > 0) {
            body.tools = openCodeTools;
            body.tool_choice = 'auto';
        }

        console.log(`[OpenCodeClient] Sending request to ${this.config.baseUrl}/chat/completions`);
        console.log(`[OpenCodeClient] Model: ${body.model}`);

        const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.config.apiKey}`,
                'Content-Type': 'application/json',
                'X-Client': 'lea-platform',
            },
            body: JSON.stringify(body),
            signal,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[OpenCodeClient] API error: ${response.status} - ${errorText}`);
            throw new Error(`OpenCode API error: ${response.status} - ${errorText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
            throw new Error('No response body from OpenCode');
        }

        const contentBlocks: ContentBlock[] = [];
        let currentTextBlock: TextContent | null = null;
        let currentToolUse: {
            id: string;
            name: string;
            argumentsJson: string;
            index: number;
        } | null = null;
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason: string = 'stop';

        onEvent({ type: 'message_start' });

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = new TextDecoder().decode(value);
                const lines = chunk.split('\n').filter(line => line.trim());

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') continue;

                        try {
                            const parsed: OpenCodeStreamChunk = JSON.parse(data);
                            const choice = parsed.choices?.[0];

                            if (choice?.delta?.content) {
                                if (!currentTextBlock) {
                                    currentTextBlock = { type: 'text', text: '' };
                                }
                                currentTextBlock.text += choice.delta.content;
                                onEvent({ type: 'text_delta', text: choice.delta.content });
                                outputTokens += 1; // Estimation
                            }

                            if (choice?.delta?.tool_calls) {
                                const toolCall = choice.delta.tool_calls[0];
                                if (toolCall?.id) {
                                    currentToolUse = {
                                        id: toolCall.id,
                                        name: toolCall.function?.name || '',
                                        argumentsJson: toolCall.function?.arguments || '',
                                        index: toolCall.index || 0,
                                    };
                                } else if (currentToolUse && toolCall?.function?.arguments) {
                                    currentToolUse.argumentsJson += toolCall.function.arguments;
                                }
                            }

                            if (choice?.finish_reason) {
                                stopReason = choice.finish_reason;
                                
                                if (currentTextBlock) {
                                    contentBlocks.push(currentTextBlock);
                                    currentTextBlock = null;
                                }
                                
                                if (currentToolUse) {
                                    let input: Record<string, unknown> = {};
                                    try {
                                        input = JSON.parse(currentToolUse.argumentsJson || '{}');
                                    } catch {
                                        console.warn('[OpenCodeClient] Failed to parse tool arguments');
                                    }
                                    
                                    const toolBlock: ToolUseContent = {
                                        type: 'tool_use',
                                        id: currentToolUse.id,
                                        name: currentToolUse.name,
                                        input,
                                    };
                                    contentBlocks.push(toolBlock);
                                    onEvent({
                                        type: 'tool_use',
                                        id: currentToolUse.id,
                                        name: currentToolUse.name,
                                        input,
                                    });
                                    currentToolUse = null;
                                }
                            }
                        } catch (err) {
                            console.warn('[OpenCodeClient] Failed to parse SSE chunk:', err);
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        onEvent({ type: 'message_end' });

        // Estimer les tokens input (très approximatif)
        inputTokens = Math.ceil(
            messages.reduce((acc, m) => acc + JSON.stringify(m).length / 4, 0)
        );

        onEvent({
            type: 'usage',
            inputTokens,
            outputTokens,
        });
        onEvent({
            type: 'message_stop',
            stopReason,
        });

        return {
            stopReason: this.mapStopReason(stopReason),
            content: contentBlocks,
            usage: {
                inputTokens,
                outputTokens,
            },
        };
    }

    private toOpenCodeMessages(
        messages: ChatMessage[],
        systemPrompt?: string
    ): Array<{ role: string; content: string }> {
        const result: Array<{ role: string; content: string }> = [];

        if (systemPrompt) {
            result.push({ role: 'system', content: systemPrompt });
        }

        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                result.push({
                    role: msg.role,
                    content: msg.content,
                });
            } else {
                const textParts: string[] = [];
                for (const block of msg.content) {
                    if (block.type === 'text') {
                        textParts.push(block.text);
                    } else if (block.type === 'tool_result') {
                        textParts.push(`Tool result: ${block.content}`);
                    }
                }
                result.push({
                    role: msg.role,
                    content: textParts.join('\n'),
                });
            }
        }

        return result;
    }

    private toOpenCodeTools(tools: ToolDefinition[]): Array<{
        type: 'function';
        function: {
            name: string;
            description: string;
            parameters: Record<string, unknown>;
        };
    }> {
        return tools.map(tool => ({
            type: 'function' as const,
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        }));
    }

    private mapStopReason(
        reason: string | null
    ): StreamResult['stopReason'] {
        switch (reason) {
            case 'tool_calls':
                return 'tool_use';
            case 'length':
                return 'max_tokens';
            case 'stop':
            default:
                return 'end_turn';
        }
    }
}
```

#### Étape 3 : Mettre à jour les Routes API

**Fichier :** `backend/src/routes/providers.ts`

Ajouter dans `testProviderConnection()` :

```typescript
case 'OPENCODE': {
  endpoint = baseUrl || 'https://api.opencode.ai/v1/models';
  headers = {
    'authorization': `Bearer ${apiKey}`,
  };
  break;
}
```

Ajouter dans `createDefaultModels()` :

```typescript
OPENCODE: [
  { 
    model_id: 'opencode-go', 
    display_name: 'OpenCode Go', 
    context_window: 128000, 
    max_output_tokens: 4096 
  },
  { 
    model_id: 'opencode-glm-5', 
    display_name: 'OpenCode GLM-5', 
    context_window: 1000000, 
    max_output_tokens: 4096 
  },
  { 
    model_id: 'opencode-kimi', 
    display_name: 'OpenCode Kimi', 
    context_window: 200000, 
    max_output_tokens: 4096 
  },
],
```

Mettre à jour le schéma Zod :

```typescript
const CreateProviderSchema = z.object({
  type: z.enum([
    'ANTHROPIC', 'ZHIPU', 'OPENAI', 'CUSTOM', 'GEMINI', 'ANTIGRAVITY', 
    'CODEX', 'OPENCODE'  // ➕ AJOUTER
  ]),
  // ...
});
```

#### Étape 4 : Mettre à jour ProviderManager

**Fichier :** `backend/src/services/ProviderManager.ts`

```typescript
const FALLBACK_ORDER: Record<string, string[]> = {
  // ... existants ...
  CODEX: ['ANTHROPIC', 'ZHIPU', 'OPENAI'],
  OPENCODE: ['ANTHROPIC', 'ZHIPU', 'OPENAI', 'CODEX'],
};
```

#### Étape 5 : Mettre à jour les Types Frontend

**Fichier :** `lea-app/types/index.ts`

```typescript
export type ApiProviderType = 
  | 'ANTHROPIC' 
  | 'ZHIPU' 
  | 'OPENAI' 
  | 'GEMINI' 
  | 'CUSTOM' 
  | 'ANTIGRAVITY'
  | 'CODEX'
  | 'OPENCODE';  // ➕ AJOUTER

export type ProviderType = 
  | 'anthropic' 
  | 'zhipu' 
  | 'openai' 
  | 'gemini' 
  | 'custom' 
  | 'antigravity'
  | 'codex'
  | 'opencode';  // ➕ AJOUTER
```

---

## 🎨 3. Interface Utilisateur (Frontend)

### 3.1 Ajouter les Icônes Providers

**Fichier :** `lea-app/components/providers/provider-form.tsx`

```typescript
const providerIcons: Record<string, { icon: string; color: string }> = {
  anthropic: { icon: '🅰️', color: 'from-orange-500 to-red-500' },
  zhipu: { icon: 'Z', color: 'from-blue-500 to-purple-500' },
  openai: { icon: 'O', color: 'from-green-500 to-teal-500' },
  gemini: { icon: 'G', color: 'from-blue-400 to-cyan-400' },
  antigravity: { icon: 'A', color: 'from-purple-500 to-pink-500' },
  codex: { icon: 'C', color: 'from-indigo-500 to-blue-600' },  // ➕
  opencode: { icon: '🔓', color: 'from-emerald-500 to-green-600' },  // ➕
};
```

### 3.2 Formulaire de Configuration

**Fichier :** `lea-app/components/providers/provider-form.tsx`

Ajouter les champs spécifiques pour chaque provider dans le formulaire :

```typescript
// Pour Codex
{type === 'codex' && (
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium mb-2">
        OpenAI API Key
      </label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="sk-proj-..."
        className="w-full px-3 py-2 border rounded-md"
      />
      <p className="text-xs text-gray-500 mt-1">
        Get your key from platform.openai.com
      </p>
    </div>
  </div>
)}

// Pour OpenCode
{type === 'opencode' && (
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium mb-2">
        OpenCode API Key
      </label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="oc-..."
        className="w-full px-3 py-2 border rounded-md"
      />
    </div>
    <div>
      <label className="block text-sm font-medium mb-2">
        Base URL (optional)
      </label>
      <input
        type="url"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder="https://api.opencode.ai/v1"
        className="w-full px-3 py-2 border rounded-md"
      />
    </div>
  </div>
)}
```

---

## 🧪 4. Tests et Validation

### 4.1 Tests Unitaires Backend

**Créer** `backend/src/services/ai/__tests__/CodexClient.test.ts` :

```typescript
import { describe, it, expect, vi } from 'vitest';
import { CodexClient } from '../CodexClient.js';

describe('CodexClient', () => {
  it('should initialize with API key', () => {
    const client = new CodexClient('test-key');
    expect(client.getProviderName()).toBe('codex');
  });

  it('should handle streaming response', async () => {
    const client = new CodexClient('test-key');
    const events: any[] = [];

    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({
          read: vi.fn()
            .mockResolvedValueOnce({
              done: false,
              value: new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
            })
            .mockResolvedValueOnce({ done: true }),
          releaseLock: vi.fn(),
        }),
      },
    });

    await client.streamChat({
      model: 'codex-latest',
      messages: [{ role: 'user', content: 'Hello' }],
      tools: [],
      systemPrompt: '',
      onEvent: (e) => events.push(e),
    });

    expect(events.some(e => e.type === 'text_delta')).toBe(true);
  });
});
```

### 4.2 Test d'Intégration

**Script de test :** `scripts/test-providers.sh`

```bash
#!/bin/bash

echo "Testing AI Providers Integration..."

# Test Codex
echo "1. Testing Codex provider..."
curl -X POST http://localhost:3001/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "codex-test",
    "type": "CODEX",
    "display_name": "Codex Test",
    "api_key": "'$OPENAI_API_KEY'"
  }'

# Test connection
echo "2. Testing connection..."
curl -X POST http://localhost:3001/api/providers/codex-test/test

# Test OpenCode
echo "3. Testing OpenCode provider..."
curl -X POST http://localhost:3001/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "opencode-test",
    "type": "OPENCODE",
    "display_name": "OpenCode Test",
    "api_key": "'$OPENCODE_API_KEY'",
    "base_url": "https://api.opencode.ai/v1"
  }'

echo "Done!"
```

---

## 📋 5. Checklist d'Implémentation

### Phase 1 : Backend (Priorité Haute)

- [ ] **Schéma Prisma** - Ajouter `CODEX` et `OPENCODE` à l'enum `ProviderType`
- [ ] **Migrations** - Exécuter `prisma migrate dev` pour les deux providers
- [ ] **CodexClient.ts** - Créer l'implémentation complète
- [ ] **OpenCodeClient.ts** - Créer l'implémentation complète
- [ ] **Routes API** - Mettre à jour `providers.ts` avec les nouveaux types
- [ ] **ProviderManager** - Ajouter les chaînes de fallback
- [ ] **Default Models** - Définir les modèles par défaut
- [ ] **Tests** - Écrire les tests unitaires

### Phase 2 : Docker & Configuration (Priorité Haute)

- [ ] **Secrets** - Créer les fichiers dans `/secrets/`
- [ ] **docker-compose.yml** - Ajouter les secrets et variables d'environnement
- [ ] **SecretLoader.ts** - Implémenter le chargement des secrets
- [ ] **.env.example** - Documenter les nouvelles variables
- [ ] **Security** - Vérifier les permissions des fichiers (600)

### Phase 3 : Frontend (Priorité Moyenne)

- [ ] **Types** - Mettre à jour `types/index.ts`
- [ ] **Icônes** - Ajouter les icônes pour Codex et OpenCode
- [ ] **Formulaire** - Ajouter les champs spécifiques
- [ ] **Validation** - Vérifier les schémas Zod
- [ ] **UI Tests** - Tester le flux de création

### Phase 4 : Intégration & Tests (Priorité Haute)

- [ ] **Build** - Vérifier que le build passe
- [ ] **Tests** - Exécuter tous les tests
- [ ] **Provider Creation** - Tester création via UI
- [ ] **Connection Test** - Tester bouton "Test Connection"
- [ ] **End-to-End** - Tester un pentest complet
- [ ] **Fallback** - Vérifier les chaînes de fallback

---

## 💰 6. Tarification et Limites

### 6.1 Codex (OpenAI)

| Modèle | Input | Output | Context |
|--------|-------|--------|---------|
| codex-latest | $2.50/1M | $15.00/1M | 128K |
| codex-mini | $0.25/1M | $2.00/1M | 128K |

**Notes :**
- Utilise les mêmes clés API qu'OpenAI
- Pas de coût additionnel pour Codex
- Limites de rate : Dépend du tier OpenAI

### 6.2 OpenCode Go

| Modèle | Input | Output | Context |
|--------|-------|--------|---------|
| opencode-go | Variable | Variable | 128K |
| opencode-glm-5 | Variable | Variable | 1M |

**Notes :**
- Tarification définie par OpenCode
- Peut nécessiter un abonnement
- Vérifier la documentation OpenCode pour les tarifs exacts

---

## 🔒 7. Considérations de Sécurité

### 7.1 Chiffrement

- Les clés API sont **déjà chiffrées** avec AES-256-GCM via `CryptoService`
- Stockage : `api_key_encrypted`, `api_key_iv`, `api_key_auth_tag`
- Le hash permet de détecter les doublons sans révéler la clé

### 7.2 Accès

- Jamais exposer les clés API dans les réponses API
- Utiliser `api_key_masked` pour afficher uniquement les 4 derniers caractères
- Logs : Ne jamais logger les clés complètes

### 7.3 Docker

- Utiliser `read_only: true` pour le filesystem
- `no-new-privileges:true` pour empêcher l'escalade de privilèges
- `cap_drop: ALL` pour supprimer les capabilities inutiles
- Secrets montés en read-only (`:ro`)

---

## 📚 8. Références

### Documentation Officielle

- **Anthropic Claude API**: https://docs.claude.com/en/api/getting-started
- **OpenAI API**: https://platform.openai.com/docs/api-reference
- **OpenAI Codex**: https://platform.openai.com/docs/guides/codex
- **OpenCode**: https://opencode.ai/docs (vérifier l'URL exacte)

### Code Source Référence

- **OpenCode Implementation**: https://github.com/opencode-ai/opencode
- **ZhipuClient.ts** - Exemple d'implémentation OpenAI-compatible
- **AnthropicClient.ts** - Exemple d'implémentation native

### Tarification

- **Anthropic**: https://platform.claude.com/settings/billing
- **OpenAI**: https://openai.com/pricing
- **OpenCode**: Vérifier auprès du support OpenCode

---

## 🚀 9. Prochaines Étapes Recommandées

### Option A : Implémentation Complète (Recommandé)

1. Commencer par **Codex** (plus simple, API OpenAI compatible)
2. Tester avec une clé OpenAI existante
3. Passer à **OpenCode** (nécessite vérification de l'API)
4. Mettre à jour l'UI
5. Déployer et tester

### Option B : MVP Minimal

1. Implémenter uniquement **Codex** d'abord
2. Utiliser le `CUSTOM` provider existant pour OpenCode (avec base_url)
3. Migrer vers un provider dédié plus tard

### Option C : Docker First

1. Configurer Docker avec les secrets
2. Tester le chargement des secrets
3. Implémenter les providers
4. Déployer

---

## ❓ FAQ

**Q: Puis-je utiliser la même clé OpenAI pour Codex et GPT-4 ?**
R: Oui, Codex utilise les mêmes clés API qu'OpenAI.

**Q: OpenCode est-il compatible OpenAI ?**
R: Oui, selon votre description, OpenCode expose un endpoint OpenAI-compatible (`/v1/chat/completions`).

**Q: Comment obtenir une clé OpenCode ?**
R: Il faut s'inscrire sur opencode.ai et générer une clé API dans les paramètres.

**Q: Puis-je tester sans clé API ?**
R: Non, tous ces providers nécessitent une clé API valide.

**Q: Que faire si l'API OpenCode change ?**
R: Mettre à jour `OpenCodeClient.ts` et redéployer. L'interface `AIClient` reste stable.

---

## 📝 Notes de Version

**v1.0** - 16 Mars 2026
- Création initiale du guide
- Spécifications Codex et OpenCode
- Configuration Docker
- Checklist complète

---

**Document créé par :** Claude Code (AI Assistant)  
**Date :** 16 Mars 2026  
**Statut :** Prêt pour implémentation  
**Prochaine révision :** Après implémentation Phase 1

---

*Ce document est vivant. Mettre à jour au fur et à mesure des implémentations et des retours.*
