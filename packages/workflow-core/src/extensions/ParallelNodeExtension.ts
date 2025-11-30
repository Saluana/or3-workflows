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

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/**
 * Parallel Node Extension
 *
 * Executes multiple branches concurrently and optionally merges the results.
 * Each branch can have its own model and prompt configuration.
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

        // Execute all branches internally using their model/prompt configs
        // Branches are internal LLM calls, not external node connections
        const branchExecutions = branches.map((branch) => {
            // Use branch-specific model/prompt or fall back to defaults
            const branchModel = branch.model || data.model || DEFAULT_MODEL;
            const branchPrompt =
                branch.prompt || 'You are a helpful assistant.';

            const messages: ChatMessage[] = [
                { role: 'system', content: branchPrompt },
                { role: 'user', content: context.input },
            ];

            return {
                branchId: branch.id,
                label: branch.label,
                promise: (async () => {
                    if (!provider) {
                        throw new Error('Parallel node requires LLM provider');
                    }
                    const result = await provider.chat(
                        branchModel,
                        messages,
                        {}
                    );
                    return {
                        status: 'fulfilled' as const,
                        value: { output: result.content || '' },
                        branchId: branch.id,
                        label: branch.label,
                    };
                })().catch((error) => ({
                    status: 'rejected' as const,
                    reason: error,
                    branchId: branch.id,
                    label: branch.label,
                })),
            };
        });

        if (branchExecutions.length === 0) {
            return {
                output: 'No branches configured.',
                nextNodes: [],
            };
        }

        // Execute all branches
        const results = await Promise.all(
            branchExecutions.map((b) => b!.promise)
        );

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

            const result = await provider.chat(mergeModel, mergeMessages, {
                onToken: context.onToken,
            });

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
            // We use the same handles as the branch starts
            branches.forEach((branch) => {
                const branchEdges = outgoingEdges.filter(
                    (e) => e.sourceHandle === branch.id
                );
                nextNodes.push(...branchEdges.map((e) => e.target));
            });
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

        // Check that each branch has an outgoing edge
        const outgoingEdges = edges.filter((e) => e.source === node.id);
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

        // Warn if no merge prompt is configured
        if (!data.prompt?.trim()) {
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
     * Get dynamic outputs based on branches configuration.
     */
    getDynamicOutputs(node: WorkflowNode): { id: string; label: string }[] {
        const data = node.data as ParallelNodeData;
        const branches = data.branches || [];

        return branches.map((branch: BranchDefinition) => ({
            id: branch.id,
            label: branch.label,
        }));
    },
};
