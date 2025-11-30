# Quick Start

Build your first workflow in 5 minutes.

## 1. Setup the Editor

```typescript
import { WorkflowEditor, StarterKit } from '@or3/workflow-core';

const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});
```

## 2. Create a Workflow

```typescript
// Create nodes
editor.commands.createNode('start', { label: 'Start' }, { x: 100, y: 100 });
editor.commands.createNode(
    'agent',
    {
        label: 'Assistant',
        model: 'openai/gpt-4o',
        prompt: 'You are a helpful assistant.',
    },
    { x: 100, y: 250 }
);

// Connect them
const startNode = editor.nodes.find((n) => n.type === 'start');
const agentNode = editor.nodes.find((n) => n.type === 'agent');

if (startNode && agentNode) {
    editor.commands.createEdge(startNode.id, agentNode.id);
}
```

## 3. Add Vue Components

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
    WorkflowCanvas,
    NodePalette,
    NodeInspector,
    useEditor,
} from '@or3/workflow-vue';

const editor = useEditor();
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

## 4. Execute the Workflow

```typescript
import { OpenRouterExecutionAdapter, StarterKit } from '@or3/workflow-core';
import OpenRouter from '@openrouter/sdk';

const client = new OpenRouter({ apiKey: 'your-api-key' });

const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),
    onNodeStart: (nodeId) => console.log('Started:', nodeId),
    onNodeComplete: (nodeId) => console.log('Completed:', nodeId),
    onStreamChunk: (chunk) => process.stdout.write(chunk),
});

const result = await adapter.execute({
    nodes: editor.nodes,
    edges: editor.edges,
    input: 'Hello, how can you help me today?',
});

console.log('Final output:', result.output);
```

## 5. Save and Load

```typescript
import { LocalStorageAdapter } from '@or3/workflow-core';

const storage = new LocalStorageAdapter();

// Save
const workflow = editor.getJSON();
const id = await storage.save(workflow);

// Load
const saved = await storage.load(id);
editor.load(saved);
```

## Complete Example

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
    WorkflowCanvas,
    NodePalette,
    NodeInspector,
    ChatPanel,
    useEditor,
    useWorkflowExecution,
    useWorkflowStorage,
    createExecutionState,
} from '@or3/workflow-vue';
import { LocalStorageAdapter, StarterKit } from '@or3/workflow-core';

// Editor setup
const editor = useEditor({
    extensions: StarterKit.configure({
        agent: { defaultModel: 'openai/gpt-4o-mini' },
    }),
});

// Storage
const storage = new LocalStorageAdapter();
const { save, load } = useWorkflowStorage(storage);

// Execution state
const executionState = createExecutionState();
const { execute, stop, isRunning } = useWorkflowExecution();

// API key (use env var in production!)
const apiKey = ref('');

// Handle chat messages
async function onSendMessage(message: string) {
    if (!editor.value) return;

    await execute(
        apiKey.value,
        editor.value.nodes,
        editor.value.edges,
        message,
        [],
        {
            onNodeStatus: (id, status) => {
                executionState.nodeStatuses.value[id] = status;
            },
            onStreamingContent: (content) => {
                executionState.streamingContent.value = content;
            },
            onAppendContent: (chunk) => {
                executionState.streamingContent.value += chunk;
            },
        }
    );
}

// Load autosave on mount
onMounted(async () => {
    const autosave = storage.loadAutosave();
    if (autosave) {
        editor.value?.load(autosave);
    }
});
</script>

<template>
    <div class="app">
        <aside class="sidebar">
            <NodePalette />
        </aside>

        <main class="canvas">
            <WorkflowCanvas
                :editor="editor"
                :node-statuses="executionState.nodeStatuses.value"
            />
        </main>

        <aside class="panel">
            <NodeInspector :editor="editor" />
            <ChatPanel
                :messages="[]"
                :is-executing="isRunning"
                :streaming-content="executionState.streamingContent.value"
                @send="onSendMessage"
                @stop="stop"
            />
        </aside>
    </div>
</template>

<style>
.app {
    display: grid;
    grid-template-columns: 200px 1fr 350px;
    height: 100vh;
}

.sidebar,
.panel {
    background: var(--or3-color-bg-secondary);
    border-right: 1px solid var(--or3-color-border);
}

.panel {
    border-right: none;
    border-left: 1px solid var(--or3-color-border);
}
</style>
```

## Next Steps

-   [WorkflowEditor](./api/workflow-editor.md) - Full editor API
-   [Extensions](./api/extensions.md) - Node extension system
-   [Execution](./api/execution.md) - Execution adapter
-   [Theming](./theming.md) - Customize the look
