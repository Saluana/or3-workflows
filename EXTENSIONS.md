# Extensions Guide

or3-workflows uses a TipTap-inspired extension architecture. Extensions define node types, their behavior, validation, and execution logic.

## Table of Contents

-   [Quick Start](#quick-start)
-   [StarterKit](#starterkit)
-   [Creating Custom Extensions](#creating-custom-extensions)
-   [Configurable Extensions](#configurable-extensions)
-   [Built-in Extensions](#built-in-extensions)
-   [Extension Lifecycle](#extension-lifecycle)

---

## Quick Start

The fastest way to get started is with StarterKit, which includes all core nodes:

```typescript
import { WorkflowEditor, StarterKit } from '@or3/workflow-core';

const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});
```

---

## StarterKit

StarterKit is a convenience bundle that includes all essential node extensions.

### Basic Usage

```typescript
import { StarterKit } from '@or3/workflow-core';

// Include all default extensions
const extensions = StarterKit.configure();

// Disable specific extensions
const extensions = StarterKit.configure({
    whileLoop: false,
    parallel: false,
});
```

### Configuration Options

```typescript
interface StarterKitOptions {
    // Core nodes (always included unless explicitly disabled)
    start?: boolean; // Start node (default: true, cannot disable)
    agent?: boolean | AgentOptions;
    router?: boolean;
    parallel?: boolean;
    tool?: boolean;

    // Optional nodes (included by default)
    whileLoop?: boolean | WhileLoopOptions;
    memory?: boolean;
    subflow?: boolean | SubflowOptions;
    output?: boolean;
}

interface AgentOptions {
    defaultModel?: string; // Default model for new agents
}

interface WhileLoopOptions {
    defaultMaxIterations?: number; // Default: 10
    defaultOnMaxIterations?: 'error' | 'warning' | 'continue';
}

interface SubflowOptions {
    maxNestingDepth?: number; // Default: 10
}
```

### Examples

```typescript
// Configure agent defaults
const extensions = StarterKit.configure({
    agent: {
        defaultModel: 'anthropic/claude-3.5-sonnet',
    },
});

// Configure while loop defaults
const extensions = StarterKit.configure({
    whileLoop: {
        defaultMaxIterations: 5,
        defaultOnMaxIterations: 'warning',
    },
});

// Minimal setup (core nodes only)
const extensions = StarterKit.configure({
    whileLoop: false,
    memory: false,
    subflow: false,
    output: false,
});

// Check available extensions
const available = StarterKit.getAvailableExtensions();
// ['start', 'agent', 'router', 'parallel', 'tool', 'whileLoop', 'memory', 'subflow', 'output']
```

---

## Creating Custom Extensions

### Extension Interface

```typescript
interface NodeExtension {
    // Required
    name: string; // Unique identifier
    type: string; // Node type for serialization

    // Optional metadata
    label?: string; // Display name in UI
    description?: string; // Tooltip/help text
    category?: string; // Grouping in palette

    // Port definitions
    inputs?: PortDefinition[];
    outputs?: PortDefinition[];
    getDynamicOutputs?: (node: WorkflowNode) => PortDefinition[];

    // Data
    defaultData?: Record<string, unknown>;
    getDefaultData?: () => Record<string, unknown>;

    // Validation
    validate?: (node: WorkflowNode, edges: WorkflowEdge[]) => ValidationIssue[];

    // Execution
    execute?: (context: ExecutionContext) => Promise<ExecutionResult>;

    // Lifecycle
    onCreate?: () => void;
    onDestroy?: () => void;
}

interface PortDefinition {
    id: string;
    label?: string;
    type?: 'input' | 'output';
}
```

### Basic Extension Example

```typescript
import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
} from '@or3/workflow-core';

export const TransformNodeExtension: NodeExtension = {
    name: 'transform',
    type: 'transform',
    label: 'Transform',
    description: 'Transform input data using a template',
    category: 'processing',

    inputs: [{ id: 'input', label: 'Input' }],
    outputs: [{ id: 'output', label: 'Output' }],

    defaultData: {
        label: 'Transform',
        template: '{{input}}',
        uppercase: false,
    },

    validate(node: WorkflowNode, edges: WorkflowEdge[]) {
        const issues = [];
        const data = node.data as { template?: string };

        if (!data.template) {
            issues.push({
                type: 'error' as const,
                code: 'MISSING_TEMPLATE',
                message: 'Transform node requires a template',
                nodeId: node.id,
            });
        }

        // Check for incoming edges
        const hasInput = edges.some((e) => e.target === node.id);
        if (!hasInput) {
            issues.push({
                type: 'warning' as const,
                code: 'NO_INPUT',
                message: 'Transform node has no input connection',
                nodeId: node.id,
            });
        }

        return issues;
    },

    async execute(context) {
        const { node, input } = context;
        const data = node.data as { template: string; uppercase: boolean };

        let output = data.template.replace('{{input}}', input);
        if (data.uppercase) {
            output = output.toUpperCase();
        }

        return {
            output,
            nextNodes: [], // Will be determined by edges
        };
    },
};
```

### Dynamic Outputs Example

For nodes like routers that have configurable outputs:

```typescript
export const SwitchNodeExtension: NodeExtension = {
    name: 'switch',
    type: 'switch',
    label: 'Switch',

    inputs: [{ id: 'input', label: 'Input' }],

    // Base outputs
    outputs: [{ id: 'default', label: 'Default' }],

    // Dynamic outputs based on node data
    getDynamicOutputs(node) {
        const data = node.data as {
            cases?: Array<{ id: string; label: string }>;
        };
        const cases = data.cases || [];

        return [
            ...cases.map((c) => ({ id: c.id, label: c.label })),
            { id: 'default', label: 'Default' },
        ];
    },

    defaultData: {
        label: 'Switch',
        cases: [
            { id: 'case-1', label: 'Case 1', condition: '' },
            { id: 'case-2', label: 'Case 2', condition: '' },
        ],
    },
};
```

---

## Configurable Extensions

For extensions that need runtime configuration, use the `createConfigurableExtension` helper:

```typescript
import { createConfigurableExtension } from '@or3/workflow-core';

interface ApiNodeOptions {
    baseUrl?: string;
    timeout?: number;
    headers?: Record<string, string>;
}

export const ApiNodeExtension = createConfigurableExtension<ApiNodeOptions>({
    name: 'api',
    type: 'api',
    label: 'API Call',

    // Default options
    defaultOptions: {
        baseUrl: 'https://api.example.com',
        timeout: 30000,
        headers: {},
    },

    defaultData: {
        label: 'API Call',
        method: 'GET',
        path: '/',
    },

    inputs: [{ id: 'input', label: 'Input' }],
    outputs: [
        { id: 'success', label: 'Success' },
        { id: 'error', label: 'Error' },
    ],

    async execute(context) {
        const { node, options } = context;
        const data = node.data as { method: string; path: string };

        try {
            const response = await fetch(`${options.baseUrl}${data.path}`, {
                method: data.method,
                headers: options.headers,
                signal: AbortSignal.timeout(options.timeout),
            });

            return {
                output: await response.text(),
                nextHandleId: 'success',
            };
        } catch (error) {
            return {
                output: error.message,
                nextHandleId: 'error',
            };
        }
    },
});

// Usage
const editor = new WorkflowEditor({
    extensions: [
        ApiNodeExtension.configure({
            baseUrl: 'https://my-api.com',
            timeout: 10000,
        }),
    ],
});
```

### Wrapping Existing Extensions

Use `makeConfigurable` to add configuration to existing extensions:

```typescript
import { makeConfigurable, AgentNodeExtension } from '@or3/workflow-core';

const ConfigurableAgent = makeConfigurable(AgentNodeExtension, {
    defaultModel: 'openai/gpt-4o',
    maxTokens: 4096,
});

// Now supports .configure()
const customAgent = ConfigurableAgent.configure({
    defaultModel: 'anthropic/claude-3.5-sonnet',
});
```

---

## Built-in Extensions

### StartNodeExtension

Entry point for workflow execution. Every workflow needs exactly one.

```typescript
{
  name: 'start',
  type: 'start',
  outputs: [{ id: 'output', label: 'Start' }],
  defaultData: { label: 'Start' },
}
```

### AgentNodeExtension

LLM-powered node for AI processing.

```typescript
{
  name: 'agent',
  type: 'agent',
  inputs: [{ id: 'input' }],
  outputs: [
    { id: 'output', label: 'Output' },
    { id: 'error', label: 'Error' },
  ],
  defaultData: {
    label: 'Agent',
    model: 'openai/gpt-4o-mini',
    prompt: '',
    temperature: 1,
    maxTokens: undefined,
  },
}
```

### RouterNodeExtension

Routes execution based on LLM classification.

```typescript
{
  name: 'router',
  type: 'router',
  inputs: [{ id: 'input' }],
  // Dynamic outputs based on routes
  defaultData: {
    label: 'Router',
    routes: [
      { id: 'route-1', label: 'Route 1' },
      { id: 'route-2', label: 'Route 2' },
    ],
  },
}
```

### ParallelNodeExtension

Executes multiple branches concurrently.

```typescript
{
  name: 'parallel',
  type: 'parallel',
  inputs: [{ id: 'input' }],
  // Dynamic outputs based on branches
  defaultData: {
    label: 'Parallel',
    branches: [
      { id: 'branch-1', label: 'Branch 1' },
      { id: 'branch-2', label: 'Branch 2' },
    ],
    prompt: '', // Optional merge prompt
  },
}
```

### WhileLoopExtension

Iterative execution with LLM-evaluated condition.

```typescript
{
  name: 'whileLoop',
  type: 'whileLoop',
  inputs: [{ id: 'input' }],
  outputs: [
    { id: 'body', label: 'Loop Body' },
    { id: 'done', label: 'Exit' },
  ],
  defaultData: {
    label: 'While Loop',
    conditionPrompt: 'Should the loop continue?',
    maxIterations: 10,
    onMaxIterations: 'warning',
  },
}
```

### MemoryNodeExtension

Query or store workflow memory.

```typescript
{
  name: 'memory',
  type: 'memory',
  inputs: [{ id: 'input' }],
  outputs: [{ id: 'output' }],
  defaultData: {
    label: 'Memory',
    operation: 'query', // 'query' | 'store'
    limit: 5,
    fallback: 'No memories found.',
  },
}
```

### ToolNodeExtension

Execute registered tools/functions.

```typescript
{
  name: 'tool',
  type: 'tool',
  inputs: [{ id: 'input' }],
  outputs: [
    { id: 'output', label: 'Output' },
    { id: 'error', label: 'Error' },
  ],
  defaultData: {
    label: 'Tool',
    toolId: '',
    config: {},
  },
}
```

### SubflowExtension

Execute a nested workflow.

```typescript
{
  name: 'subflow',
  type: 'subflow',
  inputs: [{ id: 'input' }],
  outputs: [
    { id: 'output', label: 'Output' },
    { id: 'error', label: 'Error' },
  ],
  defaultData: {
    label: 'Subflow',
    subflowId: '',
    inputMappings: {},
    shareSession: true,
  },
}
```

### OutputNodeExtension

Terminal node that formats the final result.

```typescript
{
  name: 'output',
  type: 'output',
  inputs: [{ id: 'input' }],
  outputs: [], // Terminal node
  defaultData: {
    label: 'Output',
    format: 'text', // 'text' | 'json' | 'markdown'
    template: '',
    includeMetadata: false,
  },
}
```

---

## Extension Lifecycle

Extensions can hook into the editor lifecycle:

```typescript
const MyExtension: NodeExtension = {
    name: 'myExtension',
    type: 'custom',

    onCreate() {
        // Called when extension is registered
        console.log('Extension registered');
    },

    onDestroy() {
        // Called when editor is destroyed
        // Clean up subscriptions, timers, etc.
        console.log('Extension destroyed');
    },
};
```

---

## Registering Extensions

```typescript
import { WorkflowEditor } from '@or3/workflow-core';

// Via constructor
const editor = new WorkflowEditor({
    extensions: [MyExtension, AnotherExtension],
});

// Via method
editor.registerExtension(MyExtension);

// Check if registered
editor.extensions.has('myExtension'); // true

// Get extension
const ext = editor.extensions.get('myExtension');
```

---

## Best Practices

1. **Unique Names**: Each extension must have a unique `name` property.

2. **Validation**: Always implement `validate()` to catch configuration errors early.

3. **Default Data**: Provide sensible defaults so nodes work out of the box.

4. **Error Handles**: Include error output handles for nodes that can fail.

5. **Configuration**: Use `createConfigurableExtension` for extensions that need runtime options.

6. **Cleanup**: Implement `onDestroy()` if your extension creates subscriptions or timers.

7. **Type Safety**: Use TypeScript interfaces for node data to catch errors at compile time.

```typescript
interface MyNodeData {
    label: string;
    value: number;
    enabled: boolean;
}

const MyExtension: NodeExtension = {
    name: 'myNode',
    type: 'myNode',

    validate(node) {
        const data = node.data as MyNodeData;
        // TypeScript will catch type errors
        if (data.value < 0) {
            return [
                {
                    type: 'error',
                    code: 'INVALID_VALUE',
                    message: 'Value must be positive',
                    nodeId: node.id,
                },
            ];
        }
        return [];
    },
};
```
