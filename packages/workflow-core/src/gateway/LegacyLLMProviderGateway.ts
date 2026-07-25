/**
 * Adapts a legacy {@link LLMProvider} (positional `chat(model, messages,
 * options)`) into the provider-neutral {@link ModelGateway} contract (R1.AC2,
 * R2.AC1). Existing provider mocks and host implementations run unchanged.
 */
import type {
    LLMProvider,
    ChatMessage,
    ModelCapabilities,
    ToolDefinition,
} from '../types';
import type {
    ModelCallResult,
    ModelGateway,
    ModelRequest,
    ModelToolDescriptor,
    FinishReason,
    ModelUsage,
} from './types';

function toToolDefinitions(
    tools: ModelToolDescriptor[] | undefined,
    warn: (message: string) => void
): ToolDefinition[] | undefined {
    if (!tools || tools.length === 0) return undefined;
    const out: ToolDefinition[] = [];
    for (const tool of tools) {
        if (tool.type === 'function') {
            out.push({ type: 'function', function: tool.function });
        } else {
            // Legacy providers cannot execute provider-managed server tools.
            warn(
                `LegacyLLMProviderGateway: dropping provider-server tool "${tool.name}" (not supported by legacy LLMProvider)`
            );
        }
    }
    return out.length > 0 ? out : undefined;
}

export interface LegacyLLMProviderGatewayOptions {
    /** Receives one-time warnings about unsupported new request options. */
    onWarning?: (message: string) => void;
}

export class LegacyLLMProviderGateway implements ModelGateway {
    private readonly warn: (message: string) => void;

    constructor(
        private readonly provider: LLMProvider,
        options: LegacyLLMProviderGatewayOptions = {}
    ) {
        this.warn = options.onWarning ?? (() => undefined);
    }

    /** The wrapped legacy provider (for interop/testing). */
    get legacyProvider(): LLMProvider {
        return this.provider;
    }

    async generate(request: ModelRequest): Promise<ModelCallResult> {
        const model = request.models[0];

        // Preflight: mark unsupported new options rather than silently ignoring.
        if (request.models.length > 1) {
            this.warn(
                `LegacyLLMProviderGateway: legacy provider only uses the first model ("${model}"); ` +
                    `${request.models.length - 1} fallback model(s) ignored`
            );
        }
        if (request.routing) {
            this.warn(
                'LegacyLLMProviderGateway: provider routing policy is ignored by legacy LLMProvider'
            );
        }
        if (request.plugins && request.plugins.length > 0) {
            this.warn(
                'LegacyLLMProviderGateway: provider plugins are ignored by legacy LLMProvider'
            );
        }

        const startedAt = Date.now();
        let firstTokenAt: number | undefined;

        const responseFormat = request.generation?.responseFormat
            ? ({
                  type: 'json_schema' as const,
                  json_schema: {
                      name: request.generation.responseFormat.name,
                      description:
                          request.generation.responseFormat.description,
                      schema: request.generation.responseFormat.schema,
                      strict: request.generation.responseFormat.strict,
                  },
              })
            : undefined;

        const result = await this.provider.chat(model, request.messages, {
            temperature: request.generation?.temperature,
            maxTokens: request.generation?.maxOutputTokens,
            tools: toToolDefinitions(request.tools, this.warn),
            toolChoice: request.toolChoice,
            responseFormat,
            onToken: request.onTextDelta
                ? (token: string) => {
                      if (firstTokenAt === undefined) firstTokenAt = Date.now();
                      request.onTextDelta?.(token);
                  }
                : undefined,
            onReasoning: request.onReasoningDelta,
            signal: request.signal,
        });

        const completedAt = Date.now();

        const usage: ModelUsage | undefined = result.usage
            ? {
                  inputTokens: result.usage.promptTokens,
                  outputTokens: result.usage.completionTokens,
                  totalTokens: result.usage.totalTokens,
              }
            : undefined;

        const assistantMessage: ChatMessage = {
            role: 'assistant',
            content: result.content ?? '',
            ...(result.toolCalls && result.toolCalls.length > 0
                ? { tool_calls: result.toolCalls }
                : {}),
        };

        const finishReason = result.finishReason as FinishReason | undefined;

        return {
            requestedModels: request.models,
            // Legacy providers do not reliably report the actual model; do not
            // fabricate it (R2.AC3).
            assistantMessage,
            content: result.content ?? null,
            toolCalls: result.toolCalls,
            finishReason,
            usage,
            timing: {
                startedAt,
                completedAt,
                totalMs: completedAt - startedAt,
                firstTokenMs:
                    firstTokenAt !== undefined
                        ? firstTokenAt - startedAt
                        : undefined,
            },
        };
    }

    getModelCapabilities(
        modelId: string
    ): Promise<ModelCapabilities | null> {
        return this.provider.getModelCapabilities(modelId);
    }
}
