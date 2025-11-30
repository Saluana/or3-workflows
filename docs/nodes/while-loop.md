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

    /** Model for condition evaluation */
    model?: string;

    /** Condition prompt */
    conditionPrompt: string;

    /** Maximum iterations */
    maxIterations: number;

    /** Current iteration (runtime) */
    currentIteration?: number;
}
```

## Ports

| Port    | Type   | Description                         |
| ------- | ------ | ----------------------------------- |
| `input` | Input  | Initial input and loop feedback     |
| `body`  | Output | Loop body (executes while true)     |
| `exit`  | Output | Exit path (when condition is false) |

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

The loop evaluates a condition each iteration:

```typescript
{
  conditionPrompt: `Should we continue refining?

Current output: {{input}}

Criteria:
- Score >= 8/10: Stop (respond "false")
- Score < 8/10: Continue (respond "true")

Respond with only "true" or "false".`,
}
```

### Custom Evaluator

Provide a custom condition function:

```typescript
{
  conditionEvaluator: async (input, context) => {
    // Return true to continue, false to exit
    return input.length < 1000;
  },
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
editor.commands.createEdge(loopId, bodyId, 'body');
editor.commands.createEdge(loopId, 'output', 'exit');
editor.commands.createEdge(bodyId, loopId); // Feedback loop
```

## Max Iterations

Prevent infinite loops:

```typescript
{
  maxIterations: 10, // Stop after 10 iterations
}
```

When max is reached, execution follows the `exit` path.

## Validation

| Code                     | Type    | Description             |
| ------------------------ | ------- | ----------------------- |
| `MISSING_CONDITION`      | Error   | No condition prompt     |
| `INVALID_MAX_ITERATIONS` | Error   | Max iterations <= 0     |
| `NO_BODY_CONNECTION`     | Warning | Body port not connected |
| `NO_EXIT_CONNECTION`     | Warning | Exit port not connected |

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

STOP (false) if:
- Quality score >= 9/10
- All requirements met
- No further improvements possible

CONTINUE (true) if:
- Quality can be improved
- Requirements not fully met

Respond ONLY with "true" or "false".`,
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

Always connect the exit path:

```typescript
editor.commands.createEdge(loopId, exitHandler, 'exit');
```

## Examples

### Iterative Refinement

```typescript
{
  label: 'Quality Refinement',
  conditionPrompt: `Is this text high quality (clear, accurate, well-structured)?
Respond "false" if quality is good, "true" if it needs improvement.`,
  maxIterations: 5,
}
```

### Search Until Found

```typescript
{
  label: 'Search Loop',
  conditionPrompt: `Did we find the answer?
Respond "false" if found, "true" to continue searching.`,
  maxIterations: 10,
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

Respond "false" if valid, "true" if needs fixing.`,
  maxIterations: 3,
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
