# or3-workflow-vue

Vue 3 components for visual workflow editing with drag-and-drop canvas. Build AI agent pipelines with an intuitive visual interface.

## Installation

```bash
bun add or3-workflow-vue or3-workflow-core
# or
npm install or3-workflow-vue or3-workflow-core
```

## Quick Start

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
    WorkflowCanvas,
    NodePalette,
    NodeInspector,
    useWorkflowEditor,
} from 'or3-workflow-vue';
import 'or3-workflow-vue/style.css';

// Create the editor instance
const editor = useWorkflowEditor();

// Load a workflow
editor.value?.load({
    meta: { version: '2.0.0', name: 'My Workflow' },
    nodes: [
        {
            id: 'start',
            type: 'start',
            position: { x: 100, y: 100 },
            data: { label: 'Start' },
        },
        {
            id: 'agent',
            type: 'agent',
            position: { x: 100, y: 250 },
            data: {
                label: 'Assistant',
                model: 'openai/gpt-4o',
                prompt: 'You are a helpful assistant.',
            },
        },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'agent' }],
});
</script>

<template>
    <div class="workflow-app">
        <NodePalette />
        <WorkflowCanvas :editor="editor" />
        <NodeInspector :editor="editor" />
    </div>
</template>

<style>
.workflow-app {
    display: flex;
    height: 100vh;
}
</style>
```

## Components

### WorkflowCanvas

The main canvas component for displaying and editing workflows.

```vue
<WorkflowCanvas
    :editor="editor"
    :node-issues="issuesByNodeId"
    @node-click="handleNodeClick"
    @edge-click="handleEdgeClick"
/>
```

The canvas pans when empty space is dragged and moves nodes directly, without an application-level mode switch. Dragging an output connection onto empty canvas opens a compact picker that creates and connects an Agent, Decision, or Output node. Double-clicking empty canvas opens the same picker without a connection.

`nodeIssues` accepts validation messages keyed by node ID. The first issue is rendered as an actionable node indicator:

```ts
const issuesByNodeId = {
    agent: [{ type: 'warning', message: 'Assistant needs a system prompt' }],
};
```

### NodePalette

Draggable palette of available node types.

```vue
<NodePalette />
```

### NodeInspector

Property inspector for the selected node.

```vue
<NodeInspector :editor="editor" />
```

The inspector uses an overview-to-detail layout. Structured Agent response
fields can be edited as named text, number, yes/no, or JSON values; router
routes support plain-language selection descriptions; and model settings expose
explicit run-capability requirements alongside provider matching.

### ValidationOverlay

Displays automatically updating validation errors and warnings on the canvas. Node issues use labels instead of technical IDs, and `open-node` is emitted when an actionable issue is selected.

```vue
<ValidationOverlay
    :editor="editor"
    :expanded="true"
    @open-node="openInspectorForNode"
/>
```

## Composables

### useWorkflowEditor

Creates and manages the workflow editor instance.

```typescript
import { useWorkflowEditor } from 'or3-workflow-vue';

const editor = useWorkflowEditor();

// Access the editor
editor.value?.load(workflowData);
editor.value?.addNode({ type: 'agent', position: { x: 200, y: 200 } });
```

### useWorkflowExecution

Manages workflow execution state.

```typescript
import { useWorkflowExecution } from 'or3-workflow-vue';

const { execute, isRunning, result, error } = useWorkflowExecution(editor);

await execute({
    input: 'Hello',
    apiKey: 'your-api-key',
});
```

### useWorkflowStorage

Handles saving and loading workflows.

```typescript
import { useWorkflowStorage } from 'or3-workflow-vue';

const { save, load, list, remove } = useWorkflowStorage();

await save(editor.value?.export());
const workflows = await list();
```

## Styling

Import the required styles in your app:

```typescript
// Required: workflow component styles
import 'or3-workflow-vue/style.css';

// Required: Vue Flow base styles
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
```

## Peer Dependencies

-   `vue` ^3.4.0
-   `or3-workflow-core` ^0.1.0

## Related Packages

-   [or3-workflow-core](https://www.npmjs.com/package/or3-workflow-core) - Headless workflow engine
-   [or3-workflows github](https://github.com/Saluana/or3-workflows)

## License

MIT
