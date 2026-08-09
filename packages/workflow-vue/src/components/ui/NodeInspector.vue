<script setup lang="ts">
import { ref, computed, watch, watchEffect, nextTick } from 'vue';
import {
    WorkflowEditor,
    WorkflowNode,
    type NodeErrorConfig,
    type NodeRetryConfig,
    type ErrorCode,
    type HITLConfig,
    type HITLMode,
    modelRegistry,
    registerDefaultModels,
    migrateOutputNodeData,
    type OutputNodeData,
    type AgentNodeData,
    DEFAULT_WORKFLOW_MODEL,
    validateWorkflow,
} from 'or3-workflow-core';
import InspectorIcon from './InspectorIcon.vue';
import OutputModeSelector from './output/OutputModeSelector.vue';
import OutputSourcePicker from './output/OutputSourcePicker.vue';
import OutputPreview from './output/OutputPreview.vue';
import { useOutputPreview } from '../../composables/useOutputPreview';
import { useUpstreamResolver } from '../../composables/useUpstreamResolver';

type NodeModelRequestV1 = NonNullable<AgentNodeData['modelRequest']>;

// Type guard for configurable node data
interface ConfigurableNodeData {
    label: string;
    description?: string;
    prompt?: string;
    model?: string;
    tools?: string[];
    temperature?: number;
    maxTokens?: number;
    modelRequest?: NodeModelRequestV1;
    structuredOutput?: AgentNodeData['structuredOutput'];
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
    availableTools?: ToolOption[];
    availableSubflows?: SubflowOption[];
    subflowListLoading?: boolean;
    subflowListError?: string | null;
}>();

const emit = defineEmits<{
    (e: 'delete', nodeId: string): void;
    (e: 'close'): void;
}>();

const selectedNode = ref<WorkflowNode | null>(null);
type InspectorSectionId =
    | 'overview'
    | 'general'
    | 'prompt'
    | 'structured'
    | 'model'
    | 'tools'
    | 'errors'
    | 'hitl'
    | 'subflow'
    | 'output'
    | 'routes'
    | 'branches'
    | 'advanced';

interface InspectorSection {
    id: InspectorSectionId;
    icon:
        | 'general'
        | 'instructions'
        | 'structured'
        | 'model'
        | 'tools'
        | 'routes'
        | 'parallel'
        | 'failure'
        | 'human'
        | 'subflow'
        | 'output'
        | 'advanced';
    title: string;
    description: string;
    summary?: string;
    tone?: 'default' | 'accent' | 'warning';
}

const activeTab = ref<InspectorSectionId>('overview');
const inspectorBody = ref<HTMLElement | null>(null);
const overviewScrollTop = ref(0);

// Prefer host-provided tools; fall back to built-in demo list if none supplied
const availableTools = computed<ToolOption[]>(() => {
    return props.availableTools ?? defaultAvailableTools;
});

const availableSubflows = computed<SubflowOption[]>(() => {
    return props.availableSubflows ?? [];
});

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

interface ToolOption {
    id: string;
    name: string;
    description?: string;
}

interface SubflowOption {
    id: string;
    name: string;
    description?: string;
}

// Available tools (fallback when host doesn't provide a list)
const defaultAvailableTools: ToolOption[] = [
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
                activeTab.value = 'overview';
                overviewScrollTop.value = 0;
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
    if (props.editor.isDestroyed()) {
        selectedNode.value = null;
        selectedTools.value = [];
        return;
    }
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
    () => isAgentNode.value || isRouterNode.value
);
const hasHITL = computed(() => isAgentNode.value || isRouterNode.value);

const nodeData = computed<ConfigurableNodeData>(() => {
    const data = selectedNode.value?.data;
    return isConfigurableData(data) ? data : { label: 'Unknown' };
});

const modelRequest = computed<NodeModelRequestV1 | undefined>(
    () => nodeData.value.modelRequest
);
const primaryModel = computed(
    () =>
        modelRequest.value?.models?.[0] ||
        nodeData.value.model ||
        DEFAULT_WORKFLOW_MODEL
);
const fallbackModels = computed(() =>
    (modelRequest.value?.models ?? []).slice(1)
);
const serverToolChoices = [
    {
        name: 'openrouter:web_search',
        label: 'Web search',
        description: 'Search the web for current sources and evidence.',
    },
    {
        name: 'openrouter:web_fetch',
        label: 'Web page reader',
        description: 'Open and read pages returned by web search.',
    },
    {
        name: 'openrouter:datetime',
        label: 'Date and time',
        description: 'Resolve the current date, time, and timezone context.',
    },
    {
        name: 'openrouter:image_generation',
        label: 'Image generation',
        description: 'Generate images through a compatible provider.',
    },
] as const;
type ServerToolName = (typeof serverToolChoices)[number]['name'];

const capabilityChoices = [
    {
        id: 'tools',
        label: 'Tool use',
        description: 'Function calls and provider-managed tools.',
    },
    {
        id: 'structured-output',
        label: 'Structured output',
        description: 'Strict responses that follow a JSON schema.',
    },
    {
        id: 'reasoning',
        label: 'Reasoning',
        description: 'Provider-supported reasoning controls.',
    },
    {
        id: 'vision',
        label: 'Images',
        description: 'Accept image attachments as model input.',
    },
    {
        id: 'file-input',
        label: 'Files',
        description: 'Accept supported file attachments as model input.',
    },
] as const;

const updateModernModelRequest = (
    patch: Partial<NodeModelRequestV1>
) => {
    if (!selectedNode.value) return;
    const current = modelRequest.value ?? {
        version: 1 as const,
        models: [primaryModel.value] as [string, ...string[]],
    };
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        modelRequest: { ...current, ...patch },
    });
};

const setFallbackModels = (fallbacks: string[]) => {
    updateModernModelRequest({
        models: [
            primaryModel.value,
            ...fallbacks.filter(
                (model, index, all) =>
                    model !== primaryModel.value &&
                    all.indexOf(model) === index
            ),
        ] as [string, ...string[]],
    });
};

const addFallbackModel = () => {
    const candidate = availableModels.value.find(
        (model) =>
            model.id !== primaryModel.value &&
            !fallbackModels.value.includes(model.id)
    );
    if (candidate) setFallbackModels([...fallbackModels.value, candidate.id]);
};

const updateFallbackModel = (index: number, event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    const fallbacks = [...fallbackModels.value];
    fallbacks[index] = value;
    setFallbackModels(fallbacks);
};

const removeFallbackModel = (index: number) => {
    setFallbackModels(fallbackModels.value.filter((_, item) => item !== index));
};

const toggleServerTool = (name: ServerToolName) => {
    const tools = [...(modelRequest.value?.serverTools ?? [])];
    const index = tools.findIndex((tool) => tool.name === name);
    if (index >= 0) tools.splice(index, 1);
    else tools.push({ name, transport: 'either' });
    updateModernModelRequest({ serverTools: tools });
};

const toggleRequiredCapability = (
    capability: (typeof capabilityChoices)[number]['id']
) => {
    const capabilities = [...(modelRequest.value?.requiredCapabilities ?? [])];
    const index = capabilities.indexOf(capability);
    if (index >= 0) capabilities.splice(index, 1);
    else capabilities.push(capability);
    updateModernModelRequest({
        requiredCapabilities: capabilities.length ? capabilities : undefined,
    });
};

const whileData = computed(() => {
    const data = selectedNode.value?.data as any;
    return data || {};
});

const advancedOutputExpanded = ref(false);

const outputData = computed<OutputNodeData>(() => {
    const data = selectedNode.value?.data;
    if (!data) return {} as OutputNodeData;
    return migrateOutputNodeData(data);
});

// Reactive node ID for upstream resolver
const selectedNodeId = computed(() => selectedNode.value?.id || '');

// Upstream resolver - now reactive to editor updates and node selection changes
const upstreamGroups = useUpstreamResolver(
    computed(() => props.editor),
    selectedNodeId
);

// Preview
const previewData = useOutputPreview(
    computed(() => props.editor),
    outputData,
    selectedNodeId
);

// Update handlers
const updateOutputMode = (mode: 'combine' | 'synthesis') => {
    if (!selectedNode.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, { mode });
};

const updateOutputSources = (sources: string[]) => {
    if (!selectedNode.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, { sources });
};

const updateIntroText = (e: Event) => {
    if (!selectedNode.value) return;
    const value = (e.target as HTMLTextAreaElement).value;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        introText: value,
    });
};

const updateOutroText = (e: Event) => {
    if (!selectedNode.value) return;
    const value = (e.target as HTMLTextAreaElement).value;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        outroText: value,
    });
};

const updateSynthesisPrompt = (e: Event) => {
    if (!selectedNode.value) return;
    const value = (e.target as HTMLTextAreaElement).value;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        synthesis: { ...outputData.value.synthesis, prompt: value },
    });
};

const updateSynthesisModel = (e: Event) => {
    if (!selectedNode.value) return;
    const value = (e.target as HTMLSelectElement).value;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        synthesis: { ...outputData.value.synthesis, model: value },
    });
};

const toggleRawTemplate = () => {
    if (!selectedNode.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        useRawTemplate: !outputData.value.useRawTemplate,
    });
};

const toggleIncludeMetadata = () => {
    if (!selectedNode.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        includeMetadata: !outputData.value.includeMetadata,
    });
};

const updateOutputTemplate = (e: Event) => {
    if (!selectedNode.value) return;
    const value = (e.target as HTMLTextAreaElement).value;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        template: value,
    });
};

