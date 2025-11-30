import {
    useWorkflowExecution as useCoreExecution,
} from '@or3/workflow-vue';
import {
    OpenRouterExecutionAdapter,
    toolRegistry,
    type WorkflowData,
    type ChatMessage as CoreChatMessage,
} from '@or3/workflow-core';

export interface ChatMessage extends CoreChatMessage {
    id: string;
    timestamp: Date;
    nodeId?: string;
}

// Legacy callbacks expected by App.vue
export interface ExecutionCallbacks {
    onNodeStatus: (
        nodeId: string,
        status: 'idle' | 'active' | 'completed' | 'error'
    ) => void;
    onStreamingContent: (content: string) => void;
    onAppendContent: (content: string) => void;
}

// Register a simple demo tool for the Tool node
let demoToolRegistered = false;
function registerDemoTool() {
    if (demoToolRegistered) return;
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
    demoToolRegistered = true;
}

export function useWorkflowExecution() {
    const {
        execute: coreExecute,
        stop,
        reset,
        isRunning,
        error,
    } = useCoreExecution();

    async function execute(
        apiKey: string,
        workflow: WorkflowData,
        input: string,
        _conversationHistory: Array<{ role: string; content: string }>,
        callbacks: ExecutionCallbacks
    ): Promise<string> {
        registerDemoTool();

        // Validate API key format
        if (!apiKey.startsWith('sk-or-')) {
            throw new Error(
                'Invalid API key format. Key should start with "sk-or-"'
            );
        }

        const { OpenRouter } = await import('@openrouter/sdk');
        const client = new OpenRouter({ apiKey });
        // Cast client to any to avoid version mismatch issues between demo and core dependencies
        const adapter = new OpenRouterExecutionAdapter(client as any);

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
        };
        
        const result = await coreExecute(adapter, workflow, executionInput, coreCallbacks);
        
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
    };
}
