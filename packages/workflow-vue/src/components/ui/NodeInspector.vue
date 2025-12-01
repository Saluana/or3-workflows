<script setup lang="ts">
import { ref, computed, watch, watchEffect } from 'vue';
import {
    WorkflowEditor,
    WorkflowNode,
    type NodeErrorConfig,
    type NodeRetryConfig,
    type ErrorCode,
    type HITLConfig,
    type HITLMode,
    type OutputFormat,
    modelRegistry,
    registerDefaultModels,
} from '@or3/workflow-core';

// Type guard for configurable node data
interface ConfigurableNodeData {
    label: string;
    description?: string;
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
const activeTab = ref<
    | 'prompt'
    | 'model'
    | 'tools'
    | 'errors'
    | 'hitl'
    | 'subflow'
    | 'output'
    | 'routes'
    | 'branches'
>('prompt');

// Available models from registry
// Register defaults if registry is empty
if (modelRegistry.size === 0) {
    registerDefaultModels();
}

const availableModels = computed(() => {
    return modelRegistry.getAllInfo().map((m) => ({
        id: m.id,
        name: m.name,
        provider: m.provider,
    }));
});

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

        const previousId = selectedNode.value?.id;
        selectedNode.value = node;

        // Sync tools from node data using type guard
        if (node) {
            selectedTools.value = getToolsArray(node.data);

            // Only reset tab if selection changed
            if (previousId !== node.id) {
                if (node.type === 'tool') {
                    activeTab.value = hasErrorHandling.value
                        ? 'errors'
                        : 'prompt';
                } else {
                    activeTab.value = 'prompt';
                }
            }
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
const isWhileNode = computed(() => selectedNode.value?.type === 'whileLoop');
const isToolNode = computed(() => selectedNode.value?.type === 'tool');
const isStartNode = computed(() => selectedNode.value?.type === 'start');
const isSubflowNode = computed(() => selectedNode.value?.type === 'subflow');
const isOutputNode = computed(() => selectedNode.value?.type === 'output');
const canDelete = computed(
    () => selectedNode.value && selectedNode.value.type !== 'start'
);
const isConfigurable = computed(
    () =>
        isAgentNode.value ||
        isRouterNode.value ||
        isParallelNode.value ||
        isWhileNode.value ||
        isSubflowNode.value ||
        isOutputNode.value
);
const hasErrorHandling = computed(
    () => isAgentNode.value || isRouterNode.value || isToolNode.value
);
const hasHITL = computed(
    () => isAgentNode.value || isRouterNode.value || isToolNode.value
);

const nodeData = computed<ConfigurableNodeData>(() => {
    const data = selectedNode.value?.data;
    return isConfigurableData(data) ? data : { label: 'Unknown' };
});

const whileData = computed(() => {
    const data = selectedNode.value?.data as any;
    return data || {};
});

const outputData = computed<{
    format: OutputFormat;
    template: string;
    includeMetadata: boolean;
    schema: Record<string, unknown> | null;
}>(() => {
    const data = selectedNode.value?.data as any;
    return {
        format: data?.format ?? 'text',
        template: data?.template ?? '',
        includeMetadata: data?.includeMetadata ?? false,
        schema: data?.schema ?? null,
    };
});

// JSON Schema editor state
const schemaExpanded = ref(false);
const schemaText = ref('');
const schemaError = ref<string | null>(null);

// Sync schemaText when node changes
watch(
    () => outputData.value.schema,
    (schema) => {
        if (schema) {
            schemaText.value = JSON.stringify(schema, null, 2);
        } else {
            schemaText.value = '';
        }
        schemaError.value = null;
    },
    { immediate: true }
);
const subflowData = computed(() => {
    const data = selectedNode.value?.data as any;
    return {
        subflowId: data?.subflowId ?? '',
        inputMappings: data?.inputMappings ?? {},
        shareSession: data?.shareSession ?? true,
    };
});

const routerData = computed(() => {
    const data = selectedNode.value?.data as any;
    return {
        routes: Array.isArray(data?.routes) ? data.routes : [],
    };
});

// Parallel node data
interface BranchConfig {
    id: string;
    label: string;
    model?: string;
    prompt?: string;
}

const parallelData = computed(() => {
    const data = selectedNode.value?.data as any;
    return {
        branches: Array.isArray(data?.branches) ? data.branches : [],
        mergeModel: data?.model || '',
        mergePrompt: data?.prompt || '',
        mergeEnabled: data?.mergeEnabled,
    };
});

const addBranch = () => {
    if (!selectedNode.value) return;
    const branches = [...parallelData.value.branches];
    const id = `branch-${Date.now()}`;
    branches.push({ id, label: `Branch ${branches.length + 1}` });
    props.editor.commands.updateNodeData(selectedNode.value.id, { branches });
};

const removeBranch = (branchId: string) => {
    if (!selectedNode.value) return;
    const branches = parallelData.value.branches.filter(
        (b: BranchConfig) => b.id !== branchId
    );
    props.editor.commands.updateNodeData(selectedNode.value.id, { branches });
};

const updateBranchLabel = (branchId: string, label: string) => {
    if (!selectedNode.value) return;
    const branches = parallelData.value.branches.map((b: BranchConfig) =>
        b.id === branchId ? { ...b, label } : b
    );
    props.editor.commands.updateNodeData(selectedNode.value.id, { branches });
};

const updateBranchModel = (branchId: string, model: string) => {
    if (!selectedNode.value) return;
    const branches = parallelData.value.branches.map((b: BranchConfig) =>
        b.id === branchId ? { ...b, model: model || undefined } : b
    );
    props.editor.commands.updateNodeData(selectedNode.value.id, { branches });
};

const updateBranchPrompt = (branchId: string, prompt: string) => {
    if (!selectedNode.value) return;
    const branches = parallelData.value.branches.map((b: BranchConfig) =>
        b.id === branchId ? { ...b, prompt: prompt || undefined } : b
    );
    props.editor.commands.updateNodeData(selectedNode.value.id, { branches });
};

// Track which branch is expanded for editing
const expandedBranchId = ref<string | null>(null);

const toggleBranchExpanded = (branchId: string) => {
    expandedBranchId.value =
        expandedBranchId.value === branchId ? null : branchId;
};

const addRoute = () => {
    if (!selectedNode.value) return;
    const routes = [...routerData.value.routes];
    const id = `route-${Date.now()}`;
    routes.push({ id, label: `Route ${routes.length + 1}` });
    props.editor.commands.updateNodeData(selectedNode.value.id, { routes });
};

const removeRoute = (routeId: string) => {
    if (!selectedNode.value) return;
    const routes = routerData.value.routes.filter((r: any) => r.id !== routeId);
    props.editor.commands.updateNodeData(selectedNode.value.id, { routes });
};

const updateRouteLabel = (routeId: string, label: string) => {
    if (!selectedNode.value) return;
    const routes = routerData.value.routes.map((r: any) =>
        r.id === routeId ? { ...r, label } : r
    );
    props.editor.commands.updateNodeData(selectedNode.value.id, { routes });
};

const errorHandling = computed<NodeErrorConfig>(() => {
    const data = selectedNode.value?.data as
        | { errorHandling?: NodeErrorConfig }
        | undefined;
    return data?.errorHandling ?? { mode: 'stop' };
});

const retryConfig = computed<NodeRetryConfig>(() => {
    const retry = errorHandling.value.retry;
    return {
        maxRetries: retry?.maxRetries ?? 0,
        baseDelay: retry?.baseDelay ?? 1000,
        maxDelay: retry?.maxDelay,
        retryOn: retry?.retryOn ?? [],
        skipOn: retry?.skipOn,
    };
});

const hitlConfig = computed<HITLConfig>(() => {
    const data = selectedNode.value?.data as { hitl?: HITLConfig } | undefined;
    return data?.hitl ?? { enabled: false, mode: 'approval' };
});

const hitlModes: Array<{ id: HITLMode; label: string; description: string }> = [
    {
        id: 'approval',
        label: 'Approval',
        description: 'Pause before execution for approve/reject',
    },
    {
        id: 'input',
        label: 'Input',
        description: 'Collect human input before execution',
    },
    {
        id: 'review',
        label: 'Review',
        description: 'Pause after execution to review output',
    },
];

const hitlDefaultActions = [
    { id: 'approve', label: 'Approve' },
    { id: 'reject', label: 'Reject' },
    { id: 'skip', label: 'Skip' },
];

const errorCodes: { id: ErrorCode; label: string }[] = [
    { id: 'RATE_LIMIT', label: 'Rate Limit' },
    { id: 'TIMEOUT', label: 'Timeout' },
    { id: 'NETWORK', label: 'Network' },
    { id: 'LLM_ERROR', label: 'LLM Error' },
    { id: 'VALIDATION', label: 'Validation' },
];

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

const updateDescription = (event: Event) => {
    debouncedUpdate('description', (event.target as HTMLTextAreaElement).value);
};

const updateModel = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    props.editor.commands.updateNodeData(selectedNode.value!.id, {
        ...(isWhileNode.value ? { conditionModel: value } : { model: value }),
    });
};

const updatePrompt = (event: Event) => {
    const value = (event.target as HTMLTextAreaElement).value;
    const field = isWhileNode.value ? 'conditionPrompt' : 'prompt';
    debouncedUpdate(field, value);
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

const updateErrorHandling = (partial: Partial<NodeErrorConfig>) => {
    if (!selectedNode.value) return;
    const current = errorHandling.value;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        errorHandling: {
            ...current,
            ...partial,
        },
    });
};

