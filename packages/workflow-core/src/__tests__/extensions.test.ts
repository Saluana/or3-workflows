import { describe, it, expect } from 'vitest';
import {
    StartNodeExtension,
    AgentNodeExtension,
    RouterNodeExtension,
    ParallelNodeExtension,
    ToolNodeExtension,
    WhileLoopExtension,
} from '../extensions/index.js';
import type { WorkflowNode, WorkflowEdge } from '../types';

// Helper to create nodes
const createNode = (type: string, id: string, data: any): WorkflowNode => ({
    id,
    type,
    position: { x: 0, y: 0 },
    data,
});

const createEdge = (
    source: string,
    target: string,
    sourceHandle?: string
): WorkflowEdge => ({
    id: `${source}-${target}`,
    source,
    target,
    sourceHandle,
});

describe('StartNodeExtension', () => {
    it('should have correct name and type', () => {
        expect(StartNodeExtension.name).toBe('start');
        expect(StartNodeExtension.type).toBe('node');
    });

    it('should have no inputs', () => {
        expect(StartNodeExtension.inputs).toHaveLength(0);
    });

    it('should have one output', () => {
        expect(StartNodeExtension.outputs).toHaveLength(1);
        expect(StartNodeExtension.outputs![0].id).toBe('output');
    });

    it('should have default data', () => {
        expect(StartNodeExtension.defaultData).toEqual({ label: 'Start' });
    });

    describe('validate', () => {
        it('should error if start node has no outgoing edges', () => {
            const node = createNode('start', 'start-1', { label: 'Start' });
            const edges: WorkflowEdge[] = [];

            const errors = StartNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({ code: 'DISCONNECTED_NODE' })
            );
        });

        it('should pass if start node has outgoing edges', () => {
            const node = createNode('start', 'start-1', { label: 'Start' });
            const edges = [createEdge('start-1', 'agent-1')];

            const errors = StartNodeExtension.validate!(node, edges);

            expect(
                errors.filter((e) => e.code === 'DISCONNECTED_NODE')
            ).toHaveLength(0);
        });
    });

    describe('execute', () => {
        it('should pass through input', async () => {
            const context = {
                node: createNode('start', 'start-1', { label: 'Start' }),
                input: 'Hello world',
                originalInput: 'Hello world',
                attachments: [],
                history: [],
                outputs: {},
                nodeChain: [],
                signal: new AbortController().signal,
            };

            const result = await StartNodeExtension.execute!(context);

            expect(result.output).toBe('Hello world');
        });
    });
});

describe('WhileLoopExtension', () => {
    it('should expose body and exit outputs', () => {
        const outputs = WhileLoopExtension.outputs || [];
        expect(outputs.map((o) => o.id)).toEqual(
            expect.arrayContaining(['body', 'done'])
        );
    });

    it('validates missing prompt and invalid iterations', () => {
        const node = createNode('whileLoop', 'loop-1', {
            label: 'Loop',
            conditionPrompt: '',
            maxIterations: 0,
            onMaxIterations: 'warning',
        });
        const edges: WorkflowEdge[] = [];
        const errors = WhileLoopExtension.validate!(node, edges);

        expect(errors).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ code: 'MISSING_CONDITION_PROMPT' }),
                expect.objectContaining({ code: 'INVALID_MAX_ITERATIONS' }),
                expect.objectContaining({ code: 'MISSING_BODY' }),
                expect.objectContaining({ code: 'MISSING_EXIT' }),
            ])
        );
    });
});

