import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../validation';
import type { WorkflowNode, WorkflowEdge, ValidationContext } from '../types';
import { DefaultSubflowRegistry } from '../subflow';

// Helper to create nodes
const startNode = (id = 'start-1'): WorkflowNode => ({
    id,
    type: 'start',
    position: { x: 0, y: 0 },
    data: { label: 'Start' },
});

const agentNode = (
    id: string,
    model = 'openai/gpt-4o-mini',
    prompt = 'Test'
): WorkflowNode => ({
    id,
    type: 'agent',
    position: { x: 200, y: 0 },
    data: { label: 'Agent', model, prompt },
});

const routerNode = (
    id: string,
    routes = [{ id: 'r1', label: 'Route 1' }]
): WorkflowNode => ({
    id,
    type: 'router',
    position: { x: 200, y: 0 },
    data: { label: 'Router', routes },
});

const subflowNode = (id: string, subflowId = 'test-subflow'): WorkflowNode => ({
    id,
    type: 'subflow',
    position: { x: 200, y: 0 },
    data: { label: 'Subflow', subflowId },
});

const whileLoopNode = (id: string): WorkflowNode => ({
    id,
    type: 'whileLoop',
    position: { x: 200, y: 0 },
    data: {
        label: 'Loop',
        conditionPrompt: 'Should continue?',
        maxIterations: 5,
        onMaxIterations: 'warning',
    },
});

const outputNode = (id: string): WorkflowNode => ({
    id,
    type: 'output',
    position: { x: 200, y: 0 },
    data: { label: 'Output' },
});

const edge = (
    source: string,
    target: string,
    id = `${source}-${target}`,
    sourceHandle?: string,
    targetHandle?: string
): WorkflowEdge => ({
    id,
    source,
    target,
    sourceHandle,
    targetHandle,
});

