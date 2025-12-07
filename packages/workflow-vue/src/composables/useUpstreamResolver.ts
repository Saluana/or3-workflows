import { computed, ref, watch, onScopeDispose, Ref, ComputedRef } from 'vue';
import {
    WorkflowEditor,
    WorkflowNode,
    WorkflowEdge,
    ParallelNodeData,
} from '@or3/workflow-core';

export interface UpstreamSource {
    id: string;
    label: string;
    type: string;
    parallelParentId?: string;
    branchLabel?: string;
    executionIndex: number;
    lastOutput?: string;
}

export interface UpstreamGroup {
    type: 'single' | 'parallel';
    label?: string; // For parallel groups
    sources: UpstreamSource[];
}

/**
 * Composable to resolve upstream sources for an output node.
 * Handles parallel branch grouping and execution order.
 *
 * Subscribes to editor 'update' events to reactively update when
 * nodes or edges change.
 */
export function useUpstreamResolver(
    editor: Ref<WorkflowEditor | null> | ComputedRef<WorkflowEditor | null>,
    outputNodeId: Ref<string> | ComputedRef<string> | string
) {
    // Normalize outputNodeId to a ref-like getter
    const getNodeId = () =>
        typeof outputNodeId === 'string' ? outputNodeId : outputNodeId.value;

    // Trigger ref - incremented when editor emits 'update' to force recomputation
    const updateTrigger = ref(0);

    // Track unsubscribe function
    let unsubscribe: (() => void) | null = null;

    // Subscribe to editor updates
    const setupSubscription = (ed: WorkflowEditor | null) => {
        // Cleanup previous subscription
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }

        if (ed) {
            const on = (ed as { on?: WorkflowEditor['on'] }).on;
            if (typeof on === 'function') {
                const maybeUnsub = on.call(ed, 'update', () => {
                    updateTrigger.value++;
                });
                unsubscribe =
                    typeof maybeUnsub === 'function' ? maybeUnsub : null;
            }
        }
    };

    // Watch editor ref for changes (e.g., when editor is replaced)
    watch(
        () => editor.value,
        (newEditor) => {
            setupSubscription(newEditor);
            updateTrigger.value++; // Force recompute when editor changes
        },
        { immediate: true }
    );

    // Cleanup on scope dispose
    onScopeDispose(() => {
        if (unsubscribe) {
            unsubscribe();
            unsubscribe = null;
        }
    });

    return computed((): UpstreamGroup[] => {
        // Access trigger to create reactive dependency
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        updateTrigger.value;

        if (!editor.value) return [];

        const nodeId = getNodeId();
        if (!nodeId) return [];

        const nodes = editor.value.nodes;
        const edges = editor.value.edges;
        const outputNode = nodes.find((n) => n.id === nodeId);
        if (!outputNode) return [];

        // 1. Find all direct upstream edges
        const incomingEdges = edges.filter((e) => e.target === nodeId);

        // Sort incoming edges by vertical position of source node for deterministic order
        const sortedIncomingEdges = [...incomingEdges].sort((a, b) => {
            const nodeA = nodes.find((n) => n.id === a.source);
            const nodeB = nodes.find((n) => n.id === b.source);
            return (nodeA?.position.y || 0) - (nodeB?.position.y || 0);
        });

        // 2. Build sources from edges, handling Parallel Split branches specially
        const sources: UpstreamSource[] = [];

        for (let i = 0; i < sortedIncomingEdges.length; i++) {
            const edge = sortedIncomingEdges[i];
            const sourceNode = nodes.find((n) => n.id === edge.source);
            if (!sourceNode) continue;

            // Check if this is a Parallel Split node with individual branch handles
            const isParallelSplit =
                sourceNode.type === 'parallel' &&
                (sourceNode.data as ParallelNodeData).mergeEnabled === false;

            if (isParallelSplit && edge.sourceHandle) {
                // This is a direct connection from a Parallel Split branch
                const parallelData = sourceNode.data as ParallelNodeData;
                const branch = parallelData.branches?.find(
                    (b) => b.id === edge.sourceHandle
                );

                sources.push({
                    // Use composite ID to distinguish branches from same parallel node
                    id: `${sourceNode.id}:${edge.sourceHandle}`,
                    label: sourceNode.data.label || sourceNode.id,
                    type: 'parallel-branch',
                    parallelParentId: sourceNode.id,
                    branchLabel: branch?.label || edge.sourceHandle,
                    executionIndex: i,
                });
            } else {
                // Regular node or merged parallel output
                const parallelInfo = findParallelParent(
                    sourceNode,
                    nodes,
                    edges
                );

                sources.push({
                    id: sourceNode.id,
                    label: sourceNode.data.label || sourceNode.id,
                    type: sourceNode.type,
                    parallelParentId: parallelInfo?.parentId,
                    branchLabel: parallelInfo?.branchLabel,
                    executionIndex: i,
                });
            }
        }

        // 3. Group sources
        const groups: UpstreamGroup[] = [];
        const processedIds = new Set<string>();

        for (const source of sources) {
            if (processedIds.has(source.id)) continue;

            if (source.parallelParentId) {
                // Find all sources with same parallel parent
                const siblings = sources.filter(
                    (s) => s.parallelParentId === source.parallelParentId
                );

                // Get parent node and its branch order
                const parentNode = nodes.find(
                    (n) => n.id === source.parallelParentId
                );
                const parentLabel = parentNode?.data.label || 'Parallel Group';
                const branchOrder =
                    (parentNode?.data as ParallelNodeData)?.branches?.map(
                        (b) => b.id
                    ) || [];

                // Sort siblings by their branch order in the parallel node definition
                const sortedSiblings = [...siblings].sort((a, b) => {
                    // Extract branch ID from composite ID (nodeId:branchId)
                    const aBranchId = a.id.includes(':')
                        ? a.id.split(':')[1]
                        : a.id;
                    const bBranchId = b.id.includes(':')
                        ? b.id.split(':')[1]
                        : b.id;
                    const aIndex = branchOrder.indexOf(aBranchId);
                    const bIndex = branchOrder.indexOf(bBranchId);
                    // If not found in order, put at end
                    return (
                        (aIndex === -1 ? Infinity : aIndex) -
                        (bIndex === -1 ? Infinity : bIndex)
                    );
                });

                groups.push({
                    type: 'parallel',
                    label: parentLabel,
                    sources: sortedSiblings,
                });

                siblings.forEach((s) => processedIds.add(s.id));
            } else {
                groups.push({
                    type: 'single',
                    sources: [source],
                });
                processedIds.add(source.id);
            }
        }

        return groups;
    });
}

