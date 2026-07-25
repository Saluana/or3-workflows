/**
 * OpenRouter model gateway using the public SDK v1 `{ chatRequest }` transport
 * (R3). This is the only module allowed to touch OpenRouter SDK v1 request/model
 * shapes. It:
 *
 * - sends model calls via `client.chat.send({ chatRequest, ... }, requestOptions)`;
 * - passes `AbortSignal` through the flattened `RequestOptions.signal` (R2.AC5);
 * - takes credentials/base URL/headers only from explicit options, never from
 *   `_options`/`_baseURL` or any other SDK private field (R3.AC5);
 * - maps model fallback arrays and provider routing (R3.AC1, R3.AC2);
 * - runs tri-state capability preflight across the fallback chain (R3.AC3/4);
 * - normalizes metadata, leaving absent fields `undefined` (R2.AC3, R3.AC4).
 */
import type {
    ChatMessage,
    ModelCapabilities,
    ToolCallResult,
} from '../../types';
import { ModelRegistry, modelRegistry, toModelInfo } from '../../models';
import {
    CapabilityPreflightError,
    ProviderCallError,
    toNonEmptyModels,
    type FinishReason,
    type JsonValue,
    type ModelCallResult,
    type ModelCapability,
    type ModelGateway,
    type ModelRequest,
    type ModelToolDescriptor,
    type ModelUsage,
    type ProviderAnnotation,
} from '../../gateway/types';
import { CapabilityResolver } from './CapabilityResolver';
import { mapRoutingPolicy } from './routing';
import { normalizeMessages } from './messages';

// ============================================================================
// Structural SDK surface (public request/response only)
// ============================================================================

/** Flattened public request options; `signal` aborts the underlying request. */
export interface PublicRequestOptions {
    signal?: AbortSignal;
    [key: string]: unknown;
}

interface ORChatSendRequest {
    chatRequest: Record<string, unknown>;
    httpReferer?: string;
    appTitle?: string;
    xOpenRouterMetadata?: 'disabled' | 'enabled';
}

interface ORToolCall {
    id?: string;
    type?: string;
    function?: { name?: string; arguments?: string };
}

interface ORAssistantMessage {
    role?: string;
    content?: string | Array<{ type?: string; text?: string }> | null;
    reasoning?: string | null;
    toolCalls?: ORToolCall[];
    tool_calls?: ORToolCall[];
}

interface ORUsage {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number | null;
    completionTokensDetails?: { reasoningTokens?: number | null } | null;
    promptTokensDetails?: { cachedTokens?: number } | null;
}

interface ORChatResult {
    id?: string;
    model?: string;
    choices?: Array<{
        finishReason?: string | null;
        message?: ORAssistantMessage;
    }>;
    usage?: ORUsage;
    openrouterMetadata?: unknown;
}

interface ORStreamDelta {
    content?: string | null;
    reasoning?: string | null;
    toolCalls?: Array<ORToolCall & { index?: number }>;
    tool_calls?: Array<ORToolCall & { index?: number }>;
}

interface ORStreamChunk {
    id?: string;
    model?: string;
    choices?: Array<{ delta?: ORStreamDelta; finishReason?: string | null }>;
    usage?: ORUsage;
    openrouterMetadata?: unknown;
    error?: { code?: number; message?: string };
}

/** Minimal structural view of the OpenRouter v1 client used by the gateway. */
export interface OpenRouterV1Client {
    chat: {
        send(
            request: ORChatSendRequest,
            options?: PublicRequestOptions
        ): Promise<ORChatResult | AsyncIterable<ORStreamChunk>>;
    };
}

// ============================================================================
// Options
// ============================================================================

