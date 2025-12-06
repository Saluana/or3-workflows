import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterExecutionAdapter } from '../execution';
import type {
    WorkflowData,
    ExecutionCallbacks,
    ExecutionInput,
} from '../types';

// Mock OpenRouter client
const createMockClient = () => ({
    chat: {
        send: vi.fn(),
    },
});

// Sample workflow for testing
const createTestWorkflow = (): WorkflowData => ({
    meta: {
        version: '2.0.0',
        name: 'Test Workflow',
    },
    nodes: [
        {
            id: 'start-1',
            type: 'start',
            position: { x: 0, y: 0 },
            data: { label: 'Start' },
        },
        {
            id: 'agent-1',
            type: 'agent',
            position: { x: 200, y: 0 },
            data: {
                label: 'Test Agent',
                model: 'openai/gpt-4o-mini',
                prompt: 'You are a helpful assistant.',
            },
        },
    ],
    edges: [
        {
            id: 'edge-1',
            source: 'start-1',
            target: 'agent-1',
        },
    ],
});

describe('OpenRouterExecutionAdapter', () => {
    let adapter: OpenRouterExecutionAdapter;
    let mockClient: ReturnType<typeof createMockClient>;
    let callbacks: ExecutionCallbacks;

    beforeEach(() => {
        mockClient = createMockClient();
        adapter = new OpenRouterExecutionAdapter(mockClient as any);

        callbacks = {
            onNodeStart: vi.fn(),
            onNodeFinish: vi.fn(),
            onNodeError: vi.fn(),
            onToken: vi.fn(),
            onRouteSelected: vi.fn(),
        };
    });

    describe('constructor', () => {
        it('should throw error if client is null', () => {
            expect(() => new OpenRouterExecutionAdapter(null as any)).toThrow(
                'OpenRouterExecutionAdapter requires an OpenRouter client or LLMProvider.'
            );
        });

        it('should throw error if client is undefined', () => {
            expect(
                () => new OpenRouterExecutionAdapter(undefined as any)
            ).toThrow(
                'OpenRouterExecutionAdapter requires an OpenRouter client or LLMProvider.'
            );
        });

        it('should accept valid client', () => {
            const client = createMockClient();
            expect(
                () => new OpenRouterExecutionAdapter(client as any)
            ).not.toThrow();
        });

        it('should use default options when none provided', () => {
            const client = createMockClient();
            const adapter = new OpenRouterExecutionAdapter(client as any);
            expect(adapter).toBeDefined();
        });

        it('should accept custom options', () => {
            const client = createMockClient();
            const adapter = new OpenRouterExecutionAdapter(client as any, {
                defaultModel: 'anthropic/claude-3-opus',
                maxRetries: 5,
                retryDelayMs: 2000,
            });
            expect(adapter).toBeDefined();
        });
    });

    describe('getModelCapabilities', () => {
        it('should return capabilities for vision models', async () => {
            const capabilities = await adapter.getModelCapabilities(
                'openai/gpt-4o'
            );
            expect(capabilities).toBeDefined();
            expect(capabilities?.inputModalities).toContain('image');
        });

        it('should return capabilities for Claude 3 models', async () => {
            const capabilities = await adapter.getModelCapabilities(
                'anthropic/claude-3-opus'
            );
            expect(capabilities).toBeDefined();
            expect(capabilities?.inputModalities).toContain('image');
            expect(capabilities?.contextLength).toBe(200000);
        });

        it('should return text-only for unknown models', async () => {
            const capabilities = await adapter.getModelCapabilities(
                'unknown/model'
            );
            expect(capabilities).toBeDefined();
            expect(capabilities?.inputModalities).toEqual(['text']);
        });

        it('should cache capabilities', async () => {
            const first = await adapter.getModelCapabilities('openai/gpt-4o');
            const second = await adapter.getModelCapabilities('openai/gpt-4o');
            expect(first).toBe(second); // Same reference
        });
    });

    describe('supportsModality', () => {
        it('should return true for text on any model', async () => {
            expect(
                await adapter.supportsModality('unknown/model', 'text')
            ).toBe(true);
        });

        it('should return true for image on vision models', async () => {
            expect(
                await adapter.supportsModality('openai/gpt-4o', 'image')
            ).toBe(true);
        });

        it('should return false for image on text-only models', async () => {
            expect(
                await adapter.supportsModality('openai/gpt-3.5-turbo', 'image')
            ).toBe(false);
        });
    });

    describe('execute', () => {
        it('should execute a simple workflow with start and agent nodes', async () => {
            const workflow = createTestWorkflow();
            const input: ExecutionInput = { text: 'Hello, world!' };

            // Mock streaming response
            mockClient.chat.send.mockResolvedValue(
                (async function* () {
                    yield { choices: [{ delta: { content: 'Hello' } }] };
                    yield { choices: [{ delta: { content: ' back!' } }] };
                })()
            );

            const result = await adapter.execute(workflow, input, callbacks);

            expect(result.success).toBe(true);
            expect(result.output).toBe('Hello back!');
            expect(callbacks.onNodeStart).toHaveBeenCalledWith(
                'start-1',
                expect.objectContaining({ id: 'start-1', label: 'Start' })
            );
            expect(callbacks.onNodeStart).toHaveBeenCalledWith(
                'agent-1',
                expect.objectContaining({ id: 'agent-1', label: 'Test Agent' })
            );
            expect(callbacks.onNodeFinish).toHaveBeenCalledWith(
                'start-1',
                'Hello, world!',
                expect.objectContaining({ id: 'start-1', label: 'Start' })
            );
            expect(callbacks.onNodeFinish).toHaveBeenCalledWith(
                'agent-1',
                'Hello back!',
                expect.objectContaining({ id: 'agent-1', label: 'Test Agent' })
            );
            expect(callbacks.onToken).toHaveBeenCalledWith('agent-1', 'Hello');
            expect(callbacks.onToken).toHaveBeenCalledWith('agent-1', ' back!');
        });

        it('should handle workflow without start node', async () => {
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'No Start' },
                nodes: [
                    {
                        id: 'agent-1',
                        type: 'agent',
                        position: { x: 0, y: 0 },
                        data: { label: 'Agent', model: 'test', prompt: '' },
                    },
                ],
                edges: [],
            };

            const result = await adapter.execute(
                workflow,
                { text: 'test' },
                callbacks
            );

            expect(result.success).toBe(false);
            // Preflight validation catches this now with code NO_START_NODE
            expect(result.error?.message).toContain('NO_START_NODE');
        });

        it('should handle API errors gracefully', async () => {
            const workflow = createTestWorkflow();

            mockClient.chat.send.mockRejectedValue(new Error('API Error'));

            const result = await adapter.execute(
                workflow,
                { text: 'test' },
                callbacks
            );

            expect(result.success).toBe(false);
            expect(result.error?.message).toContain('API Error');
            expect(callbacks.onNodeError).toHaveBeenCalled();
        });
    });

    describe('stop', () => {
        it('should stop execution', async () => {
            const workflow = createTestWorkflow();

            // Create a slow streaming response
            mockClient.chat.send.mockImplementation(async () => {
                return (async function* () {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                    yield { choices: [{ delta: { content: 'test' } }] };
                })();
            });

            // Start execution and stop after a small delay
            const executePromise = adapter.execute(
                workflow,
                { text: 'test' },
                callbacks
            );
            await new Promise((resolve) => setTimeout(resolve, 10)); // Let execution start
            adapter.stop();

            const result = await executePromise;
            expect(result.success).toBe(false);
            // The error could be 'cancelled' or a different error depending on timing
            expect(result.error).toBeDefined();
        });
    });

    describe('isRunning', () => {
        it('should return false when not executing', () => {
            expect(adapter.isRunning()).toBe(false);
        });
    });
});

