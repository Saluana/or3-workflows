<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import {
    WorkflowEditor,
    validateWorkflow,
    type ValidationError,
    type ValidationResult,
    type ValidationWarning,
} from 'or3-workflow-core';

const props = defineProps<{
    editor: WorkflowEditor;
}>();

const validation = ref<ValidationResult>({
    isValid: true,
    errors: [],
    warnings: [],
});
const lastRunAt = ref<number | null>(null);
const isCollapsed = ref(true);

let unsubUpdate: (() => void) | null = null;
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

const runValidation = () => {
    validation.value = validateWorkflow(
        [...props.editor.getNodes()],
        [...props.editor.getEdges()]
    );
    lastRunAt.value = Date.now();
};

const scheduleValidation = () => {
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(runValidation, 120);
};

onMounted(() => {
    runValidation();
    unsubUpdate = props.editor.on('update', scheduleValidation);
});

onUnmounted(() => {
    unsubUpdate?.();
    if (debounceTimeout) clearTimeout(debounceTimeout);
});

const issues = computed<(ValidationError | ValidationWarning)[]>(() => [
    ...validation.value.errors,
    ...validation.value.warnings,
]);
const isClean = computed(() => issues.value.length === 0);
const lastRunLabel = computed(() =>
    lastRunAt.value ? new Date(lastRunAt.value).toLocaleTimeString() : ''
);
</script>

<template>
    <div class="validation-overlay" :class="{ 'has-issues': !isClean }">
        <div class="overlay-header" @click="isCollapsed = !isCollapsed">
            <div class="title">
                <span :class="['status-dot', isClean ? 'ok' : 'warn']" />
                <span>Validation</span>
            </div>
            <div class="header-actions">
                <button
                    v-if="!isCollapsed"
                    type="button"
                    class="refresh"
                    @click.stop="runValidation"
                >
                    Re-run
                </button>
                <span
                    v-if="isCollapsed && validation.errors.length"
                    class="header-count error"
                >
                    {{ validation.errors.length }} error{{
                        validation.errors.length === 1 ? '' : 's'
                    }}
                </span>
                <span
                    v-if="isCollapsed && validation.warnings.length"
                    class="header-count warning"
                >
                    {{ validation.warnings.length }} warning{{
                        validation.warnings.length === 1 ? '' : 's'
                    }}
                </span>
                <span v-if="isCollapsed && isClean" class="header-count ok"
                    >All clear</span
                >
                <svg
                    class="collapse-chevron"
                    :class="{ expanded: !isCollapsed }"
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                >
                    <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="currentColor"
                        stroke-width="1.5"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            </div>
        </div>

        <div class="collapsible-content" :class="{ collapsed: isCollapsed }">
            <div class="collapsible-inner">
                <div class="summary">
                    <span v-if="validation.errors.length" class="count error">
                        {{ validation.errors.length }} error{{
                            validation.errors.length === 1 ? '' : 's'
                        }}
                    </span>
                    <span
                        v-if="validation.warnings.length"
                        class="count warning"
                    >
                        {{ validation.warnings.length }} warning{{
                            validation.warnings.length === 1 ? '' : 's'
                        }}
                    </span>
                    <span v-if="isClean" class="count ok">All clear</span>
                    <span v-if="lastRunLabel" class="timestamp">
                        Updated {{ lastRunLabel }}
                    </span>
                </div>

                <div v-if="issues.length" class="issue-list">
                    <div
                        v-for="issue in issues"
                        :key="
                            issue.code +
                            (issue.nodeId || '') +
                            (issue.edgeId || '') +
                            issue.message
                        "
                        :class="['issue', issue.type]"
                    >
                        <span class="badge">
                            {{ issue.type === 'error' ? 'Error' : 'Warning' }}
                        </span>
                        <div class="details">
                            <div class="message">{{ issue.message }}</div>
                            <div class="meta" v-if="issue.nodeId">
                                Node: {{ issue.nodeId }}
                            </div>
                            <div class="meta" v-else-if="issue.edgeId">
                                Edge: {{ issue.edgeId }}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.validation-overlay {
    position: absolute;
    right: 16px;
    top: 16px;
    width: min(360px, calc(100vw - 32px));
    max-height: calc(100vh - 96px);
    background: var(--or3-color-surface, rgba(20, 20, 28, 0.9));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 10px);
    padding: 12px;
    box-shadow: var(--or3-shadow-lg, 0 10px 30px rgba(0, 0, 0, 0.35));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.92));
    backdrop-filter: blur(10px);
}

