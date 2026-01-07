# Developer Experience Review - Technical Design

## Overview

This document provides technical design for addressing the DX issues identified across three reviews. Solutions are organized by project area to enable parallel work streams.

---

## 1. Documentation Fixes (Area: `/docs`)

### 1.1 Fix `OpenRouterExecutionAdapter` Examples

**Current Problem:**
```typescript
// docs/quick-start.md - WRONG
const adapter = new OpenRouterExecutionAdapter({
    client,
    extensions: StarterKit.configure(),
    onNodeStart: (nodeId) => console.log('Started:', nodeId),
});
```

**Actual Signature:**
```typescript
// packages/workflow-core/src/execution.ts
constructor(
    clientOrProvider: OpenRouter | LLMProvider,
    options?: ExecutionOptions
)
```

**Correct Example:**
```typescript
import OpenRouter from '@openrouter/sdk';
import { OpenRouterExecutionAdapter } from '@or3/workflow-core';

const client = new OpenRouter({ apiKey: process.env.OPENROUTER_API_KEY });
const adapter = new OpenRouterExecutionAdapter(client, {
    defaultModel: 'openai/gpt-4o-mini',
    maxRetries: 2,
});

const result = await adapter.execute(workflow, { text: 'Hello' }, {
    onNodeStart: (nodeId) => console.log('Started:', nodeId),
    onNodeFinish: (nodeId, output) => console.log('Finished:', nodeId),
    onToken: (nodeId, token) => process.stdout.write(token),
});
```

### 1.2 Vue Composable Documentation

**Files to Update:**
- `docs/vue/composables.md`

**Remove Non-Existent Options:**
```diff
// useEditor - remove these from docs:
- autofocus?: boolean
- onCreate?: (editor: WorkflowEditor) => void
- onValidation?: (errors: ValidationError[]) => void
- isReady: ComputedRef<boolean>
```

**Correct useWorkflowExecution Documentation:**
```typescript
// Actual API from packages/workflow-vue/src/composables/useWorkflowExecution.ts
interface UseWorkflowExecutionReturn {
    isRunning: Ref<boolean>;
    execute: (
        adapter: ExecutionAdapter,
        workflow: WorkflowData,
        input: ExecutionInput,
        callbacks?: ExecutionCallbacks
    ) => Promise<ExecutionResult>;
    stop: () => void;
    reset: () => void;
}
```

### 1.3 EXTENSIONS.md Alignment

**Current Problem:** Docs show optional fields, but types require them.

**Correct NodeExtension Interface:**
```typescript
interface NodeExtension {
    // Required fields
    name: string;
    type: 'node';
    label: string;
    category: string;
    inputs: NodePort[];
    outputs: NodePort[];
    defaultData: Record<string, unknown>;
    
    // Required methods
    execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<NodeExecutionResult>;
    
    validate(
        node: WorkflowNode,
        context: ValidationContext
    ): ValidationIssue[];
    
    // Optional
    description?: string;
    icon?: string;
}
```

---

## 2. Demo Composable Rename (Area: `/demo-v2`)

### 2.1 File Changes

**Rename:**
```
demo-v2/src/composables/useWorkflowExecution.ts
→ demo-v2/src/composables/useDemoExecution.ts
```

**Update Exports:**
```typescript
// demo-v2/src/composables/index.ts
export { useDemoExecution } from './useDemoExecution';
// Remove: export { useWorkflowExecution } from './useWorkflowExecution';
```

**Update Imports in App.vue:**
```typescript
// demo-v2/src/App.vue
import { useDemoExecution } from './composables';
// Change all uses of useWorkflowExecution() to useDemoExecution()
```

---

## 3. Extension Registry Bridge (Area: `/packages/workflow-core`)

### 3.1 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WorkflowEditor                            │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  this._extensions: Map<string, Extension>            │    │
│  └───────────────────────┬─────────────────────────────┘    │
│                          │                                   │
│                          │ registerExtension()               │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Also register to global extensionRegistry           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│            extensionRegistry (execution.ts)                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Map<string, NodeExtension>                          │    │
│  │  - Used by validateWorkflow()                        │    │
│  │  - Used by OpenRouterExecutionAdapter                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Implementation

**Modify `editor.ts`:**
```typescript
import { registerExtension as registerGlobalExtension } from './execution';

public registerExtension(extension: Extension): void {
    this._checkNotDestroyed();
    
    if (this._extensions.has(extension.name)) {
        console.warn(`Extension ${extension.name} already registered.`);
        return;
    }
    
    this._extensions.set(extension.name, extension);

    // NEW: Bridge to global registry for execution/validation
    if ('execute' in extension && typeof extension.execute === 'function') {
        registerGlobalExtension(extension as NodeExtension);
    }

    // ... rest of existing code
}
```

