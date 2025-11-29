<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { Node, Edge } from '@vue-flow/core';

// Import from our v2 packages
import { type WorkflowData } from '@or3/workflow-core';
import {
    WorkflowCanvas,
    NodePalette,
    NodeInspector,
    EdgeLabelEditor,
    useEditor,
    useExecutionState,
} from '@or3/workflow-vue';

// Local composables
import {
    useWorkflowExecution,
    useWorkflowStorage,
    useWorkflowValidation,
    useMobileNav,
    type ChatMessage,
    type SavedWorkflow,
    type ValidationResult,
} from './composables';

// ============================================================================
// Editor Setup
// ============================================================================
const editor = useEditor();
const {
    state: executionState,
    setRunning,
    setNodeStatus,
    setStreamingContent,
    appendStreamingContent,
    reset: resetExecution,
} = useExecutionState();

// ============================================================================
// UI State
// ============================================================================
const showChatPanel = ref(true);
const showLeftSidebar = ref(true);
const activePanel = ref<'palette' | 'inspector'>('palette');

// Composables
const {
    isMobile,
    mobileView,
    showMobileMenu,
    toggleMobileView,
} = useMobileNav({ showChatPanel, showLeftSidebar });

const {
    savedWorkflows,
    loadSavedWorkflows,
    saveWorkflow: saveWorkflowToStorage,
    deleteWorkflow,
    exportWorkflow,
    importWorkflow,
    autosave,
    loadAutosave,
} = useWorkflowStorage();

const { execute: executeWorkflowFn } = useWorkflowExecution();
const { validateWorkflow } = useWorkflowValidation();

// Edge editing
const selectedEdge = ref<Edge | null>(null);
const showEdgeEditor = ref(false);

// API Key
const apiKey = ref(localStorage.getItem('or3-api-key') || '');
const showApiKeyModal = ref(!apiKey.value);
const tempApiKey = ref('');

// Chat
const messages = ref<ChatMessage[]>([]);
const chatInput = ref('');
const conversationHistory = ref<Array<{ role: string; content: string }>>([]);

// Workflow name
const workflowName = ref('My Workflow');

// Modals
const showSaveModal = ref(false);
const showLoadModal = ref(false);
const showValidationModal = ref(false);
const validationResult = ref<ValidationResult | null>(null);
const error = ref<string | null>(null);

// ============================================================================
// Computed
// ============================================================================
const canUndo = computed(() => editor.value?.canUndo() ?? false);
const canRedo = computed(() => editor.value?.canRedo() ?? false);
const hasApiKey = computed(() => !!apiKey.value);
const nodeStatuses = computed(() => executionState.value.nodeStatuses);
const isRunning = computed(() => executionState.value.isRunning);
const streamingContent = computed(() => executionState.value.streamingContent);

// ============================================================================
// Lifecycle
// ============================================================================
onMounted(() => {
    loadSavedWorkflows();

    if (!editor.value) return;

    // Try to load autosave
    const autosaveData = loadAutosave();
    if (autosaveData) {
        editor.value.load(autosaveData);
    } else {
        // Create default workflow
        createDefaultWorkflow();
    }
});

// Autosave on changes
watch(
    () => editor.value?.getNodes(),
    () => {
        if (!editor.value) return;
        autosave(editor.value.getJSON());
    },
    { deep: true }
);

// ============================================================================
// Default Workflow
// ============================================================================
function createDefaultWorkflow() {
    if (!editor.value) return;

    // Load a pre-built default workflow with edges
    const defaultWorkflow: WorkflowData = {
        meta: { version: '2.0.0', name: 'Customer Support Workflow' },
        nodes: [
            {
                id: 'start',
                type: 'start',
                position: { x: 250, y: 0 },
                data: { label: 'Start' },
            },
            {
                id: 'router',
                type: 'router',
                position: { x: 200, y: 120 },
                data: {
                    label: 'Detect Intent',
                    prompt: 'Route to technical support for technical issues, sales for product inquiries.',
                },
            },
            {
                id: 'tech-agent',
                type: 'agent',
                position: { x: 50, y: 280 },
                data: {
                    label: 'Technical Agent',
                    model: 'anthropic/claude-3.5-sonnet',
                    prompt: 'You are a technical support specialist. Help users with technical issues, troubleshooting, and bug fixes.',
                },
            },
            {
                id: 'sales-agent',
                type: 'agent',
                position: { x: 350, y: 280 },
                data: {
                    label: 'Sales Agent',
                    model: 'openai/gpt-4o',
                    prompt: 'You are a friendly sales representative. Help users with product inquiries, pricing, and features.',
                },
            },
            {
                id: 'formatter',
                type: 'agent',
                position: { x: 200, y: 440 },
                data: {
                    label: 'Response Formatter',
                    model: 'openai/gpt-4o-mini',
                    prompt: 'Format the response professionally and ensure it is helpful, complete, and friendly.',
                },
            },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'router' },
            {
                id: 'e2',
                source: 'router',
                target: 'tech-agent',
                label: 'Technical',
            },
            {
                id: 'e3',
                source: 'router',
                target: 'sales-agent',
                label: 'Sales',
            },
            { id: 'e4', source: 'tech-agent', target: 'formatter' },
            { id: 'e5', source: 'sales-agent', target: 'formatter' },
        ],
    };

    editor.value.load(defaultWorkflow);
}

