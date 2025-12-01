import {
    WorkflowNode,
    WorkflowEdge,
    type ValidationResult,
    type ValidationError,
    type ValidationWarning,
    type ValidationContext,
    type NodeExtension,
} from './types';
import { extensionRegistry } from './execution';

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

/**
 * Get dynamic output ports for a node (e.g., router routes become output ports).
 */
function getDynamicOutputPorts(
    node: WorkflowNode,
    extension: NodeExtension | undefined
): string[] {
    const ports: string[] = [];

    // Add static output ports from extension
    if (extension) {
        for (const output of extension.outputs) {
            ports.push(output.id);
        }
    }

    // Add dynamic ports based on node type
    if (node.type === 'router') {
        const routes = (node.data as { routes?: Array<{ id: string }> }).routes;
        if (routes) {
            for (const route of routes) {
                ports.push(route.id);
            }
        }
    }

    if (node.type === 'parallel') {
        const branches = (node.data as { branches?: Array<{ id: string }> })
            .branches;
        if (branches) {
            for (const branch of branches) {
                ports.push(branch.id);
            }
        }
    }

    // Always allow 'error' handle for error branching
    ports.push('error');

    return ports;
}

/**
 * Get dynamic input ports for a node.
 */
function getDynamicInputPorts(
    node: WorkflowNode,
    extension: NodeExtension | undefined
): string[] {
    const ports: string[] = [];

    // Add static input ports from extension
    if (extension) {
        for (const input of extension.inputs) {
            ports.push(input.id);
        }
    }

    // WhileLoop has dynamic body/exit handles
    if (node.type === 'whileLoop') {
        ports.push('body', 'exit');
    }

    return ports;
}

/**
 * Validate edge handles against node port definitions.
 */
function validateEdgeHandles(
    edges: WorkflowEdge[],
    nodeMap: Map<string, WorkflowNode>,
    registry: Map<string, NodeExtension>
): (ValidationError | ValidationWarning)[] {
    const results: (ValidationError | ValidationWarning)[] = [];

    for (const edge of edges) {
        const sourceNode = nodeMap.get(edge.source);
        const targetNode = nodeMap.get(edge.target);

        // Check for dangling edges
        if (!sourceNode) {
            results.push({
                type: 'error',
                code: 'DANGLING_EDGE',
                message: `Edge "${edge.id}" references non-existent source node "${edge.source}"`,
                edgeId: edge.id,
            });
            continue;
        }

        if (!targetNode) {
            results.push({
                type: 'error',
                code: 'DANGLING_EDGE',
                message: `Edge "${edge.id}" references non-existent target node "${edge.target}"`,
                edgeId: edge.id,
            });
            continue;
        }

        // Validate sourceHandle if specified
        if (edge.sourceHandle) {
            const sourceExtension = registry.get(sourceNode.type);
            const validOutputs = getDynamicOutputPorts(
                sourceNode,
                sourceExtension
            );

            if (!validOutputs.includes(edge.sourceHandle)) {
                results.push({
                    type: 'error',
                    code: 'UNKNOWN_HANDLE',
                    message: `Edge "${edge.id}" references unknown output handle "${edge.sourceHandle}" on ${sourceNode.type} node "${sourceNode.id}"`,
                    edgeId: edge.id,
                    nodeId: sourceNode.id,
                });
            }
        }

        // Validate targetHandle if specified
        if (edge.targetHandle) {
            const targetExtension = registry.get(targetNode.type);
            const validInputs = getDynamicInputPorts(
                targetNode,
                targetExtension
            );

            if (!validInputs.includes(edge.targetHandle)) {
                results.push({
                    type: 'error',
                    code: 'UNKNOWN_HANDLE',
                    message: `Edge "${edge.id}" references unknown input handle "${edge.targetHandle}" on ${targetNode.type} node "${targetNode.id}"`,
                    edgeId: edge.id,
                    nodeId: targetNode.id,
                });
            }
        }
    }

    return results;
}

/**
 * Check for required input ports without connections.
 */
function validateRequiredPorts(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    registry: Map<string, NodeExtension>
): (ValidationError | ValidationWarning)[] {
    const results: (ValidationError | ValidationWarning)[] = [];

    // Build map of target node -> incoming edges by handle
    const incomingByHandle = new Map<
        string,
        Map<string | undefined, WorkflowEdge[]>
    >();
    for (const edge of edges) {
        if (!incomingByHandle.has(edge.target)) {
            incomingByHandle.set(edge.target, new Map());
        }
        const handleMap = incomingByHandle.get(edge.target)!;
        const handle = edge.targetHandle ?? undefined;
        if (!handleMap.has(handle)) {
            handleMap.set(handle, []);
        }
        handleMap.get(handle)!.push(edge);
    }

    for (const node of nodes) {
        if (node.type === 'start') continue; // Start node has no inputs

        const extension = registry.get(node.type);
        if (!extension) continue;

        const handleMap = incomingByHandle.get(node.id) ?? new Map();

        for (const input of extension.inputs) {
            if (input.required) {
                // Check if there's at least one edge to this input
                const edgesToInput = handleMap.get(input.id) ?? [];
                const edgesToDefault = handleMap.get(undefined) ?? [];

                if (edgesToInput.length === 0 && edgesToDefault.length === 0) {
                    results.push({
                        type: 'error',
                        code: 'MISSING_REQUIRED_PORT',
                        message: `Node "${node.id}" (${
                            node.type
                        }) requires input "${
                            input.label || input.id
                        }" but has no connection`,
                        nodeId: node.id,
                    });
                }
            }
        }
    }

    return results;
}

/**
 * Validate a workflow graph for structural and node-level issues.
 *
 * @param nodes - All nodes in the workflow
 * @param edges - All edges connecting nodes
 * @param context - Optional validation context with registries for deep validation
 * @returns ValidationResult with errors and warnings
 */
export function validateWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[],
    context?: ValidationContext
): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Use provided registry or default
    const registry = context?.extensionRegistry ?? extensionRegistry;

    // Build node map for lookups
    const nodeMap = new Map<string, WorkflowNode>();
    for (const node of nodes) {
        nodeMap.set(node.id, node);
    }

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

    // 5. Edge/Handle Validation
    const handleResults = validateEdgeHandles(edges, nodeMap, registry);
    for (const result of handleResults) {
        if (result.type === 'error') {
            errors.push(result);
        } else {
            warnings.push(result);
        }
    }

    // 6. Required Port Validation
    const portResults = validateRequiredPorts(nodes, edges, registry);
    for (const result of portResults) {
        if (result.type === 'error') {
            errors.push(result);
        } else {
            warnings.push(result);
        }
    }

    // 7. Extension-level Node Validation
    for (const node of nodes) {
        const extension = registry.get(node.type);
        if (extension?.validate) {
            try {
                const nodeResults = extension.validate(node, edges, context);

                for (const result of nodeResults) {
                    if (result.type === 'error') {
                        errors.push(result);
                    } else {
                        warnings.push(result);
                    }
                }
            } catch (err) {
                // Extension validator threw - treat as error
                errors.push({
                    type: 'error',
                    code: 'INVALID_CONNECTION',
                    message: `Validation failed for ${node.type} node "${
                        node.id
                    }": ${err instanceof Error ? err.message : String(err)}`,
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
    }

    return {
        isValid: errors.length === 0,
        errors,
        warnings,
    };
}
