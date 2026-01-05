<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';

const props = defineProps<{
    id: string;
    data: {
        label: string;
        model?: string;
        prompt?: string;
        status?: 'idle' | 'active' | 'completed' | 'error';
    };
    selected?: boolean;
}>();

const label = computed(() => props.data.label || 'Agent');
const model = computed(() => props.data.model || 'z-ai/glm-4.6:exacto');
const status = computed(() => props.data.status || 'idle');

const modelShort = computed(() => {
    const parts = model.value.split('/');
    return parts[parts.length - 1];
});
</script>

<template>
    <NodeWrapper
        :id="id"
        :selected="selected"
        :status="status"
        variant="accent"
    >
        <Handle type="target" :position="Position.Top" class="handle" />

        <div class="agent-node">
            <div class="node-header">
                <div class="icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" class="bot-icon"><!-- Icon from Tabler Icons by Paweł Kuna - https://github.com/tabler/tabler-icons/blob/master/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zm6-4v2m-3 8v9m6-9v9M5 16l4-2m6 0l4 2M9 18h6M10 8v.01M14 8v.01"/></svg>
                </div>
                <span class="node-label">{{ label }}</span>
                <div v-if="status === 'active'" class="status-spinner"></div>
            </div>

            <div class="model-badge">
                <span class="model-name">{{ modelShort }}</span>
            </div>
        </div>

        <Handle type="source" :position="Position.Bottom" class="handle" />
        <Handle
            type="source"
            :position="Position.Right"
            id="error"
            class="handle error-handle"
        />
    </NodeWrapper>
</template>

<style scoped>
.agent-node {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.node-header {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.icon-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-accent, #8b5cf6);
}

.bot-icon {
    width: 18px;
    height: 18px;
}

.node-label {
    flex: 1;
    font-weight: 600;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: 13px;
}

.status-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
    border-top-color: var(--or3-color-accent, #8b5cf6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

.model-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-full, 9999px);
    width: fit-content;
}

.model-name {
    font-size: 11px;
    font-family: var(--or3-font-mono, monospace);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
}

.handle {
    background: var(--or3-color-bg-elevated, #22222e) !important;
    border: 2px solid var(--or3-color-border-hover, rgba(255, 255, 255, 0.15)) !important;
    width: 12px !important;
    height: 12px !important;
}

.handle:hover {
    background: var(--or3-color-accent, #8b5cf6) !important;
    border-color: var(--or3-color-accent, #8b5cf6) !important;
}

.error-handle {
    border-color: var(--or3-color-error, #ef4444) !important;
}

.error-handle:hover {
    background: var(--or3-color-error, #ef4444) !important;
    border-color: var(--or3-color-error, #ef4444) !important;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
