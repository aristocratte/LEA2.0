/**
 * ZhipuClient - Zhipu AI (GLM) provider implementation
 *
 * Uses the OpenAI-compatible API at https://api.z.ai/api/paas/v4
 * Supports streaming and tool use (function calling).
 *
 * GLM-4.7 thinking control:
 *   Pass `thinkingBudget` (number of tokens) to enable deep reasoning.
 *   Higher = more thinking = better accuracy for complex tasks.
 *   Example: 8192 for standard, 16384 for deep analysis.
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

const ZHIPU_BASE_URL = 'https://api.z.ai/api/paas/v4';

interface ZhipuToolCallDelta {
    index?: number;
    id?: string;
    function?: {
        name?: string;
        arguments?: string;
    };
}

interface ZhipuChoiceDelta {
    role?: string;
    content?: string;
    reasoning_content?: string;
    tool_calls?: ZhipuToolCallDelta[];
}

interface ZhipuStreamChoice {
    finish_reason?: string | null;
    delta?: ZhipuChoiceDelta;
}

interface ZhipuStreamUsage {
    prompt_tokens?: number;
    completion_tokens?: number;
}

interface ZhipuStreamChunk {
    choices?: ZhipuStreamChoice[];
    usage?: ZhipuStreamUsage;
}

export class ZhipuClient implements AIClient {
    private apiKey: string;
    private baseUrl: string;
    private providerName: 'zhipu' | 'openai' | 'custom';

    constructor(apiKey: string, baseUrl?: string, providerName: 'zhipu' | 'openai' | 'custom' = 'zhipu') {
        this.apiKey = apiKey;
        this.baseUrl = baseUrl || ZHIPU_BASE_URL;
        this.providerName = providerName;
    }

    getProviderName(): string {
        return this.providerName;
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

        // Convert messages to OpenAI format
        const openaiMessages = this.toOpenAIMessages(messages, systemPrompt);
        const openaiTools = this.toOpenAITools(tools);

        const body: Record<string, unknown> = {
            model,
            messages: openaiMessages,
            max_tokens: maxTokens,
            stream: true,
        };

        if (openaiTools.length > 0) {
            body.tools = openaiTools;
        }

        // Enable deep thinking via thinking_budget (GLM-4.7 "Turn-level Thinking")
        // A higher budget = more reasoning tokens = deeper analysis
        // Pass 0 or undefined to disable thinking (faster, cheaper)
        if (thinkingBudget !== undefined && thinkingBudget > 0) {
            body.thinking_budget = thinkingBudget;
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(body),
            signal: signal as any,
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Zhipu API error ${response.status}: ${errorText}`);
        }

        if (!response.body) {
            throw new Error('No response body from Zhipu API');
        }

        // Parse SSE stream
        const contentBlocks: ContentBlock[] = [];
        let currentText = '';
        const toolCalls: Map<number, { id: string; name: string; arguments: string }> = new Map();
        let finishReason = 'stop';
        let inputTokens = 0;
        let outputTokens = 0;
        let thinkingStarted = false;
        let textStarted = false;

        const processChunk = (chunk: ZhipuStreamChunk): void => {
            // Usage info (typically sent on the last chunk)
            if (chunk.usage) {
                inputTokens = chunk.usage.prompt_tokens || 0;
                outputTokens = chunk.usage.completion_tokens || 0;
            }

            const choice = chunk.choices?.[0];
            if (!choice) return;

            if (choice.finish_reason) {
                finishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (!delta) return;

            const reasoningDelta = typeof delta.reasoning_content === 'string' ? delta.reasoning_content : '';
            const textDelta = typeof delta.content === 'string' ? delta.content : '';
            const toolCallsDelta = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
            const hasToolCalls = toolCallsDelta.length > 0;
            const hasAssistantRole = delta.role === 'assistant';

            // Reasoning/thinking content (supported by GLM-4.7 with thinking_budget)
            if (reasoningDelta.length > 0) {
                if (!thinkingStarted) {
                    onEvent({ type: 'thinking_start' });
                    thinkingStarted = true;
                }
                onEvent({ type: 'thinking_delta', text: reasoningDelta });
            }

            // End thinking when we transition to assistant output or tool calls.
            if (thinkingStarted && (textDelta.length > 0 || hasToolCalls || hasAssistantRole)) {
                onEvent({ type: 'thinking_end' });
                thinkingStarted = false;
                textStarted = false; // reset so message_start fires when assistant output starts
            }

            // Emit message_start as soon as assistant output stream begins
            // (role chunk may arrive before first non-empty text token).
            if (!textStarted && (hasAssistantRole || textDelta.length > 0)) {
                onEvent({ type: 'message_start' });
                textStarted = true;
            }

            // Text content delta
            if (textDelta.length > 0) {
                currentText += textDelta;
                onEvent({ type: 'text_delta', text: textDelta });
            }

            // Tool calls (streaming) — accumulate arguments across chunks
            if (hasToolCalls) {
                for (const tc of toolCallsDelta) {
                    const idx = tc.index ?? 0;
                    if (!toolCalls.has(idx)) {
                        toolCalls.set(idx, {
                            id: tc.id || `tool_${idx}`,
                            name: tc.function?.name || '',
                            arguments: '',
                        });
                    }
                    const existing = toolCalls.get(idx)!;
                    if (tc.id) existing.id = tc.id;
                    if (tc.function?.name) existing.name = tc.function.name;
                    if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                }
            }
        };

        const processSSEEventBlock = (rawEvent: string): boolean => {
            const lines = rawEvent.split(/\r?\n/);
            const dataLines: string[] = [];

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith(':')) continue;
                if (!trimmed.startsWith('data:')) continue;
                dataLines.push(trimmed.slice(5).trimStart());
            }

            if (dataLines.length === 0) return false;

            const payload = dataLines.join('\n').trim();
            if (!payload) return false;
            if (payload === '[DONE]') return true;

            try {
                processChunk(JSON.parse(payload) as ZhipuStreamChunk);
            } catch {
                // Ignore malformed chunks and continue stream processing.
            }

            return false;
        };

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let streamDone = false;

        try {
            while (!streamDone) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split(/\r?\n\r?\n/);
                buffer = events.pop() || '';

                for (const rawEvent of events) {
                    if (!rawEvent.trim()) continue;
                    if (processSSEEventBlock(rawEvent)) {
                        streamDone = true;
                        break;
                    }
                }
            }

            buffer += decoder.decode();
            const pendingEvent = buffer.trim();
            if (!streamDone && pendingEvent) {
                processSSEEventBlock(pendingEvent);
            }
        } finally {
            reader.releaseLock();
        }

        // Close any open thinking block
        if (thinkingStarted) {
            onEvent({ type: 'thinking_end' });
            thinkingStarted = false;
        }

        // Close text stream
        if (textStarted) {
            onEvent({ type: 'message_end' });
        }

        // Build content blocks
        if (currentText) {
            contentBlocks.push({ type: 'text', text: currentText });
        }

        for (const [, tc] of toolCalls) {
            let input: Record<string, unknown> = {};
            try {
                input = JSON.parse(tc.arguments || '{}');
            } catch {
                console.warn(`[ZhipuClient] Failed to parse tool arguments: ${tc.arguments.substring(0, 100)}`);
            }

            const toolBlock: ToolUseContent = {
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input,
            };
            contentBlocks.push(toolBlock);

            onEvent({
                type: 'tool_use',
                id: tc.id,
                name: tc.name,
                input,
            });
        }

        // Emit usage
        onEvent({ type: 'usage', inputTokens, outputTokens });

        // Map finish reason
        const stopReason = this.mapStopReason(finishReason);
        onEvent({ type: 'message_stop', stopReason });

        return {
            stopReason,
            content: contentBlocks,
            usage: { inputTokens, outputTokens },
        };
    }

    // ============================================
    // Format Converters
    // ============================================

    private toOpenAIMessages(
        messages: ChatMessage[],
        systemPrompt: string,
    ): Record<string, unknown>[] {
        const result: Record<string, unknown>[] = [];

        // System message first
        if (systemPrompt) {
            result.push({ role: 'system', content: systemPrompt });
        }

        for (const msg of messages) {
            if (typeof msg.content === 'string') {
                result.push({ role: msg.role, content: msg.content });
                continue;
            }

            // Handle content blocks
            if (msg.role === 'assistant') {
                // Assistant messages can have text + tool_use
                const textParts = msg.content.filter(b => b.type === 'text') as TextContent[];
                const toolUseParts = msg.content.filter(b => b.type === 'tool_use') as ToolUseContent[];

                const assistantMsg: Record<string, unknown> = {
                    role: 'assistant',
                    content: textParts.map(t => t.text).join('\n') || null,
                };

                if (toolUseParts.length > 0) {
                    assistantMsg.tool_calls = toolUseParts.map((tu) => ({
                        id: tu.id,
                        type: 'function',
                        function: {
                            name: tu.name,
                            arguments: JSON.stringify(tu.input),
                        },
                    }));
                }

                result.push(assistantMsg);
            } else {
                // User messages can have text or tool_results
                const toolResults = msg.content.filter(b => b.type === 'tool_result') as ToolResultContent[];
                const textParts = msg.content.filter(b => b.type === 'text') as TextContent[];

                if (toolResults.length > 0) {
                    // Each tool result becomes a separate "tool" role message
                    for (const tr of toolResults) {
                        result.push({
                            role: 'tool',
                            tool_call_id: tr.tool_use_id,
                            content: tr.content,
                        });
                    }
                }

                if (textParts.length > 0) {
                    result.push({
                        role: 'user',
                        content: textParts.map(t => t.text).join('\n'),
                    });
                }
            }
        }

        return result;
    }

    private toOpenAITools(tools: ToolDefinition[]): Record<string, unknown>[] {
        return tools.map(tool => ({
            type: 'function',
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema,
            },
        }));
    }

    private mapStopReason(reason: string): StreamResult['stopReason'] {
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
