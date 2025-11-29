# or3-workflows

A visual workflow builder for creating AI agent pipelines. Build, test, and execute multi-agent workflows with a drag-and-drop interface powered by Vue 3 and OpenRouter.

## Why This Exists

Building AI applications often requires orchestrating multiple LLM calls in sequence—routing user intent, processing with specialized agents, and formatting responses. or3-workflows provides:

-   **Visual workflow design** - Drag-and-drop nodes to build agent pipelines
-   **Multi-model support** - Use any model available on OpenRouter (GPT-4, Claude, Llama, etc.)
-   **Real-time execution** - Watch your workflow execute with streaming responses
-   **Type-safe core** - Framework-agnostic TypeScript core with Zod validation
-   **Extensible architecture** - Add custom node types via the extension system

## Packages

| Package              | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `@or3/workflow-core` | Framework-agnostic editor, history, commands, validation, and execution |
| `@or3/workflow-vue`  | Vue 3 components: canvas, nodes, inspector, palette                     |

## Installation

```bash
# Using bun (recommended)
bun add @or3/workflow-core @or3/workflow-vue

# Using npm
npm install @or3/workflow-core @or3/workflow-vue
```

## Quick Start

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
    WorkflowCanvas,
    NodePalette,
    NodeInspector,
    useEditor,
} from '@or3/workflow-vue';
import type { WorkflowData } from '@or3/workflow-core';

// Create the editor instance
const editor = useEditor();

// Load a workflow
const workflow: WorkflowData = {
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
};

editor.value?.load(workflow);
</script>

<template>
    <div class="workflow-app">
        <NodePalette />
        <WorkflowCanvas :editor="editor" />
        <NodeInspector :editor="editor" />
    </div>
</template>
```

## Core API

### WorkflowEditor

The central state manager for your workflow.

```typescript
import { WorkflowEditor } from '@or3/workflow-core';

const editor = new WorkflowEditor({
    content: workflowData, // Initial workflow
    extensions: [AgentExtension], // Custom node types
    onUpdate: ({ editor }) => {}, // Change callback
});

// Access state
editor.nodes; // WorkflowNode[]
editor.edges; // WorkflowEdge[]
editor.getJSON(); // Export as WorkflowData
editor.getSelected(); // { nodes: WorkflowNode[], edges: WorkflowEdge[] }

// History
editor.canUndo(); // boolean
editor.canRedo(); // boolean
editor.undo();
editor.redo();

// Events
editor.on('update', callback);
editor.on('nodeCreate', callback);
editor.on('nodeDelete', callback);
editor.on('selectionUpdate', callback);
```

### Commands

All mutations go through the command system, which handles validation, history, and events.

```typescript
// Node operations
editor.commands.createNode('agent', { label: 'New Agent' }, { x: 200, y: 300 });
editor.commands.deleteNode('node-id');
editor.commands.updateNodeData('node-id', { prompt: 'Updated prompt' });
editor.commands.duplicateNode('node-id');
editor.commands.setNodePosition('node-id', { x: 100, y: 200 });

// Edge operations
editor.commands.createEdge('source-id', 'target-id');
editor.commands.deleteEdge('edge-id');
editor.commands.updateEdgeData('edge-id', { label: 'Condition A' });

// Selection
editor.commands.selectNode('node-id');
editor.commands.selectNode('node-id', true); // Additive selection
editor.commands.deselectAll();

// History
editor.commands.undo();
editor.commands.redo();
editor.commands.commitHistory(); // Force flush pending changes
```

### Validation

Validate workflows before execution:

```typescript
import { validateWorkflow } from '@or3/workflow-core';

const result = validateWorkflow(editor.nodes, editor.edges);
// {
//   isValid: boolean,
//   errors: [{ type: 'error', nodeId?: string, message: string }],
//   warnings: [{ type: 'warning', nodeId?: string, message: string }]
// }
```

Checks include:

-   Start node exists
-   All nodes are connected
-   Agent nodes have prompts configured
-   No cycles that could cause infinite loops

### Storage

Built-in localStorage adapter with autosave:

```typescript
import { LocalStorageAdapter } from '@or3/workflow-core';

const storage = new LocalStorageAdapter();

// Autosave
storage.autosave(editor.getJSON());

// Load autosave
const saved = storage.loadAutosave();
if (saved) editor.load(saved);
```

## Vue Components

### WorkflowCanvas

The main drag-and-drop canvas powered by Vue Flow.

```vue
<WorkflowCanvas
    :editor="editor"
    :node-statuses="{ 'node-1': 'active', 'node-2': 'completed' }"
    @node-click="handleNodeClick"
    @edge-click="handleEdgeClick"
    @pane-click="handlePaneClick"
    @drop="handleDrop"
