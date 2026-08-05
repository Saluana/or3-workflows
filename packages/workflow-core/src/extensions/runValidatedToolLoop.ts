/**
 * Shared agent/parallel tool-calling loop with Zod validation,
 * parallel tool execution, stable ids, toolChoice, and structured outputs.
 */

import type {
    AgentNodeData,
    ChatMessage,
    ExecutableToolDefinition,
    ExecutionContext,
    LLMProvider,
    NodeModelRequestV1,
    ToolParameterSchema,
} from '../types';
import { estimateTokenUsage } from '../compaction';
import type { ToolLoopResult } from './shared';
import type { ModelToolDescriptor } from '../gateway';
import {
    prepareToolCalls,
} from '../toolProtocol';
import type { z } from 'zod';
import {
    adaptExecutableTool,
    executeToolBatch,
    type ToolExecutionPolicy,
    type WorkflowTool,
} from '../tools';
import { callModelForNode } from './modelGatewayCall';

export type ToolMeta = {
    handlers: Map<string, (args: unknown) => Promise<string> | string>;
    zodSchemas: Map<string, z.ZodType>;
    parameters: Map<string, ToolParameterSchema | Record<string, unknown>>;
};

export function buildToolMeta(
    globalTools: ExecutableToolDefinition[],
    workflowTools: WorkflowTool[] = []
): ToolMeta {
    const handlers = new Map<
        string,
        (args: unknown) => Promise<string> | string
    >();
    const zodSchemas = new Map<string, z.ZodType>();
    const parameters = new Map<
        string,
        ToolParameterSchema | Record<string, unknown>
    >();
    for (const tool of globalTools) {
        if (tool.handler) {
            handlers.set(tool.function.name, tool.handler);
        }
        if (tool.zodSchema) {
            zodSchemas.set(tool.function.name, tool.zodSchema);
        }
        if (tool.function.parameters) {
            parameters.set(tool.function.name, tool.function.parameters);
        }
    }
    for (const tool of workflowTools) {
        parameters.set(
            tool.descriptor.name,
            tool.descriptor.inputSchema
        );
    }
    return { handlers, zodSchemas, parameters };
}

