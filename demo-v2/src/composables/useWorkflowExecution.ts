import { ref } from 'vue';
import { useWorkflowExecution as useCoreExecution } from '@or3/workflow-vue';
import {
    OpenRouterExecutionAdapter,
    toolRegistry,
    DefaultSubflowRegistry,
    type WorkflowData,
    type ChatMessage as CoreChatMessage,
    type HITLRequest,
    type HITLResponse,
    type CompactionResult,
    type SubflowRegistry,
    type TokenUsageDetails,
} from '@or3/workflow-core';

export interface BranchData {
    branchId: string;
    label: string;
    content: string;
    expanded: boolean;
}

export interface ChatMessage extends CoreChatMessage {
    id: string;
    timestamp: Date;
    nodeId?: string;
    branches?: BranchData[]; // Embedded branch data for parallel nodes
}

// Legacy callbacks expected by App.vue
export interface ExecutionCallbacks {
    onNodeStatus: (
        nodeId: string,
        status: 'idle' | 'active' | 'completed' | 'error'
    ) => void;
    onStreamingContent: (content: string) => void;
    onAppendContent: (content: string) => void;
    onHITLRequest?: (request: HITLRequest) => Promise<HITLResponse>;
    onRouteSelected?: (nodeId: string, routeId: string) => void;
    onContextCompacted?: (result: CompactionResult) => void;
    onLoopIteration?: (
        nodeId: string,
        iteration: number,
        maxIterations: number
    ) => void;
    onTokenUsage?: (nodeId: string, usage: TokenUsageDetails) => void;
    // Branch streaming callbacks for parallel nodes
    onBranchStart?: (
        nodeId: string,
        branchId: string,
        branchLabel: string
    ) => void;
    onBranchToken?: (
        nodeId: string,
        branchId: string,
        branchLabel: string,
        token: string
    ) => void;
    onBranchComplete?: (
        nodeId: string,
        branchId: string,
        branchLabel: string,
        output: string
    ) => void;
}

// Demo subflow registry
let demoSubflowRegistry: SubflowRegistry | null = null;

function getDemoSubflowRegistry(): SubflowRegistry {
    if (demoSubflowRegistry) return demoSubflowRegistry;

    demoSubflowRegistry = new DefaultSubflowRegistry();

    // Register sample subflows for demo purposes
    demoSubflowRegistry.register({
        id: 'summarizer',
        name: 'Text Summarizer',
        description: 'Summarizes input text into a concise version',
        inputs: [
            { id: 'text', name: 'Text', type: 'string', required: true },
            {
                id: 'maxLength',
                name: 'Max Length',
                type: 'number',
                required: false,
                default: 100,
            },
        ],
        outputs: [{ id: 'summary', name: 'Summary', type: 'string' }],
        workflow: {
            meta: { version: '2.0.0', name: 'Summarizer' },
            nodes: [
                {
                    id: 'start',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'summarize',
                    type: 'agent',
                    position: { x: 0, y: 100 },
                    data: {
                        label: 'Summarizer',
                        model: 'openai/gpt-4o-mini',
                        prompt: 'Summarize the following text concisely: {{text}}',
                    },
                },
            ],
            edges: [{ id: 'e1', source: 'start', target: 'summarize' }],
        },
    });

    demoSubflowRegistry.register({
        id: 'translator',
        name: 'Text Translator',
        description: 'Translates text to a target language',
        inputs: [
            { id: 'text', name: 'Text', type: 'string', required: true },
            {
                id: 'targetLanguage',
                name: 'Target Language',
                type: 'string',
                required: true,
                default: 'Spanish',
            },
        ],
        outputs: [{ id: 'translation', name: 'Translation', type: 'string' }],
        workflow: {
            meta: { version: '2.0.0', name: 'Translator' },
            nodes: [
                {
                    id: 'start',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'translate',
                    type: 'agent',
                    position: { x: 0, y: 100 },
                    data: {
                        label: 'Translator',
                        model: 'openai/gpt-4o-mini',
                        prompt: 'Translate the following text to {{targetLanguage}}: {{text}}',
                    },
                },
            ],
            edges: [{ id: 'e1', source: 'start', target: 'translate' }],
        },
    });

    return demoSubflowRegistry;
}

