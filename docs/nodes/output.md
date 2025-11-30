# Output Node

Format and finalize workflow output.

## Overview

Output nodes are terminal nodes that format the final result. They can template content, transform data, and mark the end of a workflow path.

## Import

```typescript
import {
    OutputNodeExtension,
    type OutputNodeData,
    type OutputFormat,
    interpolateTemplate,
    formatOutput,
} from '@or3/workflow-core';
```

## Configuration

```typescript
interface OutputNodeData {
    /** Display label */
    label: string;

    /** Output format */
    format: OutputFormat;

    /** Template for formatting (when format is 'template') */
    template?: string;

    /** Schema for structured output */
    schema?: Record<string, unknown>;
}

type OutputFormat = 'passthrough' | 'template' | 'json' | 'markdown';
```

## Ports

| Port    | Type   | Description               |
| ------- | ------ | ------------------------- |
| `input` | Input  | Content to format         |
| (none)  | Output | Terminal node, no outputs |

## Usage

```typescript
editor.commands.createNode(
    'output',
    {
        label: 'Final Response',
        format: 'template',
        template: `## Summary

{{input}}

---
Generated at {{timestamp}}`,
    },
    { x: 100, y: 300 }
);
```

## Output Formats

### Passthrough

Pass input directly without modification:

```typescript
{
  format: 'passthrough',
}
```

### Template

Use placeholders to format output:

```typescript
{
  format: 'template',
  template: `Dear {{customer_name}},

{{response}}

Best regards,
Support Team`,
}
```

Available placeholders:

-   `{{input}}` - Raw input content
-   `{{timestamp}}` - Current ISO timestamp
-   `{{nodeId}}` - Output node ID
-   Custom placeholders from context

### JSON

Structure output as JSON:

```typescript
{
  format: 'json',
  schema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      confidence: { type: 'number' },
      categories: { type: 'array', items: { type: 'string' } },
    },
  },
}
```

### Markdown

Format as markdown:

```typescript
{
  format: 'markdown',
  template: `# Result

{{input}}

## Metadata
- Processed: {{timestamp}}
`,
}
```

## Utility Functions

### interpolateTemplate()

Replace placeholders in a template:

```typescript
import { interpolateTemplate } from '@or3/workflow-core';

const result = interpolateTemplate(
    'Hello {{name}}, your order {{orderId}} is ready.',
    {
        name: 'Alice',
        orderId: '12345',
    }
);
// "Hello Alice, your order 12345 is ready."
```

### formatOutput()

Format content based on output node config:

```typescript
import { formatOutput } from '@or3/workflow-core';

const result = formatOutput(inputContent, nodeData, context);
```

### extractTemplatePlaceholders()

Get placeholders from a template:

```typescript
import { extractTemplatePlaceholders } from '@or3/workflow-core';

const placeholders = extractTemplatePlaceholders('{{name}} - {{email}}');
// ['name', 'email']
```

## Validation

| Code               | Type    | Description         |
| ------------------ | ------- | ------------------- |
| `NO_INCOMING_EDGE` | Warning | Node has no input   |
| `INVALID_FORMAT`   | Error   | Unknown format type |

## Execution Result

When a workflow ends at an Output node, the result includes:

```typescript
interface ExecutionResult {
    output: string; // Raw output
    formattedOutput: string; // Formatted by output node
    metadata: {
        outputNodeId: string;
        format: OutputFormat;
        timestamp: string;
    };
}
```

## Multiple Outputs

Workflows can have multiple output nodes for different paths:

```typescript
// Success path
editor.commands.createNode(
    'output',
    {
        label: 'Success Response',
        format: 'template',
        template: '✅ {{input}}',
    },
    { x: 300, y: 200 }
);

// Error path
editor.commands.createNode(
    'output',
    {
        label: 'Error Response',
        format: 'template',
        template: '❌ Error: {{input}}',
    },
    { x: 300, y: 400 }
);
```

## Best Practices

### 1. Use Consistent Formatting

```typescript
// Define standard templates
const templates = {
    success: '✅ {{message}}',
    error: '❌ {{message}}',
    info: 'ℹ️ {{message}}',
};
```

### 2. Include Metadata

```typescript
{
  template: `{{response}}

---
_Confidence: {{confidence}}% | Generated: {{timestamp}}_`,
}
```

### 3. Handle Missing Placeholders

Unmatched placeholders are left as-is:

```typescript
interpolateTemplate('Hello {{missing}}', {});
// "Hello {{missing}}"
```

### 4. Validate JSON Output

```typescript
{
  format: 'json',
  schema: {
    type: 'object',
    required: ['status', 'data'],
    properties: {
      status: { type: 'string', enum: ['success', 'error'] },
      data: { type: 'object' },
    },
  },
}
```

## Examples

### Customer Response

```typescript
{
  label: 'Customer Response',
  format: 'template',
  template: `Hi {{customer_name}},

{{response}}

Is there anything else I can help you with?

Best,
{{agent_name}}
Support Team`,
}
```

### API Response

```typescript
{
  label: 'API Response',
  format: 'json',
  schema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
  },
}
```

### Report

```typescript
{
  label: 'Analysis Report',
  format: 'markdown',
  template: `# Analysis Report

## Summary
{{summary}}

## Key Findings
{{findings}}

## Recommendations
{{recommendations}}

---
*Generated on {{timestamp}}*`,
}
```

## Vue Component

```vue
<template>
    <NodeWrapper :node="node" :status="status">
        <div class="output-node">
            <div class="icon">📤</div>
            <div class="label">{{ node.data.label }}</div>
            <div class="format">{{ node.data.format }}</div>
        </div>
    </NodeWrapper>
</template>
```

## Type Guard

```typescript
import { isOutputNodeData } from '@or3/workflow-core';

if (isOutputNodeData(node.data)) {
    console.log(node.data.format); // Type-safe access
}
```

## Next Steps

-   [Execution](../api/execution.md) - Running workflows
-   [Start Node](./start.md) - Workflow entry point
