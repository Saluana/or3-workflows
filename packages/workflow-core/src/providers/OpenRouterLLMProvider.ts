import type { OpenRouter } from '@openrouter/sdk';
import type {
    LLMProvider,
    ChatMessage,
    ModelCapabilities,
    ToolDefinition,
    ToolCallResult,
} from '../types';
import { modelRegistry } from '../models';

type ChatOptions = {
    temperature?: number;
    maxTokens?: number;
    tools?: ToolDefinition[];
    parallelToolCalls?: boolean;
    toolChoice?:
        | 'auto'
        | 'none'
        | 'required'
        | { type: 'function'; function: { name: string } };
    responseFormat?:
        | { type: 'json_object' | 'text' }
        | {
              type: 'json_schema';
              json_schema: {
                  name: string;
                  description?: string;
                  schema: Record<string, unknown>;
                  strict?: boolean;
              };
          };
    onToken?: (token: string) => void;
    onReasoning?: (token: string) => void;
    signal?: AbortSignal;
};

/** Streaming response chunk from OpenRouter */
interface StreamChunk {
    choices: Array<{
        delta?: {
            content?: string;
            reasoning?: string;
            tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }>;
            toolCalls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }>;
        };
        finish_reason?: string | null;
        finishReason?: string | null;
        message?: { content?: string | unknown[] };
    }>;
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    };
}

type FinishReason =
    | 'stop'
    | 'length'
    | 'tool_calls'
    | 'content_filter'
    | 'error'
    | 'unknown';

type ChatResult = {
    content: string | null;
    toolCalls?: ToolCallResult[];
    usage?: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    finishReason?: FinishReason;
};

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

function extractUsage(chunkUsage: StreamChunk['usage']): ChatResult['usage'] {
    if (!chunkUsage) return undefined;
    return {
        promptTokens: chunkUsage.prompt_tokens ?? chunkUsage.promptTokens ?? 0,
        completionTokens:
            chunkUsage.completion_tokens ?? chunkUsage.completionTokens ?? 0,
        totalTokens: chunkUsage.total_tokens ?? chunkUsage.totalTokens ?? 0,
    };
}

/**
 * @deprecated Prefer {@link OpenRouterModelGateway} (via
 * `createOpenRouterModelGateway`). This legacy provider is retained for the
 * deprecation window. It uses only the SDK's public v1 request and
 * `RequestOptions` surfaces; new code should construct a gateway directly.
 */
export class OpenRouterLLMProvider implements LLMProvider {
    private modelCapabilitiesCache: Map<string, ModelCapabilities | null> =
        new Map();
    private debug: boolean;

    constructor(private client: OpenRouter, options?: { debug?: boolean }) {
        this.debug = options?.debug ?? false;
    }