// Register demo tools for the Tool node
let demoToolsRegistered = false;
function registerDemoTools() {
    if (demoToolsRegistered) return;

    toolRegistry.register({
        id: 'demo_summarize',
        name: 'Summarize Text',
        description: 'Summarize the latest workflow output.',
        handler: async (input: string) => {
            const trimmed = input?.toString().trim() || '';
            if (!trimmed) return 'No content to summarize.';
            if (trimmed.length < 200) return `Summary: ${trimmed}`;
            return `Summary: ${trimmed.slice(0, 197)}...`;
        },
    });

    toolRegistry.register({
        id: 'word_count',
        name: 'Word Count',
        description: 'Count the words in the input text.',
        handler: async (input: string) => {
            const words =
                input?.toString().trim().split(/\s+/).filter(Boolean) || [];
            return `Word count: ${words.length}`;
        },
    });

    toolRegistry.register({
        id: 'uppercase',
        name: 'Uppercase',
        description: 'Convert text to uppercase.',
        handler: async (input: string) => {
            return input?.toString().toUpperCase() || '';
        },
    });

    demoToolsRegistered = true;
}

export function useWorkflowExecution() {
    const {
        execute: coreExecute,
        stop,
        reset,
        isRunning,
        error,
    } = useCoreExecution();

    // Track pending HITL request for UI
    const pendingHITLRequest = ref<HITLRequest | null>(null);

    async function execute(
        apiKey: string,
        workflow: WorkflowData,
        input: string,
        _conversationHistory: Array<{ role: string; content: string }>,
        callbacks: ExecutionCallbacks
    ): Promise<string> {
        registerDemoTools();

        // Validate API key format
        if (!apiKey.startsWith('sk-or-')) {
            throw new Error(
                'Invalid API key format. Key should start with "sk-or-"'
            );
        }

        const { OpenRouter } = await import('@openrouter/sdk');
        const client = new OpenRouter({ apiKey });

        // Create adapter with enhanced options
        const adapter = new OpenRouterExecutionAdapter(client as any, {
            subflowRegistry: getDemoSubflowRegistry(),
            maxSubflowDepth: 5,
            compaction: {
                threshold: 'auto',
                preserveRecent: 5,
                strategy: 'summarize',
            },
            // HITL callback - forward to App.vue if provided
            onHITLRequest: callbacks.onHITLRequest,
        });

        const executionInput = {
            text: input,
            attachments: [],
        };

        // Map legacy callbacks to core callbacks
        const coreCallbacks = {
            onNodeStart: (nodeId: string) => {
                callbacks.onNodeStatus(nodeId, 'active');
            },
            onNodeFinish: (nodeId: string, _output: string) => {
                callbacks.onNodeStatus(nodeId, 'completed');
            },
            onNodeError: (nodeId: string, _error: Error) => {
                callbacks.onNodeStatus(nodeId, 'error');
            },
            onToken: (_nodeId: string, token: string) => {
                callbacks.onAppendContent(token);
            },
            onRouteSelected: callbacks.onRouteSelected,
            onContextCompacted: callbacks.onContextCompacted,
            onTokenUsage: callbacks.onTokenUsage,
            onBranchStart: callbacks.onBranchStart,
            onBranchToken: callbacks.onBranchToken,
            onBranchComplete: callbacks.onBranchComplete,
        };

        const result = await coreExecute(
            adapter,
            workflow,
            executionInput,
            coreCallbacks
        );

        if (!result.success && result.error) {
            throw result.error;
        }

        return result.output;
    }

    return {
        isRunning,
        error,
        execute,
        stop,
        reset,
        pendingHITLRequest,
        subflowRegistry: getDemoSubflowRegistry(),
    };
}
