import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentNodeExtension } from '../extensions/AgentNodeExtension';
import type {
    WorkflowNode,
    ExecutionContext,
    LLMProvider,
    ChatMessage,
    ToolDefinition,
} from '../types';
import type { HITLResponse } from '../hitl';
import { InMemoryAdapter } from '../memory';

// Helper to create a mock provider
function createMockProvider(options: {
    responses?: Array<{
        content: string;
        toolCalls?: Array<{
            function: { name: string; arguments: string };
        }>;
    }>;
}): LLMProvider {
    let callIndex = 0;
    const responses = options.responses || [{ content: 'Default response' }];

    return {
        chat: vi.fn().mockImplementation(async () => {
            const response =
                responses[callIndex] || responses[responses.length - 1];
            callIndex++;
            return response;
        }),
        getModelCapabilities: vi.fn().mockResolvedValue({
            id: 'test-model',
            name: 'Test Model',
            inputModalities: ['text'],
            outputModalities: ['text'],
            contextLength: 4096,
            supportedParameters: [],
        }),
    };
}

// Helper to create a minimal execution context
function createMockContext(
    overrides: Partial<ExecutionContext> = {}
): ExecutionContext {
    return {
        input: 'test input',
        history: [],
        memory: new InMemoryAdapter(),
        outputs: {},
        nodeChain: [],
        getNode: vi.fn(),
        getOutgoingEdges: vi.fn().mockReturnValue([]),
        ...overrides,
    };
}

// Helper to create a test agent node
function createAgentNode(dataOverrides: Partial<any> = {}): WorkflowNode {
    return {
        id: 'agent-1',
        type: 'agent',
        position: { x: 0, y: 0 },
        data: {
            label: 'Test Agent',
            model: 'test-model',
            prompt: 'You are a test assistant',
            ...dataOverrides,
        },
    };
}

