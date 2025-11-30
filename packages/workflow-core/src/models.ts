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
 */
export const DEFAULT_MODELS: OpenRouterModel[] = [
    {
        id: 'openai/gpt-5.1',
        canonical_slug: 'openai/gpt-5.1-20251113',
        hugging_face_id: '',
        name: 'OpenAI: GPT-5.1',
        created: 1763060305,
        description:
            'GPT-5.1 is the latest frontier-grade model in the GPT-5 series, offering stronger general-purpose reasoning, improved instruction adherence, and a more natural conversational style compared to GPT-5. It uses adaptive reasoning to allocate computation dynamically, responding quickly to simple queries while spending more depth on complex tasks. The model produces clearer, more grounded explanations with reduced jargon, making it easier to follow even on technical or multi-step problems.\n\nBuilt for broad task coverage, GPT-5.1 delivers consistent gains across math, coding, and structured analysis workloads, with more coherent long-form answers and improved tool-use reliability. It also features refined conversational alignment, enabling warmer, more intuitive responses without compromising precision. GPT-5.1 serves as the primary full-capability successor to GPT-5',
        context_length: 400000,
        architecture: {
            modality: 'text+image-\u003Etext',
            input_modalities: ['image', 'text', 'file'],
            output_modalities: ['text'],
            tokenizer: 'GPT',
            instruct_type: null,
        },
        pricing: {
            prompt: '0.00000125',
            completion: '0.00001',
            request: '0',
            image: '0',
            web_search: '0.01',
            internal_reasoning: '0',
            input_cache_read: '0.000000125',
        },
        top_provider: {
            context_length: 400000,
            max_completion_tokens: 128000,
            is_moderated: true,
        },
        per_request_limits: null,
        supported_parameters: [
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
        default_parameters: {
            temperature: null,
            top_p: null,
            frequency_penalty: null,
        },
    },
    {
        id: 'google/gemini-3-pro-preview',
        canonical_slug: 'google/gemini-3-pro-preview-20251117',
        hugging_face_id: '',
        name: 'Google: Gemini 3 Pro Preview',
        created: 1763474668,
        description:
            'Gemini 3 Pro is Google’s flagship frontier model for high-precision multimodal reasoning, combining strong performance across text, image, video, audio, and code with a 1M-token context window. Reasoning Details must be preserved when using multi-turn tool calling, see our docs here: https://openrouter.ai/docs/use-cases/reasoning-tokens#preserving-reasoning-blocks. It delivers state-of-the-art benchmark results in general reasoning, STEM problem solving, factual QA, and multimodal understanding, including leading scores on LMArena, GPQA Diamond, MathArena Apex, MMMU-Pro, and Video-MMMU. Interactions emphasize depth and interpretability: the model is designed to infer intent with minimal prompting and produce direct, insight-focused responses.\n\nBuilt for advanced development and agentic workflows, Gemini 3 Pro provides robust tool-calling, long-horizon planning stability, and strong zero-shot generation for complex UI, visualization, and coding tasks. It excels at agentic coding (SWE-Bench Verified, Terminal-Bench 2.0), multimodal analysis, and structured long-form tasks such as research synthesis, planning, and interactive learning experiences. Suitable applications include autonomous agents, coding assistants, multimodal analytics, scientific reasoning, and high-context information processing.',
        context_length: 1048576,
        architecture: {
            modality: 'text+image-\u003Etext',
            input_modalities: ['text', 'image', 'file', 'audio', 'video'],
            output_modalities: ['text'],
            tokenizer: 'Gemini',
            instruct_type: null,
        },
        pricing: {
            prompt: '0.000002',
            completion: '0.000012',
            request: '0',
            image: '0.008256',
            web_search: '0',
            internal_reasoning: '0',
            input_cache_read: '0.0000002',
            input_cache_write: '0.000002375',
        },
        top_provider: {
            context_length: 1048576,
            max_completion_tokens: 65536,
            is_moderated: false,
        },
        per_request_limits: null,
        supported_parameters: [
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
        default_parameters: {
            temperature: null,
            top_p: null,
            frequency_penalty: null,
        },
    },
    {
        id: 'z-ai/glm-4.6',
        canonical_slug: 'z-ai/glm-4.6',
        hugging_face_id: '',
        name: 'Z.AI: GLM 4.6',
        created: 1759235576,
        description:
            'Compared with GLM-4.5, this generation brings several key improvements:\n\nLonger context window: The context window has been expanded from 128K to 200K tokens, enabling the model to handle more complex agentic tasks.\nSuperior coding performance: The model achieves higher scores on code benchmarks and demonstrates better real-world performance in applications such as Claude Code、Cline、Roo Code and Kilo Code, including improvements in generating visually polished front-end pages.\nAdvanced reasoning: GLM-4.6 shows a clear improvement in reasoning performance and supports tool use during inference, leading to stronger overall capability.\nMore capable agents: GLM-4.6 exhibits stronger performance in tool using and search-based agents, and integrates more effectively within agent frameworks.\nRefined writing: Better aligns with human preferences in style and readability, and performs more naturally in role-playing scenarios.',
        context_length: 202752,
        architecture: {
            modality: 'text-\u003Etext',
            input_modalities: ['text'],
            output_modalities: ['text'],
            tokenizer: 'Other',
            instruct_type: null,
        },
        pricing: {
            prompt: '0.0000004',
            completion: '0.00000175',
            request: '0',
            image: '0',
            web_search: '0',
            internal_reasoning: '0',
        },
        top_provider: {
            context_length: 202752,
            max_completion_tokens: 202752,
            is_moderated: false,
        },
        per_request_limits: null,
        supported_parameters: [
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
        default_parameters: {
            temperature: 0.6,
            top_p: null,
            frequency_penalty: null,
        },
    },
    {
        id: 'moonshotai/kimi-k2-thinking',
        canonical_slug: 'moonshotai/kimi-k2-thinking-20251106',
        hugging_face_id: 'moonshotai/Kimi-K2-Thinking',
        name: 'MoonshotAI: Kimi K2 Thinking',
        created: 1762440622,
        description:
            'Kimi K2 Thinking is Moonshot AI’s most advanced open reasoning model to date, extending the K2 series into agentic, long-horizon reasoning. Built on the trillion-parameter Mixture-of-Experts (MoE) architecture introduced in Kimi K2, it activates 32 billion parameters per forward pass and supports 256 k-token context windows. The model is optimized for persistent step-by-step thought, dynamic tool invocation, and complex reasoning workflows that span hundreds of turns. It interleaves step-by-step reasoning with tool use, enabling autonomous research, coding, and writing that can persist for hundreds of sequential actions without drift.\n\nIt sets new open-source benchmarks on HLE, BrowseComp, SWE-Multilingual, and LiveCodeBench, while maintaining stable multi-agent behavior through 200–300 tool calls. Built on a large-scale MoE architecture with MuonClip optimization, it combines strong reasoning depth with high inference efficiency for demanding agentic and analytical tasks.',
        context_length: 262144,
        architecture: {
            modality: 'text-\u003Etext',
            input_modalities: ['text'],
            output_modalities: ['text'],
            tokenizer: 'Other',
            instruct_type: null,
        },
        pricing: {
            prompt: '0.00000045',
            completion: '0.00000235',
            request: '0',
            image: '0',
            web_search: '0',
            internal_reasoning: '0',
        },
        top_provider: {
            context_length: 262144,
            max_completion_tokens: 16384,
            is_moderated: false,
        },
        per_request_limits: null,
        supported_parameters: [
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
        default_parameters: {
            temperature: null,
            top_p: null,
            frequency_penalty: null,
        },
    },
    {
        id: 'moonshotai/kimi-k2-0905:nitro',
        canonical_slug: 'moonshotai/kimi-k2-0905',
        hugging_face_id: 'moonshotai/Kimi-K2-Instruct-0905',
        name: 'MoonshotAI: Kimi K2 0905',
        created: 1757021147,
        description:
            'Kimi K2 0905 is the September update of [Kimi K2 0711](moonshotai/kimi-k2). It is a large-scale Mixture-of-Experts (MoE) language model developed by Moonshot AI, featuring 1 trillion total parameters with 32 billion active per forward pass. It supports long-context inference up to 256k tokens, extended from the previous 128k.\n\nThis update improves agentic coding with higher accuracy and better generalization across scaffolds, and enhances frontend coding with more aesthetic and functional outputs for web, 3D, and related tasks. Kimi K2 is optimized for agentic capabilities, including advanced tool use, reasoning, and code synthesis. It excels across coding (LiveCodeBench, SWE-bench), reasoning (ZebraLogic, GPQA), and tool-use (Tau2, AceBench) benchmarks. The model is trained with a novel stack incorporating the MuonClip optimizer for stable large-scale MoE training.',
        context_length: 262144,
        architecture: {
            modality: 'text-\u003Etext',
            input_modalities: ['text'],
            output_modalities: ['text'],
            tokenizer: 'Other',
            instruct_type: null,
        },
        pricing: {
            prompt: '0.00000039',
            completion: '0.0000019',
            request: '0',
            image: '0',
            web_search: '0',
            internal_reasoning: '0',
        },
        top_provider: {
            context_length: 262144,
            max_completion_tokens: 262144,
            is_moderated: false,
        },
        per_request_limits: null,
        supported_parameters: [
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
        default_parameters: {},
    },
];

/**
 * Register the default models in the global registry.
 * Call this to populate the registry with common models.
 */
export function registerDefaultModels(): void {
    modelRegistry.registerMany(DEFAULT_MODELS);
}
