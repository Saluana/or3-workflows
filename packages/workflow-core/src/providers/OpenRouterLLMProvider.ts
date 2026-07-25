import type { OpenRouter } from '@openrouter/sdk';
import type {
    LLMProvider,
    ChatMessage,
    ModelCapabilities,
    ChatMessageContentPart,
    ToolDefinition,
    ToolCallResult,
} from '../types';
import { modelRegistry } from '../models';

type ChatOptions = {
    temperature?: number;
    maxTokens?: number;
    tools?: ToolDefinition[];
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

type OpenRouterContentPart =
    | { type: 'text'; text: string }
    | {
          type: 'image_url';
          image_url: { url: string; detail?: 'auto' | 'low' | 'high' };
      }
    | { type: 'file'; file: { filename?: string; file_data: string } };

type OpenRouterMessage = {
    role: string;
    content: string | OpenRouterContentPart[];
};

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
 * deprecation window and remains the fallback when an adapter is constructed
 * with a raw OpenRouter client. Unlike the gateway it may use raw fetch for
 * file-part payloads; new code should construct a gateway with explicit options.
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
        // The SDK schema does not accept file content parts yet, so use raw fetch when needed.
        if (this.hasFileParts(messages)) {
            return this.chatWithFilesViaFetch(model, messages, options);
        }

        // Prefer abortable fetch when a signal is provided — SDK stream path
        // cannot cancel the underlying HTTP request mid-flight.
        // Fall back to SDK when we can't resolve an API key (e.g. mocked clients).
        if (options?.signal) {
            const apiKey = await this.resolveApiKey();
            if (apiKey) {
                return this.chatViaFetch(model, messages, options);
            }
        }

        const stream = (await this.client.chat.send({
            model,
            messages: messages as any, // OpenRouter SDK types might differ slightly
            stream: true,
            // Request usage on the final stream chunk when supported
            stream_options: { include_usage: true },
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
            tools: options?.tools,
            toolChoice: options?.toolChoice,
            responseFormat: options?.responseFormat,
        } as any)) as unknown as AsyncIterable<StreamChunk>;

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

    /**
     * Abortable streaming chat via raw fetch (used when AbortSignal is set).
     */
    private async chatViaFetch(
        model: string,
        messages: ChatMessage[],
        options?: ChatOptions
    ): Promise<ChatResult> {
        return this.chatWithFilesViaFetch(model, messages, options);
    }

    private hasFileParts(messages: ChatMessage[]): boolean {
        return messages.some((message) => {
            const content = message.content;
            if (!Array.isArray(content)) return false;
            return content.some(
                (part) => (part as { type?: string }).type === 'file'
            );
        });
    }

    private normalizeMessages(messages: ChatMessage[]): OpenRouterMessage[] {
        return messages.map((message) => {
            if (!Array.isArray(message.content)) {
                return { role: message.role, content: message.content };
            }

            const parts = message.content
                .map((part) => this.normalizeContentPart(part))
                .filter(Boolean) as OpenRouterContentPart[];

            return {
                role: message.role,
                content: parts.length ? parts : '',
            };
        });
    }

    private normalizeContentPart(
        part: ChatMessageContentPart
    ): OpenRouterContentPart | null {
        if (part.type === 'text') {
            return typeof part.text === 'string'
                ? { type: 'text', text: part.text }
                : null;
        }
        if (part.type === 'image_url') {
            const url = part.imageUrl?.url;
            if (!url) return null;
            const imageUrl: { url: string; detail?: 'auto' | 'low' | 'high' } =
                { url };
            if (part.imageUrl.detail) {
                imageUrl.detail = part.imageUrl.detail;
            }
            return { type: 'image_url', image_url: imageUrl };
        }
        if (part.type === 'file') {
            const fileData = part.file?.fileData;
            if (!fileData) return null;
            const file: { filename?: string; file_data: string } = {
                file_data: fileData,
            };
            if (part.file?.filename) {
                file.filename = part.file.filename;
            }
            return { type: 'file', file };
        }
        return null;
    }

    private async resolveApiKey(): Promise<string | null> {
        const raw = (this.client as { _options?: { apiKey?: unknown } })
            ?._options?.apiKey;
        if (!raw) return null;
        if (typeof raw === 'string') return raw;
        if (typeof raw === 'function') {
            try {
                const resolved = await raw();
                return typeof resolved === 'string' ? resolved : null;
            } catch {
                return null;
            }
        }
        return null;
    }

    private getBaseUrl(): string {
        const base = (this.client as { _baseURL?: URL })._baseURL;
        if (base) {
            const baseString = base.toString();
            return baseString.endsWith('/') ? baseString : `${baseString}/`;
        }
        return 'https://openrouter.ai/api/v1/';
    }

    private async chatWithFilesViaFetch(
        model: string,
        messages: ChatMessage[],
        options?: ChatOptions
    ): Promise<ChatResult> {
        const apiKey = await this.resolveApiKey();
        if (!apiKey) {
            throw new Error('OpenRouter API key is missing');
        }

        const baseUrl = this.getBaseUrl();
        const url = new URL('chat/completions', baseUrl).toString();

        const body: Record<string, unknown> = {
            model,
            messages: this.normalizeMessages(messages),
            stream: true,
            stream_options: { include_usage: true },
        };

        if (typeof options?.temperature === 'number') {
            body.temperature = options.temperature;
        }
        if (typeof options?.maxTokens === 'number') {
            body.max_tokens = options.maxTokens;
        }
        if (options?.tools) {
            body.tools = options.tools;
        }
        if (options?.toolChoice) {
            body.tool_choice = options.toolChoice;
        }
        if (options?.responseFormat) {
            body.response_format = this.toOpenAIResponseFormat(
                options.responseFormat
            );
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        };

        const clientOptions = (
            this.client as {
                _options?: { httpReferer?: string; xTitle?: string };
            }
        )._options;
        if (clientOptions?.httpReferer) {
            headers['HTTP-Referer'] = clientOptions.httpReferer;
        }
        if (clientOptions?.xTitle) {
            headers['X-Title'] = clientOptions.xTitle;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            signal: options?.signal,
        });

        if (!response.ok || !response.body) {
            let responseText = '<no-body>';
            try {
                responseText = await response.text();
            } catch {
                // ignore read errors
            }
            throw new Error(
                `OpenRouter request failed ${response.status} ${
                    response.statusText
                }: ${responseText.slice(0, 300)}`
            );
        }

        let content = '';
        let finishReason: string | null | undefined;
        let usage: ChatResult['usage'];
        const toolCallsMap = new Map<number, ToolCallResult>();
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const pushText = (text: string) => {
            content += text;
            if (options?.onToken) options.onToken(text);
        };

        const pushReasoning = (text: string) => {
            if (options?.onReasoning) options.onReasoning(text);
        };

        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;

                if (options?.signal?.aborted) {
                    await reader.cancel().catch(() => undefined);
                    throw new Error('Request cancelled');
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const raw of lines) {
                    const line = raw.trim();
                    if (!line.startsWith('data:')) continue;
                    const data = line.replace(/^data:\s*/, '');
                    if (!data) continue;
                    if (data === '[DONE]') {
                        continue;
                    }

                    let parsed: StreamChunk | null = null;
                    try {
                        parsed = JSON.parse(data) as StreamChunk;
                    } catch (error) {
                        if (this.debug) {
                            console.warn(
                                '[OpenRouter] Failed to parse SSE chunk',
                                error
                            );
                        }
                        continue;
                    }

                    if (parsed.usage) {
                        usage = extractUsage(parsed.usage);
                    }

                    const choices = parsed.choices || [];
                    for (const choice of choices) {
                        if (choice.finish_reason || choice.finishReason) {
                            finishReason =
                                choice.finish_reason ?? choice.finishReason;
                        }

                        const delta = choice.delta || {};

                        const reasoningDetails = (
                            delta as {
                                reasoning_details?: Array<{
                                    type?: string;
                                    text?: string;
                                    summary?: string;
                                }>;
                            }
                        ).reasoning_details;
                        const firstReasoning = reasoningDetails?.[0];
                        if (firstReasoning?.type === 'reasoning.text') {
                            if (firstReasoning.text)
                                pushReasoning(firstReasoning.text);
                        } else if (
                            firstReasoning?.type === 'reasoning.summary'
                        ) {
                            if (firstReasoning.summary)
                                pushReasoning(firstReasoning.summary);
                        } else if (
                            typeof (delta as { reasoning?: unknown })
                                .reasoning === 'string'
                        ) {
                            pushReasoning(
                                (delta as { reasoning: string }).reasoning
                            );
                        }

                        const deltaContent = delta.content;
                        if (typeof deltaContent === 'string' && deltaContent) {
                            pushText(deltaContent);
                        } else if (Array.isArray(deltaContent)) {
                            for (const part of deltaContent) {
                                const text = (
                                    part as { type?: string; text?: string }
                                ).text;
                                if (
                                    (part as { type?: string }).type ===
                                        'text' &&
                                    typeof text === 'string'
                                ) {
                                    pushText(text);
                                }
                            }
                        }

                        if (
                            typeof (delta as { text?: unknown }).text ===
                            'string'
                        ) {
                            pushText((delta as { text: string }).text);
                        }

                        const toolCalls =
                            (delta as { tool_calls?: unknown }).tool_calls ||
                            (delta as { toolCalls?: unknown }).toolCalls;

                        if (Array.isArray(toolCalls)) {
                            for (const toolCall of toolCalls) {
                                const index = toolCall.index;
                                if (!toolCallsMap.has(index)) {
                                    toolCallsMap.set(index, {
                                        id: toolCall.id || '',
                                        type: 'function' as const,
                                        function: {
                                            name:
                                                toolCall.function?.name || '',
                                            arguments:
                                                toolCall.function?.arguments ||
                                                '',
                                        },
                                    });
                                } else {
                                    const current = toolCallsMap.get(index)!;
                                    if (toolCall.id) current.id = toolCall.id;
                                    if (toolCall.function?.name)
                                        current.function.name =
                                            toolCall.function.name;
                                    if (toolCall.function?.arguments)
                                        current.function.arguments +=
                                            toolCall.function.arguments;
                                }
                            }
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        const toolCalls = Array.from(toolCallsMap.values());

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            usage,
            finishReason: normalizeFinishReason(finishReason),
        };
    }

    private toOpenAIResponseFormat(
        format: NonNullable<ChatOptions['responseFormat']>
    ): Record<string, unknown> {
        if (format.type === 'json_schema') {
            return {
                type: 'json_schema',
                json_schema: {
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
