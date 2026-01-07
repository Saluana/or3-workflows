/**
 * Model Registry for OpenRouter SDK Models
 *
 * This module provides a registry for AI models that accepts OpenRouter SDK Model objects.
 * App developers can pass models from the OpenRouter SDK directly, eliminating the need
 * for hardcoded model lists.
 *
 * @example
 * ```typescript
 * import { Model } from "@openrouter/sdk/models";
 * import { ModelRegistry, modelRegistry } from "@or3-workflows/workflow-core";
 *
 * // Register models from OpenRouter SDK
 * const models: Model[] = await openrouter.models.list();
 * modelRegistry.registerMany(models);
 *
 * // Or register individual models
 * modelRegistry.register({
 *   id: "openai/gpt-4",
 *   canonicalSlug: "openai/gpt-4",
 *   name: "GPT-4",
 *   created: 1692901234,
 *   pricing: { prompt: "0.00003", completion: "0.00006" },
 *   contextLength: 8192,
 *   architecture: {
 *     modality: "text->text",
 *     inputModalities: ["text"],
 *     outputModalities: ["text"],
 *   },
 *   topProvider: { isModerated: true },
 *   perRequestLimits: null,
 *   supportedParameters: ["temperature", "top_p", "max_tokens"],
 *   defaultParameters: null,
 * });
 * ```
 */

// ============================================================================
// Re-export types from OpenRouter SDK
// ============================================================================

// Import SDK types - these use camelCase
import type {
    Model as SDKModel,
    InputModality as SDKInputModality,
    OutputModality as SDKOutputModality,
    Parameter as SDKParameter,
    ModelArchitecture as SDKModelArchitecture,
    PublicPricing as SDKPublicPricing,
    TopProviderInfo as SDKTopProviderInfo,
    PerRequestLimits as SDKPerRequestLimits,
    DefaultParameters as SDKDefaultParameters,
    ModelGroup as SDKModelGroup,
    ModelArchitectureInstructType as SDKInstructType,
} from '@openrouter/sdk/models';

// Re-export SDK types with our naming for backward compatibility
export type ModelInputModality = SDKInputModality;
export type ModelOutputModality = SDKOutputModality;
export type ModelParameter = SDKParameter;
export type ModelTokenizer = SDKModelGroup;
export type ModelInstructType = SDKInstructType;
export type ModelArchitecture = SDKModelArchitecture;
export type ModelPricing = SDKPublicPricing;
export type ModelTopProvider = SDKTopProviderInfo;
export type ModelPerRequestLimits = SDKPerRequestLimits;
export type ModelDefaultParameters = SDKDefaultParameters;

/**
 * OpenRouter Model type - directly from the SDK.
 * Uses camelCase property names as returned by the SDK.
 */
export type OpenRouterModel = SDKModel;

// ============================================================================
// Simplified Model Info for UI
// ============================================================================

/**
 * Simplified model information for UI display.
 * Contains the essential fields needed for model selection dropdowns.
 */
