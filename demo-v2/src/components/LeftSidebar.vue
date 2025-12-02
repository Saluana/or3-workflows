<script setup lang="ts">
import type { WorkflowEditor } from '@or3/workflow-core';
import { NodePalette, NodeInspector } from '@or3/workflow-vue';

// Props interface
interface Props {
    editor: WorkflowEditor | null;
    activePanel: 'palette' | 'inspector';
    collapsed: boolean;
    isMobile?: boolean;
}

defineProps<Props>();

const emit = defineEmits<{
    (e: 'update:activePanel', value: 'palette' | 'inspector'): void;
    (e: 'update:collapsed', value: boolean): void;
    (e: 'quick-add'): void;
}>();
</script>

<template>
    <aside
        v-if="!collapsed"
        class="sidebar left-sidebar"
        :class="{ collapsed, 'mobile-overlay': isMobile }"
    >
        <div class="sidebar-header">
            <button
                class="sidebar-collapse-btn"
                @click="emit('update:collapsed', !collapsed)"
                title="Toggle sidebar"
            >
                <svg
                    v-if="!collapsed"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <polyline points="11 17 6 12 11 7"></polyline>
                    <polyline points="18 17 13 12 18 7"></polyline>
                </svg>
                <svg
                    v-else
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
        </div>
        <div v-if="!collapsed" class="sidebar-tabs">
            <button
                class="sidebar-tab"
                :class="{ active: activePanel === 'palette' }"
                @click="emit('update:activePanel', 'palette')"
            >
                Nodes
            </button>
            <button
                class="sidebar-tab"
                :class="{ active: activePanel === 'inspector' }"
                @click="emit('update:activePanel', 'inspector')"
            >
                Inspector
            </button>
        </div>

        <div v-if="!collapsed" class="sidebar-content">
            <div v-if="activePanel === 'palette'" class="palette-container">
                <NodePalette @quick-add="emit('quick-add')" />
            </div>
            <NodeInspector
                v-else-if="activePanel === 'inspector' && editor"
                :editor="editor"
                @close="emit('update:activePanel', 'palette')"
            />
        </div>
    </aside>
</template>

<style scoped>
.sidebar {
    display: flex;
    flex-direction: column;
    background: var(--or3-color-bg-secondary, #111115);
    position: relative;
    transition: width var(--or3-transition-normal, 200ms),
        transform var(--or3-transition-normal, 200ms);
}

.sidebar-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--or3-spacing-sm, 8px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--or3-color-bg-secondary, #111115);
}

.sidebar-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
}

.sidebar-collapse-btn:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.sidebar-collapse-btn .icon {
    width: 14px;
    height: 14px;
}

.left-sidebar {
    width: 280px;
    border-right: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

.left-sidebar.collapsed {
    width: 0;
    overflow: hidden;
    border: none;
}

.sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

.sidebar-tab {
    flex: 1;
    padding: var(--or3-spacing-md, 12px) var(--or3-spacing-lg, 16px);
    font-size: var(--or3-text-sm, 12px);
    font-weight: var(--or3-font-medium, 500);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
}

.sidebar-tab:hover {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
}

.sidebar-tab.active {
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    border-bottom-color: var(--or3-color-accent, #8b5cf6);
}

.sidebar-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.palette-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--or3-spacing-lg, 16px);
}

/* Responsive */
@media (max-width: 900px) {
    .left-sidebar {
        width: 220px;
    }
}

@media (max-width: 768px) {
    .left-sidebar.mobile-overlay {
        position: fixed;
        left: 0;
        top: 52px;
        bottom: calc(72px + env(safe-area-inset-bottom, 0));
        z-index: 150;
        width: 92vw;
        max-width: 480px;
        box-shadow: 4px 0 24px rgba(0, 0, 0, 0.6);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        border-radius: 0 var(--or3-radius-lg, 14px) var(--or3-radius-lg, 14px) 0;
        overflow: hidden;
    }
    
    /* Improve scrolling on mobile */
    .palette-container {
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: calc(var(--or3-spacing-lg, 16px) + env(safe-area-inset-bottom, 0));
    }
    
    /* Make tabs more touch-friendly */
    .sidebar-tab {
        padding: var(--or3-spacing-lg, 16px);
        font-size: var(--or3-text-sm, 13px);
    }
    
    /* Make close button larger on mobile */
    .sidebar-collapse-btn {
        width: 36px;
        height: 36px;
    }
    
    .sidebar-collapse-btn .icon {
        width: 16px;
        height: 16px;
    }
}
</style>