// Normalize output format to markdown (text) and clear legacy schema
watch(
    () => ({
        fmt: outputData.value.format,
        nodeId: selectedNode.value?.id,
    }),
    ({ fmt, nodeId }) => {
        if (!nodeId) return;
        if (fmt && fmt !== 'markdown') {
            props.editor.commands.updateNodeData(nodeId, {
                format: 'markdown',
                schema: undefined,
            });
        }
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

const subflowOptions = computed(() => {
    const options = [...availableSubflows.value];
    const currentId = subflowData.value.subflowId;
    if (currentId && !options.some((option) => option.id === currentId)) {
        options.unshift({
            id: currentId,
            name: 'Custom ID',
            description: 'Not in your workflow list.',
        });
    }
    return options;
});

const selectedSubflow = computed(() => {
    const currentId = subflowData.value.subflowId;
    if (!currentId) return null;
    return (
        subflowOptions.value.find((option) => option.id === currentId) || null
    );
});

const showManualSubflowInput = ref(false);

watch(
    () => [subflowData.value.subflowId, availableSubflows.value.length],
    ([subflowId]) => {
        if (!subflowId) return;
        if (!availableSubflows.value.some((option) => option.id === subflowId)) {
            showManualSubflowInput.value = true;
        }
    },
    { immediate: true }
);

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
    tools?: string[];
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
    const nodeId = selectedNode.value.id;

    // First, delete any edges connected to this branch's output handle
    const edges = props.editor.getEdges();
    const edgesToDelete = edges.filter(
        (edge) => edge.source === nodeId && edge.sourceHandle === branchId
    );
    for (const edge of edgesToDelete) {
        props.editor.commands.deleteEdge(edge.id);
    }

    // Then update the branches array
    const branches = parallelData.value.branches.filter(
        (b: BranchConfig) => b.id !== branchId
    );
    props.editor.commands.updateNodeData(nodeId, { branches });
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

const updateBranchTools = (branchId: string, tools: string[]) => {
    if (!selectedNode.value) return;
    const branches = parallelData.value.branches.map((b: BranchConfig) =>
        b.id === branchId ? { ...b, tools } : b
    );
    props.editor.commands.updateNodeData(selectedNode.value.id, { branches });
};

const toggleBranchTool = (branchId: string, toolId: string) => {
    const branch = parallelData.value.branches.find(
        (b: BranchConfig) => b.id === branchId
    );
    if (!branch) return;

    const currentTools = branch.tools || [];
    const idx = currentTools.indexOf(toolId);
    let newTools: string[];

    if (idx === -1) {
        newTools = [...currentTools, toolId];
    } else {
        newTools = [...currentTools];
        newTools.splice(idx, 1);
    }

    updateBranchTools(branchId, newTools);
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
    const nodeId = selectedNode.value.id;

    // First, delete any edges connected to this route's output handle
    const edges = props.editor.getEdges();
    const edgesToDelete = edges.filter(
        (edge) => edge.source === nodeId && edge.sourceHandle === routeId
    );
    for (const edge of edgesToDelete) {
        props.editor.commands.deleteEdge(edge.id);
    }

    // Then update the routes array
    const routes = routerData.value.routes.filter((r: any) => r.id !== routeId);
    props.editor.commands.updateNodeData(nodeId, { routes });
};

const updateRouteLabel = (routeId: string, label: string) => {
    if (!selectedNode.value) return;
    const routes = routerData.value.routes.map((r: any) =>
        r.id === routeId ? { ...r, label } : r
    );
    props.editor.commands.updateNodeData(selectedNode.value.id, { routes });
};

const updateRouteDescription = (routeId: string, description: string) => {
    if (!selectedNode.value) return;
    const routes = routerData.value.routes.map((route: any) =>
        route.id === routeId
            ? { ...route, description: description || undefined }
            : route
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
        description: 'Pause before execution to approve or reject.',
    },
    {
        id: 'input',
        label: 'Input',
        description: 'Ask the reviewer to provide information.',
    },
    {
        id: 'review',
        label: 'Review',
        description: 'Let the reviewer inspect and edit the output.',
    },
];

const hitlDefaultActions = [
    { id: 'approve', label: 'Approve' },
    { id: 'reject', label: 'Reject' },
    { id: 'skip', label: 'Skip' },
];

const errorCodes: { id: ErrorCode; label: string }[] = [
    { id: 'RATE_LIMIT', label: 'Rate limit' },
    { id: 'TIMEOUT', label: 'Timeout' },
    { id: 'NETWORK', label: 'Network' },
    { id: 'LLM_ERROR', label: '5xx errors' },
    { id: 'VALIDATION', label: 'Validation errors' },
];

const toolSearch = ref('');
const enabledToolOptions = computed(() =>
    selectedTools.value.map(
        (id) =>
            availableTools.value.find((tool) => tool.id === id) ?? {
                id,
                name: id,
                description: '',
            }
    )
);
const filteredAvailableTools = computed(() => {
    const query = toolSearch.value.trim().toLowerCase();
    return availableTools.value.filter((tool) => {
        if (selectedTools.value.includes(tool.id)) return false;
        if (!query) return true;
        return `${tool.name} ${tool.description ?? ''} ${tool.id}`
            .toLowerCase()
            .includes(query);
    });
});

const selectedModelId = computed(() =>
    isWhileNode.value
        ? whileData.value.conditionModel || DEFAULT_WORKFLOW_MODEL
        : primaryModel.value
);
const currentModelInfo = computed(() =>
    availableModels.value.find((model) => model.id === selectedModelId.value)
);
const isStructuredAgent = computed(
    () => isAgentNode.value && Boolean(nodeData.value.structuredOutput)
);
const isResearchAgent = computed(
    () =>
        isAgentNode.value &&
        (modelRequest.value?.serverTools ?? []).some((tool) =>
            [
                'openrouter:web_search',
                'openrouter:web_fetch',
                'openrouter:datetime',
            ].includes(tool.name)
        )
);

type StructuredFieldType = 'text' | 'number' | 'boolean' | 'json';
interface StructuredField {
    name: string;
    type: StructuredFieldType;
    description: string;
    required: boolean;
}

const structuredOutput = computed(() => nodeData.value.structuredOutput);
const structuredFields = computed<StructuredField[]>(() => {
    const schema = structuredOutput.value?.schema;
    const properties =
        schema && typeof schema.properties === 'object' && schema.properties
            ? (schema.properties as Record<string, Record<string, unknown>>)
            : {};
    const required = Array.isArray(schema?.required)
        ? (schema.required as string[])
        : [];
    return Object.entries(properties).map(([name, field]) => {
        const type =
            field.type === 'string'
                ? 'text'
                : field.type === 'number' || field.type === 'integer'
                  ? 'number'
                  : field.type === 'boolean'
                    ? 'boolean'
                    : 'json';
        return {
            name,
            type,
            description:
                typeof field.description === 'string' ? field.description : '',
            required: required.includes(name),
        };
    });
});

const updateStructuredSchema = (
    properties: Record<string, Record<string, unknown>>,
    required: string[]
) => {
    if (!selectedNode.value || !structuredOutput.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        structuredOutput: {
            ...structuredOutput.value,
            schema: {
                ...structuredOutput.value.schema,
                type: 'object',
                properties,
                required,
                additionalProperties: false,
            },
        },
    });
};

const structuredSchemaParts = () => {
    const schema = structuredOutput.value?.schema;
    return {
        properties:
            schema && typeof schema.properties === 'object' && schema.properties
                ? {
                      ...(schema.properties as Record<
                          string,
                          Record<string, unknown>
                      >),
                  }
                : {},
        required: Array.isArray(schema?.required)
            ? [...(schema.required as string[])]
            : [],
    };
};

const addStructuredField = () => {
    const { properties, required } = structuredSchemaParts();
    let index = Object.keys(properties).length + 1;
    let name = `field_${index}`;
    while (name in properties) name = `field_${++index}`;
    properties[name] = {
        type: 'string',
        description: 'Describe what this value should contain.',
    };
    required.push(name);
    updateStructuredSchema(properties, required);
};

const renameStructuredField = (oldName: string, event: Event) => {
    const requested = (event.target as HTMLInputElement).value.trim();
    if (!requested || requested === oldName) return;
    const { properties, required } = structuredSchemaParts();
    let name = requested;
    let suffix = 2;
    while (name in properties && name !== oldName) {
        name = `${requested}_${suffix++}`;
    }
    properties[name] = properties[oldName] ?? { type: 'string' };
    delete properties[oldName];
    updateStructuredSchema(
        properties,
        required.map((item) => (item === oldName ? name : item))
    );
};

const updateStructuredFieldType = (name: string, event: Event) => {
    const type = (event.target as HTMLSelectElement).value as StructuredFieldType;
    const { properties, required } = structuredSchemaParts();
    const description = properties[name]?.description;
    properties[name] = {
        ...(type === 'text'
            ? { type: 'string' }
            : type === 'number'
              ? { type: 'number' }
              : type === 'boolean'
                ? { type: 'boolean' }
                : {}),
        ...(typeof description === 'string' ? { description } : {}),
    };
    updateStructuredSchema(properties, required);
};

const updateStructuredFieldDescription = (name: string, event: Event) => {
    const description = (event.target as HTMLInputElement).value;
    const { properties, required } = structuredSchemaParts();
    properties[name] = {
        ...(properties[name] ?? {}),
        ...(description ? { description } : {}),
    };
    if (!description) delete properties[name].description;
    updateStructuredSchema(properties, required);
};

const toggleStructuredFieldRequired = (name: string) => {
    const { properties, required } = structuredSchemaParts();
    updateStructuredSchema(
        properties,
        required.includes(name)
            ? required.filter((item) => item !== name)
            : [...required, name]
    );
};

const removeStructuredField = (name: string) => {
    const { properties, required } = structuredSchemaParts();
    delete properties[name];
    updateStructuredSchema(
        properties,
        required.filter((item) => item !== name)
    );
};

const nodeTypeLabel = computed(() => {
    switch (selectedNode.value?.type) {
        case 'agent':
            return isStructuredAgent.value
                ? 'Structured agent'
                : isResearchAgent.value
                  ? 'Research agent'
                  : 'AI agent';
        case 'router':
            return 'Router node';
        case 'parallel':
            return 'Parallel node';
        case 'whileLoop':
            return 'Loop node';
        case 'subflow':
            return 'Subflow node';
        case 'output':
            return 'Output node';
        case 'start':
            return 'Start trigger';
        default:
            return 'Workflow node';
    }
});
const nodeIconName = computed<
    'agent' | 'router' | 'parallel' | 'whileLoop' | 'subflow' | 'output' | 'start'
>(() => {
    const type = selectedNode.value?.type;
    return type === 'agent' ||
        type === 'router' ||
        type === 'parallel' ||
        type === 'whileLoop' ||
        type === 'subflow' ||
        type === 'output' ||
        type === 'start'
        ? type
        : 'start';
});
const nodePurpose = computed(() => {
    switch (selectedNode.value?.type) {
        case 'agent':
            return isStructuredAgent.value
                ? 'Returns validated fields that follow the response schema below.'
                : isResearchAgent.value
                  ? 'Researches current information with provider-managed web tools.'
                  : 'Uses a model to perform tasks, with optional tools and review.';
        case 'router':
            return 'Chooses the best route for incoming work.';
        case 'parallel':
            return 'Runs multiple branches at the same time, then optionally merges them.';
        case 'whileLoop':
            return 'Repeats work until a condition is met or a limit is reached.';
        case 'subflow':
            return 'Runs another workflow as part of this workflow.';
        case 'output':
            return 'Combines or synthesizes results into the final response.';
        case 'start':
            return 'Starts workflow execution and passes input to the first step.';
        default:
            return 'Configure this workflow step.';
    }
});
const nodeIssues = computed(() => {
    if (!selectedNode.value) return [];
    const result = validateWorkflow(
        [...props.editor.getNodes()],
        [...props.editor.getEdges()]
    );
    return [...result.errors, ...result.warnings].filter(
        (issue) => issue.nodeId === selectedNode.value?.id
    );
});
const retryEnabled = computed(() => retryConfig.value.maxRetries > 0);
const errorModeSummary = computed(() => {
    const mode = errorHandling.value.mode;
    const label =
        mode === 'continue'
            ? 'Continue'
            : mode === 'branch'
              ? 'Route to error output'
              : 'Stop workflow';
    return retryEnabled.value
        ? `${label} · ${retryConfig.value.maxRetries} retries`
        : label;
});
const overviewSections = computed<InspectorSection[]>(() => {
    const sections: InspectorSection[] = [];
    if (isConfigurable.value) {
        sections.push({
            id: 'general',
            icon: 'general',
            title: 'General',
            description: 'Name, description, and basic settings',
            summary: nodeData.value.label,
        });
    }
    if (isAgentNode.value || isRouterNode.value || isWhileNode.value) {
        const prompt = isWhileNode.value
            ? whileData.value.conditionPrompt || whileData.value.loopPrompt || ''
            : nodeData.value.prompt || '';
        sections.push({
            id: 'prompt',
            icon: 'instructions',
            title: isWhileNode.value ? 'Loop behavior' : 'Instructions',
            description: isWhileNode.value
                ? 'Strategy, stop condition, and loop context'
                : 'System prompt and node instructions',
            summary: prompt ? `${prompt.length.toLocaleString()} chars` : 'Not configured',
            tone: prompt ? 'default' : 'warning',
        });
        sections.push({
            id: 'model',
            icon: 'model',
            title: 'Model',
            description: 'Primary model and fallback settings',
            summary: currentModelInfo.value?.name ?? primaryModel.value.split('/').pop(),
            tone: 'accent',
        });
    }
    if (isStructuredAgent.value) {
        sections.splice(2, 0, {
            id: 'structured',
            icon: 'structured',
            title: 'Response fields',
            description: 'Named values the agent must return',
            summary: `${structuredFields.value.length} field${structuredFields.value.length === 1 ? '' : 's'}`,
            tone: structuredFields.value.length ? 'accent' : 'warning',
        });
    }
    if (isAgentNode.value) {
        sections.push({
            id: 'tools',
            icon: 'tools',
            title: 'Tools',
            description: 'Tools available to this agent',
            summary: `${selectedTools.value.length} enabled`,
        });
    }
    if (isRouterNode.value) {
        sections.push({
            id: 'routes',
            icon: 'routes',
            title: 'Routes',
            description: 'Define output routes for this node',
            summary: `${routerData.value.routes.length} defined`,
        });
    }
    if (isParallelNode.value) {
        sections.push({
            id: 'branches',
            icon: 'parallel',
            title: 'Branches',
            description: 'Parallel paths and merge configuration',
            summary: `${parallelData.value.branches.length} branches`,
        });
    }
    if (hasErrorHandling.value) {
        sections.push({
            id: 'errors',
            icon: 'failure',
            title: 'Failure handling',
            description: 'What happens when this node fails',
            summary: errorModeSummary.value,
        });
    }
    if (hasHITL.value) {
        sections.push({
            id: 'hitl',
            icon: 'human',
            title: 'Human review',
            description: 'Pause for approval, input, or review',
            summary: hitlConfig.value.enabled ? hitlConfig.value.mode : 'Off',
        });
    }
    if (isSubflowNode.value) {
        sections.push({
            id: 'subflow',
            icon: 'subflow',
            title: 'Subflow',
            description: 'Workflow selection, session, and inputs',
            summary: selectedSubflow.value?.name || 'Not selected',
        });
    }
    if (isOutputNode.value) {
        sections.push({
            id: 'output',
            icon: 'output',
            title: 'Output',
            description: 'Sources, formatting, and synthesis',
            summary:
                outputData.value.mode === 'synthesis'
                    ? 'AI synthesis'
                    : 'Combine',
        });
    }
    if (isAgentNode.value || isRouterNode.value || isWhileNode.value) {
        sections.push({
            id: 'advanced',
            icon: 'advanced',
            title: 'Advanced',
            description: 'Backend, IDs, and provider settings',
            summary:
                modelRequest.value?.backend === 'openrouter-agent'
                    ? 'OpenRouter agent'
                    : 'Default backend',
        });
    }
    return sections;
});
const activeSection = computed(() =>
    overviewSections.value.find((section) => section.id === activeTab.value)
);

const openSection = (section: InspectorSectionId) => {
    if (inspectorBody.value) {
        overviewScrollTop.value = inspectorBody.value.scrollTop;
    }
    activeTab.value = section;
    void nextTick(() => inspectorBody.value?.scrollTo({ top: 0 }));
};

const showOverview = () => {
    activeTab.value = 'overview';
    void nextTick(() =>
        inspectorBody.value?.scrollTo({ top: overviewScrollTop.value })
    );
};

const toggleRetryEnabled = () => {
    updateRetryConfig({
        maxRetries: retryEnabled.value ? 0 : 3,
    });
};

// Write through immediately so controlled :value bindings stay in sync with
// keystrokes. Debouncing here left the DOM ahead of editor state; any editor
// `update` re-render then snapped inputs back to the stale value.
const updateNodeField = (field: string, value: unknown) => {
    if (!selectedNode.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        [field]: value,
    });
};

