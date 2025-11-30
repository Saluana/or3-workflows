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
    <Transition name="modal">
        <div v-if="show && request" class="modal-overlay hitl-overlay">
            <div class="modal hitl-modal">
                <div class="hitl-header">
                    <div class="hitl-icon">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        >
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M12 16v-4"></path>
                            <path d="M12 8h.01"></path>
                        </svg>
                    </div>
                    <div class="hitl-header-text">
                        <h2>Human Review Required</h2>
                        <p class="hitl-subtitle">
                            Your input is needed to continue
                        </p>
                    </div>
                    <span class="hitl-mode-badge">{{ request.mode }}</span>
                </div>

                <div class="hitl-content">
                    <div class="hitl-node-chip">
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
                        </svg>
                        {{ request.nodeId }}
                    </div>

                    <div v-if="request.prompt" class="hitl-prompt">
                        {{ request.prompt }}
                    </div>

                    <div v-if="request.context" class="hitl-context">
                        <h4>
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
                                    d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
                                />
                                <polyline points="14 2 14 8 20 8" />
                            </svg>
                            Context
                        </h4>
                        <pre>{{
                            typeof request.context === 'string'
                                ? request.context
                                : JSON.stringify(request.context, null, 2)
                        }}</pre>
                    </div>

                    <!-- Input mode: show text input -->
                    <div
                        v-if="request.mode === 'input'"
                        class="hitl-input-section"
                    >
                        <label class="form-label">Your Response</label>
                        <textarea
                            :value="userInput"
                            class="hitl-textarea"
                            placeholder="Type your response here..."
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
                        Skip for Now
                    </button>
                    <div class="spacer"></div>
                    <button
                        class="btn btn-danger-outline"
                        @click="emit('reject')"
                    >
                        Reject
                    </button>
                    <button class="btn btn-primary" @click="emit('approve')">
                        {{
                            request.mode === 'input'
                                ? 'Submit Response'
                                : 'Approve & Continue'
                        }}
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
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.hitl-overlay {
    z-index: 2000;
}

.modal {
    background: var(--or3-color-bg-secondary, #111115);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-xl, 20px);
    padding: var(--or3-spacing-2xl, 32px);
    width: 100%;
    max-width: 90vw;
    box-shadow: var(--or3-shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.5));
}

.hitl-modal {
    max-width: 560px;
}

.hitl-header {
    display: flex;
    align-items: flex-start;
    gap: var(--or3-spacing-lg, 16px);
    margin-bottom: var(--or3-spacing-xl, 24px);
}

.hitl-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--or3-radius-md, 12px);
    background: var(--or3-color-warning-muted, rgba(245, 158, 11, 0.15));
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.hitl-icon svg {
    width: 24px;
    height: 24px;
    color: var(--or3-color-warning, #f59e0b);
    filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.4));
}

.hitl-header-text {
    flex: 1;
    min-width: 0;
}

.hitl-header h2 {
    margin: 0;
    font-size: var(--or3-text-xl, 18px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.hitl-subtitle {
    margin: var(--or3-spacing-xs, 4px) 0 0 0;
    font-size: var(--or3-text-sm, 13px);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.hitl-mode-badge {
    padding: 4px 10px;
    background: var(--or3-color-bg-tertiary, #18181d);
    border-radius: var(--or3-radius-full, 9999px);
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    text-transform: capitalize;
    flex-shrink: 0;
}

.hitl-content {
    margin-bottom: var(--or3-spacing-xl, 24px);
}

.hitl-node-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--or3-spacing-xs, 6px);
    padding: var(--or3-spacing-xs, 6px) var(--or3-spacing-md, 12px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-full, 9999px);
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-medium, 500);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.hitl-node-chip svg {
    width: 12px;
    height: 12px;
    color: var(--or3-color-accent, #8b5cf6);
}

.hitl-prompt {
    padding: var(--or3-spacing-lg, 16px);
    background: var(--or3-color-bg-tertiary, #18181d);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 10px);
    font-size: var(--or3-text-sm, 13px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    margin-bottom: var(--or3-spacing-lg, 16px);
    line-height: 1.6;
}

.hitl-context {
    margin-bottom: var(--or3-spacing-lg, 16px);
    background: var(--or3-color-bg-tertiary, #18181d);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 10px);
    overflow: hidden;
}

.hitl-context h4 {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    margin: 0;
    padding: var(--or3-spacing-sm, 10px) var(--or3-spacing-md, 16px);
    background: rgba(255, 255, 255, 0.06);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

.hitl-context h4 svg {
    width: 14px;
    height: 14px;
}

.hitl-context pre {
    padding: var(--or3-spacing-md, 16px);
    font-size: var(--or3-text-xs, 12px);
    font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace;
    overflow-x: auto;
    margin: 0;
    max-height: 180px;
    overflow-y: auto;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    line-height: 1.5;
}

.hitl-input-section {
    margin-top: var(--or3-spacing-lg, 16px);
}

.form-label {
    display: block;
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--or3-spacing-sm, 8px);
}

.hitl-textarea {
    width: 100%;
    padding: var(--or3-spacing-md, 12px) var(--or3-spacing-lg, 16px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 10px);
    background: var(--or3-color-bg-tertiary, #18181d);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: var(--or3-text-sm, 13px);
    resize: vertical;
    font-family: inherit;
    line-height: 1.5;
    transition: all var(--or3-transition-fast, 120ms);
}

.hitl-textarea:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: 0 0 0 3px
        var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
}

.hitl-textarea::placeholder {
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.hitl-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--or3-spacing-sm, 8px);
    margin-top: var(--or3-spacing-lg, 16px);
}

.hitl-option-btn {
    flex: 1;
    min-width: 100px;
}

.modal-actions {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.hitl-actions {
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    padding-top: var(--or3-spacing-lg, 16px);
}

.spacer {
    flex: 1;
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
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.btn-ghost:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.btn-primary {
    background: linear-gradient(
        135deg,
        var(--or3-color-accent, #8b5cf6),
        #a78bfa
    );
    color: white;
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.3);
}

.btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(139, 92, 246, 0.4);
}

.btn-danger {
    background: var(--or3-color-error, #ef4444);
    color: white;
}

.btn-danger:hover {
    background: #dc2626;
    transform: translateY(-1px);
}

.btn-danger-outline {
    background: transparent;
    color: var(--or3-color-error, #ef4444);
    border: 1px solid var(--or3-color-error, #ef4444);
}

.btn-danger-outline:hover {
    background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.1));
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
