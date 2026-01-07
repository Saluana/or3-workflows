/**
 * Context Compaction System
 *
 * Automatic context management that compacts older messages when approaching
 * model limits. Recent messages are always preserved.
 *
 * @module compaction
 */

import type { ChatMessage, TokenUsageDetails } from './types';

// ============================================================================
// Types
// ============================================================================

/**
 * Strategy for compacting conversation context.
 *
 * - `summarize`: Use LLM to create a summary of older messages
 * - `truncate`: Simply drop older messages
 * - `custom`: Use a user-provided compaction function
 */
export type CompactionStrategy = 'summarize' | 'truncate' | 'custom';

/**
 * Configuration for context compaction behavior.
 */
export interface CompactionConfig {
    /**
     * Token threshold to trigger compaction.
     * - `'auto'`: Automatically calculate as modelLimit - 10000
     * - `number`: Specific token count threshold
     */
    threshold: 'auto' | number;

    /**
     * Number of recent messages to never compact.
     * These messages will always be preserved in full.
     * @default 5
     */
    preserveRecent: number;

    /**
     * Strategy to use when compacting messages.
     * @default 'summarize'
     */
    strategy: CompactionStrategy;

    /**
     * Model to use for summarization.
     * If not specified, uses the current execution model.
     */
    summarizeModel?: string;

    /**
     * Custom prompt for summarization.
     * Use `{{messages}}` placeholder for the messages to summarize.
     */
    summarizePrompt?: string;

    /**
     * Custom compaction function.
     * Required when strategy is 'custom'.
     *
     * @param messages - All messages in the conversation
     * @param targetTokens - Target token count to compact to
     * @returns Compacted messages
     */
    customCompactor?: (
        messages: ChatMessage[],
        targetTokens: number
    ) => Promise<ChatMessage[]>;
}

/**
 * Result of a compaction operation.
 */
export interface CompactionResult {
    /** Whether compaction was performed */
    compacted: boolean;
    /** The resulting messages (may be unchanged if no compaction needed) */
    messages: ChatMessage[];
    /** Token count before compaction */
    tokensBefore: number;
    /** Token count after compaction */
    tokensAfter: number;
    /** Number of messages that were compacted */
    messagesCompacted: number;
    /** Summary text if summarization was used */
    summary?: string;
}

/**
 * Interface for counting tokens in text.
 */
export interface TokenCounter {
    /**
     * Count the approximate number of tokens in text.
     *
     * @param text - Text to count tokens in
     * @param model - Optional model name for model-specific counting
     * @returns Approximate token count
     */
    count(text: string, model?: string): number;

    /**
     * Get the context limit for a specific model.
     *
     * @param model - Model identifier (e.g., 'openai/gpt-4o')
     * @returns Maximum context tokens for the model
     */
    getLimit(model: string): number;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default summarization prompt.
 * Includes the `{{messages}}` placeholder which will be replaced with formatted messages.
 */
export const DEFAULT_SUMMARIZE_PROMPT = `Summarize the following conversation history concisely, preserving key information, decisions, and context that would be important for continuing the conversation:

{{messages}}

Provide a concise summary that captures the essential context. Focus on:
- Key decisions made
- Important information shared
- Current state of the task
- Any pending questions or actions`;

/**
 * Default compaction configuration.
 */
export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
    threshold: 'auto',
    preserveRecent: 5,
    strategy: 'summarize',
    summarizePrompt: DEFAULT_SUMMARIZE_PROMPT,
};

// ============================================================================
// Model Context Limits
// ============================================================================