const updateLabel = (event: Event) => {
    updateNodeField('label', (event.target as HTMLInputElement).value);
};

const updateDescription = (event: Event) => {
    updateNodeField(
        'description',
        (event.target as HTMLTextAreaElement).value
    );
};

const updateModel = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    props.editor.commands.updateNodeData(selectedNode.value!.id, {
        ...(isWhileNode.value ? { conditionModel: value } : { model: value }),
        ...(!isWhileNode.value && modelRequest.value
            ? {
                  modelRequest: {
                      ...modelRequest.value,
                      models: [
                          value,
                          ...modelRequest.value.models.slice(1),
                      ],
                  },
              }
            : {}),
    });
};

const updatePrompt = (event: Event) => {
    const value = (event.target as HTMLTextAreaElement).value;
    const field = isWhileNode.value ? 'conditionPrompt' : 'prompt';
    updateNodeField(field, value);
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
    updateNodeField('maxIterations', Number.isFinite(value) ? value : 1);
};

const updateOnMaxBehavior = (event: Event) => {
    updateNodeField(
        'onMaxIterations',
        (event.target as HTMLSelectElement).value
    );
};

const updateCustomEvaluator = (event: Event) => {
    updateNodeField(
        'customEvaluator',
        (event.target as HTMLInputElement).value
    );
};

// Loop mode handlers
const updateLoopMode = (event: Event) => {
    updateNodeField('loopMode', (event.target as HTMLSelectElement).value);
};

const setLoopOutputMode = (mode: 'last' | 'accumulate') => {
    if (!selectedNode.value) return;
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        outputMode: mode,
    });
};

const toggleIncludePreviousOutputs = () => {
    if (!selectedNode.value) return;
    const current = whileData.value.includePreviousOutputs !== false; // default true
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        includePreviousOutputs: !current,
    });
};

const toggleIncludeIterationContext = () => {
    if (!selectedNode.value) return;
    const current = whileData.value.includeIterationContext !== false; // default true
    props.editor.commands.updateNodeData(selectedNode.value.id, {
        includeIterationContext: !current,
    });
};

const updateLoopPrompt = (event: Event) => {
    updateNodeField('loopPrompt', (event.target as HTMLTextAreaElement).value);
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
    updateHITL({ prompt: (event.target as HTMLTextAreaElement).value });
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
const setSubflowId = (value: string) => {
    updateNodeField('subflowId', value);
};

const updateSubflowIdInput = (event: Event) => {
    setSubflowId((event.target as HTMLInputElement).value);
};

const updateSubflowIdSelect = (event: Event) => {
    const value = (event.target as HTMLSelectElement).value;
    setSubflowId(value);
    if (value && availableSubflows.value.some((option) => option.id === value)) {
        showManualSubflowInput.value = false;
    }
};

const toggleManualSubflowInput = () => {
    showManualSubflowInput.value = !showManualSubflowInput.value;
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

const handleDelete = () => {
    if (!selectedNode.value || !canDelete.value) return;
    const nodeId = selectedNode.value.id;
    const nodeLabel = nodeData.value.label;
    if (confirm(`Delete "${nodeLabel}"?`)) {
        // Clear selection first to prevent accessing deleted node
        selectedNode.value = null;
        props.editor.commands.deleteNode(nodeId);
        emit('delete', nodeId);
    }
};
</script>

<template>
    <div class="node-inspector" v-if="selectedNode">
        <header class="inspector-header">
            <div class="inspector-header-title">
                <span class="header-icon" :class="selectedNode.type">
                    <InspectorIcon :name="nodeIconName" />
                </span>
                <span>Node inspector</span>
            </div>
            <div class="inspector-header-actions">
                <details v-if="canDelete" class="inspector-menu">
                    <summary class="header-action" aria-label="More node actions">
                        <InspectorIcon name="more" />
                    </summary>
                    <div class="inspector-menu-popover">
                        <button class="menu-danger" type="button" @click="handleDelete">
                            Delete node
                        </button>
                    </div>
                </details>
                <button
                    class="header-action"
                    type="button"
                    aria-label="Close inspector"
                    @click="emit('close')"
                >
                    <InspectorIcon name="close" />
                </button>
            </div>
        </header>

        <div
            ref="inspectorBody"
            class="inspector-body"
        >
            <section v-if="activeTab === 'overview'" class="inspector-overview">
                <div class="node-summary">
                    <span class="node-summary-icon" :class="selectedNode.type">
                        <InspectorIcon :name="nodeIconName" />
                    </span>
                    <div class="node-summary-copy">
                        <div class="node-summary-title-row">
                            <h2>{{ nodeData.label }}</h2>
                            <span class="node-type-badge">{{ nodeTypeLabel }}</span>
                        </div>
                        <p>{{ nodePurpose }}</p>
                        <span
                            class="node-status"
                            :class="{ 'has-issues': nodeIssues.length > 0 }"
                        >
                            <span class="status-mark" />
                            {{
                                nodeIssues.length
                                    ? `${nodeIssues.length} issue${nodeIssues.length === 1 ? '' : 's'}`
                                    : 'Ready'
                            }}
                        </span>
                    </div>
                </div>

                <div v-if="overviewSections.length" class="section-navigation">
                    <button
                        v-for="section in overviewSections"
                        :key="section.id"
                        class="section-navigation-row"
                        type="button"
                        @click="openSection(section.id)"
                    >
                        <span class="section-navigation-icon">
                            <InspectorIcon :name="section.icon" />
                        </span>
                        <span class="section-navigation-copy">
                            <strong>{{ section.title }}</strong>
                            <small>{{ section.description }}</small>
                        </span>
                        <span
                            v-if="section.summary"
                            class="section-navigation-summary"
                            :class="section.tone"
                        >
                            {{ section.summary }}
                        </span>
                        <InspectorIcon class="section-chevron" name="chevron" />
                    </button>
                </div>

                <div v-else class="overview-note">
                    {{ nodePurpose }} Connect it to another node to continue.
                </div>

                <div class="inspector-tip">
                    <span>?</span>
                    Choose a section to configure this node. Changes are applied immediately.
                </div>
            </section>

            <div v-else class="inspector-section-page">
                <div class="section-page-header">
                    <button class="back-button" type="button" @click="showOverview">
                        <InspectorIcon name="back" />
                        Back
                    </button>
                    <div v-if="activeSection" class="section-page-title">
                        <span class="section-page-icon">
                            <InspectorIcon :name="activeSection.icon" />
                        </span>
                        <div>
                            <h2>{{ activeSection.title }}</h2>
                            <p>{{ activeSection.description }}</p>
                        </div>
                    </div>
                </div>

                <div v-if="activeTab === 'general'" class="general-tab section-panel">
                    <div class="field-group">
                        <label class="field-label" for="node-inspector-name">Node name</label>
                        <input
                            id="node-inspector-name"
                            class="text-input"
                            :value="nodeData.label"
                            placeholder="Node name"
                            @input="updateLabel"
                        />
                    </div>
                    <div class="field-group">
                        <label class="field-label" for="node-inspector-description">Description</label>
                        <textarea
                            id="node-inspector-description"
                            class="description-textarea"
                            :value="nodeData.description || ''"
                            placeholder="Describe what this node does"
                            @input="updateDescription"
                        />
                        <p class="field-hint">
                            Used by the router when deciding where to send work.
                        </p>
                    </div>
                    <div v-if="isResearchAgent" class="preset-note">
                        <strong>Research Agent preset</strong>
                        <p>
                            Uses the same agent runtime as AI Agent, with web search,
                            page reading, date/time tools, and tool-capable provider
                            matching enabled by default.
                        </p>
                    </div>
                    <div v-else-if="isStructuredAgent" class="preset-note">
                        <strong>Structured Agent preset</strong>
                        <p>
                            Uses the agent runtime with strict structured-output
                            validation and provider matching enabled by default.
                        </p>
                    </div>
                </div>

                <div
                    v-if="activeTab === 'structured' && isStructuredAgent"
                    class="structured-tab section-panel"
                >
                    <div class="settings-section-heading structured-heading">
                        <div>
                            <h3>Response object</h3>
                            <p>
                                Define each value the model must return. Clear names and
                                descriptions make the response more reliable.
                            </p>
                        </div>
                        <button
                            type="button"
                            class="secondary-button"
                            @click="addStructuredField"
                        >
                            + Add field
                        </button>
                    </div>

                    <div v-if="structuredFields.length" class="structured-fields">
                        <article
                            v-for="field in structuredFields"
                            :key="field.name"
                            class="structured-field-card"
                        >
                            <div class="structured-field-topline">
                                <div class="field-group">
                                    <label class="field-label">Field name</label>
                                    <input
                                        class="text-input"
                                        type="text"
                                        :value="field.name"
                                        placeholder="field_name"
                                        @change="renameStructuredField(field.name, $event)"
                                    />
                                </div>
                                <div class="field-group">
                                    <label class="field-label">Value type</label>
                                    <select
                                        class="model-select"
                                        :value="field.type"
                                        @change="updateStructuredFieldType(field.name, $event)"
                                    >
                                        <option value="text">Text</option>
                                        <option value="number">Number</option>
                                        <option value="boolean">Yes / no</option>
                                        <option value="json">JSON</option>
                                    </select>
                                </div>
                            </div>
                            <div class="field-group">
                                <label class="field-label">Description</label>
                                <input
                                    class="text-input"
                                    type="text"
                                    :value="field.description"
                                    placeholder="Explain what the model should put here"
                                    @input="updateStructuredFieldDescription(field.name, $event)"
                                />
                            </div>
                            <div class="structured-field-footer">
                                <label class="compact-checkbox">
                                    <input
                                        type="checkbox"
                                        :checked="field.required"
                                        @change="toggleStructuredFieldRequired(field.name)"
                                    />
                                    Required
                                </label>
                                <button
                                    type="button"
                                    class="text-danger-button"
                                    @click="removeStructuredField(field.name)"
                                >
                                    Remove field
                                </button>
                            </div>
                        </article>
                    </div>
                    <div v-else class="empty-settings-card">
                        Add at least one field to define the response object.
                    </div>
                </div>
            <!-- Prompt Tab -->
            <div
                v-if="
                    activeTab === 'prompt' &&
                    isConfigurable &&
                    !isOutputNode &&
                    !isParallelNode
                "
                class="prompt-tab"
            >
                <template v-if="isWhileNode">
                    <!-- Loop Mode Selection -->
                    <div class="field-group">
                        <label class="field-label">Loop Strategy</label>
                        <div class="mode-buttons">
                            <button
                                class="mode-button"
                                :class="{
                                    active: whileData.loopMode !== 'fixed',
                                }"
                                @click="
                                    updateLoopMode({
                                        target: { value: 'while' },
                                    } as any)
                                "
                            >
                                Smart Loop (AI)
                            </button>
                            <button
                                class="mode-button"
                                :class="{
                                    active: whileData.loopMode === 'fixed',
                                }"
                                @click="
                                    updateLoopMode({
                                        target: { value: 'fixed' },
                                    } as any)
                                "
                            >
                                Fixed Count
                            </button>
                        </div>
                        <p class="field-hint">
                            {{
                                whileData.loopMode === 'fixed'
                                    ? 'Runs exactly N times. Good for batch processing.'
                                    : 'AI evaluates results to decide when to stop.'
                            }}
                        </p>
                    </div>

                    <!-- Condition Prompt (only for while mode) -->
                    <template v-if="whileData.loopMode !== 'fixed'">
                        <div class="field-group">
                            <label class="field-label">Stop Condition</label>
                            <textarea
                                :value="whileData.conditionPrompt || ''"
                                class="prompt-textarea condition-prompt"
                                placeholder='Example: "If the summary is concise and covers all points, respond DONE. Otherwise respond CONTINUE."'
                                @input="updatePrompt"
                                rows="4"
                            ></textarea>
                        </div>
                    </template>

                    <div class="grid loop-grid">
                        <div class="field-group">
                            <label class="field-label">{{
                                whileData.loopMode === 'fixed'
                                    ? 'Run Count'
                                    : 'Max Limit'
                            }}</label>
                            <input
                                type="number"
                                min="1"
                                class="text-input"
                                :value="whileData.maxIterations ?? 10"
                                @input="updateMaxIterations"
                            />
                        </div>
                        <div class="field-group">
                            <label class="field-label">On Limit Reached</label>
                            <select
                                class="model-select"
                                :value="whileData.onMaxIterations || 'warning'"
                                @change="updateOnMaxBehavior"
                            >
                                <option value="warning">
                                    Warn &amp; Continue
                                </option>
                                <option value="continue">
                                    Silent Continue
                                </option>
                                <option value="error">Stop with Error</option>
                            </select>
                        </div>
                    </div>

                    <!-- Loop Instructions -->
                    <div
                        class="field-group"
                        style="margin-top: var(--or3-spacing-md)"
                    >
                        <label class="field-label">Loop Instructions</label>
                        <textarea
                            :value="whileData.loopPrompt || ''"
                            class="prompt-textarea loop-prompt"
                            placeholder='Tell the AI what to do each time.

