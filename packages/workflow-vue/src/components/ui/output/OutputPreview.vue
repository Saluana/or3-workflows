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
    <div
        class="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden bg-white dark:bg-gray-900"
    >
        <div
            class="bg-gray-50 dark:bg-gray-800 px-3 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center"
        >
            <span
                class="text-xs font-medium text-gray-500 uppercase tracking-wider"
                >Preview</span
            >
            <span
                v-if="!previewData.isComplete"
                class="text-xs text-amber-500 flex items-center gap-1"
            >
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

        <div
            class="p-3 overflow-y-auto text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200"
            :style="style"
        >
            <template v-if="previewData.assembledPreview">
                {{ previewData.assembledPreview }}
            </template>
            <div v-else class="text-gray-400 italic text-center py-4">
                (Empty output)
            </div>
        </div>

        <div
            v-if="previewData.modeHint"
            class="bg-blue-50 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 border-t border-blue-100 dark:border-blue-900/30 flex items-center gap-2"
        >
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
