/**
 * Provider-neutral model gateway contract (R2).
 *
 * `ModelGateway` is the internal, SDK-agnostic surface that native loops and
 * optional agent backends call. It expresses a model call as a `ModelRequest`
 * (an ordered, non-empty model list plus messages, generation settings, tool
 * settings, required capabilities, callbacks, and an `AbortSignal`) and returns
 * a normalized `ModelCallResult`.
 *
 * The legacy positional `LLMProvider.chat(model, messages, options)` contract
 * remains exported and supported through {@link LegacyLLMProviderGateway}.
 */
import type {
    ChatMessage,
    ModelCapabilities,
    ToolCallResult,
    ToolFunctionDefinition,
} from '../types';

// ============================================================================
// JSON values
// ============================================================================

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
    | JsonPrimitive
    | JsonValue[]
    | { [key: string]: JsonValue };

// ============================================================================
// Non-empty model list
// ============================================================================

/** A non-empty, priority-ordered list of model ids. */
export type NonEmptyModels = readonly [string, ...string[]];

/** Runtime guard + narrowing helper for non-empty model arrays. */
export function toNonEmptyModels(
    models: readonly string[]
): NonEmptyModels {
    if (models.length === 0) {
        throw new Error(
            'ModelRequest.models must contain at least one model id'
        );
    }
    return models as NonEmptyModels;
}

// ============================================================================
// Capabilities
// ============================================================================

/** Capability a request may require of the resolved model/provider. */
export type ModelCapability =
    | 'tools'
    | 'parallel-tool-calls'
    | 'structured-output'
    | 'response-format'
    | 'reasoning'
    | 'vision'
    | 'audio-input'
    | 'video-input'
    | 'file-input'
    | (string & {});

/** Tri-state capability support result (design: not a boolean). */
export type CapabilitySupport = 'supported' | 'unsupported' | 'unknown';

/** Source of evidence for a capability decision. */
export type CapabilityEvidence =
    | 'catalog'
    | 'provider'
    | 'require-parameters'
    | 'inference'
    | 'none';

export interface CapabilityCheck {
    capability: ModelCapability;
    support: CapabilitySupport;
    evidence: CapabilityEvidence;
}

export interface ModelCapabilityReport {
    modelId: string;
    checks: CapabilityCheck[];
    /** True when at least one required capability is `unsupported`. */
    blocked: boolean;
    /** True when at least one required capability is `unknown`. */
    deferred: boolean;
}

// ============================================================================
// Generation settings
// ============================================================================

export type ReasoningEffort =
    | 'none'
    | 'minimal'
    | 'low'
    | 'medium'
    | 'high'
    | 'xhigh'
    | 'max';

export interface ReasoningConfig {
    enabled?: boolean;
    effort?: ReasoningEffort;
    maxTokens?: number;
}

/** Structured-output request (JSON Schema based). */
export interface StructuredOutputRequest {
    name: string;
    description?: string;
    schema: Record<string, unknown>;
    strict?: boolean;
}

export interface GenerationSettings {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    seed?: number;
    stop?: string[];
    reasoning?: ReasoningConfig;
    responseFormat?: StructuredOutputRequest;
}

// ============================================================================
// Routing
// ============================================================================

export type DataCollectionPolicy = 'allow' | 'deny';

export interface MaxPricePolicy {
    prompt?: number;
    completion?: number;
    request?: number;
    image?: number;
    audio?: number;
}

/**
 * Provider routing policy (R3). Maps to OpenRouter provider preferences at the
 * adapter boundary without reading any SDK private fields.
 */
export interface ProviderRoutingPolicy {
    /** Ordered provider slugs to prefer. */
    order?: string[];
    /** Provider slugs to allow (allow-list). */
    allow?: string[];
    /** Provider slugs to deny (deny-list). */
    deny?: string[];
    /** Whether to allow backup providers when the primary is unavailable. */
    allowFallbacks?: boolean;
    /**
     * Require providers to support all requested parameters. Defaults to `true`
     * when the request declares required capabilities (R3.AC3).
     */
    requireParameters?: boolean;
    /** Data-collection / training policy. */
    dataCollection?: DataCollectionPolicy;
    /** Convenience alias: require zero-data-retention providers (implies deny). */
    zeroDataRetention?: boolean;
    /** Maximum price limits (USD per million tokens / per unit). */
    maxPrice?: MaxPricePolicy;
    /** Sorting strategy when `order` is not specified. */
    sort?: 'price' | 'throughput' | 'latency';
    /** Preferred (soft) maximum latency in seconds. */
    preferredMaxLatencySeconds?: number;
    /** Preferred (soft) minimum throughput in tokens/sec. */
    preferredMinThroughput?: number;
    /** Quantization levels to allow. */
    quantizations?: string[];
}

// ============================================================================
// Tools & plugins
// ============================================================================

export type ToolChoice =
    | 'auto'
    | 'none'
    | 'required'
    | { type: 'function'; function: { name: string } };

/**
 * A model-callable tool descriptor. Local/host tools are represented as
 * `function` tools; OpenRouter-managed server tools carry a transport gate and
 * are executed by the provider inside the model request (R6.AC4).
 */
