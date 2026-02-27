import {
    AIClient,
    StreamChatParams,
    StreamResult,
    ChatMessage,
    ContentBlock,
    ToolDefinition,
    AgentEvent
} from './AIClient.js';
import { ANTIGRAVITY_ENDPOINT, refreshAccessToken } from './antigravity/oauth.js';

interface GeminiPart {
    text?: string;
    thoughtSignature?: string;
    thought_signature?: string;
    functionCall?: {
        name: string;
        args: Record<string, any>;
    };
    functionResponse?: {
        name: string;
        response: Record<string, any>;
    };
}

interface GeminiContent {
    role: 'user' | 'model';
    parts: GeminiPart[];
}

interface GeminiTool {
    function_declarations: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    }[];
}

export class AntigravityClient implements AIClient {
    private refreshToken: string;
    private projectId: string;
    private accessToken: string | null = null;
    private tokenExpiresAt: number = 0;
    private projectResolved: boolean = false;

    constructor(refreshToken: string, projectId: string = 'rising-fact-p41fc') {
        this.refreshToken = refreshToken;
        this.projectId = projectId;
    }

    getProviderName(): string {
        return 'antigravity';
    }

    private async ensureValidToken(): Promise<string> {
        if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) {
            return this.accessToken;
        }

        const tokens = await refreshAccessToken(this.refreshToken);
        this.accessToken = tokens.access_token;
        this.tokenExpiresAt = Date.now() + tokens.expires_in * 1000;

        return this.accessToken;
    }

    private getAntigravityHeaders(): Record<string, string> {
        return {
            "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Antigravity/1.18.3 Chrome/138.0.7204.235 Electron/37.3.1 Safari/537.36`,
            "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
            "Client-Metadata": JSON.stringify({
                ideType: "ANTIGRAVITY",
                platform: process.platform === "win32" ? "WINDOWS" : "MACOS",
                pluginType: "GEMINI"
            }),
            "x-goog-user-project": this.projectId,
        };
    }

    private async ensureProjectId(token: string): Promise<void> {
        if (this.projectResolved && this.projectId) {
            return;
        }

        const endpoints = [
            ANTIGRAVITY_ENDPOINT || "https://daily-cloudcode-pa.sandbox.googleapis.com",
            "https://autopush-cloudcode-pa.sandbox.googleapis.com",
            "https://cloudcode-pa.googleapis.com",
        ];
        const uniqueEndpoints = [...new Set(endpoints)];
        const body = JSON.stringify({
            metadata: {
                ideType: "IDE_UNSPECIFIED",
                platform: "PLATFORM_UNSPECIFIED",
                pluginType: "GEMINI",
            },
        });

        for (const endpoint of uniqueEndpoints) {
            try {
                const response = await fetch(`${endpoint}/v1internal:loadCodeAssist`, {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${token}`,
                        "Content-Type": "application/json",
                    },
                    body,
                });

                if (!response.ok) continue;
                const payload = await response.json() as Record<string, unknown>;
                const project = typeof payload.cloudaicompanionProject === 'string'
                    ? payload.cloudaicompanionProject
                    : undefined;
                if (project) {
                    this.projectId = project;
                    this.projectResolved = true;
                    return;
                }
            } catch {
                // Try next endpoint
            }
        }
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
                // Ignore parse errors and fallback to empty input.
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

        const token = await this.ensureValidToken();
        await this.ensureProjectId(token);
        const endpoints = [
            ANTIGRAVITY_ENDPOINT || "https://daily-cloudcode-pa.sandbox.googleapis.com",
            "https://autopush-cloudcode-pa.sandbox.googleapis.com",
            "https://cloudcode-pa.googleapis.com",
        ];
        const uniqueEndpoints = [...new Set(endpoints)];

        const requestBody: any = {
            project: this.projectId,
            model: model,
            request: {
                model: model,
                contents: this.toGeminiContents(messages),
                generationConfig: {
                    maxOutputTokens: maxTokens,
                }
            }
        };

        if (systemPrompt) {
            requestBody.request.systemInstruction = {
                parts: [{ text: systemPrompt }]
            };
        }

        if (tools && tools.length > 0) {
            requestBody.request.tools = this.toGeminiTools(tools);
        }

        let response: Response | null = null;
        const errors: string[] = [];

        for (const endpoint of uniqueEndpoints) {
            const attempt = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json",
                    ...this.getAntigravityHeaders(),
                },
                body: JSON.stringify(requestBody),
                signal: signal as any,
            });

            if (attempt.ok) {
                response = attempt;
                break;
            }

            const err = await attempt.text();
            errors.push(`${endpoint} -> ${attempt.status}: ${err.substring(0, 220)}`);
        }

        if (!response) {
            throw new Error(`Antigravity API error: ${errors.join(' | ')}`);
        }

        const contentBlocks: ContentBlock[] = [];
        const functionCallStateByPartIndex = new Map<number, { key: string; blockIndex: number }>();
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason: StreamResult['stopReason'] = 'end_turn';
        let accumulatedText = '';

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
                if (part.text !== undefined) {
                    accumulatedText += part.text;
                    onEvent({ type: 'text_delta', text: part.text });
                }

                if (part.functionCall) {
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

            if (candidate.finishReason) {
                if (candidate.finishReason === 'MAX_TOKENS') {
                    stopReason = 'max_tokens';
                } else if (stopReason !== 'tool_use') {
                    stopReason = 'end_turn';
                }
            }

            if (payload?.usageMetadata) {
                inputTokens = payload.usageMetadata.promptTokenCount || inputTokens;
                outputTokens = payload.usageMetadata.candidatesTokenCount || outputTokens;
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

        if (accumulatedText.length > 0) {
            contentBlocks.unshift({ type: 'text', text: accumulatedText });
        }

        onEvent({ type: 'usage', inputTokens, outputTokens });
        onEvent({ type: 'message_end' });
        onEvent({ type: 'message_stop', stopReason });

        return {
            content: contentBlocks,
            usage: { inputTokens, outputTokens },
            stopReason,
        };
    }
}