---

## 4. Configuration System (Area: `/packages/workflow-core`)

### 4.1 Default Model Configuration

**Current:**
```typescript
// execution.ts line 65
const DEFAULT_MODEL = 'z-ai/glm-4.6:exacto';
```

**Solution:**
```typescript
// execution.ts

/** Default model - can be overridden via ExecutionOptions */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export interface ExecutionOptions {
    /** Default model for nodes without explicit model */
    defaultModel?: string;
    maxRetries?: number;
    retryDelayMs?: number;
    // ... existing options
}

// In OpenRouterExecutionAdapter constructor:
constructor(
    clientOrProvider: OpenRouter | LLMProvider,
    options?: ExecutionOptions
) {
    this.options = {
        defaultModel: options?.defaultModel ?? DEFAULT_MODEL,
        maxRetries: options?.maxRetries ?? DEFAULT_MAX_RETRIES,
        // ...
    };
}

// In node execution:
private getModel(node: WorkflowNode): string {
    return node.data?.model ?? this.options.defaultModel ?? DEFAULT_MODEL;
}
```

### 4.2 StarterKit Runtime Wiring

**Current Problem:** `subflow.maxNestingDepth` is accepted but not used.

**Solution:** Pass StarterKit config to execution adapter:

```typescript
// StarterKit.ts - add static config storage
export const StarterKit = {
    name: 'starterKit',
    
    private _runtimeConfig: StarterKitOptions | null = null,
    
    configure(options: StarterKitOptions = {}): (Extension | NodeExtension)[] {
        this._runtimeConfig = options;
        // ... existing code
    },
    
    getRuntimeConfig(): StarterKitOptions | null {
        return this._runtimeConfig;
    },
};
```

**Or simpler approach - document that these are execution-level options:**

```typescript
// ExecutionOptions in types.ts
export interface ExecutionOptions {
    maxSubflowDepth?: number;  // Already exists
    // Document that this is where subflow depth is configured
}
```

---

## 5. State Management Fixes (Area: `/packages/workflow-vue`)

### 5.1 Fix useExecutionState Shared State

**Current (Problematic):**
```typescript
// Shared singleton causes bugs
const sharedState = createExecutionState();

export function useExecutionState(): UseExecutionStateReturn {
    return sharedState; // Same instance every time!
}
```

**Solution:**
```typescript
// useExecutionState.ts

/**
 * Create isolated execution state.
 * Recommended for all new code.
 */
export function createExecutionState(): UseExecutionStateReturn {
    // ... existing implementation
}

/**
 * @deprecated Use `createExecutionState()` to avoid shared state bugs.
 * This now creates fresh state each call for backward compatibility.
 */
export function useExecutionState(): UseExecutionStateReturn {
    return createExecutionState();
}
```

### 5.2 Optimize syncFromEditor

**Current (Slow):**
```typescript
const getNodeFingerprint = (n: any, status: string): string => {
    return JSON.stringify({
        type: n.type,
        position: n.position,
        data: n.data,
        selected: n.selected,
        status,
    });
};
```

**Optimized Solution:**
```typescript
// Use version counters instead of JSON.stringify

interface VersionedNode {
    id: string;
    version: number;  // Increment on any change
}

// In WorkflowEditor, add version tracking:
private nodeVersions = new Map<string, number>();

public updateNode(id: string, data: Partial<WorkflowNode>): void {
    // ... existing update logic
    this.nodeVersions.set(id, (this.nodeVersions.get(id) ?? 0) + 1);
}

// In syncFromEditor:
const getNodeFingerprint = (node: WorkflowNode, status: string): string => {
    const version = editor.getNodeVersion(node.id);
    return `${node.id}:${version}:${status}`;
};
```

---

## 6. Type Safety (Area: `/packages/workflow-core`)

### 6.1 Tool Definition Types

**Current:**
```typescript
// types.ts
tools?: any[]; // TODO: Define strict tool types
```

**Solution:**
```typescript
// types.ts

/**
 * OpenAI-compatible tool/function definition.
 */
export interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description?: string;
        parameters?: {
            type: 'object';
            properties?: Record<string, {
                type: string;
                description?: string;
                enum?: string[];
            }>;
            required?: string[];
            additionalProperties?: boolean;
        };
    };
}

// Update LLMProvider
export interface LLMProvider {
    // ...
    tools?: ToolDefinition[];
}
```

