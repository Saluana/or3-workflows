import {
    useWorkflowExecution as useCoreExecution,
} from '@or3/workflow-vue';
import {
    OpenRouterExecutionAdapter,
    type WorkflowNode,
    type WorkflowEdge,
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
        nodes: any[],
        edges: any[],
        input: string,
        _conversationHistory: Array<{ role: string; content: string }>,
        callbacks: ExecutionCallbacks
    ): Promise<string> {
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

        // Adapt nodes/edges to core types
        const workflowData = {
            meta: {
                version: '2.0.0',
                name: 'Execution',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            },
            nodes: nodes as WorkflowNode[],
            edges: edges as WorkflowEdge[],
        };

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
        
        const result = await coreExecute(adapter, workflowData, executionInput, coreCallbacks);
        
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
