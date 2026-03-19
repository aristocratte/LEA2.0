/**
 * AnthropicClient - Anthropic AI provider implementation
 *
 * Supports multiple auth sources:
 * 1. API key passed directly (from DB via CryptoService)
 * 2. ANTHROPIC_API_KEY env var (standard SDK behavior)
 * 3. Claude Code OAuth (if available via environment)
 *
 * Uses streaming API with tool use support for the pentest agent loop.
 */

import Anthropic from '@anthropic-ai/sdk';
import { asAsyncIterable, toAbortSignal } from './AIClient.js';
import type {
    AIClient,
    StreamChatParams,
    StreamResult,
    ContentBlock,
    ChatMessage,
    ToolDefinition,
} from './AIClient.js';

interface AnthropicStreamEvent {
    type: string;
    message?: {
        usage?: {
            input_tokens?: number;
        };
    };
    content_block?: {
        type?: string;
        id?: string;
        name?: string;
    };
    delta?: {
        type?: string;
        text?: string;
        thinking?: string;
        partial_json?: string;
        stop_reason?: string;
    };
    usage?: {
        output_tokens?: number;
    };
}

// ============================================
// AnthropicClient
// ============================================

export class AnthropicClient implements AIClient {
    private client: Anthropic;
    private providerName: string;

    /**
     * Create an Anthropic client.
     * - apiKey: standard API key (x-api-key header)
     * - authToken: OAuth Bearer token (Authorization: Bearer header)
     * - If neither is provided, the SDK tries ANTHROPIC_API_KEY env var.
     */
    constructor(apiKey?: string, authToken?: string) {
        if (authToken) {
            // OAuth Bearer token — use defaultHeaders to set Authorization
            this.client = new Anthropic({
                apiKey: 'oauth',  // SDK requires non-empty apiKey; override with header
                defaultHeaders: { 'Authorization': `Bearer ${authToken}`, 'x-api-key': '' },
            });
        } else {
            this.client = new Anthropic(apiKey ? { apiKey } : undefined);
        }
        this.providerName = 'anthropic';
    }

    getProviderName(): string {
        return this.providerName;
    }

    /**
     * Stream a chat completion with tool support
     */
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

        // Convert our messages to Anthropic format
        const anthropicMessages = this.toAnthropicMessages(messages);
        const anthropicTools = this.toAnthropicTools(tools);

        // Build request params
        const requestParams: Anthropic.MessageCreateParamsStreaming = {
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages: anthropicMessages,
            stream: true,
            ...(anthropicTools.length > 0 && { tools: anthropicTools }),
        };

        // Use the raw stream approach for full control
        const response = await this.client.messages.create(requestParams, {
            signal: toAbortSignal(signal),
        });

        // Collect content blocks from the raw streaming response
        const contentBlocks: ContentBlock[] = [];
        let currentTextBlock: { type: 'text'; text: string } | null = null;
        let currentToolUse: {
            id: string;
            name: string;
            inputJson: string;
        } | null = null;
        let inThinkingBlock = false;
        let finalUsage = { input_tokens: 0, output_tokens: 0 };
        let stopReason: string = 'end_turn';

