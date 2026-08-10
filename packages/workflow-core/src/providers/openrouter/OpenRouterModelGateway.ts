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
    promptTokensDetails?: {
        cachedTokens?: number;
        cacheWriteTokens?: number;
    } | null;
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
    error?: {
        code?: number;
        message?: string;
        metadata?: {
            errorType?: string;
            providerCode?: string;
            [key: string]: unknown;
        };
    };
}

const MAX_PROMPT_CACHE_KEY_LENGTH = 64;
const PROMPT_CACHE_KEY_HASH_LENGTH = 16;

function promptCacheKey(sessionId: string): string {
    if (sessionId.length <= MAX_PROMPT_CACHE_KEY_LENGTH) return sessionId;

    // Two 32-bit FNV-style lanes give long session IDs a stable 64-bit-shaped
    // suffix without BigInt syntax or a Node-only crypto dependency. The
    // gateway is bundled for ES2019 in browser and server builds.
    let hashA = 0x811c9dc5;
    let hashB = 0x9e3779b9;
    for (const byte of new TextEncoder().encode(sessionId)) {
        hashA = Math.imul(hashA ^ byte, 0x01000193) >>> 0;
        hashB = Math.imul(hashB ^ byte, 0x85ebca6b) >>> 0;
    }
    const suffix = `${hashA.toString(16).padStart(8, '0')}${hashB
        .toString(16)
        .padStart(8, '0')}`;
    const prefixLength =
        MAX_PROMPT_CACHE_KEY_LENGTH - PROMPT_CACHE_KEY_HASH_LENGTH - 1;
    return `${sessionId.slice(0, prefixLength)}:${suffix}`;
}

function unwrapProviderErrorMessage(value: string): string {
    const trimmed = value.trim();
    if (!trimmed.startsWith('{')) return trimmed || value;
    try {
        const parsed = JSON.parse(trimmed) as {
            error?: { message?: unknown };
        };
        return typeof parsed.error?.message === 'string'
            ? parsed.error.message
            : value;
    } catch {
        return value;
    }
}

function providerErrorMessage(
    fallback: string,
    metadata?: Record<string, unknown> | null
): string {
    const raw = metadata?.raw;
    if (typeof raw === 'string' && raw.trim()) {
        return unwrapProviderErrorMessage(raw);
    }

    const message = unwrapProviderErrorMessage(fallback);

    const details = [
        typeof metadata?.errorType === 'string'
            ? metadata.errorType
            : undefined,
        typeof metadata?.providerCode === 'string'
            ? `provider code ${metadata.providerCode}`
            : undefined,
    ].filter(Boolean);
    return details.length > 0 ? `${message} (${details.join(', ')})` : message;
}

function errorBodyDetails(error: unknown): {
    message?: string;
    metadata?: Record<string, unknown> | null;
} {
    if (!error || typeof error !== 'object') return {};

    const structured = (error as { error?: unknown }).error;
    if (structured && typeof structured === 'object') {
        const value = structured as {
            message?: unknown;
            metadata?: unknown;
        };
        return {
            message:
                typeof value.message === 'string' ? value.message : undefined,
            metadata:
                value.metadata && typeof value.metadata === 'object'
                    ? (value.metadata as Record<string, unknown>)
                    : undefined,
        };
    }

    const body = (error as { body?: unknown }).body;
    if (typeof body !== 'string') return {};
    try {
        const parsed = JSON.parse(body) as {
            error?: { message?: unknown; metadata?: unknown };
        };
        return {
            message:
                typeof parsed.error?.message === 'string'
                    ? parsed.error.message
                    : undefined,
            metadata:
                parsed.error?.metadata &&
                typeof parsed.error.metadata === 'object'
                    ? (parsed.error.metadata as Record<string, unknown>)
                    : undefined,
        };
    } catch {
        return {};
    }
}

