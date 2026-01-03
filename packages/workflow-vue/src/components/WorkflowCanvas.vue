<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import {
    VueFlow,
    useVueFlow,
    Node,
    Edge,
    Connection,
    NodeMouseEvent,
    EdgeMouseEvent,
    type SelectionMode,
    type GraphNode,
    type GraphEdge,
} from '@vue-flow/core';
import type { KeyFilter } from '@vueuse/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { WorkflowEditor } from '@or3/workflow-core';
import StartNode from './nodes/StartNode.vue';
import AgentNode from './nodes/AgentNode.vue';
import RouterNode from './nodes/RouterNode.vue';
import ParallelNode from './nodes/ParallelNode.vue';
import WhileLoopNode from './nodes/WhileLoopNode.vue';
import SubflowNode from './nodes/SubflowNode.vue';
import OutputNode from './nodes/OutputNode.vue';

const props = defineProps<{
    editor: WorkflowEditor;
    nodeStatuses?: Record<string, 'idle' | 'active' | 'completed' | 'error'>;
    panOnDrag?: boolean | number[];
    selectionKeyCode?: KeyFilter | boolean | null;
    selectionMode?: SelectionMode;
    canvasId?: string;
}>();

type CreateNodeData = Parameters<WorkflowEditor['commands']['createNode']>[1];

const emit = defineEmits<{
    (e: 'nodeClick', node: Node): void;
    (e: 'edgeClick', edge: Edge): void;
    (e: 'paneClick'): void;
    (e: 'drop', event: DragEvent): void;
}>();

const {
    onConnect,
    onNodeDragStop,
    screenToFlowCoordinate,
    fitView,
    nodes: vueFlowNodes,
    edges: vueFlowEdges,
    panOnDrag: panOnDragState,
    selectionKeyCode: selectionKeyCodeState,
    selectionMode: selectionModeState,
} = useVueFlow();

const initialPanOnDrag = panOnDragState.value;
const initialSelectionKeyCode = selectionKeyCodeState.value;
const initialSelectionMode = selectionModeState.value;

watch(
    () => props.panOnDrag,
    (value) => {
        panOnDragState.value = value ?? initialPanOnDrag;
    },
    { immediate: true }
);

watch(
    () => props.selectionKeyCode,
    (value) => {
        selectionKeyCodeState.value = value ?? initialSelectionKeyCode;
    },
    { immediate: true }
);

watch(
    () => props.selectionMode,
    (value) => {
        selectionModeState.value = value ?? initialSelectionMode;
    },
    { immediate: true }
);

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);
const canUseEditor = () => !props.editor.isDestroyed();

// Cache for comparing changes using version-based fingerprints
// This is O(1) per node/edge instead of O(n) with JSON.stringify
let lastNodeMap = new Map<string, string>();
let lastEdgeMap = new Map<string, string>();
let lastGlobalVersion = -1;

/**
 * Create a fingerprint of a node for comparison.
 * Uses version counter from editor for O(1) comparison instead of JSON.stringify.
 * The fingerprint includes: version (captures all data changes) + status (from props)
 */
const getNodeFingerprint = (nodeId: string, status: string): string => {
    const version = props.editor.getNodeVersion(nodeId);
    return `${version}:${status}`;
};

/**
 * Create a fingerprint of an edge for comparison.
 * Uses version counter from editor for O(1) comparison instead of JSON.stringify.
 * The fingerprint includes: version (captures all data changes) + animated state
 */
const getEdgeFingerprint = (edgeId: string, animated: boolean): string => {
    const version = props.editor.getEdgeVersion(edgeId);
    return `${version}:${animated}`;
};

/**
 * Sync from editor using diffing to minimize re-renders.
 * Uses version-based comparison for O(1) per-node/edge change detection.
 * Only updates nodes/edges that have actually changed.
 */
