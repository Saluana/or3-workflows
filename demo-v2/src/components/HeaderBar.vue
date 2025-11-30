<script setup lang="ts">
defineProps<{
    workflowName: string;
    workflowDescription: string;
    canUndo: boolean;
    canRedo: boolean;
    hasApiKey: boolean;
    showChatPanel: boolean;
}>();

const emit = defineEmits<{
    'update:workflowName': [value: string];
    'update:workflowDescription': [value: string];
    'update:showChatPanel': [value: boolean];
    undo: [];
    redo: [];
    save: [];
    load: [];
    export: [];
    import: [event: Event];
    validate: [];
    openApiKeyModal: [];
}>();
</script>

<template>
    <header class="header">
        <div class="header-left">
            <h1 class="logo">or3-workflow</h1>
            <span class="version">v2</span>
            <div class="meta-inputs">
                <input
                    :value="workflowName"
                    class="meta-input"
                    placeholder="Workflow name"
                    @input="
                        emit(
                            'update:workflowName',
                            ($event.target as HTMLInputElement).value
                        )
                    "
                />
                <input
                    :value="workflowDescription"
                    class="meta-input"
                    placeholder="Description (optional)"
                    @input="
                        emit(
                            'update:workflowDescription',
                            ($event.target as HTMLInputElement).value
                        )
                    "
                />
            </div>
        </div>

        <div class="header-center">
            <button
                class="btn btn-ghost"
                :disabled="!canUndo"
                title="Undo (Ctrl+Z)"
                @click="emit('undo')"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path d="M3 7v6h6"></path>
                    <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"></path>
                </svg>
            </button>
            <button
                class="btn btn-ghost"
                :disabled="!canRedo"
                title="Redo (Ctrl+Shift+Z)"
                @click="emit('redo')"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path d="M21 7v6h-6"></path>
                    <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"></path>
                </svg>
            </button>
            <div class="divider"></div>
            <button class="btn btn-ghost" title="Save" @click="emit('save')">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path
                        d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                    ></path>
                    <path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"></path>
                    <path d="M7 3v4a1 1 0 0 0 1 1h7"></path>
                </svg>
            </button>
            <button class="btn btn-ghost" title="Load" @click="emit('load')">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path
                        d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
                    ></path>
                </svg>
            </button>
            <button
                class="btn btn-ghost"
                title="Export"
                @click="emit('export')"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" x2="12" y1="15" y2="3"></line>
                </svg>
            </button>
            <label class="btn btn-ghost" title="Import">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" x2="12" y1="3" y2="15"></line>
                </svg>
                <input
                    type="file"
                    accept=".json"
                    class="hidden-input"
                    @change="emit('import', $event)"
                />
            </label>
            <div class="divider"></div>
            <button
                class="btn btn-ghost"
                title="Validate"
                @click="emit('validate')"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <span class="btn-text">Validate</span>
            </button>
        </div>

        <div class="header-right">
            <button class="btn btn-ghost" @click="emit('openApiKeyModal')">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path
                        d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
                    ></path>
                </svg>
                <span class="btn-text">{{
                    hasApiKey ? 'API Key Set' : 'Set API Key'
                }}</span>
            </button>
            <button
                class="btn btn-ghost"
                title="Toggle Chat"
                @click="emit('update:showChatPanel', !showChatPanel)"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="icon"
                >
                    <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>
                </svg>
            </button>
        </div>
    </header>
</template>

<style scoped>
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 16px;
    background: var(--bg-secondary);
    border-bottom: 1px solid var(--border-color);
    gap: 16px;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
}

.logo {
    font-size: 18px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
}

.version {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--accent-color);
    color: white;
    border-radius: 4px;
    font-weight: 600;
}

.meta-inputs {
    display: flex;
    gap: 8px;
}

.meta-input {
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 13px;
    color: var(--text-primary);
    width: 160px;
}

.meta-input:focus {
    outline: none;
    border-color: var(--accent-color);
}

.header-center {
    display: flex;
    align-items: center;
    gap: 4px;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 8px;
}

.divider {
    width: 1px;
    height: 24px;
    background: var(--border-color);
    margin: 0 8px;
}

.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 12px;
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

.btn-ghost:hover:not(:disabled) {
    background: var(--bg-tertiary);
    color: var(--text-primary);
}

.btn-ghost:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.icon {
    width: 18px;
    height: 18px;
}

.btn-text {
    white-space: nowrap;
}

.hidden-input {
    display: none;
}

@media (max-width: 900px) {
    .meta-inputs {
        display: none;
    }

    .btn-text {
        display: none;
    }
}

@media (max-width: 600px) {
    .header {
        padding: 0 8px;
    }

    .header-center {
        gap: 2px;
    }

    .divider {
        margin: 0 4px;
    }
}
</style>
