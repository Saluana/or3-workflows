import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import {
    OpenRouterExecutionAdapter,
    validateToolArgs,
    stableToolCallId,
    prepareToolCalls,
    executeToolCallsParallel,
    checkStopPolicy,
    createStopPolicyState,
    BudgetExceededError,
    CHECKPOINT_SCHEMA_VERSION,
    normalizeCheckpoint,
    McpSession,
    type WorkflowData,
    type LLMProvider,
    type McpClientLike,
    type ExecutionCallbacks,
    type WorkflowEvent,
    type WorkflowCheckpoint,
} from '../index';

function emptyCallbacks(): ExecutionCallbacks {
    return {
        onNodeStart: () => {},
        onNodeFinish: () => {},
        onNodeError: () => {},
        onToken: () => {},
    };
}

function createProvider(
    responses: Array<{
        content?: string | null;
        toolCalls?: Array<{
            id?: string;
            function: { name: string; arguments: string };
        }>;
        usage?: {
            promptTokens: number;
            completionTokens: number;
            totalTokens: number;
        };
        finishReason?: string;
    }>
): LLMProvider {
    let i = 0;
    return {
        chat: vi.fn().mockImplementation(async () => {
            const next = responses[Math.min(i, responses.length - 1)]!;
            i += 1;
            return {
                content: next.content ?? null,
                toolCalls: next.toolCalls?.map((tc) => ({
                    id: tc.id || '',
                    type: 'function' as const,
                    function: tc.function,
                })),
                usage: next.usage,
                finishReason: next.finishReason,
            };
        }),
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

const simpleWorkflow: WorkflowData = {
    meta: { version: '2.0.0', name: 'Protocol' },
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
                label: 'Agent',
                model: 'test-model',
                prompt: 'Hi',
            },
        },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'agent-1' }],
};

describe('toolProtocol', () => {
    it('validates args with Zod schema', () => {
        const schema = z.object({ city: z.string(), units: z.enum(['c', 'f']) });
        expect(
            validateToolArgs(
                { city: 'NYC', units: 'c' },
                { zodSchema: schema }
            ).success
        ).toBe(true);
        const bad = validateToolArgs(
            { city: 1 },
            { zodSchema: schema }
        );
        expect(bad.success).toBe(false);
    });

    it('validates required JSON Schema fields', () => {
        const result = validateToolArgs(
            {},
            {
                parameters: {
                    type: 'object',
                    required: ['q'],
                    properties: { q: { type: 'string' } },
                },
            }
        );
        expect(result.success).toBe(false);
    });

    it('produces stable tool_call_ids when provider id missing', () => {
        const a = stableToolCallId({
            nodeId: 'n1',
            toolName: 'search',
            argsJson: '{"q":"x"}',
            iteration: 0,
        });
        const b = stableToolCallId({
            nodeId: 'n1',
            toolName: 'search',
            argsJson: '{"q":"x"}',
            iteration: 0,
        });
        expect(a).toBe(b);
        expect(a.startsWith('tc_')).toBe(true);
    });

    it('prefers provider ids and executes tools in parallel', async () => {
        const prepared = prepareToolCalls(
            [
                {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'a', arguments: '{}' },
                },
                {
                    id: '',
                    type: 'function',
                    function: { name: 'b', arguments: '{}' },
                },
            ],
            { nodeId: 'agent', iteration: 0 }
        );
        expect(prepared[0]!.toolCallId).toBe('call_1');
        expect(prepared[1]!.toolCallId.startsWith('tc_')).toBe(true);

        const order: string[] = [];
        const results = await executeToolCallsParallel(prepared, async (call) => {
            order.push(call.toolName);
            return `ok:${call.toolName}`;
        });
        expect(results.map((r) => r.result)).toEqual(['ok:a', 'ok:b']);
        expect(order.sort()).toEqual(['a', 'b']);
    });

    it('runs parallel tool calls in one agent turn with Zod validation', async () => {
        const provider = createProvider([
            {
                content: null,
                toolCalls: [
                    {
                        id: 'c1',
                        function: {
                            name: 'add',
                            arguments: JSON.stringify({ a: 1, b: 2 }),
                        },
                    },
                    {
                        function: {
                            name: 'add',
                            arguments: JSON.stringify({ a: 3, b: 4 }),
                        },
                    },
                ],
            },
            { content: 'done', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, finishReason: 'stop' },
        ]);

        const addSchema = z.object({ a: z.number(), b: z.number() });
        const calls: number[] = [];
        const adapter = new OpenRouterExecutionAdapter(provider, {
            preflight: false,
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'add',
                        parameters: {
                            type: 'object',
                            properties: {
                                a: { type: 'number' },
                                b: { type: 'number' },
                            },
                            required: ['a', 'b'],
                        },
                    },
                    zodSchema: addSchema,
                    handler: async (args) => {
                        const { a, b } = args as { a: number; b: number };
                        calls.push(a + b);
                        return String(a + b);
                    },
                },
            ],
        });

        const result = await adapter.execute(
            simpleWorkflow,
            { text: 'sum' },
            emptyCallbacks()
        );
        expect(result.success).toBe(true);
        expect(calls.sort((x, y) => x - y)).toEqual([3, 7]);
        expect(provider.chat).toHaveBeenCalledTimes(2);
        const firstCall = (provider.chat as ReturnType<typeof vi.fn>).mock
            .calls[0];
        // toolChoice / tools present on second options arg
        expect(firstCall?.[2]?.tools?.length).toBe(1);
    });
});

