# WorkflowEditor

The `WorkflowEditor` is the central state manager for your workflow. It manages nodes, edges, selection, history, and extensions.

## Import

```typescript
import { WorkflowEditor, createWorkflowEditor } from 'or3-workflow-core';
```

## Creating an Editor

### Factory Function

```typescript
const editor = createWorkflowEditor({
    extensions: StarterKit.configure(),
    content: workflowData,
    onUpdate: ({ editor }) => {
        console.log('Workflow updated');
    },
});
```

### Constructor

```typescript
const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
    content: workflowData,
});
```

## Options

```typescript
interface EditorOptions {
    /** Extensions to register */
    extensions?: Extension[];

    /** Initial workflow content */
    content?: WorkflowData;

    /** Callback when workflow changes */
    onUpdate?: (props: { editor: WorkflowEditor }) => void;

    /** Callback when selection changes */
    onSelectionUpdate?: (props: { editor: WorkflowEditor }) => void;
}
```

## Properties

### nodes

```typescript
editor.nodes: WorkflowNode[]
```

Array of all workflow nodes. Read-only—use commands to modify.

### edges

```typescript
editor.edges: WorkflowEdge[]
```

Array of all workflow edges. Read-only—use commands to modify.

### meta

```typescript
editor.meta: {
  version: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}
```

Workflow metadata.

### viewport

```typescript
editor.viewport: { x: number; y: number; zoom: number }
```

Current viewport state.

### extensions

```typescript
editor.extensions: Map<string, Extension>
```

Registered extensions.

### commands

```typescript
editor.commands: CommandManager
```

Command manager for mutations. See [Commands](./commands.md).

### history

```typescript
editor.history: HistoryManager
```

History manager for undo/redo. See [History](./history.md).

## Methods

### load()

Load a workflow, replacing all current content.

```typescript
editor.load(workflowData: WorkflowData): void
```

**Example:**

```typescript
const workflow = await storage.load('workflow-id');
editor.load(workflow);
```

### getJSON()

Export the workflow as serializable data.

```typescript
editor.getJSON(): WorkflowData
```

**Example:**

```typescript
const data = editor.getJSON();
await storage.save(data);
```

### getNodes() / getEdges()

Get current nodes or edges.

```typescript
editor.getNodes(): WorkflowNode[]
editor.getEdges(): WorkflowEdge[]
```

### getSelected()

Get currently selected nodes and edges.

```typescript
editor.getSelected(): {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}
```

**Example:**

```typescript
const { nodes, edges } = editor.getSelected();
console.log(`${nodes.length} nodes selected`);
```

### canUndo() / canRedo()

Check if undo/redo is available.

```typescript
editor.canUndo(): boolean
editor.canRedo(): boolean
```

### undo() / redo()

Undo or redo the last operation.

```typescript
editor.undo(): void
editor.redo(): void
```

### registerExtension()

Register an extension dynamically.

```typescript
editor.registerExtension(extension: Extension): void
```

**Example:**

```typescript
editor.registerExtension(MyCustomExtension);
```

### getExtension()

Get a registered extension by name.

```typescript
editor.getExtension(name: string): Extension | undefined
```

### destroy()

Clean up the editor and call extension `onDestroy` hooks.

```typescript
editor.destroy(): void
```

**Important:** Always call this when unmounting to prevent memory leaks.

## Events

Subscribe to editor events with `on()` and unsubscribe with `off()`.

```typescript
editor.on(event: string, callback: Function): void
editor.off(event: string, callback: Function): void
```

### Available Events

| Event             | Payload        | Description               |
| ----------------- | -------------- | ------------------------- |
| `update`          | `undefined`    | Any change to nodes/edges |
| `nodeCreate`      | `WorkflowNode` | Node was created          |
| `nodeUpdate`      | `WorkflowNode` | Node data changed         |
| `nodeDelete`      | `WorkflowNode` | Node was deleted          |
| `edgeCreate`      | `WorkflowEdge` | Edge was created          |
| `edgeUpdate`      | `WorkflowEdge` | Edge data changed         |
| `edgeDelete`      | `WorkflowEdge` | Edge was deleted          |
| `selectionUpdate` | `undefined`    | Selection changed         |
| `historyChange`   | `undefined`    | Undo/redo stack changed   |

**Example:**

```typescript
function handleUpdate() {
    storage.autosave(editor.getJSON());
}

editor.on('update', handleUpdate);

// Later: unsubscribe
editor.off('update', handleUpdate);
```

## Type Definitions

### WorkflowData

```typescript
interface WorkflowData {
    meta: {
        version: string;
        name: string;
        createdAt?: string;
        updatedAt?: string;
    };
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    viewport?: { x: number; y: number; zoom: number };
}
```

### WorkflowNode

```typescript
interface WorkflowNode {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: NodeData;
    selected?: boolean;
    dragging?: boolean;
}
```

### WorkflowEdge

```typescript
interface WorkflowEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    targetHandle?: string;
    label?: string;
    data?: Record<string, unknown>;
    selected?: boolean;
}
```

## Vue Integration

Use the `useEditor` composable for reactive Vue integration:

```typescript
import { useEditor } from 'or3-workflow-vue';

const editor = useEditor({
    extensions: StarterKit.configure(),
});

// editor.value is the WorkflowEditor instance
```

See [useEditor](../vue/composables/use-editor.md) for details.

## Next Steps

-   [Commands](./commands.md) - State mutations
-   [History](./history.md) - Undo/redo system
-   [Extensions](./extensions.md) - Node extensions
