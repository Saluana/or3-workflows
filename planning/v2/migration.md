# Demo Migration Guide: v1 → v2

This document details the current demo implementation and provides a mapping to v2 equivalents.

---

## Current Demo Architecture

### Directory Structure

```
demo/
├── src/
│   ├── App.vue                    # Main app shell
│   ├── components/
│   │   ├── WorkflowEditor.vue     # Canvas + Vue Flow integration
│   │   ├── ChatPanel.vue          # Chat interface
│   │   ├── NodeConfigPanel.vue    # Property editor (tabs)
│   │   ├── NodePalette.vue        # Drag-and-drop source
│   │   ├── EdgeLabelEditor.vue    # Edge label popover
│   │   └── nodes/
│   │       ├── AgentNode.vue
│   │       ├── BaseNode.vue
│   │       ├── ConditionNode.vue  # ⚠️ Rename to RouterNode
│   │       ├── ParallelNode.vue
│   │       └── StartNode.vue
│   ├── composables/
│   │   ├── useUndoRedo.ts         # History management
│   │   ├── useWorkflowExecution.ts # Execution engine
│   │   ├── useWorkflowStorage.ts  # Persistence
│   │   └── useWorkflowValidation.ts # Validation
│   └── types/
│       └── workflow.ts            # Type definitions
```

---

## Component Mapping

| v1 Component | v2 Equivalent | Notes |
|--------------|---------------|-------|
| `WorkflowEditor.vue` | `<WorkflowCanvas>` + `useEditor()` | Split into component + composable |
| `ChatPanel.vue` | `<ChatPanel>` | Direct port with minor API changes |
| `NodeConfigPanel.vue` | `<NodeInspector>` | Renamed, same functionality |
| `NodePalette.vue` | `<NodePalette>` | Uses extension registry |
| `EdgeLabelEditor.vue` | `<EdgeLabelEditor>` | Direct port |
| `AgentNode.vue` | `<AgentNode>` via `AgentNodeExtension` | Registered as extension |
| `StartNode.vue` | `<StartNode>` via `StartNodeExtension` | Registered as extension |
| `ConditionNode.vue` | `<RouterNode>` via `RouterNodeExtension` | **Renamed** |
| `ParallelNode.vue` | `<ParallelNode>` via `ParallelNodeExtension` | Registered as extension |
| `BaseNode.vue` | `<NodeWrapper>` | Renamed, handles common node UI |

---

## Composable Mapping

| v1 Composable | v2 Equivalent | Notes |
|---------------|---------------|-------|
| `useUndoRedo()` | Built into `WorkflowEditor` | `editor.commands.undo()`, `editor.canUndo()` |
| `useWorkflowExecution()` | `OpenRouterExecutionAdapter` + `useExecutionState()` | Adapter pattern |
| `useWorkflowStorage()` | `LocalStorageAdapter` | Implements `StorageAdapter` interface |
| `useWorkflowValidation()` | `validateWorkflow()` function | Pure function in core |

---

## Feature Inventory

### ✅ Features to Preserve

1. **Canvas Interactions**
   - Drag-and-drop nodes from palette
   - Connect nodes via handles
   - Multi-select nodes
   - Delete nodes/edges (Delete/Backspace)
   - Duplicate nodes (Cmd/Ctrl+D)
   - Zoom/pan
   - Fit view

2. **Node Configuration**
   - Tab-based inspector (Prompt, Model, Tools, Routes/Branches)
   - Model selector dropdown
   - Tool checkboxes
   - Route/branch management (add/remove/reorder)
   - Debounced auto-save

3. **Execution**
   - Streaming responses
   - Node status indicators (idle/active/completed/error)
   - Router classification via LLM
   - Parallel branch execution
   - Merge/synthesis for parallel outputs
   - Multi-turn conversation history
   - Cancellation support
   - Retry with exponential backoff

4. **Persistence**
   - Save/load workflows
   - Export/import JSON
   - Autosave (30s interval)
   - localStorage backend

5. **Validation**
   - No start node check
   - Disconnected node check
   - Cycle detection
   - Warning for empty prompts

6. **UI/UX**
   - Dark theme
   - Mobile responsive
   - Keyboard shortcuts
   - Error toasts
   - Process flow indicator in chat

---

## Data Model Changes

