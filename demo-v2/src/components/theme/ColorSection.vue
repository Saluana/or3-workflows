<script setup lang="ts">
import { ref } from 'vue';
import ColorPicker from './ColorPicker.vue';

const props = defineProps<{
    title: string;
    description?: string;
    colors: Record<string, string>;
    expanded?: boolean;
}>();

const emit = defineEmits<{
    'update:color': [key: string, value: string];
}>();

const isExpanded = ref(props.expanded ?? true);

function toggleExpanded() {
    isExpanded.value = !isExpanded.value;
}

function updateColor(key: string, value: string) {
    emit('update:color', key, value);
}

// Format key into readable label
function formatLabel(key: string): string {
    return key
        .replace(/^--or3-color-/, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}
</script>

<template>
    <div class="color-section">
        <button class="section-header" @click="toggleExpanded">
            <div class="header-content">
                <h3 class="section-title">{{ title }}</h3>
                <p v-if="description" class="section-description">{{ description }}</p>
            </div>
            <svg
                class="chevron-icon"
                :class="{ expanded: isExpanded }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
            >
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
        </button>
        <Transition name="expand">
            <div v-if="isExpanded" class="section-content">
                <div class="color-grid">
                    <ColorPicker
                        v-for="(value, key) in colors"
                        :key="key"
                        :model-value="value"
                        :label="formatLabel(key as string)"
                        @update:model-value="updateColor(key as string, $event)"
                    />
                </div>
            </div>
        </Transition>
    </div>
</template>

<style scoped>
.color-section {
    background: var(--or3-color-bg-secondary, #111115);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-lg, 12px);
    overflow: hidden;
}

.section-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--or3-spacing-lg, 16px);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
    text-align: left;
}

.section-header:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.04));
}

.header-content {
    flex: 1;
    min-width: 0;
}

.section-title {
    font-size: var(--or3-text-md, 14px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    margin: 0 0 var(--or3-spacing-2xs, 2px) 0;
}

.section-description {
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    margin: 0;
    line-height: 1.4;
}

.chevron-icon {
    width: 20px;
    height: 20px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    transition: transform var(--or3-transition-fast, 120ms);
    flex-shrink: 0;
}

.chevron-icon.expanded {
    transform: rotate(180deg);
}

.section-content {
    padding: 0 var(--or3-spacing-lg, 16px) var(--or3-spacing-lg, 16px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

.color-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: var(--or3-spacing-lg, 16px);
    padding-top: var(--or3-spacing-lg, 16px);
}

/* Expand transition */
.expand-enter-active,
.expand-leave-active {
    transition: all var(--or3-transition-normal, 200ms);
    overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
    opacity: 0;
    max-height: 0;
    padding-top: 0;
}

.expand-enter-to,
.expand-leave-from {
    opacity: 1;
    /* Using a large max-height for animation - content should not exceed 1500px */
    max-height: 1500px;
}
</style>