const syncFromEditor = () => {
    const editorNodes = props.editor.getNodes();
    const editorEdges = props.editor.getEdges();
    const currentGlobalVersion = props.editor.getGlobalVersion();

    // Quick check: if global version hasn't changed and no status changes, skip entirely
    // This is the fast path for most renders
    if (lastGlobalVersion === currentGlobalVersion && !props.nodeStatuses) {
        return;
    }

    const newNodeMap = new Map<string, string>();
    const newEdgeMap = new Map<string, string>();

    // Check which nodes have changed
    let nodesChanged = false;
    const currentNodeIds = new Set(nodes.value.map((n) => n.id));
    const editorNodeIds = new Set(editorNodes.map((n) => n.id));

    // Check for added/removed nodes
    if (currentNodeIds.size !== editorNodeIds.size) {
        nodesChanged = true;
    } else {
        for (const id of editorNodeIds) {
            if (!currentNodeIds.has(id)) {
                nodesChanged = true;
                break;
            }
        }
    }

    // Check for changed nodes using version-based fingerprints (O(1) per node)
    if (!nodesChanged) {
        for (const n of editorNodes) {
            const status = props.nodeStatuses?.[n.id] || 'idle';
            const fingerprint = getNodeFingerprint(n.id, status);
            newNodeMap.set(n.id, fingerprint);

            if (lastNodeMap.get(n.id) !== fingerprint) {
                nodesChanged = true;
            }
        }
    }

    // Only update nodes if something changed
    if (nodesChanged) {
        nodes.value = editorNodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: {
                ...n.data,
                status: props.nodeStatuses?.[n.id] || 'idle',
            },
            selected: n.selected,
        }));

        // Update cache
        lastNodeMap = new Map();
        for (const n of editorNodes) {
            const status = props.nodeStatuses?.[n.id] || 'idle';
            lastNodeMap.set(n.id, getNodeFingerprint(n.id, status));
        }
    }

    // Check which edges have changed
    let edgesChanged = false;
    const currentEdgeIds = new Set(edges.value.map((e) => e.id));
    const editorEdgeIds = new Set(editorEdges.map((e) => e.id));

    // Check for added/removed edges
    if (currentEdgeIds.size !== editorEdgeIds.size) {
        edgesChanged = true;
    } else {
        for (const id of editorEdgeIds) {
            if (!currentEdgeIds.has(id)) {
                edgesChanged = true;
                break;
            }
        }
    }

    // Check for changed edges using version-based fingerprints (O(1) per edge)
    if (!edgesChanged) {
        for (const e of editorEdges) {
            const animated =
                props.nodeStatuses?.[e.source] === 'active' ||
                props.nodeStatuses?.[e.target] === 'active';
            const fingerprint = getEdgeFingerprint(e.id, animated);
            newEdgeMap.set(e.id, fingerprint);

            if (lastEdgeMap.get(e.id) !== fingerprint) {
                edgesChanged = true;
            }
        }
    }

    // Only update edges if something changed
    if (edgesChanged) {
        edges.value = editorEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            label: e.label,
            data: e.data,
            animated:
                props.nodeStatuses?.[e.source] === 'active' ||
                props.nodeStatuses?.[e.target] === 'active',
        }));

        // Update cache
        lastEdgeMap = new Map();
        for (const e of editorEdges) {
            const animated =
                props.nodeStatuses?.[e.source] === 'active' ||
                props.nodeStatuses?.[e.target] === 'active';
            lastEdgeMap.set(e.id, getEdgeFingerprint(e.id, animated));
        }
    }

    // Update global version cache
    lastGlobalVersion = currentGlobalVersion;
};

// Watch for nodeStatuses changes to update node visuals during execution
watch(
    () => props.nodeStatuses,
    () => {
        syncFromEditor();
    },
    { deep: true }
);

let unsubUpdate: (() => void) | null = null;
let unsubSelection: (() => void) | null = null;

onMounted(() => {
    if (!canUseEditor()) return;
    syncFromEditor();
    unsubUpdate = props.editor.on('update', syncFromEditor);
    unsubSelection = props.editor.on('selectionUpdate', syncFromEditor);

    // Fit view after initial render
    setTimeout(() => fitView({ padding: 0.2 }), 100);
});

onUnmounted(() => {
    unsubUpdate?.();
    unsubSelection?.();
});

// Handle connections
onConnect((params: Connection) => {
    if (!canUseEditor()) return;
    props.editor.commands.createEdge(
        params.source,
        params.target,
        params.sourceHandle ?? undefined,
        params.targetHandle ?? undefined
    );
});

// Handle node drag - update ALL selected nodes, not just the primary one
onNodeDragStop(() => {
    if (!canUseEditor()) return;
    
    // Use Vue Flow's nodes ref to get the actual current positions.
    // The local nodes ref synced from editor may not have the updated positions
    // from the drag operation - Vue Flow updates its internal state during drag.
    const selectedNodes = vueFlowNodes.value.filter((n: GraphNode) => n.selected);
    
    for (const node of selectedNodes) {
        props.editor.commands.setNodePosition(node.id, node.position);
    }
});

// Handle node click
const onNodeClick = (event: NodeMouseEvent) => {
    if (!canUseEditor()) return;
    props.editor.commands.selectNode(event.node.id);
    emit('nodeClick', event.node);
};

