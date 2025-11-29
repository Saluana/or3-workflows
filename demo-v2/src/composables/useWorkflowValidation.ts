// ============================================================================
// Types
// ============================================================================

interface ValidationError {
    type: 'error' | 'warning';
    nodeId?: string;
    message: string;
}

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
}

interface GraphNode {
    id: string;
    type: string;
    data: Record<string, unknown>;
}

interface GraphEdge {
    id: string;
    source: string;
    target: string;
}

// ============================================================================
// Validation
// ============================================================================

export function validateWorkflow(
    nodes: GraphNode[],
    edges: GraphEdge[]
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Check for start node
    const startNode = nodes.find((n) => n.type === 'start');
    if (!startNode) {
        errors.push({
            type: 'error',
            message: 'Workflow must have a Start node',
        });
    }

    // Build adjacency maps
    const outgoing: Record<string, string[]> = {};
    const incoming: Record<string, string[]> = {};

    for (const node of nodes) {
        outgoing[node.id] = [];
        incoming[node.id] = [];
    }

    for (const edge of edges) {
        outgoing[edge.source]?.push(edge.target);
        incoming[edge.target]?.push(edge.source);
    }

    // Check for disconnected nodes
    for (const node of nodes) {
        if (node.type === 'start') continue;

        const hasIncoming = (incoming[node.id]?.length || 0) > 0;
        const hasOutgoing = (outgoing[node.id]?.length || 0) > 0;

        const label =
            typeof node.data.label === 'string' ? node.data.label : node.id;

        if (!hasIncoming && !hasOutgoing) {
            errors.push({
                type: 'error',
                nodeId: node.id,
                message: `Node "${label}" is not connected to the workflow`,
            });
        } else if (!hasIncoming) {
            warnings.push({
                type: 'warning',
                nodeId: node.id,
                message: `Node "${label}" has no incoming connections`,
            });
        }
    }

    // Check agent nodes have prompts
    for (const node of nodes) {
        if (node.type === 'agent') {
            const prompt = node.data.prompt;
            const label =
                typeof node.data.label === 'string' ? node.data.label : node.id;
            if (
                !prompt ||
                (typeof prompt === 'string' && prompt.trim() === '')
            ) {
                warnings.push({
                    type: 'warning',
                    nodeId: node.id,
                    message: `Agent "${label}" has no system prompt configured`,
                });
            }
        }
    }

    // Check for cycles (basic detection)
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    function hasCycle(nodeId: string): boolean {
        if (recursionStack.has(nodeId)) return true;
        if (visited.has(nodeId)) return false;

        visited.add(nodeId);
        recursionStack.add(nodeId);

        for (const child of outgoing[nodeId] || []) {
            if (hasCycle(child)) return true;
        }

        recursionStack.delete(nodeId);
        return false;
    }

    if (startNode && hasCycle(startNode.id)) {
        warnings.push({
            type: 'warning',
            message:
                'Workflow contains a cycle, which may cause infinite loops',
        });
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}

export function useWorkflowValidation() {
    return {
        validateWorkflow,
    };
}
