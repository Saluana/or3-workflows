# Introduction

or3-workflows is a visual workflow builder for creating AI agent pipelines. It provides a **TipTap-style architecture** where everything is built from configurable extensions.

## Why or3-workflows?

Building AI applications often requires orchestrating multiple LLM calls in sequence—routing user intent, processing with specialized agents, and formatting responses. or3-workflows provides:

### Visual Design

Drag-and-drop nodes to build agent pipelines without writing complex orchestration code.

### Multi-Model Support

Use any model available on OpenRouter—GPT-4, Claude, Llama, Gemini, and more.

### Real-Time Execution

Watch your workflow execute with streaming responses and visual status indicators.

### Human-in-the-Loop

Pause execution for approval, input, or review at any step.

### Context Compaction

Automatic conversation summarization when approaching token limits.

### Type-Safe

Framework-agnostic TypeScript core with Zod validation.

### Extensible

TipTap-style extension system for custom node types.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Your Application                      │
├─────────────────────────────────────────────────────────┤
│                    @or3/workflow-vue                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐ │
│  │ Composables │ │ Components  │ │     Theming         │ │
│  │ useEditor   │ │ Canvas      │ │   CSS Variables     │ │
│  │ useState    │ │ NodePalette │ │   Dark/Light        │ │
│  └─────────────┘ └─────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────────────────────┤
│                    @or3/workflow-core                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ Editor   │ │ Commands │ │ History  │ │ Validation  │ │
│  ├──────────┤ ├──────────┤ ├──────────┤ ├─────────────┤ │
│  │Execution │ │Extensions│ │ StarterKit│ │  Adapters   │ │
│  └──────────┘ └──────────┘ └──────────┘ └─────────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Packages

| Package              | Description                                                               |
| -------------------- | ------------------------------------------------------------------------- |
| `@or3/workflow-core` | Framework-agnostic core: editor, commands, history, validation, execution |
| `@or3/workflow-vue`  | Vue 3 components: canvas, nodes, inspector, palette                       |

## TipTap-Style Design

Inspired by [TipTap](https://tiptap.dev), or3-workflows uses a composable extension architecture:

```typescript
import { WorkflowEditor, StarterKit } from '@or3/workflow-core';

// Use the StarterKit with all built-in nodes
const editor = new WorkflowEditor({
    extensions: StarterKit.configure(),
});

// Or customize which extensions to include
const editor = new WorkflowEditor({
    extensions: StarterKit.configure({
        // Disable specific nodes
        whileLoop: false,
        parallel: false,

        // Configure specific nodes
        agent: {
            defaultModel: 'anthropic/claude-3.5-sonnet',
        },
    }),
});
```

## Key Concepts

### WorkflowEditor

The central state manager. Holds nodes, edges, and selection state. All mutations go through commands.

### Extensions

Define node types with their behavior, validation, and execution logic. Extensions are configurable and composable.

### Commands

The command system handles all state mutations with built-in undo/redo support.

### Adapters

Pluggable interfaces for storage, memory, and token counting. Bring your own implementation.

## Next Steps

-   [Installation](./installation.md) - Add or3-workflows to your project
-   [Quick Start](./quick-start.md) - Build your first workflow
-   [WorkflowEditor](./api/workflow-editor.md) - Understand the core API