Example: "Improve this text, making it clearer and more engaging."'
                            @input="updateLoopPrompt"
                            rows="3"
                        ></textarea>
                        <p class="field-hint">
                            These instructions are added to the input at the
                            start of each run.
                        </p>
                    </div>

                    <!-- Output Configuration -->
                    <div
                        class="field-group"
                        style="margin-top: var(--or3-spacing-lg)"
                    >
                        <label class="field-label">Output Handling</label>
                        <div class="mode-buttons">
                            <button
                                class="mode-button"
                                :class="{
                                    active:
                                        (whileData.outputMode || 'last') ===
                                        'last',
                                }"
                                @click="setLoopOutputMode('last')"
                            >
                                Last Result Only
                            </button>
                            <button
                                class="mode-button"
                                :class="{
                                    active:
                                        whileData.outputMode === 'accumulate',
                                }"
                                @click="setLoopOutputMode('accumulate')"
                            >
                                Collect All
                            </button>
                        </div>
                    </div>

                    <div class="section-divider"></div>

                    <label class="field-label section-title"
                        >Context Visibility</label
                    >
                    <p class="section-subtitle">
                        Choose what information is available to nodes inside the
                        loop.
                    </p>

                    <div class="toggle-group">
                        <label
                            class="tool-item"
                            :class="{
                                enabled:
                                    whileData.includePreviousOutputs !== false,
                            }"
                        >
                            <input
                                type="checkbox"
                                :checked="
                                    whileData.includePreviousOutputs !== false
                                "
                                @change="toggleIncludePreviousOutputs"
                            />
                            <div class="tool-info">
                                <span class="tool-name"
                                    >Previous Iterations</span
                                >
                                <span class="tool-description"
                                    >Let the AI see results from earlier
                                    runs</span
                                >
                            </div>
                        </label>

                        <label
                            class="tool-item"
                            :class="{
                                enabled:
                                    whileData.includeIterationContext !== false,
                            }"
                        >
                            <input
                                type="checkbox"
                                :checked="
                                    whileData.includeIterationContext !== false
                                "
                                @change="toggleIncludeIterationContext"
                            />
                            <div class="tool-info">
                                <span class="tool-name">Loop Counter</span>
                                <span class="tool-description"
                                    >Show current iteration number (1/10)</span
                                >
                            </div>
                        </label>
                    </div>

                    <!-- Advanced (Custom Evaluator) -->
                    <template v-if="whileData.loopMode !== 'fixed'">
                        <div class="section-divider"></div>
                        <details class="advanced-section">
                            <summary class="advanced-toggle">
                                Advanced: Custom Evaluator
                            </summary>
                            <div class="advanced-content">
                                <div class="field-group">
                                    <label class="field-label"
                                        >Function Name</label
                                    >
                                    <input
                                        type="text"
                                        class="text-input"
                                        :value="whileData.customEvaluator || ''"
                                        placeholder="e.g. checkQualityScore"
                                        @input="updateCustomEvaluator"
                                    />
                                    <p class="field-hint">
                                        Bypass AI evaluation and use a
                                        registered function to decide when to
                                        stop.
                                    </p>
                                </div>
                            </div>
                        </details>
                    </template>
                </template>
                <template v-else>
                    <label class="field-label">
                        {{
                            isRouterNode
                                ? 'Routing Instructions'
                                : isParallelNode
                                ? 'Merge Instructions'
                                : 'Instructions'
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
            <div
                v-if="activeTab === 'model' && !isParallelNode"
                class="model-tab section-panel"
            >
                <div class="field-group">
                    <label class="field-label">
                        {{ isWhileNode ? 'Condition model' : 'Primary model' }}
                    </label>
                    <select
                        class="model-select"
                        :value="selectedModelId"
                        @change="updateModel"
                    >
                        <option
                            v-if="!currentModelInfo"
                            :value="selectedModelId"
                        >
                            Current › {{ selectedModelId.split('/').pop() }}
                        </option>
                        <option
                            v-for="m in availableModels"
                            :key="m.id"
                            :value="m.id"
                        >
                            {{ m.provider }} › {{ m.name }}
                        </option>
                    </select>
                    <p class="field-hint">
                        The model used for this node's primary request.
                    </p>
                </div>

                <template v-if="!isWhileNode">
                    <div class="settings-section">
                        <div class="settings-section-heading">
                            <div>
                                <h3>Fallback models</h3>
                                <p>Used in order when the primary model is unavailable.</p>
                            </div>
                        </div>

                        <div v-if="fallbackModels.length" class="fallback-model-list">
                            <div
                                v-for="(model, index) in fallbackModels"
                                :key="`${model}-${index}`"
                                class="fallback-model-row"
                            >
                                <span class="fallback-order">{{ index + 1 }}</span>
                                <select
                                    class="model-select"
                                    :value="model"
                                    @change="updateFallbackModel(index, $event)"
                                >
                                    <option
                                        v-if="!availableModels.some(
                                            (item) => item.id === model
                                        )"
                                        :value="model"
                                    >
                                        Current › {{ model.split('/').pop() }}
                                    </option>
                                    <option
                                        v-for="option in availableModels.filter(
                                            (item) => item.id !== primaryModel
                                        )"
                                        :key="option.id"
                                        :value="option.id"
                                    >
                                        {{ option.provider }} › {{ option.name }}
                                    </option>
                                </select>
                                <button
                                    type="button"
                                    class="row-remove-button"
                                    :aria-label="`Remove fallback model ${index + 1}`"
                                    @click="removeFallbackModel(index)"
                                >
                                    <InspectorIcon name="close" />
                                </button>
                            </div>
                        </div>
                        <p v-else class="empty-setting-copy">
                            No fallback models configured.
                        </p>
                        <button
                            type="button"
                            class="secondary-button"
                            :disabled="fallbackModels.length >= availableModels.length - 1"
                            @click="addFallbackModel"
                        >
                            + Add fallback model
                        </button>
                    </div>

                    <div class="settings-section">
                        <div class="settings-section-heading">
                            <div>
                                <h3>Run capabilities</h3>
                                <p>
                                    Tools and response fields add requirements automatically.
                                    Select any additional capabilities this run must support.
                                </p>
                            </div>
                        </div>
                        <div class="capability-grid">
                            <label
                                v-for="capability in capabilityChoices"
                                :key="capability.id"
                                class="capability-option"
                            >
                                <input
                                    type="checkbox"
                                    :checked="
                                        modelRequest?.requiredCapabilities?.includes(
                                            capability.id
                                        ) ?? false
                                    "
                                    @change="toggleRequiredCapability(capability.id)"
                                />
                                <span>
                                    <strong>{{ capability.label }}</strong>
                                    <small>{{ capability.description }}</small>
                                </span>
                            </label>
                        </div>
                    </div>

                    <div class="settings-section">
                        <div class="settings-section-heading">
                            <div>
                                <h3>Provider matching</h3>
                                <p>
                                    Controls how OpenRouter chooses a provider for the
                                    selected model.
                                </p>
                            </div>
                        </div>
                        <label class="setting-toggle-row">
                            <span>
                                <strong>Require parameter compatibility</strong>
                                <small>
                                    Only route this run to providers that support all
                                    requested capabilities and parameters.
                                </small>
                            </span>
                            <input
                                type="checkbox"
                                :checked="modelRequest?.routing?.requireParameters ?? false"
                                @change="
                                    updateModernModelRequest({
                                        routing: {
                                            ...(modelRequest?.routing ?? {}),
                                            requireParameters: (
                                                $event.target as HTMLInputElement
                                            ).checked,
                                        },
                                    })
                                "
                            />
                        </label>
                    </div>
                </template>
            </div>

            <div
                v-if="activeTab === 'advanced' && (isAgentNode || isRouterNode || isWhileNode)"
                class="advanced-tab section-panel"
            >
                <div class="field-group">
                    <label class="field-label">Model ID</label>
                    <div class="technical-value">
                        {{
                            isWhileNode
                                ? whileData.conditionModel || DEFAULT_WORKFLOW_MODEL
                                : primaryModel
                        }}
                    </div>
                    <p class="field-hint">Provider-specific identifier for this model.</p>
                </div>

                <template v-if="!isWhileNode">
                    <div class="field-group">
                        <label class="field-label">Execution backend</label>
                        <select
                            class="model-select"
                            :value="modelRequest?.backend ?? 'native'"
                            @change="
                                updateModernModelRequest({
                                    backend: (
                                        $event.target as HTMLSelectElement
                                    ).value,
                                    transport:
                                        (
                                            $event.target as HTMLSelectElement
                                        ).value === 'openrouter-agent'
                                            ? 'responses'
                                            : 'chat',
                                })
                            "
                        >
                            <option value="native">OR3 native (Chat)</option>
                            <option value="openrouter-agent">
                                @openrouter/agent (Responses)
                            </option>
                        </select>
                    </div>
                </template>
            </div>

            <!-- Routes Tab -->
            <div
                v-if="activeTab === 'routes' && isRouterNode"
                class="routes-tab section-panel"
            >
                <div class="routes-header">
                    <label class="field-label">Defined routes</label>
                    <button class="add-btn with-label" @click="addRoute">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        Add route
                    </button>
                </div>
                <p class="field-hint">
                    Give each route a short name and clear selection guidance. The
                    decision model uses both when choosing an output handle.
                </p>

                <div class="routes-list">
                    <div
                        v-for="route in routerData.routes"
                        :key="route.id"
                        class="route-item"
                    >
                        <span
                            class="route-color"
                            aria-hidden="true"
                        />
                        <div class="route-inputs">
                            <div class="field-group">
                                <label class="field-label">Route name</label>
                                <input
                                    type="text"
                                    class="text-input route-label"
                                    :value="route.label"
                                    @input="(e) => updateRouteLabel(route.id, (e.target as HTMLInputElement).value)"
                                    placeholder="For example: Yes"
                                />
                            </div>
                            <div class="field-group">
                                <label class="field-label">When to choose this route</label>
                                <textarea
                                    class="description-textarea route-description"
                                    :value="route.description || ''"
                                    rows="2"
                                    placeholder="Choose this when the text mentions God."
                                    @input="(e) => updateRouteDescription(route.id, (e.target as HTMLTextAreaElement).value)"
                                />
                            </div>
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
                            <div
                                v-if="availableTools.length > 0"
                                class="branch-field"
                            >
                                <label class="field-label-sm"
                                    >Tools (optional)</label
                                >
                                <div class="branch-tools">
                                    <label
                                        v-for="tool in availableTools"
                                        :key="tool.id"
                                        class="branch-tool-item"
                                        :class="{
                                            enabled: (
                                                branch.tools || []
                                            ).includes(tool.id),
                                        }"
                                    >
                                        <input
                                            type="checkbox"
                                            :checked="
                                                (branch.tools || []).includes(
                                                    tool.id
                                                )
                                            "
                                            @change="
                                                toggleBranchTool(
                                                    branch.id,
                                                    tool.id
                                                )
                                            "
                                        />
                                        <span class="tool-name-sm">{{
                                            tool.name
                                        }}</span>
                                    </label>
                                </div>
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
                                    DEFAULT_WORKFLOW_MODEL
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
                                @input="(e) => updateNodeField('prompt', (e.target as HTMLTextAreaElement).value)"
                                placeholder="Instructions for merging branch outputs..."
                                rows="4"
                            ></textarea>
                        </div>
                    </template>
                </div>
            </div>

            <!-- Tools Tab -->
            <div
                v-if="activeTab === 'tools' && isAgentNode"
                class="tools-tab section-panel"
            >
                <template v-if="availableTools.length > 0">
                    <div class="field-group">
                        <label class="field-label" for="node-inspector-tool-search">
                            Find tools
                        </label>
                        <input
                            id="node-inspector-tool-search"
                            v-model="toolSearch"
                            class="text-input search-input"
                            type="search"
                            placeholder="Search available tools"
                        />
                    </div>

                    <div class="settings-section">
                        <div class="settings-section-heading">
                            <div>
                                <h3>Enabled tools</h3>
                                <p>{{ selectedTools.length }} available to this agent.</p>
                            </div>
                        </div>
                        <div v-if="enabledToolOptions.length" class="settings-list">
                            <div
                                v-for="tool in enabledToolOptions"
                                :key="tool.id"
                                class="setting-list-row"
                            >
                                <span class="tool-glyph">✓</span>
                                <span class="setting-list-copy">
                                    <strong>{{ tool.name }}</strong>
                                    <small>{{ tool.description || tool.id }}</small>
                                </span>
                                <button
                                    class="row-remove-button"
                                    type="button"
                                    :aria-label="`Disable ${tool.name}`"
                                    @click="toggleTool(tool.id)"
                                >
                                    <InspectorIcon name="close" />
                                </button>
                            </div>
                        </div>
                        <p v-else class="empty-setting-copy">No tools enabled yet.</p>
                    </div>

                    <div class="settings-section">
                        <div class="settings-section-heading">
                            <div>
                                <h3>Available tools</h3>
                                <p>Add tools the agent may use while it runs.</p>
                            </div>
                        </div>
                        <div v-if="filteredAvailableTools.length" class="settings-list">
                            <button
                                v-for="tool in filteredAvailableTools"
                                :key="tool.id"
                                class="setting-list-row available-tool-row"
                                type="button"
                                @click="toggleTool(tool.id)"
                            >
                                <span class="tool-glyph">+</span>
                                <span class="setting-list-copy">
                                    <strong>{{ tool.name }}</strong>
                                    <small>{{ tool.description || tool.id }}</small>
                                </span>
                                <span class="add-label">Add</span>
                            </button>
                        </div>
                        <p v-else class="empty-setting-copy">
                            No matching tools available.
                        </p>
                    </div>
                </template>
                <div v-else class="tools-empty">
                    <label class="field-label">Available tools</label>
                    <p class="field-hint">
                        No tools are registered. Add tools in or3-chat to enable
                        selections here.
                    </p>
                </div>

                <div class="settings-section provider-tools-section">
                    <div class="settings-section-heading">
                        <div>
                            <h3>OpenRouter server tools</h3>
                            <p>
                                Provider-managed capabilities. Research Agent starts with
                                search, page reading, and date/time enabled.
                            </p>
                        </div>
                    </div>
                    <div class="provider-tool-grid">
                        <label
                            v-for="tool in serverToolChoices"
                            :key="tool.name"
                            class="provider-tool-option"
                            :class="{
                                enabled:
                                    modelRequest?.serverTools?.some(
                                        (selected) => selected.name === tool.name
                                    ) ?? false,
                            }"
                        >
                            <input
                                type="checkbox"
                                :checked="
                                    modelRequest?.serverTools?.some(
                                        (selected) => selected.name === tool.name
                                    ) ?? false
                                "
                                @change="toggleServerTool(tool.name)"
                            />
                            <span>
                                <strong>{{ tool.label }}</strong>
                                <small>{{ tool.description }}</small>
                            </span>
                        </label>
                    </div>
                </div>
            </div>

            <!-- Error Handling Tab -->
            <div
                v-if="activeTab === 'errors' && hasErrorHandling"
                class="errors-tab section-panel"
            >
                <div class="field-group">
                    <label class="field-label">Failure behavior</label>
                    <p class="field-hint">Choose what happens when this node fails.</p>
                </div>
                <div class="choice-card-list">
                    <button
                        class="choice-card"
                        :class="{ active: errorHandling.mode === 'stop' }"
                        @click="updateErrorMode('stop')"
                    >
                        <span class="choice-indicator" />
                        <span>
                            <strong>Stop workflow</strong>
                            <small>End execution and mark the run as failed.</small>
                        </span>
                    </button>
                    <button
                        class="choice-card"
                        :class="{ active: errorHandling.mode === 'continue' }"
                        @click="updateErrorMode('continue')"
                    >
                        <span class="choice-indicator" />
                        <span>
                            <strong>Continue</strong>
                            <small>Continue using an empty or error result.</small>
                        </span>
                    </button>
                    <button
                        class="choice-card"
                        :class="{ active: errorHandling.mode === 'branch' }"
                        @click="updateErrorMode('branch')"
                    >
                        <span class="choice-indicator" />
                        <span>
                            <strong>Route to error output</strong>
                            <small>Send the failure through a dedicated error connection.</small>
                        </span>
                    </button>
                </div>

                <div class="settings-section retry-settings">
                    <label class="setting-toggle-row">
                        <span>
                            <strong>Retry before failing</strong>
                            <small>Retry the node before applying the failure behavior.</small>
                        </span>
                        <input
                            type="checkbox"
                            :checked="retryEnabled"
                            @change="toggleRetryEnabled"
                        />
                    </label>

                    <template v-if="retryEnabled">
                        <div class="retry-grid">
                            <div class="field-group">
                                <label class="field-label">Max retries</label>
                                <input
                                    type="number"
                                    min="1"
                                    class="text-input"
                                    :value="retryConfig.maxRetries"
                                    @input="onRetryNumberChange('maxRetries', $event)"
                                />
                            </div>
                            <div class="field-group">
                                <label class="field-label">Initial delay (ms)</label>
                                <input
                                    type="number"
                                    min="0"
                                    class="text-input"
                                    :value="retryConfig.baseDelay"
                                    @input="onRetryNumberChange('baseDelay', $event)"
                                />
                            </div>
                            <div class="field-group">
                                <label class="field-label">Maximum delay (ms)</label>
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
                            <label class="field-label">Retry on</label>
                            <div class="checkboxes">
                                <label
                                    v-for="code in errorCodes"
                                    :key="code.id"
                                    class="checkbox-item"
                                >
                                    <input
                                        type="checkbox"
                                        :checked="(retryConfig.retryOn || []).includes(code.id)"
                                        @change="toggleRetryOn(code.id)"
                                    />
                                    <span>{{ code.label }}</span>
                                </label>
                            </div>
                        </div>
                    </template>
                </div>
            </div>

            <!-- HITL Tab -->
            <div
                v-if="activeTab === 'hitl' && hasHITL"
                class="hitl-tab section-panel"
            >
                <div class="settings-section hitl-toggle">
                    <label class="setting-toggle-row">
                        <span>
                            <strong>Enable human review</strong>
                            <small>Pause this node and wait for a person before continuing.</small>
                        </span>
                        <input
                            type="checkbox"
                            :checked="hitlConfig.enabled"
                            @change="toggleHITLEnabled"
                        />
                    </label>
                </div>

                <template v-if="hitlConfig.enabled">
                    <div class="hitl-section">
                        <label class="field-label">Review mode</label>
                        <p class="field-hint">Choose how the reviewer should interact.</p>
                        <div class="choice-card-list">
                            <button
                                v-for="mode in hitlModes"
                                :key="mode.id"
                                class="choice-card"
                                :class="{ active: hitlConfig.mode === mode.id }"
                                @click="updateHITLMode(mode.id)"
                            >
                                <span class="choice-indicator" />
                                <span>
                                    <strong>{{ mode.label }}</strong>
                                    <small>{{ mode.description }}</small>
                                </span>
                            </button>
                        </div>
                    </div>

                    <div class="hitl-section">
                        <label class="field-label">Review prompt</label>
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
                            <label class="field-label">Default action</label>
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
                    <label class="field-label">Subflow</label>
                    <select
                        class="model-select"
                        :value="subflowData.subflowId"
                        :disabled="subflowListLoading"
                        @change="updateSubflowIdSelect"
                    >
                        <option value="">
                            {{
                                subflowListLoading
                                    ? 'Loading workflows...'
                                    : 'Select a workflow...'
                            }}
                        </option>
                        <option
                            v-for="option in subflowOptions"
                            :key="option.id"
                            :value="option.id"
                        >
                            {{ option.name }} ({{ option.id }})
                        </option>
                    </select>
                    <p v-if="subflowListLoading" class="field-hint">
                        Loading available workflows...
                    </p>
                    <p v-else-if="subflowListError" class="field-hint">
                        Unable to load workflows. You can still enter a subflow
                        ID manually.
                    </p>
                    <p
                        v-else-if="availableSubflows.length === 0"
                        class="field-hint"
                    >
                        No workflows found yet. Create one in the Workflows tab
                        or enter an ID manually.
                    </p>
                    <p v-else class="field-hint">
                        {{
                            selectedSubflow?.description ||
                            'Choose a workflow to run inside this node.'
                        }}
                    </p>
                    <div v-if="subflowData.subflowId" class="model-id">
                        <span class="model-id-label">Workflow ID:</span>
                        <code>{{ subflowData.subflowId }}</code>
                    </div>
                    <button
                        class="subflow-manual-toggle"
                        type="button"
                        @click="toggleManualSubflowInput"
                    >
                        {{
                            showManualSubflowInput
                                ? 'Hide manual entry'
                                : 'Enter ID manually'
                        }}
                    </button>
                </div>

                <div v-if="showManualSubflowInput" class="field-group">
                    <label class="field-label">Subflow ID</label>
                    <input
                        type="text"
                        class="text-input"
                        :value="subflowData.subflowId"
                        placeholder="e.g., email-composer"
                        @input="updateSubflowIdInput"
                    />
                    <p class="field-hint">
                        Use this only if the workflow isn't listed.
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
                class="output-tab section-panel"
            >
                <!-- Mode Selection -->
                <OutputModeSelector
                    :modelValue="outputData.mode || 'combine'"
                    @update:modelValue="updateOutputMode"
                />

                <!-- Source Selection -->
                <OutputSourcePicker
                    :modelValue="outputData.sources || []"
                    :availableGroups="upstreamGroups"
                    @update:modelValue="updateOutputSources"
                />

                <!-- Synthesis Configuration -->
                <div
                    v-if="outputData.mode === 'synthesis'"
                    class="synthesis-config"
                >
                    <div class="field-group">
                        <label class="field-label">Synthesis Model</label>
                        <select
                            class="model-select"
                            :value="
                                outputData.synthesis?.model ||
                                DEFAULT_WORKFLOW_MODEL
                            "
                            @change="updateSynthesisModel"
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

                    <div class="field-group">
                        <label class="field-label">Synthesis Prompt</label>
                        <textarea
                            class="prompt-textarea"
                            :value="outputData.synthesis?.prompt || ''"
                            placeholder="Instructions for synthesizing the final output..."
                            rows="4"
                            @input="updateSynthesisPrompt"
                        ></textarea>
                    </div>
                </div>

                <!-- Optional formatting -->
                <details class="settings-disclosure">
                    <summary>Optional formatting</summary>
                    <div class="disclosure-content">
                        <div class="field-group">
                            <label class="field-label">Text before output</label>
                            <textarea
                                class="text-input"
                                :value="outputData.introText || ''"
                                placeholder="Optional text to prepend..."
                                rows="2"
                                @input="updateIntroText"
                            ></textarea>
                        </div>

                        <div class="field-group">
                            <label class="field-label">Text after output</label>
                            <textarea
                                class="text-input"
                                :value="outputData.outroText || ''"
                                placeholder="Optional text to append..."
                                rows="2"
                                @input="updateOutroText"
                            ></textarea>
                        </div>
                    </div>
                </details>

                <!-- Preview -->
                <OutputPreview :previewData="previewData" />

                <!-- Advanced Settings -->
                <div class="advanced-settings">
                    <button
                        class="advanced-toggle"
                        @click="
                            advancedOutputExpanded = !advancedOutputExpanded
                        "
                    >
                        <svg
                            class="expand-icon"
                            :class="{ rotated: advancedOutputExpanded }"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        >
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                        Advanced Settings
                    </button>

                    <div v-if="advancedOutputExpanded" class="advanced-content">
                        <div class="toggle-group">
                            <label class="tool-item">
                                <input
                                    type="checkbox"
                                    :checked="outputData.useRawTemplate"
                                    @change="toggleRawTemplate"
                                />
                                <div class="tool-info">
                                    <span class="tool-name"
                                        >Use Raw Template</span
                                    >
                                    <span class="tool-description"
                                        >Override all settings with a custom
                                        template</span
                                    >
                                </div>
                            </label>

                            <label class="tool-item">
                                <input
                                    type="checkbox"
                                    :checked="outputData.includeMetadata"
                                    @change="toggleIncludeMetadata"
                                />
                                <div class="tool-info">
                                    <span class="tool-name"
                                        >Include Metadata</span
                                    >
                                    <span class="tool-description"
                                        >Add execution stats to output</span
                                    >
                                </div>
                            </label>
                        </div>

                        <div
                            v-if="outputData.useRawTemplate"
                            class="field-group"
                        >
                            <label class="field-label">Raw Template</label>
                            <textarea
                                class="textarea-input"
                                :value="outputData.template"
                                :placeholder="'e.g., Final result: {{outputs.nodeId}}'"
                                @input="updateOutputTemplate"
                                rows="4"
                            ></textarea>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
    </div>

    <!-- Empty state -->
    <div class="node-inspector empty" v-else>
        <div class="empty-icon">
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24"><!-- Icon from Tabler Icons by Paweł Kuna - https://github.com/tabler/tabler-icons/blob/master/LICENSE --><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m12 18l-2-4l-7-3.5a.55.55 0 0 1 0-1L21 3l-3.14 8.697M17.001 19a2 2 0 1 0 4 0a2 2 0 1 0-4 0m2-3.5V17m0 4v1.5m3.031-5.25l-1.299.75m-3.463 2l-1.3.75m0-3.5l1.3.75m3.463 2l1.3.75"/></svg>
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
    color: var(--or3-color-text-muted, #64748b);
    border-radius: var(--or3-radius-sm, 6px);
    transition: all 0.15s ease;
}

