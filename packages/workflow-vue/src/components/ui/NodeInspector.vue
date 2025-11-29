<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue';
import { WorkflowEditor, WorkflowNode } from '@or3/workflow-core';

// Type guard for configurable node data
interface ConfigurableNodeData {
    label: string;
    prompt?: string;
    model?: string;
    tools?: string[];
    temperature?: number;
    maxTokens?: number;
}

function isConfigurableData(data: unknown): data is ConfigurableNodeData {
    return (
        typeof data === 'object' &&
        data !== null &&
        'label' in data &&
        typeof (data as Record<string, unknown>).label === 'string'
    );
}

function getToolsArray(data: unknown): string[] {
    if (!isConfigurableData(data)) return [];
    return Array.isArray(data.tools) ? data.tools : [];
}

const props = defineProps<{
    editor: WorkflowEditor;
}>();

const emit = defineEmits<{
    (e: 'delete', nodeId: string): void;
    (e: 'close'): void;
}>();

const selectedNode = ref<WorkflowNode | null>(null);
const activeTab = ref<'prompt' | 'model' | 'tools'>('prompt');

// Available models
const availableModels = [
    { id: 'openai/gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
    { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
    { id: 'openai/gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
    {
        id: 'anthropic/claude-3.5-sonnet',
        name: 'Claude 3.5 Sonnet',
        provider: 'Anthropic',
    },
    {
        id: 'anthropic/claude-3-opus',
        name: 'Claude 3 Opus',
        provider: 'Anthropic',
    },
    {
        id: 'anthropic/claude-3-haiku',
        name: 'Claude 3 Haiku',
        provider: 'Anthropic',
    },
    { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5', provider: 'Google' },
    {
        id: 'google/gemini-flash-1.5',
        name: 'Gemini Flash 1.5',
        provider: 'Google',
    },
    {
        id: 'meta-llama/llama-3.1-70b-instruct',
        name: 'Llama 3.1 70B',
        provider: 'Meta',
    },
    {
        id: 'meta-llama/llama-3.1-8b-instruct',
        name: 'Llama 3.1 8B',
        provider: 'Meta',
    },
    {
        id: 'mistralai/mistral-large',
        name: 'Mistral Large',
        provider: 'Mistral',
    },
    {
        id: 'mistralai/mixtral-8x7b-instruct',
        name: 'Mixtral 8x7B',
        provider: 'Mistral',
    },
];

// Available tools
const availableTools = [
    {
        id: 'web_search',
        name: 'Web Search',
        description: 'Search the web for information',
    },
    {
        id: 'calculator',
        name: 'Calculator',
        description: 'Perform mathematical calculations',
    },
    {
        id: 'code_interpreter',
        name: 'Code Interpreter',
        description: 'Execute Python code',
    },
    {
        id: 'file_reader',
        name: 'File Reader',
        description: 'Read file contents',
    },
    { id: 'api_call', name: 'API Call', description: 'Make HTTP API requests' },
    {
        id: 'database_query',
        name: 'Database Query',
        description: 'Query a database',
    },
];

// Local state for tools
const selectedTools = ref<string[]>([]);

// Update selection from editor
const updateSelection = () => {
    const selected = props.editor.getSelected().nodes;
    if (selected.length === 1) {
        const node =
            props.editor.getNodes().find((n) => n.id === selected[0]) || null;
        selectedNode.value = node;
        // Sync tools from node data using type guard
        if (node) {
            selectedTools.value = getToolsArray(node.data);
        }
    } else {
        selectedNode.value = null;
        selectedTools.value = [];
    }
};

// Watch for node data changes
watch(
    () => selectedNode.value?.data,
    (data) => {
        if (data) {
            selectedTools.value = getToolsArray(data);
        }
    },
    { deep: true }
);

// Use watchEffect for proper subscription cleanup on editor prop change
watchEffect((onCleanup) => {
    updateSelection();
    const unsub1 = props.editor.on('selectionUpdate', updateSelection);
    const unsub2 = props.editor.on('update', updateSelection);
    onCleanup(() => {
        unsub1();
        unsub2();
    });
});

// Computed helpers
const isAgentNode = computed(() => selectedNode.value?.type === 'agent');
const isRouterNode = computed(() => selectedNode.value?.type === 'router');
const isParallelNode = computed(() => selectedNode.value?.type === 'parallel');
const isStartNode = computed(() => selectedNode.value?.type === 'start');
const canDelete = computed(
    () => selectedNode.value && selectedNode.value.type !== 'start'
);
const isConfigurable = computed(
    () => isAgentNode.value || isRouterNode.value || isParallelNode.value
);

const nodeData = computed<ConfigurableNodeData>(() => {
    const data = selectedNode.value?.data;
    return isConfigurableData(data) ? data : { label: 'Unknown' };
});

// Update handlers with debounce
let debounceTimeout: ReturnType<typeof setTimeout> | null = null;
const debouncedUpdate = (field: string, value: unknown) => {
    if (!selectedNode.value) return;
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        props.editor.commands.updateNodeData(selectedNode.value!.id, {
            [field]: value,
        });
    }, 200);
};

const updateLabel = (event: Event) => {
    debouncedUpdate('label', (event.target as HTMLInputElement).value);
};

const updateModel = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    props.editor.commands.updateNodeData(selectedNode.value!.id, {
        model: value,
    });
};

const updatePrompt = (event: Event) => {
    debouncedUpdate('prompt', (event.target as HTMLTextAreaElement).value);
};

// Toggle tool selection
const toggleTool = (toolId: string) => {
    if (!selectedNode.value) return;
    const idx = selectedTools.value.indexOf(toolId);
    if (idx === -1) {
        selectedTools.value.push(toolId);
    } else {
        selectedTools.value.splice(idx, 1);
    }
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        tools: [...selectedTools.value],
    });
};

