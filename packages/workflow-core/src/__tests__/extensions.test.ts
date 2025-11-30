import { describe, it, expect } from 'vitest';
import {
  StartNodeExtension,
  AgentNodeExtension,
  RouterNodeExtension,
  ParallelNodeExtension,
  ToolNodeExtension,
} from '../extensions/index.js';
import type { WorkflowNode, WorkflowEdge } from '../types';

// Helper to create nodes
const createNode = (type: string, id: string, data: any): WorkflowNode => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});

const createEdge = (source: string, target: string, sourceHandle?: string): WorkflowEdge => ({
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

      expect(errors.filter(e => e.code === 'DISCONNECTED_NODE')).toHaveLength(0);
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
    const ids = (AgentNodeExtension.outputs || []).map(o => o.id);
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
      const node = createNode('agent', 'agent-1', { label: 'Agent', model: '', prompt: 'Test' });
      const edges = [createEdge('start-1', 'agent-1')];

      const errors = AgentNodeExtension.validate!(node, edges);

      expect(errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_MODEL' })
      );
    });

    it('should warn if agent has no prompt', () => {
      const node = createNode('agent', 'agent-1', { label: 'Agent', model: 'test', prompt: '' });
      const edges = [createEdge('start-1', 'agent-1')];

      const errors = AgentNodeExtension.validate!(node, edges);

      expect(errors).toContainEqual(
        expect.objectContaining({ code: 'EMPTY_PROMPT', type: 'warning' })
      );
    });

    it('should error if agent has no incoming edges', () => {
      const node = createNode('agent', 'agent-1', { label: 'Agent', model: 'test', prompt: 'Test' });
      const edges: WorkflowEdge[] = [];

      const errors = AgentNodeExtension.validate!(node, edges);

      expect(errors).toContainEqual(
        expect.objectContaining({ code: 'DISCONNECTED_NODE' })
      );
    });

    it('should pass for valid agent', () => {
      const node = createNode('agent', 'agent-1', { label: 'Agent', model: 'test', prompt: 'Test' });
      const edges = [createEdge('start-1', 'agent-1')];

      const errors = AgentNodeExtension.validate!(node, edges);

      expect(errors.filter(e => e.type === 'error')).toHaveLength(0);
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
      const node = createNode('router', 'router-1', { label: 'Router', routes: [] });
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
        expect.objectContaining({ code: 'MISSING_EDGE_LABEL', type: 'warning' })
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
        expect.objectContaining({ code: 'EMPTY_PROMPT', type: 'warning' })
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
      const node = createNode('tool', 'tool-1', { label: 'Tool', toolId: '' });
      const edges = [createEdge('start-1', 'tool-1')];

      const errors = ToolNodeExtension.validate!(node, edges);

      expect(errors).toContainEqual(
        expect.objectContaining({ code: 'MISSING_REQUIRED_PORT' })
      );
    });

    it('should error if tool has no incoming edges', () => {
      const node = createNode('tool', 'tool-1', { label: 'Tool', toolId: 'my-tool' });
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
        node: createNode('tool', 'tool-1', { label: 'Tool', toolId: '' }),
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
