# Example Usage: Simplified Callback Integration

This document demonstrates the new simplified callback integration using `createAccumulatorCallbacks`.

## Before (Verbose)

```typescript
import { OpenRouterExecutionAdapter } from '@or3/workflow-core';
import type { WorkflowData, ExecutionCallbacks } from '@or3/workflow-core';

// Your accumulator class
class StreamAccumulator {
  nodeStart(nodeId: string, label: string, type: string) { /* ... */ }
  nodeToken(nodeId: string, token: string) { /* ... */ }
  nodeReasoning(nodeId: string, token: string) { /* ... */ }
  nodeFinish(nodeId: string, output: string) { /* ... */ }
  nodeError(nodeId: string, error: Error) { /* ... */ }
  branchStart(nodeId: string, branchId: string, label: string) { /* ... */ }
  branchToken(nodeId: string, branchId: string, label: string, token: string) { /* ... */ }
  branchComplete(nodeId: string, branchId: string, label: string, output: string) { /* ... */ }
}

const accumulator = new StreamAccumulator();

// OLD WAY: Manual node lookup boilerplate (~40 lines)
const callbacks: ExecutionCallbacks = {
  onNodeStart: (nodeId) => {
    // Manual lookup required!
    const node = workflow.nodes.find(n => n.id === nodeId);
    const data = node?.data as Record<string, unknown> | undefined;
    const label = typeof data?.label === 'string' ? data.label : nodeId;
    accumulator.nodeStart(nodeId, label, node?.type || 'unknown');
  },
  onToken: (nodeId, token) => accumulator.nodeToken(nodeId, token),
  onReasoning: (nodeId, token) => accumulator.nodeReasoning(nodeId, token),
  onNodeFinish: (nodeId, output) => accumulator.nodeFinish(nodeId, output),
  onNodeError: (nodeId, error) => accumulator.nodeError(nodeId, error),
  onBranchStart: (nodeId, branchId, label) => accumulator.branchStart(nodeId, branchId, label),
  onBranchToken: (nodeId, branchId, label, token) => accumulator.branchToken(nodeId, branchId, label, token),
  onBranchComplete: (nodeId, branchId, label, output) => accumulator.branchComplete(nodeId, branchId, output),
};

const result = await adapter.execute(workflow, input, callbacks);
```

## After (Clean)

```typescript
import { OpenRouterExecutionAdapter, createAccumulatorCallbacks } from '@or3/workflow-core';
import type { WorkflowData } from '@or3/workflow-core';

// Your accumulator class (same as before)
class StreamAccumulator {
  nodeStart(nodeId: string, label: string, type: string) { /* ... */ }
  nodeToken(nodeId: string, token: string) { /* ... */ }
  nodeReasoning(nodeId: string, token: string) { /* ... */ }
  nodeFinish(nodeId: string, output: string) { /* ... */ }
  nodeError(nodeId: string, error: Error) { /* ... */ }
  branchStart(nodeId: string, branchId: string, label: string) { /* ... */ }
  branchToken(nodeId: string, branchId: string, label: string, token: string) { /* ... */ }
  branchComplete(nodeId: string, branchId: string, label: string, output: string) { /* ... */ }
}

const accumulator = new StreamAccumulator();

// NEW WAY: Clean one-liner with helper (~10 lines)
const callbacks = createAccumulatorCallbacks(workflow, {
  onNodeStart: accumulator.nodeStart.bind(accumulator),
  onNodeToken: accumulator.nodeToken.bind(accumulator),
  onNodeReasoning: accumulator.nodeReasoning.bind(accumulator),
  onNodeFinish: accumulator.nodeFinish.bind(accumulator),
  onNodeError: accumulator.nodeError.bind(accumulator),
  onBranchStart: accumulator.branchStart.bind(accumulator),
  onBranchToken: accumulator.branchToken.bind(accumulator),
  onBranchComplete: accumulator.branchComplete.bind(accumulator),
});

const result = await adapter.execute(workflow, input, callbacks);
```

## Benefits

1. **75% less code**: Reduced from ~40 lines to ~10 lines
2. **No manual lookups**: Node label and type are automatically resolved
3. **Type-safe**: Full TypeScript support with proper inference
4. **Backward compatible**: Existing code continues to work unchanged
5. **Self-documenting**: Clear intent with `StreamAccumulatorCallbacks` interface

## Advanced: Using NodeInfo Directly

If you prefer to work with the raw `ExecutionCallbacks` interface, you can now access node metadata directly:

```typescript
const callbacks: ExecutionCallbacks = {
  onNodeStart: (nodeId, nodeInfo) => {
    // NodeInfo is automatically provided!
    console.log(`Node ${nodeInfo?.label} (${nodeInfo?.type}) started`);
  },
  onNodeFinish: (nodeId, output) => {
    console.log(`Node ${nodeId} finished: ${output}`);
  },
  onNodeError: (nodeId, error) => {
    console.error(`Node ${nodeId} error:`, error);
  },
  onToken: (nodeId, token) => {
    process.stdout.write(token);
  },
};

const result = await adapter.execute(workflow, input, callbacks);
```

## Optional Callbacks

The following optional callbacks are now available:

- `onReasoning`: For chain-of-thought reasoning tokens (if supported by LLM)
- `onBranchStart`: Called when a parallel branch starts execution
- `onBranchToken`: For streaming tokens from parallel branches
- `onBranchComplete`: Called when a parallel branch completes

Note: The merge step in parallel nodes uses `branchId='__merge__'` and `branchLabel='Merge'`.
