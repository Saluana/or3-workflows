/**
 * Optional `@openrouter/agent` Responses backend.
 *
 * The dependency is loaded only from the opt-in `openrouter-agent` export.
 * Hosts explicitly provide the agent SDK client; OR3 never reads API keys or
 * private fields from another provider adapter.
 */
import * as z from 'zod';
import type {
    AgentLoopBackend,
    AgentLoopInput,
    AgentLoopResult,
} from './types';
import type { ChatMessage } from '../types';
import type { ModelUsage, ModelToolDescriptor } from '../gateway';
import { mapRoutingPolicy } from '../providers/openrouter/routing';
import { aggregateUsage } from './usage';

/** Thrown when an optional backend package is not installed. */
export class OptionalBackendUnavailableError extends Error {
    readonly packageName: string;
    constructor(packageName: string, cause?: unknown) {
        super(
            `Optional backend package "${packageName}" is not installed. ` +
                `Install it (e.g. \`bun add ${packageName}\`) to use this backend, ` +
                `or select the default native backend.`
        );
        this.name = 'OptionalBackendUnavailableError';
        this.packageName = packageName;
        if (cause !== undefined) {
            (this as { cause?: unknown }).cause = cause;
        }
    }
}

export class OpenRouterAgentClientRequiredError extends Error {
    constructor() {
        super(
            'The openrouter-agent backend requires an @openrouter/agent OpenRouter client. ' +
                'Pass it to createOpenRouterAgentBackend({ client }).'
        );
        this.name = 'OpenRouterAgentClientRequiredError';
    }
}

const PACKAGE_NAME = '@openrouter/agent';

interface AgentModule {
    callModel(
        client: unknown,
        request: Record<string, unknown>,
        options?: { signal?: AbortSignal }
    ): {
        getTextStream(): AsyncIterable<string>;
        getReasoningStream(): AsyncIterable<string>;
        getFullResponsesStream?(): AsyncIterable<Record<string, any>>;
        getResponse(): Promise<Record<string, any>>;
        cancel(): Promise<void>;
    };
    fromChatMessages(messages: unknown[]): unknown;
    toChatMessage(response: unknown): unknown;
    tool(config: Record<string, unknown>): unknown;
    serverTool(config: Record<string, unknown>): unknown;
    stepCountIs(count: number): unknown;
}

export interface OpenRouterAgentBackendOptions {
    /** Client constructed from the optional `@openrouter/agent` package. */
    client: unknown;
    /** Optional durable StateAccessor owned by the host. */
    state?: unknown;
    /** Test/advanced injection point; normal hosts omit it. */
    loadModule?: () => Promise<unknown>;
}

/** Attempt to load the optional module without pulling it into default bundles. */
export async function preflightOpenRouterAgent(): Promise<unknown> {
    const specifier = PACKAGE_NAME as string;
    try {
        return (await import(/* @vite-ignore */ specifier)) as unknown;
    } catch (error) {
        throw new OptionalBackendUnavailableError(PACKAGE_NAME, error);
    }
}

function schemaToZod(schema: unknown): z.ZodType {
    if (schema === true || schema == null) return z.unknown();
    if (schema === false) return z.never();
    if (typeof schema !== 'object') return z.unknown();
    const value = schema as Record<string, any>;

    if ('const' in value) {
        return z.literal(value.const as z.util.Literal);
    }
    if (Array.isArray(value.enum) && value.enum.length > 0) {
        const literals = value.enum.map((item) =>
            z.literal(item as z.util.Literal)
        );
        return literals.length === 1
            ? literals[0]!
            : z.union(
                  literals as [
                      z.ZodLiteral,
                      z.ZodLiteral,
                      ...z.ZodLiteral[],
                  ]
              );
    }
    const alternatives = value.anyOf ?? value.oneOf;
    if (Array.isArray(alternatives) && alternatives.length > 0) {
        const schemas = alternatives.map(schemaToZod);
        return schemas.length === 1
            ? schemas[0]!
            : z.union(
                  schemas as [z.ZodType, z.ZodType, ...z.ZodType[]]
              );
    }

    if (Array.isArray(value.type)) {
        const variants = value.type.map((type: string) =>
            schemaToZod({ ...value, type })
        );
        return variants.length === 1
            ? variants[0]!
            : z.union(
                  variants as [z.ZodType, z.ZodType, ...z.ZodType[]]
              );
    }

    switch (value.type) {
        case 'string':
            return z.string();
        case 'integer':
            return z.number().int();
        case 'number':
            return z.number();
        case 'boolean':
            return z.boolean();
        case 'null':
            return z.null();
        case 'array':
            return z.array(schemaToZod(value.items));
        case 'object':
        default: {
            const properties = value.properties ?? {};
            const required = new Set<string>(value.required ?? []);
            const shape: Record<string, z.ZodType> = {};
            for (const [key, property] of Object.entries(properties)) {
                const field = schemaToZod(property);
                shape[key] = required.has(key)
                    ? field
                    : field.optional();
            }
            const object = z.object(shape);
            return value.additionalProperties === true
                ? object.catchall(z.unknown())
                : object;
        }
    }
}

