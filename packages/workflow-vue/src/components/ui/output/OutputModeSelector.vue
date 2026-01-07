<script setup lang="ts">
defineProps<{
    modelValue: 'combine' | 'synthesis';
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: 'combine' | 'synthesis'): void;
}>();

const modes = [
    {
        value: 'combine',
        label: 'Combine',
        description: 'Concatenate outputs without AI processing',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
    },
    {
        value: 'synthesis',
        label: 'AI Synthesis',
        description: 'Use AI to synthesize a new output',
        icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><path d="M2 12h20"/><path d="M12 12v10"/><path d="M8 17h8"/></svg>`,
    },
] as const;
</script>

<template>
    <div class="mode-selector">
        <button
            v-for="mode in modes"
            :key="mode.value"
            @click="emit('update:modelValue', mode.value)"
            class="mode-btn"
            :class="{ active: modelValue === mode.value }"
            :title="mode.description"
        >
            <span v-html="mode.icon" class="mode-icon"></span>
            {{ mode.label }}
        </button>
    </div>
</template>

<style scoped>
.mode-selector {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(
        --or3-color-bg-secondary,
        rgba(15, 23, 42, 0.04)
    );
    border-radius: var(--or3-radius-md, 8px);
    border: 1px solid
        var(--or3-color-border, rgba(15, 23, 42, 0.08));
}

.mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 8px 12px;
    border: none;
    border-radius: var(--or3-radius-sm, 6px);
    background: transparent;
    color: var(--or3-color-text-secondary, #475569);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
}

.mode-btn:hover {
    color: var(--or3-color-text-primary, #0f172a);
    background: var(--or3-color-surface-hover, rgba(15, 23, 42, 0.06));
}

.mode-btn.active {
    background: var(--or3-color-accent-muted, rgba(37, 99, 235, 0.12));
    color: var(--or3-color-text-primary, #0f172a);
    box-shadow: inset 0 0 0 1px var(--or3-color-accent, #2563eb);
}

.mode-icon {
    display: flex;
    align-items: center;
    justify-content: center;
}

.mode-icon :deep(svg) {
    width: 16px;
    height: 16px;
}
</style>
