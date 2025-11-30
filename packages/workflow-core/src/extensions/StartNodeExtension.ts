import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    ExecutionContext,
    ValidationError,
} from '../types';

/**
 * Start Node Extension
 *
 * The entry point for workflow execution. Every workflow must have exactly one start node.
 * It passes the user input through to connected nodes.
 */
export const StartNodeExtension: NodeExtension = {
    name: 'start',
    type: 'node',

    // Port definitions
    inputs: [],
    outputs: [
        {
            id: 'output',
            type: 'output',
            label: 'Output',
            dataType: 'any',
            multiple: true,
        },
    ],

    // Default data for new nodes
    defaultData: {
        label: 'Start',
    },

    /**
     * Execute the start node.
     * Simply passes through the input to connected nodes.
     */
    async execute(
        context: ExecutionContext,
        node: WorkflowNode
    ): Promise<{ output: string; nextNodes: string[] }> {
        // Start node just passes through the input
        // Don't filter by handle - start nodes typically connect to anything
        const outgoingEdges = context.getOutgoingEdges(node.id);
        return {
            output: context.input,
            nextNodes: outgoingEdges.map((e) => e.target),
        };
    },

    /**
     * Validate the start node.
     * Ensures only one start node exists in the workflow.
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[],
        allNodes?: WorkflowNode[]
    ): ValidationError[] {
        const errors: ValidationError[] = [];

        // Check if there are multiple start nodes (if allNodes provided)
        if (allNodes) {
            const startNodes = allNodes.filter((n) => n.type === 'start');
            if (startNodes.length > 1) {
                errors.push({
                    type: 'error',
                    code: 'MULTIPLE_START_NODES',
                    message: 'Workflow can only have one start node',
                    nodeId: node.id,
                });
            }
        }

        // Check if start node has at least one outgoing edge
        const outgoingEdges = edges.filter((e) => e.source === node.id);
        if (outgoingEdges.length === 0) {
            errors.push({
                type: 'error',
                code: 'DISCONNECTED_NODE',
                message:
                    'Start node must have at least one outgoing connection',
                nodeId: node.id,
            });
        }

        return errors;
    },
};
