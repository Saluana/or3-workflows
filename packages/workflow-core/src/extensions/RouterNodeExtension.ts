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
    ChatMessage,
    ToolDefinition,
} from '../types';
import { estimateTokenUsage } from '../compaction';

/** Default model for router classification */
const DEFAULT_MODEL = 'z-ai/glm-4.6:exacto';

/** Content part in OpenRouter SDK format (camelCase) */
type OpenRouterContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; imageUrl: { url: string; detail?: 'auto' | 'low' | 'high' } };

function resolveAttachmentUrl(attachment: {
    url?: string;
    content?: string;
    mimeType?: string;
}): string | null {
    if (attachment.url) return attachment.url;
    if (attachment.content && attachment.mimeType) {
        return `data:${attachment.mimeType};base64,${attachment.content}`;
    }
    return null;
}

function buildUserContentWithAttachments(
    input: string,
    attachments: ExecutionContext['attachments'],
    supportsImages: boolean
): string | OpenRouterContentPart[] {
    if (!supportsImages || !attachments || attachments.length === 0) {
        return input;
    }

    const parts: OpenRouterContentPart[] = [{ type: 'text', text: input }];
    for (const attachment of attachments) {
        if (attachment.type !== 'image') continue;
        const url = resolveAttachmentUrl(attachment);
        if (!url) continue;
        parts.push({ type: 'image_url', imageUrl: { url } });
    }

    return parts.length > 1 ? parts : input;
}

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
        // Routes are derived from connected edges, not stored in defaultData
    },

    /**
     * Execute the router node.
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

        // Get outgoing edges to determine connected routes
        const outgoingEdges = context.getOutgoingEdges(node.id);

        // Filter to only route edges (exclude error/rejected handles)
        const routeEdges = outgoingEdges.filter(
            (e) => e.sourceHandle !== 'error' && e.sourceHandle !== 'rejected'
        );

        // If no route edges, error
        if (routeEdges.length === 0) {
            throw new Error('Router node has no routes defined');
        }

        // Build route options from edges - use target node info for routing
        const routeOptions = routeEdges.map((edge, index) => {
            const targetNode = context.getNode(edge.target);
            const targetData = targetNode?.data as
                | { label?: string; description?: string }
                | undefined;

            return {
                index,
                id: edge.sourceHandle || `route-${index}`,
                nodeId: edge.target,
                // Use target node's label as the route name
                name: targetData?.label || edge.label || `Route ${index + 1}`,
                // Use target node's description for routing context
                description: targetData?.description || '',
            };
        });

        // Use provided model or fall back to default
        const model = data.model || context.defaultModel || DEFAULT_MODEL;

        // LLM-based routing
        if (!provider) {
            throw new Error('Router node requires an LLM provider');
        }

        const customInstructions = data.prompt || '';

        // Build route descriptions for prompt - include id, name, and description
        const routeDescriptions = routeOptions
            .map((opt) => {
                let routeInfo = `Route ID: "${opt.id}"\nName: "${opt.name}"`;
                if (opt.description) {
                    routeInfo += `\nDescription: ${opt.description}`;
                }
                return routeInfo;
            })
            .join('\n\n');

        // Stable base system prompt with optional custom instructions
        const systemPrompt = `You are a routing classifier. Your task is to select which route best handles the user's message.

## Routes

${routeDescriptions}
${customInstructions ? `\n## Routing Rules\n\n${customInstructions}` : ''}

## Instructions

- Analyze the user's message.
- Select the most appropriate route based on the descriptions and rules.
- Use the 'select_route' tool to make your decision.`;

        // Define the tool for route selection
        const tools: ToolDefinition[] = [
            {
                type: 'function' as const,
                function: {
                    name: 'select_route',
                    description:
                        'Selects the appropriate route for the user input',
                    parameters: {
                        type: 'object',
                        properties: {
                            route_id: {
                                type: 'string',
                                description: 'The ID of the selected route',
                                enum: routeOptions.map((r) => r.id),
                            },
                            reasoning: {
                                type: 'string',
                                description:
                                    'Brief explanation for why this route was selected',
                            },
                        },
                        required: ['route_id', 'reasoning'],
                    },
                },
            },
        ];

        // Debug logging - only log if debug is enabled to reduce noise and PII exposure
        const debug = context.debug ?? false;
        if (debug) {
            console.log(
                '[Router] Routes found:',
                routeOptions.map((r) => ({
                    name: r.name,
                    description: r.description,
                }))
            );
            console.log('[Router] System prompt:', systemPrompt);
            console.log('[Router] User input:', context.input);
        }

        let supportsImages = false;
        if (context.attachments && context.attachments.length > 0) {
            const capabilities = await provider.getModelCapabilities(model);
            supportsImages =
                capabilities?.inputModalities?.includes('image') ?? false;
        }
        if (context.attachments && context.attachments.length > 0) {
            if (!supportsImages) {
                console.warn(
                    `Model ${model} does not support image input; skipping attachments for router "${node.id}".`
                );
            }
        }

        const userContent = buildUserContentWithAttachments(
            context.input,
            context.attachments,
            supportsImages
        );

        const messagesForLLM: ChatMessage[] = [
            { role: 'system', content: systemPrompt },
            {
                role: 'user',
                content: userContent as unknown as string,
            },
        ];

        if (debug) {
            console.log('[Router] Sending request to LLM:', {
                model,
                messages: messagesForLLM,
                tools,
                toolChoice: {
                    type: 'function',
                    function: { name: 'select_route' },
                },
            });
        }

        const result = await provider.chat(model, messagesForLLM, {
            temperature: 0, // Deterministic for consistent routing
            maxTokens: 100,
            tools,
            // toolChoice might not be strictly typed yet
            toolChoice: {
                type: 'function',
                function: { name: 'select_route' },
            },
        });

        if (context.tokenCounter && context.onTokenUsage) {
            let usage = estimateTokenUsage({
                model,
                messages: messagesForLLM,
                output: result.content || '',
                tokenCounter: context.tokenCounter,
                compaction: context.compaction,
            });

            if (result.usage) {
                usage = {
                    ...usage,
                    promptTokens: result.usage.promptTokens,
                    completionTokens: result.usage.completionTokens,
                    totalTokens: result.usage.totalTokens,
                };
            }

            context.onTokenUsage(usage);
        }

        if (debug) {
            console.log(
                '[Router] Raw LLM result:',
                JSON.stringify(result, null, 2)
            );
        }

        let selectedRouteId: string | undefined;
        let reasoning = '';

        if (result.toolCalls && result.toolCalls.length > 0) {
            const call = result.toolCalls[0];
            try {
                // Handle both parsed object and string arguments
                const args =
                    typeof call.function.arguments === 'string'
                        ? JSON.parse(call.function.arguments)
                        : call.function.arguments;

                const selectedId = args.route_id;
                reasoning = args.reasoning || '';

                // Verify the ID exists
                const route = routeOptions.find((r) => r.id === selectedId);
                if (route) {
                    selectedRouteId = route.id;
                }

                if (debug) {
                    console.log('[Router] Tool call result:', {
                        selectedId,
                        reasoning,
                        valid: !!route,
                    });
                }
            } catch (e) {
                if (debug) {
                    console.error(
                        '[Router] Failed to parse tool arguments:',
                        e
                    );
                }
            }
        } else {
            const content = result.content?.trim() || '1';
            if (debug) {
                console.log(
                    '[Router] No tool call, falling back to text:',
                    content
                );
            }
            // Extract number from response
            const match = content.match(/\d+/);
            const choiceIndex = match ? parseInt(match[0], 10) - 1 : 0;

            if (choiceIndex >= 0 && choiceIndex < routeOptions.length) {
                selectedRouteId = routeOptions[choiceIndex].id;
            }
        }

        if (!selectedRouteId) {
            const fallbackBehavior = data.fallbackBehavior || 'first'; // 'first', 'error', or 'none'

            if (fallbackBehavior === 'error') {
                throw new Error(
                    `Router "${node.id}" failed to select a valid route. LLM response did not match any configured route.`
                );
            } else if (fallbackBehavior === 'none') {
                // No fallback - return empty nextNodes
                return {
                    output: 'Router failed to select a route',
                    nextNodes: [],
                    metadata: {
                        selectedRoute: null,
                        selectedRouteId: null,
                        fallbackUsed: true,
                    },
                };
            }

            // Default: fallback to first route
            selectedRouteId = routeOptions[0].id;
            if (debug) {
                console.warn(
                    `[Router] Failed to select valid route, falling back to first route: ${selectedRouteId}`
                );
            }
            // We'll set fallbackUsed in metadata below
            const selectedOption = routeOptions.find(
                (r) => r.id === selectedRouteId
            );

            if (debug) {
                console.log('[Router] Selected route ID:', selectedRouteId);
                console.log('[Router] Selected option:', selectedOption);
            }

            const nextNodes =
                selectedOption && selectedOption.nodeId
                    ? [selectedOption.nodeId]
                    : [];

            if (debug) {
                console.log('[Router] Next nodes to execute:', nextNodes);
            }

            return {
                output: `Routed to ${selectedOption?.name || selectedRouteId}`,
                nextNodes,
                metadata: {
                    selectedRoute: selectedRouteId,
                    selectedRouteId,
                    selectedNodeId: selectedOption?.nodeId,
                    selectedName: selectedOption?.name,
                    reasoning: '',
                    fallbackUsed: true, // Mark that fallback was used
                },
            };
        }

        if (debug) {
            console.log('[Router] Selected route ID:', selectedRouteId);
        }

        const selectedOption = routeOptions.find(
            (r) => r.id === selectedRouteId
        );

        if (debug) {
            console.log('[Router] Selected option:', selectedOption);
        }

        const nextNodes =
            selectedOption && selectedOption.nodeId
                ? [selectedOption.nodeId]
                : [];

        if (debug) {
            console.log('[Router] Next nodes to execute:', nextNodes);
        }

        return {
            output: `Routed to ${selectedOption?.name || selectedRouteId}`,
            nextNodes,
            metadata: {
                selectedRoute: selectedRouteId,
                selectedRouteId,
                selectedNodeId: selectedOption?.nodeId,
                selectedName: selectedOption?.name,
                reasoning,
                // fallbackUsed is false - valid route was selected
                fallbackUsed: false,
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

        // Check for outgoing route edges (exclude error/rejected)
        const outgoingEdges = edges.filter((e) => e.source === node.id);
        const routeEdges = outgoingEdges.filter(
            (e) => e.sourceHandle !== 'error' && e.sourceHandle !== 'rejected'
        );

        if (routeEdges.length === 0) {
            errors.push({
                type: 'error',
                code: 'MISSING_REQUIRED_PORT',
                message: 'Router node must have at least one route connected',
                nodeId: node.id,
            });
        }

        // Warn if routes don't have labels (helps LLM make better decisions)
        routeEdges.forEach((edge) => {
            if (!edge.label) {
                errors.push({
                    type: 'warning',
                    code: 'MISSING_EDGE_LABEL',
                    message:
                        'Router edge is missing a label - consider adding one to help routing decisions',
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
