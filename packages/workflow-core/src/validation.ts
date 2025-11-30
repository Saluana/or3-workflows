import { WorkflowNode, WorkflowEdge, isAgentNodeData } from './types';

import type {
    ValidationResult,
    ValidationError,
    ValidationWarning,
} from './types';

export type { ValidationResult, ValidationError, ValidationWarning };

/**
 * Build an adjacency list from nodes and edges.
 */
function buildAdjacencyList(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): Map<string, string[]> {
    const adjacencyList = new Map<string, string[]>();
    nodes.forEach((n) => adjacencyList.set(n.id, []));
    edges.forEach((e) => {
        adjacencyList.get(e.source)?.push(e.target);
    });
    return adjacencyList;
}

/**
 * Perform topological sort using Kahn's algorithm.
 * Returns { sorted, hasCycle, cycleNodes }.
 */
function topologicalSort(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): {
    sorted: string[];
    hasCycle: boolean;
    cycleNodes: string[];
} {
    const adjacencyList = buildAdjacencyList(nodes, edges);
    const inDegree = new Map<string, number>();

    // Initialize in-degrees
    nodes.forEach((n) => inDegree.set(n.id, 0));
    edges.forEach((e) => {
        inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });

    // Find all nodes with no incoming edges
    const queue: string[] = [];
    nodes.forEach((n) => {
        if (inDegree.get(n.id) === 0) {
            queue.push(n.id);
        }
    });

    const sorted: string[] = [];

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        sorted.push(nodeId);

        const neighbors = adjacencyList.get(nodeId) || [];
        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) || 0) - 1;
            inDegree.set(neighbor, newDegree);
            if (newDegree === 0) {
                queue.push(neighbor);
            }
        }
    }

    // If we didn't process all nodes, there's a cycle
    if (sorted.length !== nodes.length) {
        const cycleNodes = nodes
            .filter((n) => !sorted.includes(n.id))
            .map((n) => n.id);
        return { sorted, hasCycle: true, cycleNodes };
    }

    return { sorted, hasCycle: false, cycleNodes: [] };
}

/**
 * Find the actual cycle path for better error reporting.
 */
function findCyclePath(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    cycleNodes: string[]
): string[] {
    if (cycleNodes.length === 0) return [];

    const adjacencyList = buildAdjacencyList(nodes, edges);
    const cycleSet = new Set(cycleNodes);

    // DFS from the first cycle node to find the actual cycle
    const visited = new Set<string>();
    const path: string[] = [];

    const dfs = (nodeId: string): string[] | null => {
        if (path.includes(nodeId)) {
            // Found the cycle, extract it
            const cycleStart = path.indexOf(nodeId);
            return [...path.slice(cycleStart), nodeId];
        }

        if (visited.has(nodeId)) return null;
        if (!cycleSet.has(nodeId)) return null;

        visited.add(nodeId);
        path.push(nodeId);

        const neighbors = adjacencyList.get(nodeId) || [];
        for (const neighbor of neighbors) {
            if (cycleSet.has(neighbor)) {
                const result = dfs(neighbor);
                if (result) return result;
            }
        }

        path.pop();
        return null;
    };

    for (const nodeId of cycleNodes) {
        const cycle = dfs(nodeId);
        if (cycle) return cycle;
        visited.clear();
        path.length = 0;
    }

    return cycleNodes;
}

/**
 * Find connected components in the workflow graph (treating as undirected).
 */
function findConnectedComponents(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): string[][] {
    const adjacencyList = new Map<string, Set<string>>();

    // Build undirected graph
    nodes.forEach((n) => adjacencyList.set(n.id, new Set()));
    edges.forEach((e) => {
        adjacencyList.get(e.source)?.add(e.target);
        adjacencyList.get(e.target)?.add(e.source);
    });

    const visited = new Set<string>();
    const components: string[][] = [];

    const bfs = (startId: string): string[] => {
        const component: string[] = [];
        const queue = [startId];
        visited.add(startId);

        while (queue.length > 0) {
            const nodeId = queue.shift()!;
            component.push(nodeId);

            const neighbors = adjacencyList.get(nodeId) || new Set();
            for (const neighbor of neighbors) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }

        return component;
    };

    for (const node of nodes) {
        if (!visited.has(node.id)) {
            components.push(bfs(node.id));
        }
    }

    return components;
}

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

    // 2. Check Disconnected Nodes (Reachability from start)
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

    // 3. Cycle Detection using Topological Sort (Kahn's algorithm)
    const { hasCycle, cycleNodes } = topologicalSort(nodes, edges);
    if (hasCycle) {
        const cyclePath = findCyclePath(nodes, edges, cycleNodes);
        errors.push({
            type: 'error',
            code: 'CYCLE_DETECTED',
            message: `Workflow contains a cycle: ${cyclePath.join(' → ')}`,
            nodeId: cyclePath[0],
        });
    }

    // 4. Check for Disconnected Components (warning - not strictly an error)
    const components = findConnectedComponents(nodes, edges);
    if (components.length > 1) {
        // Find components without a start node
        const orphanedComponents = components.filter(
            (comp) => !comp.some((id) => startNodes.some((s) => s.id === id))
        );

        if (orphanedComponents.length > 0) {
            warnings.push({
                type: 'warning',
                code: 'DISCONNECTED_COMPONENTS',
                message: `Workflow has ${orphanedComponents.length} disconnected component(s) not connected to start`,
            });
        }
    }

    // 5. Node Specific Checks
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

        // Dead End Check - warn if a non-terminal node has no outgoing edges
        const outgoingEdges = edges.filter((e) => e.source === node.id);
        const isTerminalType = ['output'].includes(node.type);
        if (
            node.type !== 'start' &&
            outgoingEdges.length === 0 &&
            !isTerminalType
        ) {
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
