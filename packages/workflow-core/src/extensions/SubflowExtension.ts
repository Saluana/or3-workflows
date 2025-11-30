import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    PortDefinition,
    ExecutionContext,
    ValidationError,
    ValidationWarning,
} from '../types';
import type {
    SubflowNodeData,
    SubflowRegistry,
    SubflowPortType,
} from '../subflow';
import { validateInputMappings } from '../subflow';

/**
 * Map SubflowPortType to PortDefinition dataType.
 * 'number' maps to 'any' since PortDefinition doesn't support 'number'.
 */
function mapDataType(
    type: SubflowPortType
): 'any' | 'string' | 'object' | 'array' {
    if (type === 'number') {
        return 'any';
    }
    return type;
}

/**
 * Subflow Node Extension
 *
 * Represents a reusable workflow component that can be embedded in other workflows.
 * Executes with isolated context but can optionally share session memory.
 *
 * @example
 * ```typescript
 * const subflowNode: WorkflowNode = {
 *   id: 'subflow-1',
 *   type: 'subflow',
 *   position: { x: 100, y: 100 },
 *   data: {
 *     label: 'Email Composer',
 *     subflowId: 'email-composer',
 *     inputMappings: {
 *       recipient: '{{context.email}}',
 *       subject: 'Summary Request',
 *       context: '{{output}}',
 *     },
 *     shareSession: true,
 *   },
 * };
 * ```
 */
export const SubflowExtension: NodeExtension = {
    name: 'subflow',
    type: 'node',

    // Port definitions - dynamic based on subflow definition
    // These are base ports; actual ports are determined by the subflow definition
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
            label: 'Output',
            dataType: 'any',
            multiple: true,
        },
        {
            id: 'error',
            type: 'output',
            label: 'Error',
            dataType: 'string',
        },
    ],

    // Default data for new nodes
    defaultData: {
        label: 'Subflow',
        subflowId: '',
        inputMappings: {},
        shareSession: true,
    },

    /**
     * Execute the subflow node.
     */
    async execute(
        context: ExecutionContext,
        node: WorkflowNode
    ): Promise<{ output: string; nextNodes: string[] }> {
        const data = node.data as SubflowNodeData;

        // 1. Check subflow depth limit
        const currentDepth = context.subflowDepth ?? 0;
        const maxDepth = context.maxSubflowDepth ?? 10;
        if (currentDepth >= maxDepth) {
            throw new Error(
                `Maximum subflow depth (${maxDepth}) exceeded. Check for recursive subflows.`
            );
        }

        // 2. Get registry from context
        const registry = context.subflowRegistry;
        if (!registry) {
            throw new Error(
                `Subflow node "${node.id}" requires a subflowRegistry in ExecutionContext`
            );
        }

        // 3. Get subflow definition
        const subflow = registry.get(data.subflowId);
        if (!subflow) {
            throw new Error(
                `Subflow "${data.subflowId}" not found in registry`
            );
        }

        if (!context.executeWorkflow) {
            throw new Error(
                'Subflow execution requires executeWorkflow capability in context'
            );
        }

        // 4. Validate input mappings
        const mappingValidation = validateInputMappings(
            subflow,
            data.inputMappings || {}
        );
        if (!mappingValidation.valid) {
            throw new Error(
                `Missing required inputs for subflow "${
                    data.subflowId
                }": ${mappingValidation.missing.join(', ')}`
            );
        }

        // 5. Resolve input values
        const resolvedInputs: Record<string, unknown> = {};
        for (const input of subflow.inputs) {
            const mapping = data.inputMappings?.[input.id];
            if (mapping !== undefined) {
                // Handle expression syntax {{...}}
                if (
                    typeof mapping === 'string' &&
                    mapping.startsWith('{{') &&
                    mapping.endsWith('}}')
                ) {
                    const expr = mapping.slice(2, -2).trim();
                    // Simple expression resolution
                    if (expr === 'output' || expr === 'input') {
                        resolvedInputs[input.id] = context.input;
                    } else if (expr.startsWith('outputs.')) {
                        const nodeId = expr.slice(8);
                        resolvedInputs[input.id] =
                            context.outputs[nodeId] ?? '';
                    } else if (expr.startsWith('context.')) {
                        // This is tricky as context is strictly typed now.
                        // But we can check known properties
                        if (expr === 'context.sessionId') {
                            resolvedInputs[input.id] = context.sessionId;
                        } else {
                            // Fallback or empty
                            resolvedInputs[input.id] = '';
                        }
                    } else {
                        resolvedInputs[input.id] =
                            context.outputs[expr] ?? mapping;
                    }
                } else {
                    resolvedInputs[input.id] = mapping;
                }
            } else if (input.default !== undefined) {
                resolvedInputs[input.id] = input.default;
            }
        }

        // 6. Prepare subflow input
        const primaryInput = subflow.inputs[0];
        const subflowInputText = primaryInput
            ? String(resolvedInputs[primaryInput.id] ?? context.input)
            : context.input;

        // 7. Execute subflow with session sharing and depth tracking
        try {
            // Build execution options for the subflow
            const subflowOptions: Record<string, unknown> = {
                // Track depth for recursive subflow protection
                _subflowDepth: currentDepth + 1,
            };

            // Share session if configured
            if (data.shareSession) {
                subflowOptions.sessionId = context.sessionId;
            }

            const subflowResult = await context.executeWorkflow(
                subflow.workflow,
                {
                    text: subflowInputText,
                    attachments: context.attachments,
                },
                subflowOptions
            );

            const output = subflowResult.output ?? '';
            const outgoingEdges = context.getOutgoingEdges(node.id, 'output');

            return {
                output,
                nextNodes: outgoingEdges.map((e) => e.target),
            };
        } catch (error) {
            const message =
                error instanceof Error ? error.message : String(error);
            const errorEdges = context.getOutgoingEdges(node.id, 'error');
            if (errorEdges.length > 0) {
                // If error output is connected, route there but return empty output
                // Wait, if I throw, the adapter catches it.
                // But if I want to route to 'error' handle, I should return nextNodes.
                // BUT `execute` signature usually throws on critical failure.
                // However, `executeNodeInternal` usually catches errors.
                // If I return here, it is considered success?
                // No, I should rethrow or let adapter handle it.
                // But wait, the original logic routed to error handle if available.
                // "return { output: ..., success: false }"
                // My new signature just returns output/nextNodes.
                // So I should return the error path.

                return {
                    output: `Subflow error: ${message}`,
                    nextNodes: errorEdges.map((e) => e.target),
                };
            }
            throw error;
        }
    },

    /**
     * Validate the subflow node.
     *
     * @param node The subflow node to validate
     * @param edges All edges in the workflow
     * @param registry Optional subflow registry for deep validation
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[],
        registry?: SubflowRegistry
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as SubflowNodeData;

        // Check for subflow ID
        if (!data.subflowId) {
            errors.push({
                type: 'error',
                code: 'MISSING_SUBFLOW_ID',
                message: 'Subflow node requires a subflow to be selected',
                nodeId: node.id,
            });
            return errors;
        }

        // If registry is provided, validate against it
        if (registry) {
            const subflow = registry.get(data.subflowId);

            if (!subflow) {
                errors.push({
                    type: 'error',
                    code: 'SUBFLOW_NOT_FOUND',
                    message: `Subflow "${data.subflowId}" not found in registry`,
                    nodeId: node.id,
                });
                return errors;
            }

            // Validate input mappings
            const mappingValidation = validateInputMappings(
                subflow,
                data.inputMappings || {}
            );

            if (!mappingValidation.valid) {
                for (const missingInput of mappingValidation.missing) {
                    errors.push({
                        type: 'error',
                        code: 'MISSING_INPUT_MAPPING',
                        message: `Missing required input mapping: "${missingInput}"`,
                        nodeId: node.id,
                    });
                }
            }

            // Warn if subflow has no outputs defined
            if (subflow.outputs.length === 0) {
                errors.push({
                    type: 'warning',
                    code: 'NO_SUBFLOW_OUTPUTS',
                    message: 'Subflow has no outputs defined',
                    nodeId: node.id,
                });
            }
        } else {
            // Warn that validation is incomplete without registry
            errors.push({
                type: 'warning',
                code: 'NO_REGISTRY',
                message: 'Subflow cannot be fully validated without registry',
                nodeId: node.id,
            });
        }

        // Check for incoming edges
        const hasIncomingEdge = edges.some((edge) => edge.target === node.id);
        if (!hasIncomingEdge) {
            errors.push({
                type: 'warning',
                code: 'NO_INPUT',
                message: 'Subflow node has no incoming connections',
                nodeId: node.id,
            });
        }

        // Check for outgoing edges
        const hasOutgoingEdge = edges.some((edge) => edge.source === node.id);
        if (!hasOutgoingEdge) {
            errors.push({
                type: 'warning',
                code: 'NO_OUTPUT',
                message: 'Subflow node has no outgoing connections',
                nodeId: node.id,
            });
        }

        return errors;
    },
};

/**
 * Get dynamic ports for a subflow node based on its definition.
 *
 * @param subflowId The subflow ID
 * @param registry The subflow registry
 * @returns Input and output port definitions
 */
