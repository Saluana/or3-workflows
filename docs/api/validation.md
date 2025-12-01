# Validation

Validate workflows before execution to catch configuration errors and potential issues.

## Import

```typescript
import { validateWorkflow, type ValidationContext } from '@or3/workflow-core';
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

## Validation with Context

For deeper validation (e.g., subflow resolution, port validation), pass a `ValidationContext`:

```typescript
import { validateWorkflow, extensionRegistry } from '@or3/workflow-core';

const context: ValidationContext = {
    subflowRegistry: mySubflowRegistry,
    defaultModel: 'openai/gpt-4o',
    extensionRegistry: extensionRegistry,
};

const result = validateWorkflow(editor.nodes, editor.edges, context);
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
    code: ValidationErrorCode;
    nodeId?: string;
    edgeId?: string;
    message: string;
}

interface ValidationWarning {
    type: 'warning';
    code: ValidationWarningCode;
    nodeId?: string;
    edgeId?: string;
    message: string;
}
```

## ValidationContext

Optional context for deep validation:

```typescript
interface ValidationContext {
    /** Registry for resolving subflow references */
    subflowRegistry?: SubflowRegistry;

    /** Default model to use when node doesn't specify one */
    defaultModel?: string;

    /** Extension registry for port/handle validation */
    extensionRegistry?: Map<string, NodeExtension>;
}
```

## Error Codes

### Structure Errors

| Code                   | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| `NO_START_NODE`        | Workflow has no start node                                 |
| `MULTIPLE_START_NODES` | More than one start node                                   |
| `DISCONNECTED_NODE`    | Node is not reachable from start                           |
| `CYCLE_DETECTED`       | Workflow contains a cycle                                  |
| `DANGLING_EDGE`        | Edge references non-existent source or target node         |
| `UNKNOWN_HANDLE`       | Edge references unknown input/output handle on a node      |
| `MISSING_REQUIRED_PORT`| Node has a required input port with no incoming connection |

### Node Configuration Errors

| Code                   | Description                            |
| ---------------------- | -------------------------------------- |
| `MISSING_MODEL`        | Agent node has no model selected       |
| `MISSING_PROMPT`       | Agent node has no prompt               |
| `MISSING_SUBFLOW_ID`   | Subflow node has no subflowId          |
| `SUBFLOW_NOT_FOUND`    | Subflow reference not found in registry|
| `MISSING_INPUT_MAPPING`| Required subflow input not mapped      |
| `MISSING_OPERATION`    | Memory node has no operation           |
| `INVALID_LIMIT`        | Memory node has invalid limit value    |
| `MISSING_CONDITION_PROMPT` | While loop has no condition prompt |
| `INVALID_MAX_ITERATIONS`| While loop has invalid max iterations |
| `MISSING_BODY`         | While loop missing body connection     |
| `MISSING_EXIT`         | While loop missing exit connection     |
| `INVALID_CONNECTION`   | General invalid connection error       |

## Warning Codes

| Code                      | Description                                |
| ------------------------- | ------------------------------------------ |
| `EMPTY_PROMPT`            | Agent node has no prompt                   |
| `DEAD_END_NODE`           | Node has no outgoing edges (except output) |
| `MISSING_EDGE_LABEL`      | Router edge has no label                   |
| `DISCONNECTED_COMPONENTS` | Workflow has disconnected node groups      |
| `NO_SUBFLOW_OUTPUTS`      | Subflow has no output nodes                |
| `NO_REGISTRY`             | Subflow registry not provided              |
| `NO_INPUT`                | Node expects input but has none            |
| `NO_OUTPUT`               | Node expects output but has none           |
| `MISSING_BODY`            | While loop body port not connected         |
| `MISSING_EXIT`            | While loop exit port not connected         |
| `UNREACHABLE_NODE`        | Node cannot be reached from start          |

## Dynamic Port Validation

The validator checks edge handles against node port definitions:

-   **Output handles** are validated against the node's static outputs and dynamic outputs (e.g., router routes, parallel branches)
-   **Input handles** are validated against the node's static inputs and dynamic inputs (e.g., while loop body/exit)
-   The special `error` handle is always allowed for error branching

```typescript
// Example: Router with dynamic output ports
const node = {
    type: 'router',
    data: {
        routes: [
            { id: 'support', label: 'Support' },
            { id: 'sales', label: 'Sales' },
        ],
    },
};

// Valid edge handles: 'support', 'sales', 'error'
const edge = { source: routerId, target: nextId, sourceHandle: 'support' };
```

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
-   Cycles are reported with the full cycle path for debugging
-   Disconnected components are detected and reported

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

### Topological Sort

The validator uses Kahn's algorithm to perform topological sorting, which:

1. **Detects cycles**: Returns a cycle path like `"node1 → node2 → node3 → node1"`
2. **Finds execution order**: Provides the correct order to execute nodes
3. **Validates DAG structure**: Ensures the workflow is a directed acyclic graph

```typescript
// Cycle detection with path
const result = validateWorkflow(nodes, edges);
// If cycle exists: "Cycle detected: router → agent1 → agent2 → router"
```

### Connected Components

The validator analyzes graph connectivity to detect:

-   **Disconnected nodes**: Individual nodes not reachable from start
-   **Disconnected components**: Groups of nodes that form their own subgraphs

```typescript
// ⚠️ Warning: Disconnected components
// Workflow has 2 disconnected component(s) not reachable from start
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

Extensions can provide custom validation with access to the validation context:

```typescript
const MyExtension: NodeExtension = {
    name: 'custom',
    type: 'node',
    inputs: [{ id: 'input', label: 'Input', type: 'input', required: true }],
    outputs: [{ id: 'output', label: 'Output', type: 'output' }],
    defaultData: { label: 'Custom' },

    validate(node, edges, context?: ValidationContext) {
        const issues: (ValidationError | ValidationWarning)[] = [];

        if (!node.data.customField) {
            issues.push({
                type: 'error',
                code: 'INVALID_CONNECTION',
                nodeId: node.id,
                message: 'Custom field is required',
            });
        }

        // Use context for deep validation
        if (context?.subflowRegistry && node.data.subflowRef) {
            if (!context.subflowRegistry.has(node.data.subflowRef)) {
                issues.push({
                    type: 'error',
                    code: 'SUBFLOW_NOT_FOUND',
                    nodeId: node.id,
                    message: `Subflow "${node.data.subflowRef}" not found`,
                });
            }
        }

        return issues;
    },

    async execute(context, node, provider) {
        // Execution logic
        return { output: context.input, nextNodes: [] };
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