// ============================================================================
// Node Selection
// ============================================================================
function handleNodeClick(_node: Node) {
    activePanel.value = 'inspector';
    showEdgeEditor.value = false;
}

function handleEdgeClick(edge: Edge) {
    selectedEdge.value = edge;
    showEdgeEditor.value = true;
}

function handlePaneClick() {
    showEdgeEditor.value = false;
}

// ============================================================================
// Edge Editing
// ============================================================================
function updateEdgeLabel(edgeId: string, label: string) {
    if (!editor.value) return;
    editor.value.commands.updateEdgeData(edgeId, { label });
}

function deleteEdge(edgeId: string) {
    if (!editor.value) return;
    editor.value.commands.deleteEdge(edgeId);
    showEdgeEditor.value = false;
    selectedEdge.value = null;
}

// ============================================================================
// API Key
// ============================================================================
function saveApiKey() {
    if (!tempApiKey.value.trim()) return;
    apiKey.value = tempApiKey.value.trim();
    localStorage.setItem('or3-api-key', apiKey.value);
    showApiKeyModal.value = false;
    tempApiKey.value = '';
}

function clearApiKey() {
    apiKey.value = '';
    localStorage.removeItem('or3-api-key');
    showApiKeyModal.value = true;
}

// ============================================================================
// Workflow Execution
// ============================================================================
async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (!message || !editor.value || !apiKey.value) {
        if (!apiKey.value) showApiKeyModal.value = true;
        return;
    }

    chatInput.value = '';
    const nodes = editor.value.getNodes();
    const edges = editor.value.getEdges();

    // Add user message
    const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: new Date(),
    };
    messages.value.push(userMessage);
    conversationHistory.value.push({ role: 'user', content: message });

    // Reset node statuses
    nodes.forEach((n) => setNodeStatus(n.id, 'idle'));

    setRunning(true);
    setStreamingContent('');
    error.value = null;

    try {
        // Map nodes to execution format (data as Record<string, unknown>)
        const execNodes = nodes.map(n => ({
            id: n.id,
            type: n.type,
            data: { ...n.data } as Record<string, unknown>,
        }));
        
        const finalOutput = await executeWorkflowFn(
            apiKey.value,
            execNodes,
            edges,
            message,
            conversationHistory.value.slice(0, -1),
            {
                onNodeStatus: setNodeStatus,
                onStreamingContent: setStreamingContent,
                onAppendContent: appendStreamingContent,
            }
        );

        // Add final assistant message
        const assistantMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: finalOutput,
            timestamp: new Date(),
        };
        messages.value.push(assistantMessage);
        conversationHistory.value.push({
            role: 'assistant',
            content: finalOutput,
        });
    } catch (err: unknown) {
        const errMessage = err instanceof Error ? err.message : 'Unknown error';
        error.value = errMessage;
        const errorMessage: ChatMessage = {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `Error: ${errMessage}`,
            timestamp: new Date(),
        };
        messages.value.push(errorMessage);
    } finally {
        setRunning(false);
        setStreamingContent('');
    }
}

// ============================================================================
// Workflow Storage
// ============================================================================
function handleSave() {
    if (!editor.value) return;
    const nodes = editor.value.getNodes();
    const edges = editor.value.getEdges();

    saveWorkflowToStorage(workflowName.value, nodes, edges);
    showSaveModal.value = false;
}

function handleLoad(workflow: SavedWorkflow) {
    if (!editor.value) return;

    const data: WorkflowData = {
        meta: { version: '2.0.0', name: workflow.name },
        nodes: workflow.nodes as WorkflowData['nodes'],
        edges: workflow.edges as WorkflowData['edges'],
    };

    editor.value.load(data);
    workflowName.value = workflow.name;
    showLoadModal.value = false;
}

function handleExport() {
    if (!editor.value) return;
    const nodes = editor.value.getNodes();
    const edges = editor.value.getEdges();
    exportWorkflow(workflowName.value, nodes, edges);
}

async function handleImport(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || !editor.value) return;

    try {
        const workflowData = await importWorkflow(file);
        editor.value.load(workflowData);
        workflowName.value = workflowData.meta.name;
    } catch (err) {
        console.error('Failed to import workflow:', err);
        alert('Failed to import workflow. Please check the file format.');
    }

    input.value = '';
}

