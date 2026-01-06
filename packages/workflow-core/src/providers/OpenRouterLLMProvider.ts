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
    responseFormat?: { type: 'json_object' | 'text' };
    onToken?: (token: string) => void;
    onReasoning?: (token: string) => void;
    signal?: AbortSignal;
};

/** Streaming response chunk from OpenRouter */
interface StreamChunk {
    choices: Array<{
        delta?: {
            content?: string;
            reasoning?: string; // Thinking/reasoning tokens from models that support it
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
    ): Promise<{
        content: string | null;
        toolCalls?: ToolCallResult[];
        usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
    }> {
        // The SDK schema does not accept file content parts yet, so use raw fetch when needed.
        if (this.hasFileParts(messages)) {
            return this.chatWithFilesViaFetch(model, messages, options);
        }

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
        const toolCallsMap = new Map<number, ToolCallResult>();

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
            // Usage is usually not available in streaming response until the end or not at all in some APIs
            // OpenRouter might provide it in the last chunk but we are just aggregating content for now.
        };
    }

    private hasFileParts(messages: ChatMessage[]): boolean {
        return messages.some((message) => {
            const content = message.content;
            if (!Array.isArray(content)) return false;
            return content.some((part) => (part as { type?: string }).type === 'file');
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
    ): Promise<{
        content: string | null;
        toolCalls?: ToolCallResult[];
        usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
    }> {
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
            body.response_format = options.responseFormat;
        }

        const headers: Record<string, string> = {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
        };

        const clientOptions = (this.client as {
            _options?: { httpReferer?: string; xTitle?: string };
        })._options;
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
                `OpenRouter request failed ${response.status} ${response.statusText}: ${responseText.slice(
                    0,
                    300
                )}`
            );
        }

        let content = '';
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

        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            if (options?.signal?.aborted) {
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

                const choices = parsed.choices || [];
                for (const choice of choices) {
                    const delta = choice.delta || {};

                    const reasoningDetails = (delta as {
                        reasoning_details?: Array<{
                            type?: string;
                            text?: string;
                            summary?: string;
                        }>;
                    }).reasoning_details;
                    const firstReasoning = reasoningDetails?.[0];
                    if (firstReasoning?.type === 'reasoning.text') {
                        if (firstReasoning.text) pushReasoning(firstReasoning.text);
                    } else if (firstReasoning?.type === 'reasoning.summary') {
                        if (firstReasoning.summary)
                            pushReasoning(firstReasoning.summary);
                    } else if (typeof (delta as { reasoning?: unknown }).reasoning === 'string') {
                        pushReasoning((delta as { reasoning: string }).reasoning);
                    }

                    const deltaContent = delta.content;
                    if (typeof deltaContent === 'string' && deltaContent) {
                        pushText(deltaContent);
                    } else if (Array.isArray(deltaContent)) {
                        for (const part of deltaContent) {
                            const text = (part as { type?: string; text?: string })
                                .text;
                            if (
                                (part as { type?: string }).type === 'text' &&
                                typeof text === 'string'
                            ) {
                                pushText(text);
                            }
                        }
                    }

                    if (typeof (delta as { text?: unknown }).text === 'string') {
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
                                        name: toolCall.function?.name || '',
                                        arguments:
                                            toolCall.function?.arguments || '',
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

        const toolCalls = Array.from(toolCallsMap.values());

        return {
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        };
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
                : ['text'];
            const outputModalities = Array.isArray(
                registered.architecture?.outputModalities
            )
                ? registered.architecture?.outputModalities
                : ['text'];
            const supportedParameters = Array.isArray(
                registered.supportedParameters
            )
                ? registered.supportedParameters
                : ['temperature', 'max_tokens', 'top_p'];

            const capabilities: ModelCapabilities = {
                id: modelId,
                name: registered.name || modelId.split('/').pop() || modelId,
                inputModalities,
                outputModalities,
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
