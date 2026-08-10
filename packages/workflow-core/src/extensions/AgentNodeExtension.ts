import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    ExecutionContext,
    AgentNodeData,
    LLMProvider,
    ValidationError,
    ValidationWarning,
    ChatMessage,
    NodeExecutionResult,
    NodeModelRequestV1,
} from '../types';
import type { HITLRequest } from '../hitl';
import {
    type OpenRouterContentPart,
    resolveAttachmentUrl,
} from './shared';
import {
    buildToolMeta,
    runValidatedToolLoop,
} from './runValidatedToolLoop';
import {
    parseValidateRepair,
    projectValueToString,
    specFromJsonSchema,
    StructuredValidationError,
} from '../schema';
import type { JsonValue, ModelToolDescriptor } from '../gateway';
import { DEFAULT_WORKFLOW_MODEL } from '../models';
import { callModelForNode } from './modelGatewayCall';
import { buildNodeModelRequest } from './modelGatewayCall';
import {
    adaptExecutableTool,
    executeToolBatch,
    type ToolExecutionPolicy,
    type WorkflowTool,
} from '../tools';

/** Default model for agent nodes */
const DEFAULT_MODEL = DEFAULT_WORKFLOW_MODEL;

/** Default maximum number of tool call iterations to prevent infinite loops */
const DEFAULT_MAX_TOOL_ITERATIONS = 10;

/**
 * Delegates to runValidatedToolLoop (Zod validation, parallel tools, stable ids).
 */
async function runToolLoop(
    provider: LLMProvider,
    model: string,
    messages: ChatMessage[],
    toolsForLLM: ModelToolDescriptor[] | undefined,
    toolMeta: ReturnType<typeof buildToolMeta>,
    context: ExecutionContext,
    data: AgentNodeData,
    maxIterations: number,
    nodeId: string
) {
    return runValidatedToolLoop({
        provider,
        model,
        modelRequest: data.modelRequest,
        messages,
        toolsForLLM,
        toolMeta,
        context,
        nodeId,
        maxIterations,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        toolChoice: data.toolChoice,
        structuredOutput: data.structuredOutput,
        parallelToolCalls:
            data.parallelToolCalls ?? context.parallelToolCalls,
        onToken: (token) => context.onToken?.(token),
        onReasoning: (token) => context.onReasoning?.(token),
    });
}


/**
 * Agent Node Extension
 *
 * Represents an LLM agent that processes input and generates output.
 * Supports model selection, custom prompts, temperature, and tool usage.
 */