const handleDelete = () => {
    if (!selectedNode.value || !canDelete.value) return;
    if (confirm(`Delete "${nodeData.value.label}"?`)) {
        props.editor.commands.deleteNode(selectedNode.value.id);
        emit('delete', selectedNode.value.id);
    }
};
</script>

<template>
    <div class="node-inspector" v-if="selectedNode">
        <!-- Header -->
        <div class="inspector-header">
            <div class="header-icon" :class="selectedNode.type">
                <svg
                    v-if="isAgentNode"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                    <circle cx="12" cy="5" r="2"></circle>
                    <path d="M12 7v4"></path>
                </svg>
                <svg
                    v-else-if="isRouterNode"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <line x1="6" y1="3" x2="6" y2="15"></line>
                    <circle cx="18" cy="6" r="3"></circle>
                    <circle cx="6" cy="18" r="3"></circle>
                    <path d="M18 9a9 9 0 0 1-9 9"></path>
                </svg>
                <svg
                    v-else-if="isParallelNode"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <circle cx="18" cy="18" r="3"></circle>
                    <circle cx="6" cy="6" r="3"></circle>
                    <path d="M6 21V9a9 9 0 0 0 9 9"></path>
                </svg>
                <svg
                    v-else
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
            </div>
            <input
                class="label-input"
                :value="nodeData.label"
                @input="updateLabel"
                placeholder="Node name"
            />
            <button
                v-if="canDelete"
                class="delete-btn"
                @click="handleDelete"
                title="Delete node"
            >
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
            </button>
            <button
                class="close-btn"
                @click="emit('close')"
                title="Close inspector"
            >
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

        <!-- Tabs for Agent nodes -->
        <div v-if="isConfigurable" class="tabs">
            <button
                class="tab"
                :class="{ active: activeTab === 'prompt' }"
                @click="activeTab = 'prompt'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <rect x="3" y="11" width="18" height="10" rx="2"></rect>
                    <circle cx="12" cy="5" r="2"></circle>
                    <path d="M12 7v4"></path>
                </svg>
                {{ isRouterNode ? 'Instructions' : 'Prompt' }}
            </button>
            <button
                class="tab"
                :class="{ active: activeTab === 'model' }"
                @click="activeTab = 'model'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <rect
                        x="4"
                        y="4"
                        width="16"
                        height="16"
                        rx="2"
                        ry="2"
                    ></rect>
                    <rect x="9" y="9" width="6" height="6"></rect>
                    <line x1="9" y1="1" x2="9" y2="4"></line>
                    <line x1="15" y1="1" x2="15" y2="4"></line>
                    <line x1="9" y1="20" x2="9" y2="23"></line>
                    <line x1="15" y1="20" x2="15" y2="23"></line>
                    <line x1="20" y1="9" x2="23" y2="9"></line>
                    <line x1="20" y1="14" x2="23" y2="14"></line>
                    <line x1="1" y1="9" x2="4" y2="9"></line>
                    <line x1="1" y1="14" x2="4" y2="14"></line>
                </svg>
                Model
            </button>
            <button
                v-if="isAgentNode"
                class="tab"
                :class="{ active: activeTab === 'tools' }"
                @click="activeTab = 'tools'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
                    ></path>
                </svg>
                Tools
                <span v-if="selectedTools.length" class="tool-count">{{
                    selectedTools.length
                }}</span>
            </button>
        </div>

        <!-- Tab Content -->
        <div v-if="isConfigurable" class="tab-content">
            <!-- Prompt Tab -->
            <div v-if="activeTab === 'prompt'" class="prompt-tab">
                <label class="field-label">
                    {{
                        isRouterNode
                            ? 'Routing Instructions'
                            : isParallelNode
                            ? 'Merge Prompt'
                            : 'System Prompt'
                    }}
                </label>
                <textarea
                    :value="nodeData.prompt || ''"
                    class="prompt-textarea"
                    :placeholder="
                        isRouterNode
                            ? 'Instructions for routing decisions...\n\nExample:\nRoute to Technical if the user mentions bugs, errors, or technical issues.\nRoute to Sales for pricing or product inquiries.'
                            : isParallelNode
                            ? 'Instructions for merging parallel outputs...'
                            : 'Enter the system prompt for this agent...\n\nExample:\nYou are a helpful technical support specialist. Help users troubleshoot issues with their software.'
                    "
                    @input="updatePrompt"
                ></textarea>
                <p class="field-hint">
                    {{
                        isRouterNode
                            ? 'These instructions help the router decide which branch to take. Edge labels are used to make decisions.'
                            : isParallelNode
                            ? 'This prompt is used to merge/summarize outputs from all parallel branches.'
                            : "This prompt defines the agent's behavior and personality."
                    }}
                </p>
            </div>

            <!-- Model Tab -->
            <div v-if="activeTab === 'model'" class="model-tab">
                <label class="field-label">Select Model</label>
                <select
                    class="model-select"
                    :value="nodeData.model || 'openai/gpt-4o-mini'"
                    @change="updateModel"
                >
                    <option
                        v-for="m in availableModels"
                        :key="m.id"
                        :value="m.id"
                    >
                        {{ m.name }} ({{ m.provider }})
                    </option>
                </select>
                <div class="model-id">
                    <span class="model-id-label">Model ID:</span>
                    <code>{{ nodeData.model || 'openai/gpt-4o-mini' }}</code>
                </div>
            </div>

            <!-- Tools Tab -->
            <div v-if="activeTab === 'tools' && isAgentNode" class="tools-tab">
                <label class="field-label">Available Tools</label>
                <p class="field-hint">
                    Select which tools this agent can use during execution.
                </p>

                <div class="tools-list">
                    <label
                        v-for="tool in availableTools"
                        :key="tool.id"
                        class="tool-item"
                        :class="{ enabled: selectedTools.includes(tool.id) }"
                    >
                        <input
                            type="checkbox"
                            :checked="selectedTools.includes(tool.id)"
                            @change="toggleTool(tool.id)"
                        />
                        <div class="tool-info">
                            <span class="tool-name">{{ tool.name }}</span>
                            <span class="tool-description">{{
                                tool.description
                            }}</span>
                        </div>
                    </label>
                </div>

                <div v-if="selectedTools.length > 0" class="selected-tools">
                    <label class="field-label"
                        >Enabled Tools ({{ selectedTools.length }})</label
                    >
                    <div class="tool-chips">
                        <span
                            v-for="toolId in selectedTools"
                            :key="toolId"
                            class="tool-chip"
                        >
                            {{
                                availableTools.find((t) => t.id === toolId)
                                    ?.name
                            }}
                            <button
                                class="chip-remove"
                                @click="toggleTool(toolId)"
                            >
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
                        </span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Start node (minimal) -->
        <div v-else-if="isStartNode" class="inspector-content">
            <div class="info-box">
                The Start node is the entry point for workflow execution.
                Connect it to other nodes to define your workflow.
            </div>
        </div>
    </div>

    <!-- Empty state -->
    <div class="node-inspector empty" v-else>
        <div class="empty-icon">
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
            >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
        </div>
        <p>Select a node to edit its properties</p>
    </div>