/**
 * Known context limits for popular models.
 * Values are in tokens.
 */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
    // OpenAI
    'openai/gpt-4o': 128000,
    'openai/gpt-4o-mini': 128000,
    'openai/gpt-4-turbo': 128000,
    'openai/gpt-4-turbo-preview': 128000,
    'openai/gpt-4': 8192,
    'openai/gpt-3.5-turbo': 16385,
    'openai/o1': 200000,
    'openai/o1-mini': 128000,
    'openai/o1-preview': 128000,

    // Anthropic
    'anthropic/claude-3-opus': 200000,
    'anthropic/claude-3-sonnet': 200000,
    'anthropic/claude-3-haiku': 200000,
    'anthropic/claude-3.5-sonnet': 200000,
    'anthropic/claude-3.5-haiku': 200000,
    'anthropic/claude-2': 100000,

    // Google
    'google/gemini-pro': 32000,
    'google/gemini-1.5-pro': 1000000,
    'google/gemini-1.5-flash': 1000000,
    'google/gemini-2.0-flash': 1000000,

    // Meta
    'meta-llama/llama-3.1-405b-instruct': 128000,
    'meta-llama/llama-3.1-70b-instruct': 128000,
    'meta-llama/llama-3.1-8b-instruct': 128000,
    'meta-llama/llama-3.2-90b-instruct': 128000,
    'meta-llama/llama-3.2-11b-instruct': 128000,

    // Mistral
    'mistralai/mistral-large': 128000,
    'mistralai/mistral-medium': 32000,
    'mistralai/mistral-small': 32000,
    'mistralai/mixtral-8x7b-instruct': 32000,

    // DeepSeek
    'deepseek/deepseek-chat': 64000,
    'deepseek/deepseek-coder': 64000,

    // Qwen
    'qwen/qwen-2.5-72b-instruct': 128000,
    'qwen/qwen-2.5-coder-32b-instruct': 128000,

    // Default for unknown models
    default: 8192,
};

// ============================================================================
// Token Counter Implementation
// ============================================================================

/**
 * Simple token counter using character-based approximation.
 *
 * Uses the rule of thumb that ~4 characters ≈ 1 token for English text.
 * This is a reasonable approximation for most use cases and avoids
 * the overhead of loading tokenizer models.
 *
 * @example
 * ```typescript
 * const counter = new ApproximateTokenCounter();
 * const tokens = counter.count("Hello, world!"); // ~3 tokens
 * const limit = counter.getLimit("openai/gpt-4o"); // 128000
 * ```
 */
export class ApproximateTokenCounter implements TokenCounter {
    /**
     * Custom model limits that override defaults.
     */
    private customLimits: Record<string, number>;

    /**
     * Characters per token ratio.
     * Default is 4 (approximately 4 characters per token for English).
     */
    private charsPerToken: number;

    /**
     * Create a new ApproximateTokenCounter.
     *
     * @param options - Configuration options
     */
    constructor(
        options: {
            /** Override model context limits */
            customLimits?: Record<string, number>;
            /** Characters per token ratio (default: 4) */
            charsPerToken?: number;
        } = {}
    ) {
        this.customLimits = options.customLimits ?? {};
        this.charsPerToken = options.charsPerToken ?? 4;
    }

    /**
     * Count approximate tokens in text.
     *
     * @param text - Text to count tokens in
     * @returns Approximate token count
     */
    count(text: string): number {
        if (!text) return 0;
        return Math.ceil(text.length / this.charsPerToken);
    }

    /**
     * Get context limit for a model.
     *
     * @param model - Model identifier
     * @returns Context limit in tokens
     */
    getLimit(model: string): number {
        // Check custom limits first
        if (this.customLimits[model] !== undefined) {
            return this.customLimits[model];
        }

        // Check known limits
        if (MODEL_CONTEXT_LIMITS[model] !== undefined) {
            return MODEL_CONTEXT_LIMITS[model];
        }

        // Try to find a partial match (e.g., "gpt-4o" matches "openai/gpt-4o")
        const modelName = model.split('/').pop() ?? model;
        for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
            if (
                key.includes(modelName) ||
                modelName.includes(key.split('/').pop()!)
            ) {
                return limit;
            }
        }

        // Return default
        return MODEL_CONTEXT_LIMITS['default']!;
    }

    /**
     * Add or update a custom model limit.
     *
     * @param model - Model identifier
     * @param limit - Context limit in tokens
     */
    setLimit(model: string, limit: number): void {
        this.customLimits[model] = limit;
    }
}

// ============================================================================
// Compaction Helpers
// ============================================================================

/**
 * Count total tokens in a list of messages.
 *
 * @param messages - Messages to count
 * @param counter - Token counter to use
 * @returns Total token count
 */
export function countMessageTokens(
    messages: ChatMessage[],
    counter: TokenCounter
): number {
    return messages.reduce((sum, message) => {
        const content =
            typeof message.content === 'string'
                ? message.content
                : JSON.stringify(message.content);
        return sum + counter.count(content);
    }, 0);
}

/**
 * Format messages for summarization prompt.
 *
 * @param messages - Messages to format
 * @returns Formatted string representation
 */
