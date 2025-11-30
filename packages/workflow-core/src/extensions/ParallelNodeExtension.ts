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

        if (!context.executeSubgraph) {
            throw new Error(
                'Parallel execution requires executeSubgraph capability in context'
            );
        }

        const outgoingEdges = context.getOutgoingEdges(node.id);

        // Map branches to start nodes
        const branchExecutions = branches
            .map((branch) => {
                const edge = outgoingEdges.find(
                    (e) => e.sourceHandle === branch.id
                );
                if (!edge) return null;

                const startNodeId = edge.target;

                // Apply overrides if configured
                const overrides: Record<string, any> = {};
                if (branch.model) overrides.model = branch.model;
                if (branch.prompt) overrides.prompt = branch.prompt;

                const nodeOverrides =
                    Object.keys(overrides).length > 0
                        ? { [startNodeId]: { data: overrides } }
                        : undefined;

                return {
                    branchId: branch.id,
                    label: branch.label,
                    promise: context.executeSubgraph!(
                        startNodeId,
                        context.input,
                        { nodeOverrides }
                    )
                        .then((result) => ({
                            status: 'fulfilled' as const,
                            value: result,
                            branchId: branch.id,
                            label: branch.label,
                        }))
                        .catch((error) => ({
                            status: 'rejected' as const,
                            reason: error,
                            branchId: branch.id,
                            label: branch.label,
                        })),
                };
            })
            .filter(Boolean);

        if (branchExecutions.length === 0) {
            return {
                output: 'No connected branches executed.',
                nextNodes: [], // Or route to 'merged' if present but nothing to merge?
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

        // Merge if prompt provided
        if (data.prompt) {
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

        // Determine next nodes (connected to 'merged' handle)
        const mergeEdges = outgoingEdges.filter(
            (e) => e.sourceHandle === 'merged'
        );

        return {
            output,
            nextNodes: mergeEdges.map((e) => e.target),
            metadata: {
                branchOutputs: outputs,
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
        if (!data.prompt || data.prompt.trim() === '') {
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
