/**
 * Gateway detection and interop helpers (R1, R2).
 *
 * - {@link isModelGateway} / {@link isLLMProvider}: structural type guards.
 * - {@link resolveToModelGateway}: normalizes an `LLMProvider | ModelGateway`
 *   into a `ModelGateway`, wrapping legacy providers.
 * - {@link gatewayAsLLMProvider}: projects a `ModelGateway` back onto the legacy
 *   positional `LLMProvider.chat` surface so existing extensions keep working
 *   during the deprecation window.
 */
import type {
    LLMProvider,
    ChatMessage,
    ModelCapabilities,
    ToolDefinition,
    ToolCallResult,
} from '../types';
import {
    LegacyLLMProviderGateway,
    type LegacyLLMProviderGatewayOptions,
} from './LegacyLLMProviderGateway';
import type {
    ModelGateway,
    ModelRequest,
    ModelToolDescriptor,
    StructuredOutputRequest,
    GenerationSettings,
} from './types';

export function isModelGateway(obj: unknown): obj is ModelGateway {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        typeof (obj as ModelGateway).generate === 'function' &&
        typeof (obj as ModelGateway).getModelCapabilities === 'function'
    );
}

export function isLLMProvider(obj: unknown): obj is LLMProvider {
    return (
        obj !== null &&
        typeof obj === 'object' &&
        !isModelGateway(obj) &&
        typeof (obj as LLMProvider).chat === 'function' &&
        typeof (obj as LLMProvider).getModelCapabilities === 'function'
    );
}

/**
 * Normalize an `LLMProvider | ModelGateway` into a `ModelGateway`. Legacy
 * providers are wrapped in {@link LegacyLLMProviderGateway}.
 */
export function resolveToModelGateway(
    input: LLMProvider | ModelGateway,
    options: LegacyLLMProviderGatewayOptions = {}
): ModelGateway {
    if (isModelGateway(input)) return input;
    return new LegacyLLMProviderGateway(input, options);
}

type LegacyChatOptions = Parameters<LLMProvider['chat']>[2];
type LegacyChatResult = Awaited<ReturnType<LLMProvider['chat']>>;

function optionsToGeneration(
    options: LegacyChatOptions
): GenerationSettings | undefined {
    if (!options) return undefined;
    let responseFormat: StructuredOutputRequest | undefined;
    if (options.responseFormat && options.responseFormat.type === 'json_schema') {
        responseFormat = {
            name: options.responseFormat.json_schema.name,
            description: options.responseFormat.json_schema.description,
            schema: options.responseFormat.json_schema.schema,
            strict: options.responseFormat.json_schema.strict,
        };
    }
    const generation: GenerationSettings = {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens,
        responseFormat,
    };
    return generation;
}

function toolsToDescriptors(
    tools: ToolDefinition[] | undefined
): ModelToolDescriptor[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    return tools.map((t) => ({ type: 'function', function: t.function }));
}

/**
 * Project a `ModelGateway` onto the legacy `LLMProvider` surface. Used to pass
 * a gateway to extensions that still expect an `LLMProvider` during migration.
 */
export function gatewayAsLLMProvider(gateway: ModelGateway): LLMProvider {
    return {
        async chat(
            model: string,
            messages: ChatMessage[],
            options?: LegacyChatOptions
        ): Promise<LegacyChatResult> {
            const request: ModelRequest = {
                models: [model],
                messages,
                generation: optionsToGeneration(options),
                tools: toolsToDescriptors(options?.tools),
                toolChoice: options?.toolChoice,
                onTextDelta: options?.onToken,
                onReasoningDelta: options?.onReasoning,
                signal: options?.signal,
            };
            const result = await gateway.generate(request);
            const toolCalls: ToolCallResult[] | undefined = result.toolCalls;
            return {
                content: result.content,
                toolCalls,
                usage: result.usage
                    ? {
                          promptTokens: result.usage.inputTokens ?? 0,
                          completionTokens: result.usage.outputTokens ?? 0,
                          totalTokens:
                              result.usage.totalTokens ??
                              (result.usage.inputTokens ?? 0) +
                                  (result.usage.outputTokens ?? 0),
                      }
                    : undefined,
                finishReason: result.finishReason,
            };
        },
        getModelCapabilities(
            modelId: string
        ): Promise<ModelCapabilities | null> {
            return gateway.getModelCapabilities(modelId);
        },
    };
}