// ============================================================================
// Validation
// ============================================================================
function handleValidate() {
    if (!editor.value) return;
    const nodes = editor.value.getNodes();
    const edges = editor.value.getEdges();
    // Map to the expected validation shape
    const validationNodes = nodes.map((n) => ({
        id: n.id,
        type: n.type,
        data: { ...n.data } as Record<string, unknown>,
    }));
    validationResult.value = validateWorkflow(validationNodes, edges);
    showValidationModal.value = true;
}

// ============================================================================
// Toolbar Actions
// ============================================================================
function handleUndo() {
    editor.value?.commands.undo();
}

function handleRedo() {
    editor.value?.commands.redo();
}

function clearMessages() {
    messages.value = [];
    conversationHistory.value = [];
    resetExecution();
}
</script>

<template>
    <div class="app">
        <!-- Header -->
        <header class="header">
            <div class="header-left">
                <h1 class="logo">or3-workflow</h1>
                <span class="version">v2</span>
            </div>

            <div class="header-center">
                <button
                    class="btn btn-ghost"
                    :disabled="!canUndo"
                    @click="handleUndo"
                    title="Undo (Ctrl+Z)"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="icon"
                    >
                        <path d="M3 7v6h6"></path>
                        <path
                            d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
                        ></path>
                    </svg>
                </button>
                <button
                    class="btn btn-ghost"
                    :disabled="!canRedo"
                    @click="handleRedo"
                    title="Redo (Ctrl+Shift+Z)"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="icon"
                    >
                        <path d="M21 7v6h-6"></path>
                        <path
                            d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"
                        ></path>
                    </svg>
                </button>
                <div class="divider"></div>
                <button
                    class="btn btn-ghost"
                    @click="showSaveModal = true"
                    title="Save"
                >
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
                        <path
                            d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"
                        ></path>
                        <path d="M7 3v4a1 1 0 0 0 1 1h7"></path>
                    </svg>
                </button>
                <button
                    class="btn btn-ghost"
                    @click="showLoadModal = true"
                    title="Load"
                >
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
                    @click="handleExport"
                    title="Export"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="icon"
                    >
                        <path
                            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                        ></path>
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
                        <path
                            d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                        ></path>
                        <polyline points="17 8 12 3 7 8"></polyline>
                        <line x1="12" x2="12" y1="3" y2="15"></line>
                    </svg>
                    <input
                        type="file"
                        accept=".json"
                        class="hidden-input"
                        @change="handleImport"
                    />
                </label>
                <div class="divider"></div>
                <button
                    class="btn btn-ghost"
                    @click="handleValidate"
                    title="Validate"
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
                <button class="btn btn-ghost" @click="showApiKeyModal = true">
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
                    @click="showChatPanel = !showChatPanel"
                    title="Toggle Chat"
                >
                    <svg
                        v-if="showChatPanel"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        class="icon"
                    >
                        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>
                    </svg>
                    <svg
                        v-else
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

        <!-- Main content -->
        <main class="main">
            <!-- Left sidebar -->
            <aside
                v-if="showLeftSidebar || !isMobile"
                class="sidebar left-sidebar"
                :class="{ collapsed: !showLeftSidebar }"
            >
                <div class="sidebar-header">
                    <button
                        class="sidebar-collapse-btn"
                        @click="showLeftSidebar = !showLeftSidebar"
                        title="Toggle sidebar"
                    >
                        <svg
                            v-if="showLeftSidebar"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <polyline points="11 17 6 12 11 7"></polyline>
                            <polyline points="18 17 13 12 18 7"></polyline>
                        </svg>
                        <svg
                            v-else
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            class="icon"
                        >
                            <polyline points="13 17 18 12 13 7"></polyline>
                            <polyline points="6 17 11 12 6 7"></polyline>
                        </svg>
                    </button>
                </div>
                <div v-if="showLeftSidebar" class="sidebar-tabs">
                    <button
                        class="sidebar-tab"
                        :class="{ active: activePanel === 'palette' }"
                        @click="activePanel = 'palette'"
                    >
                        Nodes
                    </button>
                    <button
                        class="sidebar-tab"
                        :class="{ active: activePanel === 'inspector' }"
                        @click="activePanel = 'inspector'"
                    >
                        Inspector
                    </button>
                </div>

                <div v-if="showLeftSidebar" class="sidebar-content">
                    <NodePalette v-if="activePanel === 'palette'" />
                    <NodeInspector
                        v-else-if="activePanel === 'inspector' && editor"
                        :editor="editor"
                        @close="activePanel = 'palette'"
                    />
                </div>
            </aside>

            <!-- Canvas -->
            <div class="canvas-container">
                <WorkflowCanvas
                    v-if="editor"
                    :editor="editor"
                    :node-statuses="nodeStatuses"
                    @node-click="handleNodeClick"
                    @edge-click="handleEdgeClick"
                    @pane-click="handlePaneClick"
                />

                <!-- Edge Label Editor -->
                <EdgeLabelEditor
                    :edge="selectedEdge"
                    :show="showEdgeEditor"
                    @close="showEdgeEditor = false"
                    @update="updateEdgeLabel"
                    @delete="deleteEdge"
                />
            </div>

            <!-- Right sidebar - Chat -->
            <aside v-if="showChatPanel" class="sidebar right-sidebar">
                <div class="chat-wrapper">
                    <div class="chat-header">
                        <div class="chat-title">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                class="chat-icon"
                            >
                                <path
                                    d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"
                                ></path>
                            </svg>
                            <h3>Workflow Chat</h3>
                        </div>
                        <button
                            class="btn btn-ghost btn-sm"
                            @click="clearMessages"
                        >
                            Clear
                        </button>
                    </div>

                    <!-- Process Flow -->
                    <div
                        v-if="Object.keys(nodeStatuses).length > 0"
                        class="process-flow"
                    >
                        <div class="flow-header">Process Flow</div>
                        <div class="flow-steps">
                            <div
                                v-for="(status, nodeId) in nodeStatuses"
                                :key="nodeId"
                                class="flow-step"
                                :class="`status-${status}`"
                            >
                                <div class="step-indicator">
                                    <svg
                                        v-if="status === 'active'"
                                        class="spinning"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    >
                                        <path
                                            d="M21 12a9 9 0 1 1-6.219-8.56"
                                        ></path>
                                    </svg>
                                    <div v-else class="step-dot" />
                                </div>
                                <span class="step-label">{{ nodeId }}</span>
                            </div>
                        </div>
                    </div>

                    <div class="chat-messages">
                        <div v-if="messages.length === 0" class="chat-empty">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                class="empty-icon"
                            >
                                <rect
                                    x="3"
                                    y="11"
                                    width="18"
                                    height="10"
                                    rx="2"
                                ></rect>
                                <circle cx="12" cy="5" r="2"></circle>
                                <path d="M12 7v4"></path>
                            </svg>
                            <p>Send a message to run the workflow</p>
                        </div>
                        <div
                            v-for="msg in messages"
                            :key="msg.id"
                            class="chat-message"
                            :class="msg.role"
                        >
                            <div class="message-avatar">
                                <svg
                                    v-if="msg.role === 'user'"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path
                                        d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"
                                    ></path>
                                    <circle cx="12" cy="7" r="4"></circle>
                                </svg>
                                <svg
                                    v-else
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <rect
                                        x="3"
                                        y="11"
                                        width="18"
                                        height="10"
                                        rx="2"
                                    ></rect>
                                    <circle cx="12" cy="5" r="2"></circle>
                                    <path d="M12 7v4"></path>
                                </svg>
                            </div>
                            <div class="message-body">
                                <div class="message-content">
                                    {{ msg.content }}
                                </div>
                                <div v-if="msg.nodeId" class="message-meta">
                                    via {{ msg.nodeId }}
                                </div>
                            </div>
                        </div>
                        <div
                            v-if="streamingContent"
                            class="chat-message assistant streaming"
                        >
                            <div class="message-avatar">
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <rect
                                        x="3"
                                        y="11"
                                        width="18"
                                        height="10"
                                        rx="2"
                                    ></rect>
                                    <circle cx="12" cy="5" r="2"></circle>
                                    <path d="M12 7v4"></path>
                                </svg>
                            </div>
                            <div class="message-body">
                                <div class="message-content">
                                    {{ streamingContent
                                    }}<span class="cursor">|</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="chat-input">
                        <textarea
                            v-model="chatInput"
                            placeholder="Type a message..."
                            :disabled="isRunning"
                            @keydown.enter.prevent="handleSendMessage"
                        ></textarea>
                        <button
                            class="btn btn-primary send-btn"
                            :disabled="!chatInput?.trim() || isRunning"
                            @click="handleSendMessage"
                        >
                            <svg
                                v-if="isRunning"
                                class="spinning"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                            </svg>
                            <svg
                                v-else
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                class="icon"
                            >
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon
                                    points="22 2 15 22 11 13 2 9 22 2"
                                ></polygon>
                            </svg>
                        </button>
                    </div>
                </div>
            </aside>

            <!-- Mobile Bottom Navigation -->
            <nav v-if="isMobile" class="mobile-nav">
                <button
                    class="mobile-nav-btn"
                    :class="{ active: mobileView === 'editor' }"
                    @click="toggleMobileView('editor')"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    <span>Editor</span>
                </button>
                <button
                    class="mobile-nav-btn"
                    :class="{ active: mobileView === 'chat' }"
                    @click="toggleMobileView('chat')"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path>
                    </svg>
                    <span>Chat</span>
                    <span v-if="messages.length > 0" class="nav-badge">{{
                        messages.length
                    }}</span>
                </button>
                <button
                    class="mobile-nav-btn"
                    @click="showMobileMenu = !showMobileMenu"
                >
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                    >
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                    <span>More</span>
                </button>
            </nav>

            <!-- Mobile Menu Overlay -->
            <Transition name="slide-up">
                <div
                    v-if="showMobileMenu"
                    class="mobile-menu-overlay"
                    @click.self="showMobileMenu = false"
                >
                    <div class="mobile-menu">
                        <div class="mobile-menu-header">
                            <span>Actions</span>
                            <button
                                class="btn btn-ghost"
                                @click="showMobileMenu = false"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    class="icon"
                                >
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div class="mobile-menu-items">
                            <button
                                class="mobile-menu-item"
                                @click="
                                    handleUndo();
                                    showMobileMenu = false;
                                "
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    class="icon"
                                >
                                    <path d="M3 7v6h6"></path>
                                    <path
                                        d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"
                                    ></path>
                                </svg>
                                <span>Undo</span>
                            </button>
                            <button
                                class="mobile-menu-item"
                                @click="
                                    handleRedo();
                                    showMobileMenu = false;
                                "
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    class="icon"
                                >
                                    <path d="M21 7v6h-6"></path>
                                    <path
                                        d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"
                                    ></path>
                                </svg>
                                <span>Redo</span>
                            </button>
                            <div class="mobile-menu-divider"></div>
                            <button
                                class="mobile-menu-item"
                                @click="
                                    showSaveModal = true;
                                    showMobileMenu = false;
                                "
                            >
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
                                    <path
                                        d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"
                                    ></path>
                                    <path d="M7 3v4a1 1 0 0 0 1 1h7"></path>
                                </svg>
                                <span>Save Workflow</span>
                            </button>
                            <button
                                class="mobile-menu-item"
                                @click="
                                    showLoadModal = true;
                                    showMobileMenu = false;
                                "
                            >
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
                                <span>Load Workflow</span>
                            </button>
                            <button
                                class="mobile-menu-item"
                                @click="
                                    handleExport();
                                    showMobileMenu = false;
                                "
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                    class="icon"
                                >
                                    <path
                                        d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"
                                    ></path>
                                    <polyline
                                        points="7 10 12 15 17 10"
                                    ></polyline>
                                    <line x1="12" x2="12" y1="15" y2="3"></line>
                                </svg>
                                <span>Export JSON</span>
                            </button>
                            <div class="mobile-menu-divider"></div>
                            <button
                                class="mobile-menu-item"
                                @click="
                                    showApiKeyModal = true;
                                    showMobileMenu = false;
                                "
                            >
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
                                <span>{{
                                    hasApiKey ? 'Change API Key' : 'Set API Key'
                                }}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </Transition>
        </main>

        <!-- API Key Modal -->
        <div
            v-if="showApiKeyModal"
            class="modal-overlay"
            @click.self="hasApiKey && (showApiKeyModal = false)"
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
                    @keydown.enter="saveApiKey"
                />
                <div class="modal-actions">
                    <button
                        v-if="hasApiKey"
                        class="btn btn-ghost"
                        @click="clearApiKey"
                    >
                        Clear Key
                    </button>
                    <button
                        v-if="hasApiKey"
                        class="btn btn-ghost"
                        @click="showApiKeyModal = false"
                    >
                        Cancel
                    </button>
                    <button class="btn btn-primary" @click="saveApiKey">
                        Save
                    </button>
                </div>
            </div>
        </div>

        <!-- Save Modal -->
        <div
            v-if="showSaveModal"
            class="modal-overlay"
            @click.self="showSaveModal = false"
        >
            <div class="modal">
                <h2>Save Workflow</h2>
                <label class="form-label">Workflow Name</label>
                <input
                    v-model="workflowName"
                    type="text"
                    placeholder="My Workflow"
                    @keydown.enter="handleSave"
                />
                <div class="modal-actions">
                    <button
                        class="btn btn-ghost"
                        @click="showSaveModal = false"
                    >
                        Cancel
                    </button>
                    <button class="btn btn-primary" @click="handleSave">
                        Save
                    </button>
                </div>
            </div>
        </div>

        <!-- Load Modal -->
        <div
            v-if="showLoadModal"
            class="modal-overlay"
            @click.self="showLoadModal = false"
        >
            <div class="modal modal-lg">
                <h2>Load Workflow</h2>
                <div v-if="savedWorkflows.length > 0" class="workflow-list">
                    <div
                        v-for="workflow in savedWorkflows"
                        :key="workflow.id"
                        class="workflow-item"
                    >
                        <div class="workflow-info">
                            <span class="workflow-name">{{
                                workflow.name
                            }}</span>
                            <span class="workflow-date">{{
                                new Date(
                                    workflow.updatedAt
                                ).toLocaleDateString()
                            }}</span>
                        </div>
                        <div class="workflow-actions">
                            <button
                                class="btn btn-primary btn-sm"
                                @click="handleLoad(workflow)"
                            >
                                Load
                            </button>
                            <button
                                class="btn btn-ghost btn-sm"
                                @click="deleteWorkflow(workflow.id)"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
                <div v-else class="empty-state">
                    <p>No saved workflows yet.</p>
                </div>
                <div class="modal-actions">
                    <button
                        class="btn btn-ghost"
                        @click="showLoadModal = false"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>

        <!-- Validation Modal -->
        <div
            v-if="showValidationModal"
            class="modal-overlay"
            @click.self="showValidationModal = false"
        >
            <div class="modal">
                <h2>Workflow Validation</h2>
                <div v-if="validationResult" class="validation-result">
                    <div
                        v-if="
                            validationResult.isValid &&
                            validationResult.warnings.length === 0
                        "
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
                        v-if="validationResult.errors.length > 0"
                        class="validation-section errors"
                    >
                        <h3>Errors</h3>
                        <ul>
                            <li
                                v-for="(err, i) in validationResult.errors"
                                :key="'err-' + i"
                            >
                                {{ err.message }}
                            </li>
                        </ul>
                    </div>

                    <div
                        v-if="validationResult.warnings.length > 0"
                        class="validation-section warnings"
                    >
                        <h3>Warnings</h3>
                        <ul>
                            <li
                                v-for="(warn, i) in validationResult.warnings"
                                :key="'warn-' + i"
                            >
                                {{ warn.message }}
                            </li>
                        </ul>
                    </div>
                </div>
                <div class="modal-actions">
                    <button
                        class="btn btn-primary"
                        @click="showValidationModal = false"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
}

