import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    ExecutionContext,
    MemoryNodeData,
} from '../types';
import type { ValidationError, ValidationWarning } from '../validation';

/**
 * Memory Node Extension
 *
 * Provides query/store operations against the configured MemoryAdapter.
 * Execution is handled by the OpenRouterExecutionAdapter.
 */
export const MemoryNodeExtension: NodeExtension = {
    name: 'memory',
    type: 'node',

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
        },
    ],

    defaultData: {
        label: 'Memory',
        operation: 'query',
        limit: 5,
        fallback: 'No memories found.',
    },

    async execute(
        _context: ExecutionContext
    ): Promise<{ output: string; nextNodes: string[] }> {
        throw new Error(
            'MemoryNodeExtension.execute is handled by the execution adapter. ' +
                'Use OpenRouterExecutionAdapter to run workflows.'
        );
    },

    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[]
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as MemoryNodeData;

        if (!data.operation) {
            errors.push({
                type: 'error',
                code: 'MISSING_OPERATION',
                message: 'Memory node requires an operation (query/store)',
                nodeId: node.id,
            });
        }

        if (
            data.operation === 'query' &&
            data.limit !== undefined &&
            data.limit <= 0
        ) {
            errors.push({
                type: 'error',
                code: 'INVALID_LIMIT',
                message: 'Query limit must be greater than zero',
                nodeId: node.id,
            });
        }

        const incoming = edges.filter((e) => e.target === node.id);
        if (incoming.length === 0) {
            errors.push({
                type: 'error',
                code: 'DISCONNECTED_NODE',
                message: 'Memory node has no incoming connections',
                nodeId: node.id,
            });
        }

        return errors;
    },
};