export type ModelToolDescriptor =
    | { type: 'function'; function: ToolFunctionDefinition }
    | {
          type: 'provider-server';
          name: string;
          transport: 'chat' | 'responses' | 'either';
          config?: Record<string, unknown>;
      };

/** OpenRouter request/response plugin descriptor (distinct from server tools). */
export interface ProviderPluginDescriptor {
    id: string;
    kind: 'request' | 'response' | 'router';
    config?: Record<string, unknown>;
    /** Adapter warns when a deprecated plugin is configured (R6.AC6). */
    deprecated?: boolean;
}

// ============================================================================
// Request
// ============================================================================

export interface ModelRequest {
    /** Non-empty, priority-ordered model list (R2.AC1). */
    models: NonEmptyModels;
    messages: ChatMessage[];
    generation?: GenerationSettings;
    routing?: ProviderRoutingPolicy;
    tools?: ModelToolDescriptor[];
    toolChoice?: ToolChoice;
    /** Whether the model may emit parallel tool calls (independent of executor concurrency). */
    parallelToolCalls?: boolean;
    requiredCapabilities?: ModelCapability[];
    plugins?: ProviderPluginDescriptor[];
    /** Optional stable session id for sticky routing / prompt caching. */
    sessionId?: string;
    onTextDelta?: (delta: string) => void;
    onReasoningDelta?: (delta: string) => void;
    signal?: AbortSignal;
    /** Opt-in raw provider response capture (R2.AC4). */
    debug?: { includeRawResponse?: boolean };
}

// ============================================================================
// Result
// ============================================================================

export type FinishReason =
    | 'stop'
    | 'length'
    | 'tool_calls'
    | 'content_filter'
    | 'error'
    | 'unknown';

export interface ModelUsage {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    cachedTokens?: number;
    totalTokens?: number;
    costUsd?: number;
}

export interface ModelIdentifiers {
    requestId?: string;
    generationId?: string;
    upstreamId?: string;
}

export interface ModelTiming {
    startedAt: number;
    completedAt: number;
    firstTokenMs?: number;
    totalMs: number;
}

export interface ProviderAnnotation {
    type: string;
    [key: string]: unknown;
}

export interface ModelCallResult {
    /** Echo of the requested model list (R2.AC2). */
    requestedModels: NonEmptyModels;
    /** Actual model reported by the provider, if any (never fabricated). */
    actualModel?: string;
    /** Provider name when reported. */
    provider?: string;
    assistantMessage: ChatMessage;
    content: string | null;
    structuredValue?: JsonValue;
    toolCalls?: ToolCallResult[];
    finishReason?: FinishReason;
    usage?: ModelUsage;
    identifiers?: ModelIdentifiers;
    timing?: ModelTiming;
    annotations?: ProviderAnnotation[];
    /** Present only when `request.debug.includeRawResponse` was set (R2.AC4). */
    raw?: { provider: string; value: unknown };
}

// ============================================================================
// Gateway
// ============================================================================

export interface ModelGateway {
    generate(request: ModelRequest): Promise<ModelCallResult>;
    getModelCapabilities(
        modelId: string
    ): Promise<ModelCapabilities | null>;
}

// ============================================================================
// Errors
// ============================================================================

/** Base class for gateway-originated errors. */
export class GatewayError extends Error {
    constructor(
        message: string,
        readonly cause?: unknown
    ) {
        super(message);
        this.name = 'GatewayError';
    }
}

/**
 * Preflight capability failure (R3.AC4). Carries the model, the required
 * capability, the source of evidence, and whether catalog state was unknown.
 */
export class CapabilityPreflightError extends GatewayError {
    readonly modelId: string;
    readonly capability: ModelCapability;
    readonly evidence: CapabilityEvidence;
    readonly catalogUnknown: boolean;

    constructor(params: {
        modelId: string;
        capability: ModelCapability;
        evidence: CapabilityEvidence;
        catalogUnknown: boolean;
        message?: string;
    }) {
        super(
            params.message ??
                `Model "${params.modelId}" does not support required capability "${params.capability}" (evidence: ${params.evidence})`
        );
        this.name = 'CapabilityPreflightError';
        this.modelId = params.modelId;
        this.capability = params.capability;
        this.evidence = params.evidence;
        this.catalogUnknown = params.catalogUnknown;
    }
}

/** Normalized provider/router failure. Preserves cause without leaking creds. */
export class ProviderCallError extends GatewayError {
    readonly statusCode?: number;
    readonly retryable: boolean;
    readonly requestedModels?: readonly string[];
    readonly actualModel?: string;
    readonly provider?: string;
    readonly identifiers?: ModelIdentifiers;

    constructor(params: {
        message: string;
        statusCode?: number;
        retryable?: boolean;
        requestedModels?: readonly string[];
        actualModel?: string;
        provider?: string;
        identifiers?: ModelIdentifiers;
        cause?: unknown;
    }) {
        super(params.message, params.cause);
        this.name = 'ProviderCallError';
        this.statusCode = params.statusCode;
        this.retryable = params.retryable ?? false;
        this.requestedModels = params.requestedModels;
        this.actualModel = params.actualModel;
        this.provider = params.provider;
        this.identifiers = params.identifiers;
    }
}
