# or3-workflow-core

Headless workflow engine with LLM agent orchestration. Build multi-agent AI pipelines with a type-safe, framework-agnostic core.

## Installation

```bash
bun add or3-workflow-core
# or
npm install or3-workflow-core
```

## Quick Start

```typescript
import { WorkflowEditor, StarterKit } from 'or3-workflow-core';

// Create an editor with default extensions
const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});

// Load a workflow
editor.load({
    meta: { version: '2.0.0', name: 'My Workflow' },
    nodes: [
        {
            id: 'start',
            type: 'start',
            position: { x: 100, y: 100 },
            data: { label: 'Start' },
        },
        {
            id: 'agent',
            type: 'agent',
            position: { x: 100, y: 250 },
            data: {
                label: 'Assistant',
                model: 'openai/gpt-4o',
                prompt: 'You are a helpful assistant.',
            },
        },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'agent' }],
});

// Execute the workflow
const result = await editor.execute({
    input: 'Hello, world!',
    apiKey: process.env.OPENROUTER_API_KEY,
});
```

## Features

-   **TipTap-style Extensions** - Configurable, composable node extensions
-   **Multi-model Support** - Use any model available on OpenRouter
-   **Human-in-the-loop** - Pause for approval, input, or review at any step
-   **Context Compaction** - Automatic conversation summarization
-   **Type-safe** - Full TypeScript support with Zod validation
-   **Framework-agnostic** - Works with any UI framework or headless

## Node Types

| Node         | Description                                          |
| ------------ | ---------------------------------------------------- |
| `start`      | Entry point for workflow execution                   |
| `agent`      | LLM-powered agent with configurable model and prompt |
| `router`     | Conditional branching based on LLM decisions         |
| `parallel`   | Execute multiple branches concurrently               |
| `while-loop` | Iterate until a condition is met                     |
| `subflow`    | Embed another workflow as a node                     |
| `output`     | Format and return final results                      |

## Configuration

```typescript
const editor = new WorkflowEditor({
    extensions: StarterKit.configure({
        // Disable specific nodes
        whileLoop: false,
        parallel: false,

        // Configure specific nodes
        agent: {
            defaultModel: 'anthropic/claude-3.5-sonnet',
        },
        subflow: {
            maxNestingDepth: 5,
        },
    }),
});
```

## Execution Callbacks

```typescript
await editor.execute({
    input: 'Hello',
    apiKey: 'your-api-key',
    callbacks: {
        onNodeStart: (nodeId, node) =>
            console.log(`Starting ${node.data.label}`),
        onNodeComplete: (nodeId, result) =>
            console.log(`Completed with: ${result}`),
        onToken: (nodeId, token) => process.stdout.write(token),
        onToolCall: (event) => console.log(`Tool: ${event.name}`),
    },
});
```

## Related Packages

-   [or3-workflow-vue](https://www.npmjs.com/package/or3-workflow-vue) - Vue 3 components for visual workflow editing
-   [or3-workflows github](https://github.com/Saluana/or3-workflows)

## License

MIT
