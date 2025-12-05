<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
    defineProps<{
        id: string;
        selected?: boolean;
        status?: 'idle' | 'active' | 'completed' | 'error';
        variant?: 'default' | 'accent' | 'warning' | 'info' | 'secondary';
    }>(),
    {
        status: 'idle',
        variant: 'default',
    }
);

const classes = computed(() => [
    'node-wrapper',
    `status-${props.status}`,
    `variant-${props.variant}`,
    { selected: props.selected },
]);
</script>

<template>
    <div :class="classes">
        <div class="node-id">{{ id.slice(0, 6) }}</div>
        <slot />
    </div>
</template>

<style scoped>
.node-wrapper {
    background: var(--or3-color-bg-elevated, #22222e);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-lg, 16px);
    padding: var(--or3-spacing-md, 16px);
    min-width: 200px;
    box-shadow: var(--or3-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
    transition: all 0.25s ease;
    position: relative;
}

.node-wrapper::before {
    content: '';
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    padding: 1px;
    background: transparent;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
    pointer-events: none;
    transition: background 0.25s ease;
}

/* Status styles */
.status-idle {
    border-color: var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.status-active {
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: var(--or3-shadow-glow, 0 0 20px rgba(139, 92, 246, 0.3));
}

.status-active::before {
    background: linear-gradient(
        135deg,
        var(--or3-color-accent, #8b5cf6),
        transparent
    );
}

.status-completed {
    border-color: var(--or3-color-success, #22c55e);
}

.status-completed::before {
    background: linear-gradient(
        135deg,
        var(--or3-color-success, #22c55e),
        transparent
    );
}

.status-error {
    border-color: var(--or3-color-error, #ef4444);
}

.status-error::before {
    background: linear-gradient(
        135deg,
        var(--or3-color-error, #ef4444),
        transparent
    );
}

/* Selected state */
.selected {
    border-color: var(--or3-color-accent, #8b5cf6);
    border-width: 2px;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.25),
        var(--or3-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
}

/* Mobile: Make selected state even more visible */
@media (max-width: 768px) {
    .selected {
        border-width: 3px;
        box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.3),
            var(--or3-shadow-glow, 0 0 20px rgba(139, 92, 246, 0.4));
    }
}

/* Hover effect */
.node-wrapper:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.15));
}

/* Preserve status border colors on hover */
.status-active:hover {
    border-color: var(--or3-color-accent, #8b5cf6);
}

.status-completed:hover {
    border-color: var(--or3-color-success, #22c55e);
}

.status-error:hover {
    border-color: var(--or3-color-error, #ef4444);
}

/* Secondary variant */
.variant-secondary {
    border-color: var(--or3-color-secondary, #64748b);
}

.variant-secondary.status-active {
    box-shadow: var(--or3-shadow-glow, 0 0 20px rgba(100, 116, 139, 0.3));
}

.node-id {
    position: absolute;
    top: -20px;
    right: 0;
    font-size: 10px;
    font-family: monospace;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    background: var(--or3-color-bg-tertiary, #18181d);
    padding: 2px 6px;
    border-radius: 4px;
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.node-wrapper:hover .node-id,
.node-wrapper.selected .node-id {
    opacity: 1;
}
</style>
