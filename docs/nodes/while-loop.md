# While Loop Node

Execute a body repeatedly until a condition is met.

## Overview

While Loop nodes enable iterative workflows—repeat a set of nodes until a condition is satisfied or max iterations reached.

## Import

```typescript
import { WhileLoopExtension } from '@or3/workflow-core';
```

## Configuration

```typescript
interface WhileLoopNodeData {
    /** Display label */
    label: string;

    /** Condition prompt for LLM evaluation */
    conditionPrompt: string;

    /** Model for condition evaluation */
    conditionModel?: string;

    /** Maximum iterations */
    maxIterations: number;

    /** Behavior when max iterations is reached */
    onMaxIterations: 'error' | 'warning' | 'continue';

    /** Name of a custom evaluator function (registered in ExecutionOptions) */
    customEvaluator?: string;
}
```

## Ports

| Port    | Type   | Description                         |
| ------- | ------ | ----------------------------------- |
| `input` | Input  | Initial input and loop feedback     |
| `body`  | Output | Loop body (executes while continue) |
| `done`  | Output | Exit path (when condition is done)  |

## Usage

```typescript
editor.commands.createNode(
    'whileLoop',
    {
        label: 'Refine Until Good',
        model: 'openai/gpt-4o-mini',
        conditionPrompt: `Evaluate if this response meets quality standards.
  
Requirements:
- Clear and concise
- No grammatical errors
- Answers the question completely

Respond with only "true" or "false".`,
        maxIterations: 5,
    },
    { x: 100, y: 200 }
);
```

## Execution Flow

```
        Input
          │
          ▼
   ┌──────────────┐
   │ While Loop   │◄─────────────┐
   │ (Condition)  │              │
   └──────┬───────┘              │
          │                      │
    ┌─────┴─────┐                │
    │           │                │
  true        false              │
    │           │                │
    ▼           ▼                │
┌───────┐   ┌───────┐            │
│ Body  │   │ Exit  │            │
│(Agent)│   │       │            │
└───┬───┘   └───────┘            │
    │                            │
    └────────────────────────────┘
         (feedback loop)
```

## Condition Evaluation

The loop evaluates a condition each iteration using an LLM:

```typescript
{
  conditionPrompt: `Based on the current output, should we continue iterating to improve the result?

Current iteration: {{iteration}}
Last output: {{input}}

Respond with only "continue" or "done".`,
}
```

The LLM responds with either `continue` or `done` to control the loop.

### Custom Evaluator

Provide a custom condition function via `ExecutionOptions`:

```typescript
const adapter = new OpenRouterExecutionAdapter(client, {
    customEvaluators: {
        qualityCheck: async (context, loopState) => {
            // Return true to continue, false to exit
            return context.currentInput.length < 1000 && loopState.iteration < 5;
        },
    },
});

// Reference in node config
{
  customEvaluator: 'qualityCheck',
}
```

## Loop State

Track loop progress:

```typescript
interface LoopState {
    iteration: number;
    maxIterations: number;
    history: string[];
}

// Access in body nodes via context
const state = context.loopState;
console.log(`Iteration ${state.iteration}/${state.maxIterations}`);
```

## Connecting the Loop

```typescript
const loopId = 'while-1';
const bodyId = 'refiner';

// Loop body
editor.commands.createNode(
    'agent',
    {
        label: 'Refiner',
        prompt: 'Improve this text: {{input}}',
    },
    { x: 300, y: 200 }
);

// Exit handler
editor.commands.createNode(
    'output',
    {
        label: 'Final Output',
    },
    { x: 300, y: 400 }
);

// Connect
editor.commands.createEdge(loopId, bodyId, 'body');  // Loop body output
editor.commands.createEdge(loopId, 'output', 'done'); // Exit output
editor.commands.createEdge(bodyId, loopId); // Feedback loop to input
```

## Max Iterations

Prevent infinite loops:

```typescript
{
  maxIterations: 10, // Stop after 10 iterations
  onMaxIterations: 'warning', // 'error' | 'warning' | 'continue'
}
```

When max is reached:
- `error`: Throws an error
- `warning`: Logs a warning and exits normally
- `continue`: Silently exits without warning

## Validation

| Code                      | Type    | Description             |
| ------------------------- | ------- | ----------------------- |
| `MISSING_CONDITION_PROMPT`| Error   | No condition prompt     |
| `INVALID_MAX_ITERATIONS`  | Error   | Max iterations <= 0     |
| `MISSING_BODY`            | Warning | Body port not connected |
| `MISSING_EXIT`            | Warning | Done port not connected |

## StarterKit Configuration

```typescript
StarterKit.configure({
    whileLoop: {
        maxIterations: 20, // Default max
        defaultModel: 'openai/gpt-4o-mini',
    },
});
```

## Best Practices

### 1. Clear Exit Conditions

```typescript
{
  conditionPrompt: `Continue refining?

DONE if:
- Quality score >= 9/10
- All requirements met
- No further improvements possible

CONTINUE if:
- Quality can be improved
- Requirements not fully met

Respond ONLY with "continue" or "done".`,
}
```

### 2. Track Progress

Include iteration context in body prompts:

```typescript
{
  prompt: `Iteration {{iteration}}/{{maxIterations}}

Previous output: {{previousOutput}}

Make incremental improvements.`,
}
```

### 3. Set Reasonable Limits

```typescript
// For refinement tasks
{
    maxIterations: 5;
}

// For search/discovery tasks
{
    maxIterations: 10;
}

// Never exceed
{
    maxIterations: 20;
} // Reasonable upper bound
```

### 4. Handle Edge Cases

Always connect the done/exit path:

```typescript
editor.commands.createEdge(loopId, exitHandler, 'done');
```

## Examples

### Iterative Refinement

```typescript
{
  label: 'Quality Refinement',
  conditionPrompt: `Is this text high quality (clear, accurate, well-structured)?
Respond "done" if quality is good, "continue" if it needs improvement.`,
  maxIterations: 5,
  onMaxIterations: 'warning',
}
```

### Search Until Found

```typescript
{
  label: 'Search Loop',
  conditionPrompt: `Did we find the answer?
Respond "done" if found, "continue" to continue searching.`,
  maxIterations: 10,
  onMaxIterations: 'warning',
}
```

### Validation Loop

```typescript
{
  label: 'Validation',
  conditionPrompt: `Does the output pass all validation rules?

Rules:
- Format is valid JSON
- Contains required fields
- Values are within acceptable ranges

Respond "done" if valid, "continue" if needs fixing.`,
  maxIterations: 3,
  onMaxIterations: 'error',
}
```

## Vue Component

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="while-loop-node">
            <div class="label">{{ node.data.label }}</div>
            <div class="iteration" v-if="status === 'active'">
                Iteration {{ node.data.currentIteration }}/{{
                    node.data.maxIterations
                }}
            </div>
        </div>
    </NodeWrapper>
</template>
```

## Next Steps

-   [Memory Node](./memory.md) - Vector memory
-   [Output Node](./output.md) - Format results