export const AgentNodeExtension: NodeExtension = {
    name: 'agent',
    type: 'node',

    // Port definitions
    inputs: [
        {
            id: 'input',
            type: 'input',
            label: 'Input',
            dataType: 'any',
            required: true,
        },
    ],
    outputs: [
        {
            id: 'output',
            type: 'output',
            label: 'Output',
            dataType: 'string',
            multiple: true,
        },
        {
            id: 'error',
            type: 'output',
            label: 'Error',
            dataType: 'string',
        },
        {
            id: 'rejected',
            type: 'output',
            label: 'Rejected',
            dataType: 'string',
        },
    ],

    // Default data for new nodes
    defaultData: {
        label: 'Agent',
        model: DEFAULT_MODEL,
        prompt: '',
        temperature: undefined,
        maxTokens: undefined,
        tools: [],
        maxToolIterations: undefined, // Uses DEFAULT_MAX_TOOL_ITERATIONS or global setting
        onMaxToolIterations: undefined, // Uses 'warning' by default
    },

    /**
     * Execute the agent node.
     *
     * @internal Execution is handled by OpenRouterExecutionAdapter.
     * Calling this directly will raise to prevent confusing placeholder data.
     */
    /**
     * Execute the agent node.
     */
    async execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<NodeExecutionResult> {
        if (!provider) {
            throw new Error('Agent node requires an LLM provider');
        }

        const data = node.data as AgentNodeData;
        const model =
            data.modelRequest?.models[0] ||
            data.model ||
            context.defaultModel ||
            DEFAULT_MODEL;
        const systemPrompt =
            data.prompt || `You are a helpful assistant named ${data.label}.`;

        // Check model capabilities if provider available
        let supportedModalities = ['text'];
        if (model) {
            const capabilities = await (
                context.modelGateway ?? provider
            ).getModelCapabilities(model);
            if (capabilities) {
                supportedModalities = capabilities.inputModalities;
            }
        }

        // Construct user content with attachments
        const taskSuffix = data.task?.trim()
            ? `\n\nTask:\n${data.task.trim()}`
            : '';
        let userContent: string | OpenRouterContentPart[] =
            context.input + taskSuffix;
        const debug = context.debug ?? false;
        if (debug && context.attachments && context.attachments.length > 0) {
            console.log(
                '[AgentNodeExtension] Processing attachments:',
                context.attachments.map((a) => ({
                    type: a.type,
                    mimeType: a.mimeType,
                    name: a.name,
                    urlLength: a.url?.length || 0,
                }))
            );
        }

        if (context.attachments && context.attachments.length > 0) {
            const contentParts: OpenRouterContentPart[] = [
                { type: 'text', text: context.input + taskSuffix },
            ];

            for (const attachment of context.attachments) {
                // Skip unsupported modalities (but NOT files - OpenRouter handles PDFs for all models)
                // Per OpenRouter docs: "This feature works on any model on OpenRouter"
                // OpenRouter parses PDFs server-side for models without native file support
                if (
                    attachment.type !== 'file' &&
                    !supportedModalities.includes(attachment.type)
                ) {
                    console.warn(
                        `Model ${model} does not support ${attachment.type} modality, skipping attachment`
                    );
                    continue;
                }

                const url = resolveAttachmentUrl(attachment);

                if (!url) continue;

                switch (attachment.type) {
                    case 'image':
                        contentParts.push({
                            type: 'image_url',
                            imageUrl: { url },
                        });
                        break;
                    case 'file':
                        // PDF and other file attachments
                        contentParts.push({
                            type: 'file',
                            file: {
                                filename: attachment.name || 'document',
                                fileData: url,
                            },
                        });
                        break;
                }
            }

            if (contentParts.length > 1) {
                userContent = contentParts;
            }
        }

        // Workflow nodes are dataflow stages, not turns from one assistant.
        // Keep the static node instruction first and the resolved inbound data
        // last so provider prefix caches can reuse the stable portion. Tool-loop
        // turns are appended to this local message list below as a real chat.
        const messages: ChatMessage[] = [
            { role: 'system' as const, content: systemPrompt },
            {
                role: 'user' as const,
                // Cast to string since ChatMessage.content is string, but OpenRouter accepts arrays
                content: userContent as unknown as string,
            },
        ];

        // Build tools array from node config and global context tools
        const nodeToolNames = data.tools || [];
        const globalTools = context.tools || [];
        const workflowTools = context.workflowTools || [];
        const toolMeta = buildToolMeta(globalTools, workflowTools);

        // Build tools for LLM - either from node config (basic) or global tools (full)
        let toolsForLLM: ModelToolDescriptor[] | undefined;
        const modelTools = new Map<string, ModelToolDescriptor>();
        const hasPermission = (permissions?: string[]) =>
            context.permissions === undefined ||
            (permissions ?? []).every((permission) =>
                context.permissions!.includes(permission)
            );
        for (const tool of globalTools) {
            modelTools.set(tool.function.name, {
                type: 'function',
                function: tool.function,
            });
        }
        for (const tool of workflowTools) {
            if (!hasPermission(tool.descriptor.permissions)) continue;
            if (tool.descriptor.authority === 'provider-server') {
                modelTools.set(tool.descriptor.name, {
                    type: 'provider-server',
                    name: tool.descriptor.name,
                    transport: tool.descriptor.transport ?? 'either',
                    config: tool.descriptor.providerConfig,
                });
                continue;
            }
            modelTools.set(tool.descriptor.name, {
                type: 'function',
                function: {
                    name: tool.descriptor.name,
                    description: tool.descriptor.description,
                    parameters: tool.descriptor.inputSchema,
                },
            });
        }
        if (nodeToolNames.length > 0) {
            // Node specifies tool names - find matching tools from global registry
            toolsForLLM = nodeToolNames.map((name): ModelToolDescriptor => {
                const modelTool = modelTools.get(name);
                if (modelTool) return modelTool;
                // Fallback: basic tool definition without schema
                return { type: 'function', function: { name } };
            });
        } else if (modelTools.size > 0) {
            // Use all global tools
            toolsForLLM = [...modelTools.values()];
        }

        // Determine max tool iterations - node-level overrides context-level
        const maxToolIterations =
            data.maxToolIterations ??
            context.maxToolIterations ??
            DEFAULT_MAX_TOOL_ITERATIONS;

        // Determine behavior when max iterations reached
        const onMaxToolIterations =
            data.onMaxToolIterations ??
            context.onMaxToolIterations ??
            'warning';

        const runSelectedLoop = async (
            loopMessages: ChatMessage[]
        ) => {
            const backendId =
                data.modelRequest?.backend ?? 'native';
            if (backendId === 'native') {
                return runToolLoop(
                    provider,
                    model,
                    loopMessages,
                    toolsForLLM,
                    toolMeta,
                    context,
                    data,
                    maxToolIterations,
                    node.id
                );
            }

            const backend = context.agentBackends?.[backendId];
            if (!backend) {
                throw new Error(
                    `Agent backend "${backendId}" is not configured. Pass it through ExecutionOptions.agentBackends.`
                );
            }
            if (!context.modelGateway) {
                throw new Error(
                    `Agent backend "${backendId}" requires a ModelGateway`
                );
            }

            const executable = new Map<string, WorkflowTool>();
            for (const tool of globalTools) {
                executable.set(
                    tool.function.name,
                    adaptExecutableTool(tool, {
                        sideEffect: 'none',
                        parallelSafe: true,
                    })
                );
            }
            for (const tool of workflowTools) {
                if (hasPermission(tool.descriptor.permissions)) {
                    executable.set(tool.descriptor.name, tool);
                }
            }
            const exposedNames = new Set(
                (toolsForLLM ?? []).map((tool) =>
                    tool.type === 'function'
                        ? tool.function.name
                        : tool.name
                )
            );
            const compatibilityPolicy: ToolExecutionPolicy = {
                mode: 'parallel',
                defaultApproval: 'auto',
            };
            const request = buildNodeModelRequest({
                context,
                nodeId: node.id,
                legacyModel: model,
                modelRequest: data.modelRequest,
                messages: loopMessages,
                generation: {
                    temperature: data.temperature,
                    maxOutputTokens: data.maxTokens,
                    responseFormat: data.structuredOutput
                        ? {
                              name: data.structuredOutput.name,
                              description:
                                  data.structuredOutput.description,
                              schema: data.structuredOutput.schema,
                              strict: data.structuredOutput.strict,
                          }
                        : undefined,
                },
                tools: toolsForLLM,
                toolChoice: data.toolChoice,
                parallelToolCalls:
                    data.parallelToolCalls ??
                    context.parallelToolCalls,
            });
            const callId =
                context.createModelCallId?.(node.id) ??
                `${node.id}:agent:${Date.now()}`;
            const startedAt = Date.now();
            context.assertBudget?.();
            context.onModelCallStart?.(
                callId,
                node.id,
                request
            );
            try {
                const result = await backend.run({
                    gateway: context.modelGateway,
                    models: request.models,
                    messages: loopMessages,
                    tools: request.tools,
                    toolChoice: request.toolChoice,
                    parallelToolCalls: request.parallelToolCalls,
                    generation: request.generation,
                    routing: request.routing,
                    plugins: request.plugins,
                    maxIterations: maxToolIterations,
                    signal: context.signal,
                    onTextDelta: (token) =>
                        context.onToken?.(token),
                    onReasoningDelta: (token) =>
                        context.onReasoning?.(token),
                    executeTool: async (invocation) => {
                        if (!exposedNames.has(invocation.toolName)) {
                            throw new Error(
                                `Tool "${invocation.toolName}" is not exposed by node "${node.id}"`
                            );
                        }
                        let parsed: unknown;
                        try {
                            parsed = JSON.parse(
                                invocation.argumentsJson || '{}'
                            );
                        } catch {
                            parsed = {};
                        }
                        const { outcomes } = await executeToolBatch(
                            [
                                {
                                    callId: invocation.callId,
                                    toolName: invocation.toolName,
                                    input: parsed,
                                },
                            ],
                            {
                                runId:
                                    context.runId ??
                                    context.sessionId ??
                                    'workflow-run',
                                nodeId: node.id,
                                signal:
                                    context.signal ??
                                    new AbortController().signal,
                                policy:
                                    context.toolExecutionPolicy ??
                                    (workflowTools.length > 0
                                        ? undefined
                                        : compatibilityPolicy),
                                parallelToolCalls: false,
                                resolve: (name) =>
                                    executable.get(name),
                                approvalGate:
                                    context.toolApprovalGate,
                                reconciler: context.toolReconciler,
                                receiptStore: context.runStore,
                                grantedPermissions:
                                    context.permissions,
                                onIntent: context.onToolIntent,
                                onApproval:
                                    context.onToolApproval,
                                onReceipt:
                                    context.onToolReceipt,
                            }
                        );
                        return outcomes[0]?.output ?? '';
                    },
                });
                const completedAt = Date.now();
                context.onModelCallFinish?.(
                    callId,
                    node.id,
                    request,
                    {
                        requestedModels: request.models,
                        actualModel: result.actualModel,
                        provider: result.provider,
                        assistantMessage:
                            result.messages[
                                result.messages.length - 1
                            ] ?? {
                                role: 'assistant',
                                content: result.finalContent,
                            },
                        content: result.finalContent,
                        usage: result.usage,
                        timing: {
                            startedAt,
                            completedAt,
                            totalMs: completedAt - startedAt,
                        },
                        finishReason:
                            result.stoppedOnMaxIterations
                                ? 'length'
                                : 'stop',
                    }
                );
                context.recordLlmStep?.(
                    result.usage?.totalTokens,
                    result.usage?.costUsd
                );
                return result;
            } catch (error) {
                context.onModelCallError?.(
                    callId,
                    node.id,
                    request,
                    error instanceof Error
                        ? error
                        : new Error(String(error))
                );
                throw error;
            }
        };

        // Run initial tool loop
        let loopResult = await runSelectedLoop(messages);
        let { finalContent } = loopResult;
        let currentMessages = loopResult.messages;

        // Handle max tool iterations reached
        if (loopResult.stoppedOnMaxIterations) {
            if (onMaxToolIterations === 'error') {
                throw new Error(
                    `Maximum tool iterations (${maxToolIterations}) reached. Execution stopped.`
                );
            } else if (
                onMaxToolIterations === 'hitl' &&
                context.onHITLRequest
            ) {
                // Trigger human-in-the-loop for approval to continue
                const hitlRequest: HITLRequest = {
                    id: `hitl-tool-limit-${node.id}-${Date.now()}`,
                    nodeId: node.id,
                    nodeLabel: data.label || 'Agent',
                    mode: 'approval',
                    prompt: `The agent has reached the maximum tool iterations limit (${maxToolIterations}). Would you like to allow it to continue with ${maxToolIterations} more iterations?`,
                    context: {
                        input: context.input,
                        output: finalContent,
                        workflowName:
                            context.workflowName || 'Unknown Workflow',
                    },
                    options: [
                        {
                            id: 'continue',
                            label: 'Continue',
                            action: 'approve',
                        },
                        { id: 'stop', label: 'Stop', action: 'reject' },
                    ],
                    createdAt: new Date().toISOString(),
                };

                const response = await context.onHITLRequest(hitlRequest);

                if (response.action === 'approve') {
                    // Continue with another round of tool calls using the helper
                    loopResult =
                        await runSelectedLoop(currentMessages);
                    finalContent = loopResult.finalContent;
                    currentMessages = loopResult.messages;

                    // If we hit the limit again, add a warning
                    if (loopResult.stoppedOnMaxIterations) {
                        finalContent = `Warning: Maximum tool iterations (${maxToolIterations}) reached again after HITL approval. Last content: ${finalContent}`;
                    }
                } else {
                    // User rejected, add warning and proceed with current content
                    finalContent = `Tool iteration stopped by user at ${maxToolIterations} iterations. Last content: ${finalContent}`;
                }
            } else {
                // Default: warning mode
                finalContent = `Warning: Maximum tool iterations (${maxToolIterations}) reached. Last content: ${finalContent}`;
            }
        }

        let output = finalContent;
        let value: JsonValue | undefined;
        let valueSchema: { id: string; version: number } | undefined;
        if (data.structuredOutput) {
            const spec = specFromJsonSchema(
                data.structuredOutput.schemaId ??
                    data.structuredOutput.name,
                data.structuredOutput.schemaVersion ?? 1,
                data.structuredOutput.schema,
                {
                    strict: data.structuredOutput.strict,
                    repair: data.structuredOutput.repair,
                }
            );
            const validated = await parseValidateRepair(finalContent, spec, {
                regenerate:
                    (spec.repair?.maxAttempts ?? 0) > 0
                        ? async ({ attempt, previous, issues }) => {
                              const repairMessages: ChatMessage[] = [
                                  ...currentMessages,
                                  {
                                      role: 'assistant',
                                      content: previous,
                                  },
                                  {
                                      role: 'user',
                                      content:
                                          `The prior JSON failed schema validation (repair attempt ${attempt}). ` +
                                          `Correct only the invalid JSON and return JSON with no prose. Issues: ${JSON.stringify(
                                              issues
                                          )}`,
                                  },
                              ];
                              const baseRepairRequest: NodeModelRequestV1 =
                                  data.modelRequest ??
                                  {
                                      version: 1,
                                      models: [model],
                                  };
                              const repairModelRequest = {
                                  ...baseRepairRequest,
                                  serverTools: [],
                                  plugins:
                                      spec.repair?.backend ===
                                      'response-healing'
                                          ? [
                                                ...(
                                                    baseRepairRequest.plugins ??
                                                    []
                                                ).filter(
                                                    (plugin) =>
                                                        plugin.id !==
                                                        'response-healing'
                                                ),
                                                {
                                                    id: 'response-healing',
                                                    kind: 'response' as const,
                                                },
                                            ]
                                          : baseRepairRequest.plugins,
                              };
                              const repaired = await callModelForNode({
                                  context,
                                  nodeId: node.id,
                                  provider,
                                  legacyModel: model,
                                  modelRequest: repairModelRequest,
                                  messages: repairMessages,
                                  generation: {
                                      temperature: 0,
                                      maxOutputTokens: data.maxTokens,
                                      responseFormat: {
                                          name:
                                              data.structuredOutput!.name,
                                          description:
                                              data.structuredOutput!
                                                  .description,
                                          schema:
                                              data.structuredOutput!.schema,
                                          strict:
                                              data.structuredOutput!.strict,
                                      },
                                  },
                                  forceNonStreaming:
                                      spec.repair?.backend ===
                                      'response-healing',
                              });
                              return repaired.content ?? '';
                          }
                        : undefined,
            });
            if (!validated.ok) {
                throw new StructuredValidationError(validated);
            }
            value = validated.value;
            valueSchema = {
                id: validated.schema.id,
                version: validated.schema.version,
            };
            output = projectValueToString(value);
        }

        // Calculate next nodes
        const outgoingEdges = context.getOutgoingEdges(node.id, 'output');
        const nextNodes = outgoingEdges.map((e) => e.target);

        return {
            output,
            nextNodes,
            value,
            valueSchema,
        };
    },

    /**
     * Validate the agent node.
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[]
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as AgentNodeData;

        // Check for model
        if (!data.model && !data.modelRequest?.models?.length) {
            errors.push({
                type: 'error',
                code: 'MISSING_MODEL',
                message: 'Agent node requires a model to be selected',
                nodeId: node.id,
            });
        }

        // Warn if prompt is empty
        if (!data.prompt || data.prompt.trim() === '') {
            errors.push({
                type: 'warning',
                code: 'EMPTY_PROMPT',
                message: 'Agent node has no system prompt configured',
                nodeId: node.id,
            });
        }

        // Check for incoming connections
        const incomingEdges = edges.filter((e) => e.target === node.id);
        if (incomingEdges.length === 0) {
            errors.push({
                type: 'error',
                code: 'DISCONNECTED_NODE',
                message: 'Agent node has no incoming connections',
                nodeId: node.id,
            });
        }

        return errors;
    },
};