describe('OpenRouterExecutionAdapter - Router Node', () => {
    let adapter: OpenRouterExecutionAdapter;
    let mockClient: ReturnType<typeof createMockClient>;
    let callbacks: ExecutionCallbacks;

    beforeEach(() => {
        mockClient = createMockClient();
        adapter = new OpenRouterExecutionAdapter(mockClient as any);

        callbacks = {
            onNodeStart: vi.fn(),
            onNodeFinish: vi.fn(),
            onNodeError: vi.fn(),
            onToken: vi.fn(),
            onRouteSelected: vi.fn(),
        };
    });

    it('should route to correct branch based on LLM classification', async () => {
        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Router Test' },
            nodes: [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'router-1',
                    type: 'router',
                    position: { x: 200, y: 0 },
                    data: {
                        label: 'Router',
                        routes: [
                            { id: 'route-a', label: 'Technical' },
                            { id: 'route-b', label: 'General' },
                        ],
                    },
                },
                {
                    id: 'agent-tech',
                    type: 'agent',
                    position: { x: 400, y: -100 },
                    data: { label: 'Tech Agent', model: 'test', prompt: '' },
                },
                {
                    id: 'agent-general',
                    type: 'agent',
                    position: { x: 400, y: 100 },
                    data: { label: 'General Agent', model: 'test', prompt: '' },
                },
            ],
            edges: [
                { id: 'e1', source: 'start-1', target: 'router-1' },
                {
                    id: 'e2',
                    source: 'router-1',
                    target: 'agent-tech',
                    sourceHandle: 'route-a',
                },
                {
                    id: 'e3',
                    source: 'router-1',
                    target: 'agent-general',
                    sourceHandle: 'route-b',
                },
            ],
        };

        // Mock router classification (selects option 1 = Technical)
        // Note: OpenRouterLLMProvider always uses streaming, so mock must return an async iterable
        mockClient.chat.send
            .mockResolvedValueOnce(
                (async function* () {
                    yield { choices: [{ delta: { content: '1' } }] };
                })()
            )
            .mockResolvedValueOnce(
                (async function* () {
                    yield {
                        choices: [{ delta: { content: 'Technical response' } }],
                    };
                })()
            );

        const result = await adapter.execute(
            workflow,
            { text: 'How do I code?' },
            callbacks
        );

        expect(result.success).toBe(true);
        expect(result.output).toBe('Technical response');
        expect(callbacks.onNodeStart).toHaveBeenCalledWith(
            'agent-tech',
            expect.objectContaining({ id: 'agent-tech', label: 'Tech Agent' })
        );
        expect(callbacks.onNodeStart).not.toHaveBeenCalledWith(
            'agent-general',
            expect.anything()
        );
    });
});

