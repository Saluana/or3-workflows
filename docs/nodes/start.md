# Start Node

The entry point for every workflow.

## Overview

Every workflow must have exactly one Start node. It receives the initial input and passes it to connected nodes.

## Import

```typescript
import { StartNodeExtension } from '@or3/workflow-core';
```

## Configuration

```typescript
interface StartNodeData {
    label: string;
}
```

## Ports

| Port     | Type   | Description               |
| -------- | ------ | ------------------------- |
| `output` | Output | Passes input to next node |

## Usage

```typescript
editor.commands.createNode(
    'start',
    {
        label: 'Start',
    },
    { x: 100, y: 100 }
);
```

## Execution

The Start node simply passes the execution input to connected nodes:

```typescript
// Input to execute()
const result = await adapter.execute({
    nodes,
    edges,
    input: 'Hello, world!', // This becomes the Start node output
});
```

## Validation

| Code                   | Type  | Description                |
| ---------------------- | ----- | -------------------------- |
| `NO_START_NODE`        | Error | Workflow has no start node |
| `MULTIPLE_START_NODES` | Error | More than one start node   |
| `NO_OUTGOING_EDGE`     | Error | Start node has no outputs  |

## Best Practices

### 1. Position at Top

Place the Start node at the top of your workflow:

```typescript
{ x: 250, y: 50 }
```

### 2. Connect Immediately

Always connect to at least one node:

```typescript
editor.commands.createEdge(startNodeId, firstAgentId);
```

### 3. Use Descriptive Label

```typescript
{
    label: 'User Message Received';
}
```

## Vue Component

The `StartNode.vue` component renders the start node with a distinctive green accent.

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="start-node">
            <span class="icon">▶</span>
            <span class="label">{{ node.data.label }}</span>
        </div>
    </NodeWrapper>
</template>
```

## Next Steps

-   [Agent Node](./agent.md) - LLM processing
-   [Router Node](./router.md) - Conditional branching
