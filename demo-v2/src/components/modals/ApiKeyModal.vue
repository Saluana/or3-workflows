<script setup lang="ts">
defineProps<{
    show: boolean;
    hasApiKey: boolean;
}>();

const tempApiKey = defineModel<string>('tempApiKey', { default: '' });

const emit = defineEmits<{
    close: [];
    save: [];
    clear: [];
}>();

function handleSave() {
    if (!tempApiKey.value.trim()) return;
    emit('save');
}
</script>

<template>
    <Transition name="modal">
        <div
            v-if="show"
            class="modal-overlay"
            @click.self="hasApiKey && emit('close')"
        >
            <div class="modal">
                <div class="modal-icon">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"/>
                    </svg>
                </div>
                <h2>Connect to OpenRouter</h2>
                <p class="modal-desc">
                    Your API key enables secure access to AI models for workflow execution.
                    Keys are stored locally and never sent to external servers.
                </p>
                
                <label class="input-label">API Key</label>
                <input
                    v-model="tempApiKey"
                    type="password"
                    placeholder="sk-or-v1-..."
                    class="input"
                    @keydown.enter="handleSave"
                />
                
                <p class="modal-hint">
                    Don't have a key? <a href="https://openrouter.ai/keys" target="_blank" rel="noopener">Get one from OpenRouter →</a>
                </p>
                
                <div class="modal-actions">
                    <button
                        v-if="hasApiKey"
                        class="btn btn-danger-ghost"
                        @click="emit('clear')"
                    >
                        Remove Key
                    </button>
                    <div class="spacer"></div>
                    <button
                        v-if="hasApiKey"
                        class="btn btn-ghost"
                        @click="emit('close')"
                    >
                        Cancel
                    </button>
                    <button class="btn btn-primary" @click="handleSave">
                        Save Key
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

.input-label {
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

.modal-hint {
    margin: var(--or3-spacing-md, 12px) 0 var(--or3-spacing-xl, 24px);
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.modal-hint a {
    color: var(--or3-color-accent, #8b5cf6);
    text-decoration: none;
    font-weight: var(--or3-font-medium, 500);
}

.modal-hint a:hover {
    text-decoration: underline;
}

.modal-actions {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    padding-top: var(--or3-spacing-lg, 16px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
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
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.btn-ghost:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.btn-danger-ghost {
    background: transparent;
    color: var(--or3-color-error, #ef4444);
}

.btn-danger-ghost:hover {
    background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.1));
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
