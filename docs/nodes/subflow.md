# Subflow Node

Execute nested workflows as reusable components.

## Overview

Subflow nodes embed entire workflows within other workflows. Perfect for reusable components, modular design, and complex pipelines.

## Import

```typescript
import {
    SubflowExtension,
    DefaultSubflowRegistry,
    type SubflowDefinition,
} from 'or3-workflow-core';
```

## Configuration

```typescript
interface SubflowNodeData {
    /** Display label */
    label: string;

    /** Reference to subflow definition */
    subflowId: string;

    /** Input mappings from parent to subflow */
    inputMappings?: Record<string, string>;

    /** Whether to share session with parent workflow */
    shareSession?: boolean;
}
```

## Ports

| Port     | Type   | Description                  |
| -------- | ------ | ---------------------------- |
| `input`  | Input  | Input passed to subflow      |
| `output` | Output | Subflow result               |
| `error`  | Output | Error branch                 |
| Dynamic  | Input  | Per subflow input definition |

## Subflow Definition

```typescript
interface SubflowDefinition {
    /** Unique ID */
    id: string;

    /** Display name */
    name: string;

    /** Description */
    description?: string;

    /** The embedded workflow */
    workflow: WorkflowData;

    /** Input port definitions */
    inputs: SubflowInput[];

    /** Output port definitions */
    outputs: SubflowOutput[];
}

interface SubflowInput {
    id: string;
    label: string;
    type: 'string' | 'number' | 'boolean' | 'object';
    required?: boolean;
    default?: unknown;
}

interface SubflowOutput {
    id: string;
    label: string;
}
```

## Subflow Registry

### Creating a Registry

```typescript
import { DefaultSubflowRegistry } from 'or3-workflow-core';

const registry = new DefaultSubflowRegistry();
```

### Registering Subflows

```typescript
const emailProcessorSubflow: SubflowDefinition = {
  id: 'email-processor',
  name: 'Email Processor',
  description: 'Process and respond to emails',
  inputs: [
    { id: 'email', label: 'Email Content', type: 'string', required: true },
    { id: 'tone', label: 'Response Tone', type: 'string', default: 'professional' },
  ],
  outputs: [
    { id: 'response', label: 'Generated Response' },
  ],
  workflow: {
    meta: { version: '2.0.0', name: 'Email Processor' },
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: 'classifier', type: 'router', position: { x: 0, y: 100 }, data: { ... } },
      { id: 'responder', type: 'agent', position: { x: 0, y: 200 }, data: { ... } },
      { id: 'output', type: 'output', position: { x: 0, y: 300 }, data: { ... } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'classifier' },
      { id: 'e2', source: 'classifier', target: 'responder' },
      { id: 'e3', source: 'responder', target: 'output' },
    ],
  },
};

registry.register(emailProcessorSubflow);
```

### Registry Methods

```typescript
// Register
registry.register(subflow);

// Get by ID
const subflow = registry.get('email-processor');

// Check existence
if (registry.has('email-processor')) { ... }

// List all
const all = registry.list();

// Remove
registry.unregister('email-processor');

// Clear all
registry.clear();
```

## Usage

```typescript
// Configure adapter with registry
const adapter = new OpenRouterExecutionAdapter(client, {
    subflowRegistry: registry,
    maxSubflowDepth: 10, // Maximum nesting depth
});

// Create subflow node
editor.commands.createNode(
    'subflow',
    {
        label: 'Process Email',
        subflowId: 'email-processor',
        inputMappings: {
            email: '{{input}}', // Map parent input to subflow's 'email' input
            tone: 'friendly', // Static value
        },
        shareSession: true, // Share session with parent workflow
    },
    { x: 100, y: 200 }
);
```

## Input Mappings

Map parent workflow data to subflow inputs using expressions:

```typescript
{
  inputMappings: {
    // Map from parent input using expression syntax
    'subflowInput': '{{input}}',

    // Reference another node's output
    'data': '{{outputs.previousNode}}',

    // Static value
    'config': 'strict',

    // Template with expression
    'prompt': 'Process this: {{input}}',
  },
}
```

### Expression Syntax

| Expression          | Description                          |
| ------------------- | ------------------------------------ |
| `{{input}}`         | Current input to the subflow node    |
| `{{output}}`        | Alias for `{{input}}`                |
| `{{outputs.nodeId}}`| Output from a specific node          |
| `{{context.sessionId}}` | Session ID from context          |
| `static value`      | Used as-is                           |
```

## Execution Flow

```
Parent Workflow
      │
      ▼
