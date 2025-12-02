<script setup lang="ts">
import type { Edge } from '@vue-flow/core';
import type { WorkflowEditor } from '@or3/workflow-core';
import {
    WorkflowCanvas,
    EdgeLabelEditor,
    ValidationOverlay,
} from '@or3/workflow-vue';

// Props interface
interface Props {
    editor: WorkflowEditor | null;
    nodeStatuses: Record<string, 'idle' | 'active' | 'completed' | 'error'>;
    showLeftSidebar: boolean;
    isMobile: boolean;
    selectedEdge: Edge | null;
    showEdgeEditor: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
    (e: 'expand-sidebar'): void;
    (e: 'node-click', node: any): void;
    (e: 'edge-click', edge: Edge): void;
    (e: 'pane-click'): void;
    (e: 'update-edge-label', edgeId: string, label: string): void;
    (e: 'delete-edge', edgeId: string): void;
    (e: 'close-edge-editor'): void;
}>();
</script>

<template>
    <div class="canvas-container">
        <button
            v-if="!showLeftSidebar && !isMobile"
            class="sidebar-expand-btn"
            @click="emit('expand-sidebar')"
            title="Expand sidebar"
        >
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                class="icon"
            >
                <polyline points="13 17 18 12 13 7"></polyline>
                <polyline points="6 17 11 12 6 7"></polyline>
            </svg>
        </button>
        <WorkflowCanvas
            v-if="editor"
            :editor="editor"
            :node-statuses="nodeStatuses"
            @node-click="emit('node-click', $event)"
            @edge-click="emit('edge-click', $event)"
            @pane-click="emit('pane-click')"
        />
        <ValidationOverlay
            v-if="editor"
            class="canvas-overlay"
            :editor="editor"
        />

        <!-- Edge Label Editor -->
        <EdgeLabelEditor
            :edge="selectedEdge"
            :show="showEdgeEditor"
            @close="emit('close-edge-editor')"
            @update="(edgeId: string, label: string) => emit('update-edge-label', edgeId, label)"
            @delete="(edgeId: string) => emit('delete-edge', edgeId)"
        />
    </div>
</template>

<style scoped>
.canvas-container {
    flex: 1;
    position: relative;
    overflow: hidden;
}

.canvas-overlay {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 10;
}

.sidebar-expand-btn {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--or3-color-bg-secondary, #111115);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
    box-shadow: var(--or3-shadow-sm, 0 2px 4px rgba(0, 0, 0, 0.25));
}

.sidebar-expand-btn:hover {
    background: var(--or3-color-bg-tertiary, #18181d);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    border-color: var(--or3-color-accent, #8b5cf6);
}

.sidebar-expand-btn .icon {
    width: 16px;
    height: 16px;
}

@media (max-width: 768px) {
    .canvas-container {
        position: fixed;
        top: 48px;
        left: 0;
        right: 0;
        bottom: 60px;
    }
}
</style>