.tab svg {
    width: 14px;
    height: 14px;
}

.tab:hover {
    color: var(--or3-color-text-primary, #0f172a);
    background: var(--or3-color-surface-hover, rgba(15, 23, 42, 0.06));
}

.tab.active {
    color: var(--or3-color-text-primary, #0f172a);
    background: var(--or3-color-accent-muted, rgba(37, 99, 235, 0.14));
    box-shadow: inset 0 0 0 1px var(--or3-color-accent, #2563eb);
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

.branch-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 4px;
}

.branch-tool-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: var(--or3-color-bg-tertiary, #1a1a24);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;
}

.branch-tool-item:hover {
    border-color: var(--or3-color-border-hover, rgba(255, 255, 255, 0.15));
}

.branch-tool-item.enabled {
    border-color: var(--or3-color-accent, #8b5cf6);
    background: var(--or3-color-accent-muted, rgba(139, 92, 246, 0.1));
}

.branch-tool-item input {
    margin: 0;
}

.tool-name-sm {
    font-size: 11px;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
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

.subflow-manual-toggle {
    align-self: flex-start;
    margin-top: var(--or3-spacing-xs, 4px);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--or3-color-info, #3b82f6);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}

.subflow-manual-toggle:hover {
    text-decoration: underline;
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

.pill-display {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 12px;
    border-radius: var(--or3-radius-sm, 6px);
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.12));
    font-weight: 600;
    color: var(--or3-color-text, rgba(255, 255, 255, 0.95));
    width: fit-content;
}

.output-toggle {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.output-advanced {
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.1));
    border-radius: var(--or3-radius-md, 8px);
    overflow: hidden;
}

.output-advanced-body {
    padding: 12px;
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.1));
    background: var(--or3-color-bg-primary, rgba(0, 0, 0, 0.08));
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

.add-btn.with-label {
    width: auto;
    height: auto;
    padding: 6px 10px;
    gap: 6px;
    white-space: nowrap;
    font-size: 12px;
    line-height: 1;
}

.add-btn.with-label svg {
    width: 12px;
    height: 12px;
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
    padding: 10px 12px;
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
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    min-width: 0;
}

.branch-label {
    width: 100%;
    min-width: 0;
    font-weight: 500;
    background: transparent;
    border: 1px solid transparent;
    padding: 2px 6px;
    margin: 0 -6px;
    border-radius: 4px;
    transition: all 0.15s;
    font-size: 13px;
}

.branch-label:hover {
    background: var(--or3-color-bg-tertiary, rgba(255, 255, 255, 0.05));
}

.branch-label:focus {
    background: var(--or3-color-bg-primary, #0a0a0f);
    border-color: var(--or3-color-primary, #6366f1);
    outline: none;
}

.branch-badges {
    display: flex;
    flex-wrap: wrap;
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

/* Loop Settings */
.loop-intro {
    margin-bottom: var(--or3-spacing-md, 16px);
    padding: var(--or3-spacing-md, 14px);
    background: var(--or3-color-surface-glass, rgba(255, 255, 255, 0.03));
    border-radius: var(--or3-radius-md, 10px);
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
}

.intro-text {
    font-size: 13px;
    line-height: 1.5;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
    margin: 0;
}

.condition-prompt {
    min-height: 120px;
}

.loop-prompt {
    min-height: 80px;
}

.loop-grid {
    margin-top: var(--or3-spacing-md, 16px);
}

.section-divider {
    height: 1px;
    background: var(--or3-color-border, rgba(255, 255, 255, 0.08));
    margin: var(--or3-spacing-lg, 20px) 0 var(--or3-spacing-md, 16px);
}

.section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    margin-bottom: var(--or3-spacing-xs, 4px);
}

.section-subtitle {
    font-size: 12px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.4));
    margin: 0 0 var(--or3-spacing-md, 14px);
    line-height: 1.4;
}

.toggle-group {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-sm, 8px);
}

.toggle-row {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-xs, 4px);
}

.toggle-row .toggle-label {
    display: flex;
    align-items: center;
    gap: var(--or3-spacing-sm, 8px);
    cursor: pointer;
}

.toggle-row .toggle-label input[type='checkbox'] {
    width: 18px;
    height: 18px;
    accent-color: var(--or3-color-info, #3b82f6);
}

.toggle-row .toggle-label .toggle-text {
    font-weight: 600;
    font-size: 14px;
    color: var(--or3-color-text-primary, rgba(255, 255, 255, 0.95));
}

/* Advanced section */
.advanced-section {
    margin-top: var(--or3-spacing-sm, 8px);
}

.advanced-toggle {
    font-size: 12px;
    color: var(--or3-color-text-muted, rgba(255, 255, 255, 0.5));
    cursor: pointer;
    padding: var(--or3-spacing-xs, 6px) 0;
    user-select: none;
}

.advanced-toggle:hover {
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.7));
}

