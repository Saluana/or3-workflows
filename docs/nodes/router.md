# Router Node

Conditional branching based on LLM classification.

## Overview

Router nodes use an LLM to classify input and route execution to different branches. Perfect for intent classification, sentiment routing, and decision trees.

## Import

```typescript
import { RouterNodeExtension } from '@or3/workflow-core';
```

## Configuration

```typescript
interface RouterNodeData {
    /** Display label */
    label: string;

    /** Model for classification */
    model?: string;

    /** Custom classification prompt */
    prompt?: string;

    /** Route definitions */
    routes: RouteDefinition[];
}

interface RouteDefinition {
    /** Unique route ID */
    id: string;

    /** Route label (shown on output handle) */
    label: string;

    /** Description for LLM classification */
    description?: string;

    /** Match conditions */
    conditions?: RouteCondition[];
}
```

## Ports

| Port         | Type   | Description                |
| ------------ | ------ | -------------------------- |
| `input`      | Input  | Receives input to classify |
| `route-{id}` | Output | Dynamic outputs per route  |

## Usage

```typescript
editor.commands.createNode(
    'router',
    {
        label: 'Intent Router',
        model: 'openai/gpt-4o-mini',
        routes: [
            {
                id: 'billing',
                label: 'Billing',
                description:
                    'Questions about invoices, payments, subscriptions',
            },
            {
                id: 'technical',
                label: 'Technical',
                description: 'Technical issues, bugs, how-to questions',
            },
            {
                id: 'sales',
                label: 'Sales',
                description: 'Pricing, features, upgrades, new purchases',
            },
            {
                id: 'other',
                label: 'Other',
                description: 'Anything else',
            },
        ],
    },
    { x: 100, y: 200 }
);
```

## Classification

The router uses an LLM to classify input:

```typescript
// Internal classification prompt
const systemPrompt = `
Classify the user message into ONE of these categories:
${routes.map((r) => `- ${r.label}: ${r.description}`).join('\n')}

Respond with ONLY the category name.
`;
```

### Custom Prompt

Override the default classification:

```typescript
{
  prompt: `You are a sentiment analyzer.

Classify as: positive, negative, or neutral.

Respond with ONLY the sentiment.`,
  routes: [
    { id: 'positive', label: 'Positive' },
    { id: 'negative', label: 'Negative' },
    { id: 'neutral', label: 'Neutral' },
  ],
}
```

## Connecting Routes

Each route creates a dynamic output handle:

```typescript
// Create router
const routerId = 'router-1';

// Connect routes to handlers
editor.commands.createEdge(routerId, 'billing-agent', 'route-billing');
editor.commands.createEdge(routerId, 'tech-agent', 'route-technical');
editor.commands.createEdge(routerId, 'sales-agent', 'route-sales');
editor.commands.createEdge(routerId, 'general-agent', 'route-other');
```

## Execution Flow

```
Input: "I need help with my invoice"
        │
        ▼
┌──────────────────┐
│  Router Node     │
│  (Classifies)    │
└────────┬─────────┘
         │
    ┌────┴────┐
    │ billing │ ← LLM classified as "billing"
    └────┬────┘
         │
         ▼
┌──────────────────┐
│  Billing Agent   │
└──────────────────┘
```

## Multi-Condition Routes

Add conditions for complex routing:

```typescript
{
  routes: [
    {
      id: 'urgent',
      label: 'Urgent',
      conditions: [
        { type: 'contains', value: 'urgent' },
        { type: 'contains', value: 'emergency' },
        { type: 'contains', value: 'asap' },
      ],
    },
    {
      id: 'normal',
      label: 'Normal',
      description: 'Default for non-urgent messages',
    },
  ],
}
```

## Validation

| Code                 | Type    | Description          |
| -------------------- | ------- | -------------------- |
| `MISSING_ROUTE`      | Error   | No routes defined    |
| `NO_INCOMING_EDGE`   | Error   | Router not connected |
| `MISSING_EDGE_LABEL` | Warning | Route not connected  |

## Edge Labels

Edge labels help identify routes in the UI:

```typescript
editor.commands.updateEdgeData(edgeId, {
    label: 'Billing Issues',
});
```

## Default Route

Always include a catch-all route:

```typescript
{
  routes: [
    { id: 'known', label: 'Known Intent', ... },
    { id: 'unknown', label: 'Unknown', description: 'Fallback for unrecognized input' },
  ],
}
```

## Best Practices

### 1. Clear Route Descriptions

```typescript
{
  routes: [
    {
      id: 'complaint',
      label: 'Complaint',
      description: 'User is frustrated, unhappy, or reporting a problem with service',
    },
  ],
}
```

### 2. Use Fast Models

Classification doesn't need powerful models:

```typescript
{
    model: 'openai/gpt-4o-mini';
}
```

### 3. Limit Routes

Too many routes reduce accuracy. Aim for 3-7:

```typescript
// ✅ Good
routes: ['billing', 'technical', 'sales', 'other']

// ❌ Too many
routes: ['billing', 'invoices', 'payments', 'refunds', 'subscriptions', ...]
```

### 4. Test Classification

Verify routing with sample inputs:

```typescript
// Test cases
const testInputs = [
    { input: 'Cancel my subscription', expected: 'billing' },
    { input: 'App crashes on login', expected: 'technical' },
];
```

## Vue Component

The `RouterNode.vue` shows dynamic handles:

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="router-node">
            <div class="label">{{ node.data.label }}</div>
            <div class="routes">
                <Handle
                    v-for="route in node.data.routes"
                    :key="route.id"
                    type="source"
                    :id="`route-${route.id}`"
                    :position="Position.Right"
                />
            </div>
        </div>
    </NodeWrapper>
</template>
```

## Examples

### Intent Classification

```typescript
{
  label: 'Intent Classifier',
  routes: [
    { id: 'question', label: 'Question', description: 'User asking for information' },
    { id: 'request', label: 'Request', description: 'User wants something done' },
    { id: 'complaint', label: 'Complaint', description: 'User reporting a problem' },
    { id: 'feedback', label: 'Feedback', description: 'User sharing opinion' },
  ],
}
```

### Language Detection

```typescript
{
  label: 'Language Router',
  prompt: 'Detect the language. Respond with: english, spanish, french, or other.',
  routes: [
    { id: 'english', label: 'English' },
    { id: 'spanish', label: 'Spanish' },
    { id: 'french', label: 'French' },
    { id: 'other', label: 'Other' },
  ],
}
```

### Sentiment Analysis

```typescript
{
  label: 'Sentiment',
  prompt: 'Analyze sentiment. Respond with: positive, negative, or neutral.',
  routes: [
    { id: 'positive', label: '😊 Positive' },
    { id: 'negative', label: '😞 Negative' },
    { id: 'neutral', label: '😐 Neutral' },
  ],
}
```

## Next Steps

-   [Agent Node](./agent.md) - Handle routed input
-   [Parallel Node](./parallel.md) - Concurrent execution