// Handle edge click
const onEdgeClick = (event: EdgeMouseEvent) => {
    if (canUseEditor()) {
        props.editor.commands.deselectAll();
    }
    emit('edgeClick', event.edge);
};

// Handle pane click (deselect)
const onPaneClick = () => {
    if (!canUseEditor()) return;
    props.editor.commands.deselectAll();
    emit('paneClick');
};

// Handle drop from palette
const onDrop = (event: DragEvent) => {
    if (!canUseEditor()) return;
    const nodeType = event.dataTransfer?.getData('application/vueflow');
    const nodeDataStr = event.dataTransfer?.getData('application/json');

    if (!nodeType || !nodeDataStr) return;

    let parsed: unknown;
    try {
        parsed = JSON.parse(nodeDataStr);
    } catch {
        return;
    }

    // Validate incoming data has required label field
    if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('label' in parsed) ||
        typeof (parsed as Record<string, unknown>).label !== 'string'
    ) {
        return;
    }
    const nodeData = parsed as { label: string } & Record<string, unknown>;

    const position = screenToFlowCoordinate({
        x: event.clientX,
        y: event.clientY,
    });

    props.editor.commands.createNode(nodeType, nodeData, position);
    emit('drop', event);
};

const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'move';
    }
};

const onCanvasPointerDown = (event: MouseEvent) => {
    (event.currentTarget as HTMLElement | null)?.focus();
};

// Handle mobile touch drop
const onMobileNodeDrop = (event: Event) => {
    if (!canUseEditor()) return;
    const customEvent = event as CustomEvent<{
        nodeType: string;
        defaultData: CreateNodeData;
        x: number;
        y: number;
    }>;

    const { nodeType, defaultData, x, y } = customEvent.detail;
    
    const position = screenToFlowCoordinate({ x, y });
    props.editor.commands.createNode(nodeType, defaultData, position);
};

const getCanvasElement = () => {
    const selector = props.canvasId
        ? `[data-workflow-canvas="${props.canvasId}"] .vue-flow`
        : '.vue-flow';
    return document.querySelector(selector) as HTMLElement | null;
};

// Setup mobile drop listener
onMounted(() => {
    const canvas = getCanvasElement();
    if (canvas) {
        canvas.addEventListener(
            'mobileNodeDrop',
            onMobileNodeDrop as EventListener
        );
    }
});

onUnmounted(() => {
    const canvas = getCanvasElement();
    if (canvas) {
        canvas.removeEventListener(
            'mobileNodeDrop',
            onMobileNodeDrop as EventListener
        );
    }
});

// Handle keyboard shortcuts
const onKeyDown = (event: KeyboardEvent) => {
    if (!canUseEditor()) return;
    // Ignore if in input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    // Delete selected
    if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        // Use Vue Flow's refs for selection state
        const selectedEdgeIds = vueFlowEdges.value
            .filter((edge: GraphEdge) => edge.selected)
            .map((edge: GraphEdge) => edge.id);
        const selectedNodeIds = vueFlowNodes.value
            .filter((node: GraphNode) => node.selected)
            .map((node: GraphNode) => node.id);

        if (selectedEdgeIds.length) {
            selectedEdgeIds.forEach((id) =>
                props.editor.commands.deleteEdge(id)
            );
            return;
        }

        selectedNodeIds.forEach((id) => props.editor.commands.deleteNode(id));
    }

    // Undo: Ctrl/Cmd + Z
    if (
        (event.metaKey || event.ctrlKey) &&
        event.key === 'z' &&
        !event.shiftKey
    ) {
        event.preventDefault();
        props.editor.commands.undo();
    }

    // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
    if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'y' || (event.key === 'z' && event.shiftKey))
    ) {
        event.preventDefault();
        props.editor.commands.redo();
    }

    // Duplicate: Ctrl/Cmd + D
    if ((event.metaKey || event.ctrlKey) && event.key === 'd') {
        event.preventDefault();
        props.editor
            .getSelected()
            .nodes.forEach((id) => props.editor.commands.duplicateNode(id));
    }
};

// Expose fitView for parent
defineExpose({
    fitView: () => fitView({ padding: 0.2 }),
});
</script>

