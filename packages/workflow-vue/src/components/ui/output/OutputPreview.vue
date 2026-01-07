<script setup lang="ts">
import { computed } from 'vue';

export interface PreviewData {
    assembledPreview: string;
    isComplete: boolean;
    modeHint?: string;
}

const props = defineProps<{
    previewData: PreviewData;
    maxHeight?: number;
}>();

const style = computed(() => ({
    maxHeight: props.maxHeight ? `${props.maxHeight}px` : '200px',
}));
</script>

<template>
    <div class="preview-card">
        <div class="preview-header">
            <span class="preview-label">Preview</span>
            <span v-if="!previewData.isComplete" class="preview-status">
                <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                >
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Incomplete
            </span>
        </div>

        <div class="preview-body" :style="style">
            <template v-if="previewData.assembledPreview">
                {{ previewData.assembledPreview }}
            </template>
            <div v-else class="preview-empty">(Empty output)</div>
        </div>

        <div v-if="previewData.modeHint" class="preview-footer">
            <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            {{ previewData.modeHint }}
        </div>
    </div>
</template>

<style scoped>
.preview-card {
    border: 1px solid var(--or3-color-border, rgba(15, 23, 42, 0.12));
    border-radius: 10px;
    overflow: hidden;
    background: var(--or3-color-surface, #ffffff);
    color: var(--or3-color-text-primary, #0f172a);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

@media (prefers-color-scheme: dark) {
    .preview-card {
        border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.14));
        background: var(--or3-color-surface, #0b1220);
        color: var(--or3-color-text-primary, #e2e8f0);
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
    }
}

.preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    background: var(--or3-color-surface-hover, rgba(15, 23, 42, 0.04));
    border-bottom: 1px solid
        var(--or3-color-border, rgba(15, 23, 42, 0.12));
}

@media (prefers-color-scheme: dark) {
    .preview-header {
        background: var(--or3-color-surface-hover, rgba(255, 255, 255, 0.06));
        border-bottom: 1px solid
            var(--or3-color-border, rgba(255, 255, 255, 0.12));
    }
}

.preview-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--or3-color-text-secondary, #475569);
}

@media (prefers-color-scheme: dark) {
    .preview-label {
        color: var(--or3-color-text-secondary, #cbd5e1);
    }
}

.preview-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #f59e0b;
}

.preview-body {
    padding: 12px;
    overflow-y: auto;
    font-size: 13px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        'Liberation Mono', 'Courier New', monospace;
    line-height: 1.5;
    background: var(--or3-color-surface, #ffffff);
    color: var(--or3-color-text-primary, #0f172a);
}

@media (prefers-color-scheme: dark) {
    .preview-body {
        background: var(--or3-color-surface, #0b1220);
        color: var(--or3-color-text-primary, #e2e8f0);
    }
}

.preview-empty {
    color: var(--or3-color-text-muted, #94a3b8);
    text-align: center;
    font-style: italic;
    padding: 8px 0;
}

.preview-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    font-size: 12px;
    background: rgba(37, 99, 235, 0.08);
    color: #2563eb;
    border-top: 1px solid rgba(37, 99, 235, 0.18);
}

@media (prefers-color-scheme: dark) {
    .preview-footer {
        background: rgba(59, 130, 246, 0.18);
        color: #cfe1ff;
        border-top: 1px solid rgba(59, 130, 246, 0.35);
    }
}
</style>