export interface OpenRouterGatewayOptions {
    client: OpenRouterV1Client;
    /** Build public request options (e.g. custom headers) from the abort signal. */
    requestOptions?: (signal?: AbortSignal) => PublicRequestOptions;
    /** Opt in to routing metadata under `openrouter_metadata`. Default disabled. */
    metadata?: 'disabled' | 'enabled';
    debug?: boolean;
    /** App identifier for rankings (HTTP-Referer). */
    httpReferer?: string;
    /** App display name (X-Title). */
    appTitle?: string;
    /**
     * Explicit credentials/config for any non-SDK path. Never read from SDK
     * private fields. The primary transport (`client.chat.send`) does not need
     * these; they are provided for hosts that wire raw paths or diagnostics.
     */
    apiKey?: string;
    serverURL?: string;
    headers?: Record<string, string>;
    /** Catalog for capability preflight. Defaults to the global registry. */
    modelRegistry?: ModelRegistry;
    /** Receives non-fatal preflight/mapping warnings. */
    onWarning?: (message: string) => void;
}

// ============================================================================
// Normalization helpers
// ============================================================================

function normalizeFinishReason(
    reason: string | null | undefined
): FinishReason | undefined {
    if (!reason) return undefined;
    switch (reason) {
        case 'stop':
        case 'length':
        case 'tool_calls':
        case 'content_filter':
        case 'error':
            return reason;
        case 'function_call':
            return 'tool_calls';
        case 'max_tokens':
            return 'length';
        default:
            return 'unknown';
    }
}

function contentToString(
    content: ORAssistantMessage['content']
): string | null {
    if (content === null || content === undefined) return null;
    if (typeof content === 'string') return content;
    const text = content
        .filter((p) => p?.type === 'text' && typeof p.text === 'string')
        .map((p) => p.text)
        .join('');
    return text.length > 0 ? text : null;
}

function mapToolCalls(
    calls: ORToolCall[] | undefined
): ToolCallResult[] | undefined {
    if (!calls || calls.length === 0) return undefined;
    return calls.map((c) => ({
        id: c.id ?? '',
        type: 'function' as const,
        function: {
            name: c.function?.name ?? '',
            arguments: c.function?.arguments ?? '',
        },
    }));
}

/** Normalize usage. Absent fields stay `undefined`; no fabricated zeros/cost. */
function normalizeUsage(usage: ORUsage | undefined): ModelUsage | undefined {
    if (!usage) return undefined;
    const out: ModelUsage = {};
    if (typeof usage.promptTokens === 'number')
        out.inputTokens = usage.promptTokens;
    if (typeof usage.completionTokens === 'number')
        out.outputTokens = usage.completionTokens;
    if (typeof usage.totalTokens === 'number')
        out.totalTokens = usage.totalTokens;
    const reasoning = usage.completionTokensDetails?.reasoningTokens;
    if (typeof reasoning === 'number') out.reasoningTokens = reasoning;
    const cached = usage.promptTokensDetails?.cachedTokens;
    if (typeof cached === 'number') out.cachedTokens = cached;
    if (typeof usage.cost === 'number') out.costUsd = usage.cost;
    return Object.keys(out).length > 0 ? out : undefined;
}

function extractAnnotations(
    metadata: unknown
): ProviderAnnotation[] | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const meta = metadata as {
        attempts?: unknown[];
        strategy?: unknown;
        summary?: unknown;
    };
    const annotations: ProviderAnnotation[] = [];
    if (typeof meta.strategy === 'string') {
        annotations.push({ type: 'routing-strategy', strategy: meta.strategy });
    }
    if (Array.isArray(meta.attempts)) {
        annotations.push({
            type: 'router-attempts',
            count: meta.attempts.length,
        });
    }
    return annotations.length > 0 ? annotations : undefined;
}

function extractProviderName(metadata: unknown): string | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const endpoints = (metadata as { endpoints?: unknown }).endpoints;
    if (endpoints && typeof endpoints === 'object') {
        const provider = (endpoints as { provider?: unknown }).provider;
        if (typeof provider === 'string') return provider;
    }
    return undefined;
}

function toChatRequestTools(
    tools: ModelToolDescriptor[] | undefined,
    warn: (m: string) => void
): unknown[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    const out: unknown[] = [];
    for (const tool of tools) {
        if (tool.type === 'function') {
            out.push({ type: 'function', function: tool.function });
        } else if (tool.transport === 'responses') {
            warn(
                `Server tool "${tool.name}" is Responses-API-only and cannot be attached to a Chat Completions request; it was dropped.`
            );
        } else {
            // Chat/either-compatible provider server tool: pass by name/config.
            out.push({ type: tool.name, ...(tool.config ?? {}) });
        }
    }
    return out.length > 0 ? out : undefined;
}