describe('validateWorkflow', () => {
    describe('start node validation', () => {
        it('should error when no start node exists', () => {
            const nodes: WorkflowNode[] = [agentNode('agent-1')];
            const edges: WorkflowEdge[] = [];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({ code: 'NO_START_NODE' })
            );
        });

        it('should error when multiple start nodes exist', () => {
            const nodes: WorkflowNode[] = [
                startNode('start-1'),
                startNode('start-2'),
            ];
            const edges: WorkflowEdge[] = [];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({ code: 'MULTIPLE_START_NODES' })
            );
        });

        it('should pass with exactly one start node', () => {
            const nodes: WorkflowNode[] = [startNode(), agentNode('agent-1')];
            const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.errors.filter((e) => e.code === 'NO_START_NODE')
            ).toHaveLength(0);
            expect(
                result.errors.filter((e) => e.code === 'MULTIPLE_START_NODES')
            ).toHaveLength(0);
        });
    });

    describe('connectivity validation', () => {
        it('should error when node is disconnected from start', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                agentNode('agent-1'),
                agentNode('agent-2'), // Disconnected
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'DISCONNECTED_NODE',
                    nodeId: 'agent-2',
                })
            );
        });

        it('should pass when all nodes are reachable', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                agentNode('agent-1'),
                agentNode('agent-2'),
            ];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'agent-1'),
                edge('agent-1', 'agent-2'),
            ];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.errors.filter((e) => e.code === 'DISCONNECTED_NODE')
            ).toHaveLength(0);
        });

        it('should handle branching workflows', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                routerNode('router-1'),
                agentNode('agent-1'),
                agentNode('agent-2'),
            ];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'router-1'),
                edge('router-1', 'agent-1'),
                edge('router-1', 'agent-2'),
            ];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.errors.filter((e) => e.code === 'DISCONNECTED_NODE')
            ).toHaveLength(0);
        });
    });

    describe('agent node validation', () => {
        it('should error when agent has no model', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                {
                    ...agentNode('agent-1'),
                    data: { label: 'Agent', model: '', prompt: 'Test' },
                },
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'MISSING_MODEL',
                    nodeId: 'agent-1',
                })
            );
        });

        it('should warn when agent has no prompt', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                {
                    ...agentNode('agent-1'),
                    data: { label: 'Agent', model: 'test', prompt: '' },
                },
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    code: 'EMPTY_PROMPT',
                    nodeId: 'agent-1',
                })
            );
        });

        it('should pass when agent has model and prompt', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                agentNode('agent-1', 'openai/gpt-4o-mini', 'You are helpful'),
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.errors.filter((e) => e.code === 'MISSING_MODEL')
            ).toHaveLength(0);
            expect(
                result.warnings.filter((w) => w.code === 'EMPTY_PROMPT')
            ).toHaveLength(0);
        });
    });

    describe('overall validation', () => {
        it('should return isValid=true for valid workflow', () => {
            const nodes: WorkflowNode[] = [startNode(), agentNode('agent-1')];
            const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should return isValid=false for invalid workflow', () => {
            const nodes: WorkflowNode[] = []; // No start node
            const edges: WorkflowEdge[] = [];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should collect multiple errors', () => {
            const nodes: WorkflowNode[] = [
                startNode('start-1'),
                startNode('start-2'), // Multiple starts
                {
                    ...agentNode('agent-1'),
                    data: { label: 'Agent', model: '', prompt: '' },
                }, // No model
                agentNode('agent-2'), // Disconnected
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'agent-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.errors.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe('empty workflow', () => {
        it('should handle empty workflow', () => {
            const result = validateWorkflow([], []);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContainEqual(
                expect.objectContaining({ code: 'NO_START_NODE' })
            );
        });
    });

    describe('edge handle validation', () => {
        it('should error on dangling edge (missing source node)', () => {
            const nodes: WorkflowNode[] = [startNode(), agentNode('agent-1')];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'agent-1'),
                edge('nonexistent', 'agent-1', 'bad-edge'),
            ];

            const result = validateWorkflow(nodes, edges);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'DANGLING_EDGE',
                    edgeId: 'bad-edge',
                })
            );
        });

        it('should error on dangling edge (missing target node)', () => {
            const nodes: WorkflowNode[] = [startNode(), agentNode('agent-1')];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'agent-1'),
                edge('agent-1', 'nonexistent', 'bad-edge'),
            ];

            const result = validateWorkflow(nodes, edges);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'DANGLING_EDGE',
                    edgeId: 'bad-edge',
                })
            );
        });

        it('should error on unknown sourceHandle', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                routerNode('router-1', [{ id: 'route-a', label: 'A' }]),
                agentNode('agent-1'),
            ];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'router-1'),
                edge('router-1', 'agent-1', 'r1-a1', 'nonexistent-route'),
            ];

            const result = validateWorkflow(nodes, edges);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'UNKNOWN_HANDLE',
                    edgeId: 'r1-a1',
                })
            );
        });

        it('should pass with valid sourceHandle', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                routerNode('router-1', [{ id: 'route-a', label: 'A' }]),
                agentNode('agent-1'),
            ];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'router-1'),
                edge('router-1', 'agent-1', 'r1-a1', 'route-a'),
            ];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.errors.filter((e) => e.code === 'UNKNOWN_HANDLE')
            ).toHaveLength(0);
        });

        it('should allow error handle on any node', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                agentNode('agent-1'),
                agentNode('error-handler'),
            ];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'agent-1'),
                edge('agent-1', 'error-handler', 'err-edge', 'error'),
            ];

            const result = validateWorkflow(nodes, edges);

            expect(
                result.errors.filter((e) => e.code === 'UNKNOWN_HANDLE')
            ).toHaveLength(0);
        });
    });

    describe('subflow validation', () => {
        it('should error when subflowId is missing', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                {
                    ...subflowNode('subflow-1'),
                    data: { label: 'Subflow', subflowId: '' },
                },
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'subflow-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'MISSING_SUBFLOW_ID',
                    nodeId: 'subflow-1',
                })
            );
        });

        it('should warn when subflow cannot be validated without registry', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                subflowNode('subflow-1', 'my-subflow'),
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'subflow-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.warnings).toContainEqual(
                expect.objectContaining({
                    code: 'NO_REGISTRY',
                    nodeId: 'subflow-1',
                })
            );
        });

        it('should error when subflow not found in registry', () => {
            const registry = new DefaultSubflowRegistry();
            const nodes: WorkflowNode[] = [
                startNode(),
                subflowNode('subflow-1', 'nonexistent'),
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'subflow-1')];

            const context: ValidationContext = { subflowRegistry: registry };
            const result = validateWorkflow(nodes, edges, context);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'SUBFLOW_NOT_FOUND',
                    nodeId: 'subflow-1',
                })
            );
        });

        it('should error when required input mapping is missing', () => {
            const registry = new DefaultSubflowRegistry();
            registry.register({
                id: 'my-subflow',
                name: 'My Subflow',
                inputs: [
                    {
                        id: 'text',
                        name: 'Text',
                        type: 'string',
                        required: true,
                    },
                ],
                outputs: [],
                workflow: {
                    meta: { version: '2.0.0', name: 'Test' },
                    nodes: [],
                    edges: [],
                },
            });

            const nodes: WorkflowNode[] = [
                startNode(),
                {
                    ...subflowNode('subflow-1', 'my-subflow'),
                    data: {
                        label: 'Subflow',
                        subflowId: 'my-subflow',
                        inputMappings: {},
                    },
                },
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'subflow-1')];

            const context: ValidationContext = { subflowRegistry: registry };
            const result = validateWorkflow(nodes, edges, context);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'MISSING_INPUT_MAPPING',
                    nodeId: 'subflow-1',
                })
            );
        });
    });

    describe('whileLoop validation', () => {
        it('should error when conditionPrompt is missing', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                {
                    ...whileLoopNode('loop-1'),
                    data: {
                        label: 'Loop',
                        conditionPrompt: '',
                        maxIterations: 5,
                        onMaxIterations: 'warning',
                    },
                },
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'loop-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'MISSING_CONDITION_PROMPT',
                    nodeId: 'loop-1',
                })
            );
        });

        it('should error when maxIterations is invalid', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                {
                    ...whileLoopNode('loop-1'),
                    data: {
                        label: 'Loop',
                        conditionPrompt: 'Test',
                        maxIterations: 0,
                        onMaxIterations: 'warning',
                    },
                },
            ];
            const edges: WorkflowEdge[] = [edge('start-1', 'loop-1')];

            const result = validateWorkflow(nodes, edges);

            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'INVALID_MAX_ITERATIONS',
                    nodeId: 'loop-1',
                })
            );
        });
    });

    describe('extension validator integration', () => {
        it('should run extension validators for all node types', () => {
            const nodes: WorkflowNode[] = [
                startNode(),
                {
                    ...agentNode('agent-1'),
                    data: { label: 'Agent', model: '', prompt: '' },
                },
                {
                    ...routerNode('router-1'),
                    data: { label: 'Router', routes: [] },
                },
            ];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'agent-1'),
                edge('agent-1', 'router-1'),
            ];

            const result = validateWorkflow(nodes, edges);

            // Agent should have MISSING_MODEL error
            expect(result.errors).toContainEqual(
                expect.objectContaining({
                    code: 'MISSING_MODEL',
                    nodeId: 'agent-1',
                })
            );
        });
    });

    describe('validation context', () => {
        it('should pass context to extension validators', () => {
            const registry = new DefaultSubflowRegistry();
            registry.register({
                id: 'valid-subflow',
                name: 'Valid Subflow',
                inputs: [],
                outputs: [{ id: 'out', name: 'Output', type: 'string' }],
                workflow: {
                    meta: { version: '2.0.0', name: 'Test' },
                    nodes: [],
                    edges: [],
                },
            });

            const nodes: WorkflowNode[] = [
                startNode(),
                subflowNode('subflow-1', 'valid-subflow'),
                outputNode('output-1'),
            ];
            const edges: WorkflowEdge[] = [
                edge('start-1', 'subflow-1'),
                edge('subflow-1', 'output-1'),
            ];

            const context: ValidationContext = { subflowRegistry: registry };
            const result = validateWorkflow(nodes, edges, context);

            // Should not have SUBFLOW_NOT_FOUND error since it exists in registry
            expect(
                result.errors.filter((e) => e.code === 'SUBFLOW_NOT_FOUND')
            ).toHaveLength(0);
        });
    });
});
