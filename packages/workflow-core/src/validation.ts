import { WorkflowNode, WorkflowEdge, isAgentNodeData } from './types';

export interface ValidationResult {
    isValid: boolean;
    errors: ValidationError[];
    warnings: ValidationWarning[];
}

export interface ValidationError {
    type: 'error';
    code: ValidationErrorCode;
    message: string;
    nodeId?: string;
    edgeId?: string;
}

export interface ValidationWarning {
    type: 'warning';
    code: ValidationWarningCode;
    message: string;
    nodeId?: string;
    edgeId?: string;
}

export type ValidationErrorCode =
    | 'NO_START_NODE'
    | 'MULTIPLE_START_NODES'
    | 'DISCONNECTED_NODE'
    | 'CYCLE_DETECTED'
    | 'MISSING_REQUIRED_PORT'
    | 'INVALID_CONNECTION'
    | 'MISSING_MODEL'
    | 'MISSING_PROMPT'
    | 'MISSING_SUBFLOW_ID'
    | 'SUBFLOW_NOT_FOUND'
    | 'MISSING_INPUT_MAPPING'
    | 'MISSING_OPERATION'
    | 'INVALID_LIMIT'
    | 'MISSING_CONDITION_PROMPT'
    | 'INVALID_MAX_ITERATIONS'
    | 'MISSING_BODY'
    | 'MISSING_EXIT';

export type ValidationWarningCode =
    | 'EMPTY_PROMPT'
    | 'UNREACHABLE_NODE'
    | 'DEAD_END_NODE'
    | 'MISSING_EDGE_LABEL'
    | 'NO_SUBFLOW_OUTPUTS'
    | 'NO_REGISTRY'
    | 'NO_INPUT'
    | 'NO_OUTPUT'
    | 'MISSING_BODY'
    | 'MISSING_EXIT';

export function validateWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // 1. Check Start Node
    const startNodes = nodes.filter((n) => n.type === 'start');
    if (startNodes.length === 0) {
        errors.push({
            type: 'error',
            code: 'NO_START_NODE',
            message: 'Workflow must have a start node',
        });
    } else if (startNodes.length > 1) {
        errors.push({
            type: 'error',
            code: 'MULTIPLE_START_NODES',
            message: 'Workflow can only have one start node',
        });
    }

    // 2. Check Disconnected Nodes (Reachability)
    if (startNodes.length === 1) {
        const visited = new Set<string>();
        const queue = [startNodes[0].id];
        visited.add(startNodes[0].id);

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            const outgoingEdges = edges.filter((e) => e.source === currentId);
            for (const edge of outgoingEdges) {
                if (!visited.has(edge.target)) {
                    visited.add(edge.target);
                    queue.push(edge.target);
                }
            }
        }

        nodes.forEach((node) => {
            if (!visited.has(node.id)) {
                errors.push({
                    type: 'error',
                    code: 'DISCONNECTED_NODE',
                    message: 'Node is not reachable from start',
                    nodeId: node.id,
                });
            }
        });
    }

    // 3. Cycle Detection using DFS
    const detectCycles = (): string[] => {
        const adjacencyList = new Map<string, string[]>();
        nodes.forEach((n) => adjacencyList.set(n.id, []));
        edges.forEach((e) => {
            adjacencyList.get(e.source)?.push(e.target);
        });

        const WHITE = 0; // Unvisited
        const GRAY = 1; // In current path
        const BLACK = 2; // Fully processed
        const color = new Map<string, number>();
        nodes.forEach((n) => color.set(n.id, WHITE));

        const cycleNodes: string[] = [];

        const dfs = (nodeId: string): boolean => {
            color.set(nodeId, GRAY);
            const neighbors = adjacencyList.get(nodeId) || [];

            for (const neighbor of neighbors) {
                if (color.get(neighbor) === GRAY) {
                    // Back edge found - cycle detected
                    cycleNodes.push(nodeId);
                    return true;
                }
                if (color.get(neighbor) === WHITE && dfs(neighbor)) {
                    cycleNodes.push(nodeId);
                    return true;
                }
            }

            color.set(nodeId, BLACK);
            return false;
        };

        for (const node of nodes) {
            if (color.get(node.id) === WHITE) {
                dfs(node.id);
            }
        }

        return cycleNodes;
    };

    const cycleNodes = detectCycles();
    if (cycleNodes.length > 0) {
        errors.push({
            type: 'error',
            code: 'CYCLE_DETECTED',
            message: `Workflow contains a cycle involving node(s): ${cycleNodes.join(
                ', '
            )}`,
            nodeId: cycleNodes[0],
        });
    }

    // 4. Node Specific Checks
    nodes.forEach((node) => {
        // Agent Node Checks
        if (node.type === 'agent' && isAgentNodeData(node.data)) {
            if (!node.data.model) {
                errors.push({
                    type: 'error',
                    code: 'MISSING_MODEL',
                    message: 'Agent node missing model',
                    nodeId: node.id,
                });
            }
            if (!node.data.prompt) {
                warnings.push({
                    type: 'warning',
                    code: 'EMPTY_PROMPT',
                    message: 'Agent node has empty prompt',
                    nodeId: node.id,
                });
            }
        }

        // Dead End Check - warn if a node has no outgoing edges (excluding start)
        const outgoingEdges = edges.filter((e) => e.source === node.id);
        if (node.type !== 'start' && outgoingEdges.length === 0) {
            warnings.push({
                type: 'warning',
                code: 'DEAD_END_NODE',
                message: 'Node has no outgoing connections',
                nodeId: node.id,
            });
        }
    });

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}