// ============================================================================
// Gateway
// ============================================================================

export class OpenRouterModelGateway implements ModelGateway {
    private readonly client: OpenRouterV1Client;
    private readonly registry: ModelRegistry;
    private readonly resolver: CapabilityResolver;
    private readonly metadata: 'disabled' | 'enabled';
    private readonly warn: (message: string) => void;

    constructor(private readonly options: OpenRouterGatewayOptions) {
        if (!options.client) {
            throw new Error('OpenRouterModelGateway requires a client');
        }
        this.client = options.client;
        this.registry = options.modelRegistry ?? modelRegistry;
        this.resolver = new CapabilityResolver(this.registry);
        this.metadata = options.metadata ?? 'disabled';
        this.warn = options.onWarning ?? (() => undefined);
    }

    async generate(request: ModelRequest): Promise<ModelCallResult> {
        const models = toNonEmptyModels(request.models);

        // Preflight capability check across the fallback chain (R3.AC3/4).
        const capabilities = this.collectRequiredCapabilities(request);
        if (capabilities.length > 0) {
            const preflight = this.resolver.preflight(models, capabilities);
            for (const w of preflight.warnings) this.warn(w);
            if (preflight.blocking) throw preflight.blocking;
        }

        for (const plugin of request.plugins ?? []) {
            if (plugin.deprecated) {
                this.warn(
                    `OpenRouter plugin "${plugin.id}" is deprecated; consider migrating.`
                );
            }
        }

        const requireParametersDefault = capabilities.length > 0;
        const chatRequest = this.buildChatRequest(
            request,
            models,
            requireParametersDefault
        );

        const streaming = Boolean(
            request.onTextDelta || request.onReasoningDelta
        );

        const requestOptions: PublicRequestOptions = {
            ...(this.options.requestOptions?.(request.signal) ?? {}),
        };
        if (request.signal) requestOptions.signal = request.signal;

        const startedAt = Date.now();
        try {
            if (streaming) {
                return await this.generateStreaming(
                    request,
                    models,
                    chatRequest,
                    requestOptions,
                    startedAt
                );
            }
            return await this.generateNonStreaming(
                request,
                models,
                chatRequest,
                requestOptions,
                startedAt
            );
        } catch (error) {
            if (error instanceof CapabilityPreflightError) throw error;
            if (error instanceof ProviderCallError) throw error;
            throw this.normalizeError(error, models);
        }
    }

    private collectRequiredCapabilities(
        request: ModelRequest
    ): ModelCapability[] {
        const caps = new Set<ModelCapability>(
            request.requiredCapabilities ?? []
        );
        if (request.tools && request.tools.length > 0) caps.add('tools');
        if (request.generation?.responseFormat) caps.add('structured-output');
        if (request.generation?.reasoning?.enabled) caps.add('reasoning');
        return Array.from(caps);
    }

