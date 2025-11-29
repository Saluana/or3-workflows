import { ref } from 'vue';
import type { OpenRouter } from '@openrouter/sdk';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    nodeId?: string;
    timestamp: Date;
}

interface GraphNode {
    id: string;
    type: string;
    data: Record<string, unknown>;
}

interface GraphEdge {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    label?: string;
}

interface Graph {
    nodeMap: Map<string, GraphNode>;
    children: Record<string, Array<{ nodeId: string; handleId?: string }>>;
    parents: Record<string, string[]>;
}

interface ExecutionContext {
    input: string;
    currentInput: string;
    history: Array<{ role: string; content: string }>;
    outputs: Record<string, string>;
    nodeChain: string[];
}

interface ExecutionCallbacks {
    onNodeStatus: (
        nodeId: string,
        status: 'idle' | 'active' | 'completed' | 'error'
    ) => void;
    onStreamingContent: (content: string) => void;
    onAppendContent: (content: string) => void;
}

// ============================================================================
// Constants
// ============================================================================

const MAX_ITERATIONS_MULTIPLIER = 3;

// ============================================================================
// Composable
// ============================================================================

export function useWorkflowExecution() {
    const isRunning = ref(false);
    const error = ref<string | null>(null);

    function buildGraph(nodes: GraphNode[], edges: GraphEdge[]): Graph {
        const nodeMap = new Map<string, GraphNode>();
        const children: Record<
            string,
            Array<{ nodeId: string; handleId?: string }>
        > = {};
        const parents: Record<string, string[]> = {};

        for (const node of nodes) {
            nodeMap.set(node.id, node);
            children[node.id] = [];
            parents[node.id] = [];
        }

        for (const edge of edges) {
            children[edge.source]?.push({
                nodeId: edge.target,
                handleId: edge.sourceHandle,
            });
            parents[edge.target]?.push(edge.source);
        }

        return { nodeMap, children, parents };
    }

    async function executeAgent(
        client: OpenRouter,
        node: GraphNode,
        context: ExecutionContext,
        nodeMap: Map<string, GraphNode>,
        callbacks: ExecutionCallbacks
    ): Promise<string> {
        const model =
            typeof node.data.model === 'string'
                ? node.data.model
                : 'openai/gpt-4o-mini';
        const label =
            typeof node.data.label === 'string' ? node.data.label : 'Assistant';
        const prompt =
            typeof node.data.prompt === 'string' ? node.data.prompt : '';
        const systemPrompt =
            prompt || `You are a helpful assistant named ${label}.`;

        // Build context from previous nodes
        let contextInfo = '';
        if (context.nodeChain.length > 0) {
            const previousOutputs = context.nodeChain
                .filter((id: string) => context.outputs[id])
                .map((id: string) => {
                    const prevNode = nodeMap.get(id);
                    const prevLabel =
                        typeof prevNode?.data.label === 'string'
                            ? prevNode.data.label
                            : id;
                    return `[${prevLabel}]: ${context.outputs[id]}`;
                });

            if (previousOutputs.length > 0) {
                contextInfo = `\n\nContext from previous agents:\n${previousOutputs.join(
                    '\n\n'
                )}`;
            }
        }

        const chatMessages = [
            { role: 'system' as const, content: systemPrompt + contextInfo },
            ...context.history.map((h) => ({
                role: h.role as 'user' | 'assistant',
                content: h.content,
            })),
            { role: 'user' as const, content: context.currentInput },
        ];

        const stream = (await client.chat.send({
            model,
            messages: chatMessages,
            stream: true,
        })) as AsyncIterable<{
            choices: Array<{ delta?: { content?: string } }>;
        }>;

        let output = '';
        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
                output += content;
                callbacks.onAppendContent(content);
            }
        }

        return output;
    }

    async function executeRouter(
        client: OpenRouter,
        node: GraphNode,
        childEdges: Array<{ nodeId: string; handleId?: string }>,
        context: ExecutionContext,
        nodeMap: Map<string, GraphNode>,
        edges: GraphEdge[]
    ): Promise<{ selectedRoute: string; nextNodes: string[] }> {
        const routeOptions = childEdges.map((child, index) => {
            const childNode = nodeMap.get(child.nodeId);
            const edge = edges.find(
                (e) => e.source === node.id && e.target === child.nodeId
            );
            const edgeLabel = edge?.label;
            const childLabel =
                typeof childNode?.data.label === 'string'
                    ? childNode.data.label
                    : '';

            return {
                index,
                nodeId: child.nodeId,
                label: edgeLabel || childLabel || `Option ${index + 1}`,
                description: childLabel,
            };
        });

        const routerModel =
            typeof node.data.model === 'string'
                ? node.data.model
                : 'openai/gpt-4o-mini';
        const customInstructions =
            typeof node.data.prompt === 'string' ? node.data.prompt : '';

        const routeDescriptions = routeOptions
            .map(
                (opt, i) =>
                    `${i + 1}. ${opt.label}${
                        opt.description && opt.description !== opt.label
                            ? ` (connects to: ${opt.description})`
                            : ''
                    }`
            )
            .join('\n');

        const classificationPrompt = `You are a routing assistant. Based on the user's message, determine which route to take.

Available routes:
${routeDescriptions}
${customInstructions ? `\nRouting instructions:\n${customInstructions}` : ''}

User message: "${context.currentInput}"

Respond with ONLY the number of the best matching route (e.g., "1" or "2"). Do not explain.`;

        const response = await client.chat.send({
            model: routerModel,
            messages: [
                {
                    role: 'system',
                    content:
                        'You are a routing classifier. Respond only with a number.',
                },
                { role: 'user', content: classificationPrompt },
            ],
        });

        const messageContent = response.choices[0]?.message?.content;
        const choice =
            (typeof messageContent === 'string'
                ? messageContent.trim()
                : '1') || '1';
        const selectedIndex = parseInt(choice, 10) - 1;

        if (selectedIndex >= 0 && selectedIndex < routeOptions.length) {
            const selected = routeOptions[selectedIndex]!;
            return {
                selectedRoute: selected.label,
                nextNodes: [selected.nodeId],
            };
        }

        return {
            selectedRoute: routeOptions[0]?.label || 'default',
            nextNodes: routeOptions.length > 0 ? [routeOptions[0]!.nodeId] : [],
        };
    }

    async function executeNode(
        client: OpenRouter,
        nodeId: string,
        context: ExecutionContext,
        graph: Graph,
        edges: GraphEdge[],
        callbacks: ExecutionCallbacks
    ): Promise<{ output: string; nextNodes: string[] }> {
        const node = graph.nodeMap.get(nodeId);
        if (!node) return { output: '', nextNodes: [] };

        const childEdges = graph.children[nodeId] || [];

        callbacks.onNodeStatus(nodeId, 'active');
        callbacks.onStreamingContent('');

        try {
            let output = '';
            let nextNodes: string[] = [];

            switch (node.type) {
                case 'start':
                    output = context.currentInput;
                    nextNodes = childEdges.map((c) => c.nodeId);
                    break;

                case 'agent':
                    output = await executeAgent(
                        client,
                        node,
                        context,
                        graph.nodeMap,
                        callbacks
                    );
                    nextNodes = childEdges.map((c) => c.nodeId);
                    context.outputs[nodeId] = output;
                    context.nodeChain.push(nodeId);
                    context.currentInput = output;
                    break;

                case 'router':
                case 'condition': {
                    const routeResult = await executeRouter(
                        client,
                        node,
                        childEdges,
                        context,
                        graph.nodeMap,
                        edges
                    );
                    output = `Routed to: ${routeResult.selectedRoute}`;
                    nextNodes = routeResult.nextNodes;
                    break;
                }

                default:
                    nextNodes = childEdges.map((c) => c.nodeId);
            }

            callbacks.onNodeStatus(nodeId, 'completed');
            return { output, nextNodes };
        } catch (err) {
            callbacks.onNodeStatus(nodeId, 'error');
            throw err;
        }
    }

    async function execute(
        apiKey: string,
        nodes: GraphNode[],
        edges: GraphEdge[],
        input: string,
        conversationHistory: Array<{ role: string; content: string }>,
        callbacks: ExecutionCallbacks
    ): Promise<string> {
        // Validate API key format
        if (!apiKey.startsWith('sk-or-')) {
            throw new Error(
                'Invalid API key format. Key should start with "sk-or-"'
            );
        }

        const { OpenRouter } = await import('@openrouter/sdk');
        const client = new OpenRouter({ apiKey });
        const graph = buildGraph(nodes, edges);

        // Find start node
        const startNode = nodes.find((n) => n.type === 'start');
        if (!startNode) throw new Error('No start node found');

        // Reset node statuses
        nodes.forEach((n) => callbacks.onNodeStatus(n.id, 'idle'));

        // Initialize execution context
        const context: ExecutionContext = {
            input,
            currentInput: input,
            history: [...conversationHistory],
            outputs: {},
            nodeChain: [],
        };

        // BFS execution
        const queue: string[] = [startNode.id];
        const executed = new Set<string>();
        const maxIterations = nodes.length * MAX_ITERATIONS_MULTIPLIER;
        let iterations = 0;
        let finalOutput = '';

        while (queue.length > 0 && iterations < maxIterations) {
            iterations++;
            const currentId = queue.shift()!;

            if (executed.has(currentId)) continue;

            const parentIds = graph.parents[currentId] || [];
            const allParentsExecuted = parentIds.every((p) => executed.has(p));

            if (!allParentsExecuted && currentId !== startNode.id) {
                queue.push(currentId);
                continue;
            }

            executed.add(currentId);

            const result = await executeNode(
                client,
                currentId,
                context,
                graph,
                edges,
                callbacks
            );
            finalOutput = result.output;

            for (const nextId of result.nextNodes) {
                if (!executed.has(nextId)) {
                    queue.push(nextId);
                }
            }
        }

        return finalOutput;
    }

    return {
        isRunning,
        error,
        execute,
    };
}
