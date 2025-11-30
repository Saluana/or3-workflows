# History

The history system provides undo/redo functionality using snapshot-based state management.

## Import

```typescript
import { WorkflowEditor } from '@or3/workflow-core';

const editor = new WorkflowEditor({
    /* ... */
});

// Access history via editor.history
editor.history.push(state);
```

## How It Works

The history system stores snapshots of the workflow state (nodes and edges). When you undo, it restores the previous snapshot. When you redo, it moves forward.

```
                 ← undo      redo →
    [State 1] ← [State 2] ← [State 3] ← [Current]
                                 ↑
                              cursor
```

## Automatic History

Commands automatically push to history:

```typescript
// Each of these creates a history entry
editor.commands.createNode('agent', { label: 'New' });
editor.commands.deleteNode('node-123');
editor.commands.createEdge('source', 'target');

// Undo the edge creation
editor.undo(); // Restores state before edge

// Redo the edge creation
editor.redo(); // Applies edge again
```

## Editor Methods

### canUndo() / canRedo()

Check if undo/redo is available.

```typescript
editor.canUndo(): boolean
editor.canRedo(): boolean
```

**Example:**

```typescript
// Disable buttons when unavailable
<button :disabled="!editor.canUndo()" @click="editor.undo()">
  Undo
</button>
```

### undo() / redo()

Perform undo or redo.

```typescript
editor.undo(): void
editor.redo(): void
```

## HistoryManager API

For advanced use cases, access the history manager directly:

### push()

Add a state to history.

```typescript
editor.history.push(
  state: { nodes: WorkflowNode[]; edges: WorkflowEdge[] },
  debounce?: boolean
): void
```

**Parameters:**

-   `state` - The state snapshot
-   `debounce` - If true, debounces rapid pushes (default: false)

**Example:**

```typescript
// Manually push state (rarely needed)
editor.history.push({
    nodes: editor.nodes,
    edges: editor.edges,
});
```

### undo() / redo()

Navigate history.

```typescript
editor.history.undo(): State | null
editor.history.redo(): State | null
```

Returns the state to restore, or `null` if unavailable.

### clear()

Clear all history.

```typescript
editor.history.clear(): void
```

**Example:**

```typescript
// After loading a new workflow
editor.load(newWorkflow);
editor.history.clear();
```

### canUndo() / canRedo()

Check availability.

```typescript
editor.history.canUndo(): boolean
editor.history.canRedo(): boolean
```

## Configuration

### maxHistory

Maximum number of states to keep (default: 50).

```typescript
const editor = new WorkflowEditor({
    // History is configured internally
    // Default: 50 states
});
```

### debounceDelay

Delay for debounced pushes (default: 10ms).

Used by rapid operations like typing and dragging.

## Debouncing

Rapid operations (like typing or dragging) are debounced to prevent flooding history:

```typescript
// These three updates result in ONE history entry
editor.commands.updateNodeData('node-1', { prompt: 'H' });
editor.commands.updateNodeData('node-1', { prompt: 'He' });
editor.commands.updateNodeData('node-1', { prompt: 'Hello' });

// After 300ms, one history entry is created
// Undo will restore the state before all three
```

To force an immediate history entry:

```typescript
editor.commands.commitHistory();
```

## Events

Listen for history changes:

```typescript
editor.on('historyChange', () => {
    console.log('Can undo:', editor.canUndo());
    console.log('Can redo:', editor.canRedo());
});
```

## Best Practices

### 1. Let Commands Handle History

Don't manually push to history—commands do this automatically.

```typescript
// ✅ Good - command handles history
editor.commands.createNode('agent', { label: 'New' });

// ❌ Avoid - manual push
editor.history.push({ nodes: editor.nodes, edges: editor.edges });
```

### 2. Commit Before Major Operations

If you need a clean undo point:

```typescript
editor.commands.commitHistory();
// Now any previous debounced changes are saved
```

### 3. Clear History on Load

When loading a completely new workflow:

```typescript
editor.load(newWorkflow);
// History is automatically cleared on load
```

### 4. Limit History Size

For memory-constrained environments, reduce max history:

```typescript
// History manager uses default of 50
// This is usually sufficient
```

## Technical Details

### Snapshot Storage

Each snapshot stores a deep copy of nodes and edges:

```typescript
interface HistoryState {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
}
```

### Memory Usage

With 50 snapshots and ~100 nodes, expect ~1-2MB of memory for history.

### Clearing Future History

When you make a change after undoing, future history is discarded:

```
[1] ← [2] ← [3] ← [4] (undo to 2)
[1] ← [2] ← [5]        (new change discards 3, 4)
```

## Next Steps

-   [Commands](./commands.md) - State mutations
-   [Validation](./validation.md) - Workflow validation
