<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { Node, Edge } from '@vue-flow/core';

// Import from our v2 packages
import {
    type WorkflowData,
    type TokenUsageDetails,
    validateWorkflow,
} from '@or3/workflow-core';
import { useEditor, createExecutionState } from '@or3/workflow-vue';

// Local composables
import {
    useDemoExecution,
    useWorkflowStorage,
    useMobileNav,
    type ChatMessage,
    type BranchStream,
} from './composables';
import type { WorkflowSummary } from '@or3/workflow-core';

// Local components
import {
    HeaderBar,
    ChatPanel,
    LeftSidebar,
    MobileNav,
    CanvasArea,
    ApiKeyModal,
    SaveModal,
    LoadModal,
    ValidationModal,
    HITLModal,
} from './components';

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
} = createExecutionState();

// ============================================================================
// UI State
// ============================================================================
const showChatPanel = ref(true);
const showLeftSidebar = ref(true);
const activePanel = ref<'palette' | 'inspector'>('palette');

// Composables
const { isMobile, mobileView, showMobileMenu, toggleMobileView } = useMobileNav(
    { showChatPanel, showLeftSidebar }
);

const {
    savedWorkflows,
    loadSavedWorkflows,
    saveWorkflow: saveWorkflowToStorage,
    deleteWorkflow,
    exportWorkflow,
    importWorkflow,
    autosave,
    loadAutosave,
    load,
} = useWorkflowStorage();

const { execute: executeWorkflowFn } = useDemoExecution();

// Edge editing
const selectedEdge = ref<Edge | null>(null);
const showEdgeEditor = ref(false);

// API Key (demo-only: avoid storing secrets in localStorage for production)
const apiKey = ref(localStorage.getItem('or3-api-key') || '');
const showApiKeyModal = ref(!apiKey.value);
const tempApiKey = ref('');

// Chat
const messages = ref<ChatMessage[]>([]);
const chatInput = ref('');
const tokenUsage = ref<{ nodeId: string; usage: TokenUsageDetails } | null>(
    null
);

// Track node outputs for collapsible display
const nodeOutputs = ref<Record<string, { nodeId: string; output: string }>>({});

// Parallel branch streaming state (for live streaming only)
const branchStreams = ref<Record<string, BranchStream>>({});
// Track parallel execution instances to generate unique keys per loop iteration
const parallelExecutionCounter = ref<Record<string, number>>({});

// Constant for merge branch identifier
const MERGE_BRANCH_ID = '__merge__';

// Thinking/reasoning state (for main output)
const isThinking = ref(false);
const thinkingContent = ref('');

// Workflow name
const workflowName = ref('My Workflow');
const workflowDescription = ref('');

// HITL (Human-in-the-Loop) state
import type { HITLRequest, HITLResponse } from '@or3/workflow-core';
const showHITLModal = ref(false);
const pendingHITLRequest = ref<HITLRequest | null>(null);
const hitlUserInput = ref('');
let resolveHITLPromise: ((response: HITLResponse) => void) | null = null;

// Modals
const showSaveModal = ref(false);
const showLoadModal = ref(false);
const showValidationModal = ref(false);
const validationResult = ref<ReturnType<typeof validateWorkflow> | null>(null);
const error = ref<string | null>(null);

// ============================================================================
// Computed
// ============================================================================
const canUndo = computed(() => editor.value?.canUndo() ?? false);
const canRedo = computed(() => editor.value?.canRedo() ?? false);
const hasApiKey = computed(() => !!apiKey.value);
const nodeStatuses = computed(() => executionState.value.nodeStatuses);
const isRunning = computed(() => executionState.value.isRunning);

// Build a map of node ID -> label for display in ChatPanel
const nodeLabels = computed(() => {
    if (!editor.value) return {};
    const nodes = editor.value.getNodes();
    const labels: Record<string, string> = {};
    for (const node of nodes) {
        if (node.data?.label) {
            labels[node.id] = node.data.label;
        }
    }
    return labels;
});
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
        workflowName.value = autosaveData.meta.name;
        workflowDescription.value = autosaveData.meta.description || '';
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

watch(
    () => editor.value?.getEdges(),
    () => {
        if (!editor.value) return;
        autosave(editor.value.getJSON());
    },
    { deep: true }
);

watch([workflowName, workflowDescription], () => {
    if (!editor.value) return;
    syncMetaToEditor();
    autosave(editor.value.getJSON());
});

