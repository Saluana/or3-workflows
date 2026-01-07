<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';
import IconWhileLoop from '../icons/IconWhileLoop.vue';

const props = defineProps<{
    id: string;
    data: {
        label: string;
        conditionPrompt?: string;
        maxIterations?: number;
        status?: 'idle' | 'active' | 'completed' | 'error';
        loopMode?: 'condition' | 'fixed';
        outputMode?: 'last' | 'accumulate';
    };
    selected?: boolean;
}>();

const label = computed(() => props.data.label || 'While Loop');
const status = computed(() => props.data.status || 'idle');
const maxIterations = computed(() => props.data.maxIterations ?? 10);
const loopMode = computed(() => props.data.loopMode ?? 'condition');
const outputMode = computed(() => props.data.outputMode ?? 'last');
const iteration = computed(() =>
    typeof (props.data as any).iteration === 'number'
        ? (props.data as any).iteration
        : null
);

const modeLabel = computed(() =>
    loopMode.value === 'fixed' ? 'Fixed' : 'While'
);
const emit = defineEmits<{
    (e: 'inspect'): void;
}>();
</script>

<template>
    <NodeWrapper :id="id" :selected="selected" :status="status" variant="info" @inspect="emit('inspect')">
        <Handle type="target" :position="Position.Top" class="handle" />

        <div class="while-node">
            <div class="node-header">
                <div class="icon-wrapper">
                    <IconWhileLoop class="loop-icon" />
                </div>
                <span class="node-label">{{ label }}</span>
                <span class="pill" :class="{ fixed: loopMode === 'fixed' }">{{
                    modeLabel
                }}</span>
            </div>
            <div class="meta">
                <span class="meta-item"
                    ><strong>Max:</strong> {{ maxIterations }}</span
                >
                <span class="meta-item"
                    ><strong>Iter:</strong> {{ iteration ?? '—' }}</span
                >
                <span
                    v-if="outputMode === 'accumulate'"
                    class="meta-item accumulate-badge"
                    title="Collects all outputs"
                >
                    📦
                </span>
            </div>
        </div>

        <!-- Port labels -->
        <div class="port-labels">
            <span class="port-label body-label">↻ Loop</span>
            <span class="port-label done-label">✓ Exit</span>
        </div>

        <Handle
            type="source"
            :position="Position.Bottom"
            id="body"
            class="handle body-handle"
            :style="{ left: '30%' }"
        />
        <Handle
            type="source"
            :position="Position.Bottom"
            id="done"
            class="handle done-handle"
            :style="{ left: '70%' }"
        />
    </NodeWrapper>
</template>

<style scoped>
.while-node {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
    position: relative;
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
    flex-shrink: 0;
}

.loop-icon {
    width: 18px;
    height: 18px;
}

.node-label {
    flex: 1;
    font-weight: 600;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    position: absolute;
    top: 0;
    right: 0;
}

.pill.fixed {
    background: rgba(168, 85, 247, 0.15);
    border-color: #a855f7;
    color: #a855f7;
}

.meta {
    display: flex;
    gap: var(--or3-spacing-xs, 4px);
    font-size: 11px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    align-items: center;
}

.meta-item strong {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
    font-weight: 600;
}

.accumulate-badge {
    font-size: 12px;
    margin-left: auto;
}

.port-labels {
    display: flex;
    justify-content: space-between;
    padding: 0 8px;
    margin-top: 4px;
}

.port-label {
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.3px;
}

.body-label {
    color: var(--or3-color-warning, #f59e0b);
    background: rgba(245, 158, 11, 0.15);
}

.done-label {
    color: var(--or3-color-success, #22c55e);
    background: rgba(34, 197, 94, 0.15);
}

.handle {
    background: var(--or3-color-bg-elevated, #22222e) !important;
    border: 2px solid var(--or3-color-info, #3b82f6) !important;
    width: 12px !important;
    height: 12px !important;
}

.body-handle {
    border-color: var(--or3-color-warning, #f59e0b) !important;
}

.done-handle {
    border-color: var(--or3-color-success, #22c55e) !important;
}
</style>
