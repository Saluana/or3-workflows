import { z } from 'zod';
import { HITLConfigSchema } from './hitl';

// ============================================================================
// Zod Schemas
// ============================================================================

// Base node data schema
const BaseNodeDataSchema = z.object({
    label: z.string(),
    description: z.string().optional(),
    status: z.enum(['idle', 'active', 'completed', 'error']).optional(),
});

// Error handling schema
const NodeErrorConfigSchema = z
    .object({
        mode: z.enum(['stop', 'continue', 'branch']),
        retry: z
            .object({
                maxRetries: z.number().int().min(0),
                baseDelay: z.number().int().min(0),
                maxDelay: z.number().int().min(0).optional(),
                retryOn: z.array(z.string()).optional(),
                skipOn: z.array(z.string()).optional(),
            })
            .optional(),
    })
    .optional();

// Per-node-type data schemas
const StartNodeDataSchema = BaseNodeDataSchema;

const AgentNodeDataSchema = BaseNodeDataSchema.extend({
    model: z.string().min(1, 'Agent node requires a model'),
    prompt: z.string(),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().int().positive().optional(),
    tools: z.array(z.string()).optional(),
    acceptsImages: z.boolean().optional(),
    acceptsAudio: z.boolean().optional(),
    acceptsVideo: z.boolean().optional(),
    acceptsFiles: z.boolean().optional(),
    errorHandling: NodeErrorConfigSchema,
    hitl: HITLConfigSchema,
    maxToolIterations: z.number().int().positive().optional(),
    onMaxToolIterations: z.enum(['warning', 'error', 'hitl']).optional(),
});

const RouteDefinitionSchema = z.object({
    id: z.string(),
    label: z.string(),
    condition: z
        .object({
            type: z.enum(['contains', 'equals', 'regex', 'custom']),
            field: z.string().optional(),
            value: z.string().optional(),
            expression: z.string().optional(),
        })
        .optional(),
});

const RouterNodeDataSchema = BaseNodeDataSchema.extend({
    model: z.string().optional(),
    prompt: z.string().optional(),
    routes: z
        .array(RouteDefinitionSchema)
        .min(1, 'Router requires at least one route'),
    errorHandling: NodeErrorConfigSchema,
    hitl: HITLConfigSchema,
});

const BranchDefinitionSchema = z.object({
    id: z.string(),
    label: z.string(),
    model: z.string().optional(),
    prompt: z.string().optional(),
    tools: z.array(z.string()).optional(),
});

const ParallelNodeDataSchema = BaseNodeDataSchema.extend({
    model: z.string().optional(),
    prompt: z.string().optional(),
    branches: z
        .array(BranchDefinitionSchema)
        .min(1, 'Parallel requires at least one branch'),
    mergeEnabled: z.boolean().optional(),
});

const ToolNodeDataSchema = BaseNodeDataSchema.extend({
    toolId: z.string().min(1, 'Tool node requires a toolId'),
    config: z.record(z.unknown()).optional(),
    errorHandling: NodeErrorConfigSchema,
    hitl: HITLConfigSchema,
});

const MemoryNodeDataSchema = BaseNodeDataSchema.extend({
    operation: z.enum(['query', 'store']),
    text: z.string().optional(),
    limit: z.number().int().positive().optional(),
    filter: z.record(z.unknown()).optional(),
    metadata: z.record(z.unknown()).optional(),
    fallback: z.string().optional(),
});

const WhileLoopNodeDataSchema = BaseNodeDataSchema.extend({
    conditionPrompt: z
        .string()
        .min(1, 'While loop requires a condition prompt'),
    conditionModel: z.string().optional(),
    maxIterations: z
        .number()
        .int()
        .positive('maxIterations must be a positive integer'),
    onMaxIterations: z.enum(['error', 'warning', 'continue']),
    customEvaluator: z.string().optional(),
    loopPrompt: z.string().optional(),
    loopMode: z.enum(['condition', 'fixed']).optional(),
    includePreviousOutputs: z.boolean().optional(),
    includeIterationContext: z.boolean().optional(),
    outputMode: z.enum(['last', 'accumulate']).optional(),
});

const SubflowNodeDataSchema = BaseNodeDataSchema.extend({
    subflowId: z.string().min(1, 'Subflow node requires a subflowId'),
    inputMappings: z.record(z.string()).optional(),
    preserveContext: z.boolean().optional(),
});

