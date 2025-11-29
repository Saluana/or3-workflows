import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterExecutionAdapter } from '../execution';
import type { WorkflowData, ExecutionCallbacks, ExecutionInput } from '../types';

// Mock OpenRouter client
const createMockClient = () => ({
  chat: {
    send: vi.fn(),
  },
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
      expect(callbacks.onNodeStart).toHaveBeenCalledWith('start-1');
      expect(callbacks.onNodeStart).toHaveBeenCalledWith('agent-1');
      expect(callbacks.onNodeFinish).toHaveBeenCalledWith('start-1', 'Hello, world!');
      expect(callbacks.onNodeFinish).toHaveBeenCalledWith('agent-1', 'Hello back!');
      expect(callbacks.onToken).toHaveBeenCalledWith('agent-1', 'Hello');
      expect(callbacks.onToken).toHaveBeenCalledWith('agent-1', ' back!');
    });

    it('should handle workflow without start node', async () => {
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

      const result = await adapter.execute(workflow, { text: 'test' }, callbacks);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No start node');
    });

    it('should handle API errors gracefully', async () => {
      const workflow = createTestWorkflow();
      
      mockClient.chat.send.mockRejectedValue(new Error('API Error'));

      const result = await adapter.execute(workflow, { text: 'test' }, callbacks);

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
          await new Promise(resolve => setTimeout(resolve, 100));
          yield { choices: [{ delta: { content: 'test' } }] };
        })();
      });

      // Start execution and stop after a small delay
      const executePromise = adapter.execute(workflow, { text: 'test' }, callbacks);
      await new Promise(resolve => setTimeout(resolve, 10)); // Let execution start
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
              { id: 'route-a', label: 'Technical' },
              { id: 'route-b', label: 'General' },
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
        { id: 'e2', source: 'router-1', target: 'agent-tech', sourceHandle: 'route-a' },
        { id: 'e3', source: 'router-1', target: 'agent-general', sourceHandle: 'route-b' },
      ],
    };

    // Mock router classification (selects option 1 = Technical)
    mockClient.chat.send
      .mockResolvedValueOnce({ choices: [{ message: { content: '1' } }] })
      .mockResolvedValueOnce(
        (async function* () {
          yield { choices: [{ delta: { content: 'Technical response' } }] };
        })()
      );

    const result = await adapter.execute(workflow, { text: 'How do I code?' }, callbacks);

    expect(result.success).toBe(true);
    expect(result.output).toBe('Technical response');
    expect(callbacks.onNodeStart).toHaveBeenCalledWith('agent-tech');
    expect(callbacks.onNodeStart).not.toHaveBeenCalledWith('agent-general');
  });
});
