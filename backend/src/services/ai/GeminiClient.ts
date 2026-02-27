/**
 * GeminiClient - Google Gemini AI provider implementation
 *
 * Supports two auth strategies:
 * 1. Gemini CLI OAuth credentials (~/.gemini/credentials.json)
 * 2. API key passed directly (Google Generative Language API)
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import type {
    AIClient,
    StreamChatParams,
    StreamResult,
    ContentBlock,
    ChatMessage,
    ToolDefinition,
} from './AIClient.js';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CODE_ASSIST_ENDPOINTS = [
    'https://cloudcode-pa.googleapis.com',
] as const;
const GEMINI_OAUTH_CLIENT_ID =
    process.env.GEMINI_OAUTH_CLIENT_ID?.trim() ||
    process.env.GEMINI_CLI_OAUTH_CLIENT_ID?.trim() ||
    '';
const GEMINI_OAUTH_CLIENT_SECRET =
    process.env.GEMINI_OAUTH_CLIENT_SECRET?.trim() ||
    process.env.GEMINI_CLI_OAUTH_CLIENT_SECRET?.trim() ||
    '';
const OAUTH_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const CODE_ASSIST_MODEL_ALIASES: Record<string, string> = {
    'gemini-3.1-pro': 'gemini-3-pro-preview',
    'gemini-1.5-pro-002': 'gemini-2.5-pro',
};
const CODE_ASSIST_MODEL_FALLBACKS: Record<string, string[]> = {
    'gemini-3-pro-preview': ['gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    'gemini-3-flash-preview': ['gemini-2.5-flash', 'gemini-2.0-flash'],
    'gemini-2.5-pro': ['gemini-2.5-flash', 'gemini-2.0-flash'],
    'gemini-2.5-flash': ['gemini-2.0-flash'],
};

interface GeminiCliCredentials extends Record<string, unknown> {
    access_token: string;
    refresh_token?: string;
    expiry?: string;
    expiry_date?: number;
    client_id?: string;
    client_secret?: string;
    token_type?: string;
    scope?: string;
}

export interface GeminiOAuthOptions {
    accessToken?: string | null;
    refreshToken?: string | null;
    expiresAt?: string | number | Date | null;
    clientId?: string | null;
    clientSecret?: string | null;
}

// Google Generative AI API types
interface GeminiPart {
    text?: string;
    thought?: boolean;
    thoughtSignature?: string;
    thought_signature?: string;
    functionCall?: { name: string; args: Record<string, unknown> };
    functionResponse?: { name: string; response: Record<string, unknown> };
}

interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

interface GeminiTool {
    function_declarations: Array<{
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }>;
}

export class GeminiClient implements AIClient {
    private apiKey?: string;
    private cliCreds?: GeminiCliCredentials;
    private activeCredPath?: string;
    private codeAssistProjectId?: string;
    private codeAssistEndpoint?: string;

    constructor(apiKey?: string, oauth?: GeminiOAuthOptions) {
        this.apiKey = apiKey;
        this.loadCliCredentials();
        this.loadProvidedOAuthCredentials(oauth);
    }

    getProviderName(): string {
        return 'gemini';
    }

    private loadCliCredentials(): void {
        try {
            const credCandidates = [
                path.join(os.homedir(), '.gemini', 'credentials.json'),
                path.join(os.homedir(), '.gemini', 'oauth_creds.json'),
            ];

            for (const filePath of credCandidates) {
                if (!fs.existsSync(filePath)) continue;
                const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Record<string, unknown>;
                const normalized = this.normalizeCliCreds(parsed);
                if (!normalized.access_token && !normalized.refresh_token) continue;
                this.cliCreds = normalized;
                this.activeCredPath = filePath;
                break;
            }
        } catch {
            // CLI creds not available
        }
    }

    private normalizeCliCreds(raw: Record<string, unknown>): GeminiCliCredentials {
        const expiryDate = typeof raw.expiry_date === 'number' ? raw.expiry_date : undefined;
        const expiryIso =
            typeof raw.expiry === 'string'
                ? raw.expiry
                : expiryDate
                    ? new Date(expiryDate).toISOString()
                    : undefined;

        return {
            ...raw,
            access_token: typeof raw.access_token === 'string' ? raw.access_token : '',
            refresh_token: typeof raw.refresh_token === 'string' ? raw.refresh_token : undefined,
            expiry: expiryIso,
            expiry_date: expiryDate,
            client_id: typeof raw.client_id === 'string' ? raw.client_id : undefined,
            client_secret: typeof raw.client_secret === 'string' ? raw.client_secret : undefined,
            token_type: typeof raw.token_type === 'string' ? raw.token_type : undefined,
            scope: typeof raw.scope === 'string' ? raw.scope : undefined,
        };
    }

    private loadProvidedOAuthCredentials(oauth?: GeminiOAuthOptions): void {
        if (!oauth) return;

        const accessToken = typeof oauth.accessToken === 'string' ? oauth.accessToken.trim() : '';
        const refreshToken = typeof oauth.refreshToken === 'string' ? oauth.refreshToken.trim() : '';

        if (!accessToken && !refreshToken) {
            return;
        }

        let expiryDate: number | undefined;
        if (oauth.expiresAt instanceof Date) {
            const ts = oauth.expiresAt.getTime();
            expiryDate = Number.isFinite(ts) ? ts : undefined;
        } else if (typeof oauth.expiresAt === 'number') {
            expiryDate = Number.isFinite(oauth.expiresAt) ? oauth.expiresAt : undefined;
        } else if (typeof oauth.expiresAt === 'string' && oauth.expiresAt.trim()) {
            const ts = new Date(oauth.expiresAt).getTime();
            expiryDate = Number.isFinite(ts) ? ts : undefined;
        }

        const existing = this.cliCreds;

        this.cliCreds = {
            ...existing,
            access_token: accessToken || existing?.access_token || '',
            refresh_token: refreshToken || existing?.refresh_token,
            expiry: expiryDate ? new Date(expiryDate).toISOString() : existing?.expiry,
            expiry_date: expiryDate || existing?.expiry_date,
            client_id:
                (typeof oauth.clientId === 'string' && oauth.clientId.trim())
                    ? oauth.clientId.trim()
                    : (existing?.client_id || GEMINI_OAUTH_CLIENT_ID || undefined),
            client_secret:
                (typeof oauth.clientSecret === 'string' && oauth.clientSecret.trim())
                    ? oauth.clientSecret.trim()
                    : (existing?.client_secret || GEMINI_OAUTH_CLIENT_SECRET || undefined),
            token_type: existing?.token_type,
            scope: existing?.scope,
        };

        // Credentials are managed by LEA DB, not by local CLI files in this case.
        this.activeCredPath = undefined;
    }

    private hasCliOAuthCreds(): boolean {
        return !!(this.cliCreds?.access_token || this.cliCreds?.refresh_token);
    }

    private getCliExpiryMs(): number | undefined {
        if (!this.cliCreds) return undefined;
        if (typeof this.cliCreds.expiry_date === 'number') return this.cliCreds.expiry_date;
        if (typeof this.cliCreds.expiry === 'string') {
            const ts = new Date(this.cliCreds.expiry).getTime();
            return Number.isFinite(ts) ? ts : undefined;
        }
        return undefined;
    }

    private buildApiKeyUrl(model: string): string {
        const endpoint = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`;
        return this.apiKey
            ? `${endpoint}&key=${encodeURIComponent(this.apiKey)}`
            : endpoint;
    }

    private getCodeAssistEndpoints(): string[] {
        const fromEnv = process.env.GEMINI_CODE_ASSIST_ENDPOINTS
            ?.split(',')
            .map((v) => v.trim())
            .filter(Boolean) || [];

        const ordered = [
            this.codeAssistEndpoint,
            ...fromEnv,
            ...CODE_ASSIST_ENDPOINTS,
        ].filter(Boolean) as string[];

        return [...new Set(ordered)];
    }

    private getDefaultHeaders(model: string, accessToken?: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'User-Agent': `GeminiCLI/LEA/${model} (${process.platform}; ${process.arch})`,
        };

        if (accessToken) {
            headers.Authorization = `Bearer ${accessToken}`;
        }

        return headers;
    }

    private async getOAuthAccessToken(): Promise<string> {
        if (!this.cliCreds) {
            throw new Error('Gemini CLI OAuth credentials not found.');
        }

        const currentToken = this.cliCreds.access_token;
        const expiryMs = this.getCliExpiryMs();
        const now = Date.now();

        if (currentToken && (!expiryMs || expiryMs - now > OAUTH_REFRESH_BUFFER_MS)) {
            return currentToken;
        }

        if (this.cliCreds.refresh_token) {
            await this.refreshCliToken();
            if (this.cliCreds?.access_token) {
                return this.cliCreds.access_token;
            }
        }

        throw new Error('No usable Gemini OAuth token. Reconnect Gemini OAuth in Provider settings.');
    }

    private async refreshCliToken(): Promise<void> {
        if (!this.cliCreds?.refresh_token) {
            throw new Error('Missing refresh token for Gemini CLI OAuth credentials.');
        }

        const clientId = this.cliCreds.client_id || GEMINI_OAUTH_CLIENT_ID;
        const clientSecret = this.cliCreds.client_secret || GEMINI_OAUTH_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            throw new Error(
                'Missing Gemini OAuth client credentials. Set GEMINI_OAUTH_CLIENT_ID and GEMINI_OAUTH_CLIENT_SECRET, or reconnect Gemini with credentials that include client_id/client_secret.'
            );
        }

        const response = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.cliCreds.refresh_token,
                client_id: clientId,
                client_secret: clientSecret,
            }).toString(),
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Failed to refresh Gemini OAuth token (${response.status}): ${err.substring(0, 500)}`);
        }

        const data = await response.json() as {
            access_token: string;
            expires_in: number;
            token_type?: string;
            scope?: string;
        };
        const expiryDate = Date.now() + data.expires_in * 1000;

        this.cliCreds = {
            ...this.cliCreds,
            access_token: data.access_token,
            expiry: new Date(expiryDate).toISOString(),
            expiry_date: expiryDate,
            token_type: data.token_type || this.cliCreds.token_type,
            scope: data.scope || this.cliCreds.scope,
        };

        this.persistCliCreds();
    }

    private persistCliCreds(): void {
        try {
            if (!this.activeCredPath || !this.cliCreds) return;

            const toSave: Record<string, unknown> = { ...this.cliCreds };
            if (this.activeCredPath.endsWith('oauth_creds.json')) {
                toSave.expiry_date = this.cliCreds.expiry_date || Date.now() + OAUTH_REFRESH_BUFFER_MS;
                delete toSave.expiry;
            } else if (!toSave.expiry && typeof this.cliCreds.expiry_date === 'number') {
                toSave.expiry = new Date(this.cliCreds.expiry_date).toISOString();
            }

            fs.writeFileSync(this.activeCredPath, JSON.stringify(toSave, null, 2), { mode: 0o600 });
        } catch {
            // Ignore write errors
        }
    }

    private async resolveCodeAssistProject(accessToken: string, model: string): Promise<{ endpoint: string; projectId: string }> {
        if (this.codeAssistProjectId && this.codeAssistEndpoint) {
            return {
                endpoint: this.codeAssistEndpoint,
                projectId: this.codeAssistProjectId,
            };
        }

        const headers = this.getDefaultHeaders(model, accessToken);
        const body = JSON.stringify({
            metadata: {
                ideType: 'IDE_UNSPECIFIED',
                platform: 'PLATFORM_UNSPECIFIED',
                pluginType: 'GEMINI',
            },
        });
        const errors: string[] = [];

        for (const endpoint of this.getCodeAssistEndpoints()) {
            const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
                method: 'POST',
                headers,
                body,
            });

            if (!response.ok) {
                const text = await response.text();
                errors.push(`${endpoint} -> HTTP ${response.status}: ${text.substring(0, 240)}`);
                continue;
            }

            const payload = await response.json() as Record<string, unknown>;
            const projectId = typeof payload.cloudaicompanionProject === 'string'
                ? payload.cloudaicompanionProject
                : undefined;

            if (!projectId) {
                errors.push(`${endpoint} -> loadCodeAssist returned no cloudaicompanionProject`);
                continue;
            }

            this.codeAssistEndpoint = endpoint;
            this.codeAssistProjectId = projectId;
            return { endpoint, projectId };
        }

        throw new Error(`Gemini Code Assist setup failed: ${errors.join(' | ')}`);
    }

    private toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
        const contents: GeminiContent[] = [];
        const toolNameById = new Map<string, string>();

        for (const msg of messages) {
            const role = msg.role === 'assistant' ? 'model' : 'user';

            if (typeof msg.content === 'string') {
                contents.push({ role, parts: [{ text: msg.content }] });
                continue;
            }

            const parts: GeminiPart[] = [];
            const functionResponseParts: GeminiPart[] = [];
            for (const block of msg.content) {
                if (block.type === 'text') {
                    parts.push({ text: block.text });
                } else if (block.type === 'tool_use') {
                    toolNameById.set(block.id, block.name);
                    const part: GeminiPart = {
                        functionCall: {
                            name: block.name,
                            args: block.input,
                        },
                    };
                    if (typeof block.thought_signature === 'string' && block.thought_signature.trim()) {
                        part.thoughtSignature = block.thought_signature;
                    }
                    parts.push(part);
                } else if (block.type === 'tool_result') {
                    // Gemini expects function responses grouped in the same user turn
                    // corresponding to a previous function-call turn.
                    const toolName = toolNameById.get(block.tool_use_id) || block.tool_use_id;
                    functionResponseParts.push({
                        functionResponse: {
                            name: toolName,
                            response: {
                                result: block.content,
                                is_error: block.is_error === true,
                                tool_use_id: block.tool_use_id,
                            },
                        },
                    });
                }
            }

            if (parts.length > 0) {
                contents.push({ role, parts });
            }
            if (functionResponseParts.length > 0) {
                contents.push({ role: 'user', parts: functionResponseParts });
            }
        }

        return contents;
    }

    private toGeminiTools(tools: ToolDefinition[]): GeminiTool[] {
        if (tools.length === 0) return [];
        return [{
            function_declarations: tools.map(t => ({
                name: t.name,
                description: t.description,
                parameters: t.input_schema,
            })),
        }];
    }

    private parseToolInput(rawArgs: unknown): Record<string, unknown> {
        if (rawArgs && typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
            return rawArgs as Record<string, unknown>;
        }

        if (typeof rawArgs === 'string') {
            try {
                const parsed = JSON.parse(rawArgs);
                if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                    return parsed as Record<string, unknown>;
                }
            } catch {
                // Ignore parse errors and fallback to empty object.
            }
        }

        return {};
    }

    private extractThoughtSignature(part: GeminiPart): string | undefined {
        if (typeof part.thoughtSignature === 'string' && part.thoughtSignature.trim()) {
            return part.thoughtSignature.trim();
        }
        if (typeof part.thought_signature === 'string' && part.thought_signature.trim()) {
            return part.thought_signature.trim();
        }
        return undefined;
    }

    private normalizeCodeAssistModel(model: string): string {
        const normalized = String(model || '').trim().toLowerCase();
        return CODE_ASSIST_MODEL_ALIASES[normalized] || model;
    }

    private getCodeAssistModelCandidates(model: string): string[] {
        const primary = this.normalizeCodeAssistModel(model);
        const fallback = CODE_ASSIST_MODEL_FALLBACKS[String(primary).toLowerCase()] || [];
        return [...new Set([primary, ...fallback])];
    }

    private isRetryableCapacityError(status: number, errorText: string): boolean {
        if (status === 429 || status === 503) return true;
        const text = String(errorText || '').toLowerCase();
        return text.includes('resource_exhausted') || text.includes('no capacity available');
    }

    private isFatalCodeAssistError(status: number): boolean {
        return status === 400 || status === 401 || status === 403;
    }

    async streamChat(params: StreamChatParams): Promise<StreamResult> {
        const {
            model,
            messages,
            tools,
            systemPrompt,
            maxTokens = 8192,
            onEvent,
            signal,
            thinkingBudget,
        } = params;

        let response: Response | null = null;
        let oauthError: Error | null = null;

        const generationConfig: Record<string, unknown> = { maxOutputTokens: maxTokens };
        if (typeof thinkingBudget === 'number' && Number.isFinite(thinkingBudget)) {
            const normalizedBudget = Math.trunc(thinkingBudget);
            if (normalizedBudget !== 0) {
                generationConfig.thinkingConfig = {
                    includeThoughts: true,
                    thinkingBudget: normalizedBudget,
                };
            }
        }

        // Try Gemini CLI OAuth (Code Assist API) first when credentials are available.
        if (this.hasCliOAuthCreds()) {
            try {
                const accessToken = await this.getOAuthAccessToken();
                const modelCandidates = this.getCodeAssistModelCandidates(model);
                const { projectId, endpoint } = await this.resolveCodeAssistProject(accessToken, modelCandidates[0]);
                const endpoints = [endpoint, ...this.getCodeAssistEndpoints().filter((e) => e !== endpoint)];
                const failedAttempts: string[] = [];
                let fatalErrorDetected = false;

                for (const candidateModel of modelCandidates) {
                    const codeAssistBody: Record<string, unknown> = {
                        model: candidateModel,
                        project: projectId,
                        request: {
                            contents: this.toGeminiContents(messages),
                            generationConfig,
                        },
                    };

                    if (systemPrompt) {
                        (codeAssistBody.request as Record<string, unknown>).systemInstruction = {
                            parts: [{ text: systemPrompt }],
                        };
                    }
                    if (tools.length > 0) {
                        (codeAssistBody.request as Record<string, unknown>).tools = this.toGeminiTools(tools);
                    }

                    let shouldTryNextModel = false;

                    for (const currentEndpoint of endpoints) {
                        const res = await fetch(`${currentEndpoint}/v1internal:streamGenerateContent?alt=sse`, {
                            method: 'POST',
                            headers: this.getDefaultHeaders(candidateModel, accessToken),
                            body: JSON.stringify(codeAssistBody),
                            signal: signal as any,
                        });

                        if (res.ok) {
                            this.codeAssistEndpoint = currentEndpoint;
                            response = res;
                            break;
                        }

                        const errorText = await res.text();
                        failedAttempts.push(
                            `${candidateModel}@${currentEndpoint} -> HTTP ${res.status}: ${errorText.substring(0, 200)}`
                        );

                        if (this.isRetryableCapacityError(res.status, errorText)) {
                            shouldTryNextModel = true;
                            continue;
                        }

                        if (this.isFatalCodeAssistError(res.status)) {
                            fatalErrorDetected = true;
                        }
                    }

                    if (response) break;
                    if (fatalErrorDetected) break;
                    if (!shouldTryNextModel) {
                        // Non-retryable and non-capacity issue for this model.
                        break;
                    }
                    console.warn(`[GeminiClient] Code Assist capacity issue on model ${candidateModel}, trying fallback model.`);
                }

                if (!response) {
                    throw new Error(`Code Assist stream request failed: ${failedAttempts.join(' | ')}`);
                }
            } catch (error) {
                oauthError = error instanceof Error ? error : new Error(String(error));
            }
        }

        // Fallback to API key-based Generative Language API.
        if (!response) {
            if (!this.apiKey) {
                if (oauthError) {
                    throw oauthError;
                }
                throw new Error('No Gemini authentication available. Configure Gemini CLI OAuth or provide an API key.');
            }

            const body: Record<string, unknown> = {
                contents: this.toGeminiContents(messages),
                generationConfig,
            };

            if (systemPrompt) {
                body.system_instruction = { parts: [{ text: systemPrompt }] };
            }
            if (tools.length > 0) {
                body.tools = this.toGeminiTools(tools);
            }

            response = await fetch(this.buildApiKeyUrl(model), {
                method: 'POST',
                headers: this.getDefaultHeaders(model),
                body: JSON.stringify(body),
                signal: signal as any,
            });
        }

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API error ${response.status}: ${err.substring(0, 500)}`);
        }

        const contentBlocks: ContentBlock[] = [];
        const functionCallStateByPartIndex = new Map<number, { key: string; blockIndex: number }>();
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason: StreamResult['stopReason'] = 'end_turn';
        let accumulatedText = '';
        let thinkingStarted = false;

        // Process SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        onEvent({ type: 'message_start' });

        const processSseLine = (line: string): void => {
            if (!line.startsWith('data: ')) return;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === '[DONE]') return;

            let chunk: any;
            try {
                chunk = JSON.parse(jsonStr);
            } catch {
                return;
            }

            const payload = chunk.response ?? chunk;
            const candidate = payload?.candidates?.[0];
            if (!candidate) return;

            const parts: GeminiPart[] = candidate.content?.parts || [];
            for (const [partIndex, part] of parts.entries()) {
                const partText = typeof part.text === 'string' ? part.text : '';
                if (partText.length > 0) {
                    if (part.thought === true) {
                        if (!thinkingStarted) {
                            onEvent({ type: 'thinking_start' });
                            thinkingStarted = true;
                        }
                        onEvent({ type: 'thinking_delta', text: partText });
                        continue;
                    }

                    if (thinkingStarted) {
                        onEvent({ type: 'thinking_end' });
                        thinkingStarted = false;
                    }

                    accumulatedText += partText;
                    onEvent({ type: 'text_delta', text: partText });
                    continue;
                }

                if (part.functionCall) {
                    if (thinkingStarted) {
                        onEvent({ type: 'thinking_end' });
                        thinkingStarted = false;
                    }

                    const input = this.parseToolInput(part.functionCall.args);
                    const thoughtSignature = this.extractThoughtSignature(part);
                    const callName = String(part.functionCall.name || '').trim();
                    const callKey = `${callName}:${JSON.stringify(input)}`;
                    const existing = functionCallStateByPartIndex.get(partIndex);

                    if (existing && existing.key === callKey) {
                        const existingBlock = contentBlocks[existing.blockIndex];
                        if (existingBlock?.type === 'tool_use' && thoughtSignature && !existingBlock.thought_signature) {
                            existingBlock.thought_signature = thoughtSignature;
                        }
                        stopReason = 'tool_use';
                        continue;
                    }

                    const toolId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                    const blockIndex = contentBlocks.push({
                        type: 'tool_use',
                        id: toolId,
                        name: callName,
                        input,
                        thought_signature: thoughtSignature,
                    }) - 1;
                    functionCallStateByPartIndex.set(partIndex, { key: callKey, blockIndex });
                    onEvent({
                        type: 'tool_use',
                        id: toolId,
                        name: callName,
                        input,
                        thought_signature: thoughtSignature,
                    });
                    stopReason = 'tool_use';
                }
            }

            const finishReason = candidate.finishReason;
            if (finishReason) {
                if (finishReason === 'STOP') stopReason = stopReason === 'tool_use' ? 'tool_use' : 'end_turn';
                else if (finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
            }

            if (payload?.usageMetadata) {
                inputTokens = payload.usageMetadata.promptTokenCount || 0;
                outputTokens = payload.usageMetadata.candidatesTokenCount || 0;
            }
        };

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                processSseLine(line);
            }
        }

        if (buffer.trim()) {
            processSseLine(buffer.trim());
        }

        if (thinkingStarted) {
            onEvent({ type: 'thinking_end' });
            thinkingStarted = false;
        }

        // Finalize text block
        if (accumulatedText) {
            contentBlocks.push({ type: 'text', text: accumulatedText });
        }

        onEvent({ type: 'message_end' });
        onEvent({ type: 'usage', inputTokens, outputTokens });
        onEvent({ type: 'message_stop', stopReason });

        return {
            stopReason,
            content: contentBlocks,
            usage: { inputTokens, outputTokens },
        };
    }
}
