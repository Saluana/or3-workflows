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
    <div
        v-if="show"
        class="modal-overlay"
        @click.self="hasApiKey && emit('close')"
    >
        <div class="modal">
            <h2>OpenRouter API Key</h2>
            <p>
                Enter your OpenRouter API key to enable workflow execution.
                <a href="https://openrouter.ai/keys" target="_blank"
                    >Get one here</a
                >
            </p>
            <input
                v-model="tempApiKey"
                type="password"
                placeholder="sk-or-v1-..."
                @keydown.enter="handleSave"
            />
            <div class="modal-actions">
                <button
                    v-if="hasApiKey"
                    class="btn btn-ghost"
                    @click="emit('clear')"
                >
                    Clear Key
                </button>
                <button
                    v-if="hasApiKey"
                    class="btn btn-ghost"
                    @click="emit('close')"
                >
                    Cancel
                </button>
                <button class="btn btn-primary" @click="handleSave">
                    Save
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
    margin: 0 0 8px 0;
    font-size: 18px;
    color: var(--text-primary);
}

.modal p {
    margin: 0 0 16px 0;
    color: var(--text-secondary);
    font-size: 14px;
}

.modal a {
    color: var(--accent-color);
}

.modal input {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-primary);
    color: var(--text-primary);
    font-size: 14px;
    margin-bottom: 16px;
}

.modal input:focus {
    outline: none;
    border-color: var(--accent-color);
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
</style>