const OutputNodeDataSchema = BaseNodeDataSchema.extend({
    template: z.string().optional(),
    format: z.enum(['text', 'json', 'markdown']).optional(),
});

/**
 * Strict node data schema with type discrimination.
 * Use for parsing untrusted input where fail-fast is desired.
 */
export const StrictNodeDataSchema = z.discriminatedUnion('_nodeType', [
    z.object({ _nodeType: z.literal('start') }).merge(StartNodeDataSchema),
    z.object({ _nodeType: z.literal('agent') }).merge(AgentNodeDataSchema),
    z.object({ _nodeType: z.literal('router') }).merge(RouterNodeDataSchema),
    z.object({ _nodeType: z.literal('condition') }).merge(RouterNodeDataSchema), // Legacy alias
    z
        .object({ _nodeType: z.literal('parallel') })
        .merge(ParallelNodeDataSchema),
    z.object({ _nodeType: z.literal('tool') }).merge(ToolNodeDataSchema),
    z.object({ _nodeType: z.literal('memory') }).merge(MemoryNodeDataSchema),
    z
        .object({ _nodeType: z.literal('whileLoop') })
        .merge(WhileLoopNodeDataSchema),
    z.object({ _nodeType: z.literal('subflow') }).merge(SubflowNodeDataSchema),
    z.object({ _nodeType: z.literal('output') }).merge(OutputNodeDataSchema),
]);

/**
 * Get the appropriate data schema for a node type.
 */
export function getNodeDataSchema(nodeType: string): z.ZodType<unknown> {
    switch (nodeType) {
        case 'start':
            return StartNodeDataSchema;
        case 'agent':
            return AgentNodeDataSchema;
        case 'router':
        case 'condition':
            return RouterNodeDataSchema;
        case 'parallel':
            return ParallelNodeDataSchema;
        case 'tool':
            return ToolNodeDataSchema;
        case 'memory':
            return MemoryNodeDataSchema;
        case 'whileLoop':
            return WhileLoopNodeDataSchema;
        case 'subflow':
            return SubflowNodeDataSchema;
        case 'output':
            return OutputNodeDataSchema;
        default:
            return z.record(z.unknown()); // Unknown node types get loose validation
    }
}

/**
 * Validate node data against its type-specific schema.
 * Returns Zod parse result.
 */
export function validateNodeData(
    nodeType: string,
    data: unknown
): z.SafeParseReturnType<unknown, unknown> {
    const schema = getNodeDataSchema(nodeType);
    return schema.safeParse(data);
}

// Legacy loose schemas for backwards compatibility
export const WorkflowNodeSchema = z.object({
    id: z.string(),
    type: z.string(),
    position: z.object({ x: z.number(), y: z.number() }),
    data: z.record(z.any()),
    selected: z.boolean().optional(),
});

/**
 * Strict workflow node schema that validates data per node type.
 */
export const StrictWorkflowNodeSchema = z
    .object({
        id: z.string(),
        type: z.string(),
        position: z.object({ x: z.number(), y: z.number() }),
        selected: z.boolean().optional(),
    })
    .passthrough()
    .superRefine((node, ctx) => {
        const result = validateNodeData(node.type, node.data);
        if (!result.success) {
            for (const issue of result.error.issues) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['data', ...issue.path],
                    message: issue.message,
                });
            }
        }
    });

export const WorkflowEdgeSchema = z.object({
    id: z.string(),
    source: z.string(),
    target: z.string(),
    sourceHandle: z.string().optional(),
    targetHandle: z.string().optional(),
    label: z.string().optional(),
    data: z.record(z.any()).optional(),
});

export const WorkflowDataSchema = z.object({
    meta: z.object({
        version: z.string(),
        name: z.string(),
        description: z.string().optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
    }),
    nodes: z.array(WorkflowNodeSchema),
    edges: z.array(WorkflowEdgeSchema),
});

/**
 * Strict workflow schema that validates node data per type.
 * Use for parsing untrusted workflow JSON.
 */
export const StrictWorkflowDataSchema = z.object({
    meta: z.object({
        version: z.string(),
        name: z.string().min(1, 'Workflow name is required'),
        description: z.string().optional(),
        createdAt: z.string().optional(),
        updatedAt: z.string().optional(),
    }),
    nodes: z.array(StrictWorkflowNodeSchema),
    edges: z.array(WorkflowEdgeSchema),
});