/** Minimal structural view of the OpenRouter v1 client used by the gateway. */
export interface OpenRouterV1Client {
    chat: {
        send(
            request: ORChatSendRequest,
            options?: PublicRequestOptions
        ): Promise<ORChatResult | AsyncIterable<ORStreamChunk>>;
    };
    models?: {
        get(request: {
            author: string;
            slug: string;
        }): Promise<
            | { data?: import('../../models').OpenRouterModel }
            | import('../../models').OpenRouterModel
        >;
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
    /** TTL for lazily fetched model capability entries (default: 5 minutes). */
    capabilityCatalogTtlMs?: number;
    /** TTL after a failed/missing catalog lookup (default: 30 seconds). */
    capabilityCatalogFailureTtlMs?: number;
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
    const cacheWrite = usage.promptTokensDetails?.cacheWriteTokens;
    if (typeof cacheWrite === 'number') out.cacheWriteTokens = cacheWrite;
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
    const meta = metadata as {
        endpoints?: { available?: unknown };
        attempts?: unknown;
    };
    const available = meta.endpoints?.available;
    if (Array.isArray(available)) {
        const selected = available.find(
            (endpoint): endpoint is { provider: string; selected: true } =>
                Boolean(
                    endpoint &&
                        typeof endpoint === 'object' &&
                        (endpoint as { selected?: unknown }).selected === true &&
                        typeof (endpoint as { provider?: unknown }).provider ===
                            'string'
                )
        );
        if (selected) return selected.provider;
    }
    if (Array.isArray(meta.attempts)) {
        const successful = [...meta.attempts].reverse().find(
            (attempt): attempt is { provider: string; status: number } =>
                Boolean(
                    attempt &&
                        typeof attempt === 'object' &&
                        typeof (attempt as { provider?: unknown }).provider ===
                            'string' &&
                        typeof (attempt as { status?: unknown }).status ===
                            'number' &&
                        (attempt as { status: number }).status >= 200 &&
                        (attempt as { status: number }).status < 400
                )
        );
        if (successful) return successful.provider;
    }
    return undefined;
}

function toChatRequestTools(
    tools: ModelToolDescriptor[] | undefined,
    models: readonly string[]
): unknown[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    const out: unknown[] = [];
    for (const tool of tools) {
        if (tool.type === 'function') {
            out.push({ type: 'function', function: tool.function });
        } else if (tool.transport === 'responses') {
            throw new ProviderCallError({
                message: `Server tool "${tool.name}" requires the Responses API and cannot be attached to a Chat Completions request.`,
                retryable: false,
                requestedModels: models,
            });
        } else {
            // Chat/either-compatible provider server tool: pass by name/config.
            out.push({ type: tool.name, ...(tool.config ?? {}) });
        }
    }
    return out.length > 0 ? out : undefined;
}

function toChatRequestPlugins(
    plugins: ModelRequest['plugins']
): unknown[] | undefined {
    if (!plugins || plugins.length === 0) return undefined;
    return plugins.map((plugin) => ({
        id: plugin.id,
        ...(plugin.config ?? {}),
    }));
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
    private readonly capabilityRefreshes = new Map<
        string,
        { expiresAt: number; promise: Promise<void> }
    >();

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
        await Promise.all(
            models.map((model) => this.refreshModel(model))
        );

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
        if (request.parallelToolCalls === true)
            caps.add('parallel-tool-calls');
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
            messages: normalizeMessages(request.messages),
        };

        if (gen?.temperature !== undefined)
            chatRequest.temperature = gen.temperature;
        if (gen?.maxOutputTokens !== undefined)
            // OpenRouter's model catalog still advertises `max_tokens` for
            // providers such as xAI. Sending `max_completion_tokens` together
            // with require_parameters can filter every otherwise-compatible
            // endpoint. The SDK keeps `maxTokens` for this cross-provider case.
            chatRequest.maxTokens = gen.maxOutputTokens;
        if (gen?.topP !== undefined) chatRequest.topP = gen.topP;
        if (gen?.seed !== undefined) chatRequest.seed = gen.seed;
        if (gen?.stop !== undefined) chatRequest.stop = gen.stop;

