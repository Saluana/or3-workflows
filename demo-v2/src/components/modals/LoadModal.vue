<script setup lang="ts">
import type { WorkflowSummary } from '@or3/workflow-core';

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
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
        <div class="modal modal-lg">
            <h2>Load Workflow</h2>
            <div v-if="workflows.length > 0" class="workflow-list">
                <div
                    v-for="workflow in workflows"
                    :key="workflow.id"
                    class="workflow-item"
                >
                    <div class="workflow-info">
                        <span class="workflow-name">{{ workflow.name }}</span>
                        <span class="workflow-date">{{
                            new Date(workflow.updatedAt).toLocaleDateString()
                        }}</span>
                    </div>
                    <div class="workflow-actions">
                        <button
                            class="btn btn-primary btn-sm"
                            @click="emit('load', workflow)"
                        >
                            Load
                        </button>
                        <button
                            class="btn btn-ghost btn-sm"
                            @click="emit('delete', workflow.id)"
                        >
                            Delete
                        </button>
                    </div>
                </div>
            </div>
            <div v-else class="empty-state">
                <p>No saved workflows yet.</p>
            </div>
            <div class="modal-actions">
                <button class="btn btn-ghost" @click="emit('close')">
                    Close
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
}

.modal {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 90vw;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.modal-lg {
    min-width: 500px;
}

.modal h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: var(--text-primary);
}

.workflow-list {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: 16px;
}

.workflow-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    border-radius: 8px;
    transition: background 0.15s ease;
}

.workflow-item:hover {
    background: var(--bg-tertiary);
}

.workflow-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.workflow-name {
    font-weight: 500;
    color: var(--text-primary);
}

.workflow-date {
    font-size: 12px;
    color: var(--text-tertiary);
}

.workflow-actions {
    display: flex;
    gap: 8px;
}

.empty-state {
    text-align: center;
    padding: 32px;
    color: var(--text-tertiary);
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
}

.btn-ghost {
    background: transparent;
    color: var(--text-secondary);
}

.btn-ghost:hover {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.btn-primary {
    background: var(--accent-color);
    color: white;
}

.btn-primary:hover {
    background: var(--accent-hover);
}

.btn-sm {
    padding: 6px 12px;
    font-size: 12px;
}
</style>