export interface ModelInfo {
    /** Model ID (e.g., "openai/gpt-4") */
    id: string;
    /** Display name */
    name: string;
    /** Provider name (extracted from ID) */
    provider: string;
    /** Supported input modalities */
    inputModalities: ModelInputModality[];
    /** Supported output modalities */
    outputModalities: ModelOutputModality[];
    /** Context window size */
    contextLength: number;
    /** Supported parameters */
    supportedParameters: ModelParameter[];
    /** Pricing (prompt/completion) */
    pricing?: {
        prompt: number;
        completion: number;
    };
    /** Description */
    description?: string;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Query options for filtering models.
 */
export interface ModelQuery {
    /** Filter by provider (e.g., "openai", "anthropic") */
    provider?: string;
    /** Filter by required input modality */
    inputModality?: ModelInputModality;
    /** Filter by required output modality */
    outputModality?: ModelOutputModality;
    /** Filter by minimum context length */
    minContextLength?: number;
    /** Filter by required parameter support */
    requiredParameter?: ModelParameter;
    /** Search by name (case-insensitive partial match) */
    search?: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract provider name from a model ID.
 * @param modelId - The model ID (e.g., "openai/gpt-4")
 * @returns The provider name (e.g., "OpenAI")
 */
export function extractProvider(modelId: string): string {
    const providerSlug = modelId.split('/')[0] || modelId;
    // Capitalize first letter and common formatting
    const formatted = providerSlug
        .split('-')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    return formatted;
}

/**
 * Parse pricing string/number to a number.
 * @param value - The pricing value
 * @returns The parsed number
 */
function parsePricing(value: string | number | undefined): number {
    if (value === undefined) return 0;
    if (typeof value === 'number') return value;
    return parseFloat(value) || 0;
}

/**
 * Convert an OpenRouter SDK Model to simplified ModelInfo.
 * @param model - The OpenRouter SDK Model
 * @returns Simplified ModelInfo for UI display
 */
export function toModelInfo(model: OpenRouterModel): ModelInfo {
    return {
        id: model.id,
        name: model.name,
        provider: extractProvider(model.id),
        inputModalities: model.architecture.inputModalities,
        outputModalities: model.architecture.outputModalities,
        contextLength: model.contextLength ?? 0,
        supportedParameters: model.supportedParameters,
        pricing: {
            prompt: parsePricing(model.pricing.prompt),
            completion: parsePricing(model.pricing.completion),
        },
        description: model.description,
    };
}

// ============================================================================
// Model Registry Class
// ============================================================================

/**
 * Registry for managing AI models.
 *
 * The ModelRegistry allows developers to register OpenRouter SDK Model objects
 * and provides methods to query, filter, and retrieve model information.
 *
 * @example
 * ```typescript
 * const registry = new ModelRegistry();
 *
 * // Register models from OpenRouter SDK
 * const models = await openrouter.models.list();
 * registry.registerMany(models);
 *
 * // Query models
 * const visionModels = registry.query({ inputModality: 'image' });
 * const anthropicModels = registry.query({ provider: 'anthropic' });
 * ```
 */
export class ModelRegistry {
    private models: Map<string, OpenRouterModel> = new Map();

    /**
     * Register a single model.
     * @param model - The OpenRouter SDK Model to register
     */
    register(model: OpenRouterModel): void {
        this.models.set(model.id, model);
    }

    /**
     * Register multiple models at once.
     * @param models - Array of OpenRouter SDK Models to register
     */
    registerMany(models: OpenRouterModel[]): void {
        for (const model of models) {
            this.register(model);
        }
    }

    /**
     * Unregister a model by ID.
     * @param modelId - The model ID to unregister
     * @returns true if the model was removed, false if it wasn't found
     */
    unregister(modelId: string): boolean {
        return this.models.delete(modelId);
    }

    /**
     * Clear all registered models.
     */
    clear(): void {
        this.models.clear();
    }

    /**
     * Get a model by ID.
     * @param modelId - The model ID
     * @returns The model or undefined if not found
     */
    get(modelId: string): OpenRouterModel | undefined {
        return this.models.get(modelId);
    }

    /**
     * Get simplified model info by ID.
     * @param modelId - The model ID
     * @returns The simplified ModelInfo or undefined if not found
     */
    getInfo(modelId: string): ModelInfo | undefined {
        const model = this.get(modelId);
        return model ? toModelInfo(model) : undefined;
    }

    /**
     * Check if a model is registered.
     * @param modelId - The model ID
     * @returns true if the model is registered
     */
    has(modelId: string): boolean {
        return this.models.has(modelId);
    }

    /**
     * Get all registered models.
     * @returns Array of all registered models
     */
    getAll(): OpenRouterModel[] {
        return Array.from(this.models.values());
    }

    /**
     * Get simplified info for all registered models.
     * @returns Array of ModelInfo for all registered models
     */
    getAllInfo(): ModelInfo[] {
        return this.getAll().map(toModelInfo);
    }

    /**
     * Get the number of registered models.
     */
    get size(): number {
        return this.models.size;
    }

