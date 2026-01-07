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
    // Required fields
    name: string;
    type: 'node';
    inputs: PortDefinition[];
    outputs: PortDefinition[];
    defaultData: Record<string, unknown>;

    // Optional metadata
    label?: string;
    description?: string;
    category?: string;
    icon?: string;

    // Lifecycle and commands
    addCommands?: () => Record<string, Command>;
    onCreate?: () => void;
    onDestroy?: () => void;

    // Execution (required)
    execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<NodeExecutionResult>;

    // Validation (required)
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[],
        context?: ValidationContext
    ): (ValidationError | ValidationWarning)[];

    // Optional: dynamic outputs for palette previewing
    getDynamicOutputs?: (
        node: WorkflowNode
    ) => { id: string; label: string }[];
}

interface PortDefinition {
    id: string;
    label?: string;
    type: 'input' | 'output';
    dataType?: 'any' | 'string' | 'object' | 'array';
    required?: boolean;
    multiple?: boolean;
}
```

### Basic Extension Example

```typescript
import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    ExecutionContext,
    ValidationError,
    ValidationWarning,
} from '@or3/workflow-core';

export const TransformNodeExtension: NodeExtension = {
    name: 'transform',
    type: 'node',
    label: 'Transform',
    description: 'Transform input data using a template',
    category: 'processing',

    inputs: [{ id: 'input', type: 'input', label: 'Input' }],
    outputs: [{ id: 'output', type: 'output', label: 'Output' }],

    defaultData: {
        label: 'Transform',
        template: '{{input}}',
        uppercase: false,
    },

    validate(node: WorkflowNode, edges: WorkflowEdge[]) {
        const issues: Array<ValidationError | ValidationWarning> = [];
        const data = node.data as { template?: string };

        if (!data.template) {
            issues.push({
                type: 'error',
                code: 'MISSING_TEMPLATE',
                message: 'Transform node requires a template',
                nodeId: node.id,
            });
        }

        // Check for incoming edges
        const hasInput = edges.some((e) => e.target === node.id);
        if (!hasInput) {
            issues.push({
                type: 'warning',
                code: 'NO_INPUT',
                message: 'Transform node has no input connection',
                nodeId: node.id,
            });
        }

        return issues;
    },

    async execute(context: ExecutionContext, node: WorkflowNode) {
        const data = node.data as { template: string; uppercase?: boolean };
        const rendered = (data.template || '{{input}}').replace(
            '{{input}}',
            context.input
        );
        const outgoing = context.getOutgoingEdges(node.id);

        return {
            output: data.uppercase ? rendered.toUpperCase() : rendered,
            nextNodes: outgoing.map((edge) => edge.target),
        };
    },
};
```

### Dynamic Outputs Example

For nodes like routers that have configurable outputs:

```typescript
export const SwitchNodeExtension: NodeExtension = {
    name: 'switch',
    type: 'node',
    label: 'Switch',

    inputs: [{ id: 'input', type: 'input', label: 'Input' }],

    // Base outputs
    outputs: [{ id: 'default', type: 'output', label: 'Default' }],

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

    validate(node) {
        const data = node.data as { cases?: Array<{ id: string; label: string }> };
        if (!data?.cases?.length) return [];

        const missingLabels = data.cases.filter((c) => !c.label);
        if (missingLabels.length) {
            return [
                {
                    type: 'warning',
                    code: 'MISSING_EDGE_LABEL',
                    message: 'Switch cases should include labels',
                    nodeId: node.id,
                },
            ];
        }

        return [];
    },

    async execute(context, node) {
        const data = node.data as { cases?: Array<{ id: string }> };
        const targetHandleId = data.cases?.[0]?.id ?? 'default';
        const outgoing = context.getOutgoingEdges(node.id, targetHandleId);

        return {
            output: context.input,
            nextNodes: outgoing.map((edge) => edge.target),
        };
    },
};
```

### Creating a Custom Executable Node

Custom nodes must provide both `validate()` and `execute()`. Register them with the editor **and** the execution registry so validation and runtime can resolve them.

```typescript
import {
    WorkflowEditor,
    registerExtension,
    type NodeExtension,
    type WorkflowNode,
    type WorkflowEdge,
    type ExecutionContext,
} from '@or3/workflow-core';