describe('stopPolicy + onEvent', () => {
    it('checkStopPolicy detects max_steps', () => {
        const state = createStopPolicyState();
        state.steps = 2;
        const check = checkStopPolicy({ maxSteps: 2 }, state);
        expect(check.exceeded).toBe(true);
        if (check.exceeded) expect(check.reason).toBe('max_steps');
    });

    it('pauses with budget envelope when maxSteps exceeded', async () => {
        const provider = createProvider([
            { content: 'step1', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
            { content: 'step2', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } },
        ]);
        const events: WorkflowEvent[] = [];
        const adapter = new OpenRouterExecutionAdapter(provider, {
            preflight: false,
            stopPolicy: { maxSteps: 1 },
            onEvent: (e) => events.push(e),
        });

        // Two-agent chain so second LLM call would exceed maxSteps=1
        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Budget' },
            nodes: [
                {
                    id: 'start',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'a1',
                    type: 'agent',
                    position: { x: 0, y: 100 },
                    data: { label: 'A1', model: 'm', prompt: '1' },
                },
                {
                    id: 'a2',
                    type: 'agent',
                    position: { x: 0, y: 200 },
                    data: { label: 'A2', model: 'm', prompt: '2' },
                },
            ],
            edges: [
                { id: 'e1', source: 'start', target: 'a1' },
                { id: 'e2', source: 'a1', target: 'a2' },
            ],
        };

        const result = await adapter.execute(
            workflow,
            { text: 'go' },
            emptyCallbacks()
        );

        expect(result.paused).toBe(true);
        expect(result.pause?.type).toBe('budget');
        expect(result.pause?.resumeToken).toBeTruthy();
        expect(result.error).toBeInstanceOf(BudgetExceededError);
        // First agent uses the one allowed step; second agent is blocked
        expect(provider.chat).toHaveBeenCalledTimes(1);
        expect(events.some((e) => e.type === 'budget')).toBe(true);
        expect(events.some((e) => e.type === 'run_start')).toBe(true);
        expect(events.some((e) => e.type === 'done')).toBe(true);
    });
});