    /**
     * Query models based on filter criteria.
     * Single-pass filtering for efficiency.
     * @param query - The query options
     * @returns Array of models matching the query
     */
    query(query: ModelQuery): OpenRouterModel[] {
        // Early return if no filters
        if (
            !query.provider &&
            !query.inputModality &&
            !query.outputModality &&
            query.minContextLength === undefined &&
            !query.requiredParameter &&
            !query.search
        ) {
            return this.getAll();
        }

        // Pre-compute lowercase values once
        const providerLower = query.provider?.toLowerCase();
        const searchLower = query.search?.toLowerCase();

        const results: OpenRouterModel[] = [];

        for (const model of this.models.values()) {
            // Check provider filter
            if (
                providerLower &&
                !model.id.toLowerCase().startsWith(providerLower + '/')
            ) {
                continue;
            }

            // Check input modality filter
            if (
                query.inputModality &&
                !model.architecture.inputModalities.includes(
                    query.inputModality
                )
            ) {
                continue;
            }

            // Check output modality filter
            if (
                query.outputModality &&
                !model.architecture.outputModalities.includes(
                    query.outputModality
                )
            ) {
                continue;
            }

            // Check minimum context length
            if (
                query.minContextLength !== undefined &&
                (model.contextLength ?? 0) < query.minContextLength
            ) {
                continue;
            }

            // Check required parameter
            if (
                query.requiredParameter &&
                !model.supportedParameters.includes(query.requiredParameter)
            ) {
                continue;
            }

            // Check search filter
            if (searchLower) {
                const nameMatch = model.name
                    .toLowerCase()
                    .includes(searchLower);
                const idMatch = model.id.toLowerCase().includes(searchLower);
                const descMatch =
                    model.description?.toLowerCase().includes(searchLower) ??
                    false;
                if (!nameMatch && !idMatch && !descMatch) {
                    continue;
                }
            }

            // All filters passed
            results.push(model);
        }

        return results;
    }

    /**
     * Query models and return simplified ModelInfo.
     * @param query - The query options
     * @returns Array of ModelInfo matching the query
     */
    queryInfo(query: ModelQuery): ModelInfo[] {
        return this.query(query).map(toModelInfo);
    }

    /**
     * Get all unique providers from registered models.
     * @returns Array of provider names
     */
    getProviders(): string[] {
        const providers = new Set<string>();
        for (const model of this.models.values()) {
            providers.add(extractProvider(model.id));
        }
        return Array.from(providers).sort();
    }

    /**
     * Get models that support a specific input modality.
     * @param modality - The input modality
     * @returns Array of models supporting the modality
     */
    getByInputModality(modality: ModelInputModality): OpenRouterModel[] {
        return this.query({ inputModality: modality });
    }

    /**
     * Get models that support vision (image input).
     * @returns Array of vision-capable models
     */
    getVisionModels(): OpenRouterModel[] {
        return this.getByInputModality('image');
    }

    /**
     * Get models that support audio input.
     * @returns Array of audio-capable models
     */
    getAudioModels(): OpenRouterModel[] {
        return this.getByInputModality('audio');
    }

    /**
     * Get models that support tools/function calling.
     * @returns Array of models supporting tools
     */
    getToolCapableModels(): OpenRouterModel[] {
        return this.query({ requiredParameter: 'tools' });
    }

    /**
     * Check if a model supports a specific input modality.
     * @param modelId - The model ID
     * @param modality - The input modality to check
     * @returns true if the model supports the modality, false otherwise
     */
    supportsInputModality(
        modelId: string,
        modality: ModelInputModality
    ): boolean {
        const model = this.get(modelId);
        return model?.architecture.inputModalities.includes(modality) ?? false;
    }

    /**
     * Check if a model supports tools/function calling.
     * @param modelId - The model ID
     * @returns true if the model supports tools
     */
    supportsTools(modelId: string): boolean {
        const model = this.get(modelId);
        return model?.supportedParameters.includes('tools') ?? false;
    }