/**
 * Find the parallel node that initiated the branch containing the given node.
 */
function findParallelParent(
    node: WorkflowNode,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): { parentId: string; branchLabel: string } | null {
    // BFS backwards to find a parallel node
    const queue: string[] = [node.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const currentNode = nodes.find((n) => n.id === nodeId);
        if (!currentNode) continue;

        if (currentNode.type === 'parallel') {
            // Found a parallel node!
            // Check if the target node is reachable from one of its branches
            const outgoingEdges = edges.filter(
                (e) => e.source === currentNode.id
            );
            const data = currentNode.data as ParallelNodeData;

            for (const edge of outgoingEdges) {
                if (isReachable(edge.target, node.id, edges)) {
                    // Found the branch!
                    const branchId = edge.sourceHandle;
                    const branch = data.branches?.find(
                        (b) => b.id === branchId
                    );
                    return {
                        parentId: currentNode.id,
                        branchLabel:
                            branch?.label || branchId || 'Unknown Branch',
                    };
                }
            }
        }

        // Continue backwards
        const incomingEdges = edges.filter((e) => e.target === nodeId);
        for (const edge of incomingEdges) {
            queue.push(edge.source);
        }
    }

    return null;
}

/**
 * Check if targetId is reachable from startId (forward traversal).
 */
function isReachable(
    startId: string,
    targetId: string,
    edges: WorkflowEdge[]
): boolean {
    if (startId === targetId) return true;

    const queue = [startId];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        if (currentId === targetId) return true;

        const outgoing = edges.filter((e) => e.source === currentId);
        for (const edge of outgoing) {
            queue.push(edge.target);
        }
    }

    return false;
}
