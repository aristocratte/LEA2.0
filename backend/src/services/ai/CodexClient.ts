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
} from './AIClient.js';

const CODEX_BASE_URL = 'https://api.openai.com/v1';

interface OpenAIToolCall {
    id?: string;
    type?: 'function';
    function?: {
        name?: string;
        arguments?: string;
    };
    index?: number;
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
            temperature: 0.1,
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
