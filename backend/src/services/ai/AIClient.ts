/**
 * AIClient - Abstract interface for AI providers
 *
 * Defines the contract that all AI provider implementations must follow.
 * Supports streaming chat with tool use (agentic loop).
 */

// ============================================
// Message Types
// ============================================

export interface TextContent {
    type: 'text';
    text: string;
}

export interface ToolUseContent {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, unknown>;
    thought_signature?: string;
}

export interface ToolResultContent {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
    is_error?: boolean;
}

export type ContentBlock = TextContent | ToolUseContent | ToolResultContent;

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string | ContentBlock[];
}

// ============================================
// Tool Definition
// ============================================

export interface ToolDefinition {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

// ============================================
// Stream Events (emitted during streaming)
// ============================================

export type AgentEvent =
    | { type: 'thinking_start' }
    | { type: 'thinking_delta'; text: string }
    | { type: 'thinking_end' }
    | { type: 'message_start' }
    | { type: 'text_delta'; text: string }
    | { type: 'message_end' }
    | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; thought_signature?: string }
    | { type: 'message_stop'; stopReason: string }
    | { type: 'usage'; inputTokens: number; outputTokens: number };

// ============================================
// Stream Result
// ============================================

export interface StreamResult {
    stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
    content: ContentBlock[];
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
}

// ============================================
// Chat Parameters
// ============================================

export interface StreamChatParams {
    model: string;
    messages: ChatMessage[];
    tools: ToolDefinition[];
    systemPrompt: string;
    maxTokens?: number;
    /** Controls thinking depth for models that support it (e.g. GLM-4.7).
     *  Higher = more reasoning tokens = deeper analysis. 0 = disabled. */
    thinkingBudget?: number;
    onEvent: (event: AgentEvent) => void;
    signal?: AbortSignal;
}

export function toAbortSignal(signal?: AbortSignal): AbortSignal | undefined {
    return signal ? (signal as unknown as AbortSignal) : undefined;
}

export function asAsyncIterable<T>(value: AsyncIterable<T> | unknown): AsyncIterable<T> {
    return value as AsyncIterable<T>;
}

// ============================================
// AIClient Interface
// ============================================

export interface AIClient {
    /**
     * Stream a chat completion with tool support.
     * Emits events via onEvent callback as content arrives.
     * Returns the complete result when the stream ends.
     */
    streamChat(params: StreamChatParams): Promise<StreamResult>;

    /**
     * Get the provider name (for logging/metrics)
     */
    getProviderName(): string;
}
