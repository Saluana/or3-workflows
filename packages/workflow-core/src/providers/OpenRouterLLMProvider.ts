import type { OpenRouter } from '@openrouter/sdk';
import type { LLMProvider, ChatMessage, ModelCapabilities } from '../types';

/** Streaming response chunk from OpenRouter */
interface StreamChunk {
    choices: Array<{
        delta?: {
            content?: string;
            tool_calls?: Array<{
                index: number;
                id?: string;
                type?: string;
                function?: {
                    name?: string;
                    arguments?: string;
                };
            }>;
            // Some providers/SDKs might return camelCase
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
        message?: { content?: string | unknown[] };
    }>;
}

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
        options?: {
            temperature?: number;
            maxTokens?: number;
            tools?: any[];
            toolChoice?: any;
            responseFormat?: { type: 'json_object' | 'text' };
            onToken?: (token: string) => void;
            signal?: AbortSignal;
        }
    ): Promise<{
        content: string | null;
        toolCalls?: any[];
        usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
    }> {
        const stream = (await this.client.chat.send({
            model,
            messages: messages as any, // OpenRouter SDK types might differ slightly
            stream: true,
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
            tools: options?.tools,
            toolChoice: options?.toolChoice,
            responseFormat: options?.responseFormat,
        })) as AsyncIterable<StreamChunk>;

        let content = '';
        const toolCallsMap = new Map<number, any>();

        // We need to handle cancellation if signal is provided.
        // However, the OpenRouter SDK doesn't seem to accept a signal in `send`.
        // But we can check signal in the loop.

        for await (const chunk of stream) {
            if (this.debug) {
                console.log('[OpenRouter] Chunk:', JSON.stringify(chunk));
            }

            if (options?.signal?.aborted) {
                throw new Error('Request cancelled');
            }

            const delta = chunk.choices[0]?.delta;

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
                            type: toolCall.type || 'function',
                            function: {
                                name: toolCall.function?.name || '',
                                arguments: toolCall.function?.arguments || '',
                            },
                        });
                    } else {
                        const current = toolCallsMap.get(index);
                        if (toolCall.id) current.id = toolCall.id;
                        if (toolCall.type) current.type = toolCall.type;
                        if (toolCall.function?.name)
                            current.function.name += toolCall.function.name;
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
            // Usage is usually not available in streaming response until the end or not at all in some APIs
            // OpenRouter might provide it in the last chunk but we are just aggregating content for now.
        };
    }

    async getModelCapabilities(
        modelId: string
    ): Promise<ModelCapabilities | null> {
        // Check cache first
        if (this.modelCapabilitiesCache.has(modelId)) {
            return this.modelCapabilitiesCache.get(modelId) || null;
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