    private buildChatRequest(
        request: ModelRequest,
        models: readonly [string, ...string[]],
        requireParametersDefault: boolean
    ): Record<string, unknown> {
        const gen = request.generation;
        const chatRequest: Record<string, unknown> = {
            // Preserve fallback priority order (R3.AC1).
            models: [...models],
            model: models[0],
            messages: normalizeMessages(request.messages),
        };

        if (gen?.temperature !== undefined)
            chatRequest.temperature = gen.temperature;
        if (gen?.maxOutputTokens !== undefined)
            chatRequest.maxCompletionTokens = gen.maxOutputTokens;
        if (gen?.topP !== undefined) chatRequest.topP = gen.topP;
        if (gen?.seed !== undefined) chatRequest.seed = gen.seed;
        if (gen?.stop !== undefined) chatRequest.stop = gen.stop;

        if (gen?.reasoning) {
            const reasoning: Record<string, unknown> = {};
            if (gen.reasoning.effort) reasoning.effort = gen.reasoning.effort;
            if (gen.reasoning.maxTokens !== undefined)
                reasoning.maxTokens = gen.reasoning.maxTokens;
            if (Object.keys(reasoning).length > 0)
                chatRequest.reasoning = reasoning;
        }

        if (gen?.responseFormat) {
            chatRequest.responseFormat = {
                type: 'json_schema',
                jsonSchema: {
                    name: gen.responseFormat.name,
                    description: gen.responseFormat.description,
                    schema: gen.responseFormat.schema,
                    strict: gen.responseFormat.strict ?? true,
                },
            };
        }

        const tools = toChatRequestTools(request.tools, this.warn);
        if (tools) chatRequest.tools = tools;
        if (request.toolChoice !== undefined)
            chatRequest.toolChoice = request.toolChoice;
        if (request.parallelToolCalls !== undefined)
            chatRequest.parallelToolCalls = request.parallelToolCalls;

        const provider = mapRoutingPolicy(
            request.routing,
            requireParametersDefault
        );
        if (provider) chatRequest.provider = provider;

        if (request.sessionId) chatRequest.sessionId = request.sessionId;

        return chatRequest;
    }

    private buildSendRequest(
        chatRequest: Record<string, unknown>,
        stream: boolean
    ): ORChatSendRequest {
        const send: ORChatSendRequest = {
            chatRequest: {
                ...chatRequest,
                stream,
                ...(stream
                    ? { streamOptions: { includeUsage: true } }
                    : {}),
            },
        };
        if (this.options.httpReferer) send.httpReferer = this.options.httpReferer;
        if (this.options.appTitle) send.appTitle = this.options.appTitle;
        if (this.metadata === 'enabled') send.xOpenRouterMetadata = 'enabled';
        return send;
    }

    private async generateNonStreaming(
        request: ModelRequest,
        models: readonly [string, ...string[]],
        chatRequest: Record<string, unknown>,
        requestOptions: PublicRequestOptions,
        startedAt: number
    ): Promise<ModelCallResult> {
        const send = this.buildSendRequest(chatRequest, false);
        const response = (await this.client.chat.send(
            send,
            requestOptions
        )) as ORChatResult;
        const completedAt = Date.now();

        const choice = response.choices?.[0];
        const message = choice?.message;
        const content = contentToString(message?.content);
        const toolCalls = mapToolCalls(message?.toolCalls ?? message?.tool_calls);

        const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: content ?? '',
            ...(toolCalls && toolCalls.length > 0
                ? { tool_calls: toolCalls }
                : {}),
        };

