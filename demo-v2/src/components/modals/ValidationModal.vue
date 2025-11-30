<script setup lang="ts">
import type { validateWorkflow } from '@or3/workflow-core';

defineProps<{
    show: boolean;
    result: ReturnType<typeof validateWorkflow> | null;
}>();

const emit = defineEmits<{
    close: [];
}>();
</script>

<template>
    <Transition name="modal">
        <div v-if="show" class="modal-overlay" @click.self="emit('close')">
            <div class="modal">
                <div class="modal-header">
                    <div class="modal-icon" :class="{ 'icon-success': result?.isValid && result?.warnings.length === 0, 'icon-error': result && result.errors.length > 0, 'icon-warning': result?.isValid && result && result.warnings.length > 0 }">
                        <svg v-if="result?.isValid && result?.errors.length === 0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                            <polyline points="22,4 12,14.01 9,11.01"/>
                        </svg>
                        <svg v-else-if="result && result.errors.length > 0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="15" y1="9" x2="9" y2="15"/>
                            <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                        <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                            <line x1="12" y1="9" x2="12" y2="13"/>
                            <line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <div>
                        <h2>Workflow Validation</h2>
                        <p class="modal-subtitle" v-if="result?.isValid && result?.warnings.length === 0">Your workflow passed all checks</p>
                        <p class="modal-subtitle" v-else-if="result && result.errors.length > 0">Please fix the issues below</p>
                        <p class="modal-subtitle" v-else>Review the warnings below</p>
                    </div>
                </div>
                
                <div v-if="result" class="validation-result">
                    <div
                        v-if="result.isValid && result.warnings.length === 0"
                        class="validation-success"
                    >
                        <p>All nodes are properly connected and configured. Your workflow is ready to execute.</p>
                    </div>

                    <div
                        v-if="result.errors.length > 0"
                        class="validation-section errors"
                    >
                        <h3>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                            {{ result.errors.length }} Error{{ result.errors.length > 1 ? 's' : '' }}
                        </h3>
                        <ul>
                            <li v-for="(err, i) in result.errors" :key="'err-' + i">
                                {{ err.message }}
                            </li>
                        </ul>
                    </div>

                    <div
                        v-if="result.warnings.length > 0"
                        class="validation-section warnings"
                    >
                        <h3>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                <line x1="12" y1="9" x2="12" y2="13"/>
                                <line x1="12" y1="17" x2="12.01" y2="17"/>
                            </svg>
                            {{ result.warnings.length }} Warning{{ result.warnings.length > 1 ? 's' : '' }}
                        </h3>
                        <ul>
                            <li
                                v-for="(warn, i) in result.warnings"
                                :key="'warn-' + i"
                            >
                                {{ warn.message }}
                            </li>
                        </ul>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-primary" @click="emit('close')">
                        Got it
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

.modal {
    background: var(--or3-color-bg-secondary, #111115);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-xl, 20px);
    padding: var(--or3-spacing-2xl, 32px);
    width: 440px;
    max-width: 90vw;
    box-shadow: var(--or3-shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.5));
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
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border-radius: var(--or3-radius-md, 12px);
    flex-shrink: 0;
}

.modal-icon svg {
    width: 24px;
    height: 24px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.modal-icon.icon-success {
    background: var(--or3-color-success-muted, rgba(34, 197, 94, 0.15));
}

.modal-icon.icon-success svg {
    color: var(--or3-color-success, #22c55e);
    filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.4));
}

.modal-icon.icon-error {
    background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.15));
}

.modal-icon.icon-error svg {
    color: var(--or3-color-error, #ef4444);
    filter: drop-shadow(0 0 8px rgba(239, 68, 68, 0.4));
}

.modal-icon.icon-warning {
    background: var(--or3-color-warning-muted, rgba(245, 158, 11, 0.15));
}

.modal-icon.icon-warning svg {
    color: var(--or3-color-warning, #f59e0b);
    filter: drop-shadow(0 0 8px rgba(245, 158, 11, 0.4));
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

.validation-result {
    margin-bottom: var(--or3-spacing-xl, 24px);
}

.validation-success {
    padding: var(--or3-spacing-lg, 16px);
    background: var(--or3-color-success-muted, rgba(34, 197, 94, 0.1));
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: var(--or3-radius-md, 10px);
}

.validation-success p {
    margin: 0;
    color: var(--or3-color-success, #22c55e);
    font-size: var(--or3-text-sm, 13px);
    line-height: 1.5;
}

.validation-section {
    margin-top: var(--or3-spacing-lg, 16px);
}

.validation-section h3 {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 var(--or3-spacing-sm, 8px) 0;
}

.validation-section.errors h3 {
    color: var(--or3-color-error, #ef4444);
}

.validation-section.warnings h3 {
    color: var(--or3-color-warning, #f59e0b);
}

.validation-section ul {
    margin: 0;
    padding: 0;
    list-style: none;
}

.validation-section li {
    font-size: var(--or3-text-sm, 13px);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border-radius: var(--or3-radius-sm, 6px);
    margin-bottom: var(--or3-spacing-xs, 4px);
    line-height: 1.5;
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
