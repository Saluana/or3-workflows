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

const node = (
    id: string,
    type: string,
    data: Record<string, unknown>
): WorkflowNode => ({ id, type, position: { x: 0, y: 0 }, data: data as any });

const edge = (
    source: string,
    target: string,
    sourceHandle?: string,
    data?: WorkflowEdge['data']
): WorkflowEdge => ({
    id: `${source}-${sourceHandle ?? 'out'}-${target}`,
    source,
    target,
    sourceHandle,
    data,
});

const workflow = (
    name: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): WorkflowData => ({
    meta: {
        id: `complex-${name}`,
        version: '2.0.0',
        name,
        description: `Live complex workflow: ${name}`,
    },
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
        maxTokens: 1_000,
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

function adapter(options: Record<string, unknown> = {}) {
    if (!API_KEY) throw new Error('OPENROUTER_API_KEY is required');
    return new OpenRouterExecutionAdapter(new OpenRouter({ apiKey: API_KEY }) as any, {
        defaultModel: MODEL,
        maxRetries: 1,
        ...options,
    });
}

async function run(
    name: string,
    wf: WorkflowData,
    text: string,
    options: Record<string, unknown> = {}
): Promise<{ result: ExecutionResult; routes: string[]; branches: string[] }> {
    const routes: string[] = [];
    const branches: string[] = [];
    const callbacks: ExecutionCallbacks = {
        onNodeStart: () => undefined,
        onNodeFinish: () => undefined,
        onNodeError: () => undefined,
        onToken: () => undefined,
        onRouteSelected: (_nodeId, routeId) => routes.push(routeId),
        onBranchStart: (_nodeId, branchId) => branches.push(branchId),
    };
    const result = await adapter(options).execute(
        wf,
        { text, attachments: [] },
        callbacks
    );
    console.info(
        `[openrouter-complex] ${name}: success=${result.success} duration=${result.duration}ms calls=${result.modelCalls?.length ?? 0} cost=${result.costUsd ?? 'unreported'}`
    );
    if (!result.success) {
        console.info(
            `[openrouter-complex] ${name}: ${result.error?.message ?? 'missing error'}`
        );
    }
    return { result, routes, branches };
}

describe.skipIf(!LIVE || !API_KEY)(
    `OpenRouter complex workflows (${MODEL})`,
    () => {
        it('routes a security incident through parallel analysis, structured normalization, validation, and output', async () => {
            const router = node('triage', 'router', {
                label: 'Incident triage',
                model: MODEL,
                prompt: 'Choose security only for credentials, intrusion, or data exposure.',
                routes: [
                    {
                        id: 'security',
                        label: 'Security incident',
                        description:
                            'Credentials, secrets, unauthorized access, or exposed data.',
                    },
                    {
                        id: 'general',
                        label: 'General operations',
                        description:
                            'Availability, performance, deployment, or ordinary product issues.',
                    },
                ],
            });
            const panel = node('panel', 'parallel', {
                label: 'Security response panel',
                model: MODEL,
                mergeEnabled: true,
                prompt:
                    'Merge the specialist reports into a concise incident assessment containing severity evidence and immediate actions.',
                branches: [
                    {
                        id: 'containment',
                        label: 'Containment',
                        model: MODEL,
                        prompt:
                            'Recommend immediate containment steps. Be concrete and brief.',
                    },
                    {
                        id: 'impact',
                        label: 'Impact',
                        model: MODEL,
                        prompt:
                            'Assess likely impact and what evidence must be collected.',
                    },
                    {
                        id: 'communications',
                        label: 'Communications',
                        model: MODEL,
                        prompt:
                            'Draft the essential internal escalation message in two sentences.',
                    },
                ],
            });
            const normalizer = agent(
                'normalize',
                'Convert the incident assessment into the required schema. Preserve concrete containment actions.',
                {
                    maxTokens: 1_200,
                    structuredOutput: {
                        name: 'incident_report',
                        strict: true,
                        schema: {
                            type: 'object',
                            properties: {
                                severity: {
                                    type: 'string',
                                    enum: ['low', 'medium', 'high', 'critical'],
                                },
                                summary: { type: 'string' },
                                actions: {
                                    type: 'array',
                                    minItems: 2,
                                    items: { type: 'string' },
                                },
                            },
                            required: ['severity', 'summary', 'actions'],
                            additionalProperties: false,
                        },
                    },
                }
            );
            const validator = node('validate', 'schemaValidation', {
                label: 'Validate incident contract',
                onInvalid: 'error',
                spec: {
                    schemaId: 'incident_report',
                    schemaVersion: 1,
                    strict: true,
                    jsonSchema: normalizer.data.structuredOutput
                        ? (normalizer.data.structuredOutput as any).schema
                        : {},
                },
            });
            const wf = workflow(
                'incident-response',
                [
                    start(),
                    router,
                    panel,
                    agent('general', 'Return exactly GENERAL_BRANCH.'),
                    normalizer,
                    validator,
                    output('output', ['validate']),
                ],
                [
                    edge('start', 'triage'),
                    edge('triage', 'panel', 'security'),
                    edge('triage', 'general', 'general'),
                    edge('panel', 'normalize', 'merged'),
                    edge('normalize', 'validate'),
                    edge('validate', 'output', 'output'),
                ]
            );
            const { result, routes, branches } = await run(
                'incident-response',
                wf,
                'A production API key was pasted into a public issue and access logs show it was used from an unknown IP.'
            );

            expect(result.success).toBe(true);
            expect(routes).toContain('security');
            expect(result.executionOrder).not.toContain('general');
            expect(branches).toEqual(
                expect.arrayContaining([
                    'containment',
                    'impact',
                    'communications',
                    '__merge__',
                ])
            );
            const report = JSON.parse(result.output);
            expect(['high', 'critical']).toContain(report.severity);
            expect(report.summary).toEqual(expect.any(String));
            expect(report.actions.length).toBeGreaterThanOrEqual(2);
            expect(result.modelCalls?.length).toBeGreaterThanOrEqual(6);
        }, 210_000);

        it('executes a two-level nested subflow and preserves scoped telemetry', async () => {
            const registry = new DefaultSubflowRegistry();
            const inner = workflow(
                'inner-normalizer',
                [
                    start(),
                    agent(
                        'inner-agent',
                        'Normalize the input to lowercase words separated by one hyphen. Return only the normalized text.'
                    ),
                ],
                [edge('start', 'inner-agent')]
            );
            registry.register({
                id: 'inner',
                name: 'Inner normalizer',
                inputs: [{ id: 'text', name: 'Text', type: 'string', required: true }],
                outputs: [{ id: 'value', name: 'Value', type: 'string' }],
                workflow: inner,
            });

            const outer = workflow(
                'outer-reviewer',
                [
                    start(),
                    node('inner-subflow', 'subflow', {
                        label: 'Inner normalizer',
                        subflowId: 'inner',
                        inputMappings: { text: '{{input}}' },
                        shareSession: true,
                    }),
                    agent(
                        'outer-agent',
                        'Return exactly NESTED_OK followed by a space and the normalized input.'
                    ),
                    output('outer-output', ['outer-agent']),
                ],
                [
                    edge('start', 'inner-subflow'),
                    edge('inner-subflow', 'outer-agent', 'output'),
                    edge('outer-agent', 'outer-output'),
                ]
            );
            registry.register({
                id: 'outer',
                name: 'Outer reviewer',
                inputs: [{ id: 'text', name: 'Text', type: 'string', required: true }],
                outputs: [{ id: 'value', name: 'Value', type: 'string' }],
                workflow: outer,
            });

            const parent = workflow(
                'nested-parent',
                [
                    start(),
                    node('outer-subflow', 'subflow', {
                        label: 'Outer reviewer',
                        subflowId: 'outer',
                        inputMappings: { text: '{{input}}' },
                        shareSession: true,
                    }),
                    output('output', ['outer-subflow']),
                ],
                [
                    edge('start', 'outer-subflow'),
                    edge('outer-subflow', 'output', 'output'),
                ]
            );
            const { result } = await run(
                'nested-subflows',
                parent,
                'Nested Workflow Value',
                { subflowRegistry: registry }
            );

            expect(result.success).toBe(true);
            expect(result.output).toContain('NESTED_OK');
            expect(result.output).toContain('nested-workflow-value');
            expect(result.modelCalls).toHaveLength(2);
            expect(new Set(result.modelCalls?.map((call) => call.callId)).size).toBe(2);
            expect(result.modelCalls?.every((call) => call.nodeId.startsWith('sf:'))).toBe(
                true
            );
            expect(result.costUsd).toBeDefined();
        }, 150_000);

        it('joins concurrent DAG agents and synthesizes both outputs without dropping a parent', async () => {
            const wf = workflow(
                'concurrent-join',
                [
                    start(),
                    agent(
                        'facts',
                        'Extract exactly three factual bullets. Include the word migration.'
                    ),
                    agent(
                        'actions',
                        'Create exactly three action bullets. Include the word rollback.'
                    ),
                    node('synthesis', 'output', {
                        label: 'Joined plan',
                        mode: 'synthesis',
                        format: 'markdown',
                        sources: ['facts', 'actions'],
                        synthesis: {
                            model: MODEL,
                            prompt:
                                'Create a concise plan with headings Facts and Actions. Preserve the words migration and rollback.',
                        },
                    }),
                ],
                [
                    edge('start', 'facts'),
                    edge('start', 'actions'),
                    edge('facts', 'synthesis', undefined, {
                        inputMapping: { mode: 'json', key: 'facts' },
                    }),
                    edge('actions', 'synthesis', undefined, {
                        inputMapping: { mode: 'json', key: 'actions' },
                    }),
                ]
            );
            const { result } = await run(
                'concurrent-join',
                wf,
                'The database migration is Friday. The rollback snapshot takes 20 minutes. Support must be notified before deployment.'
            );

            expect(result.success).toBe(true);
            expect(result.output.toLowerCase()).toContain('migration');
            expect(result.output.toLowerCase()).toContain('rollback');
            expect(result.executionOrder).toEqual([
                'start',
                'facts',
                'actions',
                'synthesis',
            ]);
            expect(result.modelCalls).toHaveLength(3);
            const [first, second] = result.modelCalls ?? [];
            expect(first.timing?.startedAt).toBeLessThan(second.timing?.completedAt ?? 0);
            expect(second.timing?.startedAt).toBeLessThan(first.timing?.completedAt ?? 0);
        }, 150_000);

        it('routes through a real local tool loop and uses the tool result downstream', async () => {
            const toolInputs: unknown[] = [];
            const wf = workflow(
                'tool-backed-support',
                [
                    start(),
                    agent(
                        'support-agent',
                        'You must call lookup_order for the requested order. Then answer with the status and ETA from the tool result only.',
                        {
                            tools: ['lookup_order'],
                            toolChoice: 'required',
                            maxToolIterations: 3,
                            maxTokens: 600,
                        }
                    ),
                    output('output', ['support-agent'], {
                        introText: 'Verified order status',
                    }),
                ],
                [edge('start', 'support-agent'), edge('support-agent', 'output')]
            );
            const { result } = await run(
                'tool-backed-support',
                wf,
                'Where is order 4812?',
                {
                    tools: [
                        {
                            type: 'function',
                            function: {
                                name: 'lookup_order',
                                description: 'Look up an order by numeric ID.',
                                parameters: {
                                    type: 'object',
                                    properties: {
                                        orderId: { type: 'string' },
                                    },
                                    required: ['orderId'],
                                    additionalProperties: false,
                                },
                            },
                            handler: async (input: unknown) => {
                                toolInputs.push(input);
                                return JSON.stringify({
                                    orderId: '4812',
                                    status: 'shipped',
                                    eta: 'Tuesday',
                                });
                            },
                        },
                    ],
                }
            );

            expect(result.success).toBe(true);
            expect(toolInputs).toHaveLength(1);
            expect(toolInputs[0]).toEqual(
                expect.objectContaining({ orderId: '4812' })
            );
            expect(result.output.toLowerCase()).toContain('shipped');
            expect(result.output.toLowerCase()).toContain('tuesday');
            expect(result.modelCalls?.length).toBeGreaterThanOrEqual(2);
        }, 150_000);

        it('routes invalid structured data to an explicit recovery path', async () => {
            const contract = {
                type: 'object',
                properties: {
                    ok: { type: 'boolean' },
                    value: { type: 'string' },
                },
                required: ['ok', 'value'],
                additionalProperties: false,
            };
            const wf = workflow(
                'validation-recovery',
                [
                    start(),
                    agent(
                        'bad-producer',
                        'Return exactly NOT_JSON and nothing else.'
                    ),
                    node('validate', 'schemaValidation', {
                        label: 'Validate producer',
                        onInvalid: 'route',
                        spec: {
                            schemaId: 'recovery_contract',
                            schemaVersion: 1,
                            strict: true,
                            jsonSchema: contract,
                        },
                    }),
                    agent(
                        'valid-path',
                        'Return exactly SHOULD_NOT_RUN.'
                    ),
                    agent(
                        'recovery',
                        'Return exactly RECOVERED_VALIDATION_FAILURE.'
                    ),
                    output('output', ['recovery']),
                ],
                [
                    edge('start', 'bad-producer'),
                    edge('bad-producer', 'validate'),
                    edge('validate', 'valid-path', 'output'),
                    edge('validate', 'recovery', 'invalid'),
                    edge('recovery', 'output'),
                ]
            );
            const { result } = await run(
                'validation-recovery',
                wf,
                'Produce a deliberately malformed payload.'
            );

            expect(result.success).toBe(true);
            expect(result.output).toContain('RECOVERED_VALIDATION_FAILURE');
            expect(result.executionOrder).toContain('recovery');
            expect(result.executionOrder).not.toContain('valid-path');
            expect(result.nodeOutputs.validate).toContain('valid JSON');
        }, 120_000);

        it('allows human review to replace model output before downstream nodes see it', async () => {
            const reviewRequests: Array<{
                mode: string;
                output?: string;
            }> = [];
            const wf = workflow(
                'human-review',
                [
                    start(),
                    agent(
                        'draft',
                        'Return exactly MACHINE_DRAFT_OUTPUT.',
                        {
                            hitl: {
                                enabled: true,
                                mode: 'review',
                                prompt: 'Review the generated draft.',
                            },
                        }
                    ),
                    output('output', ['draft']),
                ],
                [edge('start', 'draft'), edge('draft', 'output')]
            );
            const { result } = await run(
                'human-review',
                wf,
                'Create a draft.',
                {
                    onHITLRequest: async (request: any) => {
                        reviewRequests.push({
                            mode: request.mode,
                            output: request.context.output,
                        });
                        return {
                            requestId: request.id,
                            action: 'modify',
                            data: 'HUMAN_APPROVED_OUTPUT',
                            respondedBy: 'live-test',
                            respondedAt: new Date().toISOString(),
                        };
                    },
                }
            );

            expect(result.success).toBe(true);
            expect(reviewRequests).toHaveLength(1);
            expect(reviewRequests[0]?.mode).toBe('review');
            expect(reviewRequests[0]?.output).toEqual(expect.any(String));
            expect(reviewRequests[0]?.output?.length).toBeGreaterThan(0);
            expect(result.output.trim()).toBe('HUMAN_APPROVED_OUTPUT');
            expect(result.nodeOutputs.draft).toBe('HUMAN_APPROVED_OUTPUT');
        }, 120_000);
    }
);