┌─────────────────┐
│ Subflow Node    │
└────────┬────────┘
         │
         ▼ (enters subflow)
  ┌────────────────────────────────┐
  │  Subflow Workflow              │
  │  ┌───────┐                     │
  │  │ Start │                     │
  │  └───┬───┘                     │
  │      ▼                         │
  │  ┌───────┐                     │
  │  │ Agent │                     │
  │  └───┬───┘                     │
  │      ▼                         │
  │  ┌────────┐                    │
  │  │ Output │ ← Result captured  │
  │  └────────┘                    │
  └────────────────────────────────┘
         │
         ▼ (returns to parent)
      Output
```

## Nesting Limits

Prevent infinite recursion with depth limits:

```typescript
const adapter = new OpenRouterExecutionAdapter(client, {
    subflowRegistry: registry,
    maxSubflowDepth: 10, // Maximum subflow nesting depth (default: 10)
});
```

## Validation

| Code                   | Type    | Description                   |
| ---------------------- | ------- | ----------------------------- |
| `MISSING_SUBFLOW_ID`   | Error   | No subflow ID specified       |
| `SUBFLOW_NOT_FOUND`    | Error   | Subflow not found in registry |
| `MISSING_INPUT_MAPPING`| Error   | Required input not mapped     |
| `NO_SUBFLOW_OUTPUTS`   | Warning | Subflow has no output nodes   |
| `NO_REGISTRY`          | Warning | Registry not provided for validation |
| `NO_INPUT`             | Warning | Subflow node has no incoming edges |
| `NO_OUTPUT`            | Warning | Subflow node has no outgoing edges |

### Validate Input Mappings

```typescript
import { validateInputMappings } from 'or3-workflow-core';

const result = validateInputMappings(subflow, node.data.inputMappings || {});

if (!result.valid) {
    console.error('Missing required inputs:', result.missing);
}
```

## Helper Functions

### getSubflowPorts

Get dynamic ports for a subflow node based on its definition:

```typescript
import { getSubflowPorts } from 'or3-workflow-core';

const { inputs, outputs } = getSubflowPorts(subflowId, registry);
```

### createDefaultInputMappings

Create default input mappings from a subflow definition:

```typescript
import { createDefaultInputMappings } from 'or3-workflow-core';

const mappings = createDefaultInputMappings(subflowId, registry);
```

## Best Practices

### 1. Define Clear Interfaces

```typescript
{
  inputs: [
    {
      id: 'data',
      label: 'Input Data',
      type: 'string',
      required: true,
      // Clear description helps users
    },
  ],
  outputs: [
    { id: 'result', label: 'Processed Result' },
  ],
}
```

### 2. Use Descriptive Names

```typescript
{
  id: 'customer-support-classifier',
  name: 'Customer Support Classifier',
  description: 'Classifies support tickets by category and priority',
}
```

### 3. Keep Subflows Focused

Each subflow should do one thing well:

```typescript
// ✅ Good - single responsibility
{ id: 'sentiment-analysis', ... }
{ id: 'language-detection', ... }

// ❌ Bad - too many responsibilities
{ id: 'analyze-classify-translate-format', ... }
```

### 4. Test Subflows Independently

```typescript
// Test subflow workflow separately
const result = await adapter.execute({
    ...subflow.workflow,
    input: testInput,
});
```

## Examples

### Data Processing Pipeline

```typescript
const dataPipeline: SubflowDefinition = {
  id: 'data-pipeline',
  name: 'Data Processing Pipeline',
  inputs: [
    { id: 'rawData', label: 'Raw Data', type: 'string', required: true },
    { id: 'format', label: 'Output Format', type: 'string', default: 'json' },
  ],
  outputs: [
    { id: 'processed', label: 'Processed Data' },
  ],
  workflow: { ... },
};
```

### Modular Agent

```typescript
const researchAgent: SubflowDefinition = {
  id: 'research-agent',
  name: 'Research Agent',
  description: 'Conducts research on a topic',
  inputs: [
    { id: 'topic', label: 'Research Topic', type: 'string', required: true },
    { id: 'depth', label: 'Research Depth', type: 'string', default: 'brief' },
  ],
  outputs: [
    { id: 'findings', label: 'Research Findings' },
    { id: 'sources', label: 'Sources' },
  ],
  workflow: { ... },
};
```

## Vue Component

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="subflow-node">
            <div class="icon">📦</div>
            <div class="label">{{ node.data.label }}</div>
            <div class="subflow-name">{{ subflowName }}</div>
        </div>
    </NodeWrapper>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps(['node', 'registry']);

const subflowName = computed(() => {
    const subflow = props.registry?.get(props.node.data.subflowId);
    return subflow?.name ?? 'Unknown';
});
</script>
```

## Next Steps

-   [Output Node](./output.md) - Format subflow results
-   [Extensions](../api/extensions.md) - Create custom extensions