const updateRetryConfig = (changes: Partial<NodeRetryConfig>) => {
    updateErrorHandling({
        retry: {
            ...retryConfig.value,
            ...changes,
        },
    });
};

const updateErrorMode = (mode: NodeErrorConfig['mode']) => {
    updateErrorHandling({ mode });
};

const toggleRetryOn = (code: ErrorCode) => {
    const current = retryConfig.value.retryOn || [];
    const updated = current.includes(code)
        ? current.filter((c) => c !== code)
        : [...current, code];
    updateRetryConfig({ retryOn: updated });
};

const onRetryNumberChange = (
    field: 'maxRetries' | 'baseDelay' | 'maxDelay',
    event: Event
) => {
    const value = Number((event.target as HTMLInputElement).value);
    updateRetryConfig({
        [field]: Number.isFinite(value) ? value : undefined,
    } as Partial<NodeRetryConfig>);
};

const updateMaxIterations = (event: Event) => {
    const value = Number((event.target as HTMLInputElement).value);
    debouncedUpdate('maxIterations', Number.isFinite(value) ? value : 1);
};

const updateOnMaxBehavior = (event: Event) => {
    debouncedUpdate(
        'onMaxIterations',
        (event.target as HTMLSelectElement).value
    );
};

const updateCustomEvaluator = (event: Event) => {
    debouncedUpdate(
        'customEvaluator',
        (event.target as HTMLInputElement).value
    );
};

// HITL update handlers
const updateHITL = (partial: Partial<HITLConfig>) => {
    if (!selectedNode.value) return;
    const current = hitlConfig.value;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        hitl: {
            ...current,
            ...partial,
        },
    });
};

const toggleHITLEnabled = () => {
    updateHITL({ enabled: !hitlConfig.value.enabled });
};

const updateHITLMode = (mode: HITLMode) => {
    updateHITL({ mode });
};

const updateHITLPrompt = (event: Event) => {
    if (!selectedNode.value) return;
    const value = (event.target as HTMLTextAreaElement).value;
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        updateHITL({ prompt: value });
    }, 200);
};

const updateHITLTimeout = (event: Event) => {
    const value = Number((event.target as HTMLInputElement).value);
    updateHITL({
        timeout: Number.isFinite(value) && value > 0 ? value : undefined,
    });
};

const updateHITLDefaultAction = (event: Event) => {
    const value = (event.target as HTMLSelectElement)
        .value as HITLConfig['defaultAction'];
    updateHITL({ defaultAction: value });
};

// Subflow update handlers
const updateSubflowId = (event: Event) => {
    debouncedUpdate('subflowId', (event.target as HTMLInputElement).value);
};

const toggleShareSession = () => {
    if (!selectedNode.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        shareSession: !subflowData.value.shareSession,
    });
};

const updateInputMapping = (inputId: string, value: string) => {
    if (!selectedNode.value) return;
    const current = subflowData.value.inputMappings || {};
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        inputMappings: {
            ...current,
            [inputId]: value,
        },
    });
};