### v1 Node Data (Current)

```typescript
// demo/src/types/workflow.ts
interface AgentNodeData {
  label: string
  model: string
  prompt: string
  status: NodeStatus
  tools?: string[]  // Tool IDs
}

interface ConditionNodeData {
  label: string
  status: NodeStatus
  routes?: Array<{ id: string; label: string }>
}

interface ParallelNodeData {
  label: string
  status: NodeStatus
  model?: string
  prompt?: string  // Merge prompt
  branches?: Array<{ id: string; label: string; model?: string; prompt?: string }>
}
```

### v2 Node Data (Target)

```typescript
// @or3/workflow-core
interface AgentNodeData extends BaseNodeData {
  model: string
  prompt: string
  temperature?: number
  maxTokens?: number
  tools?: string[]
}

interface RouterNodeData extends BaseNodeData {
  model?: string
  prompt?: string  // Routing instructions
  routes: RouteDefinition[]
}

interface ParallelNodeData extends BaseNodeData {
  model?: string
  prompt?: string  // Merge prompt
  branches: BranchDefinition[]
}
```

**Key Differences:**
- `ConditionNodeData` → `RouterNodeData` (rename)
- `routes` and `branches` are now required (not optional)
- Added `temperature`, `maxTokens` to agent nodes
- `RouteDefinition` can include optional `condition` for programmatic routing

---

## Migration Steps (Detailed)

### Step 1: Set Up v2 Demo Project

```bash
# Create new demo directory
mkdir demo-v2
cd demo-v2

# Initialize Vite + Vue + TypeScript
npm create vite@latest . -- --template vue-ts

# Install dependencies
npm install @vue-flow/core @vue-flow/background @vue-flow/controls
npm install @vueuse/core lucide-vue-next

# Link local packages (after building them)
npm link @or3/workflow-core @or3/workflow-vue
```

### Step 2: Copy Static Assets

```bash
# Copy styles
cp -r ../demo/src/assets ./src/

# Copy any static files
cp ../demo/public/* ./public/
```

### Step 3: Migrate App.vue

**Before (v1):**
```vue
<script setup>
import WorkflowEditor from './components/WorkflowEditor.vue'
import { useWorkflowExecution } from './composables/useWorkflowExecution'

const workflowEditor = ref(null)
const { executeWorkflow, ... } = useWorkflowExecution()

function handleSendMessage(message) {
  const nodes = workflowEditor.value.getNodes()
  const edges = workflowEditor.value.getEdges()
  executeWorkflow(message, nodes, edges)
}
</script>

<template>
  <WorkflowEditor ref="workflowEditor" />
</template>
```

**After (v2):**
```vue
<script setup>
import { WorkflowCanvas, NodeInspector, ChatPanel, NodePalette } from '@or3/workflow-vue'
import { useEditor, useExecutionState } from '@or3/workflow-vue'
import { OpenRouterExecutionAdapter } from '@or3/workflow-core'

const editor = useEditor({
  extensions: [
    StartNodeExtension,
    AgentNodeExtension,
    RouterNodeExtension,
    ParallelNodeExtension,
  ],
  content: initialWorkflow,
})

const execution = useExecutionState()
const adapter = new OpenRouterExecutionAdapter(client)

async function handleSendMessage(message) {
  await adapter.execute(editor.getJSON(), message, {
    onNodeStart: (id) => execution.setNodeStatus(id, 'active'),
    onNodeFinish: (id, output) => execution.setNodeStatus(id, 'completed'),
    onToken: (id, token) => execution.appendStreamingContent(token),
  })
}
</script>

<template>
  <WorkflowCanvas :editor="editor" />
</template>
```

### Step 4: Migrate Node Components

Node components become extensions. The Vue component is registered with the extension.

**Before (v1):**
```vue
<!-- AgentNode.vue -->
<script setup>
import { Handle, Position } from '@vue-flow/core'
defineProps(['data', 'selected'])
</script>

<template>
  <div class="agent-node" :class="{ selected }">
    <Handle type="target" :position="Position.Top" />
    <div class="content">{{ data.label }}</div>
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>
```

