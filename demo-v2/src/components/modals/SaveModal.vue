<script setup lang="ts">
defineProps<{
    show: boolean;
    workflowName: string;
}>();

const emit = defineEmits<{
    'update:workflowName': [value: string];
    close: [];
    save: [];
}>();
</script>

<template>
    <Transition name="modal">
        <div v-if="show" class="modal-overlay" @click.self="emit('close')">
            <div class="modal">
                <div class="modal-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17,21 17,13 7,13 7,21"/>
                        <polyline points="7,3 7,8 15,8"/>
                    </svg>
                </div>
                <h2>Save Workflow</h2>
                <p class="modal-desc">
                    Give your workflow a descriptive name. Saved workflows are stored locally in your browser.
                </p>
                
                <label class="form-label">Workflow Name</label>
                <input
                    :value="workflowName"
                    type="text"
                    placeholder="e.g., Customer Support Agent"
                    class="input"
                    @input="
                        emit(
                            'update:workflowName',
                            ($event.target as HTMLInputElement).value
                        )
                    "
                    @keydown.enter="emit('save')"
                />
                
                <div class="modal-actions">
                    <button class="btn btn-ghost" @click="emit('close')">
                        Cancel
                    </button>
                    <button class="btn btn-primary" @click="emit('save')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20,6 9,17 4,12"/>
                        </svg>
                        Save Workflow
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
    width: 420px;
    max-width: 90vw;
    box-shadow: var(--or3-shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.5));
}

.modal-icon {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
    border-radius: var(--or3-radius-md, 12px);
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.modal-icon svg {
    width: 24px;
    height: 24px;
    color: var(--or3-color-accent, #8b5cf6);
}

.modal h2 {
    margin: 0 0 var(--or3-spacing-sm, 8px) 0;
    font-size: var(--or3-text-xl, 18px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.modal-desc {
    margin: 0 0 var(--or3-spacing-xl, 24px) 0;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    font-size: var(--or3-text-sm, 13px);
    line-height: 1.6;
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

.input {
    width: 100%;
    padding: var(--or3-spacing-md, 12px) var(--or3-spacing-lg, 16px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 10px);
    background: var(--or3-color-bg-tertiary, #18181d);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: var(--or3-text-sm, 13px);
    margin-bottom: var(--or3-spacing-xl, 24px);
    transition: all var(--or3-transition-fast, 120ms);
}

.input:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: 0 0 0 3px var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
}

.input::placeholder {
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
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

.btn-primary svg {
    width: 16px;
    height: 16px;
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
