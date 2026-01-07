# Quick Start

Build your first workflow in 5 minutes.

## 1. Setup the Editor

```typescript
import { WorkflowEditor, StarterKit } from 'or3-workflow-core';

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
    useWorkflowEditor,
} from 'or3-workflow-vue';

const editor = useWorkflowEditor();
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
import { OpenRouterExecutionAdapter } from 'or3-workflow-core';
import OpenRouter from '@openrouter/sdk';

const client = new OpenRouter({ apiKey: 'your-api-key' });

const adapter = new OpenRouterExecutionAdapter(client, {
    defaultModel: 'openai/gpt-4o-mini',
    maxRetries: 2,
});

const workflow = editor.getJSON();

const result = await adapter.execute(
    workflow,
    { text: 'Hello, how can you help me today?' },
    {
        onNodeStart: (nodeId) => console.log('Started:', nodeId),
        onNodeFinish: (nodeId, output) =>
            console.log(`Completed ${nodeId}: ${output}`),
        onNodeError: (nodeId, error) =>
            console.error(`Error in ${nodeId}`, error),
        onToken: (nodeId, token) => process.stdout.write(token),
    }
);

console.log('Final output:', result.output);
```

## 5. Save and Load

```typescript
import { LocalStorageAdapter } from 'or3-workflow-core';

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
    useWorkflowEditor,
    useWorkflowExecution,
    useWorkflowStorage,
} from 'or3-workflow-vue';
import OpenRouter from '@openrouter/sdk';
import { LocalStorageAdapter, StarterKit, OpenRouterExecutionAdapter } from 'or3-workflow-core';

// Editor setup
const editor = useWorkflowEditor({
    extensions: StarterKit.configure({
        agent: { defaultModel: 'openai/gpt-4o-mini' },
    }),
});

// Storage
const storage = new LocalStorageAdapter();
const { save, load } = useWorkflowStorage(storage);

// Execution
const { execute, stop, isRunning, nodeStatuses, result } = useWorkflowExecution();
const streamingContent = ref('');
let adapter: OpenRouterExecutionAdapter | null = null;

// API key (avoid storing in localStorage outside of local demos)
const apiKey = ref('');

// Handle chat messages
async function onSendMessage(message: string) {
    if (!editor.value) return;

    const client = new OpenRouter({ apiKey: apiKey.value });
    adapter = new OpenRouterExecutionAdapter(client, {
        defaultModel: 'openai/gpt-4o-mini',
    });

    streamingContent.value = '';

    await execute(
        adapter,
        editor.value.getJSON(),
        { text: message },
        {
            onToken: (_nodeId, token) => {
                streamingContent.value += token;
            },
        }
    );
}

function handleStop() {
    if (adapter) {
        stop(adapter);
    }
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
                :node-statuses="nodeStatuses.value"
            />
        </main>

        <aside class="panel">
            <NodeInspector :editor="editor" />
            <ChatPanel
                :messages="[]"
                :is-executing="isRunning"
                :streaming-content="streamingContent"
                @send="onSendMessage"
                @stop="handleStop"
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

## Security Considerations

-   Avoid persisting API keys in `localStorage` except for local demos. Use environment variables or encrypted server storage instead.
-   For production apps, proxy OpenRouter requests through a backend service so keys and request signing stay on the server.
