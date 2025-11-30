import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    ExecutionContext,
    RouterNodeData,
    RouteDefinition,
    LLMProvider,
    NodeExecutionResult,
    ValidationError,
    ValidationWarning,
} from '../types';

/** Default model for router classification */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/**
 * Router Node Extension
 *
 * A conditional branching node that uses LLM classification to determine
 * which route to take based on the input content.
 */
export const RouterNodeExtension: NodeExtension = {
    name: 'router',
    type: 'node',

    // Port definitions - outputs are dynamic based on routes
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
        // Dynamic outputs based on routes - these are defaults
        {
            id: 'route-1',
            type: 'output',
            label: 'Route 1',
            dataType: 'any',
        },
        {
            id: 'route-2',
            type: 'output',
            label: 'Route 2',
            dataType: 'any',
        },
        {
            id: 'error',
            type: 'output',
            label: 'Error',
            dataType: 'any',
        },
        {
            id: 'rejected',
            type: 'output',
            label: 'Rejected',
            dataType: 'any',
        },
    ],

    // Default data for new nodes
    defaultData: {
        label: 'Router',
        model: undefined, // Uses default model if not specified
        prompt: '', // Custom routing instructions
        routes: [
            { id: 'route-1', label: 'Option A' },
            { id: 'route-2', label: 'Option B' },
        ] as RouteDefinition[],
    },

    /**
     * Execute the router node.
     * Actual routing is handled by OpenRouterExecutionAdapter.
     */
    /**
     * Execute the router node.
     */
    async execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<NodeExecutionResult> {
        const data = node.data as RouterNodeData;
        const routes = data.routes || [];

        // If no routes, error
        if (routes.length === 0) {
            throw new Error('Router node has no routes defined');
        }

        // Get outgoing edges to determine connected routes
        // Note: We need all outgoing edges from this node
        // ExecutionContext.getOutgoingEdges(nodeId) should return all edges if handle is not specified?
        // The signature I added was getOutgoingEdges(nodeId, sourceHandle?).
        // If I pass undefined for sourceHandle, it should return all.
        // I need to verify if I implemented it that way in the Adapter... I haven't implemented the adapter part yet!
        // But I defined the interface. I will implement it in Adapter later.

        const outgoingEdges = context.getOutgoingEdges(node.id);

        // Build route options based on configured routes and connected edges
        const routeOptions = routes.map((route, index) => {
            const edge = outgoingEdges.find((e) => e.sourceHandle === route.id);
            const targetNode = edge ? context.getNode(edge.target) : undefined;

            return {
                index,
                id: route.id,
                label: route.label,
                // Description helps the LLM understand what this route leads to
                description: targetNode?.data.label || edge?.label || '',
                targetNodeId: edge?.target,
            };
        });

        let selectedRouteId: string | null = null;

        // Use provided model or fall back to default
        const model = data.model || DEFAULT_MODEL;

        // LLM-based routing
        if (!provider) {
            throw new Error('Router node requires an LLM provider');
        }

        const customInstructions = data.prompt || '';

        // Build route descriptions for prompt
        const routeDescriptions = routeOptions
            .map((opt, i) => {
                const desc = opt.description
                    ? ` (leads to: ${opt.description})`
                    : '';
                return `${i + 1}. ${opt.label}${desc}`;
            })
            .join('\n');

        const systemPrompt = `You are a routing assistant. Based on the user's message, determine which route to take.

Available routes:
${routeDescriptions}
${customInstructions ? `\nRouting instructions:\n${customInstructions}` : ''}

Respond with ONLY the number of the best matching route (e.g., "1" or "2"). Do not explain.`;

        const messagesForLLM: any[] = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `User message: "${context.input}"` },
        ];

        const result = await provider.chat(model, messagesForLLM, {
            temperature: 0, // Deterministic
            maxTokens: 10,
        });

        const content = result.content?.trim() || '1';
        // extract number
        const match = content.match(/\d+/);
        const choiceIndex = match ? parseInt(match[0], 10) - 1 : 0;

        if (choiceIndex >= 0 && choiceIndex < routeOptions.length) {
            selectedRouteId = routeOptions[choiceIndex].id;
        } else {
            // Fallback to first
            selectedRouteId = routeOptions[0].id;
        }

        if (!selectedRouteId && routeOptions.length > 0) {
            selectedRouteId = routeOptions[0].id;
        }

        const selectedOption = routeOptions.find(
            (r) => r.id === selectedRouteId
        );
        const nextNodes =
            selectedOption && selectedOption.targetNodeId
                ? [selectedOption.targetNodeId]
                : [];

        return {
            output: `Routed to ${selectedOption?.label || selectedRouteId}`,
            nextNodes,
            metadata: {
                selectedRouteId,
            },
        };
    },

    /**
     * Validate the router node.
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[]
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as RouterNodeData;
        const routes = data.routes || [];

        // Check for at least one route
        if (routes.length === 0) {
            errors.push({
                type: 'error',
                code: 'MISSING_REQUIRED_PORT',
                message: 'Router node must have at least one route defined',
                nodeId: node.id,
            });
        }

        // Check for incoming connections
        const incomingEdges = edges.filter((e) => e.target === node.id);
        if (incomingEdges.length === 0) {
            errors.push({
                type: 'error',
                code: 'DISCONNECTED_NODE',
                message: 'Router node has no incoming connections',
                nodeId: node.id,
            });
        }

        // Check that each route has an outgoing edge
        const outgoingEdges = edges.filter((e) => e.source === node.id);
        routes.forEach((route: RouteDefinition) => {
            const hasEdge = outgoingEdges.some(
                (e) => e.sourceHandle === route.id
            );
            if (!hasEdge) {
                errors.push({
                    type: 'warning',
                    code: 'MISSING_EDGE_LABEL',
                    message: `Route "${route.label}" has no connected node`,
                    nodeId: node.id,
                });
            }
        });

        // Check for edges without labels
        outgoingEdges.forEach((edge) => {
            if (!edge.label && !edge.sourceHandle) {
                errors.push({
                    type: 'warning',
                    code: 'MISSING_EDGE_LABEL',
                    message: 'Router edge is missing a label',
                    nodeId: node.id,
                    edgeId: edge.id,
                });
            }
        });

        return errors;
    },

    /**
     * Get dynamic outputs based on routes configuration.
     */
    getDynamicOutputs(node: WorkflowNode): { id: string; label: string }[] {
        const data = node.data as RouterNodeData;
        const routes = data.routes || [];

        return routes.map((route: RouteDefinition) => ({
            id: route.id,
            label: route.label,
        }));
    },
};

// Type augmentation for dynamic outputs
declare module '../types' {
    interface NodeExtension {
        getDynamicOutputs?: (
            node: WorkflowNode
        ) => { id: string; label: string }[];
    }
}