function stableFingerprint(value: unknown): string {
    const stringify = (item: unknown): string => {
        if (item === null || typeof item !== 'object') {
            return JSON.stringify(item) ?? String(item);
        }
        if (Array.isArray(item)) {
            return `[${item.map(stringify).join(',')}]`;
        }
        return `{${Object.entries(item as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(
                ([key, nested]) =>
                    `${JSON.stringify(key)}:${stringify(nested)}`
            )
            .join(',')}}`;
    };
    const source = stringify(value);
    let hash = 0x811c9dc5;
    for (let index = 0; index < source.length; index++) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
}

function mapUsage(usage: Record<string, any> | undefined): ModelUsage {
    if (!usage) return {};
    return {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.outputTokensDetails?.reasoningTokens,
        cachedTokens: usage.inputTokensDetails?.cachedTokens,
        cacheWriteTokens: usage.inputTokensDetails?.cacheWriteTokens,
        totalTokens: usage.totalTokens,
        costUsd: usage.cost ?? undefined,
    };
}

function mapTool(
    descriptor: ModelToolDescriptor,
    module: AgentModule,
    input: AgentLoopInput,
    nextCallId: () => number
): unknown {
    if (descriptor.type === 'provider-server') {
        return module.serverTool({
            type: descriptor.name,
            ...(descriptor.config ?? {}),
        });
    }
    const definition = descriptor.function;
    return module.tool({
        name: definition.name,
        description: definition.description,
        inputSchema: schemaToZod(
            definition.parameters ?? {
                type: 'object',
                additionalProperties: true,
            }
        ),
        execute: async (params: unknown) => {
            if (!input.executeTool) {
                throw new Error(
                    `No OR3 executor is configured for tool "${definition.name}"`
                );
            }
            const sequence = nextCallId();
            return input.executeTool({
                callId:
                    `openrouter-agent:${sequence}:${definition.name}:` +
                    stableFingerprint(params),
                toolName: definition.name,
                argumentsJson: JSON.stringify(params),
            });
        },
    });
}

/**
 * Functional parity adapter for `callModel`: typed tools execute through OR3,
 * tool loops are bounded, cancellation is propagated, and usage is aggregated
 * across turns. Agent SDK conversation state may be supplied by the host.
 */
export class OpenRouterAgentLoopBackend implements AgentLoopBackend {
    readonly id = 'openrouter-agent' as const;
    private loadedModule?: AgentModule;

    constructor(private readonly options: OpenRouterAgentBackendOptions) {}

    async preflight(): Promise<void> {
        if (this.loadedModule) return;
        const loaded = await (
            this.options.loadModule ?? preflightOpenRouterAgent
        )();
        this.loadedModule = loaded as AgentModule;
        if (!this.options.client) {
            throw new OpenRouterAgentClientRequiredError();
        }
    }