        if (gen?.reasoning) {
            const reasoning: Record<string, unknown> = {};
            if (gen.reasoning.effort) reasoning.effort = gen.reasoning.effort;
            if (gen.reasoning.summary)
                reasoning.summary = gen.reasoning.summary;
            if (gen.reasoning.maxTokens !== undefined) {
                this.warn(
                    'reasoning.maxTokens is not supported by the current OpenRouter Chat SDK and was ignored; use reasoning.effort instead.'
                );
            }
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

        const tools = toChatRequestTools(request.tools, models);
        if (tools) chatRequest.tools = tools;
        if (request.toolChoice !== undefined)
            chatRequest.toolChoice = request.toolChoice;
        if (request.parallelToolCalls !== undefined)
            chatRequest.parallelToolCalls = request.parallelToolCalls;
        const plugins = toChatRequestPlugins(request.plugins);
        if (plugins) chatRequest.plugins = plugins;

        const provider = mapRoutingPolicy(
            request.routing,
            requireParametersDefault
        );
        if (provider) chatRequest.provider = provider;

        if (request.sessionId) {
            chatRequest.sessionId = request.sessionId;
            // OpenRouter uses sessionId for provider stickiness; OpenAI uses
            // promptCacheKey to route matching prefixes to the same cache. Its
            // API limit is 64 characters, while workflow session IDs can be
            // longer because they include two UUIDs.
            chatRequest.promptCacheKey = promptCacheKey(request.sessionId);
        }

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
                ? { generationId: response.id }
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
        const rawChunks: ORStreamChunk[] | undefined =
            request.debug?.includeRawResponse ? [] : undefined;

        for await (const chunk of stream) {
            rawChunks?.push(chunk);
            if (request.signal?.aborted) {
                throw new ProviderCallError({
                    message: 'Request aborted',
                    retryable: false,
                    requestedModels: models,
                });
            }
            if (chunk.error) {
                throw new ProviderCallError({
                    message: providerErrorMessage(
                        chunk.error.message ?? 'OpenRouter stream error',
                        chunk.error.metadata
                    ),
                    statusCode: chunk.error.code,
                    retryable:
                        chunk.error.code === 429 ||
                        (typeof chunk.error.code === 'number' &&
                            chunk.error.code >= 500),
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
                ? { generationId: responseId }
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
            raw: rawChunks
                ? { provider: 'openrouter', value: rawChunks }
                : undefined,
        };
    }

    private normalizeError(
        error: unknown,
        models: readonly string[]
    ): ProviderCallError {
        const details = errorBodyDetails(error);
        const message = providerErrorMessage(
            details.message ??
                (error instanceof Error ? error.message : String(error)),
            details.metadata
        );
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

    private async refreshModel(modelId: string): Promise<void> {
        if (!this.client.models?.get) return;
        const now = Date.now();
        const cached = this.capabilityRefreshes.get(modelId);
        if (this.registry.has(modelId) && !cached) return;
        if (cached && cached.expiresAt > now) {
            return cached.promise;
        }
        const [author, ...slugParts] = modelId.split('/');
        if (!author || slugParts.length === 0) return;
        const refresh = (async () => {
            try {
                const response = await this.client.models!.get({
                    author,
                    slug: slugParts.join('/'),
                });
                const model =
                    response &&
                    typeof response === 'object' &&
                    'data' in response
                        ? response.data
                        : response;
                if (
                    model &&
                    typeof model === 'object' &&
                    'id' in model
                ) {
                    this.registry.register(
                        model as import('../../models').OpenRouterModel
                    );
                    this.capabilityRefreshes.set(modelId, {
                        expiresAt:
                            Date.now() +
                            (this.options.capabilityCatalogTtlMs ??
                                5 * 60_000),
                        promise: Promise.resolve(),
                    });
                    return;
                }
            } catch (error) {
                this.warn(
                    `Unable to refresh capabilities for "${modelId}": ${
                        error instanceof Error
                            ? error.message
                            : String(error)
                    }. Deferring to require_parameters.`
                );
            }
            this.capabilityRefreshes.set(modelId, {
                expiresAt:
                    Date.now() +
                    (this.options.capabilityCatalogFailureTtlMs ??
                        30_000),
                promise: Promise.resolve(),
            });
        })();
        this.capabilityRefreshes.set(modelId, {
            expiresAt:
                now +
                (this.options.capabilityCatalogFailureTtlMs ??
                    30_000),
            promise: refresh,
        });
        return refresh;
    }

    async getModelCapabilities(
        modelId: string
    ): Promise<ModelCapabilities | null> {
        await this.refreshModel(modelId);
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
