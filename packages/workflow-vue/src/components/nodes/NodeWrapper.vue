<script setup lang="ts">
import { computed } from 'vue';
import IconSettings from '../icons/IconSettings.vue';

const props = withDefaults(
    defineProps<{
        id: string;
        selected?: boolean;
        status?: 'idle' | 'active' | 'completed' | 'error';
        variant?: 'default' | 'accent' | 'warning' | 'info' | 'secondary';
        issue?: { type: 'error' | 'warning'; message: string };
    }>(),
    {
        status: 'idle',
        variant: 'default',
    },
);

const emit = defineEmits<{
    (e: 'inspect'): void;
}>();

const classes = computed(() => [
    'node-wrapper',
    `status-${props.status}`,
    `variant-${props.variant}`,
    { selected: props.selected, 'has-issue': props.issue },
]);

function onInspect(e: MouseEvent) {
    e.stopPropagation();
    emit('inspect');
}
</script>

<template>
    <div :class="classes">
        <div class="node-meta-container">
            <button
                v-if="issue"
                class="issue-btn"
                :class="`is-${issue.type}`"
                :title="issue.message"
                :aria-label="`${issue.type}: ${issue.message}. Open node.`"
                @click="onInspect"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3 2.8 20h18.4L12 3Zm0 5.7v5.5m0 3.1v.1" />
                </svg>
            </button>
            <button
                class="inspect-btn"
                title="Open inspector"
                aria-label="Open node inspector"
                @click="onInspect"
            >
                <IconSettings />
            </button>
        </div>
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
    mask:
        linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
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
    box-shadow:
        0 0 0 2px rgba(139, 92, 246, 0.18),
        var(--or3-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
}

@media (max-width: 768px) {
    .selected {
        border-width: 2px;
        box-shadow:
            0 0 0 2px rgba(139, 92, 246, 0.22),
            var(--or3-shadow-md, 0 4px 12px rgba(0, 0, 0, 0.4));
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

.node-meta-container {
    position: absolute;
    top: 8px;
    right: 8px;
    display: flex;
    align-items: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: 10;
}

.node-wrapper:hover .node-meta-container,
.node-wrapper.selected .node-meta-container {
    opacity: 1;
}

.node-wrapper.has-issue .node-meta-container {
    opacity: 1;
}

.node-wrapper.has-issue .inspect-btn {
    opacity: 0;
}

.node-wrapper.has-issue:hover .inspect-btn,
.node-wrapper.has-issue.selected .inspect-btn {
    opacity: 1;
}

.inspect-btn,
.issue-btn {
    font-size: 10px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    background: var(--or3-color-bg-tertiary, #18181d);
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    cursor: pointer;
    transition: all 0.2s ease;
}

.inspect-btn {
    transition:
        opacity 0.2s ease,
        color 0.2s ease,
        background 0.2s ease,
        border-color 0.2s ease;
}

.issue-btn svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
    stroke-width: 2;
}

.issue-btn.is-warning {
    color: var(--or3-color-warning, #f59e0b);
    border-color: color-mix(
        in srgb,
        var(--or3-color-warning, #f59e0b) 45%,
        transparent
    );
}

.issue-btn.is-error {
    color: var(--or3-color-error, #ef4444);
    border-color: color-mix(
        in srgb,
        var(--or3-color-error, #ef4444) 45%,
        transparent
    );
}

.inspect-btn:hover,
.issue-btn:hover {
    color: var(--or3-color-text-primary, #ffffff);
    background: var(--or3-color-bg-hover, rgba(255, 255, 255, 0.05));
    border-color: var(--or3-color-accent, #8b5cf6);
}
</style>