/>
```

| Prop           | Type                         | Description                   |
| -------------- | ---------------------------- | ----------------------------- |
| `editor`       | `WorkflowEditor`             | Required. The editor instance |
| `nodeStatuses` | `Record<string, NodeStatus>` | Visual status indicators      |

### NodePalette

Draggable node palette for adding new nodes.

```vue
<NodePalette />
```

Drag nodes onto the canvas to create them.

### NodeInspector

Property panel for editing the selected node.

```vue
<NodeInspector :editor="editor" />
```

Features:

-   **Prompt tab** - Edit system prompt with live preview
-   **Model tab** - Select from OpenRouter models
-   **Tools tab** - Enable/disable available tools

### EdgeLabelEditor

Click-to-edit edge labels (useful for router conditions).

```vue
<EdgeLabelEditor
    :show="showEditor"
    :edge="selectedEdge"
    :position="{ x: 100, y: 200 }"
    @update:label="updateLabel"
    @delete="deleteEdge"
    @close="closeEditor"
/>
```

## Node Types

### Start Node

Entry point for workflow execution. Every workflow needs exactly one.

### Agent Node

LLM-powered node with configurable model, prompt, and parameters.

```typescript
interface AgentNodeData {
    label: string;
    model: string; // e.g., 'openai/gpt-4o', 'anthropic/claude-3.5-sonnet'
    prompt: string; // System prompt
    temperature?: number; // 0-2, default 1
    maxTokens?: number;
    tools?: string[]; // Tool IDs to enable
}
```

### Router Node

Routes execution to different branches based on LLM classification.

```typescript
interface RouterNodeData {
    label: string;
    model?: string;
    prompt?: string; // Custom routing instructions
    routes: RouteDefinition[];
}
```

### Parallel Node

Executes multiple branches simultaneously and merges results.

### Tool Node

Executes a specific tool/function and passes results downstream.

## Execution

The demo includes a full execution engine using OpenRouter:

```typescript
import { useWorkflowExecution } from './composables';

const { execute } = useWorkflowExecution();

const result = await execute(
    apiKey, // OpenRouter API key
    nodes, // Workflow nodes
    edges, // Workflow edges
    userInput, // User message
    conversationHistory,
    {
        onNodeStatus: (nodeId, status) => {
            /* Update UI */
        },
        onStreamingContent: (content) => {
            /* Show streaming */
        },
        onAppendContent: (chunk) => {
            /* Append chunk */
        },
    }
);
```

## Extensions

Add custom node types via the extension system:

```typescript
import { Extension } from '@or3/workflow-core';

const CustomExtension: Extension = {
    name: 'custom',
    type: 'custom',

    // Default data for new nodes
    getDefaultData: () => ({
        label: 'Custom Node',
        customField: '',
    }),

    // Validation
    validate: (node, workflow) => {
        const issues = [];
        if (!node.data.customField) {
            issues.push({ type: 'warning', message: 'Custom field is empty' });
        }
        return issues;
    },

    // Dynamic handles
    getDynamicOutputs: (node) => [
        { id: 'output-1', label: 'Success' },
        { id: 'output-2', label: 'Failure' },
    ],

    // Execution
    execute: async (node, input, context) => {
        // Custom execution logic
        return { output: 'result', nextHandleId: 'output-1' };
    },
};

const editor = new WorkflowEditor({
    extensions: [CustomExtension],
});
```

## Development

```bash
# Install dependencies
bun install

# Run demo
cd demo-v2 && bun dev

# Run tests
bun test

# Build packages
bun run build

# Type check
bun run typecheck
```

## Project Structure

```
or3-workflows/
├── packages/
│   ├── workflow-core/     # Framework-agnostic core
│   │   ├── src/
│   │   │   ├── types.ts       # TypeScript types + Zod schemas
│   │   │   ├── editor.ts      # WorkflowEditor class
│   │   │   ├── commands.ts    # Command system with validation
│   │   │   ├── history.ts     # Undo/redo manager
│   │   │   ├── validation.ts  # Workflow validation
│   │   │   ├── execution.ts   # Execution adapters
│   │   │   ├── storage.ts     # Persistence adapters
│   │   │   └── extensions/    # Built-in node extensions
│   │   └── __tests__/
│   │
│   └── workflow-vue/      # Vue 3 components
│       ├── src/
│       │   ├── composables/   # useEditor, useExecutionState
│       │   └── components/
│       │       ├── WorkflowCanvas.vue
│       │       ├── nodes/     # Node renderers
│       │       └── ui/        # Palette, Inspector, etc.
│       └── styles/
│
├── demo-v2/               # Full-featured demo app
└── tests/
```

## License

MIT
