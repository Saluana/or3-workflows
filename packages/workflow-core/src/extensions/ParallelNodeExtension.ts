import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    ExecutionContext,
    ParallelNodeData,
    BranchDefinition,
    LLMProvider,
    NodeExecutionResult,
    ChatMessage,
    ValidationError,
    ValidationWarning,
} from '../types';
import { estimateTokenUsage } from '../compaction';
import {
    type ToolForLLM,
    type ToolLoopResult,
    buildUserContentWithAttachments,
} from './shared';

const DEFAULT_MODEL = 'z-ai/glm-4.6:exacto';

/** Default maximum number of tool call iterations */
const DEFAULT_MAX_TOOL_ITERATIONS = 10;

/**
 * Run the tool execution loop for a branch.
 */
async function runToolLoop(
    provider: LLMProvider,
    model: string,
    messages: ChatMessage[],
    toolsForLLM: ToolForLLM[] | undefined,
    toolHandlers: Map<string, (args: unknown) => Promise<string> | string>,
    context: ExecutionContext,
    branchId: string,
    branchLabel: string,
    maxIterations: number
): Promise<ToolLoopResult> {

    const currentMessages = [...messages];
    let iterations = 0;
    let finalContent = '';

    while (iterations < maxIterations) {
        const requestMessages = [...currentMessages];
        const result = await provider.chat(model, currentMessages, {
            tools: toolsForLLM,
            onToken: (token) => {
                context.onBranchToken?.(branchId, branchLabel, token);
            },
            onReasoning: (token) => {
                context.onBranchReasoning?.(branchId, branchLabel, token);
            },
        });

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
            }

            context.onTokenUsage(usage);
        }

        // If no tool calls, we're done
        if (!result.toolCalls || result.toolCalls.length === 0) {
            finalContent = result.content || '';
            break;
        }

        // Add assistant message with tool calls
        currentMessages.push({
            role: 'assistant',
            content: result.content || '',
        });

        // Execute tool calls
        for (const toolCall of result.toolCalls) {
            const toolName = toolCall.function?.name || 'unknown_tool';
            const toolArgs = toolCall.function?.arguments;
            const toolCallId =
                toolCall.id ||
                `${toolName}-${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2, 8)}`;

            let parsedArgs: unknown;
            try {
                parsedArgs =
                    typeof toolArgs === 'string'
                        ? JSON.parse(toolArgs)
                        : toolArgs;
            } catch {
                parsedArgs = toolArgs;
            }

            context.onToolCallEvent?.({
                id: toolCallId,
                name: toolName,
                status: 'active',
                branchId,
                branchLabel,
            });

            let toolResult: string;
            let toolError: string | undefined;
            const handler = toolHandlers.get(toolName);

            if (handler) {
                try {
                    toolResult = await handler(parsedArgs);
                } catch (err) {
                    toolError =
                        err instanceof Error ? err.message : String(err);
                    toolResult = `Error executing tool ${toolName}: ${toolError}`;
                }
            } else if (context.onToolCall) {
                try {
                    toolResult = await context.onToolCall(toolName, parsedArgs);
                } catch (err) {
                    toolError =
                        err instanceof Error ? err.message : String(err);
                    toolResult = `Error executing tool ${toolName}: ${toolError}`;
                }
            } else {
                toolError = `Tool ${toolName} not found or no handler registered`;
                toolResult = toolError;
            }

            currentMessages.push({
                role: 'system',
                content: `[Tool Result: ${toolName}]\n${toolResult}`,
            });

            context.onToolCallEvent?.({
                id: toolCallId,
                name: toolName,
                status: toolError ? 'error' : 'completed',
                error: toolError,
                branchId,
                branchLabel,
            });
        }

        iterations++;
    }

    return { finalContent, iterations, messages: currentMessages };
}

/**
 * Parallel Node Extension
 *
 * Executes multiple branches concurrently and optionally merges the results.
 * Each branch can have its own model, prompt, and tools.
 */
