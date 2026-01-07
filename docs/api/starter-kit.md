# StarterKit

The `StarterKit` is a bundle of all built-in extensions with sensible defaults. It's the easiest way to get started.

## Import

```typescript
import { StarterKit } from 'or3-workflow-core';
```

## Basic Usage

```typescript
import { WorkflowEditor, StarterKit } from 'or3-workflow-core';

const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});
```

## Configuration

### Disabling Extensions

Set an extension to `false` to exclude it:

```typescript
const editor = new WorkflowEditor({
    extensions: StarterKit.configure({
        // Disable these extensions
        whileLoop: false,
        parallel: false,
        subflow: false,
    }),
});
```

### Configuring Extensions

Pass options to configure specific extensions:

```typescript
const editor = new WorkflowEditor({
    extensions: StarterKit.configure({
        // Configure agent nodes
        agent: {
            defaultModel: 'anthropic/claude-3.5-sonnet',
        },

        // Configure while loops
        whileLoop: {
            maxIterations: 50,
        },

        // Configure subflows
        subflow: {
            maxNestingDepth: 3,
            storage: mySubflowStorage,
        },
    }),
});
```

## Available Options

### StarterKitOptions

```typescript
interface StarterKitOptions {
    /** Start node - always included, cannot be disabled */
    start?: boolean;

    /** Agent node - LLM processing */
    agent?: false | AgentOptions;

    /** Router node - conditional branching */
    router?: false | RouterOptions;

    /** Parallel node - concurrent execution */
    parallel?: false | ParallelOptions;

    /** Tool node - external tools */
    tool?: false | ToolOptions;

    /** While loop node - iteration */
    whileLoop?: false | WhileLoopOptions;

    /** Memory node - vector memory */
    memory?: false | MemoryOptions;

    /** Subflow node - nested workflows */
    subflow?: false | SubflowOptions;

    /** Output node - formatted output */
    output?: false | OutputOptions;
}
```

### AgentOptions

```typescript
interface AgentOptions {
    /** Default model for new agent nodes */
    defaultModel?: string;

    /** Default temperature */
    defaultTemperature?: number;
}
```

**Example:**

```typescript
StarterKit.configure({
    agent: {
        defaultModel: 'openai/gpt-4o',
        defaultTemperature: 0.7,
    },
});
```

### WhileLoopOptions

```typescript
interface WhileLoopOptions {
    /** Maximum iterations allowed */
    maxIterations?: number;

    /** Default condition evaluator model */
    defaultModel?: string;
}
```

**Example:**

```typescript
StarterKit.configure({
    whileLoop: {
        maxIterations: 100,
        defaultModel: 'openai/gpt-4o-mini',
    },
});
```

### SubflowOptions

```typescript
interface SubflowOptions {
    /** Maximum nesting depth */
    maxNestingDepth?: number;

    /** Subflow storage/registry */
    storage?: SubflowRegistry;
}
```

**Example:**

```typescript
import { DefaultSubflowRegistry } from 'or3-workflow-core';

const registry = new DefaultSubflowRegistry();
registry.register({
    id: 'email-processor',
    name: 'Email Processor',
    workflow: emailWorkflow,
    inputs: [{ id: 'email', label: 'Email', type: 'string' }],
    outputs: [{ id: 'response', label: 'Response' }],
});

StarterKit.configure({
    subflow: {
        maxNestingDepth: 5,
        storage: registry,
    },
});
```

## Helper Methods

### getAvailableExtensions()

Get a list of all extension names:

```typescript
const names = StarterKit.getAvailableExtensions();
// ['start', 'agent', 'router', 'parallel', 'tool', 'whileLoop', 'memory', 'subflow', 'output']
```

### getDefaultOptions()

Get the default configuration:

```typescript
const defaults = StarterKit.getDefaultOptions();
// { start: true, agent: true, router: true, ... }
```

## Included Extensions

| Extension               | Type        | Description                   |
| ----------------------- | ----------- | ----------------------------- |
| `StartNodeExtension`    | `start`     | Entry point (always included) |
| `AgentNodeExtension`    | `agent`     | LLM processing                |
| `RouterNodeExtension`   | `router`    | Conditional branching         |
| `ParallelNodeExtension` | `parallel`  | Concurrent execution          |
| `ToolNodeExtension`     | `tool`      | External tools                |
| `WhileLoopExtension`    | `whileLoop` | Iterative loops               |
| `MemoryNodeExtension`   | `memory`    | Vector memory                 |
| `SubflowExtension`      | `subflow`   | Nested workflows              |
| `OutputNodeExtension`   | `output`    | Formatted output              |

## Mixing with Custom Extensions

Combine StarterKit with your own extensions:

```typescript
import { WorkflowEditor, StarterKit } from 'or3-workflow-core';
import { NotificationExtension } from './extensions';

const editor = new WorkflowEditor({
    extensions: [
        ...StarterKit.configure({
            parallel: false, // Disable parallel
        }),
        NotificationExtension, // Add custom
    ],
});
```

## Runtime Inspection

Check which extensions are loaded:

```typescript
const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});

// List registered extensions
for (const [name, ext] of editor.extensions) {
    console.log(`${name}: ${ext.type}`);
}
```

## Common Configurations

### Minimal Setup

Just start and agent nodes:

```typescript
StarterKit.configure({
    router: false,
    parallel: false,
    tool: false,
    whileLoop: false,
    memory: false,
    subflow: false,
    output: false,
});
```

### Full Featured

All extensions with custom agent model:

```typescript
StarterKit.configure({
    agent: {
        defaultModel: 'anthropic/claude-3.5-sonnet',
    },
});
```

### RAG Pipeline

With memory support:

```typescript
import { InMemoryAdapter } from 'or3-workflow-core';

StarterKit.configure({
    memory: {
        adapter: new InMemoryAdapter(),
    },
    parallel: false,
    whileLoop: false,
});
```

## Next Steps

-   [Extensions](./extensions.md) - Extension system
-   [Custom Extensions](../custom-extensions.md) - Create your own
-   [Agent Node](../nodes/agent.md) - Agent configuration
