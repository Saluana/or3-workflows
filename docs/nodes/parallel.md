# Parallel Node

Execute multiple branches concurrently and merge results.

## Overview

Parallel nodes split execution into multiple concurrent paths, then merge results. Useful for gathering information from multiple sources or running independent tasks simultaneously.

## Import

```typescript
import { ParallelNodeExtension } from 'or3-workflow-core';
```

## Configuration

```typescript
interface ParallelNodeData {
    /** Display label */
    label: string;

    /** Branch definitions */
    branches: BranchDefinition[];

    /** Prompt to merge branch results */
    mergePrompt?: string;

    /** Model for merging */
    mergeModel?: string;
}

interface BranchDefinition {
    /** Unique branch ID */
    id: string;

    /** Branch label */
    label: string;
}
```

## Ports

| Port          | Type   | Description                       |
| ------------- | ------ | --------------------------------- |
| `input`       | Input  | Input distributed to all branches |
| `branch-{id}` | Output | Dynamic output per branch         |
| `output`      | Output | Merged result                     |

## Usage

```typescript
editor.commands.createNode(
    'parallel',
    {
        label: 'Research',
        branches: [
            { id: 'market', label: 'Market Research' },
            { id: 'competitor', label: 'Competitor Analysis' },
            { id: 'trends', label: 'Trend Analysis' },
        ],
        mergePrompt:
            'Combine these research findings into a comprehensive summary:',
        mergeModel: 'openai/gpt-4o',
    },
    { x: 100, y: 200 }
);
```

## Execution Flow

```
                    Input
                      │
                      ▼
              ┌───────────────┐
              │ Parallel Node │
              └───────┬───────┘
         ┌────────────┼────────────┐
         │            │            │
         ▼            ▼            ▼
    ┌─────────┐  ┌─────────┐  ┌─────────┐
    │ Branch1 │  │ Branch2 │  │ Branch3 │
    │ (Agent) │  │ (Agent) │  │ (Agent) │
    └────┬────┘  └────┬────┘  └────┬────┘
         │            │            │
         └────────────┴────────────┘
                      │
                      ▼
              ┌───────────────┐
              │    Merge      │
              │  (Parallel)   │
              └───────┬───────┘
                      │
                      ▼
                   Output
```

## Connecting Branches

```typescript
const parallelId = 'parallel-1';

// Create branch handlers
editor.commands.createNode(
    'agent',
    { label: 'Market Researcher' },
    { x: 0, y: 300 }
);
editor.commands.createNode(
    'agent',
    { label: 'Competitor Analyst' },
    { x: 200, y: 300 }
);
editor.commands.createNode(
    'agent',
    { label: 'Trend Analyst' },
    { x: 400, y: 300 }
);

// Connect branches
editor.commands.createEdge(parallelId, 'market-agent', 'branch-market');
editor.commands.createEdge(parallelId, 'competitor-agent', 'branch-competitor');
editor.commands.createEdge(parallelId, 'trends-agent', 'branch-trends');
```

## Merging Results

The parallel node waits for all branches, then merges:

```typescript
{
  mergePrompt: `You received results from multiple research agents.

Combine them into a single cohesive report with sections for:
1. Market Overview
2. Competitive Landscape
3. Emerging Trends
4. Recommendations`,

  mergeModel: 'openai/gpt-4o',
}
```

### Auto Merge

If no merge prompt is provided, results are concatenated:

```
Branch 1 Result:
---
[content]

Branch 2 Result:
---
[content]
```

## Validation

| Code                    | Type    | Description          |
| ----------------------- | ------- | -------------------- |
| `INSUFFICIENT_BRANCHES` | Warning | Less than 2 branches |
| `MISSING_MERGE_PROMPT`  | Warning | No merge prompt      |
| `NO_INCOMING_EDGE`      | Error   | Node not connected   |

## Timeout Handling

Branches execute with a timeout to prevent hanging:

```typescript
// Internal default: 60 seconds per branch
// Branches that timeout return empty result
```

## Error Handling

If a branch fails:

```typescript
{
  errorConfig: {
    onError: 'continue', // Other branches still execute
  },
}
```

## Best Practices

### 1. Independent Branches

Each branch should work independently:

```typescript
// ✅ Good - independent research
branches: [
    { id: 'web', label: 'Web Search' },
    { id: 'docs', label: 'Documentation' },
    { id: 'api', label: 'API Reference' },
];

// ❌ Bad - dependent on each other
branches: [
    { id: 'step1', label: 'Get Data' },
    { id: 'step2', label: 'Process Data' }, // Needs step1
];
```

### 2. Clear Merge Instructions

```typescript
{
  mergePrompt: `Combine these results.

Requirements:
- Remove duplicates
- Prioritize accuracy
- Cite sources
- Maximum 500 words`,
}
```

### 3. Limit Branches

More branches = more API calls and cost:

```typescript
// ✅ Good - 2-4 branches
branches: [
  { id: 'a', label: 'A' },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
]

// ❌ Excessive
branches: [...10 branches...] // Slow and expensive
```

## Examples

### Multi-Source Research

```typescript
{
  label: 'Multi-Source Research',
  branches: [
    { id: 'internal', label: 'Internal Docs' },
    { id: 'external', label: 'External Sources' },
  ],
  mergePrompt: 'Synthesize findings from internal documentation and external sources.',
}
```

### Persona Comparison

```typescript
{
  label: 'Perspective Analysis',
  branches: [
    { id: 'optimist', label: 'Optimistic View' },
    { id: 'pessimist', label: 'Critical View' },
    { id: 'neutral', label: 'Balanced View' },
  ],
  mergePrompt: 'Compare these perspectives and provide a balanced analysis.',
}
```

### Quality Assurance

```typescript
{
  label: 'QA Review',
  branches: [
    { id: 'grammar', label: 'Grammar Check' },
    { id: 'style', label: 'Style Review' },
    { id: 'accuracy', label: 'Fact Check' },
  ],
  mergePrompt: 'Compile all quality feedback into actionable improvements.',
}
```

## Vue Component

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="parallel-node">
            <div class="label">{{ node.data.label }}</div>
            <div class="branches">
                <Handle
                    v-for="branch in node.data.branches"
                    :key="branch.id"
                    type="source"
                    :id="`branch-${branch.id}`"
                    :position="Position.Right"
                >
                    {{ branch.label }}
                </Handle>
            </div>
        </div>
    </NodeWrapper>
</template>
```

## Next Steps

-   [While Loop Node](./while-loop.md) - Iterative execution
-   [Agent Node](./agent.md) - Branch handlers
