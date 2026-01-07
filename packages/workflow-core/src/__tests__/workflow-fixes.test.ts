/**
 * Tests for workflow issue fixes
 * Tests critical bug fixes identified in WORKFLOW_ISSUES_ANALYSIS.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterExecutionAdapter } from '../execution';
import { validateWorkflow } from '../validation';
import type {
    WorkflowData,
    ExecutionCallbacks,
    ExecutionInput,
    WorkflowNode,
    WorkflowEdge,
} from '../types';

// Mock OpenRouter client
const createMockClient = () => ({
    chat: {
        send: vi.fn(),
    },
});

describe('Workflow Issue Fixes', () => {
    let mockClient: ReturnType<typeof createMockClient>;
    let callbacks: ExecutionCallbacks;

    beforeEach(() => {
        mockClient = createMockClient();
        callbacks = {
            onNodeStart: vi.fn(),
            onNodeFinish: vi.fn(),
            onNodeError: vi.fn(),
            onToken: vi.fn(),
        };
    });

    describe('Issue #3: Infinite Loop Protection (Circuit Breaker)', () => {
        it.skip('should prevent infinite loops with per-node execution counter', async () => {
            // Create a simpler workflow that would loop via router
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'Loop Test' },
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
                            label: 'Agent',
                            model: 'test',
                            prompt: 'Test',
                        },
                    },
                    {
                        id: 'router-1',
                        type: 'router',
                        position: { x: 400, y: 0 },
                        data: {
                            label: 'Router',
                            prompt: 'Always route back',
                        },
                    },
                ],
                edges: [
                    { id: 'e1', source: 'start-1', target: 'agent-1' },
                    { id: 'e2', source: 'agent-1', target: 'router-1' },
                    {
                        id: 'e3',
                        source: 'router-1',
                        sourceHandle: 'loop',
                        target: 'agent-1',
                    }, // Creates loop
                ],
            };

            let callCount = 0;
            mockClient.chat.send.mockImplementation(() => {
                callCount++;
                // Simulate LLM response that always routes back (creating a loop)
                const content = callCount % 2 === 0 ? 'loop' : 'response';
                return (async function* () {
                    yield { choices: [{ delta: { content } }] };
                })();
            });

            const adapter = new OpenRouterExecutionAdapter(
                mockClient as any,
                {
                    maxNodeExecutions: 5, // Low limit to trigger quickly
                    maxIterations: 1000, // High limit so per-node limit triggers first
                    preflight: false, // Disable preflight to test runtime circuit breaker
                }
            );

            const input: ExecutionInput = { text: 'Test' };

            const result = await adapter.execute(workflow, input, callbacks);

            // Should fail due to circuit breaker, not run indefinitely
            expect(result.success).toBe(false);
            expect(result.error?.message).toContain(
                'exceeded maximum executions'
            );
        });

        it('should allow normal execution within limits', async () => {
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'Normal Test' },
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
                            label: 'Agent',
                            model: 'test',
                            prompt: 'Test',
                        },
                    },
                ],
                edges: [{ id: 'e1', source: 'start-1', target: 'agent-1' }],
            };

            mockClient.chat.send.mockResolvedValue(
                (async function* () {
                    yield { choices: [{ delta: { content: 'Hello' } }] };
                })()
            );

            const adapter = new OpenRouterExecutionAdapter(
                mockClient as any,
                {
                    maxNodeExecutions: 100,
                }
            );

            const input: ExecutionInput = { text: 'Test' };

            const result = await adapter.execute(workflow, input, callbacks);

            expect(result.success).toBe(true);
            expect(result.output).toBe('Hello');
        });
    });

    describe('Issue #5: Duplicate Source Handle Validation', () => {
        it('should warn about duplicate source handles', () => {
            const nodes: WorkflowNode[] = [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'router-1',
                    type: 'router',
                    position: { x: 100, y: 0 },
                    data: { label: 'Router' },
                },
                {
                    id: 'agent-1',
                    type: 'agent',
                    position: { x: 200, y: 0 },
                    data: { label: 'Agent 1', model: 'test', prompt: 'Test' },
                },
                {
                    id: 'agent-2',
                    type: 'agent',
                    position: { x: 200, y: 100 },
                    data: { label: 'Agent 2', model: 'test', prompt: 'Test' },
                },
            ];

            const edges: WorkflowEdge[] = [
                {
                    id: 'e0',
                    source: 'start-1',
                    target: 'router-1',
                },
                {
                    id: 'e1',
                    source: 'router-1',
                    sourceHandle: 'route-1',
                    target: 'agent-1',
                },
                {
                    id: 'e2',
                    source: 'router-1',
                    sourceHandle: 'route-1', // Duplicate!
                    target: 'agent-2',
                },
            ];

            const result = validateWorkflow(nodes, edges);

            expect(result.isValid).toBe(true); // Still valid, just a warning
            expect(result.warnings.length).toBeGreaterThan(0);

            const duplicateWarning = result.warnings.find(
                (w) => w.code === 'DUPLICATE_SOURCE_HANDLE'
            );
            expect(duplicateWarning).toBeDefined();
            expect(duplicateWarning?.message).toContain('route-1');
            expect(duplicateWarning?.message).toContain('ambiguous routing');
        });

        it('should not warn about different source handles', () => {
            const nodes: WorkflowNode[] = [
                {
                    id: 'start-1',
                    type: 'start',
                    position: { x: 0, y: 0 },
                    data: { label: 'Start' },
                },
                {
                    id: 'router-1',
                    type: 'router',
                    position: { x: 100, y: 0 },
                    data: { label: 'Router' },
                },
                {
                    id: 'agent-1',
                    type: 'agent',
                    position: { x: 200, y: 0 },
                    data: { label: 'Agent 1', model: 'test', prompt: 'Test' },
                },
                {
                    id: 'agent-2',
                    type: 'agent',
                    position: { x: 200, y: 100 },
                    data: { label: 'Agent 2', model: 'test', prompt: 'Test' },
                },
            ];

            const edges: WorkflowEdge[] = [
                {
                    id: 'e0',
                    source: 'start-1',
                    target: 'router-1',
                },
                {
                    id: 'e1',
                    source: 'router-1',
                    sourceHandle: 'route-1',
                    target: 'agent-1',
                },
                {
                    id: 'e2',
                    source: 'router-1',
                    sourceHandle: 'route-2', // Different handle
                    target: 'agent-2',
                },
            ];

            const result = validateWorkflow(nodes, edges);

            const duplicateWarning = result.warnings.find(
                (w) => w.code === 'DUPLICATE_SOURCE_HANDLE'
            );
            expect(duplicateWarning).toBeUndefined();
        });
    });

    describe('Issue #2: Parallel Node Timeout Protection', () => {
        it('should timeout slow branches and continue with others', async () => {
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'Parallel Timeout Test' },
                nodes: [
                    {
                        id: 'start-1',
                        type: 'start',
                        position: { x: 0, y: 0 },
                        data: { label: 'Start' },
                    },
                    {
                        id: 'parallel-1',
                        type: 'parallel',
                        position: { x: 200, y: 0 },
                        data: {
                            label: 'Parallel',
                            branches: [
                                {
                                    id: 'fast',
                                    label: 'Fast Branch',
                                    prompt: 'Fast',
                                },
                                {
                                    id: 'slow',
                                    label: 'Slow Branch',
                                    prompt: 'Slow',
                                },
                            ],
                            branchTimeout: 1000, // 1 second timeout
                        },
                    },
                ],
                edges: [{ id: 'e1', source: 'start-1', target: 'parallel-1' }],
            };

            // Mock fast branch
            const fastResponse = async function* () {
                yield { choices: [{ delta: { content: 'Fast response' } }] };
            };

            // Mock slow branch (will timeout)
            const slowResponse = new Promise((resolve) => {
                setTimeout(() => {
                    resolve(
                        (async function* () {
                            yield {
                                choices: [
                                    { delta: { content: 'Slow response' } },
                                ],
                            };
                        })()
                    );
                }, 5000); // 5 seconds - will timeout
            });

            let callCount = 0;
            mockClient.chat.send.mockImplementation(() => {
                callCount++;
                return callCount === 1 ? fastResponse() : slowResponse;
            });

            const adapter = new OpenRouterExecutionAdapter(mockClient as any);
            const input: ExecutionInput = { text: 'Test' };

            const result = await adapter.execute(workflow, input, callbacks);

            // Should complete successfully despite one branch timing out
            expect(result.success).toBe(true);
            // Output should include error about timeout
            expect(result.output).toContain('Fast response');
        }, 10000); // Increase test timeout
    });

    describe('Issue #6: Router Fallback Behavior', () => {
        it.skip('should support configurable fallback behavior - error mode', async () => {
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'Router Fallback Test' },
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
                            fallbackBehavior: 'error', // Should throw on invalid route
                        },
                    },
                    {
                        id: 'agent-1',
                        type: 'agent',
                        position: { x: 400, y: 0 },
                        data: {
                            label: 'Agent',
                            model: 'test',
                            prompt: 'Test',
                        },
                    },
                ],
                edges: [
                    { id: 'e1', source: 'start-1', target: 'router-1' },
                    {
                        id: 'e2',
                        source: 'router-1',
                        sourceHandle: 'route-1',
                        target: 'agent-1',
                    },
                ],
            };

            // Mock LLM to return invalid route
            mockClient.chat.send.mockResolvedValue(
                (async function* () {
                    yield {
                        choices: [{ delta: { content: 'invalid-route' } }],
                    };
                })()
            );

            const adapter = new OpenRouterExecutionAdapter(mockClient as any);
            const input: ExecutionInput = { text: 'Test' };

            const result = await adapter.execute(workflow, input, callbacks);

            expect(result.success).toBe(false);
            expect(result.error?.message).toContain(
                'failed to select a valid route'
            );
        });

        it.skip('should indicate fallback in metadata when using first route', async () => {
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'Router Metadata Test' },
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
                            fallbackBehavior: 'first', // Default fallback
                        },
                    },
                    {
                        id: 'agent-1',
                        type: 'agent',
                        position: { x: 400, y: 0 },
                        data: {
                            label: 'Agent',
                            model: 'test',
                            prompt: 'Test',
                        },
                    },
                ],
                edges: [
                    { id: 'e1', source: 'start-1', target: 'router-1' },
                    {
                        id: 'e2',
                        source: 'router-1',
                        sourceHandle: 'route-1',
                        target: 'agent-1',
                    },
                ],
            };

            // Track router events to check metadata
            const onRouteSelected = vi.fn();
            callbacks.onRouteSelected = onRouteSelected;

            // Mock LLM to return invalid route (will fallback to first)
            mockClient.chat.send.mockResolvedValue(
                (async function* () {
                    yield {
                        choices: [{ delta: { content: 'invalid' } }],
                    };
                    yield { choices: [{ delta: { content: 'response' } }] };
                })()
            );

            const adapter = new OpenRouterExecutionAdapter(mockClient as any);
            const input: ExecutionInput = { text: 'Test' };

            await adapter.execute(workflow, input, callbacks);

            // Check that fallback was indicated
            expect(onRouteSelected).toHaveBeenCalled();
            // The metadata should be available via node outputs or callbacks
        });
    });

    describe('Issue #1: While Loop Race Condition', () => {
        it.skip('should evaluate condition consistently with iteration state', async () => {
            const workflow: WorkflowData = {
                meta: { version: '2.0.0', name: 'While Loop Test' },
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
                            conditionPrompt:
                                'Should we continue? Respond done after 3 iterations.',
                            maxIterations: 10,
                        },
                    },
                    {
                        id: 'agent-1',
                        type: 'agent',
                        position: { x: 400, y: 0 },
                        data: {
                            label: 'Agent',
                            model: 'test',
                            prompt: 'Count',
                        },
                    },
                    {
                        id: 'output-1',
                        type: 'output',
                        position: { x: 600, y: 0 },
                        data: { label: 'Output' },
                    },
                ],
                edges: [
                    { id: 'e1', source: 'start-1', target: 'loop-1' },
                    {
                        id: 'e2',
                        source: 'loop-1',
                        sourceHandle: 'body',
                        target: 'agent-1',
                    },
                    { id: 'e3', source: 'agent-1', target: 'loop-1' },
                    {
                        id: 'e4',
                        source: 'loop-1',
                        sourceHandle: 'done',
                        target: 'output-1',
                    },
                ],
            };

            let conditionCallCount = 0;
            mockClient.chat.send.mockImplementation(() => {
                conditionCallCount++;
                // First 3 calls: continue, then done
                const response =
                    conditionCallCount <= 3 ? 'continue' : 'done';
                return (async function* () {
                    yield { choices: [{ delta: { content: response } }] };
                })();
            });

            const adapter = new OpenRouterExecutionAdapter(mockClient as any);
            const input: ExecutionInput = { text: 'Start' };

            const result = await adapter.execute(workflow, input, callbacks);

            expect(result.success).toBe(true);
            // With the fix, condition should be evaluated exactly once per iteration
            // Plus the initial check before first iteration
            expect(conditionCallCount).toBeLessThanOrEqual(5); // Should be around 4-5 calls
        });
    });
});
