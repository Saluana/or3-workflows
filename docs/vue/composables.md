# Vue Composables

Vue 3 composables for workflow editing, execution, and storage.

## Overview

The `@or3/workflow-vue` package provides composables that integrate the workflow engine with Vue's reactivity system.

## useEditor

Initialize and manage a WorkflowEditor instance:

```typescript
import { useEditor } from '@or3/workflow-vue';
import { StarterKit } from '@or3/workflow-core';

const { editor, isReady } = useEditor({
    extensions: [StarterKit.configure()],
    autofocus: true,
    onCreate: ({ editor }) => {
        console.log('Editor created');
    },
    onUpdate: ({ editor }) => {
        console.log('Workflow updated');
    },
});

// Wait for editor to be ready
watch(isReady, (ready) => {
    if (ready) {
        editor.value?.commands.addNode({
            /* ... */
        });
    }
});
```

### Options

```typescript
interface UseEditorOptions {
    /** Extensions to load */
    extensions: Extension[];

    /** Initial workflow data */
    content?: WorkflowData;

    /** Focus on creation */
    autofocus?: boolean;

    /** Enable/disable editing */
    editable?: boolean;

    /** Called when editor is created */
    onCreate?: (props: { editor: WorkflowEditor }) => void;

    /** Called on every change */
    onUpdate?: (props: { editor: WorkflowEditor }) => void;

    /** Called when selection changes */
    onSelectionUpdate?: (props: { editor: WorkflowEditor }) => void;

    /** Called on validation errors */
    onValidation?: (errors: ValidationError[]) => void;

    /** Called before destroy */
    onDestroy?: () => void;
}
```

### Returns

```typescript
interface UseEditorReturn {
    /** Reactive editor instance */
    editor: Ref<WorkflowEditor | undefined>;

    /** Whether editor is initialized */
    isReady: Ref<boolean>;
}
```

### Example

```vue
<script setup lang="ts">
import { useEditor } from '@or3/workflow-vue';
import { StarterKit } from '@or3/workflow-core';

const { editor, isReady } = useEditor({
    extensions: [StarterKit.configure()],
    content: {
        nodes: [{ id: 'start', type: 'start', data: { label: 'Start' } }],
    },
    onUpdate: ({ editor }) => {
        // Autosave
        localStorage.setItem('draft', JSON.stringify(editor.getJSON()));
    },
});

function addAgent() {
    editor.value?.commands.addNode({
        id: crypto.randomUUID(),
        type: 'agent',
        data: { label: 'New Agent', model: 'anthropic/claude-sonnet-4' },
    });
}
</script>

<template>
    <div v-if="isReady">
        <WorkflowCanvas :editor="editor" />
        <button @click="addAgent">Add Agent</button>
    </div>
    <div v-else>Loading...</div>
</template>
```

---

## useExecutionState

Track workflow execution state:

```typescript
import { useExecutionState } from '@or3/workflow-vue';

const {
    isExecuting,
    isPaused,
    currentNode,
    executedNodes,
    pendingNodes,
    errors,
    progress,
} = useExecutionState(editor);
```

### Returns

```typescript
interface UseExecutionStateReturn {
    /** Currently executing */
    isExecuting: ComputedRef<boolean>;

    /** Paused (e.g., waiting for HITL) */
    isPaused: ComputedRef<boolean>;

    /** Currently executing node ID */
    currentNode: ComputedRef<string | null>;

    /** Successfully executed node IDs */
    executedNodes: ComputedRef<string[]>;

    /** Nodes waiting to execute */
    pendingNodes: ComputedRef<string[]>;

    /** Execution errors */
    errors: ComputedRef<ExecutionError[]>;

    /** Progress 0-100 */
    progress: ComputedRef<number>;
}
```

### Example

```vue
<script setup lang="ts">
import { useExecutionState } from '@or3/workflow-vue';

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
import { useWorkflowExecution } from '@or3/workflow-vue';
import { OpenRouterExecutionAdapter } from '@or3/workflow-core';

const executor = new OpenRouterExecutionAdapter({
    apiKey: import.meta.env.VITE_OPENROUTER_API_KEY,
    defaultModel: 'anthropic/claude-sonnet-4',
});

const {
    execute,
    pause,
    resume,
    stop,
    state,
    messages,
    isExecuting,
    isPaused,
    error,
    hitlRequest,
    respondToHitl,
} = useWorkflowExecution(editor, executor);
```