    /**
     * Get the context length for a model.
     * @param modelId - The model ID
     * @returns The context length or undefined if model not found
     */
    getContextLength(modelId: string): number | undefined {
        return this.get(modelId)?.contextLength ?? undefined;
    }
}

// ============================================================================
// Global Registry Instance
// ============================================================================

/**
 * Global model registry instance.
 *
 * Use this singleton for most cases. For isolated testing or
 * multiple registry scenarios, create a new ModelRegistry instance.
 */
export const modelRegistry = new ModelRegistry();

// ============================================================================
// Default Models
// ============================================================================

/**
 * A set of commonly used models that can be registered as defaults.
 * These are useful for demos or when the full model list isn't available.
 * Uses the SDK's camelCase format.
 */
export const DEFAULT_MODELS: OpenRouterModel[] = [
    {
        id: 'openai/gpt-5.1',
        canonicalSlug: 'openai/gpt-5.1-20251113',
        huggingFaceId: '',
        name: 'OpenAI: GPT-5.1',
        created: 1763060305,
        description:
            'GPT-5.1 is the latest frontier-grade model in the GPT-5 series, offering stronger general-purpose reasoning, improved instruction adherence, and a more natural conversational style compared to GPT-5.',
        contextLength: 400000,
        architecture: {
            modality: 'text+image->text',
            inputModalities: ['image', 'text', 'file'],
            outputModalities: ['text'],
            tokenizer: 'GPT',
            instructType: null,
        },
        pricing: {
            prompt: '0.00000125',
            completion: '0.00001',
            request: '0',
            image: '0',
            webSearch: '0.01',
            internalReasoning: '0',
            inputCacheRead: '0.000000125',
        },
        topProvider: {
            contextLength: 400000,
            maxCompletionTokens: 128000,
            isModerated: true,
        },
        perRequestLimits: null,
        supportedParameters: [
            'frequency_penalty',
            'include_reasoning',
            'logit_bias',
            'logprobs',
            'max_tokens',
            'presence_penalty',
            'reasoning',
            'response_format',
            'seed',
            'stop',
            'structured_outputs',
            'tool_choice',
            'tools',
            'top_logprobs',
        ],
        defaultParameters: {
            temperature: null,
            topP: null,
            frequencyPenalty: null,
        },
    },
    {
        id: 'google/gemini-3-pro-preview',
        canonicalSlug: 'google/gemini-3-pro-preview-20251117',
        huggingFaceId: '',
        name: 'Google: Gemini 3 Pro Preview',
        created: 1763474668,
        description:
            "Gemini 3 Pro is Google's flagship frontier model for high-precision multimodal reasoning, combining strong performance across text, image, video, audio, and code with a 1M-token context window.",
        contextLength: 1048576,
        architecture: {
            modality: 'text+image->text',
            inputModalities: ['text', 'image', 'file', 'audio', 'video'],
            outputModalities: ['text'],
            tokenizer: 'Gemini',
            instructType: null,
        },
        pricing: {
            prompt: '0.000002',
            completion: '0.000012',
            request: '0',
            image: '0.008256',
            webSearch: '0',
            internalReasoning: '0',
            inputCacheRead: '0.0000002',
            inputCacheWrite: '0.000002375',
        },
        topProvider: {
            contextLength: 1048576,
            maxCompletionTokens: 65536,
            isModerated: false,
        },
        perRequestLimits: null,
        supportedParameters: [
            'include_reasoning',
            'max_tokens',
            'reasoning',
            'response_format',
            'seed',
            'stop',
            'structured_outputs',
            'temperature',
            'tool_choice',
            'tools',
            'top_p',
        ],
        defaultParameters: {
            temperature: null,
            topP: null,
            frequencyPenalty: null,
        },
    },
    {
        id: 'z-ai/glm-4.6',
        canonicalSlug: 'z-ai/glm-4.6',
        huggingFaceId: '',
        name: 'Z.AI: GLM 4.6',
        created: 1759235576,
        description:
            'GLM-4.6 brings longer context (200K), superior coding, advanced reasoning with tool use, and refined writing.',
        contextLength: 202752,
        architecture: {
            modality: 'text->text',
            inputModalities: ['text'],
            outputModalities: ['text'],
            tokenizer: 'Other',
            instructType: null,
        },
        pricing: {
            prompt: '0.0000004',
            completion: '0.00000175',
            request: '0',
            image: '0',
            webSearch: '0',
            internalReasoning: '0',
        },
        topProvider: {
            contextLength: 202752,
            maxCompletionTokens: 202752,
            isModerated: false,
        },
        perRequestLimits: null,
        supportedParameters: [
            'frequency_penalty',
            'include_reasoning',
            'logit_bias',
            'logprobs',
            'max_tokens',
            'min_p',
            'presence_penalty',
            'reasoning',
            'repetition_penalty',
            'response_format',
            'seed',
            'stop',
            'structured_outputs',
            'temperature',
            'tool_choice',
            'tools',
            'top_a',
            'top_k',
            'top_logprobs',
            'top_p',
        ],
        defaultParameters: {
            temperature: 0.6,
            topP: null,
            frequencyPenalty: null,
        },
    },
    {
        id: 'moonshotai/kimi-k2-thinking',
        canonicalSlug: 'moonshotai/kimi-k2-thinking-20251106',
        huggingFaceId: 'moonshotai/Kimi-K2-Thinking',
        name: 'MoonshotAI: Kimi K2 Thinking',
        created: 1762440622,
        description:
            "Kimi K2 Thinking is Moonshot AI's most advanced open reasoning model, optimized for persistent step-by-step thought and complex reasoning workflows.",
        contextLength: 262144,
        architecture: {
            modality: 'text->text',
            inputModalities: ['text'],
            outputModalities: ['text'],
            tokenizer: 'Other',
            instructType: null,
        },
        pricing: {
            prompt: '0.00000045',
            completion: '0.00000235',
            request: '0',
            image: '0',
            webSearch: '0',
            internalReasoning: '0',
        },
        topProvider: {
            contextLength: 262144,
            maxCompletionTokens: 16384,
            isModerated: false,
        },
        perRequestLimits: null,
        supportedParameters: [
            'frequency_penalty',
            'include_reasoning',
            'logit_bias',
            'logprobs',
            'max_tokens',
            'min_p',
            'presence_penalty',
            'reasoning',
            'repetition_penalty',
            'response_format',
            'seed',
            'stop',
            'structured_outputs',
            'temperature',
            'tool_choice',
            'tools',
            'top_k',
            'top_logprobs',
            'top_p',
        ],
        defaultParameters: {
            temperature: null,
            topP: null,
            frequencyPenalty: null,
        },
    },
    {
        id: 'moonshotai/kimi-k2-0905:nitro',
        canonicalSlug: 'moonshotai/kimi-k2-0905',
        huggingFaceId: 'moonshotai/Kimi-K2-Instruct-0905',
        name: 'MoonshotAI: Kimi K2 0905',
        created: 1757021147,
        description:
            'Kimi K2 0905 is a large-scale MoE language model with 1T parameters and 256k context, optimized for agentic coding and tool use.',
        contextLength: 262144,
        architecture: {
            modality: 'text->text',
            inputModalities: ['text'],
            outputModalities: ['text'],
            tokenizer: 'Other',
            instructType: null,
        },
        pricing: {
            prompt: '0.00000039',
            completion: '0.0000019',
            request: '0',
            image: '0',
            webSearch: '0',
            internalReasoning: '0',
        },
        topProvider: {
            contextLength: 262144,
            maxCompletionTokens: 262144,
            isModerated: false,
        },
        perRequestLimits: null,
        supportedParameters: [
            'frequency_penalty',
            'logit_bias',
            'logprobs',
            'max_tokens',
            'min_p',
            'presence_penalty',
            'repetition_penalty',
            'response_format',
            'seed',
            'stop',
            'structured_outputs',
            'temperature',
            'tool_choice',
            'tools',
            'top_k',
            'top_logprobs',
            'top_p',
        ],
        defaultParameters: {},
    },
];

/**
 * Register the default models in the global registry.
 * Call this to populate the registry with common models.
 */
export function registerDefaultModels(): void {
    modelRegistry.registerMany(DEFAULT_MODELS);
}
