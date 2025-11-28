# design.md

## Overview

`or3-workflow` is a headless TypeScript library for building and executing AI workflows. It sits on top of the `@openrouter/sdk` and provides a fluent API for chaining LLM calls. It is designed to be the execution engine for `or3-chat`'s visual workflow builder but is fully usable as a standalone package.

## Architecture

The package consists of three main components:
1.  **Builder**: The fluent API surface for defining the workflow graph.
2.  **Executor**: The runtime engine that orchestrates API calls, manages context, and handles tools.
3.  **Types**: Shared interfaces for configuration and results.

```mermaid
graph TD
  UserCode -->|workflow(client)| Builder
  Builder -->|.step() / .parallel()| WorkflowDefinition
  Builder -->|.run()| Executor
  Executor -->|OpenRouter SDK| OpenRouterAPI
  Executor -->|onToolCall| ToolRegistry
  Executor -->|Events| StreamConsumer
```

## API Surface

### Factory & Builder

```ts
import { OpenRouter } from '@openrouter/sdk';

export function workflow(client: OpenRouter): WorkflowBuilder {
  return new WorkflowBuilder(client);
}

export class WorkflowBuilder {
  private steps: WorkflowStep[] = [];

  constructor(private client: OpenRouter) {}

  // Add a sequential step
  step(config: StepConfig): this {
    this.steps.push({ type: 'step', config });
    return this;
  }

  // Add a parallel fan-out step
  parallel(configs: StepConfig[]): this {
    this.steps.push({ type: 'parallel', configs });
    return this;
  }

  // Execute the workflow
  async run(input: string | RunInput, options?: RunOptions): Promise<WorkflowResult> {
    return new Executor(this.client, this.steps).run(input, options);
  }

  // Stream execution events
  async *stream(input: string | RunInput, options?: RunOptions): AsyncGenerator<WorkflowEvent> {
    return new Executor(this.client, this.steps).stream(input, options);
  }

  // Serialization
  toJSON(): WorkflowDefinition { ... }
  static fromJSON(json: WorkflowDefinition): WorkflowBuilder { ... }
}
```

## Data Models

### Configuration

```ts
interface StepConfig {
  model: string;
  prompt: string; // Supports simple {{input}} interpolation if needed, but context is auto-appended
  systemPrompt?: string;
  tools?: ToolDefinition[]; // OpenRouter tool definition
  temperature?: number;
  maxTokens?: number;
}

interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
  handler?: (args: any) => Promise<string>; // Optional auto-execution handler
}
```

### Execution Input

```ts
interface RunInput {
  input: string;              // The main task/prompt
  messages?: Message[];       // Prior conversation history
  attachments?: Attachment[]; // Images/PDFs
}

interface Attachment {
  url?: string;
  content?: string; // base64
  mimeType: string;
}
```

### Results

```ts
interface WorkflowResult {
  output: string;             // Final output text
  steps: StepResult[];        // Trace of all steps
  duration: number;           // Total execution time
  usage: TokenUsage;          // Total token usage
}

interface StepResult {
  model: string;
  output: string;
  duration: number;
  usage: TokenUsage;
  toolCalls?: ToolCall[];
  error?: string;
}
```

## Execution Logic

### Context Management (Auto-Chaining)

The Executor maintains a running list of messages.

1.  **Initialization**:
    -   Start with `RunInput.messages` (if provided).
    -   Append User Message: `RunInput.input` + `RunInput.attachments`.

2.  **Sequential Step**:
    -   Send current message history to OpenRouter.
    -   Receive Assistant Message (output).
    -   Append Assistant Message to history.
    -   Append User Message (next step's prompt) to history.

3.  **Parallel Step**:
    -   Fork history for each branch.
    -   Execute all branches concurrently (Promise.all).
    -   **Merge**: Create a synthetic Assistant Message containing all outputs formatted with headers (e.g., "## Output 1...").
    -   Append synthetic message to main history.
    -   Append User Message (next step's prompt) to history.

### Tool Execution

1.  **Detection**: If model response includes `tool_calls`.
2.  **Resolution**:
    -   Check if tool has a `handler` in definition. If yes, execute.
    -   If no, check `RunOptions.onToolCall`. If provided, execute.
    -   If neither, throw error or stop (configurable).
3.  **Recursion**: Append tool result to history and call model again (standard ReAct loop) until final answer or max turns.

### Multimodal Validation

Before executing a step with attachments:
1.  Check `StepConfig.model`.
2.  Look up model capabilities in OpenRouter SDK (or internal fallback list).
3.  If `attachments` has images and model is not multimodal, throw `ValidationException`.

## Streaming Implementation

The `stream()` method yields events as they happen:

```ts
type WorkflowEvent =
  | { type: 'step:start', model: string }
  | { type: 'chunk', content: string, nodeId: string } // Real-time tokens
  | { type: 'tool:call', name: string, args: any }
  | { type: 'tool:result', name: string, result: string }
  | { type: 'step:done', output: string, usage: TokenUsage }
  | { type: 'workflow:done', result: WorkflowResult }
  | { type: 'error', error: Error };
```

This allows the UI to show progress bars, real-time text generation, and tool activity.

## Integration with or3-chat

-   **Registry**: `or3-chat` passes its tool registry's `execute` method to `RunOptions.onToolCall`.
-   **Hooks**: `or3-chat` wraps `.stream()` and emits events to its global hook bus.
-   **Persistence**: `or3-chat` uses `.toJSON()` to save workflows to Dexie.
