import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    PortDefinition,
} from '../types';
import type { ValidationError, ValidationWarning } from '../validation';
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
     *
     * @internal Execution is handled by OpenRouterExecutionAdapter.
     * Calling this directly will raise to prevent confusing placeholder data.
     */
    async execute(): Promise<{ output: unknown; nextNodes: string[] }> {
        throw new Error(
            'SubflowExtension.execute is handled by OpenRouterExecutionAdapter. ' +
                'Use the execution adapter to run workflows instead of calling extensions directly.'
        );
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
