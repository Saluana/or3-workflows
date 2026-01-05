<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';
import IconParallel from '../icons/IconParallel.vue';

const props = defineProps<{
    id: string;
    data: {
        label: string;
        status?: 'idle' | 'active' | 'completed' | 'error';
        branches?: Array<{ id: string; label: string }>;
        mergeEnabled?: boolean;
    };
    selected?: boolean;
}>();

const label = computed(() => props.data.label || 'Parallel');
const status = computed(() => props.data.status || 'idle');
const mergeEnabled = computed(() => props.data.mergeEnabled !== false);

// No default branches - user must add them
const branches = computed(() => props.data.branches || []);

const handlePositions = computed(() => {
    const count = branches.value.length;
    if (count === 0) return [];
    if (count === 1) return [50];
    return branches.value.map((_, i) => ((i + 1) / (count + 1)) * 100);
});
const emit = defineEmits<{
    (e: 'inspect'): void;
}>();
</script>

<template>
    <NodeWrapper :id="id" :selected="selected" :status="status" variant="info" @inspect="emit('inspect')">
        <Handle type="target" :position="Position.Top" class="handle" />

        <div class="parallel-node">
            <div class="node-header">
                <div class="icon-wrapper">
                    <IconParallel class="merge-icon" />
                </div>
                <span class="node-label">{{ label }}</span>
                <div v-if="status === 'active'" class="status-spinner"></div>
            </div>

            <div class="parallel-badge">
                <span
                    >{{ mergeEnabled ? 'Parallel Merge' : 'Parallel Split' }} ·
                    {{ branches.length }} branches</span
                >
            </div>
        </div>

        <!-- If merge ENABLED: Single merged output at bottom -->
        <template v-if="mergeEnabled">
            <Handle
                type="source"
                :position="Position.Bottom"
                id="merged"
                class="handle merged-output"
            />
        </template>

        <!-- If merge DISABLED: One output per branch at bottom -->
        <template v-else>
            <Handle
                v-for="(branch, index) in branches"
                :key="branch.id"
                type="source"
                :position="Position.Bottom"
                :id="branch.id"
                class="handle branch-handle"
                :style="{ left: `${handlePositions[index]}%` }"
            />
        </template>
    </NodeWrapper>
</template>

<style scoped>
.parallel-node {
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

.merge-icon {
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
    border: 2px solid var(--or3-color-info-muted, rgba(59, 130, 246, 0.2));
    border-top-color: var(--or3-color-info, #3b82f6);
    border-radius: 50%;
    animation: spin 1s linear infinite;
}

.parallel-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: var(--or3-color-info-muted, rgba(59, 130, 246, 0.2));
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: var(--or3-radius-full, 9999px);
    width: fit-content;
}

.parallel-badge span {
    font-size: 11px;
    font-weight: 500;
    color: var(--or3-color-info, #3b82f6);
}

.handle {
    background: var(--or3-color-bg-elevated, #22222e) !important;
    border: 2px solid var(--or3-color-border-hover, rgba(255, 255, 255, 0.15)) !important;
    width: 12px !important;
    height: 12px !important;
}

.handle:hover {
    background: var(--or3-color-info, #3b82f6) !important;
    border-color: var(--or3-color-info, #3b82f6) !important;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