describe('AgentNodeExtension', () => {
    it('should have correct name and type', () => {
        expect(AgentNodeExtension.name).toBe('agent');
        expect(AgentNodeExtension.type).toBe('node');
    });

    it('should have one input', () => {
        expect(AgentNodeExtension.inputs).toHaveLength(1);
        expect(AgentNodeExtension.inputs![0].id).toBe('input');
    });

    it('should have primary output and error handle', () => {
        const ids = (AgentNodeExtension.outputs || []).map((o) => o.id);
        expect(ids).toEqual(expect.arrayContaining(['output', 'error']));
    });

    it('should have default data with model', () => {
        expect(AgentNodeExtension.defaultData).toMatchObject({
            label: 'Agent',
            model: 'openai/gpt-4o-mini',
            prompt: '',
        });
    });

    describe('validate', () => {
        it('should error if agent has no model', () => {
            const node = createNode('agent', 'agent-1', {
                label: 'Agent',
                model: '',
                prompt: 'Test',
            });
            const edges = [createEdge('start-1', 'agent-1')];

            const errors = AgentNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({ code: 'MISSING_MODEL' })
            );
        });

        it('should warn if agent has no prompt', () => {
            const node = createNode('agent', 'agent-1', {
                label: 'Agent',
                model: 'test',
                prompt: '',
            });
            const edges = [createEdge('start-1', 'agent-1')];

            const errors = AgentNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({
                    code: 'EMPTY_PROMPT',
                    type: 'warning',
                })
            );
        });

        it('should error if agent has no incoming edges', () => {
            const node = createNode('agent', 'agent-1', {
                label: 'Agent',
                model: 'test',
                prompt: 'Test',
            });
            const edges: WorkflowEdge[] = [];

            const errors = AgentNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({ code: 'DISCONNECTED_NODE' })
            );
        });

        it('should pass for valid agent', () => {
            const node = createNode('agent', 'agent-1', {
                label: 'Agent',
                model: 'test',
                prompt: 'Test',
            });
            const edges = [createEdge('start-1', 'agent-1')];

            const errors = AgentNodeExtension.validate!(node, edges);

            expect(errors.filter((e) => e.type === 'error')).toHaveLength(0);
        });
    });
});

describe('RouterNodeExtension', () => {
    it('should have correct name and type', () => {
        expect(RouterNodeExtension.name).toBe('router');
        expect(RouterNodeExtension.type).toBe('node');
    });

    it('should have default routes', () => {
        expect(RouterNodeExtension.defaultData?.routes).toHaveLength(2);
    });

    describe('validate', () => {
        it('should error if router has no routes', () => {
            const node = createNode('router', 'router-1', {
                label: 'Router',
                routes: [],
            });
            const edges = [createEdge('start-1', 'router-1')];

            const errors = RouterNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({ code: 'MISSING_REQUIRED_PORT' })
            );
        });

        it('should warn if route has no connected node', () => {
            const node = createNode('router', 'router-1', {
                label: 'Router',
                routes: [{ id: 'route-1', label: 'Route 1' }],
            });
            const edges = [createEdge('start-1', 'router-1')];

            const errors = RouterNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({
                    code: 'MISSING_EDGE_LABEL',
                    type: 'warning',
                })
            );
        });
    });

    describe('getDynamicOutputs', () => {
        it('should return outputs based on routes', () => {
            const node = createNode('router', 'router-1', {
                label: 'Router',
                routes: [
                    { id: 'route-a', label: 'Technical' },
                    { id: 'route-b', label: 'General' },
                ],
            });

            const outputs = RouterNodeExtension.getDynamicOutputs!(node);

            expect(outputs).toHaveLength(2);
            expect(outputs[0]).toEqual({ id: 'route-a', label: 'Technical' });
            expect(outputs[1]).toEqual({ id: 'route-b', label: 'General' });
        });
    });
});

describe('ParallelNodeExtension', () => {
    it('should have correct name and type', () => {
        expect(ParallelNodeExtension.name).toBe('parallel');
        expect(ParallelNodeExtension.type).toBe('node');
    });

    it('should have default branches', () => {
        expect(ParallelNodeExtension.defaultData?.branches).toHaveLength(2);
    });

    describe('validate', () => {
        it('should warn if parallel has less than 2 branches', () => {
            const node = createNode('parallel', 'parallel-1', {
                label: 'Parallel',
                branches: [{ id: 'branch-1', label: 'Branch 1' }],
            });
            const edges = [createEdge('start-1', 'parallel-1')];

            const errors = ParallelNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({ type: 'warning' })
            );
        });

        it('should warn if no merge prompt', () => {
            const node = createNode('parallel', 'parallel-1', {
                label: 'Parallel',
                branches: [
                    { id: 'branch-1', label: 'Branch 1' },
                    { id: 'branch-2', label: 'Branch 2' },
                ],
                prompt: '',
            });
            const edges = [createEdge('start-1', 'parallel-1')];

            const errors = ParallelNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({
                    code: 'EMPTY_PROMPT',
                    type: 'warning',
                })
            );
        });
    });

    describe('getDynamicOutputs', () => {
        it('should return outputs based on branches', () => {
            const node = createNode('parallel', 'parallel-1', {
                label: 'Parallel',
                branches: [
                    { id: 'branch-a', label: 'Research' },
                    { id: 'branch-b', label: 'Analysis' },
                ],
            });

            const outputs = ParallelNodeExtension.getDynamicOutputs!(node);

            expect(outputs).toHaveLength(2);
            expect(outputs[0]).toEqual({ id: 'branch-a', label: 'Research' });
            expect(outputs[1]).toEqual({ id: 'branch-b', label: 'Analysis' });
        });
    });
});

