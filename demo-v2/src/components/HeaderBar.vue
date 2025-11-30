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
        <!-- Brand Section -->
        <div class="header-brand">
            <div class="logo-group">
                <span class="logo">or3-workflow</span>
                <span class="version-badge">v2</span>
            </div>
            <div class="meta-section">
                <input
                    :value="workflowName"
                    class="workflow-name-input"
                    placeholder="Untitled"
                    @input="
                        emit(
                            'update:workflowName',
                            ($event.target as HTMLInputElement).value
                        )
                    "
                />
                <input
                    :value="workflowDescription"
                    class="workflow-desc-input"
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

        <!-- Toolbar Section -->
        <div class="header-toolbar">
            <!-- History Controls -->
            <div class="toolbar-group">
                <button
                    class="toolbar-btn"
                    :class="{ disabled: !canUndo }"
                    :disabled="!canUndo"
                    title="Undo (⌘Z)"
                    @click="emit('undo')"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="toolbar-icon"
                    >
                        <path d="M3 7v6h6"></path>
                        <path
                            d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
                        ></path>
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    :class="{ disabled: !canRedo }"
                    :disabled="!canRedo"
                    title="Redo (⌘⇧Z)"
                    @click="emit('redo')"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="toolbar-icon"
                    >
                        <path d="M21 7v6h-6"></path>
                        <path
                            d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"
                        ></path>
                    </svg>
                </button>
            </div>

            <div class="toolbar-divider"></div>

            <!-- File Operations -->
            <div class="toolbar-group">
                <button
                    class="toolbar-btn"
                    title="Save workflow"
                    @click="emit('save')"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="toolbar-icon"
                    >
                        <path
                            d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"
                        ></path>
                        <path
                            d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"
                        ></path>
                        <path d="M7 3v4a1 1 0 0 0 1 1h7"></path>
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    title="Load workflow"
                    @click="emit('load')"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="toolbar-icon"
                    >
                        <path
                            d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"
                        ></path>
                    </svg>
                </button>
                <button
                    class="toolbar-btn"
                    title="Export as JSON"
                    @click="emit('export')"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="toolbar-icon"
                    >
                        <path
                            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                        ></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" x2="12" y1="15" y2="3"></line>
                    </svg>
                </button>
                <label class="toolbar-btn" title="Import JSON">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="toolbar-icon"
                    >
                        <path
                            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                        ></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" x2="12" y1="3" y2="15"></line>
                    </svg>
                    <input
                        type="file"
                        accept=".json"
                        class="sr-only"
                        @change="emit('import', $event)"
                    />
                </label>
            </div>

            <div class="toolbar-divider"></div>

            <!-- Validate -->
            <button
                class="validate-btn"
                title="Check for issues"
                @click="emit('validate')"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="toolbar-icon"
                >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
                <span class="validate-text">Validate</span>
            </button>
        </div>

        <!-- Actions Section -->
        <div class="header-actions">
            <button
                class="api-key-btn"
                :class="{ 'has-key': hasApiKey }"
                @click="emit('openApiKeyModal')"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="action-icon"
                >
                    <path
                        d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"
                    ></path>
                </svg>
                <span class="api-key-text">{{
                    hasApiKey ? 'API Key Set' : 'Set API Key'
                }}</span>
                <span v-if="hasApiKey" class="api-key-indicator"></span>
            </button>

            <button
                class="chat-toggle-btn"
                :class="{ active: showChatPanel }"
                title="Toggle chat panel"
                @click="emit('update:showChatPanel', !showChatPanel)"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    class="action-icon"
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
    height: 52px;
    padding: 0 var(--or3-spacing-lg, 16px);
    background: var(--or3-color-bg-secondary, #111115);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    gap: var(--or3-spacing-lg, 16px);
}

/* Brand Section */
.header-brand {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-xl, 24px);
    flex-shrink: 0;
}

