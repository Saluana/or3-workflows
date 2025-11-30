<script setup lang="ts">
import type { HITLRequest, HITLResponse } from '@or3/workflow-core';

defineProps<{
    show: boolean;
    request: HITLRequest | null;
    userInput: string;
}>();

const emit = defineEmits<{
    'update:userInput': [value: string];
    approve: [];
    reject: [];
    skip: [];
    custom: [response: HITLResponse];
}>();
</script>

<template>
    <div v-if="show && request" class="modal-overlay hitl-overlay">
        <div class="modal hitl-modal">
            <div class="hitl-header">
                <div class="hitl-icon">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 16v-4"></path>
                        <path d="M12 8h.01"></path>
                    </svg>
                </div>
                <h2>Human Review Required</h2>
                <span class="hitl-mode-badge">{{ request.mode }}</span>
            </div>

            <div class="hitl-content">
                <p class="hitl-node-info">
                    <strong>Node:</strong> {{ request.nodeId }}
                </p>

                <div v-if="request.prompt" class="hitl-prompt">
                    {{ request.prompt }}
                </div>

                <div v-if="request.context" class="hitl-context">
                    <h4>Context</h4>
                    <pre>{{
                        typeof request.context === 'string'
                            ? request.context
                            : JSON.stringify(request.context, null, 2)
                    }}</pre>
                </div>

                <!-- Input mode: show text input -->
                <div v-if="request.mode === 'input'" class="hitl-input-section">
                    <label class="form-label">Your Input</label>
                    <textarea
                        :value="userInput"
                        class="hitl-textarea"
                        placeholder="Enter your response..."
                        rows="4"
                        @input="
                            emit(
                                'update:userInput',
                                ($event.target as HTMLTextAreaElement).value
                            )
                        "
                    ></textarea>
                </div>

                <!-- Custom options if provided -->
                <div v-if="request.options?.length" class="hitl-options">
                    <button
                        v-for="option in request.options"
                        :key="option.id"
                        class="btn hitl-option-btn"
                        :class="{
                            'btn-primary': option.action === 'approve',
                            'btn-danger': option.action === 'reject',
                            'btn-ghost': option.action === 'skip',
                        }"
                        @click="
                            emit('custom', {
                                requestId: request.id,
                                action: option.action,
                                data: userInput || undefined,
                                respondedAt: new Date().toISOString(),
                            })
                        "
                    >
                        {{ option.label }}
                    </button>
                </div>
            </div>

            <div class="modal-actions hitl-actions">
                <button class="btn btn-ghost" @click="emit('skip')">
                    Skip
                </button>
                <button class="btn btn-danger" @click="emit('reject')">
                    Reject
                </button>
                <button class="btn btn-primary" @click="emit('approve')">
                    {{ request.mode === 'input' ? 'Submit' : 'Approve' }}
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

.hitl-overlay {
    z-index: 2000;
}

.modal {
    background: var(--bg-secondary);
    border-radius: 12px;
    padding: 24px;
    min-width: 400px;
    max-width: 90vw;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
}

.hitl-modal {
    max-width: 600px;
    width: 100%;
}

.hitl-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
}

.hitl-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--warning-bg, rgba(250, 204, 21, 0.1));
    display: flex;
    align-items: center;
    justify-content: center;
}

.hitl-icon svg {
    width: 24px;
    height: 24px;
    color: var(--warning-color);
}

.hitl-header h2 {
    margin: 0;
    flex: 1;
    font-size: 18px;
    color: var(--text-primary);
}

.hitl-mode-badge {
    padding: 4px 10px;
    background: var(--bg-tertiary);
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    text-transform: capitalize;
}

.hitl-content {
    margin-bottom: 20px;
}

.hitl-node-info {
    font-size: 13px;
    color: var(--text-secondary);
    margin: 0 0 12px 0;
}

.hitl-prompt {
    padding: 12px 16px;
    background: var(--bg-tertiary);
    border-radius: 8px;
    font-size: 14px;
    color: var(--text-primary);
    margin-bottom: 12px;
    line-height: 1.5;
}

.hitl-context {
    margin-bottom: 12px;
}

.hitl-context h4 {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0 0 8px 0;
}

.hitl-context pre {
    padding: 12px;
    background: var(--bg-primary);
    border-radius: 6px;
    font-size: 12px;
    overflow-x: auto;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
}

.hitl-input-section {
    margin-top: 12px;
}

.form-label {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: var(--text-secondary);
    margin-bottom: 6px;
}

.hitl-textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    resize: vertical;
    font-family: inherit;
}

.hitl-textarea:focus {
    outline: none;
    border-color: var(--accent-color);
}

.hitl-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 12px;
}

.hitl-option-btn {
    flex: 1;
    min-width: 100px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.hitl-actions {
    border-top: 1px solid var(--border-color);
    padding-top: 16px;
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

.btn-danger {
    background: var(--error-color);
    color: white;
}

.btn-danger:hover {
    opacity: 0.9;
}
</style>
