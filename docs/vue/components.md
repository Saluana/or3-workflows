# Vue Components

Pre-built Vue 3 components for workflow visualization and interaction.

## Overview

The `or3-workflow-vue` package provides ready-to-use components for building workflow editors.

## WorkflowCanvas

The main canvas component that renders nodes and edges:

```vue
<script setup lang="ts">
import { WorkflowCanvas } from 'or3-workflow-vue';
import { useEditor } from 'or3-workflow-vue';
import { StarterKit } from 'or3-workflow-core';

const { editor } = useEditor({
    extensions: [StarterKit.configure()],
});
</script>

<template>
    <WorkflowCanvas
        v-if="editor"
        :editor="editor"
        :minimap="true"
        :controls="true"
        @node-click="handleNodeClick"
        @edge-click="handleEdgeClick"
    />
</template>
```

### Props

| Prop            | Type             | Default  | Description          |
| --------------- | ---------------- | -------- | -------------------- |
| `editor`        | `WorkflowEditor` | required | Editor instance      |
| `minimap`       | `boolean`        | `false`  | Show minimap         |
| `controls`      | `boolean`        | `true`   | Show zoom controls   |
| `snapToGrid`    | `boolean`        | `true`   | Enable grid snapping |
| `gridSize`      | `number`         | `20`     | Grid cell size       |
| `readonly`      | `boolean`        | `false`  | Disable editing      |
| `fitViewOnInit` | `boolean`        | `true`   | Fit view on load     |

### Events

| Event               | Payload            | Description         |
| ------------------- | ------------------ | ------------------- |
| `node-click`        | `{ node, event }`  | Node clicked        |
| `node-double-click` | `{ node, event }`  | Node double-clicked |
| `edge-click`        | `{ edge, event }`  | Edge clicked        |
| `pane-click`        | `{ event }`        | Canvas clicked      |
| `selection-change`  | `{ nodes, edges }` | Selection changed   |

### Slots

```vue
<WorkflowCanvas :editor="editor">
  <!-- Custom node types -->
  <template #node-custom="{ data }">
    <CustomNode :data="data" />
  </template>
  
  <!-- Custom edge labels -->
  <template #edge-label="{ edge }">
    <span class="edge-label">{{ edge.data?.label }}</span>
  </template>
</WorkflowCanvas>
```

---

## NodePalette

Draggable palette of available node types:

```vue
<script setup lang="ts">
import { NodePalette } from 'or3-workflow-vue';

const nodeTypes = [
    { type: 'agent', label: 'Agent', icon: '🤖' },
    { type: 'router', label: 'Router', icon: '🔀' },
    { type: 'parallel', label: 'Parallel', icon: '⚡' },
    { type: 'memory', label: 'Memory', icon: '🧠' },
    { type: 'tool', label: 'Tool', icon: '🔧' },
];
</script>

<template>
    <NodePalette
        :node-types="nodeTypes"
        :editor="editor"
        @node-drag-start="handleDragStart"
        @node-added="handleNodeAdded"
    />
</template>
```

### Props

| Prop        | Type             | Default  | Description     |
| ----------- | ---------------- | -------- | --------------- |
| `editor`    | `WorkflowEditor` | required | Editor instance |
| `nodeTypes` | `NodeTypeInfo[]` | required | Available nodes |
| `collapsed` | `boolean`        | `false`  | Collapsed state |

### Node Type Info

```typescript
interface NodeTypeInfo {
    type: string;
    label: string;
    icon?: string;
    description?: string;
    category?: string;
    defaultData?: Record<string, unknown>;
}
```

### Grouped Palette

```vue
<NodePalette
    :node-types="nodeTypes"
    :editor="editor"
    :grouped="true"
    :groups="[
        { id: 'core', label: 'Core Nodes' },
        { id: 'flow', label: 'Flow Control' },
        { id: 'data', label: 'Data & Memory' },
    ]"
/>
```

---

## NodeInspector

Property editor for selected nodes:

```vue
<script setup lang="ts">
import { NodeInspector } from 'or3-workflow-vue';

const selectedNode = computed(() => editor.value?.getSelectedNode());
</script>

<template>
    <NodeInspector
        v-if="selectedNode"
        :editor="editor"
        :node="selectedNode"
        @update="handleUpdate"
    />
</template>
```