const removeInputMapping = (inputId: string) => {
    if (!selectedNode.value) return;
    const current = { ...subflowData.value.inputMappings };
    delete current[inputId];
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        inputMappings: current,
    });
};

// Output node update handlers
const updateOutputFormat = (event: Event) => {
    if (!selectedNode.value) return;
    const value = (event.target as HTMLSelectElement).value as OutputFormat;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        format: value,
    });
};

const updateOutputTemplate = (event: Event) => {
    if (!selectedNode.value) return;
    const value = (event.target as HTMLTextAreaElement).value;
    if (debounceTimeout) clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
        props.editor.commands.updateNodeData(selectedNode.value!.id, {
            template: value,
        });
    }, 200);
};

const toggleIncludeMetadata = () => {
    if (!selectedNode.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        includeMetadata: !outputData.value.includeMetadata,
    });
};

const updateSchema = () => {
    if (!selectedNode.value) return;
    const text = schemaText.value.trim();

    if (!text) {
        // Clear schema
        schemaError.value = null;
        props.editor.commands.updateNodeData(selectedNode.value.id, {
            schema: undefined,
        });
        return;
    }

    try {
        const parsed = JSON.parse(text);
        if (typeof parsed !== 'object' || parsed === null) {
            schemaError.value = 'Schema must be a JSON object';
            return;
        }
        schemaError.value = null;
        props.editor.commands.updateNodeData(selectedNode.value.id, {
            schema: parsed,
        });
    } catch (e) {
        schemaError.value = `Invalid JSON: ${(e as Error).message}`;
    }
};

const formatSchema = () => {
    try {
        const parsed = JSON.parse(schemaText.value);
        schemaText.value = JSON.stringify(parsed, null, 2);
        schemaError.value = null;
    } catch (e) {
        schemaError.value = `Cannot format: ${(e as Error).message}`;
    }
};

const applySchemaPreset = (preset: 'object' | 'array' | 'string') => {
    const presets = {
        object: {
            type: 'object',
            properties: {
                result: { type: 'string', description: 'The result' },
            },
            required: ['result'],
        },
        array: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
        },
        string: {
            type: 'string',
            minLength: 1,
        },
    };
    schemaText.value = JSON.stringify(presets[preset], null, 2);
    schemaError.value = null;
    updateSchema();
};

