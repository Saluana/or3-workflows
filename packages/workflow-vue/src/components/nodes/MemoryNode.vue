<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';

const props = defineProps<{
    id: string;
    data: {
        label: string;
        operation?: 'query' | 'store';
        limit?: number;
        status?: 'idle' | 'active' | 'completed' | 'error';
    };
    selected?: boolean;
}>();

const label = computed(() => props.data.label || 'Memory');
const operation = computed(() => props.data.operation || 'query');
const status = computed(() => props.data.status || 'idle');
</script>

<template>
    <NodeWrapper
        :id="id"
        :selected="selected"
        :status="status"
        variant="info"
    >
        <Handle type="target" :position="Position.Top" class="handle" />

        <div class="memory-node">
            <div class="node-header">
                <div class="icon-wrapper">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="4" y="4" width="16" height="16" rx="3" />
                        <path d="M9 9h6M9 12h6M9 15h6" />
                    </svg>
                </div>
                <span class="node-label">{{ label }}</span>
                <span class="pill">{{ operation }}</span>
            </div>

            <div class="meta">
                <span v-if="operation === 'query'" class="meta-item">
                    <strong>Limit:</strong> {{ props.data.limit ?? 5 }}
                </span>
                <span v-else class="meta-item">
                    Stores incoming input in long-term memory
                </span>
            </div>
        </div>

        <Handle type="source" :position="Position.Bottom" class="handle" />
    </NodeWrapper>
</template>

<style scoped>
.memory-node {
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
    background: var(--or3-color-info-muted, rgba(59, 130, 246, 0.2));
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-info, #3b82f6);
}

.node-label {
    flex: 1;
    font-weight: 600;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: 13px;
}

.pill {
    font-size: 11px;
    text-transform: uppercase;
    padding: 2px 8px;
    background: var(--or3-color-surface-glass, rgba(59, 130, 246, 0.15));
    border: 1px solid var(--or3-color-info, #3b82f6);
    border-radius: var(--or3-radius-full, 9999px);
    color: var(--or3-color-info, #3b82f6);
    letter-spacing: 0.5px;
}

.meta {
    display: flex;
    gap: var(--or3-spacing-xs, 4px);
    font-size: 11px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.meta-item strong {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
    font-weight: 600;
}

.handle {
    background: var(--or3-color-bg-elevated, #22222e) !important;
    border: 2px solid var(--or3-color-info, #3b82f6) !important;
    width: 12px !important;
    height: 12px !important;
}
</style>
