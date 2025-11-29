<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { Edge } from '@vue-flow/core';

const props = defineProps<{
    edge: Edge | null;
    show: boolean;
}>();

const emit = defineEmits<{
    (e: 'close'): void;
    (e: 'update', edgeId: string, label: string): void;
    (e: 'delete', edgeId: string): void;
}>();

const localLabel = ref('');
const inputRef = ref<HTMLInputElement | null>(null);
const showDeleteConfirm = ref(false);

watch(
    () => props.edge,
    (edge) => {
        if (edge) {
            localLabel.value = (edge.label as string) || '';
        }
    },
    { immediate: true }
);

// Focus input when modal opens
watch(
    () => props.show,
    (show) => {
        if (show) {
            showDeleteConfirm.value = false;
            nextTick(() => {
                inputRef.value?.focus();
                inputRef.value?.select();
            });
        }
    }
);

function saveLabel() {
    if (!props.edge) return;
    emit('update', props.edge.id, localLabel.value);
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
        saveLabel();
        emit('close');
    } else if (event.key === 'Escape') {
        emit('close');
    }
}

function handleDelete() {
    if (!props.edge) return;
    if (showDeleteConfirm.value) {
        emit('delete', props.edge.id);
        showDeleteConfirm.value = false;
    } else {
        showDeleteConfirm.value = true;
    }
}

function cancelDelete() {
    showDeleteConfirm.value = false;
}
</script>

<template>
    <Transition name="modal">
        <div
            v-if="show && edge"
            class="edge-editor-overlay"
            @click.self="emit('close')"
        >
            <div class="edge-editor">
                <div class="editor-header">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="header-icon"
                    >
                        <path
                            d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"
                        ></path>
                        <path d="M7 7h.01"></path>
                    </svg>
                    <span>Edge Label</span>
                    <button class="close-btn" @click="emit('close')">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div class="editor-content">
                    <input
                        ref="inputRef"
                        v-model="localLabel"
                        type="text"
                        class="label-input"
                        placeholder="Enter edge label (e.g., 'Technical', 'Sales')"
                        @input="saveLabel"
                        @keydown="handleKeydown"
                    />
                    <p class="hint">
                        This label is shown on the connection line and helps the
                        router make decisions.
                    </p>

                    <!-- Delete confirmation -->
                    <div v-if="showDeleteConfirm" class="delete-confirm">
                        <span>Delete this connection?</span>
                        <div class="confirm-actions">
                            <button
                                class="confirm-btn confirm-yes"
                                @click="handleDelete"
                            >
                                Yes, delete
                            </button>
                            <button
                                class="confirm-btn confirm-no"
                                @click="cancelDelete"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>

                    <button v-else class="delete-btn" @click="handleDelete">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path
                                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                            ></path>
                        </svg>
                        Delete Connection
                    </button>
                </div>
            </div>
        </div>
    </Transition>
</template>

<style scoped>
.edge-editor-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.edge-editor {
    background: var(--or3-color-surface, rgba(26, 26, 36, 0.95));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-lg, 16px);
    padding: var(--or3-spacing-lg, 24px);
    min-width: 320px;
    max-width: 90vw;
    box-shadow: var(--or3-shadow-xl, 0 25px 50px rgba(0, 0, 0, 0.5));
}

.editor-header {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    margin-bottom: var(--or3-spacing-md, 16px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-weight: 600;
    font-size: 15px;
}

.header-icon {
    width: 18px;
    height: 18px;
    color: var(--or3-color-accent, #8b5cf6);
}

.close-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    transition: all 0.15s ease;
}

.close-btn:hover {
    background: var(--or3-color-surface-hover, rgba(255, 255, 255, 0.05));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.close-btn svg {
    width: 16px;
    height: 16px;
}

.editor-content {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.label-input {
    width: 100%;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: var(--or3-color-bg-tertiary, #1a1a24);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 10px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: 14px;
}

.label-input:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: 0 0 0 2px var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
}

.hint {
    font-size: 12px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    margin: 0;
    line-height: 1.4;
}

.delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--or3-spacing-sm, 8px);
    margin-top: var(--or3-spacing-md, 16px);
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: transparent;
    border: 1px solid var(--or3-color-error, #ef4444);
    color: var(--or3-color-error, #ef4444);
    border-radius: var(--or3-radius-md, 10px);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
}

.delete-btn:hover {
    background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.2));
}

.delete-btn svg {
    width: 14px;
    height: 14px;
}

/* Delete confirmation */
.delete-confirm {
    margin-top: var(--or3-spacing-md, 16px);
    padding: var(--or3-spacing-md, 16px);
    background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.1));
    border: 1px solid var(--or3-color-error, #ef4444);
    border-radius: var(--or3-radius-md, 10px);
    text-align: center;
}

.delete-confirm span {
    display: block;
    font-size: 14px;
    font-weight: 500;
    color: var(--or3-color-error, #ef4444);
    margin-bottom: var(--or3-spacing-sm, 8px);
}

.confirm-actions {
    display: flex;
    gap: var(--or3-spacing-sm, 8px);
    justify-content: center;
}

.confirm-btn {
    padding: var(--or3-spacing-xs, 4px) var(--or3-spacing-md, 16px);
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
}

.confirm-yes {
    background: var(--or3-color-error, #ef4444);
    color: white;
    border: none;
}

.confirm-yes:hover {
    background: #dc2626;
}

.confirm-no {
    background: transparent;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.confirm-no:hover {
    background: var(--or3-color-surface-hover, rgba(255, 255, 255, 0.05));
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
    transition: opacity 0.2s ease;
}

.modal-enter-active .edge-editor,
.modal-leave-active .edge-editor {
    transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
    opacity: 0;
}

.modal-enter-from .edge-editor,
.modal-leave-to .edge-editor {
    transform: scale(0.95);
    opacity: 0;
}
</style>