.validation-overlay.has-issues {
    border-color: var(--or3-color-accent, #ff6b6b);
}

.overlay-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
}

.title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    letter-spacing: 0.2px;
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}

.collapse-chevron {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.6));
    transition: transform 0.25s ease;
    flex-shrink: 0;
}

.collapse-chevron.expanded {
    transform: rotate(180deg);
}

.header-count {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.header-count.error {
    color: #ff8a8a;
    border-color: rgba(255, 138, 138, 0.3);
}

.header-count.warning {
    color: #facc15;
    border-color: rgba(250, 204, 21, 0.3);
}

.header-count.ok {
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
}

.collapsible-content {
    display: grid;
    grid-template-rows: 1fr;
    overflow: hidden;
    transition: grid-template-rows 0.25s ease;
}

.collapsible-content.collapsed {
    grid-template-rows: 0fr;
}

.collapsible-inner {
    min-height: 0;
    overflow: hidden;
}

.collapsible-content:not(.collapsed) .collapsible-inner {
    padding-top: 10px;
    overflow-y: auto;
    max-height: min(60vh, 520px);
    scrollbar-width: thin;
}

.status-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    display: inline-block;
    background: var(--or3-color-border, rgba(255, 255, 255, 0.5));
    box-shadow: 0 0 0 4px rgba(255, 255, 255, 0.08);
}

.status-dot.ok {
    background: #4ade80;
    box-shadow: 0 0 0 4px rgba(74, 222, 128, 0.12);
}

.status-dot.warn {
    background: #fbbf24;
    box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.12);
}

.refresh {
    background: var(--or3-color-bg-elevated, #1c1c27);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.75));
    border-radius: var(--or3-radius-sm, 6px);
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.refresh:hover {
    border-color: var(--or3-color-accent, #8b5cf6);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.summary {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    font-size: 12px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
    margin-bottom: 8px;
}

.count {
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.count.error {
    color: #ff8a8a;
    border-color: rgba(255, 138, 138, 0.3);
}

.count.warning {
    color: #facc15;
    border-color: rgba(250, 204, 21, 0.3);
}

.count.ok {
    color: #4ade80;
    border-color: rgba(74, 222, 128, 0.3);
}

.timestamp {
    margin-left: auto;
    font-style: italic;
}

.issue-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.issue {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 8px;
    padding: 8px;
    border-radius: var(--or3-radius-sm, 6px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.1));
    background: var(--or3-color-bg-elevated, rgba(22, 22, 30, 0.85));
}

.issue.error {
    border-color: rgba(255, 138, 138, 0.25);
}

.issue.warning {
    border-color: rgba(250, 204, 21, 0.25);
}

.badge {
    align-self: start;
    padding: 4px 8px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    color: #0a0a0f;
    background: #facc15;
}

.issue.error .badge {
    background: #ff8a8a;
}

.details {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.message {
    font-size: 13px;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.meta {
    font-size: 11px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
}

@media (max-width: 768px) {
    .validation-overlay {
        left: 16px;
        right: 16px;
        top: 12px;
        width: auto;
        max-width: none;
    }

    .collapsible-content:not(.collapsed) .collapsible-inner {
        max-height: min(50vh, 420px);
    }
}
</style>