<template>
    <div
        :class="[
            'workflow-canvas',
            { 'workflow-canvas-select': selectionKeyCode === true },
        ]"
        :data-workflow-canvas="canvasId || undefined"
        @drop="onDrop"
        @dragover="onDragOver"
        @keydown="onKeyDown"
        @mousedown="onCanvasPointerDown"
        tabindex="0"
    >
        <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            :default-viewport="{ x: 50, y: 50, zoom: 1 }"
            :min-zoom="0.5"
            :max-zoom="2"
            fit-view-on-init
            :pan-on-drag="panOnDrag"
            :selection-key-code="selectionKeyCode"
            :selection-mode="selectionMode"
            @node-click="onNodeClick"
            @edge-click="onEdgeClick"
            @pane-click="onPaneClick"
        >
            <Background
                :gap="20"
                :size="1"
                pattern-color="rgba(255, 255, 255, 0.03)"
            />
            <Controls position="bottom-left" />

            <template #node-start="nodeProps">
                <StartNode
                    :id="nodeProps.id"
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>

            <template #node-agent="nodeProps">
                <AgentNode
                    :id="nodeProps.id"
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>

            <template #node-router="nodeProps">
                <RouterNode
                    :id="nodeProps.id"
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>

            <template #node-parallel="nodeProps">
                <ParallelNode
                    :id="nodeProps.id"
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>

            <template #node-whileLoop="nodeProps">
                <WhileLoopNode
                    :id="nodeProps.id"
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>

            <template #node-subflow="nodeProps">
                <SubflowNode
                    :id="nodeProps.id"
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>

            <template #node-output="nodeProps">
                <OutputNode
                    :id="nodeProps.id"
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>

            <!-- Edge labels -->
            <template #edge-label="{ label }">
                <div v-if="label" class="edge-label">{{ label }}</div>
            </template>
        </VueFlow>
    </div>
</template>

<style scoped>
.workflow-canvas {
    width: 100%;
    height: 100%;
    background: var(--or3-color-bg-primary, #0a0a0f);
    outline: none;
    /* Prevent browser handling of touch gestures - canvas handles its own pan/zoom */
    touch-action: none;
}

.edge-label {
    background: var(--or3-color-bg-elevated, #22222e);
    padding: 2px 8px;
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 11px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}
</style>

<style>
/* Global styles for Vue Flow */
.vue-flow {
    background: var(--or3-color-bg-primary, #0a0a0f) !important;
}

.workflow-canvas-select .vue-flow__pane {
    touch-action: none;
}

.vue-flow__edge-path {
    stroke: var(--or3-color-border-hover, rgba(255, 255, 255, 0.15)) !important;
    stroke-width: 2px !important;
}

.vue-flow__edge.selected .vue-flow__edge-path,
.vue-flow__edge:hover .vue-flow__edge-path {
    stroke: var(--or3-color-accent, #8b5cf6) !important;
}

.vue-flow__edge.animated .vue-flow__edge-path {
    stroke: var(--or3-color-accent, #8b5cf6) !important;
    stroke-dasharray: 5;
    animation: dash 0.5s linear infinite;
}

@keyframes dash {
    to {
        stroke-dashoffset: -10;
    }
}

.vue-flow__handle {
    width: 12px !important;
    height: 12px !important;
    background: var(--or3-color-bg-elevated, #22222e) !important;
    border: 2px solid var(--or3-color-border-hover, rgba(255, 255, 255, 0.15)) !important;
    border-radius: 50% !important;
    transition: all 0.15s ease !important;
}

.vue-flow__handle:hover {
    background: var(--or3-color-accent, #8b5cf6) !important;
    border-color: var(--or3-color-accent, #8b5cf6) !important;
}

.vue-flow__controls {
    background: var(--or3-color-surface, rgba(26, 26, 36, 0.8)) !important;
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08)) !important;
    border-radius: var(--or3-radius-md, 10px) !important;
    box-shadow: var(--or3-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4)) !important;
}

.vue-flow__controls-button {
    background: transparent !important;
    border: none !important;
    color: var(
        --or3-color-text-secondary,
        rgba(255, 255, 255, 0.65)
    ) !important;
    transition: all 0.15s ease !important;
}

.vue-flow__controls-button:hover {
    background: var(
        --or3-color-surface-hover,
        rgba(34, 34, 46, 0.9)
    ) !important;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95)) !important;
}

/* Active state for lock button */
.vue-flow__controls-button:active,
.vue-flow__controls-button.active {
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15)) !important;
    color: var(--or3-color-accent, #8b5cf6) !important;
}

/* Make controls more touch-friendly on mobile */
@media (max-width: 768px) {
    .vue-flow__controls-button {
        min-width: 32px !important;
        min-height: 32px !important;
        font-size: 16px !important;
    }
}

.vue-flow__controls-button svg {
    fill: currentColor !important;
}

/* Remove default node background */
.vue-flow__node {
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    padding: 0 !important;
}
</style>