describe('OpenRouterExecutionAdapter - Memory Node', () => {
    let adapter: OpenRouterExecutionAdapter;
    let mockClient: ReturnType<typeof createMockClient>;
    let callbacks: ExecutionCallbacks;

    beforeEach(() => {
        mockClient = createMockClient();
        callbacks = {
            onNodeStart: vi.fn(),
            onNodeFinish: vi.fn(),
            onNodeError: vi.fn(),
            onToken: vi.fn(),
            onRouteSelected: vi.fn(),
        };
    });

    it('uses adapter to query memory', async () => {
        const memory = {
            store: vi.fn(),
            query: vi.fn(async () => [
                {
                    id: 'mem-1',
                    content: 'Remember this fact',
                    metadata: {
                        timestamp: new Date().toISOString(),
                        source: 'user' as const,
                    },
                },
            ]),
            delete: vi.fn(),
            clear: vi.fn(),
        };

        adapter = new OpenRouterExecutionAdapter(mockClient as any, { memory });

        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Memory Query' },
            nodes: [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'memory-1',
                    type: 'memory',
                    position: { x: 200, y: 0 },
                    data: { label: 'Memory', operation: 'query', limit: 3 },
                },
            ],
            edges: [{ id: 'e1', source: 'start-1', target: 'memory-1' }],
        };

        const result = await adapter.execute(
            workflow,
            { text: 'fact' },
            callbacks
        );

        expect(result.success).toBe(true);
        expect(memory.query).toHaveBeenCalled();
        expect(result.output).toContain('Remember this fact');
    });

    it('stores input via memory node', async () => {
        const memory = {
            store: vi.fn(async () => {}),
            query: vi.fn(),
            delete: vi.fn(),
            clear: vi.fn(),
        };

        adapter = new OpenRouterExecutionAdapter(mockClient as any, { memory });

        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Memory Store' },
            nodes: [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'memory-1',
                    type: 'memory',
                    position: { x: 200, y: 0 },
                    data: { label: 'Save', operation: 'store' },
                },
            ],
            edges: [{ id: 'e1', source: 'start-1', target: 'memory-1' }],
        };

        const result = await adapter.execute(
            workflow,
            { text: 'store this' },
            callbacks
        );
        expect(result.output).toBe('store this');
        expect(memory.store).toHaveBeenCalledWith(
            expect.objectContaining({
                content: 'store this',
                metadata: expect.objectContaining({
                    nodeId: 'memory-1',
                    sessionId: expect.any(String),
                }),
            })
        );
    });
});