export const ParallelNodeExtension: NodeExtension = {
    name: 'parallel',
    type: 'node',

    // Port definitions - outputs are dynamic based on branches
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
        // Merge output (after all branches complete)
        {
            id: 'merged',
            type: 'output',
            label: 'Merged Output',
            dataType: 'string',
        },
    ],

    // Default data for new nodes
    defaultData: {
        label: 'Parallel',
        model: undefined, // Model for merge step
        prompt: '', // Merge/synthesis prompt
        branches: [] as BranchDefinition[],
        mergeEnabled: true,
    },

    /**
     * Execute the parallel node.
     */
    async execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<NodeExecutionResult> {
        const data = node.data as ParallelNodeData;
        const branches = data.branches || [];

        if (branches.length === 0) {
            throw new Error('Parallel node has no branches configured');
        }

        const outgoingEdges = context.getOutgoingEdges(node.id);
        const mergeEnabled = data.mergeEnabled !== false;
        // Optional per-branch timeout (default: 5 minutes if not specified)
        const branchTimeout = data.branchTimeout ?? 5 * 60 * 1000;

        // Helper to create a timeout promise
        const createTimeoutPromise = (
            branchId: string,
            label: string,
            timeoutMs: number
        ) => {
            return new Promise<{
                status: 'rejected';
                reason: Error;
                branchId: string;
                label: string;
            }>((resolve) => {
                setTimeout(() => {
                    resolve({
                        status: 'rejected' as const,
                        reason: new Error(
                            `Branch "${label}" timed out after ${timeoutMs}ms`
                        ),
                        branchId,
                        label,
                    });
                }, timeoutMs);
            });
        };

        // Prepare global tools map
        const globalTools = context.tools || [];
        const toolHandlers = new Map<
            string,
            (args: unknown) => Promise<string> | string
        >();
        for (const tool of globalTools) {
            if (tool.handler) {
                toolHandlers.set(tool.function.name, tool.handler);
            }
        }

        // Execute all branches internally using their model/prompt configs
        // Branches are internal LLM calls, not external node connections
        const branchExecutions = branches.map((branch) => {
            // Use branch-specific model/prompt or fall back to defaults
            const branchModel = branch.model || data.model || DEFAULT_MODEL;
            const branchPrompt =
                branch.prompt || 'You are a helpful assistant.';

            // Prepare tools for this branch
            const branchToolNames = branch.tools || [];
            let toolsForLLM: ToolForLLM[] | undefined;

            if (branchToolNames.length > 0) {
                toolsForLLM = branchToolNames.map((name): ToolForLLM => {
                    const globalTool = globalTools.find(
                        (t) => t.function.name === name
                    );
                    if (globalTool) {
                        return {
                            type: 'function',
                            function: globalTool.function,
                        };
                    }
                    return { type: 'function', function: { name } };
                });
            }

            const executionPromise = (async () => {
                if (!provider) {
                    throw new Error('Parallel node requires LLM provider');
                }

                let supportsImages = false;
                if (context.attachments && context.attachments.length > 0) {
                    const capabilities =
                        await provider.getModelCapabilities(branchModel);
                    supportsImages =
                        capabilities?.inputModalities?.includes('image') ??
                        false;
                }
                if (context.attachments && context.attachments.length > 0) {
                    const hasImages = context.attachments.some(a => a.type === 'image');
                    if (!supportsImages && hasImages) {
                        console.warn(
                            `Model ${branchModel} does not support image input; skipping image attachments for branch "${branch.label}" (PDFs will still be included).`
                        );
                    }
                }

                const userContent = buildUserContentWithAttachments(
                    context.input,
                    context.attachments,
                    supportsImages
                );

                const messages: ChatMessage[] = [
                    { role: 'system', content: branchPrompt },
                    { role: 'user', content: userContent as unknown as string },
                ];

                // Notify branch start
                context.onBranchStart?.(branch.id, branch.label);

                // Run tool loop
                const result = await runToolLoop(
                    provider,
                    branchModel,
                    messages,
                    toolsForLLM,
                    toolHandlers,
                    context,
                    branch.id,
                    branch.label,
                    DEFAULT_MAX_TOOL_ITERATIONS
                );

                const output = result.finalContent;

                // Notify branch complete
                context.onBranchComplete?.(branch.id, branch.label, output);

                return {
                    status: 'fulfilled' as const,
                    value: { output },
                    branchId: branch.id,
                    label: branch.label,
                };
            })().catch((error) => ({
                status: 'rejected' as const,
                reason: error,
                branchId: branch.id,
                label: branch.label,
            }));

            // Race execution against timeout if timeout is configured
            return branchTimeout > 0
                ? Promise.race([
                      executionPromise,
                      createTimeoutPromise(
                          branch.id,
                          branch.label,
                          branchTimeout
                      ),
                  ])
                : executionPromise;
        });

        if (branchExecutions.length === 0) {
            return {
                output: 'No branches configured.',
                nextNodes: [],
            };
        }

        // Execute all branches with Promise.allSettled to handle partial failures gracefully
        const settledResults = await Promise.allSettled(branchExecutions);

        // Convert settled results to our result format
        const results = settledResults.map((settled, index) => {
            const branch = branches[index];
            if (settled.status === 'fulfilled') {
                // settled.value could be either execution result or timeout result
                const value = settled.value;
                // Check if it's a timeout/error result
                if (value.status === 'rejected') {
                    return value; // Already in correct format
                }
                // It's a successful execution result
                return value;
            } else {
                // Promise itself rejected (shouldn't happen with our setup, but be safe)
                return {
                    status: 'rejected' as const,
                    reason: settled.reason,
                    branchId: branch.id,
                    label: branch.label,
                };
            }
        });

        // Collect outputs
        const outputs: Record<string, string> = {};
        const errors: string[] = [];

        results.forEach((result) => {
            if (result.status === 'fulfilled') {
                outputs[result.branchId] = result.value.output;
            } else {
                errors.push(
                    `${result.label}: ${
                        result.reason instanceof Error
                            ? result.reason.message
                            : String(result.reason)
                    }`
                );
            }
        });

        // Format outputs for merge
        let formattedOutputs = Object.entries(outputs)
            .map(([id, out]) => {
                const branch = branches.find((b) => b.id === id);
                return `## ${branch?.label || id}\n${out}`;
            })
            .join('\n\n');

        if (errors.length > 0) {
            formattedOutputs += `\n\n## Errors\n${errors.join('\n')}`;
        }

        let output = formattedOutputs;

        // Merge if enabled and prompt provided
        if (mergeEnabled && data.prompt) {
            if (!provider) {
                throw new Error(
                    'Parallel node requires LLM provider for merging results'
                );
            }

            const mergeModel = data.model || DEFAULT_MODEL;
            const mergePrompt = data.prompt;

            const mergeMessages: ChatMessage[] = [
                { role: 'system', content: mergePrompt },
                {
                    role: 'user',
                    content: `Here are the outputs from parallel agents:\n\n${formattedOutputs}\n\nPlease merge/summarize these outputs according to your instructions.`,
                },
            ];

            // Notify merge branch start
            const mergeBranchId = '__merge__';
            const mergeBranchLabel = 'Merge';
            context.onBranchStart?.(mergeBranchId, mergeBranchLabel);

            let mergeContent = '';
            const result = await provider.chat(mergeModel, mergeMessages, {
                onToken: (token) => {
                    mergeContent += token;
                    // Stream to both the main output and the merge branch
                    context.onToken?.(token);
                    context.onBranchToken?.(
                        mergeBranchId,
                        mergeBranchLabel,
                        token
                    );
                },
            });

            // Notify merge branch complete
            context.onBranchComplete?.(
                mergeBranchId,
                mergeBranchLabel,
                result.content || mergeContent
            );

            if (context.tokenCounter && context.onTokenUsage) {
                let usage = estimateTokenUsage({
                    model: mergeModel,
                    messages: mergeMessages,
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
                }

                context.onTokenUsage(usage);
            }

            output = result.content || '';
        }

        // Determine next nodes
        let nextNodes: string[] = [];

        if (mergeEnabled) {
            // If merge enabled, route to 'merged' handle
            const mergeEdges = outgoingEdges.filter(
                (e) => e.sourceHandle === 'merged'
            );
            nextNodes = mergeEdges.map((e) => e.target);
        } else {
            // If merge disabled, route to branch handles (Splitter Mode)
            // Collect all targets, but deduplicate since multiple branches
            // may connect to the same node
            const targetSet = new Set<string>();
            branches.forEach((branch) => {
                const branchEdges = outgoingEdges.filter(
                    (e) => e.sourceHandle === branch.id
                );
                branchEdges.forEach((e) => targetSet.add(e.target));
            });
            nextNodes = [...targetSet];
        }

        return {
            output,
            nextNodes,
            metadata: {
                branchOutputs: outputs, // Branch outputs
            },
        };
    },

    /**
     * Validate the parallel node.
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[]
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as ParallelNodeData;
        const branches = data.branches || [];

        // Check for at least two branches (parallel needs multiple paths)
        if (branches.length < 2) {
            errors.push({
                type: 'warning',
                code: 'DEAD_END_NODE',
                message:
                    'Parallel node should have at least two branches for meaningful parallel execution',
                nodeId: node.id,
            });
        }

        // Check for incoming connections
        const incomingEdges = edges.filter((e) => e.target === node.id);
        if (incomingEdges.length === 0) {
            errors.push({
                type: 'error',
                code: 'DISCONNECTED_NODE',
                message: 'Parallel node has no incoming connections',
                nodeId: node.id,
            });
        }

        // Check outgoing connections based on merge mode
        const outgoingEdges = edges.filter((e) => e.source === node.id);
        const mergeEnabled = data.mergeEnabled !== false;

        if (mergeEnabled) {
            // When merge enabled, check for merged output connection
            const hasMergedEdge = outgoingEdges.some(
                (e) => e.sourceHandle === 'merged'
            );
            if (!hasMergedEdge) {
                errors.push({
                    type: 'warning',
                    code: 'DEAD_END_NODE',
                    message:
                        'Parallel node has no outgoing connection from merged output',
                    nodeId: node.id,
                });
            }
        } else {
            // When merge disabled, check each branch has an outgoing edge
            branches.forEach((branch: BranchDefinition) => {
                const hasEdge = outgoingEdges.some(
                    (e) => e.sourceHandle === branch.id
                );
                if (!hasEdge) {
                    errors.push({
                        type: 'warning',
                        code: 'MISSING_EDGE_LABEL',
                        message: `Branch "${branch.label}" has no connected node`,
                        nodeId: node.id,
                    });
                }
            });
        }

        // Warn if merge enabled but no merge prompt is configured
        if (mergeEnabled && !data.prompt?.trim()) {
            errors.push({
                type: 'warning',
                code: 'EMPTY_PROMPT',
                message:
                    'Parallel node has no merge prompt - outputs will be concatenated',
                nodeId: node.id,
            });
        }

        return errors;
    },

    /**
     * Get dynamic outputs based on merge configuration.
     */
    getDynamicOutputs(node: WorkflowNode): { id: string; label: string }[] {
        const data = node.data as ParallelNodeData;
        const mergeEnabled = data.mergeEnabled !== false;

        if (mergeEnabled) {
            return [{ id: 'merged', label: 'Merged Output' }];
        }

        const branches = data.branches || [];
        return branches.map((branch: BranchDefinition) => ({
            id: branch.id,
            label: branch.label,
        }));
    },
};