describe('ToolNodeExtension', () => {
    it('should have correct name and type', () => {
        expect(ToolNodeExtension.name).toBe('tool');
        expect(ToolNodeExtension.type).toBe('node');
    });

    it('should have default data', () => {
        expect(ToolNodeExtension.defaultData).toMatchObject({
            label: 'Tool',
            toolId: '',
        });
    });

    describe('validate', () => {
        it('should error if tool has no toolId', () => {
            const node = createNode('tool', 'tool-1', {
                label: 'Tool',
                toolId: '',
            });
            const edges = [createEdge('start-1', 'tool-1')];

            const errors = ToolNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({ code: 'MISSING_REQUIRED_PORT' })
            );
        });

        it('should error if tool has no incoming edges', () => {
            const node = createNode('tool', 'tool-1', {
                label: 'Tool',
                toolId: 'my-tool',
            });
            const edges: WorkflowEdge[] = [];

            const errors = ToolNodeExtension.validate!(node, edges);

            expect(errors).toContainEqual(
                expect.objectContaining({ code: 'DISCONNECTED_NODE' })
            );
        });
    });

    describe('execute', () => {
        it('should return error if no toolId', async () => {
            const context = {
                node: createNode('tool', 'tool-1', {
                    label: 'Tool',
                    toolId: '',
                }),
                input: 'test',
                originalInput: 'test',
                attachments: [],
                history: [],
                outputs: {},
                nodeChain: [],
                signal: new AbortController().signal,
            };

            const result = await ToolNodeExtension.execute!(context);

            expect(result.error).toBe('No tool configured');
        });
    });
});

// ============================================================================
// TipTap-style Extension Architecture Tests
// ============================================================================

import {
    createConfigurableExtension,
    makeConfigurable,
    isConfigurableExtension,
} from '../extensions/configure';

import { StarterKit } from '../extensions/StarterKit';

describe('createConfigurableExtension', () => {
    it('should create a configurable extension with defaults', () => {
        const MyExtension = createConfigurableExtension({
            name: 'test',
            type: 'node',
            defaultOptions: { maxItems: 10, enabled: true },
            defaultData: { label: 'Test Node' },
        });

        expect(MyExtension.name).toBe('test');
        expect(MyExtension.type).toBe('node');
        expect(MyExtension.defaultOptions).toEqual({
            maxItems: 10,
            enabled: true,
        });
        expect(MyExtension.options).toEqual({ maxItems: 10, enabled: true });
        expect(MyExtension.defaultData).toEqual({ label: 'Test Node' });
    });

    it('should support configure() method to override options', () => {
        const MyExtension = createConfigurableExtension({
            name: 'test',
            type: 'node',
            defaultOptions: { maxItems: 10, enabled: true },
        });

        const configured = MyExtension.configure({ maxItems: 20 });

        expect(configured.options).toEqual({ maxItems: 20, enabled: true });
        expect(configured.defaultOptions).toEqual({
            maxItems: 10,
            enabled: true,
        });
    });

    it('should allow chained configure() calls', () => {
        const MyExtension = createConfigurableExtension({
            name: 'test',
            type: 'node',
            defaultOptions: { a: 1, b: 2, c: 3 },
        });

        const configured = MyExtension.configure({ a: 10 }).configure({
            b: 20,
        });

        expect(configured.options).toEqual({ a: 10, b: 20, c: 3 });
    });

    it('should preserve other extension properties', () => {
        const validate = () => [];
        const MyExtension = createConfigurableExtension({
            name: 'test',
            type: 'node',
            defaultOptions: {},
            inputs: [
                { id: 'input', type: 'input', label: 'Input', dataType: 'any' },
            ],
            outputs: [
                {
                    id: 'output',
                    type: 'output',
                    label: 'Output',
                    dataType: 'any',
                },
            ],
            validate,
        });

        expect(MyExtension.inputs).toHaveLength(1);
        expect(MyExtension.outputs).toHaveLength(1);
        expect(MyExtension.validate).toBe(validate);

        const configured = MyExtension.configure({});
        expect(configured.inputs).toHaveLength(1);
        expect(configured.outputs).toHaveLength(1);
        expect(configured.validate).toBe(validate);
    });

    it('should support onCreate lifecycle with options', () => {
        let receivedOptions: any = null;
        const MyExtension = createConfigurableExtension({
            name: 'test',
            type: 'node',
            defaultOptions: { value: 42 },
            onCreate: (options) => {
                receivedOptions = options;
            },
        });

        const configured = MyExtension.configure({ value: 100 });
        configured.onCreate?.();

        expect(receivedOptions).toEqual({ value: 100 });
    });
});

