import { describe, it, expect, vi } from 'vitest';
import { createAccumulatorCallbacks } from '../execution';
import type { WorkflowData, StreamAccumulatorCallbacks } from '../types';

describe('createAccumulatorCallbacks', () => {
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
        data: { label: 'Start Node' },
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
      {
        id: 'router-1',
        type: 'router',
        position: { x: 400, y: 0 },
        data: {
          label: 'Decision Router',
          routes: [],
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

  it('should create ExecutionCallbacks from StreamAccumulatorCallbacks', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);

    expect(callbacks).toBeDefined();
    expect(callbacks.onNodeStart).toBeDefined();
    expect(callbacks.onNodeFinish).toBeDefined();
    expect(callbacks.onNodeError).toBeDefined();
    expect(callbacks.onToken).toBeDefined();
    expect(callbacks.onReasoning).toBeDefined();
    expect(callbacks.onBranchStart).toBeDefined();
    expect(callbacks.onBranchToken).toBeDefined();
    expect(callbacks.onBranchComplete).toBeDefined();
  });

  it('should resolve node label and type when NodeInfo is provided', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);

    // Call with NodeInfo (new signature)
    callbacks.onNodeStart('agent-1', { label: 'Test Agent', type: 'agent' });

    expect(handlers.onNodeStart).toHaveBeenCalledWith('agent-1', 'Test Agent', 'agent');
  });

  it('should lookup node label and type when NodeInfo is not provided', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);

    // Call without NodeInfo (backward compatibility)
    callbacks.onNodeStart('router-1');

    expect(handlers.onNodeStart).toHaveBeenCalledWith('router-1', 'Decision Router', 'router');
  });

  it('should use node ID as label if label is not a string', () => {
    const workflow: WorkflowData = {
      meta: {
        version: '2.0.0',
        name: 'Test Workflow',
      },
      nodes: [
        {
          id: 'node-1',
          type: 'custom',
          position: { x: 0, y: 0 },
          data: { label: 123 as any }, // Invalid label
        },
      ],
      edges: [],
    };

    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);
    callbacks.onNodeStart('node-1');

    expect(handlers.onNodeStart).toHaveBeenCalledWith('node-1', 'node-1', 'custom');
  });

  it('should handle unknown nodes gracefully', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);
    callbacks.onNodeStart('unknown-node');

    expect(handlers.onNodeStart).toHaveBeenCalledWith('unknown-node', 'unknown-node', 'unknown');
  });

  it('should forward onNodeFinish calls directly', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);
    callbacks.onNodeFinish('agent-1', 'output text');

    expect(handlers.onNodeFinish).toHaveBeenCalledWith('agent-1', 'output text');
  });

  it('should forward onNodeError calls directly', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);
    const error = new Error('Test error');
    callbacks.onNodeError('agent-1', error);

    expect(handlers.onNodeError).toHaveBeenCalledWith('agent-1', error);
  });

  it('should forward onToken calls correctly', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);
    callbacks.onToken('agent-1', 'Hello');

    expect(handlers.onNodeToken).toHaveBeenCalledWith('agent-1', 'Hello');
  });

  it('should forward onReasoning calls correctly', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);
    callbacks.onReasoning!('agent-1', 'thinking...');

    expect(handlers.onNodeReasoning).toHaveBeenCalledWith('agent-1', 'thinking...');
  });

  it('should forward branch callbacks correctly', () => {
    const workflow = createTestWorkflow();
    const handlers: StreamAccumulatorCallbacks = {
      onNodeStart: vi.fn(),
      onNodeToken: vi.fn(),
      onNodeReasoning: vi.fn(),
      onNodeFinish: vi.fn(),
      onNodeError: vi.fn(),
      onBranchStart: vi.fn(),
      onBranchToken: vi.fn(),
      onBranchComplete: vi.fn(),
    };

    const callbacks = createAccumulatorCallbacks(workflow, handlers);

    // Test onBranchStart
    callbacks.onBranchStart!('parallel-1', 'branch-1', 'Branch A');
    expect(handlers.onBranchStart).toHaveBeenCalledWith('parallel-1', 'branch-1', 'Branch A');

    // Test onBranchToken
    callbacks.onBranchToken!('parallel-1', 'branch-1', 'Branch A', 'token');
    expect(handlers.onBranchToken).toHaveBeenCalledWith('parallel-1', 'branch-1', 'Branch A', 'token');

    // Test onBranchComplete
    callbacks.onBranchComplete!('parallel-1', 'branch-1', 'Branch A', 'output');
    expect(handlers.onBranchComplete).toHaveBeenCalledWith('parallel-1', 'branch-1', 'Branch A', 'output');
  });

  it('should eliminate boilerplate in consumer code', () => {
    const workflow = createTestWorkflow();
    
    // This is the pattern that consumers can now use
    class SimpleAccumulator {
      nodeStart = vi.fn();
      nodeToken = vi.fn();
      nodeReasoning = vi.fn();
      nodeFinish = vi.fn();
      nodeError = vi.fn();
      branchStart = vi.fn();
      branchToken = vi.fn();
      branchComplete = vi.fn();
    }

    const accumulator = new SimpleAccumulator();

    // Clean, minimal wiring - no manual lookups needed
    const callbacks = createAccumulatorCallbacks(workflow, {
      onNodeStart: accumulator.nodeStart,
      onNodeToken: accumulator.nodeToken,
      onNodeReasoning: accumulator.nodeReasoning,
      onNodeFinish: accumulator.nodeFinish,
      onNodeError: accumulator.nodeError,
      onBranchStart: accumulator.branchStart,
      onBranchToken: accumulator.branchToken,
      onBranchComplete: accumulator.branchComplete,
    });

    // Simulate execution
    callbacks.onNodeStart('agent-1', { label: 'Test Agent', type: 'agent' });
    callbacks.onToken('agent-1', 'Hello');
    callbacks.onNodeFinish('agent-1', 'Hello World');

    // Verify the accumulator received the right data
    expect(accumulator.nodeStart).toHaveBeenCalledWith('agent-1', 'Test Agent', 'agent');
    expect(accumulator.nodeToken).toHaveBeenCalledWith('agent-1', 'Hello');
    expect(accumulator.nodeFinish).toHaveBeenCalledWith('agent-1', 'Hello World');
  });
});
