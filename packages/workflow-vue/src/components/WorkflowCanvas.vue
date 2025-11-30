<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import {
    VueFlow,
    useVueFlow,
    Node,
    Edge,
    Connection,
    NodeMouseEvent,
    EdgeMouseEvent,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { WorkflowEditor } from '@or3/workflow-core';
import StartNode from './nodes/StartNode.vue';
import AgentNode from './nodes/AgentNode.vue';
import RouterNode from './nodes/RouterNode.vue';
import ParallelNode from './nodes/ParallelNode.vue';
import ToolNode from './nodes/ToolNode.vue';
import MemoryNode from './nodes/MemoryNode.vue';
import WhileLoopNode from './nodes/WhileLoopNode.vue';
import SubflowNode from './nodes/SubflowNode.vue';

const props = defineProps<{
    editor: WorkflowEditor;
    nodeStatuses?: Record<string, 'idle' | 'active' | 'completed' | 'error'>;
}>();

const emit = defineEmits<{
    (e: 'nodeClick', node: Node): void;
    (e: 'edgeClick', edge: Edge): void;
    (e: 'paneClick'): void;
    (e: 'drop', event: DragEvent): void;
}>();

const { onConnect, onNodeDragStop, screenToFlowCoordinate, fitView } =
    useVueFlow();

const nodes = ref<Node[]>([]);
const edges = ref<Edge[]>([]);

// Sync from editor, injecting status from props
const syncFromEditor = () => {
    nodes.value = props.editor.getNodes().map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
            ...n.data,
            status: props.nodeStatuses?.[n.id] || 'idle',
        },
        selected: n.selected,
    }));

    edges.value = props.editor.getEdges().map((e) => ({
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
};

let unsubUpdate: (() => void) | null = null;
let unsubSelection: (() => void) | null = null;

onMounted(() => {
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
    props.editor.commands.createEdge(
        params.source,
        params.target,
        params.sourceHandle ?? undefined,
        params.targetHandle ?? undefined
    );
});

// Handle node drag
onNodeDragStop((event) => {
    props.editor.commands.setNodePosition(event.node.id, event.node.position);
});

// Handle node click
const onNodeClick = (event: NodeMouseEvent) => {
    props.editor.commands.selectNode(event.node.id);
    emit('nodeClick', event.node);
};

// Handle edge click
const onEdgeClick = (event: EdgeMouseEvent) => {
    emit('edgeClick', event.edge);
};

// Handle pane click (deselect)
const onPaneClick = () => {
    props.editor.commands.deselectAll();
    emit('paneClick');
};

// Handle drop from palette
const onDrop = (event: DragEvent) => {
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

// Handle keyboard shortcuts
const onKeyDown = (event: KeyboardEvent) => {
    // Ignore if in input
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    // Delete selected
    if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = props.editor.getSelected();
        selected.nodes.forEach((id) => props.editor.commands.deleteNode(id));
        selected.edges.forEach((id) => props.editor.commands.deleteEdge(id));
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
        class="workflow-canvas"
        @drop="onDrop"
        @dragover="onDragOver"
        @keydown="onKeyDown"
        tabindex="0"
    >
        <VueFlow
            v-model:nodes="nodes"
            v-model:edges="edges"
            :default-viewport="{ x: 50, y: 50, zoom: 1 }"
            :min-zoom="0.5"
            :max-zoom="2"
            fit-view-on-init
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

            <template #node-tool="nodeProps">
                <ToolNode
                    :id="nodeProps.id"
                    :data="nodeProps.data"
                    :selected="nodeProps.selected"
                />
            </template>

            <template #node-memory="nodeProps">
                <MemoryNode
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
    transform: scale(1.2);
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

.vue-flow__controls-button svg {
    fill: currentColor !important;
}
</style>
