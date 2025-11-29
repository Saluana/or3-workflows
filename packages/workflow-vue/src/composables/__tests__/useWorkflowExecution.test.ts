import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkflowExecution } from '../useWorkflowExecution';
import type { ExecutionAdapter, WorkflowData, ExecutionInput, ExecutionResult } from '@or3/workflow-core';

// Mock Adapter
const mockAdapter: ExecutionAdapter = {
  execute: vi.fn(),
  stop: vi.fn(),
  isRunning: vi.fn(),
  getModelCapabilities: vi.fn(),
  supportsModality: vi.fn(),
};

const mockWorkflow: WorkflowData = {
  meta: { version: '1.0.0', name: 'Test' },
  nodes: [],
  edges: []
};

const mockInput: ExecutionInput = { text: 'test' };

describe('useWorkflowExecution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default state', () => {
    const { isRunning, error, result } = useWorkflowExecution();
    
    expect(isRunning.value).toBe(false);
    expect(error.value).toBe(null);
    expect(result.value).toBe(null);
  });

  it('should update state during execution', async () => {
    const { execute, isRunning, nodeStatuses } = useWorkflowExecution();
    
    // Mock successful execution
    const mockResult: ExecutionResult = {
      success: true,
      output: 'result',
      nodeOutputs: {},
      duration: 100
    };
    
    (mockAdapter.execute as any).mockImplementation(async (_wf: any, _input: any, callbacks: any) => {
      callbacks.onNodeStart('node-1');
      callbacks.onNodeFinish('node-1', 'output');
      return mockResult;
    });

    const promise = execute(mockAdapter, mockWorkflow, mockInput);
    
    expect(isRunning.value).toBe(true);
    
    await promise;
    
    expect(isRunning.value).toBe(false);
    expect(nodeStatuses.value['node-1']).toBe('completed');
  });

  it('should handle execution errors', async () => {
    const { execute, error } = useWorkflowExecution();
    const testError = new Error('Test Error');
    
    (mockAdapter.execute as any).mockRejectedValue(testError);

    try {
      await execute(mockAdapter, mockWorkflow, mockInput);
    } catch (e) {
      // Expected
    }

    expect(error.value).toBe(testError);
  });

  it('should stop execution', () => {
    const { execute, stop, isRunning } = useWorkflowExecution();
    
    // Start execution (mock long running)
    (mockAdapter.execute as any).mockImplementation(() => new Promise(() => {}));
    
    execute(mockAdapter, mockWorkflow, mockInput);
    expect(isRunning.value).toBe(true);
    
    stop(mockAdapter);
    
    expect(mockAdapter.stop).toHaveBeenCalled();
    expect(isRunning.value).toBe(false);
  });

  it('should reset state', () => {
    const { reset, isRunning, error } = useWorkflowExecution();
    
    isRunning.value = true;
    error.value = new Error('test');
    
    reset();
    
    expect(isRunning.value).toBe(false);
    expect(error.value).toBe(null);
  });
});
