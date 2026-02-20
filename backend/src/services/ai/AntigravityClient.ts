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

    constructor(refreshToken: string, projectId: string = 'rising-fact-p41fc') {
        this.refreshToken = refreshToken;
        this.projectId = projectId;
    }

    getProviderName(): string {
        return 'ANTIGRAVITY';
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
                    if (parts.length > 0) {
                        contents.push({ role, parts: [...parts] });
                        parts.length = 0;
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

        const token = await this.ensureValidToken();
        const endpoint = ANTIGRAVITY_ENDPOINT || "https://daily-cloudcode-pa.sandbox.googleapis.com";

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

        const response = await fetch(`${endpoint}/v1internal:streamGenerateContent?alt=sse`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "application/json",
                ...this.getAntigravityHeaders(),
            },
            body: JSON.stringify(requestBody),
            signal: signal as any,
        });

        if (!response.ok) {
            const err = await response.text();
            throw new Error(`Antigravity API error ${response.status}: ${err}`);
        }

        const contentBlocks: ContentBlock[] = [];
        let inputTokens = 0;
        let outputTokens = 0;
        let stopReason: StreamResult['stopReason'] = 'end_turn';
        let accumulatedText = '';

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
                    }

                    if (part.functionCall) {
                        contentBlocks.push({
                            type: 'tool_use',
                            id: part.functionCall.name,
                            name: part.functionCall.name,
                            input: part.functionCall.args,
                        });
                        onEvent({
                            type: 'tool_use',
                            id: part.functionCall.name,
                            name: part.functionCall.name,
                            input: part.functionCall.args,
                        });
                    }
                }

                if (candidate.finishReason) {
                    if (candidate.finishReason === 'MAX_TOKENS') stopReason = 'max_tokens';
                    else stopReason = 'end_turn';
                }

                if (chunk.usageMetadata) {
                    inputTokens = chunk.usageMetadata.promptTokenCount || inputTokens;
                    outputTokens = chunk.usageMetadata.candidatesTokenCount || outputTokens;
                }
            }
        }

        if (accumulatedText.length > 0) {
            contentBlocks.unshift({ type: 'text', text: accumulatedText });
        }

        onEvent({ type: 'usage', inputTokens, outputTokens });
        onEvent({ type: 'message_end' });

        return {
            content: contentBlocks,
            usage: { inputTokens, outputTokens },
            stopReason,
        };
    }
}
