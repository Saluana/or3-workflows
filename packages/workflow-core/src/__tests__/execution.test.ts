import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterExecutionAdapter } from '../execution';
import { OpenRouterLLMProvider } from '../providers/OpenRouterLLMProvider';
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

describe('OpenRouterLLMProvider public SDK compatibility', () => {
    it('uses the v1 chatRequest shape and public AbortSignal options for file messages', async () => {
        const send = vi.fn(async () =>
            (async function* () {
                yield { choices: [{ delta: { content: 'read' } }] };
            })()
        );
        const client = new Proxy(
            { chat: { send } },
            {
                get(target, property, receiver) {
                    if (String(property).startsWith('_')) {
                        throw new Error(
                            `private SDK field read: ${String(property)}`
                        );
                    }
                    return Reflect.get(target, property, receiver);
                },
            }
        );
        const provider = new OpenRouterLLMProvider(client as any);
        const controller = new AbortController();

        await provider.chat(
            'vendor/model',
            [
                {
                    role: 'user',
                    content: [
                        {
                            type: 'file',
                            file: {
                                filename: 'note.txt',
                                fileData:
                                    'data:text/plain;base64,aGVsbG8=',
                            },
                        },
                    ],
                },
            ],
            { signal: controller.signal }
        );

        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                chatRequest: expect.objectContaining({
                    models: ['vendor/model'],
                    stream: true,
                    messages: expect.any(Array),
                }),
            }),
            { signal: controller.signal }
        );
    });
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
                'OpenRouterExecutionAdapter requires an OpenRouter client, LLMProvider, or ModelGateway.'
            );
        });

        it('should throw error if client is undefined', () => {
            expect(
                () => new OpenRouterExecutionAdapter(undefined as any)
            ).toThrow(
                'OpenRouterExecutionAdapter requires an OpenRouter client, LLMProvider, or ModelGateway.'
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

    describe('resume scheduling', () => {
        it('recovers missing siblings from an incomplete parallel checkpoint', async () => {
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'Three writer resume' },
                nodes: [
                    {
                        id: 'start',
                        type: 'start',
                        position: { x: 0, y: 0 },
                        data: { label: 'Start' },
                    },
                    {
                        id: 'outline',
                        type: 'agent',
                        position: { x: 0, y: 100 },
                        data: { label: 'Outline', model: 'test/model' },
                    },
                    ...['deepseek', 'glm', 'luna'].map((id, index) => ({
                        id,
                        type: 'agent' as const,
                        position: { x: index * 100, y: 200 },
                        data: { label: id, model: 'test/model' },
                    })),
                    {
                        id: 'judge',
                        type: 'agent',
                        position: { x: 100, y: 300 },
                        data: { label: 'Judge', model: 'test/model' },
                    },
                ],
                edges: [
                    { id: 'start-outline', source: 'start', target: 'outline' },
                    ...['deepseek', 'glm', 'luna'].map((id) => ({
                        id: `outline-${id}`,
                        source: 'outline',
                        target: id,
                    })),
                    ...['deepseek', 'glm', 'luna'].map((id) => ({
                        id: `${id}-judge`,
                        source: id,
                        target: 'judge',
                    })),
                ],
            };
            mockClient.chat.send.mockImplementation(() =>
                (async function* () {
                    yield { choices: [{ delta: { content: 'ok' } }] };
                })()
            );
            adapter = new OpenRouterExecutionAdapter(mockClient as any, {
                preflight: false,
                maxIterations: 4,
                resumeFrom: {
                    startNodeId: 'deepseek',
                    pendingNodes: ['deepseek'],
                    nodeOutputs: { outline: 'Story outline' },
                    executionOrder: ['outline'],
                    lastActiveNodeId: 'outline',
                    resumeInput: 'Story outline',
                },
            });

            const result = await adapter.execute(
                workflow,
                { text: 'Write the story' },
                callbacks
            );

            expect(result.success).toBe(true);
            expect(result.executionOrder).toEqual([
                'outline',
                'deepseek',
                'glm',
                'luna',
                'judge',
            ]);
            expect(mockClient.chat.send).toHaveBeenCalledTimes(4);
            expect(result.error).toBeUndefined();
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

        it('scopes each agent request to its inbound data with a stable prefix', async () => {
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'Scoped agents' },
                nodes: [
                    {
                        id: 'start',
                        type: 'start',
                        position: { x: 0, y: 0 },
                        data: { label: 'Start' },
                    },
                    {
                        id: 'first',
                        type: 'agent',
                        position: { x: 100, y: 0 },
                        data: {
                            label: 'First',
                            model: 'test/model',
                            prompt: 'Process the provided input.',
                            task: 'Run stage one.',
                        },
                    },
                    {
                        id: 'second',
                        type: 'agent',
                        position: { x: 200, y: 0 },
                        data: {
                            label: 'Second',
                            model: 'test/model',
                            prompt: 'Process the provided input.',
                            task: 'Run stage two.',
                        },
                    },
                ],
                edges: [
                    { id: 'start-first', source: 'start', target: 'first' },
                    { id: 'first-second', source: 'first', target: 'second' },
                ],
            };
            mockClient.chat.send
                .mockResolvedValueOnce(
                    (async function* () {
                        yield {
                            choices: [
                                { delta: { content: 'first output' } },
                            ],
                        };
                    })()
                )
                .mockResolvedValueOnce(
                    (async function* () {
                        yield {
                            choices: [
                                { delta: { content: 'second output' } },
                            ],
                        };
                    })()
                );

            const result = await adapter.execute(
                workflow,
                { text: 'original request' },
                callbacks
            );
            const requests = mockClient.chat.send.mock.calls.map(
                (call) => call[0].chatRequest
            ) as Array<{
                messages: Array<{ role: string; content: string }>;
                sessionId?: string;
                promptCacheKey?: string;
            }>;

            expect(requests).toHaveLength(2);
            expect(requests[0]!.messages).toEqual([
                { role: 'system', content: 'Process the provided input.' },
                {
                    role: 'user',
                    content: 'original request\n\nTask:\nRun stage one.',
                },
            ]);
            expect(requests[1]!.messages).toEqual([
                { role: 'system', content: 'Process the provided input.' },
                {
                    role: 'user',
                    content: 'first output\n\nTask:\nRun stage two.',
                },
            ]);
            expect(
                requests[1]!.messages.some(
                    (message) => message.role === 'assistant'
                )
            ).toBe(false);
            expect(requests[0]!.sessionId).toBe(requests[1]!.sessionId);
            expect(requests[0]!.promptCacheKey).toBe(requests[0]!.sessionId);
            expect(requests[1]!.promptCacheKey).toBe(requests[1]!.sessionId);
            expect(result.sessionMessages).toEqual([
                { role: 'user', content: 'original request' },
                { role: 'assistant', content: 'second output' },
            ]);
        });

        it('does not replay resumed transcript messages to an agent request', async () => {
            adapter = new OpenRouterExecutionAdapter(mockClient as any, {
                resumeFrom: {
                    startNodeId: 'agent-1',
                    nodeOutputs: { 'start-1': 'new workflow input' },
                    sessionMessages: [
                        { role: 'user', content: 'old thread request' },
                        { role: 'assistant', content: 'old assistant answer' },
                        { role: 'assistant', content: 'another old answer' },
                    ],
                },
            });
            mockClient.chat.send.mockResolvedValueOnce(
                (async function* () {
                    yield { choices: [{ delta: { content: 'fresh output' } }] };
                })()
            );

            const result = await adapter.execute(
                createTestWorkflow(),
                { text: 'new workflow input' },
                callbacks
            );
            const request = mockClient.chat.send.mock.calls[0]![0]
                .chatRequest as {
                messages: Array<{ role: string; content: string }>;
            };

            expect(result.success).toBe(true);
            expect(request.messages).toEqual([
                { role: 'system', content: 'You are a helpful assistant.' },
                { role: 'user', content: 'new workflow input' },
            ]);
        });

        it('should handle workflow without start node', async () => {
            const events: Array<{ event: { type: string } }> = [];
            adapter = new OpenRouterExecutionAdapter(mockClient as any, {
                onEventV2: (event) => events.push(event),
            });
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
            expect(adapter.isRunning()).toBe(false);
            expect(
                events.some((event) => event.event.type === 'done')
            ).toBe(true);
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
                            {
                                id: 'route-a',
                                label: 'Technical',
                                description:
                                    'Choose this route for programming questions.',
                            },
                            {
                                id: 'route-b',
                                label: 'General',
                                description:
                                    'Choose this route for non-technical questions.',
                            },
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
        expect(result.nodeOutputs['router-1']).toBe('How do I code?');
        expect(callbacks.onNodeStart).toHaveBeenCalledWith(
            'agent-tech',
            expect.objectContaining({ id: 'agent-tech', label: 'Tech Agent' })
        );
        expect(callbacks.onNodeStart).not.toHaveBeenCalledWith(
            'agent-general',
            expect.anything()
        );
        expect(mockClient.chat.send).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                chatRequest: expect.objectContaining({
                    tools: expect.any(Array),
                    toolChoice: expect.any(Object),
                    provider: expect.objectContaining({
                        requireParameters: true,
                    }),
                }),
            }),
            expect.any(Object)
        );
        const routerRequest = mockClient.chat.send.mock.calls[0]?.[0]
            ?.chatRequest as Record<string, unknown>;
        expect(routerRequest).not.toHaveProperty('temperature');
        expect(routerRequest.messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    role: 'system',
                    content: expect.stringContaining(
                        'Choose this route for programming questions.'
                    ),
                }),
            ])
        );
        const routedAgentRequest = mockClient.chat.send.mock.calls[1]?.[0]
            ?.chatRequest as {
            messages?: Array<{ role?: string; content?: unknown }>;
        };
        expect(
            routedAgentRequest.messages?.some(
                (message) =>
                    message.role === 'user' &&
                    typeof message.content === 'string' &&
                    message.content.includes('How do I code?')
            )
        ).toBe(true);
        expect(
            routedAgentRequest.messages?.some(
                (message) =>
                    typeof message.content === 'string' &&
                    message.content.includes('Routed to')
            )
        ).toBe(false);
    });
});
