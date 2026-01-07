<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';
import NodeWrapper from './NodeWrapper.vue';
import IconOutput from '../icons/IconOutput.vue';

const props = defineProps<{
    id: string;
    data: {
        label: string;
        format?: 'text' | 'json' | 'markdown';
        template?: string;
        includeMetadata?: boolean;
        status?: 'idle' | 'active' | 'completed' | 'error';
    };
    selected?: boolean;
}>();

const label = computed(() => props.data.label || 'Output');
const format = computed(() => props.data.format || 'text');
const hasTemplate = computed(() => !!props.data.template);
const includeMetadata = computed(() => props.data.includeMetadata ?? false);
const status = computed(() => props.data.status || 'idle');

const formatLabel = computed(() => {
    switch (format.value) {
        case 'json':
            return 'JSON';
        case 'markdown':
            return 'MD';
        case 'text':
        default:
            return 'TXT';
    }
});
const emit = defineEmits<{
    (e: 'inspect'): void;
}>();
</script>

<template>
    <NodeWrapper
        :id="id"
        :selected="selected"
        :status="status"
        variant="info"
        @inspect="emit('inspect')"
    >
        <Handle type="target" :position="Position.Top" class="handle" />

        <div class="output-node">
            <div class="node-header">
                <div class="icon-wrapper">
                    <IconOutput class="output-icon" />
                </div>
                <span class="node-label">{{ label }}</span>
                <div v-if="status === 'active'" class="status-spinner"></div>
            </div>

            <div class="output-info">
                <div class="format-badge">
                    <svg
                        class="format-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M4 7V4h16v3"></path>
                        <path d="M9 20h6"></path>
                        <path d="M12 4v16"></path>
                    </svg>
                    <span>{{ formatLabel }}</span>
                </div>

                <div class="meta-row">
                    <span v-if="hasTemplate" class="meta-item">
                        <svg
                            class="meta-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <path
                                d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                            ></path>
                        </svg>
                        Template
                    </span>
                    <span v-if="includeMetadata" class="meta-item">
                        <svg
                            class="meta-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                        Metadata
                    </span>
                </div>
            </div>

            <div class="terminal-indicator">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <rect
                        x="3"
                        y="3"
                        width="18"
                        height="18"
                        rx="2"
                        ry="2"
                    ></rect>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                </svg>
                <span>Terminal</span>
            </div>
        </div>

        <!-- No output handles - this is a terminal node -->
    </NodeWrapper>
</template>

<style scoped>
.output-node {
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

.output-icon {
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
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

.output-info {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.format-badge {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-xs, 4px);
    padding: 4px 8px;
    background: var(--or3-color-info-muted, rgba(59, 130, 246, 0.2));
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 11px;
    font-weight: 600;
    color: var(--or3-color-info, #3b82f6);
}

.format-icon {
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

.meta-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
}

.terminal-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 10px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.5));
    border: 1px dashed var(--or3-color-border, rgba(255, 255, 255, 0.1));
}

.terminal-indicator svg {
    width: 12px;
    height: 12px;
}

.handle {
    width: 10px;
    height: 10px;
    background: var(--or3-color-bg-tertiary, rgba(255, 255, 255, 0.1));
    border: 2px solid
        var(--or3-color-border-secondary, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
}
</style>
