import { OpenRouter } from '@openrouter/sdk';
import { describe, expect, it } from 'vitest';

import {
    DefaultSubflowRegistry,
    OpenRouterExecutionAdapter,
    type ExecutionCallbacks,
    type ExecutionResult,
    type WorkflowData,
    type WorkflowEdge,
    type WorkflowNode,
} from '..';

const MODEL = process.env.OPENROUTER_LIVE_MODEL ??
    '~deepseek/deepseek-v4-flash-latest';
const LIVE = process.env.RUN_OPENROUTER_LIVE === '1';
const API_KEY = process.env.OPENROUTER_API_KEY;

type LiveRun = {
    name: string;
    result: ExecutionResult;
    started: string[];
    routes: string[];
    branches: string[];
    loopIterations: number[];
};

const node = (
    id: string,
    type: string,
    data: Record<string, unknown>
): WorkflowNode => ({ id, type, position: { x: 0, y: 0 }, data: data as any });

const edge = (
    source: string,
    target: string,
    sourceHandle?: string,
    label?: string
): WorkflowEdge => ({
    id: `${source}-${sourceHandle ?? 'out'}-${target}`,
    source,
    target,
    sourceHandle,
    label,
});

const workflow = (
    name: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): WorkflowData => ({
    meta: { id: `live-${name}`, version: '2.0.0', name },
    nodes,
    edges,
});

const start = () => node('start', 'start', { label: 'Start' });
const agent = (id: string, prompt: string, extra = {}) =>
    node(id, 'agent', {
        label: id,
        model: MODEL,
        prompt,
        temperature: 0,
        maxTokens: 800,
        modelRequest: {
            version: 1,
            models: [MODEL],
            generation: { reasoning: { effort: 'none' } },
        },
        ...extra,
    });
const output = (id: string, sources: string[], extra = {}) =>
    node(id, 'output', {
        label: id,
        mode: 'combine',
        format: 'text',
        sources,
        ...extra,
    });

function makeAdapter(options: Record<string, unknown> = {}) {
    if (!API_KEY) throw new Error('OPENROUTER_API_KEY is required');
    return new OpenRouterExecutionAdapter(new OpenRouter({ apiKey: API_KEY }) as any, {
        defaultModel: MODEL,
        maxRetries: 1,
        ...options,
    });
}

async function runLive(
    name: string,
    wf: WorkflowData,
    text: string,
    options: Record<string, unknown> = {}
): Promise<LiveRun> {
    const started: string[] = [];
    const routes: string[] = [];
    const branches: string[] = [];
    const loopIterations: number[] = [];
    const callbacks: ExecutionCallbacks = {
        onNodeStart: (id) => started.push(id),
        onNodeFinish: () => undefined,
        onNodeError: () => undefined,
        onToken: () => undefined,
        onRouteSelected: (_id, routeId) => routes.push(routeId),
        onBranchStart: (_id, branchId) => branches.push(branchId),
        onLoopIteration: (_id, iteration) => loopIterations.push(iteration),
    };
    const result = await makeAdapter(options).execute(
        wf,
        { text, attachments: [] },
        callbacks
    );
    console.info(
        `[openrouter-live] ${name}: success=${result.success} duration=${result.duration}ms calls=${result.modelCalls?.length ?? 0} cost=${result.costUsd ?? 'unreported'}`
    );
    if (!result.success) {
        console.info(
            `[openrouter-live] ${name}: error=${result.error?.message ?? 'missing error'} modelCalls=${JSON.stringify(result.modelCalls ?? [])}`
        );
    }
    return {
        name,
        result,
        started,
        routes,
        branches,
        loopIterations,
    };
}