</template>

<style scoped>
.node-inspector {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.node-inspector.empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--or3-spacing-sm, 8px);
    padding: var(--or3-spacing-xl, 32px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    text-align: center;
}

.empty-icon svg {
    width: 48px;
    height: 48px;
    opacity: 0.3;
}

.empty p {
    font-size: 14px;
    margin: 0;
}

/* Header */
.inspector-header {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    padding-bottom: var(--or3-spacing-md, 16px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    margin-bottom: var(--or3-spacing-md, 16px);
}

.header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--or3-radius-sm, 6px);
    flex-shrink: 0;
}

.header-icon svg {
    width: 18px;
    height: 18px;
}

.header-icon.agent {
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
    color: var(--or3-color-accent, #8b5cf6);
}

.header-icon.router {
    background: var(--or3-color-warning-muted, rgba(245, 158, 11, 0.2));
    color: var(--or3-color-warning, #f59e0b);
}

.header-icon.parallel {
    background: var(--or3-color-info-muted, rgba(59, 130, 246, 0.2));
    color: var(--or3-color-info, #3b82f6);
}

.header-icon.start {
    background: var(--or3-color-success-muted, rgba(34, 197, 94, 0.2));
    color: var(--or3-color-success, #22c55e);
}

.label-input {
    flex: 1;
    background: transparent;
    border: none;
    font-size: 15px;
    font-weight: 600;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    padding: var(--or3-spacing-xs, 4px) 0;
    min-width: 0;
}

.label-input:focus {
    outline: none;
}

.delete-btn,
.close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    transition: all 0.15s ease;
    flex-shrink: 0;
}

.delete-btn:hover {
    background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.2));
    color: var(--or3-color-error, #ef4444);
}

.close-btn:hover {
    background: var(--or3-color-surface-hover, rgba(255, 255, 255, 0.05));
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.delete-btn svg,
.close-btn svg {
    width: 16px;
    height: 16px;
}

/* Tabs */
.tabs {
    display: flex;
    gap: var(--or3-spacing-xs, 4px);
    padding-bottom: var(--or3-spacing-md, 16px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    margin-bottom: var(--or3-spacing-md, 16px);
}

.tab {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-xs, 4px);
    padding: var(--or3-spacing-xs, 4px) var(--or3-spacing-sm, 8px);
    font-size: 12px;
    font-weight: 500;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    border-radius: var(--or3-radius-sm, 6px);
    transition: all 0.15s ease;
}

.tab svg {
    width: 14px;
    height: 14px;
}

.tab:hover {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
}

.tab.active {
    color: var(--or3-color-accent, #8b5cf6);
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
}

.tool-count {
    background: var(--or3-color-accent, #8b5cf6);
    color: white;
    font-size: 10px;
    font-weight: 600;
    padding: 1px 6px;
    border-radius: 10px;
    margin-left: 2px;
}

/* Tab Content */
.tab-content {
    flex: 1;
    overflow-y: auto;
}

.field-label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--or3-spacing-sm, 8px);
}

.field-hint {
    font-size: 12px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    margin-top: var(--or3-spacing-sm, 8px);
    line-height: 1.4;
}

/* Prompt Tab */
.prompt-textarea {
    width: 100%;
    min-height: 180px;
    resize: vertical;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.6;
    padding: var(--or3-spacing-md, 16px);
    background: var(--or3-color-bg-tertiary, #1a1a24);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 10px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.prompt-textarea:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
}

/* Model Tab */
.model-select {
    width: 100%;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: var(--or3-color-bg-tertiary, #1a1a24);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 10px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: 13px;
    cursor: pointer;
}

.model-select:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
}

.model-id {
    margin-top: var(--or3-spacing-md, 16px);
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    border-radius: var(--or3-radius-md, 10px);
    font-size: 12px;
}

.model-id-label {
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    margin-right: var(--or3-spacing-xs, 4px);
}

.model-id code {
    color: var(--or3-color-accent, #8b5cf6);
    font-family: monospace;
}

/* Tools Tab */
.tools-list {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
    margin-top: var(--or3-spacing-md, 16px);
}

.tool-item {
    display: flex;
    align-items: flex-start;
    gap: var(--or3-spacing-sm, 8px);
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: var(--or3-color-bg-tertiary, #1a1a24);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 10px);
    cursor: pointer;
    transition: all 0.15s ease;
}

.tool-item:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.15));
}

.tool-item.enabled {
    border-color: var(--or3-color-accent, #8b5cf6);
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.1));
}

.tool-item input[type='checkbox'] {
    margin-top: 2px;
    accent-color: var(--or3-color-accent, #8b5cf6);
}

.tool-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.tool-name {
    font-weight: 600;
    font-size: 13px;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.tool-description {
    font-size: 11px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.selected-tools {
    margin-top: var(--or3-spacing-lg, 24px);
    padding-top: var(--or3-spacing-md, 16px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.tool-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--or3-spacing-xs, 4px);
}

.tool-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--or3-spacing-xs, 4px);
    padding: var(--or3-spacing-xs, 4px) var(--or3-spacing-sm, 8px);
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
    color: var(--or3-color-accent, #8b5cf6);
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 12px;
    font-weight: 500;
}

.chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    color: var(--or3-color-accent, #8b5cf6);
    transition: all 0.15s ease;
}

.chip-remove:hover {
    background: var(--or3-color-accent, #8b5cf6);
    color: white;
}

.chip-remove svg {
    width: 10px;
    height: 10px;
}

/* Info box */
.inspector-content {
    padding-top: var(--or3-spacing-md, 16px);
}

.info-box {
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    border-radius: var(--or3-radius-md, 10px);
    font-size: 12px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    line-height: 1.5;
}
</style>