export function getSubflowPorts(
    subflowId: string,
    registry: SubflowRegistry
): {
    inputs: PortDefinition[];
    outputs: PortDefinition[];
} {
    const subflow = registry.get(subflowId);

    if (!subflow) {
        return {
            inputs: SubflowExtension.inputs || [],
            outputs: SubflowExtension.outputs || [],
        };
    }

    // Generate input ports from subflow definition
    const inputs: PortDefinition[] = subflow.inputs.map((input) => ({
        id: input.id,
        type: 'input' as const,
        label: input.name,
        dataType: mapDataType(input.type),
        required: input.required,
    }));

    // Always have at least one input
    if (inputs.length === 0) {
        inputs.push({
            id: 'input',
            type: 'input',
            label: 'Input',
            dataType: 'any',
            required: true,
        });
    }

    // Generate output ports from subflow definition
    const outputs: PortDefinition[] = subflow.outputs.map((output) => ({
        id: output.id,
        type: 'output' as const,
        label: output.name,
        dataType: mapDataType(output.type),
    }));

    // Always add error output
    outputs.push({
        id: 'error',
        type: 'output',
        label: 'Error',
        dataType: 'string',
    });

    return { inputs, outputs };
}

/**
 * Create default input mappings for a subflow.
 *
 * @param subflowId The subflow ID
 * @param registry The subflow registry
 * @returns Default input mappings object
 */
export function createDefaultInputMappings(
    subflowId: string,
    registry: SubflowRegistry
): Record<string, unknown> {
    const subflow = registry.get(subflowId);

    if (!subflow) {
        return {};
    }

    const mappings: Record<string, unknown> = {};

    for (const input of subflow.inputs) {
        if (input.default !== undefined) {
            mappings[input.id] = input.default;
        } else if (input.required) {
            // Use placeholder expression
            mappings[input.id] = `{{${input.id}}}`;
        }
    }

    return mappings;
}
