# Vue Composables

Vue 3 composables for workflow editing, execution, and storage.

## Overview

The `or3-workflow-vue` package provides composables that integrate the workflow engine with Vue's reactivity system.

## useWorkflowEditor

Create and manage a `WorkflowEditor` instance with Vue reactivity:

```typescript
import { useWorkflowEditor } from 'or3-workflow-vue';
import { StarterKit } from 'or3-workflow-core';

const editor = useWorkflowEditor({
    extensions: StarterKit.configure(),
    content: {
        nodes: [{ id: 'start', type: 'start', data: { label: 'Start' } }],
        edges: [],
        meta: { version: '2.0.0', name: 'Example' },
    },
    onUpdate: ({ editor }) => {
        console.log('Workflow updated', editor.getJSON());
    },
    onSelectionUpdate: ({ editor }) => {
        console.log('Selection changed', editor.getSelected());
    },
});
```

### Options

```typescript
interface UseWorkflowEditorOptions {
    /** Extensions to load */
    extensions?: Extension[];

    /** Initial workflow data */
    content?: WorkflowData;

    /** Called on every change */
    onUpdate?: (props: { editor: WorkflowEditor }) => void;

    /** Called when selection changes */
    onSelectionUpdate?: (props: { editor: WorkflowEditor }) => void;
}
```

### Returns

```typescript
type UseWorkflowEditorReturn = import('vue').ShallowRef<WorkflowEditor | null>;
```

### Example

```vue
<script setup lang="ts">
import { WorkflowCanvas } from 'or3-workflow-vue';
import { useWorkflowEditor } from 'or3-workflow-vue';
import { StarterKit } from 'or3-workflow-core';

const editor = useWorkflowEditor({
    extensions: StarterKit.configure(),
});

function addAgent() {
    editor.value?.commands.createNode(
        'agent',
        { label: 'New Agent', model: 'anthropic/claude-3.5-sonnet' },
        { x: 200, y: 300 }
    );
}
</script>

<template>
    <div v-if="editor">
        <WorkflowCanvas :editor="editor" />
        <button @click="addAgent">Add Agent</button>
    </div>
</template>
```

`useEditor` remains exported as a compatibility alias, but `useWorkflowEditor` is the recommended import.

---

## useExecutionState

Track workflow execution state:

```typescript
import { useExecutionState } from 'or3-workflow-vue';

const { state, setRunning, setNodeStatus, setError, reset } =
    useExecutionState();
```

### Returns

```typescript
interface UseExecutionStateReturn {
    state: DeepReadonly<Ref<ExecutionState>>;
    setRunning: (isRunning: boolean) => void;
    setStreamingContent: (content: string) => void;
    appendStreamingContent: (content: string) => void;
    setNodeStatus: (
        nodeId: string,
        status: 'idle' | 'active' | 'completed' | 'error'
    ) => void;
    setCurrentNodeId: (nodeId: string | null) => void;
    setError: (error: Error | null) => void;
    reset: () => void;
}
```

### Example

```vue
<script setup lang="ts">
import { useExecutionState } from 'or3-workflow-vue';

const props = defineProps<{ editor: WorkflowEditor }>();
const { isExecuting, currentNode, progress, errors } = useExecutionState(
    props.editor
);
</script>

<template>
    <div class="execution-status">
        <div v-if="isExecuting" class="progress-bar">
            <div :style="{ width: `${progress}%` }" />
            <span>{{ progress }}%</span>
        </div>

        <div v-if="currentNode" class="current">
            Executing: {{ currentNode }}
        </div>

        <div v-if="errors.length" class="errors">
            <div v-for="error in errors" :key="error.nodeId" class="error">
                {{ error.message }}
            </div>
        </div>
    </div>
</template>
```

---

## useWorkflowExecution

Execute workflows with reactive state:

