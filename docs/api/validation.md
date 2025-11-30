# Validation

Validate workflows before execution to catch configuration errors and potential issues.

## Import

```typescript
import { validateWorkflow } from '@or3/workflow-core';
```

## Basic Usage

```typescript
const result = validateWorkflow(editor.nodes, editor.edges);

if (!result.isValid) {
    console.error('Validation errors:', result.errors);
}

if (result.warnings.length > 0) {
    console.warn('Warnings:', result.warnings);
}
```

## ValidationResult

```typescript
interface ValidationResult {
    /** True if no errors (warnings are allowed) */
    isValid: boolean;

    /** Critical errors that prevent execution */
    errors: ValidationError[];

    /** Non-critical issues */
    warnings: ValidationWarning[];
}

interface ValidationError {
    type: 'error';
    code: string;
    nodeId?: string;
    message: string;
}

interface ValidationWarning {
    type: 'warning';
    code: string;
    nodeId?: string;
    message: string;
}
```

## Error Codes

### Structure Errors

| Code                   | Description                      |
| ---------------------- | -------------------------------- |
| `NO_START_NODE`        | Workflow has no start node       |
| `MULTIPLE_START_NODES` | More than one start node         |
| `DISCONNECTED_NODE`    | Node is not reachable from start |
| `CYCLE_DETECTED`       | Workflow contains a cycle        |

### Node Configuration Errors

| Code               | Description                          |
| ------------------ | ------------------------------------ |
| `MISSING_MODEL`    | Agent node has no model selected     |
| `NO_INCOMING_EDGE` | Non-start node has no incoming edges |
| `NO_OUTGOING_EDGE` | Start node has no outgoing edges     |
| `INVALID_SUBFLOW`  | Subflow reference is invalid         |
| `MISSING_ROUTE`    | Router has no routes defined         |

## Warning Codes

| Code                   | Description                                |
| ---------------------- | ------------------------------------------ |
| `EMPTY_PROMPT`         | Agent node has no prompt                   |
| `DEAD_END_NODE`        | Node has no outgoing edges (except output) |
| `MISSING_EDGE_LABEL`   | Router edge has no label                   |
| `MISSING_MERGE_PROMPT` | Parallel node has no merge prompt          |

## Validation Rules

### Start Node

-   Exactly one start node required
-   Must have at least one outgoing edge

```typescript
// ❌ Error: No start node
const nodes = [
  { type: 'agent', ... }
];

// ❌ Error: Multiple start nodes
const nodes = [
  { type: 'start', id: '1', ... },
  { type: 'start', id: '2', ... },
];

// ❌ Error: Start with no outputs
const nodes = [{ type: 'start', id: '1', ... }];
const edges = []; // No edges from start
```

### Connectivity

-   All nodes must be reachable from start
-   Cycles are reported as warnings (loops are allowed)

```typescript
// ❌ Error: Disconnected node
const nodes = [
  { type: 'start', id: 'start', ... },
  { type: 'agent', id: 'agent1', ... },
  { type: 'agent', id: 'agent2', ... }, // Not connected
];
const edges = [
  { source: 'start', target: 'agent1' },
  // agent2 has no path from start
];
```

### Agent Nodes

-   Must have a model configured
-   Should have a prompt (warning if empty)

```typescript
// ❌ Error: No model
const node = {
    type: 'agent',
    data: { label: 'Agent', model: '' },
};

// ⚠️ Warning: No prompt
const node = {
    type: 'agent',
    data: { label: 'Agent', model: 'openai/gpt-4o', prompt: '' },
};
```

### Router Nodes

-   Must have at least one route defined
-   Each route edge should have a label

```typescript
// ❌ Error: No routes
const node = {
    type: 'router',
    data: { routes: [] },
};

// ⚠️ Warning: Missing label
const edge = { source: 'router', target: 'next' };
// Should have label to indicate which route
```

### Parallel Nodes

-   Should have a merge prompt (warning if missing)
-   Should have at least 2 branches

```typescript
// ⚠️ Warning: Less than 2 branches
const node = {
    type: 'parallel',
    data: { branches: [{ id: 'b1', label: 'Only One' }] },
};
```

## Extension Validation

Extensions can provide custom validation:

```typescript
const MyExtension: Extension = {
    name: 'custom',
    type: 'custom',

    validate(node, workflow) {
        const issues = [];

        if (!node.data.customField) {
            issues.push({
                type: 'error',
                code: 'MISSING_CUSTOM_FIELD',
                nodeId: node.id,
                message: 'Custom field is required',
            });
        }

        return issues;
    },
};
```

## Using with Vue

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { validateWorkflow } from '@or3/workflow-core';
import { useEditor } from '@or3/workflow-vue';

const editor = useEditor();

const validation = computed(() =>
    validateWorkflow(editor.value?.nodes ?? [], editor.value?.edges ?? [])
);

function handleExecute() {
    if (!validation.value.isValid) {
        alert('Please fix validation errors first');
        return;
    }
    // Execute workflow
}
</script>

<template>
    <div v-if="!validation.isValid" class="errors">
        <div v-for="error in validation.errors" :key="error.code" class="error">
            {{ error.message }}
        </div>
    </div>

    <div v-if="validation.warnings.length" class="warnings">
        <div
            v-for="warning in validation.warnings"
            :key="warning.code"
            class="warning"
        >
            {{ warning.message }}
        </div>
    </div>
</template>
```

## ValidationOverlay Component

The Vue package includes a ready-to-use validation overlay:

```vue
<template>
    <ValidationOverlay
        :errors="validation.errors"
        :warnings="validation.warnings"
        :show="showValidation"
        @close="showValidation = false"
    />
</template>
```

## Best Practices

### 1. Validate Before Execution

```typescript
async function executeWorkflow() {
    const result = validateWorkflow(nodes, edges);

    if (!result.isValid) {
        throw new Error('Invalid workflow');
    }

    await adapter.execute({ nodes, edges, input });
}
```

### 2. Show Warnings

Warnings don't block execution but may indicate issues:

```typescript
if (result.warnings.length > 0) {
    const proceed = confirm(
        `There are ${result.warnings.length} warnings. Continue anyway?`
    );
    if (!proceed) return;
}
```

### 3. Highlight Problem Nodes

Use `nodeId` to highlight nodes with issues:

```typescript
const errorNodeIds = result.errors.filter((e) => e.nodeId).map((e) => e.nodeId);

// In your canvas, add error styling to these nodes
```

## Next Steps

-   [Execution](./execution.md) - Running workflows
-   [Extensions](./extensions.md) - Custom validation