describe('makeConfigurable', () => {
    it('should add configure() to existing extension', () => {
        const ConfigurableAgent = makeConfigurable(AgentNodeExtension, {
            defaultModel: 'openai/gpt-4o',
        });

        expect(ConfigurableAgent.name).toBe('agent');
        expect(ConfigurableAgent.defaultOptions).toEqual({
            defaultModel: 'openai/gpt-4o',
        });
        expect(typeof ConfigurableAgent.configure).toBe('function');
    });

    it('should allow configuration of wrapped extension', () => {
        const ConfigurableAgent = makeConfigurable(AgentNodeExtension, {
            defaultModel: 'openai/gpt-4o',
            streamByDefault: true,
        });

        const configured = ConfigurableAgent.configure({
            defaultModel: 'anthropic/claude-3-opus',
        });

        expect(configured.options).toEqual({
            defaultModel: 'anthropic/claude-3-opus',
            streamByDefault: true,
        });
    });

    it('should preserve original extension properties', () => {
        const ConfigurableAgent = makeConfigurable(AgentNodeExtension, {});

        expect(ConfigurableAgent.inputs).toEqual(AgentNodeExtension.inputs);
        expect(ConfigurableAgent.outputs).toEqual(AgentNodeExtension.outputs);
        expect(ConfigurableAgent.defaultData).toEqual(
            AgentNodeExtension.defaultData
        );
        expect(ConfigurableAgent.validate).toBe(AgentNodeExtension.validate);
    });
});

describe('isConfigurableExtension', () => {
    it('should return true for configurable extensions', () => {
        const MyExtension = createConfigurableExtension({
            name: 'test',
            type: 'node',
            defaultOptions: {},
        });

        expect(isConfigurableExtension(MyExtension)).toBe(true);
    });

    it('should return true for makeConfigurable extensions', () => {
        const ConfigurableAgent = makeConfigurable(AgentNodeExtension, {});
        expect(isConfigurableExtension(ConfigurableAgent)).toBe(true);
    });

    it('should return false for regular extensions', () => {
        expect(isConfigurableExtension(AgentNodeExtension)).toBe(false);
        expect(isConfigurableExtension(StartNodeExtension)).toBe(false);
    });
});