```typescript
import { useWorkflowExecution } from 'or3-workflow-vue';
import { OpenRouterExecutionAdapter } from 'or3-workflow-core';

const {
    execute,
    stop,
    reset,
    isRunning,
    currentNodeId,
    nodeStatuses,
    nodeOutputs,
    error,
    result,
} = useWorkflowExecution();
```

### Usage

```typescript
const adapter = new OpenRouterExecutionAdapter(client, {
    defaultModel: 'openai/gpt-4o-mini',
});

await execute(
    adapter,
    workflow,
    { text: 'Hello' },
    {
        onNodeFinish: (nodeId, output) => {
            console.log(nodeId, output);
        },
        onToken: (_nodeId, token) => {
            streamingContent.value += token;
        },
    }
);
```

### Returns

```typescript
interface UseWorkflowExecutionReturn {
    // State
    isRunning: Ref<boolean>;
    currentNodeId: Ref<string | null>;
    nodeStatuses: Ref<Record<string, NodeStatus>>;
    nodeOutputs: Ref<Record<string, string>>;
    error: Ref<Error | null>;
    result: Ref<ExecutionResult | null>;

    // Actions
    execute: (
        adapter: ExecutionAdapter,
        workflow: WorkflowData,
        input: ExecutionInput,
        callbacks?: Partial<ExecutionCallbacks>
    ) => Promise<ExecutionResult>;
    stop: (adapter: ExecutionAdapter) => void;
    reset: () => void;
}
```

### Example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import OpenRouter from '@openrouter/sdk';
import { OpenRouterExecutionAdapter } from 'or3-workflow-core';
import { useWorkflowExecution, useWorkflowEditor } from 'or3-workflow-vue';

const editor = useWorkflowEditor();
const { execute, stop, isRunning, nodeStatuses, nodeOutputs, result } =
    useWorkflowExecution();

const streamingContent = ref('');

const client = new OpenRouter({
    apiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
});
const adapter = new OpenRouterExecutionAdapter(client, {
    defaultModel: 'openai/gpt-4o-mini',
});