describe('edge inputMapping', () => {
    it('supports pick / template / json mappings', async () => {
        const provider = createProvider([
            { content: 'from-a' },
            { content: 'from-b' },
            { content: 'merged' },
        ]);

        // Capture the input seen by the third agent via a custom prompt isn't easy;
        // instead verify via a tool that echoes context.input — use a simple agent
        // and inspect provider messages on the merge node.
        const adapter = new OpenRouterExecutionAdapter(provider, {
            preflight: false,
        });

        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Edges' },
            nodes: [
                {
                    id: 'start',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'a',
                    type: 'agent',
                    position: { x: 0, y: 100 },
                    data: { label: 'A', model: 'm', prompt: 'A' },
                },
                {
                    id: 'b',
                    type: 'agent',
                    position: { x: 100, y: 100 },
                    data: { label: 'B', model: 'm', prompt: 'B' },
                },
                {
                    id: 'merge',
                    type: 'agent',
                    position: { x: 50, y: 200 },
                    data: {
                        label: 'Merge',
                        model: 'm',
                        prompt: 'Merge: {{input}}',
                    },
                },
            ],
            edges: [
                { id: 'e1', source: 'start', target: 'a' },
                { id: 'e2', source: 'start', target: 'b' },
                {
                    id: 'e3',
                    source: 'a',
                    target: 'merge',
                    data: {
                        inputMapping: { mode: 'json', key: 'left' },
                    },
                },
                {
                    id: 'e4',
                    source: 'b',
                    target: 'merge',
                    data: {
                        inputMapping: { mode: 'json', key: 'right' },
                    },
                },
            ],
        };

        const result = await adapter.execute(
            workflow,
            { text: 'seed' },
            emptyCallbacks()
        );
        expect(result.success).toBe(true);

        // Third chat call is the merge agent — last user content should include JSON
        const chatMock = provider.chat as ReturnType<typeof vi.fn>;
        const mergeCall = chatMock.mock.calls[2];
        const messages = mergeCall?.[1] as Array<{ role: string; content: string }>;
        const userMsgs = messages.filter((m) => m.role === 'user');
        const userMsg = userMsgs[userMsgs.length - 1];
        expect(userMsg?.content).toContain('"left"');
        expect(userMsg?.content).toContain('"right"');
        expect(userMsg?.content).toContain('from-a');
        expect(userMsg?.content).toContain('from-b');
    });

    it('supports template mapping', async () => {
        const provider = createProvider([{ content: 'alpha' }, { content: 'ok' }]);
        const adapter = new OpenRouterExecutionAdapter(provider, {
            preflight: false,
        });
        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Template' },
            nodes: [
                {
                    id: 'start',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'a',
                    type: 'agent',
                    position: { x: 0, y: 100 },
                    data: { label: 'A', model: 'm', prompt: 'A' },
                },
                {
                    id: 'b',
                    type: 'agent',
                    position: { x: 0, y: 200 },
                    data: { label: 'B', model: 'm', prompt: 'Use {{input}}' },
                },
            ],
            edges: [
                { id: 'e1', source: 'start', target: 'a' },
                {
                    id: 'e2',
                    source: 'a',
                    target: 'b',
                    data: {
                        inputMapping: {
                            mode: 'template',
                            template: 'Wrapped({{a}})',
                        },
                    },
                },
            ],
        };

        await adapter.execute(workflow, { text: 'x' }, emptyCallbacks());
        const chatMock = provider.chat as ReturnType<typeof vi.fn>;
        const second = chatMock.mock.calls[1]?.[1] as Array<{
            role: string;
            content: string;
        }>;
        const userMsgs = second.filter((m) => m.role === 'user');
        const userMsg = userMsgs[userMsgs.length - 1];
        expect(userMsg?.content).toContain('Wrapped(alpha)');
    });
});

describe('checkpoint schema versioning', () => {
    it('normalizes missing schemaVersion to 1', () => {
        const raw = {
            id: 'cp_1',
            sessionId: 's',
            createdAt: 1,
            status: 'paused' as const,
            nodeOutputs: {},
            executionOrder: [],
            sessionMessages: [],
        };
        const normalized = normalizeCheckpoint(
            raw as unknown as WorkflowCheckpoint
        );
        expect(normalized.schemaVersion).toBe(CHECKPOINT_SCHEMA_VERSION);
    });
});