        return {
            requestedModels: models,
            actualModel: response.model,
            provider: extractProviderName(response.openrouterMetadata),
            assistantMessage,
            content,
            toolCalls,
            finishReason: normalizeFinishReason(choice?.finishReason),
            usage: normalizeUsage(response.usage),
            identifiers: response.id
                ? { requestId: response.id, generationId: response.id }
                : undefined,
            timing: {
                startedAt,
                completedAt,
                totalMs: completedAt - startedAt,
            },
            annotations: extractAnnotations(response.openrouterMetadata),
            raw: request.debug?.includeRawResponse
                ? { provider: 'openrouter', value: response }
                : undefined,
        };
    }

    private async generateStreaming(
        request: ModelRequest,
        models: readonly [string, ...string[]],
        chatRequest: Record<string, unknown>,
        requestOptions: PublicRequestOptions,
        startedAt: number
    ): Promise<ModelCallResult> {
        const send = this.buildSendRequest(chatRequest, true);
        const stream = (await this.client.chat.send(
            send,
            requestOptions
        )) as AsyncIterable<ORStreamChunk>;

        let content = '';
        let finishReason: string | null | undefined;
        let usage: ORUsage | undefined;
        let actualModel: string | undefined;
        let responseId: string | undefined;
        let metadata: unknown;
        let firstTokenAt: number | undefined;
        const toolCallsByIndex = new Map<number, ToolCallResult>();

        for await (const chunk of stream) {
            if (request.signal?.aborted) {
                throw new ProviderCallError({
                    message: 'Request aborted',
                    retryable: false,
                    requestedModels: models,
                });
            }
            if (chunk.error) {
                throw new ProviderCallError({
                    message: chunk.error.message ?? 'OpenRouter stream error',
                    statusCode: chunk.error.code,
                    requestedModels: models,
                });
            }
            if (chunk.model) actualModel = chunk.model;
            if (chunk.id) responseId = chunk.id;
            if (chunk.usage) usage = chunk.usage;
            if (chunk.openrouterMetadata) metadata = chunk.openrouterMetadata;

            const choice = chunk.choices?.[0];
            if (choice?.finishReason) finishReason = choice.finishReason;
            const delta = choice?.delta;
            if (delta?.reasoning) request.onReasoningDelta?.(delta.reasoning);
            if (delta?.content) {
                if (firstTokenAt === undefined) firstTokenAt = Date.now();
                content += delta.content;
                request.onTextDelta?.(delta.content);
            }
            const deltaToolCalls = delta?.toolCalls ?? delta?.tool_calls;
            if (deltaToolCalls) {
                for (const tc of deltaToolCalls) {
                    const index = tc.index ?? 0;
                    const existing = toolCallsByIndex.get(index);
                    if (!existing) {
                        toolCallsByIndex.set(index, {
                            id: tc.id ?? '',
                            type: 'function',
                            function: {
                                name: tc.function?.name ?? '',
                                arguments: tc.function?.arguments ?? '',
                            },
                        });
                    } else {
                        if (tc.id) existing.id = tc.id;
                        if (tc.function?.name)
                            existing.function.name = tc.function.name;
                        if (tc.function?.arguments)
                            existing.function.arguments +=
                                tc.function.arguments;
                    }
                }
            }
        }

        const completedAt = Date.now();
        const toolCalls =
            toolCallsByIndex.size > 0
                ? Array.from(toolCallsByIndex.values())
                : undefined;
        const assistantMessage: ChatMessage = {
            role: 'assistant',
            content,
            ...(toolCalls ? { tool_calls: toolCalls } : {}),
        };

        return {
            requestedModels: models,
            actualModel,
            provider: extractProviderName(metadata),
            assistantMessage,
            content: content.length > 0 ? content : null,
            toolCalls,
            finishReason: normalizeFinishReason(finishReason),
            usage: normalizeUsage(usage),
            identifiers: responseId
                ? { requestId: responseId, generationId: responseId }
                : undefined,
            timing: {
                startedAt,
                completedAt,
                totalMs: completedAt - startedAt,
                firstTokenMs:
                    firstTokenAt !== undefined
                        ? firstTokenAt - startedAt
                        : undefined,
            },
            annotations: extractAnnotations(metadata),
            raw: undefined,
        };
    }

    private normalizeError(
        error: unknown,
        models: readonly string[]
    ): ProviderCallError {
        const message =
            error instanceof Error ? error.message : String(error);
        const statusCode =
            typeof (error as { statusCode?: unknown })?.statusCode === 'number'
                ? (error as { statusCode: number }).statusCode
                : typeof (error as { status?: unknown })?.status === 'number'
                  ? (error as { status: number }).status
                  : undefined;
        const retryable =
            statusCode === undefined
                ? false
                : statusCode === 429 || statusCode >= 500;
        return new ProviderCallError({
            message,
            statusCode,
            retryable,
            requestedModels: models,
            cause: error,
        });
    }

    async getModelCapabilities(
        modelId: string
    ): Promise<ModelCapabilities | null> {
        const model = this.registry.get(modelId);
        if (!model) return null;
        const info = toModelInfo(model);
        return {
            id: info.id,
            name: info.name,
            inputModalities: info.inputModalities,
            outputModalities: info.outputModalities,
            contextLength: info.contextLength,
            supportedParameters: info.supportedParameters,
        };
    }

    /** Parse a structured value from result content (used by structured runtime). */
    static tryParseStructured(content: string | null): JsonValue | undefined {
        if (!content) return undefined;
        try {
            return JSON.parse(content) as JsonValue;
        } catch {
            return undefined;
        }
    }
}
