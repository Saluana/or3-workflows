/**
 * Schema-validation node extension and Structured Agent palette preset (R4.AC1,
 * R4.AC5).
 *
 * `SchemaValidationNodeExtension` validates any upstream value (produced by a
 * tool or non-agent node) against a configured JSON Schema / registered schema,
 * emitting a typed `value` plus the stable string projection. The Structured
 * Agent preset is a *configured* {@link AgentNodeExtension} — it does not
 * duplicate agent execution code.
 */
import type {
    ExecutionContext,
    NodeExtension,
    ValidationError,
    ValidationWarning,
    WorkflowEdge,
    WorkflowNode,
} from '../types';
import type { JsonValue } from '../gateway/types';
import {
    parseValidateRepair,
    StructuredValidationError,
} from '../schema/validation';
import { projectValueToString } from '../schema/projection';
import { schemaRegistry, SchemaRegistry } from '../schema/SchemaRegistry';
import type { StructuredOutputSpec } from '../schema/types';
import { AgentNodeExtension } from './AgentNodeExtension';

/** Node data for a schema-validation node. */
export interface SchemaValidationNodeData {
    label: string;
    description?: string;
    /** Serializable spec (JSON Schema + repair policy). */
    spec: StructuredOutputSpec;
    /** Behavior on validation failure. */
    onInvalid?: 'error' | 'route';
}

function coerceCandidate(input: string): string {
    return input;
}

/**
 * Create a schema-validation node extension bound to a specific registry
 * (defaults to the shared {@link schemaRegistry}).
 */
export function createSchemaValidationNodeExtension(
    registry: SchemaRegistry = schemaRegistry
): NodeExtension {
    return {
        name: 'schemaValidation',
        type: 'node',
        label: 'Schema Validation',
        description:
            'Validate an upstream value against a JSON Schema and emit a typed value.',
        category: 'Data',
        icon: 'shield-check',
        inputs: [
            {
                id: 'input',
                type: 'input',
                label: 'Input',
                dataType: 'any',
                required: true,
            },
        ],
        outputs: [
            {
                id: 'output',
                type: 'output',
                label: 'Valid',
                dataType: 'any',
                multiple: true,
            },
            {
                id: 'invalid',
                type: 'output',
                label: 'Invalid',
                dataType: 'string',
            },
        ],
        defaultData: {
            label: 'Schema Validation',
            spec: undefined,
            onInvalid: 'error',
        },

        async execute(context: ExecutionContext, node: WorkflowNode) {
            const data = node.data as unknown as SchemaValidationNodeData;
            if (!data.spec) {
                throw new Error(
                    'Schema Validation node requires a "spec" (StructuredOutputSpec).'
                );
            }
            const result = await parseValidateRepair(
                coerceCandidate(context.input),
                data.spec,
                { registry }
            );

            if (!result.ok) {
                if (data.onInvalid === 'route') {
                    const invalidEdges = context.getOutgoingEdges(
                        node.id,
                        'invalid'
                    );
                    return {
                        output: JSON.stringify(result.issues),
                        nextNodes: invalidEdges.map((e) => e.target),
                        metadata: { validationIssues: result.issues },
                    };
                }
                throw new StructuredValidationError(result);
            }

            const value = result.value as JsonValue;
            const outgoing = context.getOutgoingEdges(node.id, 'output');
            return {
                output: projectValueToString(value),
                value,
                valueSchema: {
                    id: result.schema.id,
                    version: result.schema.version,
                },
                nextNodes: outgoing.map((e) => e.target),
            };
        },

        validate(
            node: WorkflowNode,
            edges: WorkflowEdge[]
        ): (ValidationError | ValidationWarning)[] {
            const errors: (ValidationError | ValidationWarning)[] = [];
            const data = node.data as unknown as SchemaValidationNodeData;
            if (!data.spec) {
                errors.push({
                    type: 'error',
                    code: 'DATA_VALIDATION_ERROR',
                    message:
                        'Schema Validation node requires a structured-output spec',
                    nodeId: node.id,
                });
            }
            const incoming = edges.filter((e) => e.target === node.id);
            if (incoming.length === 0) {
                errors.push({
                    type: 'error',
                    code: 'DISCONNECTED_NODE',
                    message: 'Schema Validation node has no incoming connections',
                    nodeId: node.id,
                });
            }
            return errors;
        },
    };
}

/** Default schema-validation node extension bound to the shared registry. */
export const SchemaValidationNodeExtension =
    createSchemaValidationNodeExtension();

/** Options for the Structured Agent palette preset. */
export interface StructuredAgentPresetOptions {
    /** Structured output request used to constrain the agent's response. */
    structuredOutput: NonNullable<
        import('../types').AgentNodeData['structuredOutput']
    >;
    /** Palette node type name (default: `structuredAgent`). */
    name?: string;
    label?: string;
    description?: string;
    model?: string;
    prompt?: string;
}

/**
 * Create a "Structured Agent" palette preset.
 *
 * This is a configured {@link AgentNodeExtension} — it reuses the agent executor
 * verbatim and only pre-populates `defaultData` (model, prompt, and the
 * structured-output request). No agent execution code is duplicated.
 */
export function createStructuredAgentPreset(
    options: StructuredAgentPresetOptions
): NodeExtension {
    return {
        ...AgentNodeExtension,
        name: options.name ?? 'structuredAgent',
        label: options.label ?? 'Structured Agent',
        description:
            options.description ??
            'An agent that returns a schema-validated structured value.',
        category: 'AI',
        defaultData: {
            ...AgentNodeExtension.defaultData,
            label: options.label ?? 'Structured Agent',
            ...(options.model ? { model: options.model } : {}),
            ...(options.prompt ? { prompt: options.prompt } : {}),
            structuredOutput: options.structuredOutput,
        },
    };
}