### Options

```typescript
const {
    // ... returns
} = useWorkflowExecution(editor, executor, {
    /** Called on each message */
    onMessage: (message) => {
        console.log('Message:', message);
    },

    /** Called when execution completes */
    onComplete: (result) => {
        console.log('Complete:', result);
    },

    /** Called on error */
    onError: (error) => {
        console.error('Error:', error);
    },

    /** Called when HITL is required */
    onHitlRequest: (request) => {
        console.log('Human input needed:', request);
    },
});
```

### Returns

```typescript
interface UseWorkflowExecutionReturn {
    /** Start execution */
    execute: (input?: string) => Promise<ExecutionResult>;

    /** Pause execution */
    pause: () => void;

    /** Resume paused execution */
    resume: () => void;

    /** Stop execution */
    stop: () => void;

    /** Current execution state */
    state: Ref<ExecutionState>;

    /** Accumulated messages */
    messages: Ref<Message[]>;

    /** Whether executing */
    isExecuting: ComputedRef<boolean>;

    /** Whether paused (including HITL) */
    isPaused: ComputedRef<boolean>;

    /** Current error if any */
    error: Ref<Error | null>;

    /** Current HITL request if waiting */
    hitlRequest: Ref<HitlRequest | null>;

    /** Respond to HITL request */
    respondToHitl: (response: HitlResponse) => void;
}
```

### Example with HITL

```vue
<script setup lang="ts">
import { useWorkflowExecution } from '@or3/workflow-vue';

const { execute, messages, isExecuting, hitlRequest, respondToHitl } =
    useWorkflowExecution(editor.value!, executor);

const userInput = ref('');

async function startExecution() {
    await execute('Hello, help me with my order');
}

function submitHitlResponse() {
    if (hitlRequest.value) {
        respondToHitl({
            decision: 'approve',
            feedback: userInput.value,
        });
        userInput.value = '';
    }
}
</script>

<template>
    <div class="chat-panel">
        <!-- Messages -->
        <div v-for="msg in messages" :key="msg.id" class="message">
            {{ msg.content }}
        </div>

        <!-- HITL Dialog -->
        <div v-if="hitlRequest" class="hitl-dialog">
            <h3>Human Review Required</h3>
            <p>{{ hitlRequest.message }}</p>
            <p><strong>Context:</strong> {{ hitlRequest.context }}</p>

            <textarea v-model="userInput" placeholder="Your feedback..." />

            <div class="actions">
                <button @click="respondToHitl({ decision: 'reject' })">
                    Reject
                </button>
                <button @click="submitHitlResponse">Approve</button>
            </div>
        </div>

        <!-- Execute button -->
        <button @click="startExecution" :disabled="isExecuting">
            {{ isExecuting ? 'Executing...' : 'Start' }}
        </button>
    </div>
</template>
```

---

## useWorkflowStorage

Manage workflow persistence:

```typescript
import { useWorkflowStorage } from '@or3/workflow-vue';
import { LocalStorageAdapter } from '@or3/workflow-core';

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
import { useWorkflowStorage } from '@or3/workflow-vue';
import { LocalStorageAdapter } from '@or3/workflow-core';

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
import { useNodeState } from '@or3/workflow-vue';

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
import { useNodeState } from '@or3/workflow-vue';

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
    useEditor,
    useWorkflowExecution,
    useWorkflowStorage,
} from '@or3/workflow-vue';
import { StarterKit } from '@or3/workflow-core';

// Editor
const { editor, isReady } = useEditor({
    extensions: [StarterKit.configure()],
});

// Execution (only after editor ready)
const execution = computed(() => {
    if (!editor.value) return null;
    return useWorkflowExecution(editor.value, executor);
});

// Storage
const { workflows, save, load } = useWorkflowStorage(storage);

// Autosave on changes
watch(
    () => editor.value?.getJSON(),
    debounce((data) => {
        if (data) storage.saveAutosave(data);
    }, 1000),
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