async function run(message: string) {
    if (!editor.value) return;
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
</script>

<template>
    <div class="chat-panel">
        <div v-for="(output, nodeId) in nodeOutputs" :key="nodeId">
            <strong>{{ nodeId }}</strong
            >: {{ output }}
        </div>

        <button @click="run('Hello')" :disabled="isRunning">
            {{ isRunning ? 'Executing...' : 'Run' }}
        </button>
        <button @click="stop(adapter)" :disabled="!isRunning">Stop</button>

        <div class="streaming">{{ streamingContent }}</div>
        <div v-if="result">Final Output: {{ result.output }}</div>
    </div>
</template>
```

---

## useWorkflowStorage

Manage workflow persistence:

```typescript
import { useWorkflowStorage } from 'or3-workflow-vue';
import { LocalStorageAdapter } from 'or3-workflow-core';

const storage = new LocalStorageAdapter();
const {
    workflows,
    currentWorkflow,
    isLoading,
    error,
    loadList,
    load,
    save,
    remove,
    exportWorkflow,
    importWorkflow,
} = useWorkflowStorage(storage);
```

### Returns

```typescript
interface UseWorkflowStorageReturn {
    /** List of saved workflows */
    workflows: Ref<WorkflowSummary[]>;

    /** Currently loaded workflow ID */
    currentWorkflow: Ref<string | null>;

    /** Loading state */
    isLoading: Ref<boolean>;

    /** Current error */
    error: Ref<Error | null>;

    /** Load workflow list */
    loadList: () => Promise<void>;

    /** Load a specific workflow */
    load: (id: string) => Promise<WorkflowData | null>;

    /** Save workflow */
    save: (data: WorkflowData, id?: string) => Promise<string>;

    /** Delete workflow */
    remove: (id: string) => Promise<void>;

    /** Export as JSON string */
    exportWorkflow: (id: string) => Promise<string>;

    /** Import from JSON string */
    importWorkflow: (json: string) => Promise<string>;
}
```

### Example

```vue
<script setup lang="ts">
import { useWorkflowStorage } from 'or3-workflow-vue';
import { LocalStorageAdapter } from 'or3-workflow-core';

const storage = new LocalStorageAdapter();
const { workflows, isLoading, loadList, load, save, remove } =
    useWorkflowStorage(storage);

onMounted(() => loadList());

async function handleSave() {
    if (editor.value) {
        const id = await save(editor.value.getJSON());
        console.log('Saved as:', id);
    }
}

async function handleLoad(id: string) {
    const data = await load(id);
    if (data) {
        editor.value?.load(data);
    }
}

async function handleDelete(id: string) {
    if (confirm('Delete this workflow?')) {
        await remove(id);
        await loadList();
    }
}
</script>

<template>
    <div class="workflow-list">
        <div v-if="isLoading">Loading...</div>

        <div v-for="wf in workflows" :key="wf.id" class="workflow-item">
            <span>{{ wf.name }}</span>
            <span>{{ wf.nodeCount }} nodes</span>
            <button @click="handleLoad(wf.id)">Load</button>
            <button @click="handleDelete(wf.id)">Delete</button>
        </div>

        <button @click="handleSave">Save Current</button>
    </div>
</template>
```

---

## useNodeState

Track individual node state:

```typescript
import { useNodeState } from 'or3-workflow-vue';

const { isSelected, isExecuting, hasError, validationErrors } = useNodeState(
    editor,
    nodeId
);
```

### Returns

```typescript
interface UseNodeStateReturn {
    /** Node is selected */
    isSelected: ComputedRef<boolean>;

    /** Node is currently executing */
    isExecuting: ComputedRef<boolean>;

    /** Node has execution error */
    hasError: ComputedRef<boolean>;

    /** Node's validation errors */
    validationErrors: ComputedRef<ValidationError[]>;

    /** Node's execution result */
    result: ComputedRef<NodeResult | null>;
}
```

### Example

```vue
<script setup lang="ts">
import { useNodeState } from 'or3-workflow-vue';

const props = defineProps<{
    editor: WorkflowEditor;
    nodeId: string;
}>();

const { isSelected, isExecuting, hasError, validationErrors } = useNodeState(
    props.editor,
    props.nodeId
);
</script>

<template>
    <div
        :class="[
            'node',
            { selected: isSelected },
            { executing: isExecuting },
            { error: hasError },
        ]"
    >
        <slot />

        <div v-if="validationErrors.length" class="validation-errors">
            <span v-for="error in validationErrors" :key="error.message">
                {{ error.message }}
            </span>
        </div>
    </div>
</template>
```

---

## Composable Patterns

### Combining Composables

```vue
<script setup lang="ts">
import {
    useWorkflowEditor,
    useWorkflowExecution,
    useWorkflowStorage,
} from 'or3-workflow-vue';
import { StarterKit, LocalStorageAdapter } from 'or3-workflow-core';

// Editor
const editor = useWorkflowEditor({
    extensions: StarterKit.configure(),
});

// Execution
const execution = useWorkflowExecution();

// Storage
const storage = new LocalStorageAdapter();
const { workflows, save, load } = useWorkflowStorage(storage);

// Autosave on changes
watch(
    () => editor.value?.getJSON(),
    (data) => {
        if (data) storage.saveAutosave(data);
    },
    { deep: true }
);
</script>
```

### Dependency Injection

```typescript
// Provide at app level
const executorKey = Symbol('executor') as InjectionKey<ExecutionAdapter>;

// App.vue
provide(executorKey, executor);

// Child components
const executor = inject(executorKey)!;
const { execute } = useWorkflowExecution(editor, executor);
```

## Next Steps

-   [Vue Components](./components.md) - Component documentation
-   [Theming](../theming.md) - Customize appearance
