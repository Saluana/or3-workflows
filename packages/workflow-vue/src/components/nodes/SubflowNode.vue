<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';

const props = defineProps<{
    id: string;
    data: {
        label: string;
        subflowId?: string;
        inputMappings?: Record<string, unknown>;
        shareSession?: boolean;
        status?: 'idle' | 'active' | 'completed' | 'error';
    };
    selected?: boolean;
}>();

const label = computed(() => props.data.label || 'Subflow');
const subflowId = computed(() => props.data.subflowId || '');
const shareSession = computed(() => props.data.shareSession !== false);
const status = computed(() => props.data.status || 'idle');

const subflowLabel = computed(() => {
    if (!subflowId.value) return 'No subflow selected';
    return subflowId.value;
});

const inputCount = computed(() => {
    const mappings = props.data.inputMappings || {};
    return Object.keys(mappings).length;
});
</script>

<template>
    <NodeWrapper
        :id="id"
        :selected="selected"
        :status="status"
        variant="secondary"
    >
        <Handle type="target" :position="Position.Top" class="handle" />

        <div class="subflow-node">
            <div class="node-header">
                <div class="icon-wrapper">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" class="subflow-icon"><!-- Icon from Tabler Icons by Paweł Kuna - https://github.com/tabler/tabler-icons/blob/master/LICENSE --><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m14 12l6-3l-8-4l-8 4l6 3"/><path fill="currentColor" d="m10 12l-6 3l8 4l8-4l-6-3l-2 1z"/></g></svg>
                </div>
                <span class="node-label">{{ label }}</span>
                <div v-if="status === 'active'" class="status-spinner"></div>
            </div>

            <div class="subflow-info">
                <div class="subflow-badge" :class="{ empty: !subflowId }">
                    <svg
                        class="link-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path
                            d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"
                        ></path>
                        <path
                            d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"
                        ></path>
                    </svg>
                    <span>{{ subflowLabel }}</span>
                </div>

                <div class="meta-row">
                    <span class="meta-item" v-if="inputCount > 0">
                        <svg
                            class="meta-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"
                            ></path>
                            <polyline points="16 17 21 12 16 7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        {{ inputCount }} input{{ inputCount !== 1 ? 's' : '' }}
                    </span>
                    <span class="meta-item" :class="{ muted: !shareSession }">
                        <svg
                            class="meta-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"
                            ></path>
                            <circle cx="9" cy="7" r="4"></circle>
                            <path d="M23 21v-2a4 4 0 00-3-3.87"></path>
                            <path d="M16 3.13a4 4 0 010 7.75"></path>
                        </svg>
                        {{ shareSession ? 'Shared' : 'Isolated' }}
                    </span>
                </div>
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
.subflow-node {
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
    background: var(--or3-color-secondary-muted, rgba(100, 116, 139, 0.2));
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-secondary, #64748b);
}

.subflow-icon {
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
    border: 2px solid var(--or3-color-secondary-muted, rgba(100, 116, 139, 0.2));
    border-top-color: var(--or3-color-secondary, #64748b);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.subflow-info {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.subflow-badge {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-xs, 4px);
    padding: 4px 8px;
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 11px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
}

.subflow-badge.empty {
    opacity: 0.5;
    font-style: italic;
}

.link-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
}

.meta-row {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-md, 12px);
}

.meta-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
}

.meta-item.muted {
    opacity: 0.5;
}

.meta-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
}

.handle {
    width: 10px;
    height: 10px;
    background: var(--or3-color-bg-tertiary, rgba(255, 255, 255, 0.1));
    border: 2px solid
        var(--or3-color-border-secondary, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
}

.error-handle {
    top: 50%;
    transform: translateY(-50%);
    background: var(--or3-color-error, #ef4444);
    border-color: var(--or3-color-error, #ef4444);
}
</style>