### 6.2 Export ExecutionCallbacks

**Add to index.ts:**
```typescript
// packages/workflow-core/src/index.ts
export type {
    ExecutionCallbacks,
    ExecutionResult,
    ExecutionInput,
    ExecutionOptions,
    // ... other execution types
} from './types';
```

---

## 7. Editor Lifecycle (Area: `/packages/workflow-core`)

### 7.1 Wire onUpdate/onSelectionUpdate

**Current:** Options are typed but not invoked.

**Solution in editor.ts:**
```typescript
export class WorkflowEditor {
    private options: EditorOptions;
    
    constructor(options: EditorOptions = {}) {
        this.options = options;
        // ... existing constructor code
    }
    
    public emit<T extends EditorEvent>(event: T, ...args: any[]): void {
        // Existing emit logic...
        
        // NEW: Call lifecycle callbacks
        if (event === 'update' && this.options.onUpdate) {
            this.options.onUpdate({ editor: this });
        }
        if (event === 'selectionUpdate' && this.options.onSelectionUpdate) {
            this.options.onSelectionUpdate({ editor: this });
        }
    }
}
```

---

## 8. Dynamic Node Component Registry (Area: `/packages/workflow-vue`)

### 8.1 Current (Hardcoded)

```vue
<!-- WorkflowCanvas.vue -->
<template #node-agent="nodeProps">
    <AgentNode :id="nodeProps.id" :data="nodeProps.data" />
</template>
<template #node-router="nodeProps">
    <RouterNode :id="nodeProps.id" :data="nodeProps.data" />
</template>
<!-- ... 7 more hardcoded templates -->
```

### 8.2 Proposed Solution

```typescript
// nodeRegistry.ts
import { Component, shallowRef, type ShallowRef } from 'vue';

interface NodeComponentRegistry {
    components: ShallowRef<Map<string, Component>>;
    register: (type: string, component: Component) => void;
    unregister: (type: string) => void;
    get: (type: string) => Component | undefined;
}

export function createNodeRegistry(): NodeComponentRegistry {
    const components = shallowRef(new Map<string, Component>());
    
    return {
        components,
        register(type: string, component: Component) {
            const map = new Map(components.value);
            map.set(type, component);
            components.value = map;
        },
        unregister(type: string) {
            const map = new Map(components.value);
            map.delete(type);
            components.value = map;
        },
        get(type: string) {
            return components.value.get(type);
        },
    };
}

// Pre-register built-in nodes
export const defaultNodeRegistry = createNodeRegistry();
defaultNodeRegistry.register('start', StartNode);
defaultNodeRegistry.register('agent', AgentNode);
// ... etc
```

```vue
<!-- WorkflowCanvas.vue - Dynamic rendering -->
<template>
    <VueFlow>
        <template
            v-for="[type, Component] in nodeRegistry.components.value"
            :key="type"
            #[`node-${type}`]="nodeProps"
        >
            <component
                :is="Component"
                :id="nodeProps.id"
                :data="nodeProps.data"
                :selected="nodeProps.selected"
            />
        </template>
    </VueFlow>
</template>
```

---

## 9. Testing Strategy

### Unit Tests

| Area | Test File | Tests |
|------|-----------|-------|
| Extension Bridge | `editor.test.ts` | Custom extension registered → available in extensionRegistry |
| Default Model | `execution.test.ts` | No model specified → uses configured default |
| useExecutionState | `useExecutionState.test.ts` | Two calls → independent state objects |
| Tool Types | `types.test.ts` | ToolDefinition validates correctly |

### Integration Tests

| Scenario | Test |
|----------|------|
| Custom node end-to-end | Register extension → build workflow → execute → custom node runs |
| Doc examples | Copy each quick-start example → compile → run |

---

## 10. File Change Summary

| Area | Files | Changes |
|------|-------|---------|
| Documentation | `docs/quick-start.md`, `docs/vue/composables.md`, `README.md`, `EXTENSIONS.md` | Fix API examples |
| Demo | `demo-v2/src/composables/*` | Rename useWorkflowExecution |
| Core: Extension Bridge | `packages/workflow-core/src/editor.ts` | Bridge to extensionRegistry |
| Core: Config | `packages/workflow-core/src/execution.ts` | Configurable default model |
| Core: Types | `packages/workflow-core/src/types.ts` | ToolDefinition, export types |
| Vue: State | `packages/workflow-vue/src/composables/useExecutionState.ts` | Fix shared state |
| Vue: Canvas | `packages/workflow-vue/src/components/WorkflowCanvas.vue` | (Optional) Dynamic registry |