describe('HITL pause envelope', () => {
    it('returns explicit pause envelope on durable HITL', async () => {
        const { InMemoryCheckpointAdapter, InMemoryHITLAdapter } =
            await import('../index');
        const provider = createProvider([{ content: 'should-not-run' }]);
        const adapter = new OpenRouterExecutionAdapter(provider, {
            durableHITL: true,
            checkpointAdapter: new InMemoryCheckpointAdapter(),
            hitlAdapter: new InMemoryHITLAdapter(),
            preflight: false,
        });
        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'HITL' },
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
        const result = await adapter.execute(
            workflow,
            { text: 'hi' },
            emptyCallbacks()
        );
        expect(result.pause?.type).toBe('hitl');
        expect(result.pause?.resumeToken).toBe(result.checkpointId);
        expect(result.pause?.hitlRequest?.nodeId).toBe('agent-1');
    });
});

describe('MCP resources / prompts / session', () => {
    function createMcpClient(): McpClientLike {
        return {
            listTools: async () => ({
                tools: [
                    {
                        name: 'echo',
                        description: 'Echo',
                        inputSchema: {
                            type: 'object',
                            properties: { text: { type: 'string' } },
                        },
                    },
                ],
            }),
            callTool: async (_name, args) => ({
                content: [{ type: 'text', text: String(args.text ?? '') }],
            }),
            listResources: async () => ({
                resources: [
                    {
                        uri: 'file://readme',
                        name: 'readme',
                        mimeType: 'text/plain',
                    },
                ],
            }),
            readResource: async (uri) => ({
                content: [{ type: 'text', text: `resource:${uri}` }],
            }),
            listPrompts: async () => ({
                prompts: [{ name: 'greet', description: 'Greeting' }],
            }),
            getPrompt: async (name, args) => ({
                content: [
                    {
                        type: 'text',
                        text: `prompt:${name}:${args?.who ?? ''}`,
                    },
                ],
            }),
            close: vi.fn(),
        };
    }

    it('lists resources and prompts and scopes a session', async () => {
        const client = createMcpClient();
        const session = new McpSession(client, {
            sessionId: 'run-1',
            prefix: 'mcp_',
        });

        const resources = await session.listResources();
        expect(resources[0]?.uri).toBe('file://readme');
        expect(await session.readResource('file://readme')).toContain(
            'resource:file://readme'
        );

        const prompts = await session.listPrompts();
        expect(prompts[0]?.name).toBe('greet');
        expect(await session.getPrompt('greet', { who: 'Ada' })).toContain(
            'prompt:greet:Ada'
        );

        const tools = await session.register();
        expect(tools[0]?.function.name).toBe('mcp_echo');

        await session.close();
        expect(client.close).toHaveBeenCalled();
        await expect(session.getTools()).rejects.toThrow(/closed/);
    });
});

describe('toolChoice + structuredOutput wiring', () => {
    it('passes toolChoice and json_schema responseFormat to provider', async () => {
        const provider = createProvider([{ content: '{"ok":true}' }]);
        const adapter = new OpenRouterExecutionAdapter(provider, {
            preflight: false,
        });
        const workflow: WorkflowData = {
            meta: { version: '2.0.0', name: 'Structured' },
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
                        label: 'Agent',
                        model: 'm',
                        prompt: 'Return JSON',
                        toolChoice: 'none',
                        structuredOutput: {
                            name: 'Result',
                            schema: {
                                type: 'object',
                                properties: { ok: { type: 'boolean' } },
                            },
                            strict: true,
                        },
                    },
                },
            ],
            edges: [{ id: 'e1', source: 'start', target: 'agent-1' }],
        };

        await adapter.execute(workflow, { text: 'x' }, emptyCallbacks());
        const opts = (provider.chat as ReturnType<typeof vi.fn>).mock
            .calls[0]?.[2];
        expect(opts.toolChoice).toBe('none');
        expect(opts.responseFormat?.type).toBe('json_schema');
        expect(opts.responseFormat?.json_schema?.name).toBe('Result');
    });
});
