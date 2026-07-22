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
    ToolParameterSchema,
} from '../types';
import { estimateTokenUsage } from '../compaction';
import type { ToolForLLM, ToolLoopResult } from './shared';
import {
    prepareToolCalls,
    executeToolCallsParallel,
} from '../toolProtocol';
import type { z } from 'zod';

export type ToolMeta = {
    handlers: Map<string, (args: unknown) => Promise<string> | string>;
    zodSchemas: Map<string, z.ZodType>;
    parameters: Map<string, ToolParameterSchema | Record<string, unknown>>;
};

export function buildToolMeta(
    globalTools: ExecutableToolDefinition[]
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
    return { handlers, zodSchemas, parameters };
}

export async function runValidatedToolLoop(options: {
    provider: LLMProvider;
    model: string;
    messages: ChatMessage[];
    toolsForLLM: ToolForLLM[] | undefined;
    toolMeta: ToolMeta;
    context: ExecutionContext;
    nodeId: string;
    maxIterations: number;
    temperature?: number;
    maxTokens?: number;
    toolChoice?: AgentNodeData['toolChoice'];
    structuredOutput?: AgentNodeData['structuredOutput'];
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

    const responseFormat = options.structuredOutput
        ? {
              type: 'json_schema' as const,
              json_schema: {
                  name: options.structuredOutput.name,
                  description: options.structuredOutput.description,
                  schema: options.structuredOutput.schema,
                  strict: options.structuredOutput.strict,
              },
          }
        : undefined;

    while (iterations < maxIterations) {
        options.context.assertBudget?.();

        const requestMessages = [...currentMessages];
        const result = await provider.chat(model, currentMessages, {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
            tools: toolsForLLM,
            toolChoice: options.toolChoice,
            responseFormat,
            onToken: options.onToken,
            onReasoning: options.onReasoning,
            signal: context.signal,
        });

        let stepTokens = result.usage?.totalTokens;

        if (context.tokenCounter && context.onTokenUsage) {
            let usage = estimateTokenUsage({
                model,
                messages: requestMessages,
                output: result.content || '',
                tokenCounter: context.tokenCounter,
                compaction: context.compaction,
            });

            if (result.usage) {
                usage = {
                    ...usage,
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                };
            } else {
                stepTokens = usage.totalTokens;
            }

            context.onTokenUsage(usage);
        }

        options.context.recordLlmStep?.(stepTokens);

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

        currentMessages.push({
            role: 'assistant',
            content: result.content || '[Calling tools...]',
            tool_calls: prepared.map((p) => p.toolCall),
        });

        for (const p of prepared) {
            options.onToolCallActive?.(p.toolCallId, p.toolName);
            context.onToolCallEvent?.({
                id: p.toolCallId,
                name: p.toolName,
                status: 'active',
            });
        }

        const executed = await executeToolCallsParallel(
            prepared,
            async (call) => {
                const handler = toolMeta.handlers.get(call.toolName);
                if (handler) {
                    return handler(call.parsedArgs);
                }
                if (context.onToolCall) {
                    return context.onToolCall(call.toolName, call.parsedArgs);
                }
                throw new Error(
                    `Tool ${call.toolName} not found or no handler registered`
                );
            }
        );

        for (const { call, result: toolResult, error } of executed) {
            currentMessages.push({
                role: 'tool',
                content: toolResult,
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

    return { finalContent, iterations, messages: currentMessages };
}
