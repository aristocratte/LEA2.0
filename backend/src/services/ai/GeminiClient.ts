/**
 * GeminiClient - Google Gemini AI provider implementation
 *
 * Supports two auth strategies:
 * 1. Gemini CLI OAuth credentials (~/.gemini/credentials.json)
 * 2. API key passed directly
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
const CLI_CREDS_PATH = path.join(os.homedir(), '.gemini', 'credentials.json');
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

interface GeminiCliCredentials {
    access_token: string;
    refresh_token?: string;
    expiry?: string;
    client_id?: string;
    client_secret?: string;
    token_type?: string;
}

// Google Generative AI API types
interface GeminiPart {
    text?: string;
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

    constructor(apiKey?: string) {
        this.apiKey = apiKey;
        // Try to load CLI credentials
        try {
            const path1 = path.join(os.homedir(), '.gemini', 'credentials.json');
            const path2 = path.join(os.homedir(), '.gemini', 'oauth_creds.json');

            if (fs.existsSync(path1)) {
                const raw = fs.readFileSync(path1, 'utf-8');
                this.cliCreds = JSON.parse(raw);
                this.activeCredPath = path1;
            } else if (fs.existsSync(path2)) {
                const raw = fs.readFileSync(path2, 'utf-8');
                const parsed = JSON.parse(raw);
                this.cliCreds = {
                    ...parsed,
                    expiry: parsed.expiry_date ? new Date(parsed.expiry_date).toISOString() : undefined
                };
                this.activeCredPath = path2;
            }
        } catch {
            // CLI creds not available
        }
    }

    getProviderName(): string {
        return 'gemini';
    }

    private async getAccessToken(): Promise<string> {
        // Prefer CLI OAuth creds
        if (this.cliCreds?.access_token) {
            // Check if expired
            if (this.cliCreds.expiry) {
                const expiry = new Date(this.cliCreds.expiry).getTime();
                const now = Date.now();
                // If more than 5 minutes left, use current token
                if (expiry - now > 5 * 60 * 1000) {
                    return this.cliCreds.access_token;
                }
                // Refresh if we have refresh token
                if (this.cliCreds.refresh_token && this.cliCreds.client_id && this.cliCreds.client_secret) {
                    await this.refreshCliToken();
                    return this.cliCreds!.access_token;
                }
            } else {
                // No expiry field, use token as-is
                return this.cliCreds.access_token;
            }
        }
        throw new Error('No Gemini authentication available. Provide an API key or configure Gemini CLI.');
    }

    private async refreshCliToken(): Promise<void> {
        if (!this.cliCreds?.refresh_token) return;

        const response = await fetch(GOOGLE_TOKEN_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: this.cliCreds.refresh_token,
                client_id: this.cliCreds.client_id || '',
                client_secret: this.cliCreds.client_secret || '',
            }).toString(),
        });

        if (!response.ok) {
            throw new Error(`Failed to refresh Gemini token: ${response.status}`);
        }

        const data = await response.json() as { access_token: string; expires_in: number };
        const expiry = new Date(Date.now() + data.expires_in * 1000).toISOString();
        this.cliCreds = { ...this.cliCreds!, access_token: data.access_token, expiry };

        // Write updated creds back to file
        try {
            if (this.activeCredPath) {
                // Keep the correct format for oauth_creds
                const toSave = this.activeCredPath.endsWith('oauth_creds.json')
                    ? { ...this.cliCreds, expiry_date: new Date(this.cliCreds!.expiry!).getTime(), expiry: undefined }
                    : this.cliCreds;
                fs.writeFileSync(this.activeCredPath, JSON.stringify(toSave, null, 2));
            }
        } catch {
            // Ignore write errors
        }
    }

    private buildUrl(model: string, useApiKey: boolean): string {
        const endpoint = `${GEMINI_API_BASE}/models/${model}:streamGenerateContent?alt=sse`;
        if (useApiKey && this.apiKey) {
            return `${endpoint}&key=${encodeURIComponent(this.apiKey)}`;
        }
        return endpoint;
    }

    private toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
        const contents: GeminiContent[] = [];

        for (const msg of messages) {
            const role = msg.role === 'assistant' ? 'model' : 'user';

            if (typeof msg.content === 'string') {
                contents.push({ role, parts: [{ text: msg.content }] });
                continue;
            }

            const parts: GeminiPart[] = [];
            for (const block of msg.content) {
                if (block.type === 'text') {
                    parts.push({ text: block.text });
                } else if (block.type === 'tool_use') {
                    parts.push({
                        functionCall: {
                            name: block.name,
                            args: block.input,
                        },
                    });
                } else if (block.type === 'tool_result') {
                    // Tool results are user-role with functionResponse
                    if (parts.length > 0) {
                        contents.push({ role, parts: [...parts] });
                        parts.length = 0; // reset
                    }
                    contents.push({
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name: block.tool_use_id,
                                response: { result: block.content },
                            },
                        }],
                    });
                    continue;
                }
            }

            if (parts.length > 0) {
                contents.push({ role, parts });
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

    async streamChat(params: StreamChatParams): Promise<StreamResult> {
        const {
            model,
            messages,
            tools,
            systemPrompt,
            maxTokens = 8192,
            onEvent,
            signal,
        } = params;

        // Determine auth method
        const useApiKey = !this.cliCreds?.access_token && !!this.apiKey;
        let authHeaders: Record<string, string> = {};

        if (!useApiKey) {
            const accessToken = await this.getAccessToken();
            authHeaders = { 'Authorization': `Bearer ${accessToken}` };
        }

        const url = this.buildUrl(model, useApiKey);
        const body = {
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: this.toGeminiContents(messages),
            tools: this.toGeminiTools(tools),
            generationConfig: {
                maxOutputTokens: maxTokens,
            },
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
            },
            body: JSON.stringify(body),
            signal: signal as any,
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Gemini API error ${response.status}: ${err.substring(0, 500)}`);
        }

        const contentBlocks: ContentBlock[] = [];
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason: StreamResult['stopReason'] = 'end_turn';
        let accumulatedText = '';

        // Process SSE stream
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        onEvent({ type: 'message_start' });

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const jsonStr = line.slice(6).trim();
                if (!jsonStr || jsonStr === '[DONE]') continue;

                let chunk: any;
                try {
                    chunk = JSON.parse(jsonStr);
                } catch {
                    continue;
                }

                const candidate = chunk.candidates?.[0];
                if (!candidate) continue;

                const parts: GeminiPart[] = candidate.content?.parts || [];
                for (const part of parts) {
                    if (part.text !== undefined) {
                        accumulatedText += part.text;
                        onEvent({ type: 'text_delta', text: part.text });
                    } else if (part.functionCall) {
                        const toolId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
                        onEvent({
                            type: 'tool_use',
                            id: toolId,
                            name: part.functionCall.name,
                            input: part.functionCall.args,
                        });
                        contentBlocks.push({
                            type: 'tool_use',
                            id: toolId,
                            name: part.functionCall.name,
                            input: part.functionCall.args,
                        });
                        stopReason = 'tool_use';
                    }
                }

                // Finish reason
                const finishReason = candidate.finishReason;
                if (finishReason) {
                    if (finishReason === 'STOP') stopReason = stopReason === 'tool_use' ? 'tool_use' : 'end_turn';
                    else if (finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
                }

                // Usage metadata
                if (chunk.usageMetadata) {
                    inputTokens = chunk.usageMetadata.promptTokenCount || 0;
                    outputTokens = chunk.usageMetadata.candidatesTokenCount || 0;
                }
            }
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
