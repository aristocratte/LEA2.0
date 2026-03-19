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

const OPENCODE_DEFAULT_BASE_URL = 'https://api.opencode.ai/v1';

interface OpenCodeToolCall {
    id?: string;
    type?: 'function';
    function?: {
        name?: string;
        arguments?: string;
    };
    index?: number;
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
                                outputTokens += 1;
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