describe('AgentNodeExtension tool iterations', () => {
    describe('maxToolIterations configuration', () => {
        it('should use node-level maxToolIterations over context-level', async () => {
            // Provider that always returns tool calls (until we hit the limit)
            const provider = createMockProvider({
                responses: [
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    { content: 'Final response' },
                ],
            });

            const node = createAgentNode({
                maxToolIterations: 2, // Node-level setting
                tools: ['test_tool'],
            });

            const context = createMockContext({
                maxToolIterations: 10, // Context-level setting (should be ignored)
                tools: [
                    {
                        type: 'function',
                        function: { name: 'test_tool', parameters: {} },
                        handler: async () => 'tool result',
                    },
                ],
            });

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            // Should have hit the limit at 2 iterations (node-level)
            expect(result.output).toContain(
                'Maximum tool iterations (2) reached'
            );
            // Provider should have been called 2 times (hitting limit)
            expect(provider.chat).toHaveBeenCalledTimes(2);
        });

        it('should use context-level maxToolIterations when node has none', async () => {
            const provider = createMockProvider({
                responses: [
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    { content: 'Final response' },
                ],
            });

            const node = createAgentNode({
                // No maxToolIterations set
                tools: ['test_tool'],
            });

            const context = createMockContext({
                maxToolIterations: 3, // Context-level setting
                tools: [
                    {
                        type: 'function',
                        function: { name: 'test_tool', parameters: {} },
                        handler: async () => 'tool result',
                    },
                ],
            });

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            // Should have hit the limit at 3 iterations (context-level)
            expect(result.output).toContain(
                'Maximum tool iterations (3) reached'
            );
            expect(provider.chat).toHaveBeenCalledTimes(3);
        });

        it('should use default (10) when neither node nor context specifies', async () => {
            // We won't actually test 10 iterations, just verify the warning message
            const provider = createMockProvider({
                responses: Array(11).fill({
                    content: '',
                    toolCalls: [
                        { function: { name: 'test_tool', arguments: '{}' } },
                    ],
                }),
            });

            const node = createAgentNode({
                tools: ['test_tool'],
            });

            const context = createMockContext({
                tools: [
                    {
                        type: 'function',
                        function: { name: 'test_tool', parameters: {} },
                        handler: async () => 'tool result',
                    },
                ],
            });

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            // Should have hit the default limit of 10
            expect(result.output).toContain(
                'Maximum tool iterations (10) reached'
            );
            expect(provider.chat).toHaveBeenCalledTimes(10);
        });
    });

    describe('onMaxToolIterations modes', () => {
        it('should throw on error mode', async () => {
            const provider = createMockProvider({
                responses: [
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                ],
            });

            const node = createAgentNode({
                maxToolIterations: 1,
                onMaxToolIterations: 'error',
                tools: ['test_tool'],
            });

            const context = createMockContext({
                tools: [
                    {
                        type: 'function',
                        function: { name: 'test_tool', parameters: {} },
                        handler: async () => 'tool result',
                    },
                ],
            });

            await expect(
                AgentNodeExtension.execute!(context, node, provider)
            ).rejects.toThrow(
                'Maximum tool iterations (1) reached. Execution stopped.'
            );
        });

        it('should add warning on default (warning) mode', async () => {
            const provider = createMockProvider({
                responses: [
                    {
                        content: 'partial',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    {
                        content: 'still going',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                ],
            });

            const node = createAgentNode({
                maxToolIterations: 1,
                // No onMaxToolIterations set - defaults to 'warning'
                tools: ['test_tool'],
            });

            const context = createMockContext({
                tools: [
                    {
                        type: 'function',
                        function: { name: 'test_tool', parameters: {} },
                        handler: async () => 'tool result',
                    },
                ],
            });

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            expect(result.output).toContain(
                'Warning: Maximum tool iterations (1) reached'
            );
        });

        it('should trigger HITL and continue on approve', async () => {
            let hitlCallCount = 0;
            const mockHITL = vi
                .fn()
                .mockImplementation(async (request): Promise<HITLResponse> => {
                    hitlCallCount++;
                    return {
                        requestId: request.id,
                        action: 'approve',
                        respondedAt: new Date().toISOString(),
                    };
                });

            const provider = createMockProvider({
                responses: [
                    // First round - hits limit
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    // After HITL approval - completes
                    { content: 'Final response after HITL' },
                ],
            });

            const node = createAgentNode({
                maxToolIterations: 1,
                onMaxToolIterations: 'hitl',
                tools: ['test_tool'],
            });

            const context = createMockContext({
                onHITLRequest: mockHITL,
                workflowName: 'Test Workflow',
                tools: [
                    {
                        type: 'function',
                        function: { name: 'test_tool', parameters: {} },
                        handler: async () => 'tool result',
                    },
                ],
            });

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            // HITL should have been called
            expect(mockHITL).toHaveBeenCalledTimes(1);
            expect(mockHITL).toHaveBeenCalledWith(
                expect.objectContaining({
                    mode: 'approval',
                    prompt: expect.stringContaining(
                        'maximum tool iterations limit'
                    ),
                })
            );

            // Should have continued after approval
            expect(result.output).toBe('Final response after HITL');
        });

        it('should stop with message on HITL reject', async () => {
            const mockHITL = vi
                .fn()
                .mockImplementation(async (request): Promise<HITLResponse> => {
                    return {
                        requestId: request.id,
                        action: 'reject',
                        respondedAt: new Date().toISOString(),
                    };
                });

            const provider = createMockProvider({
                responses: [
                    {
                        content: 'Last content before limit',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                ],
            });

            const node = createAgentNode({
                maxToolIterations: 1,
                onMaxToolIterations: 'hitl',
                tools: ['test_tool'],
            });

            const context = createMockContext({
                onHITLRequest: mockHITL,
                workflowName: 'Test Workflow',
                tools: [
                    {
                        type: 'function',
                        function: { name: 'test_tool', parameters: {} },
                        handler: async () => 'tool result',
                    },
                ],
            });

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            // HITL should have been called
            expect(mockHITL).toHaveBeenCalledTimes(1);

            // Should contain rejection message
            expect(result.output).toContain('Tool iteration stopped by user');
        });

        it('should fall back to warning when HITL mode but no callback', async () => {
            const provider = createMockProvider({
                responses: [
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'test_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                ],
            });

            const node = createAgentNode({
                maxToolIterations: 1,
                onMaxToolIterations: 'hitl', // HITL mode but...
                tools: ['test_tool'],
            });

            const context = createMockContext({
                // No onHITLRequest callback provided
                tools: [
                    {
                        type: 'function',
                        function: { name: 'test_tool', parameters: {} },
                        handler: async () => 'tool result',
                    },
                ],
            });

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            // Should fall back to warning mode
            expect(result.output).toContain(
                'Warning: Maximum tool iterations (1) reached'
            );
        });
    });

    describe('tool execution', () => {
        it('should complete normally when no tool calls are made', async () => {
            const provider = createMockProvider({
                responses: [{ content: 'Simple response without tools' }],
            });

            const node = createAgentNode({});
            const context = createMockContext({});

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            expect(result.output).toBe('Simple response without tools');
            expect(provider.chat).toHaveBeenCalledTimes(1);
        });

        it('should execute tool handlers and include results', async () => {
            const toolHandler = vi
                .fn()
                .mockResolvedValue('Tool executed successfully');

            const provider = createMockProvider({
                responses: [
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'my_tool',
                                    arguments: '{"param": "value"}',
                                },
                            },
                        ],
                    },
                    { content: 'Final response using tool result' },
                ],
            });

            const node = createAgentNode({
                tools: ['my_tool'],
            });

            const context = createMockContext({
                tools: [
                    {
                        type: 'function',
                        function: {
                            name: 'my_tool',
                            description: 'A test tool',
                            parameters: { type: 'object' },
                        },
                        handler: toolHandler,
                    },
                ],
            });

            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );

            // Tool handler should have been called with parsed arguments
            expect(toolHandler).toHaveBeenCalledWith({ param: 'value' });
            expect(result.output).toBe('Final response using tool result');
        });

        it('should handle tool errors gracefully', async () => {
            const failingHandler = vi
                .fn()
                .mockRejectedValue(new Error('Tool failed'));

            const provider = createMockProvider({
                responses: [
                    {
                        content: '',
                        toolCalls: [
                            {
                                function: {
                                    name: 'failing_tool',
                                    arguments: '{}',
                                },
                            },
                        ],
                    },
                    { content: 'Response after tool error' },
                ],
            });

            const node = createAgentNode({
                tools: ['failing_tool'],
            });

            const context = createMockContext({
                tools: [
                    {
                        type: 'function',
                        function: { name: 'failing_tool', parameters: {} },
                        handler: failingHandler,
                    },
                ],
            });

            // Should not throw, should handle gracefully
            const result = await AgentNodeExtension.execute!(
                context,
                node,
                provider
            );
            expect(result.output).toBe('Response after tool error');
        });
    });
});