### Props

| Prop     | Type             | Default  | Description     |
| -------- | ---------------- | -------- | --------------- |
| `editor` | `WorkflowEditor` | required | Editor instance |
| `node`   | `WorkflowNode`   | required | Node to inspect |

### Custom Field Renderers

```vue
<NodeInspector :editor="editor" :node="node">
  <template #field-model="{ value, update }">
    <ModelSelector :value="value" @update="update" />
  </template>
  
  <template #field-prompt="{ value, update }">
    <PromptEditor :value="value" @update="update" />
  </template>
</NodeInspector>
```

---

## Controls

Zoom and fit controls:

```vue
<script setup lang="ts">
import { Controls } from 'or3-workflow-vue';
</script>

<template>
    <Controls
        :editor="editor"
        :show-zoom="true"
        :show-fit="true"
        :show-lock="true"
        position="bottom-left"
    />
</template>
```

### Props

| Prop       | Type             | Default         | Description      |
| ---------- | ---------------- | --------------- | ---------------- |
| `editor`   | `WorkflowEditor` | required        | Editor instance  |
| `showZoom` | `boolean`        | `true`          | Show +/- buttons |
| `showFit`  | `boolean`        | `true`          | Show fit button  |
| `showLock` | `boolean`        | `false`         | Show lock button |
| `position` | `string`         | `'bottom-left'` | Control position |

---

## MiniMap

Overview minimap of the workflow:

```vue
<script setup lang="ts">
import { MiniMap } from 'or3-workflow-vue';
</script>

<template>
    <MiniMap
        :editor="editor"
        :width="200"
        :height="150"
        position="bottom-right"
        :node-color="getNodeColor"
    />
</template>

<script setup lang="ts">
function getNodeColor(node: WorkflowNode): string {
    switch (node.type) {
        case 'agent':
            return '#10b981';
        case 'router':
            return '#8b5cf6';
        case 'parallel':
            return '#f59e0b';
        default:
            return '#6b7280';
    }
}
</script>
```

### Props

| Prop        | Type             | Default          | Description         |
| ----------- | ---------------- | ---------------- | ------------------- |
| `editor`    | `WorkflowEditor` | required         | Editor instance     |
| `width`     | `number`         | `200`            | Minimap width       |
| `height`    | `number`         | `150`            | Minimap height      |
| `position`  | `string`         | `'bottom-right'` | Position            |
| `nodeColor` | `Function`       | -                | Node color function |

---

## ChatPanel

Chat interface for workflow execution:

```vue
<script setup lang="ts">
import { ChatPanel } from 'or3-workflow-vue';
import { useWorkflowExecution } from 'or3-workflow-vue';

const { execute, messages, isExecuting, hitlRequest, respondToHitl } =
    useWorkflowExecution(editor.value!, executor);
</script>

<template>
    <ChatPanel
        :messages="messages"
        :is-executing="isExecuting"
        :hitl-request="hitlRequest"
        @send="execute"
        @hitl-respond="respondToHitl"
    />
</template>
```

### Props

| Prop          | Type                  | Default               | Description       |
| ------------- | --------------------- | --------------------- | ----------------- |
| `messages`    | `Message[]`           | required              | Chat messages     |
| `isExecuting` | `boolean`             | `false`               | Execution state   |
| `hitlRequest` | `HitlRequest \| null` | `null`                | HITL request      |
| `placeholder` | `string`              | `'Type a message...'` | Input placeholder |
| `disabled`    | `boolean`             | `false`               | Disable input     |

### Events

| Event          | Payload        | Description           |
| -------------- | -------------- | --------------------- |
| `send`         | `string`       | User sends message    |
| `hitl-respond` | `HitlResponse` | User responds to HITL |
| `stop`         | -              | User clicks stop      |

### Slots

```vue
<ChatPanel :messages="messages">
  <!-- Custom message renderer -->
  <template #message="{ message }">
    <div :class="['message', message.role]">
      <MarkdownRenderer :content="message.content" />
    </div>
  </template>
  
  <!-- Custom HITL dialog -->
  <template #hitl="{ request, respond }">
    <CustomHitlDialog :request="request" @respond="respond" />
  </template>
</ChatPanel>
```

---