.logo-group {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.logo {
    font-size: var(--or3-text-lg, 16px);
    font-weight: var(--or3-font-bold, 700);
    background: var(
        --or3-gradient-accent,
        linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    letter-spacing: -0.02em;
}

.version-badge {
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    padding: 2px 6px;
    background: var(--or3-color-accent-subtle, rgba(139, 92, 246, 0.08));
    color: var(--or3-color-accent, #8b5cf6);
    border-radius: var(--or3-radius-xs, 4px);
    border: 1px solid var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
}

.meta-section {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.workflow-name-input,
.workflow-desc-input {
    background: var(--or3-color-bg-tertiary, #18181d);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-sm, 6px);
    padding: 6px 10px;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: var(--or3-text-sm, 12px);
    transition: all var(--or3-transition-fast, 120ms);
}

.workflow-name-input {
    width: 140px;
    font-weight: var(--or3-font-medium, 500);
}

.workflow-desc-input {
    width: 180px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.workflow-name-input:hover,
.workflow-desc-input:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.12));
}

.workflow-name-input:focus,
.workflow-desc-input:focus {
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: 0 0 0 3px
        var(--or3-color-accent-subtle, rgba(139, 92, 246, 0.08));
    outline: none;
}

/* Toolbar Section */
.header-toolbar {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-xs, 4px);
}

.toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
}

.toolbar-divider {
    width: 1px;
    height: 20px;
    background: var(--or3-color-border, rgba(255, 255, 255, 0.12));
    margin: 0 var(--or3-spacing-sm, 8px);
}

.toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    transition: all var(--or3-transition-fast, 120ms);
    cursor: pointer;
}

.toolbar-btn:hover:not(:disabled) {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.toolbar-btn:active:not(:disabled) {
    transform: scale(0.95);
}

.toolbar-btn.disabled,
.toolbar-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.toolbar-icon {
    width: 16px;
    height: 16px;
}

.validate-btn {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    padding: 6px 12px;
    border-radius: var(--or3-radius-sm, 6px);
    background: var(--or3-color-success-subtle, rgba(16, 185, 129, 0.08));
    color: var(--or3-color-success, #10b981);
    font-size: var(--or3-text-sm, 12px);
    font-weight: var(--or3-font-medium, 500);
    border: 1px solid var(--or3-color-success-muted, rgba(16, 185, 129, 0.15));
    transition: all var(--or3-transition-fast, 120ms);
    cursor: pointer;
}

.validate-btn:hover {
    background: var(--or3-color-success-muted, rgba(16, 185, 129, 0.15));
    border-color: var(--or3-color-success, #10b981);
}

.validate-text {
    white-space: nowrap;
}

/* Actions Section */
.header-actions {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.api-key-btn {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    padding: 6px 12px;
    border-radius: var(--or3-radius-sm, 6px);
    background: var(--or3-color-bg-tertiary, #18181d);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    font-size: var(--or3-text-sm, 12px);
    font-weight: var(--or3-font-medium, 500);
    transition: all var(--or3-transition-fast, 120ms);
    cursor: pointer;
    position: relative;
}

.api-key-btn:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.12));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.api-key-btn.has-key {
    background: var(--or3-color-success-subtle, rgba(16, 185, 129, 0.08));
    border-color: var(--or3-color-success-muted, rgba(16, 185, 129, 0.15));
    color: var(--or3-color-success, #10b981);
}

.api-key-indicator {
    width: 6px;
    height: 6px;
    background: var(--or3-color-success, #10b981);
    border-radius: 50%;
    box-shadow: 0 0 6px var(--or3-color-success, #10b981);
}

.action-icon {
    width: 14px;
    height: 14px;
}

.api-key-text {
    white-space: nowrap;
}

.chat-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    transition: all var(--or3-transition-fast, 120ms);
    cursor: pointer;
}

.chat-toggle-btn:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.chat-toggle-btn.active {
    background: var(--or3-color-accent-subtle, rgba(139, 92, 246, 0.08));
    color: var(--or3-color-accent, #8b5cf6);
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
}

/* Responsive */
@media (max-width: 1024px) {
    .meta-section {
        display: none;
    }
}

@media (max-width: 768px) {
    .header {
        padding: 0 var(--or3-spacing-md, 12px);
        height: 48px;
    }

    .validate-text,
    .api-key-text {
        display: none;
    }

    .toolbar-divider {
        display: none;
    }

    .toolbar-group {
        gap: 0;
    }
}
</style>