// ============================================================================
// Default Workflow
// ============================================================================
function createDefaultWorkflow() {
    if (!editor.value) return;

    // Load a pre-built default workflow with edges
    // This workflow demonstrates the new v2 features including:
    // - Router node for intent detection
    // - Agent nodes for processing
    // - While Loop for iterative refinement
    // - Output node for structured results
    // - HITL (Human-in-the-Loop) for review
    const defaultWorkflow: WorkflowData = {
        meta: {
            version: '2.0.0',
            name: 'Smart Assistant Workflow',
            description:
                'An intelligent assistant with routing, iteration, and human review capabilities.',
        },
        nodes: [
            {
                id: 'start',
                type: 'start',
                position: { x: 300, y: 0 },
                data: { label: 'Start' },
            },
            {
                id: 'router',
                type: 'router',
                position: { x: 250, y: 100 },
                data: {
                    label: 'Detect Intent',
                    prompt: 'Analyze the user request and route to:\n- "analysis" for questions requiring research or analysis\n- "creative" for creative writing, brainstorming, or idea generation\n- "simple" for quick factual answers',
                    model: 'z-ai/glm-4.6:exacto',
                },
            },
            {
                id: 'analysis-agent',
                type: 'agent',
                position: { x: 0, y: 250 },
                data: {
                    label: 'Analysis Agent',
                    model: 'anthropic/claude-3.5-sonnet',
                    prompt: 'You are an analytical expert. Provide thorough, well-researched answers with clear reasoning and evidence.',
                    hitl: {
                        enabled: true,
                        mode: 'review',
                        prompt: 'Please review this analysis before it is finalized.',
                    },
                },
            },
            {
                id: 'creative-agent',
                type: 'agent',
                position: { x: 250, y: 250 },
                data: {
                    label: 'Creative Agent',
                    model: 'z-ai/glm-4.6:exacto',
                    prompt: 'You are a creative writer. Generate engaging, imaginative content that inspires and delights.',
                },
            },
            {
                id: 'simple-agent',
                type: 'agent',
                position: { x: 500, y: 250 },
                data: {
                    label: 'Quick Answer',
                    model: 'z-ai/glm-4.6:exacto',
                    prompt: 'Provide a concise, direct answer. Be helpful but brief.',
                },
            },
            {
                id: 'refine-loop',
                type: 'whileLoop',
                position: { x: 250, y: 400 },
                data: {
                    label: 'Refine Response',
                    conditionPrompt:
                        'Review the response quality. If it could be significantly improved, respond "continue". If it is good enough, respond "done".',
                    maxIterations: 3,
                    onMaxIterations: 'continue',
                },
            },
            {
                id: 'refine-agent',
                type: 'agent',
                position: { x: 250, y: 530 },
                data: {
                    label: 'Refinement',
                    model: 'z-ai/glm-4.6:exacto',
                    prompt: 'Review and improve the previous response. Make it more clear, accurate, and helpful. Build on what was good and fix any issues.',
                },
            },
            {
                id: 'output',
                type: 'output',
                position: { x: 250, y: 680 },
                data: {
                    label: 'Final Output',
                    format: 'text',
                    template: '',
                    includeMetadata: false,
                },
            },
        ],
        edges: [
            { id: 'e1', source: 'start', target: 'router' },
            {
                id: 'e2',
                source: 'router',
                target: 'analysis-agent',
                label: 'Analysis',
            },
            {
                id: 'e3',
                source: 'router',
                target: 'creative-agent',
                label: 'Creative',
            },
            {
                id: 'e4',
                source: 'router',
                target: 'simple-agent',
                label: 'Simple',
            },
            { id: 'e5', source: 'analysis-agent', target: 'refine-loop' },
            { id: 'e6', source: 'creative-agent', target: 'refine-loop' },
            { id: 'e7', source: 'simple-agent', target: 'output' },
            {
                id: 'e8',
                source: 'refine-loop',
                target: 'refine-agent',
                sourceHandle: 'body',
            },
            { id: 'e9', source: 'refine-agent', target: 'refine-loop' },
            {
                id: 'e10',
                source: 'refine-loop',
                target: 'output',
                sourceHandle: 'done',
            },
        ],
    };

    editor.value.load(defaultWorkflow);
    workflowName.value = defaultWorkflow.meta.name;
    workflowDescription.value = defaultWorkflow.meta.description || '';
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
// HITL (Human-in-the-Loop) Handlers
// ============================================================================
async function handleHITLRequest(request: HITLRequest): Promise<HITLResponse> {
    pendingHITLRequest.value = request;
    hitlUserInput.value = '';
    showHITLModal.value = true;

    return new Promise((resolve) => {
        resolveHITLPromise = resolve;
    });
}

function handleHITLApprove() {
    if (!pendingHITLRequest.value || !resolveHITLPromise) return;

    const response: HITLResponse = {
        requestId: pendingHITLRequest.value.id,
        action: 'approve',
        data: hitlUserInput.value || undefined,
        respondedAt: new Date().toISOString(),
    };

    resolveHITLPromise(response);
    closeHITLModal();
}

function handleHITLReject() {
    if (!pendingHITLRequest.value || !resolveHITLPromise) return;

    const response: HITLResponse = {
        requestId: pendingHITLRequest.value.id,
        action: 'reject',
        respondedAt: new Date().toISOString(),
    };

    resolveHITLPromise(response);
    closeHITLModal();
}

function handleHITLSkip() {
    if (!pendingHITLRequest.value || !resolveHITLPromise) return;

    const response: HITLResponse = {
        requestId: pendingHITLRequest.value.id,
        action: 'skip',
        respondedAt: new Date().toISOString(),
    };

    resolveHITLPromise(response);
    closeHITLModal();
}

function closeHITLModal() {
    showHITLModal.value = false;
    pendingHITLRequest.value = null;
    hitlUserInput.value = '';
    resolveHITLPromise = null;
}

// ============================================================================
// Workflow Execution
// ============================================================================

// Handle toggling active branch expansion
function toggleBranchExpanded(key: string) {
    if (branchStreams.value[key]) {
        branchStreams.value[key].expanded = !branchStreams.value[key].expanded;
    }
}

// Handle toggling branch expansion within a message
function toggleMessageBranch(payload: { messageId: string; branchId: string }) {
    const message = messages.value.find((m) => m.id === payload.messageId);
    if (message?.branches) {
        const branch = message.branches.find(
            (b) => b.branchId === payload.branchId
        );
        if (branch) {
            branch.expanded = !branch.expanded;
        }
    }
}

// Handle toggling node output expansion within a message
function toggleMessageNodeOutput(payload: {
    messageId: string;
    nodeId: string;
}) {
    const message = messages.value.find((m) => m.id === payload.messageId);
    if (message?.nodeOutputs) {
        const nodeOutput = message.nodeOutputs.find(
            (n) => n.nodeId === payload.nodeId
        );
        if (nodeOutput) {
            nodeOutput.expanded = !nodeOutput.expanded;
        }
    }
}

async function handleSendMessage() {
    const message = chatInput.value.trim();
    if (!message || !editor.value || !apiKey.value) {
        if (!apiKey.value) showApiKeyModal.value = true;
        return;
    }

    chatInput.value = '';
    syncMetaToEditor();
    const workflow = editor.value.getJSON();

    // Add user message
    const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: message,
        timestamp: new Date(),
    };
    messages.value.push(userMessage);

    // Reset node statuses and clear loop iteration data
    workflow.nodes.forEach((n) => {
        setNodeStatus(n.id, 'idle');
        // Clear iteration data from loop nodes
        if (n.type === 'whileLoop' && editor.value) {
            editor.value.commands.updateNodeData(n.id, {
                iteration: null,
            });
        }
    });

    setRunning(true);
    setStreamingContent('');
    tokenUsage.value = null;
    error.value = null;
    branchStreams.value = {}; // Reset active branch streams
    parallelExecutionCounter.value = {}; // Reset parallel execution counters
    nodeOutputs.value = {}; // Reset node outputs
    isThinking.value = false; // Reset thinking state
    thinkingContent.value = '';

    // Find nodes that feed directly into output nodes (their tokens go to main chat)
    const outputNodeIds = new Set(
        workflow.nodes.filter((n) => n.type === 'output').map((n) => n.id)
    );
    const finalProducerNodeIds = new Set(
        workflow.edges
            .filter((e) => outputNodeIds.has(e.target))
            .map((e) => e.source)
    );

    try {
        const finalOutput = await executeWorkflowFn(
            apiKey.value,
            workflow,
            message,
            {
                onNodeStatus: setNodeStatus,
                onNodeOutput: (nodeId, output) => {
                    // Store node output for later use
                    nodeOutputs.value[nodeId] = { nodeId, output };

                    // Get node info from workflow
                    const node = workflow.nodes.find((n) => n.id === nodeId);
                    const nodeType = node?.type;
                    const nodeLabel = node?.data?.label || nodeId;

                    // Skip certain node types:
                    // - start nodes: don't produce meaningful collapsible content
                    // - output nodes: just format, no LLM output
                    // - parallel nodes: have their own branch display
                    // - final producer nodes: their output streams to main chat area
                    if (
                        nodeType === 'start' ||
                        nodeType === 'output' ||
                        nodeType === 'parallel' ||
                        finalProducerNodeIds.has(nodeId)
                    ) {
                        return;
                    }

                    // Add a collapsible message for this node's output
                    const nodeMessage: ChatMessage = {
                        id: crypto.randomUUID(),
                        role: 'assistant',
                        content: '', // Empty - we use nodeOutputs instead
                        timestamp: new Date(),
                        nodeId,
                        nodeOutputs: [
                            {
                                nodeId,
                                label: nodeLabel,
                                content: output,
                                expanded: false, // Collapsed by default
                            },
                        ],
                    };
                    messages.value.push(nodeMessage);
                },
                onStreamingContent: setStreamingContent,
                onAppendContent: (token) => {
                    // When we start getting actual content, stop showing thinking
                    if (isThinking.value) {
                        isThinking.value = false;
                        thinkingContent.value = '';
                    }
                    appendStreamingContent(token);
                },
                onReasoningToken: (_nodeId, token) => {
                    // Show thinking indicator and accumulate reasoning content
                    if (!isThinking.value) {
                        isThinking.value = true;
                    }
                    thinkingContent.value += token;
                },
                onHITLRequest: handleHITLRequest,
                onRouteSelected: (nodeId, routeId) => {
                    console.log(
                        `[Router] Node ${nodeId} selected route: ${routeId}`
                    );
                },
                onContextCompacted: (result) => {
                    console.log(
                        `[Compaction] Reduced from ${result.tokensBefore} to ${result.tokensAfter} tokens`
                    );
                },
                onTokenUsage: (nodeId, usage) => {
                    tokenUsage.value = { nodeId, usage };
                },
                onLoopIteration: (nodeId, iteration, maxIterations) => {
                    // Update the node data so the WhileLoopNode component can display it
                    if (editor.value) {
                        editor.value.commands.updateNodeData(nodeId, {
                            iteration,
                            maxIterations,
                        });
                    }
                },
                // Branch streaming callbacks
                onBranchStart: (nodeId, branchId, branchLabel) => {
                    console.log(
                        `[BranchStart] BEFORE - nodeId=${nodeId}, branchId=${branchId}, currentKeys=${
                            Object.keys(branchStreams.value).join(', ') ||
                            'none'
                        }`
                    );

                    // Increment execution counter for this node to get a unique instance ID
                    // This ensures each loop iteration gets unique keys
                    if (!parallelExecutionCounter.value[nodeId]) {
                        parallelExecutionCounter.value[nodeId] = 0;
                    }
                    
                    // Check if this is a new execution (first branch of a new batch)
                    // Exclude merge branches from this check
                    const existingBranches = Object.keys(
                        branchStreams.value
                    ).filter(
                        (k) =>
                            branchStreams.value[k].nodeId === nodeId &&
                            branchStreams.value[k].branchId !== MERGE_BRANCH_ID
                    );
                    
                    // Only increment counter for non-merge branches starting a new execution
                    if (branchId !== MERGE_BRANCH_ID && existingBranches.length === 0) {
                        // No active branches for this node, this is a new execution
                        parallelExecutionCounter.value[nodeId]++;
                    }

                    const execInstance = parallelExecutionCounter.value[nodeId];
                    const key = `${nodeId}-${execInstance}-${branchId}`;
                    console.log(
                        `[BranchStart] AFTER - key=${key}, execInstance=${execInstance}, isMergeBranch=${branchId === MERGE_BRANCH_ID}`
                    );
                    branchStreams.value = {
                        ...branchStreams.value,
                        [key]: {
                            nodeId,
                            branchId,
                            label: branchLabel,
                            content: '',
                            status: 'streaming',
                            expanded: false,
                            isThinking: false,
                            thinkingContent: '',
                        },
                    };
                },
                onBranchToken: (nodeId, branchId, _branchLabel, token) => {
                    // Find the key that matches this node/branch (with any execution instance)
                    const key = Object.keys(branchStreams.value).find(
                        (k) =>
                            branchStreams.value[k].nodeId === nodeId &&
                            branchStreams.value[k].branchId === branchId
                    );
                    if (key && branchStreams.value[key]) {
                        // Direct mutation is fine for Vue 3 refs
                        branchStreams.value[key].isThinking = false;
                        branchStreams.value[key].content += token;
                    } else {
                        console.warn(
                            `[BranchToken] No matching branch found for nodeId=${nodeId}, branchId=${branchId}, keys=${Object.keys(
                                branchStreams.value
                            ).join(', ')}`
                        );
                    }
                },
                onBranchReasoning: (nodeId, branchId, _branchLabel, token) => {
                    const key = Object.keys(branchStreams.value).find(
                        (k) =>
                            branchStreams.value[k].nodeId === nodeId &&
                            branchStreams.value[k].branchId === branchId
                    );
                    if (key && branchStreams.value[key]) {
                        branchStreams.value[key].isThinking = true;
                        branchStreams.value[key].thinkingContent =
                            (branchStreams.value[key].thinkingContent ?? '') +
                            token;
                    }
                },
                onBranchComplete: (nodeId, branchId, _branchLabel, output) => {
                    const key = Object.keys(branchStreams.value).find(
                        (k) =>
                            branchStreams.value[k].nodeId === nodeId &&
                            branchStreams.value[k].branchId === branchId
                    );
                    console.log(
                        `[BranchComplete] nodeId=${nodeId}, branchId=${branchId}, key=${key}, hasContent=${!!output}, isMergeBranch=${branchId === MERGE_BRANCH_ID}`
                    );
                    if (key && branchStreams.value[key]) {
                        branchStreams.value[key].content = output;
                        branchStreams.value[key].status = 'completed';
                        branchStreams.value[key].isThinking = false;
                        branchStreams.value[key].thinkingContent = '';
                    } else {
                        console.warn(
                            `[BranchComplete] No matching branch found!`
                        );
                    }

                    // Handle merge branch completion separately
                    if (branchId === MERGE_BRANCH_ID) {
                        // Merge branch completes after regular branches
                        // Just clear the merge branch from streams
                        console.log(
                            `[BranchComplete] Clearing merge branch for nodeId=${nodeId}`
                        );
                        branchStreams.value = Object.fromEntries(
                            Object.entries(branchStreams.value).filter(
                                ([, v]) => !(v.nodeId === nodeId && v.branchId === MERGE_BRANCH_ID)
                            )
                        );
                        return; // Don't proceed with regular branch completion logic
                    }

                    // Check if all NON-MERGE branches for this node are completed
                    // Merge branches are a separate phase and shouldn't affect this check
                    const nodeBranches = Object.values(
                        branchStreams.value
                    ).filter(
                        (b) => b.nodeId === nodeId && b.branchId !== MERGE_BRANCH_ID
                    );
                    const allCompleted =
                        nodeBranches.length > 0 &&
                        nodeBranches.every(
                            (b) =>
                                b.status === 'completed' || b.status === 'error'
                        );
                    console.log(
                        `[BranchComplete] nodeBranches=${nodeBranches.length}, allCompleted=${allCompleted}`
                    );

                    // Only create a message when all regular branches complete
                    if (allCompleted) {
                        // Add a message with embedded branches to the chat
                        const branchesMessage: ChatMessage = {
                            id: crypto.randomUUID(),
                            role: 'assistant',
                            content: '', // Empty content - branches are displayed instead
                            timestamp: new Date(),
                            nodeId,
                            branches: nodeBranches.map((b) => ({
                                branchId: b.branchId,
                                label: b.label,
                                content: b.content,
                                expanded: false, // Collapsed by default
                            })),
                        };
                        messages.value.push(branchesMessage);
                        console.log(
                            '[Branches] Added branches message to chat:',
                            branchesMessage
                        );

                        // Clear only the regular branches, not merge branches
                        // Merge branches will be cleared when they complete
                        const keysToDeleteSet = new Set(
                            Object.keys(branchStreams.value).filter(
                                (k) =>
                                    branchStreams.value[k].nodeId === nodeId &&
                                    branchStreams.value[k].branchId !== MERGE_BRANCH_ID
                            )
                        );
                        console.log(
                            `[Branches] Deleting regular branch keys: ${Array.from(keysToDeleteSet).join(
                                ', '
                            )}`
                        );
                        branchStreams.value = Object.fromEntries(
                            Object.entries(branchStreams.value).filter(
                                ([k]) => !keysToDeleteSet.has(k)
                            )
                        );
                        console.log(
                            `[Branches] Remaining keys after regular branch cleanup: ${
                                Object.keys(branchStreams.value).join(', ') ||
                                'none'
                            }`
                        );
                    }
                },
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
        isThinking.value = false;
        thinkingContent.value = '';
        branchStreams.value = {};
    }
}

// ============================================================================
// Workflow Storage
// ============================================================================
function handleSave() {
    if (!editor.value) return;
    syncMetaToEditor();
    saveWorkflowToStorage(editor.value.getJSON());
    showSaveModal.value = false;
}

async function handleLoad(summary: WorkflowSummary) {
    if (!editor.value) return;

    const fullWorkflow = await load(summary.id);
    if (!fullWorkflow) return;

    editor.value.load(fullWorkflow);
    workflowName.value = fullWorkflow.meta.name;
    workflowDescription.value = fullWorkflow.meta.description || '';
    showLoadModal.value = false;
}

function handleExport() {
    if (!editor.value) return;
    syncMetaToEditor();
    exportWorkflow(editor.value.getJSON());
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
    validationResult.value = validateWorkflow(
        editor.value.getNodes() as any,
        editor.value.getEdges() as any
    );
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
    tokenUsage.value = null;
    branchStreams.value = {};
    resetExecution();
}

function syncMetaToEditor() {
    if (!editor.value) return;
    editor.value.setMeta({
        name: workflowName.value || 'Untitled',
        description: workflowDescription.value || undefined,
    });
}
</script>

<template>
    <div class="app">
        <!-- Header -->
        <HeaderBar
            v-model:workflowName="workflowName"
            v-model:workflowDescription="workflowDescription"
            :can-undo="canUndo"
            :can-redo="canRedo"
            :has-api-key="hasApiKey"
            :show-chat-panel="showChatPanel"
            @update:show-chat-panel="showChatPanel = $event"
            @undo="handleUndo"
            @redo="handleRedo"
            @save="showSaveModal = true"
            @load="showLoadModal = true"
            @export="handleExport"
            @import="handleImport"
            @validate="handleValidate"
            @open-api-key-modal="showApiKeyModal = true"
        />

        <!-- Main content -->
        <main class="main">
            <!-- Left sidebar -->
            <LeftSidebar
                :editor="editor"
                :active-panel="activePanel"
                :collapsed="!showLeftSidebar"
                :is-mobile="isMobile"
                @update:active-panel="activePanel = $event"
                @update:collapsed="showLeftSidebar = !$event"
            />

            <!-- Mobile sidebar backdrop -->
            <div
                v-if="isMobile && showLeftSidebar"
                class="mobile-sidebar-backdrop"
                @click="showLeftSidebar = false"
            ></div>

            <!-- Canvas -->
            <CanvasArea
                v-if="!isMobile || mobileView === 'editor'"
                :editor="editor"
                :node-statuses="nodeStatuses"
                :show-left-sidebar="showLeftSidebar"
                :is-mobile="isMobile"
                :selected-edge="selectedEdge"
                :show-edge-editor="showEdgeEditor"
                @expand-sidebar="showLeftSidebar = true"
                @node-click="handleNodeClick"
                @edge-click="handleEdgeClick"
                @pane-click="handlePaneClick"
                @update-edge-label="updateEdgeLabel"
                @delete-edge="deleteEdge"
                @close-edge-editor="showEdgeEditor = false"
            />

            <!-- Right sidebar - Chat -->
            <ChatPanel
                v-if="showChatPanel || (isMobile && mobileView === 'chat')"
                v-model:chat-input="chatInput"
                :messages="messages"
                :node-statuses="nodeStatuses"
                :node-labels="nodeLabels"
                :streaming-content="streamingContent"
                :is-running="isRunning"
                :is-thinking="isThinking"
                :thinking-content="thinkingContent"
                :token-usage="tokenUsage"
                :branch-streams="branchStreams"
                @send="handleSendMessage"
                @clear="clearMessages"
                @toggle-branch="toggleBranchExpanded"
                @toggle-message-branch="toggleMessageBranch"
                @toggle-message-node-output="toggleMessageNodeOutput"
            />

            <!-- Mobile Navigation -->
            <MobileNav
                v-if="isMobile"
                :mobile-view="mobileView"
                :message-count="messages.length"
                :has-api-key="hasApiKey"
                :show-menu="showMobileMenu"
                @toggle-view="toggleMobileView"
                @update:show-menu="showMobileMenu = $event"
                @undo="handleUndo"
                @redo="handleRedo"
                @save="showSaveModal = true"
                @load="showLoadModal = true"
                @export="handleExport"
                @open-api-key="showApiKeyModal = true"
            />
        </main>

        <!-- Modals -->
        <ApiKeyModal
            :show="showApiKeyModal"
            :has-api-key="hasApiKey"
            v-model:temp-api-key="tempApiKey"
            @close="showApiKeyModal = false"
            @save="saveApiKey"
            @clear="clearApiKey"
        />

        <SaveModal
            :show="showSaveModal"
            v-model:workflow-name="workflowName"
            @close="showSaveModal = false"
            @save="handleSave"
        />

        <LoadModal
            :show="showLoadModal"
            :workflows="savedWorkflows"
            @close="showLoadModal = false"
            @load="handleLoad"
            @delete="deleteWorkflow"
        />

        <ValidationModal
            :show="showValidationModal"
            :result="validationResult"
            @close="showValidationModal = false"
        />

        <HITLModal
            :show="showHITLModal"
            :request="pendingHITLRequest"
            v-model:user-input="hitlUserInput"
            @approve="handleHITLApprove"
            @reject="handleHITLReject"
            @skip="handleHITLSkip"
            @custom="
                (response) => {
                    if (resolveHITLPromise) {
                        resolveHITLPromise(response);
                        closeHITLModal();
                    }
                }
            "
        />
    </div>
</template>

<style scoped>
.app {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background: var(--or3-color-bg-primary, #09090c);
}

/* Main */
.main {
    display: flex;
    flex: 1;
    overflow: hidden;
    position: relative;
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
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn 0.15s ease;
}

.modal {
    background: var(--or3-color-bg-secondary, #111115);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-lg, 16px);
    padding: var(--or3-spacing-xl, 24px);
    width: 400px;
    max-width: 90vw;
    box-shadow: var(--or3-shadow-xl, 0 24px 64px rgba(0, 0, 0, 0.5));
    animation: modalSlideUp 0.2s ease;
}

@keyframes modalSlideUp {
    from {
        opacity: 0;
        transform: translateY(16px) scale(0.98);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.modal-lg {
    width: 500px;
}

.modal h2 {
    font-size: var(--or3-text-lg, 16px);
    font-weight: var(--or3-font-semibold, 600);
    margin: 0 0 var(--or3-spacing-sm, 8px) 0;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.modal p {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    font-size: var(--or3-text-sm, 13px);
    line-height: 1.6;
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.modal p a {
    color: var(--or3-color-accent, #8b5cf6);
    text-decoration: none;
    font-weight: var(--or3-font-medium, 500);
}

.modal p a:hover {
    text-decoration: underline;
}

.modal input {
    width: 100%;
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.form-label {
    display: block;
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    margin-bottom: var(--or3-spacing-xs, 4px);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--or3-spacing-sm, 8px);
    padding-top: var(--or3-spacing-md, 12px);
    margin-top: var(--or3-spacing-md, 12px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

/* Workflow List */
.workflow-list {
    max-height: 300px;
    overflow-y: auto;
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.workflow-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--or3-spacing-md, 12px);
    border-radius: var(--or3-radius-md, 10px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    margin-bottom: var(--or3-spacing-sm, 8px);
    transition: all var(--or3-transition-fast, 120ms);
}

.workflow-item:hover {
    background: var(--or3-color-surface-subtle, rgba(255, 255, 255, 0.06));
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.12));
}

.workflow-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.workflow-name {
    font-weight: var(--or3-font-semibold, 600);
    font-size: var(--or3-text-sm, 13px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.workflow-date {
    font-size: var(--or3-text-xs, 11px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
}

.workflow-actions {
    display: flex;
    gap: var(--or3-spacing-xs, 4px);
    opacity: 0.6;
    transition: opacity var(--or3-transition-fast, 120ms);
}

.workflow-item:hover .workflow-actions {
    opacity: 1;
}

.empty-state {
    text-align: center;
    padding: var(--or3-spacing-xl, 24px);
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--or3-text-sm, 13px);
}

/* Validation */
.validation-result {
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.validation-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: var(--or3-spacing-xl, 24px);
}

.success-icon {
    width: 48px;
    height: 48px;
    color: var(--or3-color-success, #22c55e);
    margin-bottom: var(--or3-spacing-md, 12px);
    filter: drop-shadow(0 0 12px rgba(34, 197, 94, 0.4));
}

.validation-section {
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.validation-section h3 {
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: var(--or3-spacing-sm, 8px);
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
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    font-size: var(--or3-text-sm, 13px);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.06));
    border-radius: var(--or3-radius-sm, 6px);
    margin-bottom: var(--or3-spacing-xs, 4px);
}

/* Responsive */

/* Mobile sidebar backdrop */
.mobile-sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
    z-index: 140;
    animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
    from {
        opacity: 0;
    }
    to {
        opacity: 1;
    }
}

@media (max-width: 768px) {
    .main {
        padding-bottom: 60px;
    }
}

/* HITL Modal Styles */
.hitl-overlay {
    z-index: 1000;
}

.hitl-modal {
    max-width: 500px;
    width: 90%;
}

.hitl-header {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-md, 12px);
    margin-bottom: var(--or3-spacing-lg, 16px);
}

.hitl-icon {
    width: 36px;
    height: 36px;
    color: var(--or3-color-warning, #f59e0b);
    filter: drop-shadow(0 0 12px rgba(245, 158, 11, 0.4));
}

.hitl-icon svg {
    width: 100%;
    height: 100%;
}

.hitl-header h2 {
    flex: 1;
    margin: 0;
    font-size: var(--or3-text-lg, 16px);
}

.hitl-mode-badge {
    padding: 4px 10px;
    border-radius: var(--or3-radius-sm, 6px);
    font-size: var(--or3-text-xs, 11px);
    font-weight: var(--or3-font-semibold, 600);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: var(--or3-color-bg-tertiary, #18181d);
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.hitl-content {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-lg, 16px);
}

.hitl-node-info {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
    font-size: var(--or3-text-sm, 13px);
    margin: 0;
}

.hitl-prompt {
    padding: var(--or3-spacing-lg, 16px);
    background: var(--or3-color-bg-tertiary, #18181d);
    border-radius: var(--or3-radius-md, 10px);
    line-height: 1.6;
    font-size: var(--or3-text-sm, 13px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

.hitl-context {
    background: var(--or3-color-bg-tertiary, #18181d);
    border-radius: var(--or3-radius-md, 10px);
    overflow: hidden;
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

.hitl-context h4 {
    margin: 0;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 16px);
    background: rgba(255, 255, 255, 0.03);
    font-size: var(--or3-text-xs, 11px);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    border-bottom: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
}

.hitl-context pre {
    margin: 0;
    padding: var(--or3-spacing-md, 16px);
    font-size: var(--or3-text-sm, 13px);
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 200px;
    overflow-y: auto;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.72));
}

.hitl-input-section {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.hitl-textarea {
    width: 100%;
    padding: var(--or3-spacing-md, 12px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    border-radius: var(--or3-radius-md, 10px);
    background: var(--or3-color-bg-tertiary, #18181d);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-family: inherit;
    font-size: var(--or3-text-sm, 13px);
    resize: vertical;
    transition: all var(--or3-transition-fast, 120ms);
}

.hitl-textarea:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
    box-shadow: 0 0 0 3px
        var(--or3-color-accent-muted, rgba(139, 92, 246, 0.15));
}

.hitl-options {
    display: flex;
    flex-wrap: wrap;
    gap: var(--or3-spacing-sm, 8px);
}

.hitl-option-btn {
    flex: 1;
    min-width: 100px;
}

.hitl-actions {
    margin-top: var(--or3-spacing-lg, 16px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    padding-top: var(--or3-spacing-lg, 16px);
}

.btn-danger {
    background: var(--or3-color-error, #ef4444);
    color: white;
    border: none;
    border-radius: var(--or3-radius-md, 10px);
    padding: var(--or3-spacing-sm, 10px) var(--or3-spacing-md, 16px);
    font-weight: var(--or3-font-semibold, 600);
    transition: all var(--or3-transition-fast, 120ms);
}

.btn-danger:hover {
    background: #dc2626;
    transform: translateY(-1px);
}
</style>
