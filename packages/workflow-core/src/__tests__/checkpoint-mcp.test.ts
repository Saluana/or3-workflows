import { describe, it, expect, vi } from 'vitest';
import {
    OpenRouterExecutionAdapter,
    InMemoryCheckpointAdapter,
    InMemoryHITLAdapter,
    checkpointToResumeFrom,
    mcpToolsToExecutable,
    McpToolAdapter,
    registerMcpTools,
    toolRegistry,
    type WorkflowData,
    type LLMProvider,
    type McpClientLike,
    type ExecutionCallbacks,
} from '../index';

function createMockProvider(): LLMProvider {
    return {
        chat: vi.fn().mockResolvedValue({ content: 'ok' }),
        getModelCapabilities: vi.fn().mockResolvedValue({
            id: 'test',
            name: 'test',
            inputModalities: ['text'],
            outputModalities: ['text'],
            contextLength: 8192,
            supportedParameters: [],
        }),
    };
}

function emptyCallbacks(): ExecutionCallbacks {
    return {
        onNodeStart: () => {},
        onNodeFinish: () => {},
        onNodeError: () => {},
        onToken: () => {},
    };
}

const hitlWorkflow: WorkflowData = {
    meta: { version: '2.0.0', name: 'HITL Durable' },
    nodes: [
        {
            id: 'start',
            type: 'start',
            position: { x: 0, y: 0 },
            data: { label: 'Start' },
        },
        {
            id: 'agent-1',
            type: 'agent',
            position: { x: 0, y: 100 },
            data: {
                label: 'Needs Approval',
                model: 'test-model',
                prompt: 'Do work',
                hitl: {
                    enabled: true,
                    mode: 'approval',
                    prompt: 'Approve?',
                },
            },
        },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'agent-1' }],
};

describe('durable HITL checkpointing', () => {
    it('pauses and returns checkpoint when durableHITL is enabled', async () => {
        const checkpoints = new InMemoryCheckpointAdapter();
        const hitl = new InMemoryHITLAdapter();
        const provider = createMockProvider();

        const adapter = new OpenRouterExecutionAdapter(provider, {
            durableHITL: true,
            checkpointAdapter: checkpoints,
            hitlAdapter: hitl,
            preflight: false,
        });

        const result = await adapter.execute(
            hitlWorkflow,
            { text: 'hello' },
            emptyCallbacks()
        );

        expect(result.paused).toBe(true);
        expect(result.success).toBe(false);
        expect(result.checkpointId).toBeTruthy();
        expect(result.hitlRequest?.nodeId).toBe('agent-1');
        expect(provider.chat).not.toHaveBeenCalled();

        const stored = await checkpoints.load(result.checkpointId!);
        expect(stored?.status).toBe('paused');
        expect(stored?.pendingHITLRequestId).toBe(result.hitlRequest?.id);

        const pending = await hitl.getPending();
        expect(pending).toHaveLength(1);
    });

    it('resumes from checkpoint with pendingHITLResponse', async () => {
        const checkpoints = new InMemoryCheckpointAdapter();
        const hitl = new InMemoryHITLAdapter();
        const provider = createMockProvider();

        const pauseAdapter = new OpenRouterExecutionAdapter(provider, {
            durableHITL: true,
            checkpointAdapter: checkpoints,
            hitlAdapter: hitl,
            preflight: false,
        });

        const paused = await pauseAdapter.execute(
            hitlWorkflow,
            { text: 'hello' },
            emptyCallbacks()
        );

        expect(paused.paused).toBe(true);
        const checkpoint = await checkpoints.load(paused.checkpointId!);
        expect(checkpoint).toBeTruthy();

        const response = {
            requestId: paused.hitlRequest!.id,
            action: 'approve' as const,
            respondedAt: new Date().toISOString(),
        };
        await hitl.respond(paused.hitlRequest!.id, response);

        const resumeAdapter = new OpenRouterExecutionAdapter(provider, {
            durableHITL: true,
            checkpointAdapter: checkpoints,
            hitlAdapter: hitl,
            preflight: false,
            resumeFrom: checkpointToResumeFrom(checkpoint!, response),
        });

        const resumed = await resumeAdapter.execute(
            hitlWorkflow,
            { text: 'hello' },
            emptyCallbacks()
        );

        expect(resumed.paused).toBeFalsy();
        expect(resumed.success).toBe(true);
        expect(provider.chat).toHaveBeenCalled();
        expect(resumed.nodeOutputs['agent-1']).toBe('ok');
    });
});

describe('MCP tool adapter', () => {
    const mockClient: McpClientLike = {
        listTools: async () => ({
            tools: [
                {
                    name: 'search',
                    description: 'Search things',
                    inputSchema: {
                        type: 'object',
                        properties: { q: { type: 'string' } },
                    },
                },
                {
                    name: 'hidden',
                    description: 'Excluded',
                },
            ],
        }),
        callTool: async (name, args) => ({
            content: [{ type: 'text', text: `${name}:${JSON.stringify(args)}` }],
        }),
    };

    it('converts MCP tools to executable definitions', async () => {
        const tools = await mcpToolsToExecutable(mockClient, {
            prefix: 'mcp_',
            exclude: ['hidden'],
        });

        expect(tools).toHaveLength(1);
        expect(tools[0]!.function.name).toBe('mcp_search');
        const out = await tools[0]!.handler!({ q: 'test' });
        expect(out).toBe('search:{"q":"test"}');
    });

    it('registers tools via McpToolAdapter', async () => {
        const adapter = new McpToolAdapter(mockClient, {
            prefix: 'mcp_',
            include: ['search'],
            registryNamespace: 'test-mcp',
        });
        const tools = await adapter.register(toolRegistry);
        expect(tools).toHaveLength(1);
        expect(toolRegistry.get('test-mcp:mcp_search')).toBeTruthy();
        toolRegistry.unregister('test-mcp:mcp_search');
    });

    it('registerMcpTools returns executable list', async () => {
        const tools = await registerMcpTools(mockClient, {
            include: ['search'],
            prefix: '',
            registryNamespace: 'reg-mcp',
        });
        expect(tools[0]!.function.name).toBe('search');
        toolRegistry.unregister('reg-mcp:search');
    });
});