        // Process raw SSE events from the stream
        for await (const event of asAsyncIterable<AnthropicStreamEvent>(response)) {
            switch (event.type) {
                case 'message_start':
                    if (event.message?.usage) {
                        finalUsage.input_tokens = event.message.usage.input_tokens || 0;
                    }
                    break;

                case 'content_block_start':
                    if (event.content_block?.type === 'text') {
                        currentTextBlock = { type: 'text', text: '' };
                    } else if (event.content_block?.type === 'thinking') {
                        inThinkingBlock = true;
                        onEvent({ type: 'thinking_start' });
                    } else if (event.content_block?.type === 'tool_use') {
                        currentToolUse = {
                            id: event.content_block.id || '',
                            name: event.content_block.name || '',
                            inputJson: '',
                        };
                    }
                    break;

                case 'content_block_delta':
                    if (event.delta?.type === 'text_delta') {
                        if (currentTextBlock) {
                            currentTextBlock.text += event.delta.text || '';
                        }
                        onEvent({ type: 'text_delta', text: event.delta.text || '' });
                    } else if (event.delta?.type === 'thinking_delta') {
                        onEvent({ type: 'thinking_delta', text: event.delta.thinking || '' });
                    } else if (event.delta?.type === 'input_json_delta') {
                        if (currentToolUse) {
                            currentToolUse.inputJson += event.delta.partial_json || '';
                        }
                    }
                    break;

                case 'content_block_stop':
                    if (inThinkingBlock) {
                        onEvent({ type: 'thinking_end' });
                        inThinkingBlock = false;
                    } else if (currentTextBlock) {
                        contentBlocks.push(currentTextBlock);
                        currentTextBlock = null;
                    } else if (currentToolUse) {
                        let input: Record<string, unknown> = {};
                        try {
                            input = JSON.parse(currentToolUse.inputJson || '{}');
                        } catch {
                            console.warn(`[AnthropicClient] Failed to parse tool input JSON: ${currentToolUse.inputJson.substring(0, 100)}`);
                        }

                        const toolBlock: ContentBlock = {
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
                    break;

                case 'message_delta':
                    if (event.delta?.stop_reason) {
                        stopReason = event.delta.stop_reason;
                    }
                    if (event.usage) {
                        finalUsage.output_tokens = event.usage.output_tokens || 0;
                    }
                    break;

                case 'message_stop':
                    // Stream complete
                    break;
            }
        }

        // Emit usage
        onEvent({
            type: 'usage',
            inputTokens: finalUsage.input_tokens,
            outputTokens: finalUsage.output_tokens,
        });

        // Emit stop reason
        onEvent({
            type: 'message_stop',
            stopReason,
        });

        return {
            stopReason: this.mapStopReason(stopReason),
            content: contentBlocks,
            usage: {
                inputTokens: finalUsage.input_tokens,
                outputTokens: finalUsage.output_tokens,
            },
        };
    }

    // ============================================
    // Format Converters
    // ============================================

    /**
     * Convert our ChatMessage[] to Anthropic format
     */
    private toAnthropicMessages(
        messages: ChatMessage[]
    ): Anthropic.MessageParam[] {
        return messages.map((msg) => {
            if (typeof msg.content === 'string') {
                return {
                    role: msg.role,
                    content: msg.content,
                };
            }

            // Array of content blocks
            const blocks: Anthropic.ContentBlockParam[] = msg.content.map((block) => {
                switch (block.type) {
                    case 'text':
                        return { type: 'text' as const, text: block.text };

                    case 'tool_use':
                        return {
                            type: 'tool_use' as const,
                            id: block.id,
                            name: block.name,
                            input: block.input,
                        };

                    case 'tool_result':
                        return {
                            type: 'tool_result' as const,
                            tool_use_id: block.tool_use_id,
                            content: block.content,
                            is_error: block.is_error || false,
                        };

                    default:
                        return { type: 'text' as const, text: JSON.stringify(block) };
                }
            });

            return {
                role: msg.role,
                content: blocks,
            };
        });
    }

    /**
     * Convert our ToolDefinition[] to Anthropic format
     */
    private toAnthropicTools(
        tools: ToolDefinition[]
    ): Anthropic.Tool[] {
        return tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            input_schema: tool.input_schema as Anthropic.Tool.InputSchema,
        }));
    }

    /**
     * Map Anthropic stop reason to our format
     */
    private mapStopReason(
        reason: string | null
    ): StreamResult['stopReason'] {
        switch (reason) {
            case 'tool_use':
                return 'tool_use';
            case 'max_tokens':
                return 'max_tokens';
            case 'stop_sequence':
                return 'stop_sequence';
            case 'end_turn':
            default:
                return 'end_turn';
        }
    }
}
