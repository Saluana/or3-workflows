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
 *   canonical_slug: "openai/gpt-4",
 *   name: "GPT-4",
 *   created: 1692901234,
 *   pricing: { prompt: "0.00003", completion: "0.00006" },
 *   context_length: 8192,
 *   architecture: {
 *     modality: "text->text",
 *     input_modalities: ["text"],
 *     output_modalities: ["text"],
 *   },
 *   top_provider: { is_moderated: true },
 *   per_request_limits: null,
 *   supported_parameters: ["temperature", "top_p", "max_tokens"],
 *   default_parameters: null,
 * });
 * ```
 */

// ============================================================================
// Types matching OpenRouter SDK
// ============================================================================

/**
 * Supported input modalities for models.
 * Matches OpenRouter SDK InputModality type.
 */
export type ModelInputModality = 'text' | 'image' | 'file' | 'audio' | 'video';

/**
 * Supported output modalities for models.
 * Matches OpenRouter SDK OutputModality type.
 */
export type ModelOutputModality = 'text' | 'image' | 'embeddings';

/**
 * Tokenizer type used by the model.
 * Matches OpenRouter SDK ModelGroup type.
 */
export type ModelTokenizer =
    | 'Router'
    | 'Media'
    | 'Other'
    | 'GPT'
    | 'Claude'
    | 'Gemini'
    | 'Grok'
    | 'Cohere'
    | 'Nova'
    | 'Qwen'
    | 'Yi'
    | 'DeepSeek'
    | 'Mistral'
    | 'Llama2'
    | 'Llama3'
    | 'Llama4'
    | 'PaLM'
    | 'RWKV'
    | 'Qwen3'
    | string;

/**
 * Instruction format type.
 * Matches OpenRouter SDK ModelArchitectureInstructType.
 */
export type ModelInstructType =
    | 'none'
    | 'airoboros'
    | 'alpaca'
    | 'alpaca-modif'
    | 'chatml'
    | 'claude'
    | 'code-llama'
    | 'gemma'
    | 'llama2'
    | 'llama3'
    | 'mistral'
    | 'nemotron'
    | 'neural'
    | 'openchat'
    | 'phi3'
    | 'rwkv'
    | 'vicuna'
    | 'zephyr'
    | 'deepseek-r1'
    | 'deepseek-v3.1'
    | 'qwq'
    | 'qwen3'
    | string;

/**
 * Supported model parameters.
 * Matches OpenRouter SDK Parameter type.
 */
export type ModelParameter =
    | 'temperature'
    | 'top_p'
    | 'top_k'
    | 'min_p'
    | 'top_a'
    | 'frequency_penalty'
    | 'presence_penalty'
    | 'repetition_penalty'
    | 'max_tokens'
    | 'logit_bias'
    | 'logprobs'
    | 'top_logprobs'
    | 'seed'
    | 'response_format'
    | 'structured_outputs'
    | 'stop'
    | 'tools'
    | 'tool_choice'
    | 'parallel_tool_calls'
    | 'include_reasoning'
    | 'reasoning'
    | 'web_search_options'
    | 'verbosity'
    | string;

/**
 * Model architecture information.
 * Matches OpenRouter SDK ModelArchitecture type.
 */
export interface ModelArchitecture {
    /** Tokenizer type used by the model */
    tokenizer?: ModelTokenizer;
    /** Instruction format type */
    instruct_type?: ModelInstructType | null;
    /** Primary modality of the model (e.g., "text->text") */
    modality: string;
    /** Supported input modalities */
    input_modalities: ModelInputModality[];
    /** Supported output modalities */
    output_modalities: ModelOutputModality[];
}

/**
 * Pricing information for the model.
 * Values are strings or numbers representing USD price per million tokens.
 * Matches OpenRouter SDK PublicPricing type.
 */
export interface ModelPricing {
    /** Price per prompt token (USD per million) */
    prompt: string | number;
    /** Price per completion token (USD per million) */
    completion: string | number;
    /** Price per request (optional) */
    request?: string | number;
    /** Price per image (optional) */
    image?: string | number;
    /** Price per image token (optional) */
    image_token?: string | number;
    /** Price per image output (optional) */
    image_output?: string | number;
    /** Price per audio token (optional) */
    audio?: string | number;
    /** Price per cached audio input (optional) */
    input_audio_cache?: string | number;
    /** Price per web search (optional) */
    web_search?: string | number;
    /** Price for internal reasoning (optional) */
    internal_reasoning?: string | number;
    /** Price for reading from cache (optional) */
    input_cache_read?: string | number;
    /** Price for writing to cache (optional) */
    input_cache_write?: string | number;
    /** Discount percentage (optional) */
    discount?: number;
}

/**
 * Information about the top provider for this model.
 * Matches OpenRouter SDK TopProviderInfo type.
 */
export interface ModelTopProvider {
    /** Context length from the top provider */
    context_length?: number;
    /** Maximum completion tokens from the top provider */
    max_completion_tokens?: number;
    /** Whether the top provider moderates content */
    is_moderated: boolean;
}

/**
 * Per-request token limits.
 * Matches OpenRouter SDK PerRequestLimits type.
 */
export interface ModelPerRequestLimits {
    /** Maximum prompt tokens per request */
    prompt_tokens: number;
    /** Maximum completion tokens per request */
    completion_tokens: number;
}

/**
 * Default parameters for this model.
 * Matches OpenRouter SDK DefaultParameters type.
 */
export interface ModelDefaultParameters {
    temperature?: number | null;
    top_p?: number | null;
    frequency_penalty?: number | null;
}

/**
 * Information about an AI model available on OpenRouter.
 * This interface matches the OpenRouter SDK Model type.
 *
 * @see https://openrouter.ai/docs/sdks/typescript/models/model
 */
export interface OpenRouterModel {
    /** Unique identifier for the model (e.g., "openai/gpt-4") */
    id: string;
    /** Canonical slug for the model */
    canonical_slug: string;
    /** Hugging Face model identifier, if applicable */
    hugging_face_id?: string;
    /** Display name of the model */
    name: string;
    /** Unix timestamp of when the model was created */
    created: number;
    /** Description of the model */
    description?: string;
    /** Pricing information for the model */
    pricing: ModelPricing;
    /** Maximum context length in tokens */
    context_length: number;
    /** Model architecture information */
    architecture: ModelArchitecture;
    /** Information about the top provider for this model */
    top_provider: ModelTopProvider;
    /** Per-request token limits (null if no limits) */
    per_request_limits: ModelPerRequestLimits | null;
    /** List of supported parameters for this model */
    supported_parameters: ModelParameter[];
    /** Default parameters for this model (null if no defaults) */
    default_parameters: ModelDefaultParameters | null;
}

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
        inputModalities: model.architecture.input_modalities,
        outputModalities: model.architecture.output_modalities,
        contextLength: model.context_length,
        supportedParameters: model.supported_parameters,
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
     * @param query - The query options
     * @returns Array of models matching the query
     */
    query(query: ModelQuery): OpenRouterModel[] {
        let results = this.getAll();

        if (query.provider) {
            const providerLower = query.provider.toLowerCase();
            results = results.filter((m) =>
                m.id.toLowerCase().startsWith(providerLower + '/')
            );
        }

        if (query.inputModality) {
            results = results.filter((m) =>
                m.architecture.input_modalities.includes(query.inputModality!)
            );
        }

        if (query.outputModality) {
            results = results.filter((m) =>
                m.architecture.output_modalities.includes(query.outputModality!)
            );
        }

        if (query.minContextLength !== undefined) {
            results = results.filter(
                (m) => m.context_length >= query.minContextLength!
            );
        }

        if (query.requiredParameter) {
            results = results.filter((m) =>
                m.supported_parameters.includes(query.requiredParameter!)
            );
        }

        if (query.search) {
            const searchLower = query.search.toLowerCase();
            results = results.filter(
                (m) =>
                    m.name.toLowerCase().includes(searchLower) ||
                    m.id.toLowerCase().includes(searchLower) ||
                    (m.description?.toLowerCase().includes(searchLower) ??
                        false)
            );
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
        return model?.architecture.input_modalities.includes(modality) ?? false;
    }

    /**
     * Check if a model supports tools/function calling.
     * @param modelId - The model ID
     * @returns true if the model supports tools
     */
    supportsTools(modelId: string): boolean {
        const model = this.get(modelId);
        return model?.supported_parameters.includes('tools') ?? false;
    }

    /**
     * Get the context length for a model.
     * @param modelId - The model ID
     * @returns The context length or undefined if model not found
     */
    getContextLength(modelId: string): number | undefined {
        return this.get(modelId)?.context_length;
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
 * 
 * Note: These are example models based on real OpenRouter offerings.
 * For the most up-to-date list, fetch models directly from the OpenRouter API.
 */
export const DEFAULT_MODELS: OpenRouterModel[] = [
    {
        id: 'openai/gpt-4o',
        canonical_slug: 'openai/gpt-4o',
        hugging_face_id: '',
        name: 'OpenAI: GPT-4o',
        created: 1715367600,
        description:
            'GPT-4o is OpenAI\'s flagship multimodal model with vision capabilities. It offers strong performance across text, code, and image understanding tasks with a 128k context window.',
        context_length: 128000,
        architecture: {
            modality: 'text+image->text',
            input_modalities: ['image', 'text', 'file'],
            output_modalities: ['text'],
            tokenizer: 'GPT',
            instruct_type: null,
        },
        pricing: {
            prompt: '0.0000025',
            completion: '0.00001',
            request: '0',
            image: '0',
        },
        top_provider: {
            context_length: 128000,
            max_completion_tokens: 16384,
            is_moderated: true,
        },
        per_request_limits: null,
        supported_parameters: [
            'frequency_penalty',
            'logit_bias',
            'logprobs',
            'max_tokens',
            'presence_penalty',
            'response_format',
            'seed',
            'stop',
            'temperature',
            'tool_choice',
            'tools',
            'top_logprobs',
            'top_p',
        ],
        default_parameters: {
            temperature: 1,
            top_p: 1,
            frequency_penalty: 0,
        },
    },
    {
        id: 'openai/gpt-4o-mini',
        canonical_slug: 'openai/gpt-4o-mini',
        hugging_face_id: '',
        name: 'OpenAI: GPT-4o Mini',
        created: 1721260800,
        description:
            'GPT-4o Mini is a fast, affordable model optimized for simple tasks. It offers good performance with low latency and cost.',
        context_length: 128000,
        architecture: {
            modality: 'text+image->text',
            input_modalities: ['image', 'text'],
            output_modalities: ['text'],
            tokenizer: 'GPT',
            instruct_type: null,
        },
        pricing: {
            prompt: '0.00000015',
            completion: '0.0000006',
            request: '0',
            image: '0',
        },
        top_provider: {
            context_length: 128000,
            max_completion_tokens: 16384,
            is_moderated: true,
        },
        per_request_limits: null,
        supported_parameters: [
            'frequency_penalty',
            'logit_bias',
            'logprobs',
            'max_tokens',
            'presence_penalty',
            'response_format',
            'seed',
            'stop',
            'temperature',
            'tool_choice',
            'tools',
            'top_logprobs',
            'top_p',
        ],
        default_parameters: {
            temperature: 1,
            top_p: 1,
            frequency_penalty: 0,
        },
    },
    {
        id: 'anthropic/claude-3.5-sonnet',
        canonical_slug: 'anthropic/claude-3.5-sonnet',
        hugging_face_id: '',
        name: 'Anthropic: Claude 3.5 Sonnet',
        created: 1718841600,
        description:
            'Claude 3.5 Sonnet is Anthropic\'s most intelligent model, excelling at complex reasoning, coding, and analysis tasks with a 200k context window.',
        context_length: 200000,
        architecture: {
            modality: 'text+image->text',
            input_modalities: ['text', 'image'],
            output_modalities: ['text'],
            tokenizer: 'Claude',
            instruct_type: 'claude',
        },
        pricing: {
            prompt: '0.000003',
            completion: '0.000015',
            request: '0',
            image: '0',
        },
        top_provider: {
            context_length: 200000,
            max_completion_tokens: 8192,
            is_moderated: true,
        },
        per_request_limits: null,
        supported_parameters: [
            'max_tokens',
            'stop',
            'temperature',
            'tool_choice',
            'tools',
            'top_p',
        ],
        default_parameters: {
            temperature: 1,
            top_p: null,
            frequency_penalty: null,
        },
    },
    {
        id: 'google/gemini-1.5-pro',
        canonical_slug: 'google/gemini-1.5-pro',
        hugging_face_id: '',
        name: 'Google: Gemini 1.5 Pro',
        created: 1707436800,
        description:
            'Gemini 1.5 Pro is Google\'s flagship multimodal model with an industry-leading 1M token context window, supporting text, image, audio, and video inputs.',
        context_length: 1000000,
        architecture: {
            modality: 'text+image->text',
            input_modalities: ['text', 'image', 'audio', 'video'],
            output_modalities: ['text'],
            tokenizer: 'Gemini',
            instruct_type: null,
        },
        pricing: {
            prompt: '0.00000125',
            completion: '0.000005',
            request: '0',
            image: '0',
        },
        top_provider: {
            context_length: 1000000,
            max_completion_tokens: 8192,
            is_moderated: false,
        },
        per_request_limits: null,
        supported_parameters: [
            'max_tokens',
            'response_format',
            'stop',
            'temperature',
            'tool_choice',
            'tools',
            'top_p',
        ],
        default_parameters: {
            temperature: 1,
            top_p: null,
            frequency_penalty: null,
        },
    },
];

/**
 * Register the default models in the global registry.
 * Call this to populate the registry with common models.
 */
export function registerDefaultModels(): void {
    modelRegistry.registerMany(DEFAULT_MODELS);
}
