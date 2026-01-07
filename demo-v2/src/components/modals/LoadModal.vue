<script setup lang="ts">
import type { WorkflowSummary } from 'or3-workflow-core';

defineProps<{
    show: boolean;
    workflows: WorkflowSummary[];
}>();

const emit = defineEmits<{
    close: [];
    load: [workflow: WorkflowSummary];
    delete: [id: string];
}>();
</script>

<template>
    <Transition name="modal">
        <div v-if="show" class="modal-overlay" @click.self="emit('close')">
            <div class="modal modal-lg">
                <div class="modal-header">
                    <div class="modal-icon">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path
                                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h2>Your Workflows</h2>
                        <p class="modal-subtitle">
                            Select a workflow to continue editing
                        </p>
                    </div>
                </div>

                <div v-if="workflows.length > 0" class="workflow-list">
                    <div
                        v-for="workflow in workflows"
                        :key="workflow.id"
                        class="workflow-item"
                        @click="emit('load', workflow)"
                    >
                        <div class="workflow-icon">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            >
                                <circle cx="12" cy="12" r="3" />
                                <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                            </svg>
                        </div>
                        <div class="workflow-info">
                            <span class="workflow-name">{{
                                workflow.name
                            }}</span>
                            <span class="workflow-date"
                                >Last edited
                                {{
                                    new Date(
                                        workflow.updatedAt
                                    ).toLocaleDateString()
                                }}</span
                            >
                        </div>
                        <div class="workflow-actions">
                            <button
                                class="btn btn-icon"
                                title="Delete workflow"
                                @click.stop="emit('delete', workflow.id)"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                >
                                    <polyline points="3,6 5,6 21,6" />
                                    <path
                                        d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                                    />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

                <div v-else class="empty-state">
                    <div class="empty-icon">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.5"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <path
                                d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"
                            />
                        </svg>
                    </div>
                    <p class="empty-title">No workflows yet</p>
                    <p class="empty-desc">
                        Create your first workflow and save it to see it here.
                    </p>
                </div>

                <div class="modal-actions">
                    <button class="btn btn-ghost" @click="emit('close')">
                        Close
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    z-index: 1000;
    padding: var(--or3-spacing-lg, 16px);
    overflow-y: auto;
}

.modal {
    background: var(--or3-color-bg-secondary, #111115);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-xl, 20px);
    padding: var(--or3-spacing-2xl, 32px);
    width: 480px;
    max-width: min(560px, 94vw);
    box-shadow: var(--or3-shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.5));
    margin: auto;
}

.modal-lg {
    width: 520px;
}

.modal-header {
    display: flex;
    align-items: flex-start;
    gap: var(--or3-spacing-lg, 16px);
    margin-bottom: var(--or3-spacing-xl, 24px);
}

.modal-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
    border-radius: var(--or3-radius-md, 12px);
    flex-shrink: 0;
}

.modal-icon svg {
    width: 24px;
    height: 24px;
    color: var(--or3-color-accent, #8b5cf6);
}

.modal h2 {
    margin: 0;
    font-size: var(--or3-text-xl, 18px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.modal-subtitle {
    margin: var(--or3-spacing-xs, 4px) 0 0 0;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    font-size: var(--or3-text-sm, 13px);
}

.workflow-list {
    max-height: min(420px, 60vh);
    overflow-y: auto;
    margin-bottom: var(--or3-spacing-xl, 24px);
}

.workflow-item {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-md, 12px);
    padding: var(--or3-spacing-md, 12px);
    border-radius: var(--or3-radius-md, 10px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    margin-bottom: var(--or3-spacing-sm, 8px);
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
}

.workflow-item:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    border-color: var(--or3-color-accent, #8b5cf6);
}

.workflow-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--or3-color-bg-tertiary, #18181d);
    border-radius: var(--or3-radius-sm, 8px);
    flex-shrink: 0;
}

.workflow-icon svg {
    width: 18px;
    height: 18px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.workflow-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.workflow-name {
    font-weight: var(--or3-font-medium, 500);
    font-size: var(--or3-text-sm, 13px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.workflow-date {
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.workflow-actions {
    display: flex;
    gap: var(--or3-spacing-xs, 4px);
    opacity: 0;
    transition: opacity var(--or3-transition-fast, 120ms);
}

.workflow-item:hover .workflow-actions {
    opacity: 1;
}

.btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
}

.btn-icon:hover {
    background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.1));
    color: var(--or3-color-error, #ef4444);
}

.btn-icon svg {
    width: 16px;
    height: 16px;
}

.empty-state {
    text-align: center;
    padding: var(--or3-spacing-2xl, 32px) var(--or3-spacing-xl, 24px);
}

.empty-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border-radius: var(--or3-radius-lg, 16px);
    margin: 0 auto var(--or3-spacing-lg, 16px);
}

.empty-icon svg {
    width: 28px;
    height: 28px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.empty-title {
    font-size: var(--or3-text-base, 14px);
    font-weight: var(--or3-font-medium, 500);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    margin: 0 0 var(--or3-spacing-xs, 4px);
}

.empty-desc {
    font-size: var(--or3-text-sm, 13px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    margin: 0;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--or3-spacing-sm, 8px);
    padding-top: var(--or3-spacing-lg, 16px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: var(--or3-spacing-sm, 10px) var(--or3-spacing-lg, 16px);
    border: none;
    border-radius: var(--or3-radius-md, 10px);
    font-size: var(--or3-text-sm, 13px);
    font-weight: var(--or3-font-semibold, 600);
    cursor: pointer;
    transition: all var(--or3-transition-fast, 120ms);
}

.btn-ghost {
    background: transparent;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.btn-ghost:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

@media (max-width: 640px) {
    .modal {
        width: 100%;
        padding: var(--or3-spacing-xl, 24px);
        border-radius: var(--or3-radius-lg, 16px);
    }

    .workflow-list {
        max-height: min(360px, 55vh);
    }
}

/* Transitions */
.modal-enter-active,
.modal-leave-active {
    transition: opacity 0.2s ease;
}

.modal-enter-active .modal,
.modal-leave-active .modal {
    transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-from .modal,
.modal-leave-to .modal {
    transform: translateY(16px) scale(0.98);
    opacity: 0;
}
</style>