describe('OpenRouterExecutionAdapter - Error Handling', () => {
    let adapter: OpenRouterExecutionAdapter;
    let mockClient: ReturnType<typeof createMockClient>;
    let callbacks: ExecutionCallbacks;

    beforeEach(() => {
        mockClient = createMockClient();
        callbacks = {
            onNodeStart: vi.fn(),
            onNodeFinish: vi.fn(),
            onNodeError: vi.fn(),
            onToken: vi.fn(),
            onRouteSelected: vi.fn(),
        };
    });

    it('branches to error handle when configured', async () => {
        adapter = new OpenRouterExecutionAdapter(mockClient as any, {
            onToolCall: async (toolId: string) => {
                if (toolId === 'fail') {
                    throw new Error('boom');
                }
                return 'recovered';
            },
        });

        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Error Branch' },
            nodes: [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'tool-1',
                    type: 'tool',
                    position: { x: 200, y: 0 },
                    data: {
                        label: 'Primary',
                        toolId: 'fail',
                        errorHandling: { mode: 'branch' },
                    },
                },
                {
                    id: 'tool-2',
                    type: 'tool',
                    position: { x: 400, y: 0 },
                    data: { label: 'Recovery', toolId: 'recover' },
                },
            ],
            edges: [
                { id: 'e1', source: 'start-1', target: 'tool-1' },
                {
                    id: 'e2',
                    source: 'tool-1',
                    target: 'tool-2',
                    sourceHandle: 'error',
                },
            ],
        };

        const result = await adapter.execute(
            workflow,
            { text: 'go' },
            callbacks
        );
        expect(result.success).toBe(true);
        expect(result.output).toBe('recovered');
        expect(callbacks.onNodeError).toHaveBeenCalledWith(
            'tool-1',
            expect.objectContaining({ message: 'boom' }),
            expect.objectContaining({ id: 'tool-1', label: 'Primary' })
        );
    });

    it('retries nodes according to config', async () => {
        let attempts = 0;
        adapter = new OpenRouterExecutionAdapter(mockClient as any, {
            onToolCall: async () => {
                attempts++;
                if (attempts === 1) {
                    throw new Error('temporary');
                }
                return 'ok';
            },
        });

        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Retry Test' },
            nodes: [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'tool-1',
                    type: 'tool',
                    position: { x: 200, y: 0 },
                    data: {
                        label: 'Flaky',
                        toolId: 'flaky',
                        errorHandling: {
                            mode: 'stop',
                            retry: { maxRetries: 1, baseDelay: 0 },
                        },
                    },
                },
            ],
            edges: [{ id: 'e1', source: 'start-1', target: 'tool-1' }],
        };

        const result = await adapter.execute(
            workflow,
            { text: 'retry' },
            callbacks
        );
        expect(result.success).toBe(true);
        expect(result.output).toBe('ok');
        expect(attempts).toBe(2);
        expect(callbacks.onNodeError).not.toHaveBeenCalled();
    });
});

describe('OpenRouterExecutionAdapter - While Loop', () => {
    let adapter: OpenRouterExecutionAdapter;
    let mockClient: ReturnType<typeof createMockClient>;
    let callbacks: ExecutionCallbacks;

    beforeEach(() => {
        mockClient = createMockClient();
        callbacks = {
            onNodeStart: vi.fn(),
            onNodeFinish: vi.fn(),
            onNodeError: vi.fn(),
            onToken: vi.fn(),
            onRouteSelected: vi.fn(),
        };
    });

    it('executes loop with custom evaluator and body subgraph', async () => {
        let bodyRuns = 0;
        adapter = new OpenRouterExecutionAdapter(mockClient as any, {
            onToolCall: async (toolId: string, args: any) => {
                if (toolId === 'body') {
                    bodyRuns++;
                    return `body-${bodyRuns}`;
                }
                if (toolId === 'done') {
                    return `done:${args.input}`;
                }
                return '';
            },
            customEvaluators: {
                loopEval: (_ctx, loopState) => loopState.iteration < 2,
            },
        });

        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'While Loop' },
            nodes: [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'loop-1',
                    type: 'whileLoop',
                    position: { x: 200, y: 0 },
                    data: {
                        label: 'Loop',
                        conditionPrompt: 'test',
                        maxIterations: 5,
                        onMaxIterations: 'warning',
                        customEvaluator: 'loopEval',
                    },
                },
                {
                    id: 'body-1',
                    type: 'tool',
                    position: { x: 400, y: 0 },
                    data: { label: 'Body', toolId: 'body' },
                },
                {
                    id: 'done-1',
                    type: 'tool',
                    position: { x: 600, y: 0 },
                    data: { label: 'Done', toolId: 'done' },
                },
            ],
            edges: [
                { id: 'e1', source: 'start-1', target: 'loop-1' },
                {
                    id: 'e2',
                    source: 'loop-1',
                    target: 'body-1',
                    sourceHandle: 'body',
                },
                {
                    id: 'e3',
                    source: 'loop-1',
                    target: 'done-1',
                    sourceHandle: 'done',
                },
            ],
        };

        const result = await adapter.execute(
            workflow,
            { text: 'go' },
            callbacks
        );

        expect(bodyRuns).toBe(2);
        expect(result.success).toBe(true);
        expect(result.output).toBe('done:body-2');
    });
});
