/**
 * Shared provider-neutral model invocation for every LLM-backed node.
 *
 * Legacy node fields are projected into a ModelRequest, while a versioned
 * `modelRequest` can opt into fallback arrays, routing, reasoning, plugins,
 * provider server tools, and raw diagnostics without migrating old documents.
 */
import type {
    ChatMessage,
    ExecutionContext,
    LLMProvider,
    NodeModelRequestV1,
    ToolDefinition,
} from '../types';
import { DEFAULT_WORKFLOW_FALLBACK_MODEL } from '../models';
import {
    LegacyLLMProviderGateway,
    ProviderCallError,
    toNonEmptyModels,
    type GenerationSettings,
    type ModelCallResult,
    type ModelCapability,
    type ModelRequest,
    type ModelToolDescriptor,
    type ProviderPluginDescriptor,
} from '../gateway';

export interface ModelNodeCallOptions {
    context: ExecutionContext;
    nodeId: string;
    provider?: LLMProvider;
    legacyModel: string;
    modelRequest?: NodeModelRequestV1;
    messages: ChatMessage[];
    generation?: GenerationSettings;
    tools?: ToolDefinition[] | ModelToolDescriptor[];
    toolChoice?: ModelRequest['toolChoice'];
    parallelToolCalls?: boolean;
    requiredCapabilities?: ModelCapability[];
    onTextDelta?: (delta: string) => void;
    onReasoningDelta?: (delta: string) => void;
    /** Disable model/tool streaming for response-healing compatibility. */
    forceNonStreaming?: boolean;
}

function asDescriptors(
    tools: ToolDefinition[] | ModelToolDescriptor[] | undefined
): ModelToolDescriptor[] {
    if (!tools) return [];
    return tools.map((tool) =>
        tool.type === 'function' && 'function' in tool
            ? { type: 'function', function: tool.function }
            : (tool as ModelToolDescriptor)
    );
}

function mergeGeneration(
    legacy: GenerationSettings | undefined,
    modern: GenerationSettings | undefined
): GenerationSettings | undefined {
    if (!legacy && !modern) return undefined;
    return {
        ...(legacy ?? {}),
        ...(modern ?? {}),
        reasoning:
            legacy?.reasoning || modern?.reasoning
                ? {
                      ...(legacy?.reasoning ?? {}),
                      ...(modern?.reasoning ?? {}),
                  }
                : undefined,
        responseFormat:
            modern?.responseFormat ?? legacy?.responseFormat,
    };
}

function mergePlugins(
    configured: ProviderPluginDescriptor[] | undefined
): ProviderPluginDescriptor[] | undefined {
    const plugins: ProviderPluginDescriptor[] = [];
    for (const plugin of configured ?? []) {
        const existing = plugins.findIndex(
            (item) => item.id === plugin.id
        );
        if (existing >= 0) plugins[existing] = plugin;
        else plugins.push(plugin);
    }
    return plugins.length > 0 ? plugins : undefined;
}

function legacyModelCandidates(primary: string): string[] {
    return primary === DEFAULT_WORKFLOW_FALLBACK_MODEL
        ? [primary]
        : [primary, DEFAULT_WORKFLOW_FALLBACK_MODEL];
}

/** Resolve the actual ModelRequest without calling a provider. */
export function buildNodeModelRequest(
    options: Omit<ModelNodeCallOptions, 'provider'>
): ModelRequest {
    const modern = options.modelRequest;
    const models = toNonEmptyModels(
        modern?.models?.filter((model) => model.trim().length > 0) ?? [
            ...legacyModelCandidates(options.legacyModel),
        ]
    );
    const generation = mergeGeneration(
        options.generation,
        modern?.generation
    );
    const tools = asDescriptors(options.tools);
    for (const serverTool of modern?.serverTools ?? []) {
        const transport =
            serverTool.transport ??
            (serverTool.name === 'openrouter:apply_patch'
                ? 'responses'
                : 'either');
        tools.push({
            type: 'provider-server',
            name: serverTool.name,
            transport,
            config: serverTool.config,
        });
    }

    const requiredCapabilities = new Set<ModelCapability>([
        ...(modern?.requiredCapabilities ?? []),
        ...(options.requiredCapabilities ?? []),
    ]);

    const request: ModelRequest = {
        models,
        transport: modern?.transport ?? 'chat',
        messages: options.messages,
        generation,
        routing: modern?.routing,
        tools: tools.length > 0 ? tools : undefined,
        toolChoice: options.toolChoice,
        parallelToolCalls: options.parallelToolCalls,
        requiredCapabilities:
            requiredCapabilities.size > 0
                ? [...requiredCapabilities]
                : undefined,
        plugins: mergePlugins(modern?.plugins),
        sessionId: options.context.sessionId,
        onTextDelta: options.forceNonStreaming
            ? undefined
            : (options.onTextDelta ?? options.context.onToken),
        onReasoningDelta: options.forceNonStreaming
            ? undefined
            : (options.onReasoningDelta ?? options.context.onReasoning),
        signal: options.context.signal,
        debug: modern?.debug,
    };

    const incompatible = request.tools?.find(
        (tool) =>
            tool.type === 'provider-server' &&
            tool.transport !== 'either' &&
            tool.transport !== request.transport
    );
    if (incompatible?.type === 'provider-server') {
        throw new ProviderCallError({
            message: `Server tool "${incompatible.name}" requires the ${incompatible.transport} transport, but this node selected ${request.transport}.`,
            requestedModels: models,
            retryable: false,
        });
    }

    return request;
}

/**
 * Execute a node model call through the provider-neutral gateway and report
 * lifecycle/cost data to the enclosing workflow.
 */
export async function callModelForNode(
    options: ModelNodeCallOptions
): Promise<ModelCallResult> {
    const request = buildNodeModelRequest(options);
    if (request.transport === 'responses') {
        throw new ProviderCallError({
            message:
                'The native ModelGateway currently uses Chat Completions. Select the openrouter-agent backend for Responses transport nodes.',
            requestedModels: request.models,
            retryable: false,
        });
    }
    const gateway =
        options.context.modelGateway ??
        (options.provider
            ? new LegacyLLMProviderGateway(options.provider, {
                  onWarning: options.context.onWarning,
              })
            : undefined);
    if (!gateway) {
        throw new Error('ModelGateway required for LLM-backed node execution');
    }

    options.context.assertBudget?.();
    const callId =
        options.context.createModelCallId?.(options.nodeId) ??
        `${options.nodeId}:model:${Date.now()}`;
    options.context.onModelCallStart?.(
        callId,
        options.nodeId,
        request
    );

    let result: ModelCallResult;
    try {
        result = await gateway.generate(request);
    } catch (error) {
        options.context.onModelCallError?.(
            callId,
            options.nodeId,
            request,
            error instanceof Error ? error : new Error(String(error))
        );
        throw error;
    }

    options.context.onModelCallFinish?.(
        callId,
        options.nodeId,
        request,
        result
    );
    options.context.recordLlmStep?.(
        result.usage?.totalTokens,
        result.usage?.costUsd
    );
    return result;
}
