# or3-workflows

A visual workflow builder for creating AI agent pipelines. Build, test, and execute multi-agent workflows with a drag-and-drop interface powered by Vue 3 and OpenRouter.

## Why This Exists

Building AI applications often requires orchestrating multiple LLM calls in sequence—routing user intent, processing with specialized agents, and formatting responses. or3-workflows provides:

-   **Visual workflow design** - Drag-and-drop nodes to build agent pipelines
-   **Multi-model support** - Use any model available on OpenRouter (GPT-4, Claude, Llama, etc.)
-   **Real-time execution** - Watch your workflow execute with streaming responses
-   **Type-safe core** - Framework-agnostic TypeScript core with Zod validation
-   **TipTap-style extensions** - Configurable, composable node extensions
-   **Human-in-the-loop** - Pause for approval, input, or review at any step
-   **Context compaction** - Automatic conversation summarization to stay within limits

## Packages

| Package              | Description                                                             |
| -------------------- | ----------------------------------------------------------------------- |
| `@or3/workflow-core` | Framework-agnostic editor, history, commands, validation, and execution |
| `@or3/workflow-vue`  | Vue 3 components: canvas, nodes, inspector, palette                     |

## Documentation

-   [EXTENSIONS.md](./EXTENSIONS.md) - Creating custom extensions, StarterKit configuration
-   [ADAPTERS.md](./ADAPTERS.md) - Memory, storage, and token counter adapters

## Installation

```bash
# Using bun (recommended)
bun add @or3/workflow-core @or3/workflow-vue

# Using npm
npm install @or3/workflow-core @or3/workflow-vue
```

## Quick Start

### TipTap-Style Setup

```typescript
import { WorkflowEditor, StarterKit } from '@or3/workflow-core';

// Basic setup with all extensions
const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});

// Customize which extensions to include
const editor = new WorkflowEditor({
    extensions: StarterKit.configure({
        // Disable specific nodes
        whileLoop: false,
        parallel: false,

        // Configure specific nodes
        agent: {
            defaultModel: 'anthropic/claude-3.5-sonnet',
        },
        subflow: {
            maxNestingDepth: 5,
        },
    }),
});
```

### Vue Component Setup

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
import { OpenRouterExecutionAdapter } from '@or3/workflow-core';

const adapter = new OpenRouterExecutionAdapter({
    apiKey: process.env.OPENROUTER_API_KEY!,
    extensions: StarterKit.configure(),
    onNodeStart: (nodeId) => setNodeStatus(nodeId, 'active'),
    onNodeComplete: (nodeId, result) => setNodeStatus(nodeId, 'completed'),
    onNodeError: (nodeId, error) => setNodeStatus(nodeId, 'error'),
    onStreamChunk: (chunk) => appendContent(chunk),
    onHITLRequest: async (request) => showApprovalModal(request),
});

const result = await adapter.execute({
    nodes,
    edges,
    input: userMessage,
    conversationHistory,
});
```

## Human-in-the-Loop (HITL)

Pause workflow execution for human review, approval, or input:

```typescript
import { OpenRouterExecutionAdapter } from '@or3/workflow-core';
import type { HITLRequest, HITLResponse, HITLAction } from '@or3/workflow-core';

const adapter = new OpenRouterExecutionAdapter({
    apiKey,
    extensions: StarterKit.configure(),

    // Handle HITL requests
    onHITLRequest: async (request: HITLRequest): Promise<HITLResponse> => {
        // Show modal to user, wait for response
        const userAction = await showApprovalModal(request);

        return {
            action: userAction.action, // 'approve' | 'reject' | 'modify' | 'skip'
            modifiedContent: userAction.content,
            metadata: { reviewedBy: 'user@example.com' },
        };
    },
});

// Configure HITL on agent nodes
const node = {
    type: 'agent',
    data: {
        label: 'Draft Email',
        hitl: {
            enabled: true,
            type: 'approval', // 'approval' | 'input' | 'review'
            message: 'Review this email before sending',
            timeout: 300000, // 5 minutes
            actions: ['approve', 'reject', 'modify'],
        },
    },
};
```

## Context Compaction

Automatically summarize conversation history when approaching token limits:

```typescript
import {
    OpenRouterExecutionAdapter,
    ApproximateTokenCounter,
} from '@or3/workflow-core';

