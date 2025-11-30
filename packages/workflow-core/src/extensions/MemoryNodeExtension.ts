import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    ExecutionContext,
    MemoryNodeData,
    ValidationError,
    ValidationWarning
} from '../types';
import type { MemoryEntry } from '../memory';

/**
 * Memory Node Extension
 *
 * Provides query/store operations against the configured MemoryAdapter.
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
        context: ExecutionContext,
        node: WorkflowNode
    ): Promise<{ output: string; nextNodes: string[] }> {
        const data = node.data as MemoryNodeData;
        const operation = data.operation || 'query';
        const content = data.text ?? context.input; // Use input if text not specified

        if (operation === 'store') {
            const source =
                (data.metadata?.['source'] as MemoryEntry['metadata']['source']) ||
                'agent';
                
            const entry: MemoryEntry = {
                id:
                    typeof crypto !== 'undefined' &&
                    typeof crypto.randomUUID === 'function'
                        ? crypto.randomUUID()
                        : `mem-${Date.now()}`,
                content,
                metadata: {
                    timestamp: new Date().toISOString(),
                    source,
                    nodeId: node.id,
                    sessionId: context.sessionId,
                    ...data.metadata,
                },
            };

            await context.memory.store(entry);
            
            // Return the stored content as output
            const outgoingEdges = context.getOutgoingEdges(node.id, 'output');
            return {
                output: content,
                nextNodes: outgoingEdges.map(e => e.target),
            };
        }

        // Query operation
        const results = await context.memory.query({
            text: data.text || context.input,
            limit: data.limit,
            filter: data.filter as Record<string, unknown>,
            sessionId: context.sessionId,
        });

        let output = '';
        if (!results.length) {
            output = data.fallback || 'No memories found.';
        } else {
            output = results
                .map((r) => {
                    const time = r.metadata.timestamp
                        ? `[${r.metadata.timestamp}] `
                        : '';
                    const label = r.metadata.nodeId
                        ? `[${r.metadata.nodeId}] `
                        : '';
                    return `${time}${label}${r.content}`;
                })
                .join('\n');
        }
        
        const outgoingEdges = context.getOutgoingEdges(node.id, 'output');
        return {
            output,
            nextNodes: outgoingEdges.map(e => e.target),
        };
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