/* Header */
.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--or3-spacing-md, 16px);
    height: 56px;
    background: var(--or3-color-bg-secondary, #12121a);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
}

.header-left,
.header-center,
.header-right {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.header-center {
    gap: var(--or3-spacing-xs, 4px);
}

.logo {
    font-size: 18px;
    font-weight: 700;
    background: linear-gradient(
        135deg,
        var(--or3-color-accent, #8b5cf6),
        #a78bfa
    );
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin: 0;
}

.version {
    font-size: 11px;
    padding: 2px 6px;
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
    color: var(--or3-color-accent, #8b5cf6);
    border-radius: var(--or3-radius-sm, 6px);
    font-weight: 600;
}

.icon {
    width: 18px;
    height: 18px;
}

.divider {
    width: 1px;
    height: 24px;
    background: var(--or3-color-border, rgba(255, 255, 255, 0.08));
    margin: 0 var(--or3-spacing-xs, 4px);
}

.hidden-input {
    display: none;
}

.btn-text {
    margin-left: 4px;
}

@media (max-width: 900px) {
    .btn-text {
        display: none;
    }
}

/* Main */
.main {
    display: flex;
    flex: 1;
    overflow: hidden;
}

/* Sidebars */
.sidebar {
    display: flex;
    flex-direction: column;
    background: var(--or3-color-bg-secondary, #12121a);
    border-color: var(--or3-color-border, rgba(255, 255, 255, 0.08));
    position: relative;
    transition: width 0.3s ease, transform 0.3s ease;
}

.sidebar-header {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: var(--or3-spacing-xs, 4px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.sidebar-collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    cursor: pointer;
    transition: all 0.15s ease;
}

.sidebar-collapse-btn:hover {
    background: var(--or3-color-surface, rgba(26, 26, 36, 0.8));
    color: var(--or3-color-text, rgba(255, 255, 255, 0.87));
}

.sidebar-collapse-btn .icon {
    width: 14px;
    height: 14px;
}

.left-sidebar {
    width: 280px;
    border-right: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.left-sidebar.collapsed {
    width: 0;
    overflow: hidden;
    border: none;
}

.right-sidebar {
    width: 380px;
    border-left: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.sidebar-tab {
    flex: 1;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    font-size: 13px;
    font-weight: 500;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.sidebar-tab:hover {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
}

.sidebar-tab.active {
    color: var(--or3-color-accent, #8b5cf6);
    border-bottom-color: var(--or3-color-accent, #8b5cf6);
}

.sidebar-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--or3-spacing-md, 16px);
}

/* Canvas */
.canvas-container {
    flex: 1;
    position: relative;
    overflow: hidden;
}

/* Chat */
.chat-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--or3-spacing-md, 16px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.chat-title {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
}

.chat-title h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
}

.chat-icon {
    width: 18px;
    height: 18px;
    color: var(--or3-color-accent, #8b5cf6);
}

.btn-sm {
    padding: var(--or3-spacing-xs, 4px) var(--or3-spacing-sm, 8px);
    font-size: 12px;
}

/* Process Flow */
.process-flow {
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.flow-header {
    font-size: 11px;
    font-weight: 600;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    text-transform: uppercase;
    margin-bottom: var(--or3-spacing-xs, 4px);
}

.flow-steps {
    display: flex;
    flex-wrap: wrap;
    gap: var(--or3-spacing-xs, 4px);
}

.flow-step {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 11px;
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
}

.step-indicator {
    width: 12px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.step-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.flow-step.status-active {
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
    color: var(--or3-color-accent, #8b5cf6);
}

.flow-step.status-active .step-dot {
    background: var(--or3-color-accent, #8b5cf6);
}

.flow-step.status-completed {
    background: var(--or3-color-success-muted, rgba(34, 197, 94, 0.2));
    color: var(--or3-color-success, #22c55e);
}

.flow-step.status-completed .step-dot {
    background: var(--or3-color-success, #22c55e);
}

.flow-step.status-error {
    background: var(--or3-color-error-muted, rgba(239, 68, 68, 0.2));
    color: var(--or3-color-error, #ef4444);
}

.flow-step.status-error .step-dot {
    background: var(--or3-color-error, #ef4444);
}

.spinning {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

.chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: var(--or3-spacing-md, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
}

.chat-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    font-size: 14px;
    gap: var(--or3-spacing-sm, 8px);
}

.empty-icon {
    width: 32px;
    height: 32px;
    opacity: 0.5;
}

.chat-message {
    display: flex;
    gap: var(--or3-spacing-sm, 8px);
}

.message-avatar {
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--or3-radius-sm, 6px);
    background: var(--or3-color-surface, rgba(26, 26, 36, 0.8));
}

.message-avatar svg {
    width: 16px;
    height: 16px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
}

.chat-message.user .message-avatar {
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
}

.chat-message.user .message-avatar svg {
    color: var(--or3-color-accent, #8b5cf6);
}

.chat-message.assistant .message-avatar {
    background: var(--or3-color-success-muted, rgba(34, 197, 94, 0.2));
}

.chat-message.assistant .message-avatar svg {
    color: var(--or3-color-success, #22c55e);
}

.message-body {
    flex: 1;
    min-width: 0;
}

.message-content {
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: var(--or3-color-surface, rgba(26, 26, 36, 0.8));
    border-radius: var(--or3-radius-md, 10px);
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
}

.chat-message.user .message-content {
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
}

.message-meta {
    margin-top: var(--or3-spacing-xs, 4px);
    font-size: 11px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.cursor {
    animation: blink 1s step-end infinite;
}

@keyframes blink {
    50% {
        opacity: 0;
    }
}

.chat-input {
    display: flex;
    gap: var(--or3-spacing-sm, 8px);
    padding: var(--or3-spacing-md, 16px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.chat-input textarea {
    flex: 1;
    min-height: 40px;
    max-height: 120px;
    resize: none;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
}

.send-btn {
    width: 40px;
    height: 40px;
    padding: 0;
    flex-shrink: 0;
}

.send-btn svg {
    width: 18px;
    height: 18px;
}

/* Modal */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal {
    background: var(--or3-color-bg-secondary, #12121a);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-lg, 16px);
    padding: var(--or3-spacing-lg, 24px);
    width: 400px;
    max-width: 90vw;
}

.modal-lg {
    width: 500px;
}

.modal h2 {
    font-size: 18px;
    margin: 0 0 var(--or3-spacing-sm, 8px) 0;
}

.modal p {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    font-size: 14px;
    margin-bottom: var(--or3-spacing-md, 16px);
}

.modal p a {
    color: var(--or3-color-accent, #8b5cf6);
}

.modal input {
    width: 100%;
    margin-bottom: var(--or3-spacing-md, 16px);
}

.form-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    margin-bottom: var(--or3-spacing-xs, 4px);
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--or3-spacing-sm, 8px);
}

/* Workflow List */
.workflow-list {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: var(--or3-spacing-md, 16px);
}

.workflow-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--or3-spacing-sm, 8px);
    border-radius: var(--or3-radius-md, 10px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    margin-bottom: var(--or3-spacing-xs, 4px);
}

.workflow-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.workflow-name {
    font-weight: 600;
    font-size: 14px;
}

.workflow-date {
    font-size: 11px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.workflow-actions {
    display: flex;
    gap: var(--or3-spacing-xs, 4px);
}

.empty-state {
    text-align: center;
    padding: var(--or3-spacing-lg, 24px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

/* Validation */
.validation-result {
    margin-bottom: var(--or3-spacing-md, 16px);
}

.validation-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--or3-spacing-lg, 24px);
}

.success-icon {
    width: 48px;
    height: 48px;
    color: var(--or3-color-success, #22c55e);
    margin-bottom: var(--or3-spacing-sm, 8px);
}

.validation-section {
    margin-bottom: var(--or3-spacing-md, 16px);
}

.validation-section h3 {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: var(--or3-spacing-xs, 4px);
}

.validation-section.errors h3 {
    color: var(--or3-color-error, #ef4444);
}

.validation-section.warnings h3 {
    color: var(--or3-color-warning, #f59e0b);
}

.validation-section ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

.validation-section li {
    padding: var(--or3-spacing-xs, 4px) 0;
    font-size: 13px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
}

/* Sidebar Toggle */
.sidebar-toggle {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 48px;
    background: var(--or3-color-bg-secondary, #12121a);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: 0 var(--or3-radius-md, 10px) var(--or3-radius-md, 10px) 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 10;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    transition: all 0.15s ease;
    padding: 0;
    right: -24px;
}

.sidebar-toggle:hover {
    background: var(--or3-color-surface, rgba(26, 26, 36, 0.8));
    color: var(--or3-color-text, rgba(255, 255, 255, 0.87));
}

.sidebar-toggle svg {
    width: 14px;
    height: 14px;
}

.left-sidebar.collapsed {
    width: 0;
    overflow: hidden;
    border: none;
}

.left-sidebar.collapsed .sidebar-toggle {
    right: -24px;
    border-left: none;
}

.right-sidebar.collapsed {
    width: 0;
    overflow: hidden;
    border: none;
}

/* Mobile Navigation */
.mobile-nav {
    display: none;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--or3-color-bg-secondary, #12121a);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    padding: var(--or3-spacing-sm, 8px);
    z-index: 200;
    justify-content: space-around;
}

.mobile-nav-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: none;
    border: none;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s ease;
    border-radius: var(--or3-radius-md, 10px);
    position: relative;
}

.mobile-nav-btn:hover,
.mobile-nav-btn.active {
    color: var(--or3-color-accent, #8b5cf6);
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.2));
}

.mobile-nav-btn svg {
    width: 22px;
    height: 22px;
}

.nav-badge {
    position: absolute;
    top: 4px;
    right: 8px;
    width: 8px;
    height: 8px;
    background: var(--or3-color-accent, #8b5cf6);
    border-radius: 50%;
}

/* Mobile Menu Overlay */
.mobile-menu-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 300;
    animation: fadeIn 0.2s ease;
}

.mobile-menu {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: var(--or3-color-bg-secondary, #12121a);
    border-radius: var(--or3-radius-lg, 16px) var(--or3-radius-lg, 16px) 0 0;
    padding: var(--or3-spacing-lg, 24px);
    z-index: 301;
    max-height: 70vh;
    overflow-y: auto;
    animation: slideUp 0.3s ease;
}

.mobile-menu h3 {
    font-size: 16px;
    font-weight: 600;
    margin: 0 0 var(--or3-spacing-md, 16px) 0;
    color: var(--or3-color-text, rgba(255, 255, 255, 0.87));
}

.mobile-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: var(--or3-spacing-md, 16px);
    margin-bottom: var(--or3-spacing-md, 16px);
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    font-size: 16px;
    font-weight: 600;
    color: var(--or3-color-text, rgba(255, 255, 255, 0.87));
}

.mobile-menu-items {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.mobile-menu-divider {
    height: 1px;
    background: var(--or3-color-border, rgba(255, 255, 255, 0.08));
    margin: var(--or3-spacing-sm, 8px) 0;
}

.mobile-menu-item {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-md, 16px);
    padding: var(--or3-spacing-md, 16px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 10px);
    margin-bottom: var(--or3-spacing-sm, 8px);
    color: var(--or3-color-text, rgba(255, 255, 255, 0.87));
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
    text-align: left;
    font-size: 14px;
}

.mobile-menu-item:hover {
    background: var(--or3-color-surface, rgba(26, 26, 36, 0.8));
    border-color: var(--or3-color-accent, #8b5cf6);
}

.mobile-menu-item svg {
    width: 20px;
    height: 20px;
    color: var(--or3-color-accent, #8b5cf6);
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@keyframes slideUp {
    from {
        transform: translateY(100%);
    }
    to {
        transform: translateY(0);
    }
}

/* Vue Transitions */
.slide-up-enter-active,
.slide-up-leave-active {
    transition: opacity 0.3s ease;
}

.slide-up-enter-active .mobile-menu,
.slide-up-leave-active .mobile-menu {
    transition: transform 0.3s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
    opacity: 0;
}

.slide-up-enter-from .mobile-menu,
.slide-up-leave-to .mobile-menu {
    transform: translateY(100%);
}

/* Responsive */
@media (max-width: 900px) {
    .left-sidebar {
        width: 220px;
    }

    .right-sidebar {
        width: 320px;
    }
}

@media (max-width: 768px) {
    .header {
        padding: var(--or3-spacing-xs, 4px) var(--or3-spacing-sm, 8px);
    }

    .header-left .btn,
    .header-center .btn {
        display: none;
    }

    .left-sidebar {
        position: fixed;
        left: 0;
        top: 48px;
        bottom: 60px;
        z-index: 100;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
        width: 280px;
    }

    .left-sidebar:not(.collapsed) {
        transform: translateX(0);
    }

    .left-sidebar .sidebar-toggle {
        display: none;
    }

    .right-sidebar {
        position: fixed;
        right: 0;
        top: 48px;
        bottom: 60px;
        width: 100%;
        z-index: 100;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    }

    .right-sidebar:not(.collapsed) {
        transform: translateX(0);
    }

    .main {
        padding-bottom: 60px;
    }

    .mobile-nav {
        display: flex;
    }

    .canvas-container {
        position: fixed;
        top: 48px;
        left: 0;
        right: 0;
        bottom: 60px;
    }
}
</style>