export function formatMessagesForSummary(messages: ChatMessage[]): string {
    return messages
        .map((m) => {
            const content =
                typeof m.content === 'string'
                    ? m.content
                    : JSON.stringify(m.content);
            const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
            return `${role}: ${content}`;
        })
        .join('\n\n');
}

/**
 * Calculate the compaction threshold for a model.
 *
 * @param config - Compaction configuration
 * @param model - Model identifier
 * @param counter - Token counter
 * @returns Threshold in tokens
 */
export function calculateThreshold(
    config: CompactionConfig,
    model: string,
    counter: TokenCounter
): number {
    if (typeof config.threshold === 'number') {
        return config.threshold;
    }

    // 'auto' mode: modelLimit - 10000
    const modelLimit = counter.getLimit(model);
    return Math.max(modelLimit - 10000, 1000); // Ensure at least 1000 tokens
}

/**
 * Split messages into sections for compaction.
 *
 * @param messages - All messages
 * @param preserveCount - Number of recent messages to preserve
 * @returns Object with messages to preserve and compact
 */
export function splitMessagesForCompaction(
    messages: ChatMessage[],
    preserveCount: number
): {
    toPreserve: ChatMessage[];
    toCompact: ChatMessage[];
} {
    if (messages.length <= preserveCount) {
        return {
            toPreserve: messages,
            toCompact: [],
        };
    }

    return {
        toPreserve: messages.slice(-preserveCount),
        toCompact: messages.slice(0, -preserveCount),
    };
}

/**
 * Create a summary message from compacted content.
 *
 * @param summary - The summary text
 * @returns A system message containing the summary
 */
export function createSummaryMessage(summary: string): ChatMessage {
    return {
        role: 'system',
        content: `[Previous conversation summary]: ${summary}`,
    };
}

/**
 * Build the summarization prompt with messages inserted.
 *
 * @param messages - Messages to summarize
 * @param config - Compaction configuration
 * @returns The complete summarization prompt
 */
export function buildSummarizationPrompt(
    messages: ChatMessage[],
    config: CompactionConfig
): string {
    const prompt = config.summarizePrompt ?? DEFAULT_SUMMARIZE_PROMPT;
    const formattedMessages = formatMessagesForSummary(messages);
    return prompt.replace('{{messages}}', formattedMessages);
}

/**
 * Estimate token usage for an LLM request.
 *
 * @param params.model - Model identifier
 * @param params.messages - Messages sent in the request
 * @param params.output - LLM output text
 * @param params.tokenCounter - Token counter to use
 * @param params.compaction - Optional compaction config to compute thresholds
 */
export function estimateTokenUsage(params: {
    model: string;
    messages: ChatMessage[];
    output?: string | null;
    tokenCounter: TokenCounter;
    compaction?: CompactionConfig;
}): TokenUsageDetails {
    const promptTokens = countMessageTokens(
        params.messages,
        params.tokenCounter
    );
    const completionTokens = params.output
        ? params.tokenCounter.count(params.output)
        : 0;
    const totalTokens = promptTokens + completionTokens;
    const contextLimit = params.tokenCounter.getLimit(params.model);
    const compactionThreshold =
        params.compaction !== undefined
            ? calculateThreshold(
                  params.compaction,
                  params.model,
                  params.tokenCounter
              )
            : undefined;
    const remainingBeforeCompaction =
        compactionThreshold !== undefined
            ? Math.max(compactionThreshold - promptTokens, 0)
            : undefined;

    return {
        model: params.model,
        promptTokens,
        completionTokens,
        totalTokens,
        contextLimit,
        compactionThreshold,
        remainingBeforeCompaction,
        remainingContext: Math.max(contextLimit - promptTokens, 0),
    };
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a value is a valid CompactionConfig.
 */
export function isCompactionConfig(value: unknown): value is CompactionConfig {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const config = value as Record<string, unknown>;

    // Check threshold
    if (config.threshold !== 'auto' && typeof config.threshold !== 'number') {
        return false;
    }

    // Check preserveRecent
    if (
        typeof config.preserveRecent !== 'number' ||
        config.preserveRecent < 0
    ) {
        return false;
    }

    // Check strategy
    if (
        !['summarize', 'truncate', 'custom'].includes(config.strategy as string)
    ) {
        return false;
    }

    // If custom strategy, must have customCompactor
    if (
        config.strategy === 'custom' &&
        typeof config.customCompactor !== 'function'
    ) {
        return false;
    }

    return true;
}