    async chat(
        model: string,
        messages: ChatMessage[],
        options?: ChatOptions
    ): Promise<ChatResult> {
        const stream = (await this.client.chat.send(
            {
                chatRequest: {
                    models: [model],
                    messages: messages as any,
                    stream: true,
                    streamOptions: { includeUsage: true },
                    temperature: options?.temperature,
                    maxTokens: options?.maxTokens,
                    tools: options?.tools,
                    toolChoice: options?.toolChoice,
                    parallelToolCalls: options?.parallelToolCalls,
                    responseFormat: options?.responseFormat
                        ? this.toSdkResponseFormat(options.responseFormat)
                        : undefined,
                },
            } as any,
            options?.signal ? { signal: options.signal } : undefined
        )) as unknown as AsyncIterable<StreamChunk>;

        let content = '';
        let finishReason: string | null | undefined;
        let usage:
            | {
                  promptTokens: number;
                  completionTokens: number;
                  totalTokens: number;
              }
            | undefined;
        const toolCallsMap = new Map<number, ToolCallResult>();

        for await (const chunk of stream) {
            if (this.debug) {
                console.log('[OpenRouter] Chunk:', JSON.stringify(chunk));
            }

            if (options?.signal?.aborted) {
                throw new Error('Request cancelled');
            }

            const choice = chunk.choices[0];
            const delta = choice?.delta;
            if (choice?.finish_reason || choice?.finishReason) {
                finishReason = choice.finish_reason ?? choice.finishReason;
            }

            if (chunk.usage) {
                usage = extractUsage(chunk.usage);
            }

            // Handle reasoning/thinking tokens (from models like o1, Claude with extended thinking, etc.)
            if (delta?.reasoning) {
                if (options?.onReasoning) {
                    options.onReasoning(delta.reasoning);
                }
            }

            if (delta?.content) {
                content += delta.content;
                if (options?.onToken) {
                    options.onToken(delta.content);
                }
            }

            const toolCalls = delta?.tool_calls || delta?.toolCalls;

            if (toolCalls) {
                for (const toolCall of toolCalls) {
                    const index = toolCall.index;
                    if (!toolCallsMap.has(index)) {
                        toolCallsMap.set(index, {
                            id: toolCall.id || '',
                            type: 'function' as const,
                            function: {
                                name: toolCall.function?.name || '',
                                arguments: toolCall.function?.arguments || '',
                            },
                        });
                    } else {
                        const current = toolCallsMap.get(index)!;
                        if (toolCall.id) current.id = toolCall.id;
                        // Tool names should replace, not concatenate - they're sent once
                        if (toolCall.function?.name)
                            current.function.name = toolCall.function.name;
                        // Arguments are streamed in chunks and should be concatenated
                        if (toolCall.function?.arguments)
                            current.function.arguments +=
                                toolCall.function.arguments;
                    }
                }
            }
        }

        const toolCalls = Array.from(toolCallsMap.values());

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage,
            finishReason: normalizeFinishReason(finishReason),
        };
    }

    private toSdkResponseFormat(
        format: NonNullable<ChatOptions['responseFormat']>
    ): Record<string, unknown> {
        if (format.type === 'json_schema') {
            return {
                type: 'json_schema',
                jsonSchema: {
                    name: format.json_schema.name,
                    description: format.json_schema.description,
                    schema: format.json_schema.schema,
                    strict: format.json_schema.strict ?? true,
                },
            };
        }
        return { type: format.type };
    }

    async getModelCapabilities(
        modelId: string
    ): Promise<ModelCapabilities | null> {
        // Check cache first
        if (this.modelCapabilitiesCache.has(modelId)) {
            return this.modelCapabilitiesCache.get(modelId) || null;
        }

        const registered = modelRegistry.get(modelId);
        if (registered) {
            const inputModalities = Array.isArray(
                registered.architecture?.inputModalities
            )
                ? registered.architecture?.inputModalities
                : (['text'] as const);
            const outputModalities = Array.isArray(
                registered.architecture?.outputModalities
            )
                ? registered.architecture?.outputModalities
                : (['text'] as const);
            const supportedParameters = Array.isArray(
                registered.supportedParameters
            )
                ? registered.supportedParameters
                : ['temperature', 'max_tokens', 'top_p'];

            const capabilities: ModelCapabilities = {
                id: modelId,
                name: registered.name || modelId.split('/').pop() || modelId,
                inputModalities:
                    inputModalities as ModelCapabilities['inputModalities'],
                outputModalities:
                    outputModalities as ModelCapabilities['outputModalities'],
                contextLength: registered.contextLength || 4096,
                supportedParameters,
            };
            this.modelCapabilitiesCache.set(modelId, capabilities);
            return capabilities;
        }

        // Infer capabilities from model naming conventions
        const capabilities = this.inferModelCapabilities(modelId);
        this.modelCapabilitiesCache.set(modelId, capabilities);
        return capabilities;
    }

    /**
     * Infer model capabilities from model ID patterns.
     */
    private inferModelCapabilities(modelId: string): ModelCapabilities {
        const lowerModelId = modelId.toLowerCase();

        // Default capabilities
        const capabilities: ModelCapabilities = {
            id: modelId,
            name: modelId.split('/').pop() || modelId,
            inputModalities: ['text'],
            outputModalities: ['text'],
            contextLength: 4096,
            supportedParameters: ['temperature', 'max_tokens', 'top_p'],
        };

        // Vision models (GPT-4V, Claude 3, Gemini with vision)
        const visionPatterns = [
            'gpt-4o',
            'gpt-4-vision',
            'gpt-4-turbo',
            'claude-3',
            'claude-3.5',
            'gemini-pro-vision',
            'gemini-1.5',
            'gemini-2',
            'gemini-3',
            'llava',
            'vision',
        ];
        if (visionPatterns.some((p) => lowerModelId.includes(p))) {
            capabilities.inputModalities = ['text', 'image'];
        }

        // Audio models
        const audioPatterns = ['whisper', 'audio', 'gpt-4o-audio'];
        if (audioPatterns.some((p) => lowerModelId.includes(p))) {
            capabilities.inputModalities = [
                ...capabilities.inputModalities,
                'audio',
            ];
        }

        // Large context models
        const largeContextPatterns: Array<{
            pattern: string;
            context: number;
        }> = [
            { pattern: 'claude-3', context: 200000 },
            { pattern: 'claude-2.1', context: 200000 },
            { pattern: 'gpt-4-turbo', context: 128000 },
            { pattern: 'gpt-4o', context: 128000 },
            { pattern: 'gemini-1.5-pro', context: 1000000 },
            { pattern: 'gemini-1.5-flash', context: 1000000 },
            { pattern: 'gemini-2', context: 1000000 },
            { pattern: 'mistral-large', context: 128000 },
            { pattern: 'command-r', context: 128000 },
        ];

        for (const { pattern, context } of largeContextPatterns) {
            if (lowerModelId.includes(pattern)) {
                capabilities.contextLength = context;
                break;
            }
        }

        // Image generation models
        const imageGenPatterns = [
            'dall-e',
            'stable-diffusion',
            'midjourney',
            'imagen',
        ];
        if (imageGenPatterns.some((p) => lowerModelId.includes(p))) {
            capabilities.outputModalities = ['image'];
        }

        // Embedding models
        const embeddingPatterns = ['embed', 'embedding', 'text-embedding'];
        if (embeddingPatterns.some((p) => lowerModelId.includes(p))) {
            capabilities.outputModalities = ['embeddings'];
        }

        return capabilities;
    }
}