describe.skipIf(!LIVE || !API_KEY)(
    `OpenRouter live node matrix (${MODEL})`,
    () => {
        it('executes start -> agent -> output and preserves output formatting', async () => {
            const wf = workflow(
                'agent-output',
                [
                    start(),
                    agent(
                        'agent',
                        'Return exactly this text and nothing else: OR3_AGENT_OK_42'
                    ),
                    output('output', ['agent'], {
                        introText: 'BEGIN',
                        outroText: 'END',
                    }),
                ],
                [edge('start', 'agent'), edge('agent', 'output')]
            );
            const { result, started } = await runLive('agent-output', wf, 'ignored');

            expect(result.success).toBe(true);
            expect(result.output).toContain('OR3_AGENT_OK_42');
            expect(result.output).toMatch(/^BEGIN/);
            expect(result.output).toMatch(/END$/);
            expect(started).toEqual(expect.arrayContaining(['start', 'agent', 'output']));
        }, 90_000);

        it('enforces a structured-agent JSON schema', async () => {
            const wf = workflow(
                'structured-agent',
                [
                    start(),
                    agent('structured', 'Extract the requested values exactly.', {
                        maxTokens: 1_200,
                        structuredOutput: {
                            name: 'live_contract',
                            strict: true,
                            schema: {
                                type: 'object',
                                properties: {
                                    answer: { type: 'string' },
                                    count: { type: 'number' },
                                    approved: { type: 'boolean' },
                                },
                                required: ['answer', 'count', 'approved'],
                                additionalProperties: false,
                            },
                        },
                    }),
                    node('schema-check', 'schemaValidation', {
                        label: 'Contract check',
                        onInvalid: 'error',
                        spec: {
                            schemaId: 'live_contract',
                            schemaVersion: 1,
                            strict: true,
                            jsonSchema: {
                                type: 'object',
                                properties: {
                                    answer: { type: 'string' },
                                    count: { type: 'number' },
                                    approved: { type: 'boolean' },
                                },
                                required: ['answer', 'count', 'approved'],
                                additionalProperties: false,
                            },
                        },
                    }),
                    output('output', ['schema-check']),
                ],
                [
                    edge('start', 'structured'),
                    edge('structured', 'schema-check'),
                    edge('schema-check', 'output', 'output'),
                ]
            );
            const { result } = await runLive(
                'structured-agent',
                wf,
                'answer is cobalt; count is 7; approved is yes'
            );
            expect(result.success).toBe(true);
            const parsed = JSON.parse(result.output);
            expect(parsed).toEqual({ answer: 'cobalt', count: 7, approved: true });
            expect(result.executionOrder).toEqual(
                expect.arrayContaining(['structured', 'schema-check', 'output'])
            );
        }, 90_000);

        it('uses route descriptions to select both branches', async () => {
            const router = node('router', 'router', {
                label: 'Mention classifier',
                model: MODEL,
                prompt: 'Classify only whether the supplied text mentions God.',
                routes: [
                    {
                        id: 'yes',
                        label: 'Yes',
                        description: 'Choose when the text mentions God.',
                    },
                    {
                        id: 'no',
                        label: 'No',
                        description: 'Choose when the text does not mention God.',
                    },
                ],
            });
            const wf = workflow(
                'router',
                [
                    start(),
                    router,
                    agent('yes-agent', 'Return exactly ROUTE_YES.'),
                    agent('no-agent', 'Return exactly ROUTE_NO.'),
                ],
                [
                    edge('start', 'router'),
                    edge('router', 'yes-agent', 'yes', 'Yes'),
                    edge('router', 'no-agent', 'no', 'No'),
                ]
            );
            const yes = await runLive('router-yes', wf, 'The text says God is merciful.');
            const no = await runLive('router-no', wf, 'The text discusses sourdough bread.');

            expect(yes.result.output).toContain('ROUTE_YES');
            expect(yes.routes).toContain('yes');
            expect(no.result.output).toContain('ROUTE_NO');
            expect(no.routes).toContain('no');
        }, 150_000);

        it('runs parallel specialist branches and merges a useful incident brief', async () => {
            const parallel = node('parallel', 'parallel', {
                label: 'Incident panel',
                model: MODEL,
                mergeEnabled: true,
                prompt:
                    'Merge into JSON with string keys summary, risk, and action. Return JSON only.',
                branches: [
                    {
                        id: 'summary',
                        label: 'Summary',
                        model: MODEL,
                        prompt: 'Summarize the incident in one sentence.',
                    },
                    {
                        id: 'risk',
                        label: 'Risk',
                        model: MODEL,
                        prompt: 'State the highest operational risk in one sentence.',
                    },
                    {
                        id: 'action',
                        label: 'Action',
                        model: MODEL,
                        prompt: 'Give the single best next action in one sentence.',
                    },
                ],
            });
            const wf = workflow(
                'parallel',
                [start(), parallel, output('output', ['parallel'])],
                [edge('start', 'parallel'), edge('parallel', 'output', 'merged')]
            );
            const { result, branches } = await runLive(
                'parallel',
                wf,
                'Checkout errors rose to 18% after deploy 842. Rollback is available.'
            );
            const parsed = JSON.parse(result.output.replace(/^```json\s*|\s*```$/g, ''));

            expect(result.success).toBe(true);
            expect(parsed).toEqual(
                expect.objectContaining({
                    summary: expect.any(String),
                    risk: expect.any(String),
                    action: expect.any(String),
                })
            );
            expect(branches).toEqual(
                expect.arrayContaining(['summary', 'risk', 'action', '__merge__'])
            );
        }, 150_000);

        it('runs a fixed while-loop exactly twice and exits through done', async () => {
            const loop = node('loop', 'whileLoop', {
                label: 'Two-pass editor',
                conditionPrompt: 'unused in fixed mode',
                conditionModel: MODEL,
                loopMode: 'fixed',
                loopPrompt: 'Improve clarity while retaining the token LOOP_ANCHOR.',
                includeIterationContext: true,
                maxIterations: 2,
                onMaxIterations: 'continue',
                outputMode: 'accumulate',
            });
            const wf = workflow(
                'while-loop',
                [
                    start(),
                    loop,
                    agent(
                        'editor',
                        'Rewrite clearly in one sentence. Preserve LOOP_ANCHOR exactly.'
                    ),
                    output('output', ['loop']),
                ],
                [
                    edge('start', 'loop'),
                    edge('loop', 'editor', 'body'),
                    edge('loop', 'output', 'done'),
                ]
            );
            const { result } = await runLive(
                'while-loop',
                wf,
                'LOOP_ANCHOR this alert wording is kind of confusing and should be clearer.'
            );
            const parsed = JSON.parse(result.nodeOutputs.loop);

            expect(result.success).toBe(true);
            expect(parsed.iterations).toBe(2);
            expect(parsed.outputs).toHaveLength(2);
            expect(parsed.finalOutput).toContain('LOOP_ANCHOR');
            expect(result.executionOrder).toContain('output');
        }, 150_000);

        it('uses an LLM condition to stop a useful loop after the body becomes ready', async () => {
            const loop = node('loop', 'whileLoop', {
                label: 'Readiness loop',
                conditionPrompt:
                    'Respond continue unless the current text contains READY_MARKER; then respond done.',
                conditionModel: MODEL,
                loopMode: 'condition',
                loopPrompt: 'Produce the corrected value and include READY_MARKER.',
                maxIterations: 3,
                onMaxIterations: 'error',
                outputMode: 'accumulate',
            });
            const wf = workflow(
                'condition-loop',
                [
                    start(),
                    loop,
                    agent(
                        'repair',
                        'Return exactly: READY_MARKER corrected-value'
                    ),
                    output('output', ['loop']),
                ],
                [
                    edge('start', 'loop'),
                    edge('loop', 'repair', 'body'),
                    edge('loop', 'output', 'done'),
                ]
            );
            const { result } = await runLive(
                'condition-loop',
                wf,
                'uncorrected value'
            );

            expect(result.success).toBe(true);
            const parsed = JSON.parse(result.nodeOutputs.loop);
            if (parsed.iterations !== 1) {
                console.info(
                    `[openrouter-live] condition-loop controller calls=${JSON.stringify(result.modelCalls ?? [])}`
                );
            }
            expect(parsed.iterations).toBe(1);
            expect(parsed.finalOutput).toContain('READY_MARKER');
        }, 150_000);

        it('fails safely instead of running forever when a loop hits its limit', async () => {
            const loop = node('loop', 'whileLoop', {
                label: 'Bounded breaker',
                conditionPrompt: 'unused in fixed mode',
                loopMode: 'fixed',
                maxIterations: 1,
                onMaxIterations: 'error',
                outputMode: 'last',
            });
            const wf = workflow(
                'loop-limit-error',
                [
                    start(),
                    loop,
                    agent('body', 'Return exactly ONE_BOUNDED_ITERATION.'),
                ],
                [edge('start', 'loop'), edge('loop', 'body', 'body')]
            );
            const { result, loopIterations } = await runLive(
                'loop-limit-error',
                wf,
                'try to loop forever'
            );

            expect(result.success).toBe(false);
            expect(result.error?.message).toContain(
                'While loop reached max iterations (1)'
            );
            expect(loopIterations).toEqual([1]);
            expect(result.modelCalls?.length).toBeGreaterThanOrEqual(1);
        }, 90_000);

        it('maps parent input through a real LLM-backed subflow', async () => {
            const child = workflow(
                'child-subflow',
                [
                    start(),
                    agent(
                        'child-agent',
                        'Turn the input into an uppercase slug with hyphens only. Return only the slug.'
                    ),
                ],
                [edge('start', 'child-agent')]
            );
            const registry = new DefaultSubflowRegistry();
            registry.register({
                id: 'slugger',
                name: 'Slugger',
                inputs: [{ id: 'text', name: 'Text', type: 'string', required: true }],
                outputs: [{ id: 'slug', name: 'Slug', type: 'string' }],
                workflow: child,
            });
            const wf = workflow(
                'subflow-parent',
                [
                    start(),
                    node('subflow', 'subflow', {
                        label: 'Slug subflow',
                        subflowId: 'slugger',
                        inputMappings: { text: '{{input}}' },
                        shareSession: true,
                    }),
                    output('output', ['subflow']),
                ],
                [
                    edge('start', 'subflow'),
                    edge('subflow', 'output', 'output'),
                ]
            );
            const { result } = await runLive(
                'subflow',
                wf,
                'Useful workflow test',
                { subflowRegistry: registry }
            );

            expect(result.success).toBe(true);
            expect(result.output.trim()).toBe('USEFUL-WORKFLOW-TEST');
            expect(result.modelCalls).toHaveLength(1);
            expect(result.modelCalls?.[0]?.nodeId).toContain('child-agent');
            expect(result.costUsd).toBeDefined();
        }, 120_000);

        it('exercises the Research Agent server-tool configuration', async () => {
            const research = agent(
                'research',
                'Use the web fetch tool to inspect https://example.com. Return only its page title.',
                {
                    modelRequest: {
                        version: 1,
                        models: [MODEL],
                        routing: { requireParameters: true },
                        requiredCapabilities: ['tools'],
                        serverTools: [
                            {
                                name: 'openrouter:web_fetch',
                                transport: 'either',
                            },
                        ],
                    },
                    toolChoice: 'required',
                }
            );
            const wf = workflow(
                'research-agent',
                [start(), research],
                [edge('start', 'research')]
            );
            const { result } = await runLive(
                'research-agent',
                wf,
                'Fetch the supplied page now.'
            );

            expect(result.success).toBe(true);
            expect(result.output.toLowerCase()).toContain('example domain');
        }, 150_000);
    }
);

describe('OpenRouter live suite guard', () => {
    it('remains opt-in so normal tests never spend API credits', () => {
        if (LIVE) expect(API_KEY).toBeTruthy();
        else expect(LIVE).toBe(false);
    });
});