const clearSchema = () => {
    schemaText.value = '';
    schemaError.value = null;
    if (selectedNode.value) {
        props.editor.commands.updateNodeData(selectedNode.value.id, {
            schema: undefined,
        });
    }
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

        <!-- Description field - helps router understand what this node does -->
        <div v-if="isConfigurable" class="description-section">
            <label class="description-label">
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                    ></path>
                    <polyline points="14 2 14 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <line x1="16" y1="17" x2="8" y2="17"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                Description
                <span class="description-hint"
                    >(used by router for decisions)</span
                >
            </label>
            <textarea
                class="description-textarea"
                :value="nodeData.description || ''"
                placeholder="Describe what this node does... e.g., 'Handles complex math problems and coding questions'"
                @input="updateDescription"
            ></textarea>
        </div>

        <!-- Tabs for Agent/Router/Parallel nodes -->
        <div v-if="isConfigurable || hasErrorHandling" class="tabs">
            <button
                class="tab"
                :class="{ active: activeTab === 'prompt' }"
                @click="activeTab = 'prompt'"
                v-if="isConfigurable"
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
                {{
                    isRouterNode
                        ? 'Instructions'
                        : isWhileNode
                        ? 'Condition'
                        : 'Prompt'
                }}
            </button>
            <button
                class="tab"
                :class="{ active: activeTab === 'model' }"
                @click="activeTab = 'model'"
                v-if="isConfigurable"
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
                v-if="isRouterNode"
                class="tab"
                :class="{ active: activeTab === 'routes' }"
                @click="activeTab = 'routes'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path d="M9 18l6-6-6-6"></path>
                </svg>
                Routes
                <span class="tool-count">{{ routerData.routes.length }}</span>
            </button>
            <button
                v-if="isParallelNode"
                class="tab"
                :class="{ active: activeTab === 'branches' }"
                @click="activeTab = 'branches'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <circle cx="18" cy="18" r="3"></circle>
                    <circle cx="6" cy="6" r="3"></circle>
                    <circle cx="18" cy="6" r="3"></circle>
                    <path d="M6 9v12"></path>
                    <path d="M18 9v6"></path>
                </svg>
                Branches
                <span class="tool-count">{{
                    parallelData.branches.length
                }}</span>
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
            <button
                v-if="hasErrorHandling"
                class="tab"
                :class="{ active: activeTab === 'errors' }"
                @click="activeTab = 'errors'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                    ></path>
                    <line x1="12" y1="9" x2="12" y2="13"></line>
                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                Errors
            </button>
            <button
                v-if="hasHITL"
                class="tab"
                :class="{ active: activeTab === 'hitl' }"
                @click="activeTab = 'hitl'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                </svg>
                HITL
                <span v-if="hitlConfig.enabled" class="hitl-badge">ON</span>
            </button>
            <button
                v-if="isSubflowNode"
                class="tab"
                :class="{ active: activeTab === 'subflow' }"
                @click="activeTab = 'subflow'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                    <rect x="8.5" y="14" width="7" height="7" rx="1"></rect>
                    <path d="M6.5 10v2a2 2 0 002 2h1"></path>
                    <path d="M17.5 10v2a2 2 0 01-2 2h-1"></path>
                </svg>
                Subflow
            </button>
            <button
                v-if="isOutputNode"
                class="tab"
                :class="{ active: activeTab === 'output' }"
                @click="activeTab = 'output'"
            >
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                >
                    <path
                        d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"
                    ></path>
                    <line x1="4" y1="22" x2="4" y2="15"></line>
                </svg>
                Output
            </button>
        </div>

        <!-- Tab Content -->
        <div
            v-if="
                isConfigurable ||
                hasErrorHandling ||
                hasHITL ||
                isSubflowNode ||
                isOutputNode
            "
            class="tab-content"
        >
            <!-- Prompt Tab -->
            <div
                v-if="activeTab === 'prompt' && isConfigurable"
                class="prompt-tab"
            >
                <template v-if="isWhileNode">
                    <label class="field-label">Condition Prompt</label>
                    <textarea
                        :value="whileData.conditionPrompt || ''"
                        class="prompt-textarea"
                        placeholder='Describe when to continue. Example: "If quality is low, respond continue; otherwise respond done."'
                        @input="updatePrompt"
                    ></textarea>
                    <div class="grid">
                        <div class="field-group">
                            <label class="field-label">Max iterations</label>
                            <input
                                type="number"
                                min="1"
                                class="text-input"
                                :value="whileData.maxIterations ?? 10"
                                @input="updateMaxIterations"
                            />
                        </div>
                        <div class="field-group">
                            <label class="field-label">On max behavior</label>
                            <select
                                class="model-select"
                                :value="whileData.onMaxIterations || 'warning'"
                                @change="updateOnMaxBehavior"
                            >
                                <option value="warning">
                                    Warning then exit
                                </option>
                                <option value="continue">Exit silently</option>
                                <option value="error">Throw error</option>
                            </select>
                        </div>
                    </div>
                    <div class="field-group">
                        <label class="field-label"
                            >Custom evaluator (optional)</label
                        >
                        <input
                            type="text"
                            class="text-input"
                            :value="whileData.customEvaluator || ''"
                            placeholder="Name of custom evaluator"
                            @input="updateCustomEvaluator"
                        />
                    </div>
                    <p class="field-hint">
                        Loops run at least once. Provide a custom evaluator name
                        to use an injected function instead of an LLM.
                    </p>
                </template>
                <template v-else>
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
                </template>
            </div>

            <!-- Model Tab -->
            <div v-if="activeTab === 'model'" class="model-tab">
                <label class="field-label">
                    {{ isWhileNode ? 'Condition Model' : 'Select Model' }}
                </label>
                <select
                    class="model-select"
                    :value="
                        isWhileNode
                            ? whileData.conditionModel || 'z-ai/glm-4.6:exacto'
                            : nodeData.model || 'z-ai/glm-4.6:exacto'
                    "
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
                    <code>
                        {{
                            isWhileNode
                                ? whileData.conditionModel ||
                                  'z-ai/glm-4.6:exacto'
                                : nodeData.model || 'z-ai/glm-4.6:exacto'
                        }}
                    </code>
                </div>
            </div>

            <!-- Routes Tab -->
            <div
                v-if="activeTab === 'routes' && isRouterNode"
                class="routes-tab"
            >
                <div class="routes-header">
                    <label class="field-label">Defined Routes</label>
                    <button class="add-btn" @click="addRoute">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add Route
                    </button>
                </div>
                <p class="field-hint">
                    Define the possible routes for this node. Each route creates
                    an output handle.
                </p>

                <div class="routes-list">
                    <div
                        v-for="route in routerData.routes"
                        :key="route.id"
                        class="route-item"
                    >
                        <div class="route-inputs">
                            <input
                                type="text"
                                class="text-input route-label"
                                :value="route.label"
                                @input="(e) => updateRouteLabel(route.id, (e.target as HTMLInputElement).value)"
                                placeholder="Route Label"
                            />
                            <code class="route-id">{{ route.id }}</code>
                        </div>
                        <button
                            class="delete-btn"
                            @click="removeRoute(route.id)"
                            title="Remove route"
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
                </div>
            </div>

            <!-- Branches Tab (Parallel Node) -->
            <div
                v-if="activeTab === 'branches' && isParallelNode"
                class="branches-tab"
            >
                <div class="branches-header">
                    <label class="field-label">Parallel Branches</label>
                    <button
                        class="add-btn"
                        @click="addBranch"
                        aria-label="Add Branch"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                    </button>
                </div>
                <p class="field-hint">
                    Each branch runs in parallel. Connect nodes to each branch's
                    output handle. Optionally set a model and system prompt per
                    branch.
                </p>

                <div class="branches-list">
                    <div
                        v-for="branch in parallelData.branches"
                        :key="branch.id"
                        class="branch-item"
                        :class="{ expanded: expandedBranchId === branch.id }"
                    >
                        <div
                            class="branch-header"
                            @click="toggleBranchExpanded(branch.id)"
                        >
                            <div class="branch-inputs">
                                <input
                                    type="text"
                                    class="text-input branch-label"
                                    :value="branch.label"
                                    @input="(e) => updateBranchLabel(branch.id, (e.target as HTMLInputElement).value)"
                                    @click.stop
                                    placeholder="Branch Label"
                                />
                                <div class="branch-badges">
                                    <span
                                        v-if="branch.model"
                                        class="branch-badge model"
                                    >
                                        {{ branch.model.split('/').pop() }}
                                    </span>
                                    <span
                                        v-if="branch.prompt"
                                        class="branch-badge prompt"
                                    >
                                        prompt
                                    </span>
                                </div>
                            </div>
                            <div class="branch-actions">
                                <svg
                                    class="expand-icon"
                                    :class="{
                                        rotated: expandedBranchId === branch.id,
                                    }"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <polyline
                                        points="6 9 12 15 18 9"
                                    ></polyline>
                                </svg>
                                <button
                                    class="delete-btn"
                                    @click.stop="removeBranch(branch.id)"
                                    title="Remove branch"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                    >
                                        <line
                                            x1="18"
                                            y1="6"
                                            x2="6"
                                            y2="18"
                                        ></line>
                                        <line
                                            x1="6"
                                            y1="6"
                                            x2="18"
                                            y2="18"
                                        ></line>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <div
                            v-if="expandedBranchId === branch.id"
                            class="branch-config"
                        >
                            <div class="branch-field">
                                <label class="field-label-sm"
                                    >Model (optional)</label
                                >
                                <select
                                    class="model-select-sm"
                                    :value="branch.model || ''"
                                    @change="(e) => updateBranchModel(branch.id, (e.target as HTMLSelectElement).value)"
                                >
                                    <option value="">Use default</option>
                                    <option
                                        v-for="m in availableModels"
                                        :key="m.id"
                                        :value="m.id"
                                    >
                                        {{ m.name }}
                                    </option>
                                </select>
                            </div>
                            <div class="branch-field">
                                <label class="field-label-sm"
                                    >System Prompt (optional)</label
                                >
                                <textarea
                                    class="prompt-textarea-sm"
                                    :value="branch.prompt || ''"
                                    @input="(e) => updateBranchPrompt(branch.id, (e.target as HTMLTextAreaElement).value)"
                                    placeholder="Override system prompt for this branch..."
                                    rows="3"
                                ></textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Merge Configuration -->
                <div class="merge-section">
                    <div class="merge-header">
                        <label class="field-label">Merge Configuration</label>
                        <div class="toggle-label">
                            <input
                                type="checkbox"
                                :checked="parallelData.mergeEnabled !== false"
                                @change="(e) => props.editor.commands.updateNodeData(selectedNode!.id, { mergeEnabled: (e.target as HTMLInputElement).checked } as any)"
                            />
                            <span class="toggle-text">Enable Merge</span>
                        </div>
                    </div>

                    <template v-if="parallelData.mergeEnabled !== false">
                        <p class="field-hint">
                            After all branches complete, results are merged
                            using this prompt.
                        </p>
                        <div class="merge-field">
                            <label class="field-label-sm">Merge Model</label>
                            <select
                                class="model-select"
                                :value="
                                    parallelData.mergeModel ||
                                    'z-ai/glm-4.6:exacto'
                                "
                                @change="(e) => props.editor.commands.updateNodeData(selectedNode!.id, { model: (e.target as HTMLSelectElement).value })"
                            >
                                <option
                                    v-for="m in availableModels"
                                    :key="m.id"
                                    :value="m.id"
                                >
                                    {{ m.name }} ({{ m.provider }})
                                </option>
                            </select>
                        </div>
                        <div class="merge-field">
                            <label class="field-label-sm">Merge Prompt</label>
                            <textarea
                                class="prompt-textarea"
                                :value="parallelData.mergePrompt"
                                @input="(e) => debouncedUpdate('prompt', (e.target as HTMLTextAreaElement).value)"
                                placeholder="Instructions for merging branch outputs..."
                                rows="4"
                            ></textarea>
                        </div>
                    </template>
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

            <!-- Error Handling Tab -->
            <div
                v-if="activeTab === 'errors' && hasErrorHandling"
                class="errors-tab"
            >
                <label class="field-label">Error handling mode</label>
                <div class="mode-buttons">
                    <button
                        class="mode-button"
                        :class="{ active: errorHandling.mode === 'stop' }"
                        @click="updateErrorMode('stop')"
                    >
                        Stop on error
                    </button>
                    <button
                        class="mode-button"
                        :class="{ active: errorHandling.mode === 'continue' }"
                        @click="updateErrorMode('continue')"
                    >
                        Continue
                    </button>
                    <button
                        class="mode-button"
                        :class="{ active: errorHandling.mode === 'branch' }"
                        @click="updateErrorMode('branch')"
                    >
                        Branch to error
                    </button>
                </div>

                <div class="retry-grid">
                    <div class="field-group">
                        <label class="field-label">Max retries</label>
                        <input
                            type="number"
                            min="0"
                            class="text-input"
                            :value="retryConfig.maxRetries"
                            @input="onRetryNumberChange('maxRetries', $event)"
                        />
                    </div>
                    <div class="field-group">
                        <label class="field-label">Base delay (ms)</label>
                        <input
                            type="number"
                            min="0"
                            class="text-input"
                            :value="retryConfig.baseDelay"
                            @input="onRetryNumberChange('baseDelay', $event)"
                        />
                    </div>
                    <div class="field-group">
                        <label class="field-label">Max delay (ms)</label>
                        <input
                            type="number"
                            min="0"
                            class="text-input"
                            :value="retryConfig.maxDelay ?? ''"
                            @input="onRetryNumberChange('maxDelay', $event)"
                        />
                    </div>
                </div>

                <div class="checkbox-group">
                    <label class="field-label">Retry on codes</label>
                    <div class="checkboxes">
                        <label
                            v-for="code in errorCodes"
                            :key="code.id"
                            class="checkbox-item"
                        >
                            <input
                                type="checkbox"
                                :checked="
                                    (retryConfig.retryOn || []).includes(
                                        code.id
                                    )
                                "
                                @change="toggleRetryOn(code.id)"
                            />
                            <span>{{ code.label }}</span>
                        </label>
                    </div>
                </div>

                <p class="field-hint">
                    Branch mode sends errors to the "error" handle if connected.
                    Continue mode logs the error and moves forward.
                </p>
            </div>

            <!-- HITL Tab -->
            <div v-if="activeTab === 'hitl' && hasHITL" class="hitl-tab">
                <div class="hitl-toggle">
                    <label class="toggle-label">
                        <input
                            type="checkbox"
                            :checked="hitlConfig.enabled"
                            @change="toggleHITLEnabled"
                        />
                        <span class="toggle-text">Enable Human Review</span>
                    </label>
                    <p class="field-hint" style="margin-top: 4px">
                        Pause execution for human approval, input, or review.
                    </p>
                </div>

                <template v-if="hitlConfig.enabled">
                    <div class="hitl-section">
                        <label class="field-label">Review Mode</label>
                        <div class="mode-buttons">
                            <button
                                v-for="mode in hitlModes"
                                :key="mode.id"
                                class="mode-button hitl-mode"
                                :class="{ active: hitlConfig.mode === mode.id }"
                                @click="updateHITLMode(mode.id)"
                                :title="mode.description"
                            >
                                {{ mode.label }}
                            </button>
                        </div>
                        <p class="field-hint">
                            {{
                                hitlModes.find((m) => m.id === hitlConfig.mode)
                                    ?.description
                            }}
                        </p>
                    </div>

                    <div class="hitl-section">
                        <label class="field-label">Prompt</label>
                        <textarea
                            :value="hitlConfig.prompt || ''"
                            class="prompt-textarea hitl-prompt"
                            placeholder="Message to show the reviewer..."
                            @input="updateHITLPrompt"
                        ></textarea>
                    </div>

                    <div class="hitl-grid">
                        <div class="field-group">
                            <label class="field-label">Timeout (ms)</label>
                            <input
                                type="number"
                                min="0"
                                class="text-input"
                                :value="hitlConfig.timeout || ''"
                                placeholder="No timeout"
                                @input="updateHITLTimeout"
                            />
                        </div>
                        <div class="field-group">
                            <label class="field-label">Default Action</label>
                            <select
                                class="model-select"
                                :value="hitlConfig.defaultAction || 'reject'"
                                @change="updateHITLDefaultAction"
                            >
                                <option
                                    v-for="action in hitlDefaultActions"
                                    :key="action.id"
                                    :value="action.id"
                                >
                                    {{ action.label }}
                                </option>
                            </select>
                        </div>
                    </div>

                    <p class="field-hint">
                        When timeout is set, the default action is taken
                        automatically. Connect the "Rejected" handle to route
                        rejected items.
                    </p>
                </template>
            </div>

            <!-- Subflow Tab -->
            <div
                v-if="activeTab === 'subflow' && isSubflowNode"
                class="subflow-tab"
            >
                <div class="field-group">
                    <label class="field-label">Subflow ID</label>
                    <input
                        type="text"
                        class="text-input"
                        :value="subflowData.subflowId"
                        placeholder="e.g., email-composer"
                        @input="updateSubflowId"
                    />
                    <p class="field-hint">
                        ID of the subflow to execute. Must be registered in the
                        subflow registry.
                    </p>
                </div>

                <div class="subflow-toggle">
                    <label class="toggle-label">
                        <input
                            type="checkbox"
                            :checked="subflowData.shareSession"
                            @change="toggleShareSession"
                        />
                        <span class="toggle-text">Share Session</span>
                    </label>
                    <p class="field-hint" style="margin-top: 4px">
                        When enabled, the subflow shares conversation history
                        with the parent workflow.
                    </p>
                </div>

                <div
                    class="input-mappings-section"
                    v-if="Object.keys(subflowData.inputMappings).length > 0"
                >
                    <label class="field-label">Input Mappings</label>
                    <div class="mappings-list">
                        <div
                            v-for="(value, key) in subflowData.inputMappings"
                            :key="key"
                            class="mapping-item"
                        >
                            <span class="mapping-key">{{ key }}</span>
                            <input
                                type="text"
                                class="text-input mapping-value"
                                :value="String(value)"
                                @input="(e) => updateInputMapping(String(key), (e.target as HTMLInputElement).value)"
                            />
                            <button
                                class="remove-mapping-btn"
                                @click="removeInputMapping(String(key))"
                                title="Remove mapping"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                </div>

                <div class="info-box">
                    <p><strong>Expressions:</strong></p>
                    <ul class="expression-hints">
                        <li>
                            <code v-pre>{{ output }}</code> - Current
                            input/output
                        </li>
                        <li>
                            <code v-pre>{{ outputs.nodeId }}</code> - Output
                            from a specific node
                        </li>
                        <li><code>"literal"</code> - Static value</li>
                    </ul>
                </div>
            </div>

            <!-- Output Tab -->
            <div
                v-if="activeTab === 'output' && isOutputNode"
                class="output-tab"
            >
                <div class="field-group">
                    <label class="field-label">Output Format</label>
                    <select
                        class="select-input"
                        :value="outputData.format"
                        @change="updateOutputFormat"
                    >
                        <option value="text">Text</option>
                        <option value="json">JSON</option>
                        <option value="markdown">Markdown</option>
                    </select>
                    <p class="field-hint">
                        The format for the workflow's final output.
                    </p>
                </div>

                <div class="field-group">
                    <label class="field-label">Output Template</label>
                    <textarea
                        class="textarea-input"
                        :value="outputData.template"
                        :placeholder="'e.g., Final result: {{outputs.nodeId}}'"
                        @input="updateOutputTemplate"
                        rows="4"
                    ></textarea>
                    <p class="field-hint">
                        Use <code v-pre>{{ outputs.nodeId }}</code> to reference
                        output from specific nodes. Leave empty to use the last
                        node's output.
                    </p>
                </div>

                <div class="output-toggle">
                    <label class="toggle-label">
                        <input
                            type="checkbox"
                            :checked="outputData.includeMetadata"
                            @change="toggleIncludeMetadata"
                        />
                        <span class="toggle-text">Include Metadata</span>
                    </label>
                    <p class="field-hint" style="margin-top: 4px">
                        When enabled, the output includes timing, token usage,
                        and execution metadata.
                    </p>
                </div>

                <!-- JSON Schema Editor (only for JSON format) -->
                <div v-if="outputData.format === 'json'" class="schema-section">
                    <button
                        class="schema-toggle"
                        @click="schemaExpanded = !schemaExpanded"
                    >
                        <svg
                            class="toggle-chevron"
                            :class="{ expanded: schemaExpanded }"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                        <span>JSON Schema Validation</span>
                        <span v-if="outputData.schema" class="schema-badge"
                            >Active</span
                        >
                    </button>

                    <div v-if="schemaExpanded" class="schema-editor">
                        <div class="schema-toolbar">
                            <span class="toolbar-label">Presets:</span>
                            <button
                                class="preset-btn"
                                @click="applySchemaPreset('object')"
                                title="Object schema"
                            >
                                { }
                            </button>
                            <button
                                class="preset-btn"
                                @click="applySchemaPreset('array')"
                                title="Array schema"
                            >
                                [ ]
                            </button>
                            <button
                                class="preset-btn"
                                @click="applySchemaPreset('string')"
                                title="String schema"
                            >
                                " "
                            </button>
                            <div class="toolbar-spacer"></div>
                            <button
                                class="action-btn"
                                @click="formatSchema"
                                title="Format JSON"
                            >
                                Format
                            </button>
                            <button
                                class="action-btn danger"
                                @click="clearSchema"
                                title="Clear schema"
                            >
                                Clear
                            </button>
                        </div>

                        <textarea
                            class="schema-textarea"
                            :class="{ 'has-error': schemaError }"
                            v-model="schemaText"
                            placeholder='{
  "type": "object",
  "properties": {
    "result": { "type": "string" }
  }
}'
                            @blur="updateSchema"
                            rows="8"
                        ></textarea>

                        <p v-if="schemaError" class="schema-error">
                            {{ schemaError }}
                        </p>

                        <p class="field-hint">
                            Define a
                            <a
                                href="https://json-schema.org/learn/getting-started-step-by-step"
                                target="_blank"
                                rel="noopener"
                                >JSON Schema</a
                            >
                            to validate the output structure. The output will be
                            validated before being returned.
                        </p>
                    </div>
                </div>

                <div class="info-box">
                    <p><strong>Output Node</strong></p>
                    <p style="margin-top: 8px; color: var(--text-secondary)">
                        This is a terminal node that formats the final workflow
                        output. It has no outgoing connections.
                    </p>
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
    padding: var(--or3-spacing-md, 16px);
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