**After (v2):**
```typescript
// AgentNodeExtension.ts
import { NodeExtension } from '@or3/workflow-core'
import AgentNode from './AgentNode.vue'

export const AgentNodeExtension: NodeExtension = {
  name: 'agent',
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
  outputs: [{ id: 'output', type: 'output' }],
  defaultData: {
    label: 'Agent',
    model: 'openai/gpt-4o-mini',
    prompt: '',
  },
  component: AgentNode,
  async execute(context) {
    // Execution logic moved here
  },
}
```

### Step 5: Migrate Execution Logic

The `useWorkflowExecution` composable (~770 lines) becomes `OpenRouterExecutionAdapter`.

**Key functions to migrate:**
- `buildGraph()` → `OpenRouterExecutionAdapter.buildGraph()`
- `executeAgent()` → `AgentNodeExtension.execute()`
- `executeRouter()` → `RouterNodeExtension.execute()`
- `executeParallel()` → `ParallelNodeExtension.execute()`
- `executeWorkflow()` → `OpenRouterExecutionAdapter.execute()`

### Step 6: Migrate Storage

**Before (v1):**
```typescript
// useWorkflowStorage.ts
export function useWorkflowStorage() {
  function saveWorkflow(name, nodes, edges) {
    const data = { name, nodes, edges, ... }
    localStorage.setItem(`workflow-${id}`, JSON.stringify(data))
  }
  // ...
}
```

**After (v2):**
```typescript
// Use LocalStorageAdapter
import { LocalStorageAdapter } from '@or3/workflow-core'

const storage = new LocalStorageAdapter()
await storage.save(editor.getJSON())
```

---

## CSS Variables to Preserve

The demo uses CSS custom properties for theming. These should be preserved in v2:

```css
:root {
  /* Colors */
  --color-bg-primary: #0a0a0f;
  --color-bg-secondary: #12121a;
  --color-bg-tertiary: #1a1a24;
  --color-surface: rgba(255, 255, 255, 0.03);
  --color-border: rgba(255, 255, 255, 0.08);
  --color-text-primary: #ffffff;
  --color-text-secondary: #a1a1aa;
  --color-text-muted: #71717a;
  --color-accent: #8b5cf6;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Radius */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-full: 9999px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.3);
  --shadow-lg: 0 10px 15px rgba(0, 0, 0, 0.4);
  
  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 200ms ease;
  
  /* Z-index */
  --z-dropdown: 100;
  --z-modal: 200;
  --z-toast: 300;
  
  /* Mobile */
  --mobile-nav-height: 56px;
}
```

---

## Testing Checklist

After migration, verify each feature works:

### Canvas
- [ ] Drag node from palette to canvas
- [ ] Connect two nodes
- [ ] Select node (single click)
- [ ] Multi-select (shift+click or drag box)
- [ ] Delete selected (Delete/Backspace)
- [ ] Duplicate selected (Cmd/Ctrl+D)
- [ ] Undo (Cmd/Ctrl+Z)
- [ ] Redo (Cmd/Ctrl+Shift+Z)
- [ ] Zoom in/out (scroll or buttons)
- [ ] Pan (drag on empty space)
- [ ] Fit view (button)

### Node Inspector
- [ ] Click node opens inspector
- [ ] Edit label
- [ ] Change model
- [ ] Edit prompt
- [ ] Toggle tools (agent only)
- [ ] Add/remove routes (router only)
- [ ] Add/remove branches (parallel only)
- [ ] Delete node from inspector

### Chat
- [ ] Send message
- [ ] See streaming response
- [ ] See node status indicators
- [ ] Multi-turn conversation
- [ ] Error display

### Persistence
- [ ] Save workflow
- [ ] Load workflow
- [ ] Export JSON
- [ ] Import JSON
- [ ] Autosave works

### Validation
- [ ] Validate button shows modal
- [ ] Errors displayed correctly
- [ ] Warnings displayed correctly

### Mobile
- [ ] Bottom navigation works
- [ ] Editor/Chat toggle works
- [ ] Mobile menu works
- [ ] Touch interactions work

---

## Known Differences

These intentional changes from v1:

1. **Node type naming**: `condition` → `router`
2. **Extension-based architecture**: Nodes are defined as extensions, not just components
3. **Adapter pattern**: Execution and storage use adapter interfaces
4. **Core/Vue split**: Logic is in `@or3/workflow-core`, UI in `@or3/workflow-vue`
5. **Zod validation**: Schema validation uses Zod instead of manual checks