.advanced-content {
    margin-top: var(--or3-spacing-md, 12px);
}

/* Output Tab */
.output-tab {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-lg, 20px);
}

.synthesis-config {
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
    padding: var(--or3-spacing-md, 16px);
    background: var(--or3-color-bg-secondary, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    border-radius: var(--or3-radius-md, 8px);
}

.advanced-settings {
    border-top: 1px solid var(--or3-color-border, rgba(255, 255, 255, 0.08));
    padding-top: var(--or3-spacing-md, 16px);
}

.advanced-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: var(--or3-color-text-secondary, rgba(255, 255, 255, 0.65));
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    transition: color 0.15s;
}

.advanced-toggle:hover {
    color: var(--or3-color-text, rgba(255, 255, 255, 0.95));
}

.advanced-content {
    margin-top: var(--or3-spacing-md, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--or3-spacing-md, 16px);
}

/* Inspector overview and detail architecture */
.node-inspector {
    container-type: inline-size;
    min-width: 0;
    background: var(--or3-color-bg-primary, #ffffff);
    color: var(--or3-color-text-primary, #111827);
}

.inspector-header {
    position: relative;
    z-index: var(--or3-z-sticky, 20);
    justify-content: space-between;
    min-height: 56px;
    margin: 0;
    padding: 8px 12px;
    background: var(--or3-color-bg-primary, #ffffff);
    border-bottom: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
}

.inspector-header-title,
.inspector-header-actions {
    display: flex;
    align-items: center;
}

.inspector-header-title {
    gap: 9px;
    min-width: 0;
    font-size: 14px;
    font-weight: var(--or3-font-semibold, 600);
}

.inspector-header-title > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.inspector-header-actions {
    gap: 2px;
}

.header-icon,
.node-summary-icon,
.section-page-icon {
    background: var(--or3-color-accent-muted, rgba(37, 99, 235, 0.12));
    color: var(--or3-color-accent, #2563eb);
    border: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
}

.header-icon.start,
.node-summary-icon.start {
    background: var(--or3-color-success-muted, rgba(5, 150, 105, 0.12));
    color: var(--or3-color-success, #059669);
}

.header-icon.router,
.node-summary-icon.router {
    background: var(--or3-color-warning-muted, rgba(217, 119, 6, 0.12));
    color: var(--or3-color-text-primary, #111827);
}

.header-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    color: var(--or3-color-text-secondary, #4b5563);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--or3-radius-md, 8px);
    cursor: pointer;
}

.header-action:hover,
.header-action:focus-visible {
    color: var(--or3-color-text-primary, #111827);
    background: var(--or3-color-surface-hover, #f3f4f6);
    border-color: var(--or3-color-border, rgba(0, 0, 0, 0.1));
    outline: none;
}

.header-action svg {
    width: 18px;
    height: 18px;
}

.inspector-menu {
    position: relative;
}

.inspector-menu > summary {
    list-style: none;
}

.inspector-menu > summary::-webkit-details-marker {
    display: none;
}

.inspector-menu-popover {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    width: max-content;
    min-width: 132px;
    padding: 4px;
    background: var(--or3-color-bg-elevated, var(--or3-color-bg-primary, #ffffff));
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
    box-shadow: var(--or3-shadow-md, 0 8px 24px rgba(0, 0, 0, 0.12));
}

.menu-danger {
    width: 100%;
    padding: 8px 10px;
    color: var(--or3-color-error, #dc2626);
    text-align: left;
    background: transparent;
    border: 0;
    border-radius: var(--or3-radius-sm, 6px);
    cursor: pointer;
}

.menu-danger:hover {
    background: var(--or3-color-error-muted, rgba(220, 38, 38, 0.12));
}

.inspector-body {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-color: var(--or3-color-border, rgba(0, 0, 0, 0.1)) transparent;
}

.inspector-overview {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 14px;
}

.node-summary {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    padding: 4px 2px 8px;
}

.node-summary-icon,
.section-page-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--or3-radius-lg, 12px);
}

.node-summary-icon svg {
    width: 25px;
    height: 25px;
}

.node-summary-copy {
    min-width: 0;
}

.node-summary-title-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.node-summary h2,
.section-page-title h2 {
    margin: 0;
    color: var(--or3-color-text-primary, #111827);
    font-size: 16px;
    font-weight: var(--or3-font-semibold, 600);
    line-height: 1.25;
}

.node-summary p,
.section-page-title p {
    margin: 4px 0 0;
    color: var(--or3-color-text-secondary, #4b5563);
    font-size: 12px;
    line-height: 1.45;
}

.node-type-badge {
    max-width: 100%;
    padding: 3px 7px;
    overflow: hidden;
    color: var(--or3-color-text-secondary, #4b5563);
    font-size: 10px;
    font-weight: var(--or3-font-medium, 500);
    text-overflow: ellipsis;
    white-space: nowrap;
    background: var(--or3-color-surface-subtle, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
    border-radius: var(--or3-radius-sm, 6px);
}

.node-status {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    margin-top: 7px;
    color: var(--or3-color-success, #059669);
    font-size: 11px;
    font-weight: var(--or3-font-medium, 500);
}

.node-status.has-issues {
    color: var(--or3-color-text-primary, #111827);
}

.status-mark {
    width: 7px;
    height: 7px;
    background: currentColor;
    border-radius: var(--or3-radius-full, 999px);
}

.section-navigation {
    overflow: hidden;
    background: var(--or3-color-bg-primary, #ffffff);
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-lg, 12px);
}

.section-navigation-row {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) minmax(0, auto) 14px;
    gap: 10px;
    align-items: center;
    width: 100%;
    min-height: 62px;
    padding: 9px 11px;
    color: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
    cursor: pointer;
}

.section-navigation-row:last-child {
    border-bottom: 0;
}

.section-navigation-row:hover,
.section-navigation-row:focus-visible {
    background: var(--or3-color-surface-hover, #f3f4f6);
    outline: none;
}

.section-navigation-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    color: var(--or3-color-text-secondary, #4b5563);
    background: var(--or3-color-surface-subtle, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
    border-radius: var(--or3-radius-md, 8px);
}

.section-navigation-icon svg,
.section-page-icon svg {
    width: 18px;
    height: 18px;
}

.section-navigation-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
}

.section-navigation-copy strong {
    overflow: hidden;
    color: var(--or3-color-text-primary, #111827);
    font-size: 13px;
    font-weight: var(--or3-font-semibold, 600);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.section-navigation-copy small,
.section-navigation-summary {
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 11px;
    line-height: 1.3;
}

.section-navigation-summary {
    max-width: 116px;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.section-navigation-summary.accent {
    color: var(--or3-color-accent, #2563eb);
    font-weight: var(--or3-font-medium, 500);
}

.section-navigation-summary.warning {
    color: var(--or3-color-text-primary, #111827);
}

.section-chevron {
    width: 14px;
    height: 14px;
    color: var(--or3-color-text-muted, #6b7280);
}

.overview-note,
.inspector-tip {
    padding: 10px 11px;
    color: var(--or3-color-text-secondary, #4b5563);
    font-size: 12px;
    line-height: 1.4;
    background: var(--or3-color-surface-subtle, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
    border-radius: var(--or3-radius-md, 8px);
}

.inspector-tip {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--or3-color-accent, #2563eb);
    background: var(--or3-color-accent-subtle, rgba(37, 99, 235, 0.06));
}

.inspector-tip > span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: var(--or3-font-semibold, 600);
    border: 1px solid currentColor;
    border-radius: var(--or3-radius-full, 999px);
}

.inspector-section-page {
    min-width: 0;
}

.section-page-header {
    padding: 10px 14px 14px;
    border-bottom: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
    margin-bottom: 14px;
}

.back-button {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    min-height: 30px;
    margin: 0 0 9px;
    padding: 4px 7px;
    color: var(--or3-color-text-secondary, #4b5563);
    font-size: 12px;
    background: transparent;
    border: 0;
    border-radius: var(--or3-radius-sm, 6px);
    cursor: pointer;
}

.back-button:hover,
.back-button:focus-visible {
    color: var(--or3-color-text-primary, #111827);
    background: var(--or3-color-surface-hover, #f3f4f6);
    outline: none;
}

.back-button svg {
    width: 15px;
    height: 15px;
}

.section-page-title {
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
}

.section-page-icon {
    width: 38px;
    height: 38px;
    border-radius: var(--or3-radius-md, 8px);
}

.inspector-section-page > div:not(.section-page-header) {
    padding-right: 14px;
    padding-left: 14px;
    margin-bottom: 18px;
}

.general-tab > .field-group + .field-group,
.advanced-tab > .field-group + .field-group,
.prompt-tab > .field-group + .field-group,
.disclosure-content > .field-group + .field-group,
.structured-field-card > .field-group {
    margin-top: 14px;
}

.field-label {
    margin-bottom: 3px;
    color: var(--or3-color-text-primary, #111827);
    font-size: 12px;
    font-weight: var(--or3-font-medium, 500);
    text-transform: none;
    letter-spacing: 0;
}

.field-hint {
    margin: 4px 0 0;
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 11px;
}

.text-input,
.description-textarea,
.model-select,
.textarea-input,
.prompt-textarea {
    box-sizing: border-box;
    width: 100%;
    color: var(--or3-color-text-primary, #111827);
    background: var(--or3-color-bg-primary, #ffffff);
    border-color: var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
}

.text-input,
.model-select {
    min-height: 38px;
    padding: 8px 10px;
}

.description-textarea {
    min-height: 84px;
    padding: 9px 10px;
}

.prompt-textarea {
    min-height: 160px;
    padding: 10px;
}

.text-input:focus,
.description-textarea:focus,
.model-select:focus,
.textarea-input:focus,
.prompt-textarea:focus {
    background: var(--or3-color-bg-primary, #ffffff);
    border-color: var(--or3-color-accent, #2563eb);
    outline: 2px solid var(--or3-color-accent-subtle, rgba(37, 99, 235, 0.06));
    outline-offset: 1px;
}

.settings-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 16px;
    margin-top: 16px;
    border-top: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
}

.settings-section h3,
.settings-section-heading h3 {
    margin: 0;
    color: var(--or3-color-text-primary, #111827);
    font-size: 12px;
    font-weight: var(--or3-font-semibold, 600);
}

.settings-section-heading p {
    margin: 3px 0 0;
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 11px;
    line-height: 1.4;
}

.fallback-model-list,
.settings-list {
    overflow: hidden;
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
}

.fallback-model-row {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 32px;
    gap: 6px;
    align-items: center;
    min-height: 48px;
    padding: 5px 6px 5px 9px;
    border-bottom: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
}

.fallback-model-row:last-child,
.setting-list-row:last-child {
    border-bottom: 0;
}

.fallback-model-row .model-select {
    min-height: 34px;
    padding: 6px 8px;
    background: transparent;
    border-color: transparent;
}

.fallback-order {
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 11px;
    text-align: center;
}

.row-remove-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    padding: 0;
    color: var(--or3-color-text-muted, #6b7280);
    background: transparent;
    border: 0;
    border-radius: var(--or3-radius-sm, 6px);
    cursor: pointer;
}

.row-remove-button:hover {
    color: var(--or3-color-error, #dc2626);
    background: var(--or3-color-error-muted, rgba(220, 38, 38, 0.12));
}

.row-remove-button svg {
    width: 15px;
    height: 15px;
}

.secondary-button {
    align-self: flex-start;
    min-height: 34px;
    padding: 6px 10px;
    color: var(--or3-color-text-primary, #111827);
    font-size: 12px;
    font-weight: var(--or3-font-medium, 500);
    background: var(--or3-color-bg-primary, #ffffff);
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
    cursor: pointer;
}

.secondary-button:hover:not(:disabled) {
    background: var(--or3-color-surface-hover, #f3f4f6);
    border-color: var(--or3-color-border-hover, rgba(0, 0, 0, 0.18));
}

.secondary-button:disabled {
    opacity: 0.45;
    cursor: default;
}

.empty-setting-copy {
    margin: 0;
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 11px;
}

.setting-toggle-row {
    display: flex;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-height: 58px;
    padding: 10px 11px;
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
}

.setting-toggle-row > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
}

.setting-toggle-row strong {
    color: var(--or3-color-text-primary, #111827);
    font-size: 12px;
    font-weight: var(--or3-font-medium, 500);
}

.setting-toggle-row small {
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 10px;
    line-height: 1.35;
}

.setting-toggle-row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    accent-color: var(--or3-color-accent, #2563eb);
}

.capability-grid,
.provider-tool-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
}

.capability-option,
.provider-tool-option {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    min-height: 58px;
    padding: 9px;
    background: var(--or3-color-bg-primary, #ffffff);
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
    cursor: pointer;
}

.capability-option:has(input:checked),
.provider-tool-option.enabled {
    background: var(--or3-color-accent-subtle, rgba(37, 99, 235, 0.06));
    border-color: var(--or3-color-accent, #2563eb);
}

.capability-option input,
.provider-tool-option input,
.compact-checkbox input {
    width: 16px;
    height: 16px;
    margin: 1px 0 0;
    accent-color: var(--or3-color-accent, #2563eb);
}

.capability-option > span,
.provider-tool-option > span {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
}

.capability-option strong,
.provider-tool-option strong {
    color: var(--or3-color-text-primary, #111827);
    font-size: 11px;
    font-weight: var(--or3-font-medium, 500);
}

.capability-option small,
.provider-tool-option small {
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 10px;
    line-height: 1.35;
}

.provider-tools-section {
    margin-bottom: 0;
}

.structured-heading {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
}

.structured-heading .secondary-button {
    flex: 0 0 auto;
}

.structured-fields {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 12px;
}

.structured-field-card {
    padding: 11px;
    background: var(--or3-color-bg-primary, #ffffff);
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
}

.structured-field-topline {
    display: grid;
    grid-template-columns: minmax(0, 1.4fr) minmax(96px, 0.8fr);
    gap: 8px;
    align-items: end;
}

.structured-field-footer {
    display: flex;
    gap: 10px;
    align-items: center;
    justify-content: space-between;
    margin-top: 10px;
}

.compact-checkbox {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: var(--or3-color-text-secondary, #4b5563);
    font-size: 11px;
}

.text-danger-button {
    padding: 4px 6px;
    color: var(--or3-color-error, #dc2626);
    font-size: 10px;
    background: transparent;
    border: 0;
    border-radius: var(--or3-radius-sm, 6px);
    cursor: pointer;
}

.text-danger-button:hover {
    background: var(--or3-color-error-muted, rgba(220, 38, 38, 0.12));
}

.empty-settings-card {
    margin-top: 12px;
    padding: 14px;
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 11px;
    text-align: center;
    background: var(--or3-color-surface-subtle, rgba(0, 0, 0, 0.04));
    border: 1px dashed var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
}

.preset-note {
    margin-top: 14px;
    padding: 10px 11px;
    color: var(--or3-color-text-secondary, #4b5563);
    background: var(--or3-color-accent-subtle, rgba(37, 99, 235, 0.06));
    border: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
    border-radius: var(--or3-radius-md, 8px);
}

.preset-note strong {
    color: var(--or3-color-text-primary, #111827);
    font-size: 11px;
    font-weight: var(--or3-font-semibold, 600);
}

.preset-note p {
    margin: 3px 0 0;
    font-size: 10px;
    line-height: 1.45;
}

.technical-value {
    padding: 9px 10px;
    overflow-wrap: anywhere;
    color: var(--or3-color-text-secondary, #4b5563);
    font-family: var(--or3-font-mono, ui-monospace), monospace;
    font-size: 11px;
    line-height: 1.4;
    background: var(--or3-color-surface-subtle, rgba(0, 0, 0, 0.04));
    border: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
    border-radius: var(--or3-radius-md, 8px);
}

.search-input {
    padding-left: 10px;
}

.setting-list-row {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr) auto;
    gap: 9px;
    align-items: center;
    width: 100%;
    min-height: 52px;
    padding: 7px 8px;
    color: inherit;
    text-align: left;
    background: transparent;
    border: 0;
    border-bottom: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
}

.available-tool-row {
    cursor: pointer;
}

.available-tool-row:hover {
    background: var(--or3-color-surface-hover, #f3f4f6);
}

.tool-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    color: var(--or3-color-accent, #2563eb);
    font-size: 13px;
    font-weight: var(--or3-font-semibold, 600);
    background: var(--or3-color-accent-muted, rgba(37, 99, 235, 0.12));
    border-radius: var(--or3-radius-md, 8px);
}

.setting-list-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
}

.setting-list-copy strong,
.setting-list-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.setting-list-copy strong {
    color: var(--or3-color-text-primary, #111827);
    font-size: 12px;
    font-weight: var(--or3-font-medium, 500);
}

.setting-list-copy small {
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 10px;
}

.add-label {
    padding: 4px 6px;
    color: var(--or3-color-accent, #2563eb);
    font-size: 10px;
    font-weight: var(--or3-font-medium, 500);
}

.choice-card-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.choice-card {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr);
    gap: 9px;
    align-items: start;
    width: 100%;
    min-height: 56px;
    padding: 9px 10px;
    color: inherit;
    text-align: left;
    background: var(--or3-color-bg-primary, #ffffff);
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
    cursor: pointer;
}

.choice-card:hover {
    background: var(--or3-color-surface-hover, #f3f4f6);
}

.choice-card.active {
    background: var(--or3-color-accent-subtle, rgba(37, 99, 235, 0.06));
    border-color: var(--or3-color-accent, #2563eb);
}

.choice-card > span:last-child {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 3px;
}

.choice-card strong {
    color: var(--or3-color-text-primary, #111827);
    font-size: 12px;
    font-weight: var(--or3-font-medium, 500);
}

.choice-card small {
    color: var(--or3-color-text-muted, #6b7280);
    font-size: 10px;
    line-height: 1.35;
}

.choice-indicator {
    width: 12px;
    height: 12px;
    margin-top: 2px;
    border: 1px solid var(--or3-color-text-muted, #6b7280);
    border-radius: var(--or3-radius-full, 999px);
}

.choice-card.active .choice-indicator {
    background: var(--or3-color-accent, #2563eb);
    border: 3px solid var(--or3-color-bg-primary, #ffffff);
    outline: 1px solid var(--or3-color-accent, #2563eb);
}

.retry-settings {
    margin-top: 4px;
}

.retry-grid,
.hitl-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: end;
}

.loop-grid {
    align-items: end;
}

.checkbox-group .checkboxes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
}

.checkbox-item {
    min-width: 0;
    background: var(--or3-color-bg-primary, #ffffff);
    border-radius: var(--or3-radius-md, 8px);
}

.checkbox-item input {
    accent-color: var(--or3-color-accent, #2563eb);
}

.hitl-toggle {
    padding: 0;
    margin-top: 0;
    background: transparent;
    border: 0;
    border-radius: 0;
}

.route-color {
    width: 9px;
    height: 9px;
    flex: 0 0 auto;
    background: var(--or3-color-accent, #2563eb);
    border-radius: var(--or3-radius-full, 999px);
}

.route-item:nth-child(3n + 2) .route-color {
    background: var(--or3-color-success, #059669);
}

.route-item:nth-child(3n) .route-color {
    background: var(--or3-color-warning, #d97706);
}

.route-item {
    align-items: flex-start;
    background: var(--or3-color-bg-primary, #ffffff);
}

.route-item .route-color {
    margin-top: 30px;
}

.route-item > .delete-btn {
    margin-top: 24px;
}

.route-inputs .field-group + .field-group {
    margin-top: 10px;
}

.route-description {
    min-height: 66px;
    max-height: 120px;
}

.settings-disclosure {
    overflow: hidden;
    border: 1px solid var(--or3-color-border, rgba(0, 0, 0, 0.1));
    border-radius: var(--or3-radius-md, 8px);
}

.settings-disclosure > summary {
    padding: 10px 11px;
    color: var(--or3-color-text-primary, #111827);
    font-size: 12px;
    font-weight: var(--or3-font-medium, 500);
    cursor: pointer;
}

.settings-disclosure[open] > summary {
    background: var(--or3-color-surface-subtle, rgba(0, 0, 0, 0.04));
    border-bottom: 1px solid var(--or3-color-border-subtle, rgba(0, 0, 0, 0.05));
}

.disclosure-content {
    padding: 11px;
}

@container (max-width: 360px) {
    .inspector-overview {
        padding: 10px;
    }

    .node-summary {
        grid-template-columns: 42px minmax(0, 1fr);
        gap: 9px;
    }

    .node-summary-icon {
        width: 42px;
        height: 42px;
    }

    .section-navigation-row {
        grid-template-columns: 32px minmax(0, 1fr) 13px;
        gap: 8px;
        min-height: 56px;
        padding: 8px 9px;
    }

    .section-navigation-icon {
        width: 32px;
        height: 32px;
    }

    .section-navigation-copy small {
        display: none;
    }

    .section-navigation-summary {
        grid-column: 2;
        max-width: 100%;
        text-align: left;
    }

    .section-chevron {
        grid-column: 3;
        grid-row: 1 / span 2;
    }

    .retry-grid,
    .hitl-grid {
        grid-template-columns: 1fr;
    }

    .checkbox-group .checkboxes {
        grid-template-columns: 1fr;
    }

    .capability-grid,
    .provider-tool-grid,
    .structured-field-topline {
        grid-template-columns: 1fr;
    }

    .structured-heading {
        flex-direction: column;
    }

    .setting-toggle-row {
        align-items: flex-start;
    }
}
</style>