/* Description Section */
.description-section {
    padding: 0 var(--or3-spacing-md, 16px) var(--or3-spacing-md, 16px);
    margin-bottom: var(--or3-spacing-sm, 8px);
}

.description-label {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-xs, 4px);
    font-size: 12px;
    font-weight: 500;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
    margin-bottom: var(--or3-spacing-xs, 4px);
}

.description-label svg {
    width: 14px;
    height: 14px;
    opacity: 0.6;
}

.description-hint {
    font-weight: 400;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    font-size: 11px;
}

.description-textarea {
    width: 100%;
    min-height: 60px;
    max-height: 100px;
    padding: var(--or3-spacing-sm, 8px);
    background: var(--or3-color-surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 13px;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    resize: vertical;
    font-family: inherit;
    line-height: 1.5;
}

.description-textarea::placeholder {
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.3));
}

.description-textarea:focus {
    outline: none;
    border-color: var(--or3-color-accent, #3b82f6);
    background: var(--or3-color-surface-hover, rgba(255, 255, 255, 0.05));
}

/* Tabs */
.tabs {
    display: flex;
    flex-wrap: wrap;
    gap: var(--or3-spacing-xs, 4px);
    padding: 0 var(--or3-spacing-md, 16px) var(--or3-spacing-md, 16px);
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
    padding: 0;
}

.tab-content > div {
    padding: 0 var(--or3-spacing-md, 16px) var(--or3-spacing-md, 16px);
}

.tab-content::-webkit-scrollbar {
    width: 6px;
}

.tab-content::-webkit-scrollbar-track {
    background: transparent;
}

.tab-content::-webkit-scrollbar-thumb {
    background: var(--or3-color-border, rgba(255, 255, 255, 0.15));
    border-radius: 3px;
}

.tab-content::-webkit-scrollbar-thumb:hover {
    background: var(--or3-color-text-muted, rgba(255, 255, 255, 0.25));
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--or3-spacing-sm, 8px);
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

/* Errors Tab */
.errors-tab {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
}

.mode-buttons {
    display: flex;
    gap: var(--or3-spacing-xs, 4px);
    flex-wrap: wrap;
}

.mode-button {
    padding: 6px 10px;
    border-radius: var(--or3-radius-sm, 6px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.mode-button.active {
    border-color: var(--or3-color-warning, #f59e0b);
    color: var(--or3-color-warning, #f59e0b);
    background: color-mix(
        in srgb,
        var(--or3-color-warning, #f59e0b) 12%,
        transparent
    );
}

.retry-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--or3-spacing-sm, 8px);
}

.field-group {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.text-input {
    width: 100%;
    padding: var(--or3-spacing-sm, 8px) var(--or3-spacing-md, 12px);
    background: var(--or3-color-bg-tertiary, #1a1a24);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 10px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
    font-size: 13px;
}

.text-input:focus {
    outline: none;
    border-color: var(--or3-color-warning, #f59e0b);
}

.checkbox-group .checkboxes {
    display: flex;
    flex-wrap: wrap;
    gap: var(--or3-spacing-xs, 4px);
}

.checkbox-item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: var(--or3-color-bg-tertiary, #1a1a24);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-sm, 6px);
    font-size: 12px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
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

/* HITL Tab */
.hitl-tab {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
}

.hitl-toggle {
    padding: var(--or3-spacing-md, 16px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    border-radius: var(--or3-radius-md, 10px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.toggle-label {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    cursor: pointer;
}

.toggle-label input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--or3-color-info, #3b82f6);
}

.toggle-text {
    font-weight: 600;
    font-size: 14px;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

.hitl-section {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.hitl-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: var(--or3-spacing-sm, 8px);
}

.hitl-prompt {
    min-height: 80px;
}

.hitl-badge {
    background: var(--or3-color-info, #3b82f6);
    color: white;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 5px;
    border-radius: 4px;
    margin-left: 4px;
}

.mode-button.hitl-mode.active {
    border-color: var(--or3-color-info, #3b82f6);
    color: var(--or3-color-info, #3b82f6);
    background: color-mix(
        in srgb,
        var(--or3-color-info, #3b82f6) 12%,
        transparent
    );
}

/* Subflow Tab */
.subflow-tab {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
}

.subflow-toggle {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.input-mappings-section {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.mappings-list {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.mapping-item {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    padding: 8px 10px;
    border-radius: var(--or3-radius-sm, 6px);
}

.mapping-key {
    font-family: monospace;
    font-size: 12px;
    color: var(--or3-color-secondary, #64748b);
    min-width: 80px;
}

.mapping-value {
    flex: 1;
}

.remove-mapping-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    border-radius: 50%;
    cursor: pointer;
    font-size: 16px;
}

.remove-mapping-btn:hover {
    background: var(--or3-color-error, #ef4444);
    color: white;
}

.expression-hints {
    margin: 8px 0 0;
    padding-left: 16px;
    font-size: 12px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
}

.expression-hints li {
    margin-bottom: 4px;
}

.expression-hints code {
    font-family: monospace;
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    padding: 1px 4px;
    border-radius: 3px;
}

.output-tab {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
}

.output-toggle {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

/* Schema Editor */
.schema-section {
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.1));
    border-radius: var(--or3-radius-md, 8px);
    overflow: hidden;
}

.schema-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    border: none;
    color: var(--or3-color-text, rgba(255, 255, 255, 0.95));
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
}

.schema-toggle:hover {
    background: var(--or3-color-bg-tertiary, rgba(255, 255, 255, 0.08));
}

.toggle-chevron {
    width: 16px;
    height: 16px;
    transition: transform 0.2s ease;
}

.toggle-chevron.expanded {
    transform: rotate(90deg);
}

.schema-badge {
    margin-left: auto;
    background: var(--or3-color-success, #22c55e);
    color: white;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 4px;
}

.schema-editor {
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.1));
}

.schema-toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
}

.toolbar-label {
    font-size: 11px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    margin-right: 4px;
}

.toolbar-spacer {
    flex: 1;
}

.preset-btn {
    padding: 4px 8px;
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    color: var(--or3-color-text, rgba(255, 255, 255, 0.95));
    font-family: monospace;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
}

.preset-btn:hover {
    background: var(--or3-color-bg-tertiary, rgba(255, 255, 255, 0.1));
    border-color: var(--or3-color-accent, #8b5cf6);
}

.action-btn {
    padding: 4px 10px;
    background: transparent;
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    font-size: 11px;
    cursor: pointer;
    transition: all 0.15s;
}

.action-btn:hover {
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    color: var(--or3-color-text, rgba(255, 255, 255, 0.95));
}

.action-btn.danger:hover {
    background: color-mix(
        in srgb,
        var(--or3-color-error, #ef4444) 15%,
        transparent
    );
    border-color: var(--or3-color-error, #ef4444);
    color: var(--or3-color-error, #ef4444);
}

.schema-textarea {
    width: 100%;
    min-height: 120px;
    padding: 10px;
    background: var(--or3-color-bg-primary, rgba(0, 0, 0, 0.3));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.1));
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text, rgba(255, 255, 255, 0.95));
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    line-height: 1.5;
    resize: vertical;
    transition: border-color 0.15s;
}

.schema-textarea:focus {
    outline: none;
    border-color: var(--or3-color-accent, #8b5cf6);
}

.schema-textarea.has-error {
    border-color: var(--or3-color-error, #ef4444);
}

.schema-textarea::placeholder {
    color: var(--or3-color-text-tertiary, rgba(255, 255, 255, 0.5));
}

.schema-error {
    margin: 0;
    padding: 8px 10px;
    background: color-mix(
        in srgb,
        var(--or3-color-error, #ef4444) 12%,
        transparent
    );
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-error, #ef4444);
    font-size: 12px;
}

.schema-editor .field-hint a {
    color: var(--or3-color-accent, #8b5cf6);
    text-decoration: none;
}

.schema-editor .field-hint a:hover {
    text-decoration: underline;
}

/* Routes Tab */
.routes-tab {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
}

.routes-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.add-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    background: var(--or3-color-primary, #6366f1);
    color: white;
    border: none;
    border-radius: var(--or3-radius-sm, 6px);
    cursor: pointer;
    transition: background 0.15s;
}

.add-btn:hover {
    background: var(--or3-color-primary-hover, #4f46e5);
}

.add-btn svg {
    width: 14px;
    height: 14px;
}

.routes-list {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.route-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px;
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 8px);
}

.route-inputs {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.route-label {
    font-weight: 500;
}

.route-id {
    font-size: 10px;
    font-family: monospace;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

.delete-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
}

.delete-btn:hover {
    background: var(--or3-color-error-bg, rgba(239, 68, 68, 0.1));
    color: var(--or3-color-error, #ef4444);
}

.delete-btn svg {
    width: 16px;
    height: 16px;
}

/* Branches Tab (Parallel Node) */
.branches-tab {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-lg, 20px);
    padding-bottom: var(--or3-spacing-lg, 20px);
}

.branches-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--or3-spacing-md, 16px);
}

.branches-header .field-label {
    margin-bottom: 0;
}

.branches-list {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 12px);
}

.branch-item {
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-lg, 10px);
    overflow: hidden;
    transition: border-color 0.15s;
}

.branch-item.expanded {
    border-color: var(--or3-color-primary, #6366f1);
}

.branch-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--or3-spacing-md, 14px) var(--or3-spacing-md, 16px);
    cursor: pointer;
    transition: background 0.15s;
    gap: var(--or3-spacing-sm, 8px);
}

.branch-header:hover {
    background: var(--or3-color-bg-tertiary, rgba(255, 255, 255, 0.03));
}

.branch-inputs {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 12px);
    min-width: 0;
}

.branch-label {
    flex: 1;
    min-width: 0;
    font-weight: 500;
}

.branch-badges {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
}

.branch-badge {
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.branch-badge.model {
    background: var(--or3-color-info-bg, rgba(59, 130, 246, 0.15));
    color: var(--or3-color-info, #3b82f6);
}

.branch-badge.prompt {
    background: var(--or3-color-success-bg, rgba(34, 197, 94, 0.15));
    color: var(--or3-color-success, #22c55e);
}

.branch-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.expand-icon {
    width: 16px;
    height: 16px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    transition: transform 0.2s;
}

.expand-icon.rotated {
    transform: rotate(180deg);
}

.branch-config {
    padding: var(--or3-spacing-md, 16px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    background: var(--or3-color-bg-tertiary, rgba(255, 255, 255, 0.02));
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
}

.branch-field {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 6px);
}

.field-label-sm {
    font-size: 11px;
    font-weight: 500;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    text-transform: uppercase;
    letter-spacing: 0.03em;
}

.model-select-sm {
    width: 100%;
    padding: 10px 12px;
    background: var(--or3-color-bg-primary, #0a0a0f);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.92));
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.15s;
}

.model-select-sm:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.15));
}

.model-select-sm:focus {
    outline: none;
    border-color: var(--or3-color-primary, #6366f1);
}

.prompt-textarea-sm {
    width: 100%;
    padding: 12px;
    background: var(--or3-color-bg-primary, #0a0a0f);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-sm, 6px);
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.92));
    font-size: 13px;
    font-family: inherit;
    line-height: 1.5;
    resize: vertical;
    min-height: 80px;
    transition: border-color 0.15s;
}

.prompt-textarea-sm:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.15));
}

.prompt-textarea-sm:focus {
    outline: none;
    border-color: var(--or3-color-primary, #6366f1);
}

.prompt-textarea-sm::placeholder {
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
}

/* Merge Section */
.merge-section {
    margin-top: var(--or3-spacing-lg, 24px);
    padding-top: var(--or3-spacing-lg, 24px);
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.merge-section .field-label {
    margin-bottom: var(--or3-spacing-xs, 4px);
}

.merge-field {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 6px);
    margin-top: var(--or3-spacing-md, 12px);
}
</style>