describe('StarterKit', () => {
    describe('configure()', () => {
        it('should return all extensions with default options', () => {
            const extensions = StarterKit.configure();

            expect(extensions.length).toBe(9);

            const names = extensions.map((ext) => ext.name);
            expect(names).toContain('start');
            expect(names).toContain('agent');
            expect(names).toContain('router');
            expect(names).toContain('parallel');
            expect(names).toContain('tool');
            expect(names).toContain('whileLoop');
            expect(names).toContain('memory');
            expect(names).toContain('subflow');
            expect(names).toContain('output');
        });

        it('should always include start node', () => {
            const extensions = StarterKit.configure({
                start: false, // Should be ignored
                agent: false,
                router: false,
                parallel: false,
                tool: false,
                whileLoop: false,
                memory: false,
                subflow: false,
                output: false,
            });

            const names = extensions.map((ext) => ext.name);
            expect(names).toContain('start');
            expect(extensions.length).toBe(1);
        });

        it('should exclude disabled extensions', () => {
            const extensions = StarterKit.configure({
                whileLoop: false,
                memory: false,
            });

            const names = extensions.map((ext) => ext.name);
            expect(names).not.toContain('whileLoop');
            expect(names).not.toContain('memory');
            expect(extensions.length).toBe(7);
        });

        it('should configure agent with custom model', () => {
            const extensions = StarterKit.configure({
                agent: {
                    defaultModel: 'anthropic/claude-3-opus',
                },
            });

            const agentExt = extensions.find((ext) => ext.name === 'agent');
            expect(agentExt).toBeDefined();
            expect(agentExt?.defaultData?.model).toBe(
                'anthropic/claude-3-opus'
            );
        });

        it('should configure whileLoop with custom options', () => {
            const extensions = StarterKit.configure({
                whileLoop: {
                    defaultMaxIterations: 50,
                    defaultOnMaxIterations: 'error',
                },
            });

            const loopExt = extensions.find((ext) => ext.name === 'whileLoop');
            expect(loopExt).toBeDefined();
            expect(loopExt?.defaultData?.maxIterations).toBe(50);
            expect(loopExt?.defaultData?.onMaxIterations).toBe('error');
        });

        it('should configure subflow with storage options', () => {
            const extensions = StarterKit.configure({
                subflow: {
                    maxNestingDepth: 5,
                },
            });

            const subflowExt = extensions.find((ext) => ext.name === 'subflow');
            expect(subflowExt).toBeDefined();
            expect(subflowExt?.storage?.maxNestingDepth).toBe(5);
        });

        it('should work with empty options', () => {
            const extensions = StarterKit.configure({});
            expect(extensions.length).toBe(9);
        });
    });

    describe('getAvailableExtensions()', () => {
        it('should return all available extension names', () => {
            const names = StarterKit.getAvailableExtensions();

            expect(names).toEqual([
                'start',
                'agent',
                'router',
                'parallel',
                'tool',
                'whileLoop',
                'memory',
                'subflow',
                'output',
            ]);
        });
    });

    describe('getDefaultOptions()', () => {
        it('should return default options with all extensions enabled', () => {
            const defaults = StarterKit.getDefaultOptions();

            expect(defaults).toEqual({
                start: true,
                agent: true,
                router: true,
                parallel: true,
                tool: true,
                whileLoop: true,
                memory: true,
                subflow: true,
                output: true,
            });
        });
    });
});

describe('Extension Architecture Integration', () => {
    it('should work with WorkflowEditor-style registration', () => {
        // Simulate WorkflowEditor extension registration
        const extensions = StarterKit.configure({
            agent: { defaultModel: 'openai/gpt-4o' },
            whileLoop: { defaultMaxIterations: 20 },
        });

        const extensionMap = new Map<string, any>();
        extensions.forEach((ext) => {
            extensionMap.set(ext.name, ext);
        });

        expect(extensionMap.size).toBe(9);
        expect(extensionMap.get('agent')?.defaultData?.model).toBe(
            'openai/gpt-4o'
        );
        expect(extensionMap.get('whileLoop')?.defaultData?.maxIterations).toBe(
            20
        );
    });

    it('should support mixing StarterKit with custom extensions', () => {
        const CustomExtension = createConfigurableExtension({
            name: 'custom',
            type: 'node',
            defaultOptions: { customOption: true },
            defaultData: { label: 'Custom' },
        });

        const allExtensions = [
            ...StarterKit.configure({ memory: false }),
            CustomExtension.configure({ customOption: false }),
        ];

        const names = allExtensions.map((ext) => ext.name);
        expect(names).toContain('custom');
        expect(names).not.toContain('memory');
        expect(allExtensions.length).toBe(9); // 8 from StarterKit + 1 custom
    });
});