export const EchoNodeExtension: NodeExtension = {
    name: 'echo',
    type: 'node',
    label: 'Echo',
    category: 'demo',

    inputs: [{ id: 'input', type: 'input', label: 'Input' }],
    outputs: [{ id: 'next', type: 'output', label: 'Next' }],
    defaultData: { label: 'Echo' },

    validate(node: WorkflowNode, edges: WorkflowEdge[]) {
        const outgoing = edges.filter((e) => e.source === node.id);
        if (!outgoing.length) {
            return [
                {
                    type: 'warning',
                    code: 'NO_OUTPUT',
                    message: 'Echo node should connect to at least one target',
                    nodeId: node.id,
                },
            ];
        }
        return [];
    },

    async execute(context: ExecutionContext, node: WorkflowNode) {
        const outgoing = context.getOutgoingEdges(node.id, 'next');
        return {
            output: context.input,
            nextNodes: outgoing.map((edge) => edge.target),
        };
    },
};

// Editor usage
const editor = new WorkflowEditor({
    extensions: [EchoNodeExtension],
});

// Required until the editor↔execution bridge is available:
// make the node discoverable by validateWorkflow() and execution adapters.
registerExtension(EchoNodeExtension);
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
    type: 'node',
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

    inputs: [{ id: 'input', type: 'input', label: 'Input' }],
    outputs: [
        { id: 'success', type: 'output', label: 'Success' },
        { id: 'error', type: 'output', label: 'Error' },
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

            const outgoing = context.getOutgoingEdges(node.id, 'success');
            return {
                output: await response.text(),
                nextNodes: outgoing.map((edge) => edge.target),
            };
        } catch (error) {
            const outgoing = context.getOutgoingEdges(node.id, 'error');
            return {
                output: (error as Error).message,
                nextNodes: outgoing.map((edge) => edge.target),
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
  type: 'node',
  outputs: [{ id: 'output', type: 'output', label: 'Start' }],
  defaultData: { label: 'Start' },
}
```

### AgentNodeExtension

LLM-powered node for AI processing.

```typescript
{
  name: 'agent',
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
  outputs: [
    { id: 'output', type: 'output', label: 'Output' },
    { id: 'error', type: 'output', label: 'Error' },
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
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
  outputs: [
    { id: 'route-1', type: 'output', label: 'Route 1' },
    { id: 'route-2', type: 'output', label: 'Route 2' },
    { id: 'error', type: 'output', label: 'Error' },
  ],
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
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
  outputs: [
    { id: 'branch-1', type: 'output', label: 'Branch 1' },
    { id: 'branch-2', type: 'output', label: 'Branch 2' },
  ],
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
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
  outputs: [
    { id: 'body', type: 'output', label: 'Loop Body' },
    { id: 'done', type: 'output', label: 'Exit' },
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
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
  outputs: [{ id: 'output', type: 'output' }],
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
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
  outputs: [
    { id: 'output', type: 'output', label: 'Output' },
    { id: 'error', type: 'output', label: 'Error' },
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
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
  outputs: [
    { id: 'output', type: 'output', label: 'Output' },
    { id: 'error', type: 'output', label: 'Error' },
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
  type: 'node',
  inputs: [{ id: 'input', type: 'input' }],
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
    type: 'node',
    inputs: [],
    outputs: [],
    defaultData: {},

    async execute() {
        return { output: '', nextNodes: [] };
    },

    validate() {
        return [];
    },

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

> Until the editor-to-execution bridge ships, also call `registerExtension(MyExtension)` from `@or3/workflow-core` so validation and execution adapters can resolve custom nodes.

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
    type: 'node',
    inputs: [{ id: 'input', type: 'input' }],
    outputs: [{ id: 'output', type: 'output' }],
    defaultData: { label: 'My Node', value: 0, enabled: true },

    async execute(context, node) {
        const outgoing = context.getOutgoingEdges(node.id, 'output');
        return {
            output: context.input,
            nextNodes: outgoing.map((edge) => edge.target),
        };
    },

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
