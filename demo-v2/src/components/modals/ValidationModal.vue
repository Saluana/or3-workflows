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
    <div v-if="show" class="modal-overlay" @click.self="emit('close')">
        <div class="modal">
            <h2>Workflow Validation</h2>
            <div v-if="result" class="validation-result">
                <div
                    v-if="result.isValid && result.warnings.length === 0"
                    class="validation-success"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="success-icon"
                    >
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <p>Workflow is valid and ready to run!</p>
                </div>

                <div
                    v-if="result.errors.length > 0"
                    class="validation-section errors"
                >
                    <h3>Errors</h3>
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
                    <h3>Warnings</h3>
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

.modal h2 {
    margin: 0 0 16px 0;
    font-size: 18px;
    color: var(--text-primary);
}

.validation-result {
    margin-bottom: 16px;
}

.validation-success {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 8px;
    color: var(--success-color);
}

.success-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
}

.validation-success p {
    margin: 0;
    font-weight: 500;
}

.validation-section {
    margin-top: 16px;
}

.validation-section h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 8px 0;
}

.validation-section.errors h3 {
    color: var(--error-color);
}

.validation-section.warnings h3 {
    color: var(--warning-color);
}

.validation-section ul {
    margin: 0;
    padding-left: 20px;
}

.validation-section li {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 4px;
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

.btn-primary {
    background: var(--accent-color);
    color: white;
}

.btn-primary:hover {
    background: var(--accent-hover);
}
</style>