const adapter = new OpenRouterExecutionAdapter({
    apiKey,
    extensions: StarterKit.configure(),
    tokenCounter: new ApproximateTokenCounter(),

    compaction: {
        enabled: true,
        maxTokens: 100000, // When to trigger
        targetTokens: 60000, // Target after compaction
        summaryModel: 'openai/gpt-4o-mini',
        preserveSystemPrompt: true,
        preserveLastN: 5, // Keep last N messages
    },
});
```

For custom token counting (tiktoken, etc.), implement `TokenCounter`:

```typescript
import { TokenCounter } from '@or3/workflow-core';
import { encoding_for_model } from 'tiktoken';

class TiktokenCounter implements TokenCounter {
    private encoder = encoding_for_model('gpt-4o');

    count(text: string): number {
        return this.encoder.encode(text).length;
    }

    countMessages(messages: Message[]): number {
        return messages.reduce((sum, m) => sum + this.count(m.content) + 4, 0);
    }
}
```

## Extensions

TipTap-style configurable extensions for custom node types.

### Using StarterKit

```typescript
import { WorkflowEditor, StarterKit } from '@or3/workflow-core';

// All built-in extensions
const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});

// Selective configuration
const editor = new WorkflowEditor({
    extensions: StarterKit.configure({
        whileLoop: false, // Disable
        agent: { defaultModel: 'anthropic/claude-3.5-sonnet' },
    }),
});
```

### Creating Custom Extensions

```typescript
import { createConfigurableExtension } from '@or3/workflow-core';
import type { Extension } from '@or3/workflow-core';

interface ApprovalOptions {
    defaultTimeout?: number;
    requireReason?: boolean;
}

const ApprovalExtension = createConfigurableExtension<ApprovalOptions>({
    name: 'approval',
    type: 'approval',

    getDefaultData: (options) => ({
        label: 'Approval Gate',
        timeout: options.defaultTimeout ?? 300000,
        requireReason: options.requireReason ?? false,
    }),

    validate: (node, workflow) => {
        const issues = [];
        if (node.data.timeout < 1000) {
            issues.push({ type: 'error', message: 'Timeout too short' });
        }
        return issues;
    },

    execute: async (node, input, context) => {
        // Request human approval
        const response = await context.requestHITL({
            nodeId: node.id,
            type: 'approval',
            content: input,
            message: 'Approve to continue',
        });

        if (response.action === 'approve') {
            return { output: input, nextHandleId: 'approved' };
        }
        return { output: response.modifiedContent, nextHandleId: 'rejected' };
    },

    getDynamicOutputs: () => [
        { id: 'approved', label: 'Approved' },
        { id: 'rejected', label: 'Rejected' },
    ],
});

// Use with configuration
const editor = new WorkflowEditor({
    extensions: [
        ...StarterKit.configure({ parallel: false }),
        ApprovalExtension.configure({ defaultTimeout: 60000 }),
    ],
});
```

See [EXTENSIONS.md](./EXTENSIONS.md) for complete extension API documentation.

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
│   │   │   ├── execution.ts   # Execution adapters, HITL, Compaction
│   │   │   ├── storage.ts     # Persistence adapters
│   │   │   ├── memory.ts      # Memory adapters
│   │   │   └── extensions/    # TipTap-style node extensions
│   │   │       ├── index.ts       # StarterKit bundle
│   │   │       ├── AgentNodeExtension.ts
│   │   │       ├── RouterNodeExtension.ts
│   │   │       ├── ParallelNodeExtension.ts
│   │   │       ├── WhileLoopExtension.ts
│   │   │       └── ...
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
├── EXTENSIONS.md          # Extension API documentation
├── ADAPTERS.md            # Adapter interface documentation
└── README.md
```

## License

MIT
