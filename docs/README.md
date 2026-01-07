# or3-workflows Documentation

Welcome to the or3-workflows documentation. Build visual AI agent workflows with a TipTap-style architecture.

## Getting Started

-   [Introduction](./introduction.md) - What is or3-workflows?
-   [Installation](./installation.md) - Quick setup guide
-   [Quick Start](./quick-start.md) - Build your first workflow

## Core Concepts

-   [WorkflowEditor](./api/workflow-editor.md) - The central state manager
-   [Commands](./api/commands.md) - Mutating workflow state
-   [History](./api/history.md) - Undo/redo system
-   [Validation](./api/validation.md) - Workflow validation
-   [Extensions](./api/extensions.md) - TipTap-style node extensions
-   [StarterKit](./api/starter-kit.md) - Bundle of built-in extensions

## Execution

-   [Execution Adapter](./api/execution.md) - Running workflows with OpenRouter
-   [Human-in-the-Loop](./api/hitl.md) - Pause for human review
-   [Context Compaction](./api/compaction.md) - Conversation summarization
-   [Error Handling](./api/errors.md) - Retry and error branching

## Node Extensions

-   [Start Node](./nodes/start.md) - Workflow entry point
-   [Agent Node](./nodes/agent.md) - LLM-powered nodes
-   [Router Node](./nodes/router.md) - Conditional branching
-   [Parallel Node](./nodes/parallel.md) - Concurrent execution
-   [While Loop Node](./nodes/while-loop.md) - Iterative loops
-   [Memory Node](./nodes/memory.md) - Vector memory integration
-   [Tool Node](./nodes/tool.md) - External tool calls
-   [Subflow Node](./nodes/subflow.md) - Nested workflows
-   [Output Node](./nodes/output.md) - Formatted output

## Adapters

-   [Storage Adapters](./adapters/storage.md) - Persist workflows
-   [Memory Adapters](./adapters/memory.md) - Vector memory
-   [Token Counters](./adapters/token-counter.md) - Token counting

## Vue Integration

-   [Composables](./vue/composables.md) - Vue 3 composables (useEditor, useWorkflowExecution, etc.)
-   [Components](./vue/components.md) - Pre-built components (WorkflowCanvas, NodePalette, etc.)

## Customization

-   [Theming](./theming.md) - CSS variables and customization

---

<p align="center">
  <a href="./introduction.md">Get Started →</a>
</p>