## ValidationOverlay

Display validation errors on the canvas:

```vue
<script setup lang="ts">
import { ValidationOverlay } from 'or3-workflow-vue';

const errors = computed(() => editor.value?.getValidationErrors() ?? []);
</script>

<template>
    <ValidationOverlay :editor="editor" :errors="errors" :show-inline="true" />
</template>
```

### Props

| Prop         | Type                | Default  | Description          |
| ------------ | ------------------- | -------- | -------------------- |
| `editor`     | `WorkflowEditor`    | required | Editor instance      |
| `errors`     | `ValidationError[]` | required | Validation errors    |
| `showInline` | `boolean`           | `true`   | Show errors on nodes |

---

## EdgeLabelEditor

Inline edge label editor:

```vue
<script setup lang="ts">
import { EdgeLabelEditor } from 'or3-workflow-vue';

const editingEdge = ref<string | null>(null);
</script>

<template>
    <EdgeLabelEditor
        v-if="editingEdge"
        :editor="editor"
        :edge-id="editingEdge"
        @save="editingEdge = null"
        @cancel="editingEdge = null"
    />
</template>
```

---

## Node Components

Built-in node components for each type:

### AgentNode

```vue
<script setup lang="ts">
import { AgentNode } from 'or3-workflow-vue';
</script>

<template>
    <AgentNode
        :id="node.id"
        :data="node.data"
        :selected="isSelected"
        :executing="isExecuting"
    />
</template>
```

### Custom Node Components

Create custom node types:

```vue
<!-- CustomNode.vue -->
<script setup lang="ts">
import { NodeWrapper } from 'or3-workflow-vue';

const props = defineProps<{
    id: string;
    data: {
        label: string;
        customField: string;
    };
    selected?: boolean;
    executing?: boolean;
}>();
</script>

<template>
    <NodeWrapper
        :id="id"
        :selected="selected"
        :executing="executing"
        class="custom-node"
    >
        <div class="header">
            <span class="icon">🎯</span>
            <span class="label">{{ data.label }}</span>
        </div>
        <div class="content">
            {{ data.customField }}
        </div>
    </NodeWrapper>
</template>

<style scoped>
.custom-node {
    background: var(--or3-node-bg);
    border: 2px solid var(--or3-node-border);
    border-radius: var(--or3-radius-md);
}

.custom-node.selected {
    border-color: var(--or3-primary);
}
</style>
```

Register with editor:

```typescript
import { WorkflowEditor, Extension } from 'or3-workflow-core';
import CustomNode from './CustomNode.vue';

const CustomNodeExtension = Extension.create({
    name: 'customNode',

    addNodeTypes() {
        return {
            custom: {
                component: CustomNode,
                defaultData: {
                    label: 'Custom',
                    customField: '',
                },
            },
        };
    },
});
```

---

## Complete Layout Example

```vue
<script setup lang="ts">
import {
    WorkflowCanvas,
    NodePalette,
    NodeInspector,
    ChatPanel,
    Controls,
    MiniMap,
} from 'or3-workflow-vue';
</script>

<template>
    <div class="workflow-editor">
        <!-- Left sidebar -->
        <aside class="sidebar left">
            <NodePalette :editor="editor" :node-types="nodeTypes" />
        </aside>

        <!-- Main canvas -->
        <main class="canvas-area">
            <WorkflowCanvas :editor="editor" />
            <Controls :editor="editor" position="bottom-left" />
            <MiniMap :editor="editor" position="bottom-right" />
        </main>

        <!-- Right sidebar -->
        <aside class="sidebar right">
            <NodeInspector
                v-if="selectedNode"
                :editor="editor"
                :node="selectedNode"
            />
            <ChatPanel
                :messages="messages"
                :is-executing="isExecuting"
                @send="execute"
            />
        </aside>
    </div>
</template>

<style scoped>
.workflow-editor {
    display: grid;
    grid-template-columns: 250px 1fr 350px;
    height: 100vh;
}

.sidebar {
    background: var(--or3-bg-secondary);
    border: 1px solid var(--or3-border);
}

.canvas-area {
    position: relative;
    overflow: hidden;
}
</style>
```

## Next Steps

-   [Theming](../theming.md) - Customize appearance
-   [Composables](./composables.md) - Vue composables
