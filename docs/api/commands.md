# Commands

The command system handles all state mutations to the workflow. Commands automatically manage history (undo/redo), emit events, and validate input.

## Import

```typescript
import { WorkflowEditor } from 'or3-workflow-core';

const editor = new WorkflowEditor({
    /* ... */
});

// Access commands via editor.commands
editor.commands.createNode('agent', { label: 'My Agent' });
```

## Node Commands

### createNode()

Create a new node.

```typescript
editor.commands.createNode(
  type: string,
  data?: NodeData,
  position?: { x: number; y: number }
): boolean
```

**Parameters:**

-   `type` - Node type (e.g., 'start', 'agent', 'router')
-   `data` - Node data (uses extension defaults if not provided)
-   `position` - Node position (defaults to `{ x: 0, y: 0 }`)

**Returns:** `true` if successful, `false` otherwise

**Example:**

```typescript
editor.commands.createNode(
    'agent',
    {
        label: 'Classifier',
        model: 'openai/gpt-4o-mini',
        prompt: 'Classify the user intent.',
    },
    { x: 200, y: 300 }
);
```

### deleteNode()

Delete a node and its connected edges.

```typescript
editor.commands.deleteNode(id: string): boolean
```

**Example:**

```typescript
editor.commands.deleteNode('node-123');
```

### updateNodeData()

Update a node's data (partial merge).

```typescript
editor.commands.updateNodeData(
  id: string,
  data: Partial<NodeData>
): boolean
```

**Example:**

```typescript
editor.commands.updateNodeData('node-123', {
    prompt: 'Updated system prompt',
    temperature: 0.7,
});
```

**Note:** This command is debounced for rapid updates (e.g., typing). Use `commitHistory()` to flush immediately.

### duplicateNode()

Duplicate a node with an offset position.

```typescript
editor.commands.duplicateNode(id: string): boolean
```

**Example:**

```typescript
editor.commands.duplicateNode('node-123');
// Creates a copy at position + { x: 20, y: 20 }
```

### setNodePosition()

Update a node's position.

```typescript
editor.commands.setNodePosition(
  id: string,
  position: { x: number; y: number }
): boolean
```

**Example:**

```typescript
editor.commands.setNodePosition('node-123', { x: 400, y: 200 });
```

**Note:** This command is debounced for drag operations.

## Edge Commands

### createEdge()

Create a new edge connecting two nodes.

```typescript
editor.commands.createEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string
): boolean
```

**Parameters:**

-   `source` - Source node ID
-   `target` - Target node ID
-   `sourceHandle` - Optional source handle ID (for multi-output nodes)
-   `targetHandle` - Optional target handle ID

**Example:**

```typescript
// Simple connection
editor.commands.createEdge('start-node', 'agent-node');

// With handles (for router)
editor.commands.createEdge('router-node', 'success-node', 'route-success');
```

### deleteEdge()

Delete an edge.

```typescript
editor.commands.deleteEdge(id: string): boolean
```

### updateEdgeData()

Update an edge's data (e.g., label).

```typescript
editor.commands.updateEdgeData(id: string, data: {
  label?: string;
  data?: Record<string, unknown>;
}): boolean
```

**Example:**

```typescript
editor.commands.updateEdgeData('edge-123', {
    label: 'On Success',
});
```

## Selection Commands

### selectNode()

Select a node.

```typescript
editor.commands.selectNode(
  id: string,
  additive?: boolean
): boolean
```

**Parameters:**

-   `id` - Node ID to select
-   `additive` - If true, add to selection instead of replacing

**Example:**

```typescript
// Select single node
editor.commands.selectNode('node-123');

// Add to selection (multi-select)
editor.commands.selectNode('node-456', true);
```

### selectEdge()

Select an edge.

```typescript
editor.commands.selectEdge(
  id: string,
  additive?: boolean
): boolean
```

### selectAll()

Select all nodes and edges.

```typescript
editor.commands.selectAll(): void
```

### deselectAll()

Clear all selection.

```typescript
editor.commands.deselectAll(): void
```

## History Commands

### undo()

Undo the last operation.

```typescript
editor.commands.undo(): boolean
```

### redo()

Redo the last undone operation.

```typescript
editor.commands.redo(): boolean
```

### commitHistory()

Force flush pending history changes immediately. Useful when you need to ensure the current state is saved to history before another operation.

```typescript
editor.commands.commitHistory(): void
```

**Example:**

```typescript
// Multiple rapid updates
editor.commands.updateNodeData('node-1', { prompt: 'A' });
editor.commands.updateNodeData('node-1', { prompt: 'AB' });
editor.commands.updateNodeData('node-1', { prompt: 'ABC' });

// Flush to history
editor.commands.commitHistory();

// Now undo will restore the state before all three updates
editor.commands.undo();
```

## Viewport Commands

### zoomTo()

Set zoom level.

```typescript
editor.commands.zoomTo(level: number): void
```

### zoomIn() / zoomOut()

Adjust zoom by a step.

```typescript
editor.commands.zoomIn(): void
editor.commands.zoomOut(): void
```

### fitView()

Fit all nodes in view.

```typescript
editor.commands.fitView(options?: {
  padding?: number;
  duration?: number;
}): void
```

### setViewport()

Set viewport position and zoom.

```typescript
editor.commands.setViewport(viewport: {
  x: number;
  y: number;
  zoom: number;
}): void
```

## Validation

Commands validate input using Zod schemas before applying changes:

```typescript
// This will fail validation and return false
editor.commands.updateNodeData('node-123', {
    temperature: 5, // Must be 0-2
});

// Check console for validation errors
// "Invalid node data update: temperature must be <= 2"
```

## Debouncing

Some commands (like `updateNodeData` and `setNodePosition`) are debounced to batch rapid updates into a single history entry:

-   **Debounce window:** 300ms
-   **Use case:** Typing in text fields, dragging nodes

To flush immediately:

```typescript
editor.commands.commitHistory();
```

## Cleanup

Before destroying the editor, call `dispose()` to clean up pending timeouts:

```typescript
// In the editor's destroy() method
editor.commands.dispose();
```

This is handled automatically when calling `editor.destroy()`.

## Next Steps

-   [History](./history.md) - Undo/redo system
-   [Validation](./validation.md) - Workflow validation