export async function runValidatedToolLoop(options: {
    provider: LLMProvider;
    model: string;
    modelRequest?: NodeModelRequestV1;
    messages: ChatMessage[];
    toolsForLLM: ModelToolDescriptor[] | undefined;
    toolMeta: ToolMeta;
    context: ExecutionContext;
    nodeId: string;
    maxIterations: number;
    temperature?: number;
    maxTokens?: number;
    toolChoice?: AgentNodeData['toolChoice'];
    structuredOutput?: AgentNodeData['structuredOutput'];
    parallelToolCalls?: boolean;
    onToken?: (token: string) => void;
    onReasoning?: (token: string) => void;
    onToolCallActive?: (id: string, name: string) => void;
    onToolCallDone?: (
        id: string,
        name: string,
        error?: string
    ) => void;
}): Promise<ToolLoopResult> {
    const {
        provider,
        model,
        toolsForLLM,
        toolMeta,
        context,
        nodeId,
        maxIterations,
    } = options;

    const currentMessages = [...options.messages];
    let iterations = 0;
    let finalContent = '';

    while (iterations < maxIterations) {
        const requestMessages = [...currentMessages];
        const result = await callModelForNode({
            context,
            nodeId,
            provider,
            legacyModel: model,
            modelRequest:
                options.structuredOutput?.repair?.backend ===
                'response-healing'
                    ? {
                          ...(options.modelRequest ?? {
                              version: 1 as const,
                              models: [model] as [string],
                          }),
                          plugins: [
                              ...(options.modelRequest?.plugins ?? []).filter(
                                  (plugin) =>
                                      plugin.id !== 'response-healing'
                              ),
                              {
                                  id: 'response-healing',
                                  kind: 'response' as const,
                              },
                          ],
                      }
                    : options.modelRequest,
            messages: currentMessages,
            generation: {
                temperature: options.temperature,
                maxOutputTokens: options.maxTokens,
                responseFormat: options.structuredOutput
                    ? {
                          name: options.structuredOutput.name,
                          description:
                              options.structuredOutput.description,
                          schema: options.structuredOutput.schema,
                          strict: options.structuredOutput.strict,
                      }
                    : undefined,
            },
            tools: toolsForLLM,
            toolChoice: options.toolChoice,
            parallelToolCalls: options.parallelToolCalls,
            onTextDelta: options.onToken,
            onReasoningDelta: options.onReasoning,
            forceNonStreaming:
                options.structuredOutput?.repair?.backend ===
                'response-healing',
        });

        if (context.tokenCounter && context.onTokenUsage) {
            let usage = estimateTokenUsage({
                model: result.actualModel ?? model,
                messages: requestMessages,
                output: result.content || '',
                tokenCounter: context.tokenCounter,
                compaction: context.compaction,
            });

            if (result.usage) {
                usage = {
                    ...usage,
                    promptTokens:
                        result.usage.inputTokens ?? usage.promptTokens,
                    completionTokens:
                        result.usage.outputTokens ??
                        usage.completionTokens,
                    totalTokens:
                        result.usage.totalTokens ?? usage.totalTokens,
                };
            }

            context.onTokenUsage(usage);
        }

        if (!result.toolCalls || result.toolCalls.length === 0) {
            finalContent = result.content || '';
            break;
        }

        const prepared = prepareToolCalls(result.toolCalls, {
            nodeId,
            iteration: iterations,
            getZodSchema: (name) => toolMeta.zodSchemas.get(name),
            getParameters: (name) => toolMeta.parameters.get(name),
        });

        currentMessages.push(result.assistantMessage);

        for (const p of prepared) {
            options.onToolCallActive?.(p.toolCallId, p.toolName);
            context.onToolCallEvent?.({
                id: p.toolCallId,
                name: p.toolName,
                status: 'active',
            });
        }

        const explicitTools = context.workflowTools ?? [];
        const toolsByName = new Map<string, WorkflowTool>();
        for (const legacyTool of context.tools ?? []) {
            toolsByName.set(
                legacyTool.function.name,
                adaptExecutableTool(legacyTool, {
                    sideEffect: 'none',
                    parallelSafe: true,
                })
            );
        }
        for (const tool of explicitTools) {
            toolsByName.set(tool.descriptor.name, tool);
        }
        for (const call of prepared) {
            if (toolsByName.has(call.toolName) || !context.onToolCall) continue;
            toolsByName.set(call.toolName, {
                descriptor: {
                    name: call.toolName,
                    inputSchema:
                        (toolMeta.parameters.get(call.toolName) as
                            | Record<string, unknown>
                            | undefined) ?? {
                            type: 'object',
                            additionalProperties: true,
                        },
                    authority: 'host-client',
                    sideEffect: 'none',
                    approval: 'policy',
                    parallelSafe: true,
                },
                execute: (input) =>
                    context.onToolCall!(call.toolName, input),
            });
        }

        const compatibilityPolicy: ToolExecutionPolicy = {
            mode: 'parallel',
            defaultApproval: 'auto',
        };
        const { outcomes } = await executeToolBatch(
            prepared.map((call) => ({
                callId: call.toolCallId,
                toolName: call.toolName,
                input: call.parsedArgs,
            })),
            {
                runId: context.runId ?? context.sessionId ?? 'workflow-run',
                nodeId,
                signal:
                    context.signal ?? new AbortController().signal,
                policy:
                    context.toolExecutionPolicy ??
                    (explicitTools.length > 0
                        ? undefined
                        : compatibilityPolicy),
                parallelToolCalls:
                    options.parallelToolCalls ??
                    context.parallelToolCalls ??
                    true,
                resolve: (name) => toolsByName.get(name),
                approvalGate: context.toolApprovalGate,
                reconciler: context.toolReconciler,
                receiptStore: context.runStore,
                grantedPermissions: context.permissions,
                attempt: iterations + 1,
                onIntent: context.onToolIntent,
                onApproval: context.onToolApproval,
                onReceipt: context.onToolReceipt,
            }
        );

        for (let index = 0; index < prepared.length; index++) {
            const call = prepared[index]!;
            const outcome = outcomes[index]!;
            const error =
                outcome.status === 'failed' ||
                outcome.status === 'rejected'
                    ? outcome.error ?? outcome.output
                    : undefined;
            currentMessages.push({
                role: 'tool',
                content: outcome.output,
                tool_call_id: call.toolCallId,
                name: call.toolName,
            });
            options.onToolCallDone?.(call.toolCallId, call.toolName, error);
            context.onToolCallEvent?.({
                id: call.toolCallId,
                name: call.toolName,
                status: error ? 'error' : 'completed',
                error,
            });
        }

        iterations++;
    }

    return {
        finalContent,
        iterations,
        messages: currentMessages,
        stoppedOnMaxIterations: iterations >= maxIterations,
    };
}