    async run(input: AgentLoopInput): Promise<AgentLoopResult> {
        await this.preflight();
        const module = this.loadedModule!;
        let toolSequence = 0;
        let iterations = 0;
        let completedResponses = 0;
        let stoppedOnMaxIterations = false;
        let useFullResponseStream = false;
        const usages: ModelUsage[] = [];
        const tools = (input.tools ?? []).map((descriptor) =>
            mapTool(descriptor, module, input, () => ++toolSequence)
        );

        const responseFormat = input.generation?.responseFormat;
        const sdkStopWhen = module.stepCountIs(input.maxIterations);
        const stopWhen =
            typeof sdkStopWhen === 'function'
                ? async (conditionInput: unknown) => {
                      const stopped = await (
                          sdkStopWhen as (
                              input: unknown
                          ) => boolean | Promise<boolean>
                      )(conditionInput);
                      if (stopped) stoppedOnMaxIterations = true;
                      return stopped;
                  }
                : sdkStopWhen;
        const requiresParameters =
            tools.length > 0 ||
            Boolean(responseFormat) ||
            Boolean(input.generation?.reasoning?.enabled);
        const result = module.callModel(
            this.options.client,
            {
                models: [...input.models],
                input: module.fromChatMessages(input.messages as unknown[]),
                tools,
                toolChoice:
                    typeof input.toolChoice === 'object'
                        ? {
                              type: 'function',
                              name: input.toolChoice.function.name,
                          }
                        : input.toolChoice,
                parallelToolCalls: input.parallelToolCalls,
                temperature: input.generation?.temperature,
                maxOutputTokens: input.generation?.maxOutputTokens,
                topP: input.generation?.topP,
                reasoning: input.generation?.reasoning,
                text: responseFormat
                    ? {
                          format: {
                              type: 'json_schema',
                              name: responseFormat.name,
                              description: responseFormat.description,
                              schema: responseFormat.schema,
                              strict: responseFormat.strict,
                          },
                      }
                    : undefined,
                provider: mapRoutingPolicy(
                    input.routing,
                    requiresParameters
                ),
                plugins: input.plugins?.map((plugin) => ({
                    id: plugin.id,
                    ...(plugin.config ?? {}),
                })),
                stopWhen,
                state: this.options.state,
                onTurnEnd: (
                    _context: unknown,
                    response: Record<string, any>
                ) => {
                    iterations++;
                    if (!useFullResponseStream) {
                        usages.push(mapUsage(response.usage));
                    }
                },
            },
            { signal: input.signal }
        );

        const abort = () => {
            void result.cancel();
        };
        input.signal?.addEventListener('abort', abort, { once: true });
        try {
            useFullResponseStream =
                typeof result.getFullResponsesStream === 'function';
            const textPump = (async () => {
                let text = '';
                for await (const delta of result.getTextStream()) {
                    text += delta;
                    input.onTextDelta?.(delta);
                }
                return text;
            })();
            const reasoningPump = (async () => {
                for await (const delta of result.getReasoningStream()) {
                    input.onReasoningDelta?.(delta);
                }
            })();
            const usagePump = (async () => {
                if (!result.getFullResponsesStream) return;
                for await (const event of result.getFullResponsesStream()) {
                    if (
                        event.type === 'response.completed' &&
                        event.response
                    ) {
                        completedResponses++;
                        usages.push(mapUsage(event.response.usage));
                    }
                }
            })();
            const [streamedText, response] = await Promise.all([
                textPump,
                result.getResponse(),
                reasoningPump,
                usagePump,
            ]).then(([text, completed]) => [text, completed] as const);

            iterations =
                completedResponses || Math.max(1, iterations);
            if (usages.length === 0) {
                usages.push(mapUsage(response.usage));
            }
            const finalContent =
                streamedText || response.outputText || '';
            const assistant = module.toChatMessage(response) as ChatMessage;
            return {
                finalContent,
                messages: [...input.messages, assistant],
                iterations,
                usage: aggregateUsage(usages),
                stoppedOnMaxIterations,
                actualModel: response.model,
                provider:
                    response.provider ??
                    response.metadata?.provider,
            };
        } finally {
            input.signal?.removeEventListener('abort', abort);
        }
    }
}

export function createOpenRouterAgentBackend(
    options: OpenRouterAgentBackendOptions
): OpenRouterAgentLoopBackend {
    return new OpenRouterAgentLoopBackend(options);
}
