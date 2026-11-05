<script setup lang="ts">
import { ref, computed, watch } from 'vue';

const props = defineProps<{
    modelValue: string;
    label: string;
    description?: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: string];
}>();

const localValue = ref(props.modelValue);

watch(() => props.modelValue, (newVal) => {
    localValue.value = newVal;
});

watch(localValue, (newVal) => {
    emit('update:modelValue', newVal);
});

// Parse color to get RGB components for preview
const rgbPreview = computed(() => {
    const color = localValue.value;
    // Handle hex colors
    if (color.startsWith('#')) {
        return color;
    }
    // Handle rgba colors
    if (color.startsWith('rgba')) {
        return color;
    }
    // Handle rgb colors
    if (color.startsWith('rgb')) {
        return color;
    }
    return color;
});
</script>

<template>
    <div class="color-picker">
        <div class="picker-header">
            <label class="picker-label">{{ label }}</label>
            <span v-if="description" class="picker-description">{{ description }}</span>
        </div>
        <div class="picker-controls">
            <div class="color-preview" :style="{ background: rgbPreview }"></div>
            <input
                v-model="localValue"
                type="text"
                class="color-input"
                :placeholder="modelValue"
            />
        </div>
    </div>
</template>

<style scoped>
.color-picker {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.picker-header {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-2xs, 2px);
}

.picker-label {
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    text-transform: capitalize;
}

.picker-description {
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    line-height: 1.4;
}

.picker-controls {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.color-preview {
    width: 36px;
    height: 36px;
    border-radius: var(--or3-radius-sm, 6px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    flex-shrink: 0;
    background-image: 
        linear-gradient(45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%),
        linear-gradient(-45deg, rgba(255, 255, 255, 0.1) 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%),
        linear-gradient(-45deg, transparent 75%, rgba(255, 255, 255, 0.1) 75%);
    background-size: 8px 8px;
    background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
}

.color-preview:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.2));
    transform: scale(1.05);
}

.color-input {
    flex: 1;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-sm, 6px);
    background: var(--or3-color-bg-tertiary, #18181d);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: var(--or3-text-sm, 12px);
    font-family: var(--or3-font-mono, monospace);
    transition: all var(--or3-transition-fast, 120ms);
}

.color-input:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: 0 0 0 3px var(--or3-color-accent-subtle, rgba(139, 92, 246, 0.08));
}

.color-input::placeholder {
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}
</style>
