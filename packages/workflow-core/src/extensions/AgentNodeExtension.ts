import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    ExecutionContext,
    AgentNodeData,
    LLMProvider,
    ValidationError,
    ValidationWarning,
    ChatMessage,
} from '../types';

/** Default model for agent nodes */
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/** Maximum number of tool call iterations to prevent infinite loops */
const MAX_TOOL_ITERATIONS = 10;

/**
 * Agent Node Extension
 *
 * Represents an LLM agent that processes input and generates output.
 * Supports model selection, custom prompts, temperature, and tool usage.
 */
export const AgentNodeExtension: NodeExtension = {
    name: 'agent',
    type: 'node',

    // Port definitions
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
            dataType: 'string',
            multiple: true,
        },
        {
            id: 'error',
            type: 'output',
            label: 'Error',
            dataType: 'string',
        },
        {
            id: 'rejected',
            type: 'output',
            label: 'Rejected',
            dataType: 'string',
        },
    ],

    // Default data for new nodes
    defaultData: {
        label: 'Agent',
        model: DEFAULT_MODEL,
        prompt: '',
        temperature: undefined,
        maxTokens: undefined,
        tools: [],
    },

    /**
     * Execute the agent node.
     *
     * @internal Execution is handled by OpenRouterExecutionAdapter.
     * Calling this directly will raise to prevent confusing placeholder data.
     */
    /**
     * Execute the agent node.
     */
    async execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<{ output: string; nextNodes: string[] }> {
        if (!provider) {
            throw new Error('Agent node requires an LLM provider');
        }

        const data = node.data as AgentNodeData;
        const model = data.model || context.defaultModel || DEFAULT_MODEL;
        const systemPrompt = data.prompt || `You are a helpful assistant named ${data.label}.`;

        // Check model capabilities if provider available
        let supportedModalities = ['text'];
        if (model) {
            const capabilities = await provider.getModelCapabilities(model);
            if (capabilities) {
                supportedModalities = capabilities.inputModalities;
            }
        }

        // Build context from previous nodes
        let contextInfo = '';
        if (context.nodeChain && context.nodeChain.length > 0) {
            const previousOutputs = context.nodeChain
                .filter((id) => context.outputs[id])
                .map((id) => {
                    const prevNode = context.getNode(id);
                    const label = prevNode?.data.label || id;
                    return `[${label}]: ${context.outputs[id]}`;
                });

            if (previousOutputs.length > 0) {
                contextInfo = `\n\nContext from previous agents:\n${previousOutputs.join(
                    '\n\n'
                )}`;
            }
        }

        // Construct user content with attachments
        let userContent: string | any[] = context.input;
        if (context.attachments && context.attachments.length > 0) {
            const contentParts: any[] = [{ type: 'text', text: context.input }];
            
            for (const attachment of context.attachments) {
                // Skip unsupported modalities
                if (!supportedModalities.includes(attachment.type)) {
                    console.warn(
                        `Model ${model} does not support ${attachment.type} modality, skipping attachment`
                    );
                    continue;
                }

                const url = attachment.url || 
                    (attachment.content ? `data:${attachment.mimeType};base64,${attachment.content}` : null);
                
                if (!url) continue;

                switch (attachment.type) {
                    case 'image':
                        contentParts.push({
                            type: 'image_url',
                            image_url: { url }, // OpenRouter/OpenAI format
                        });
                        break;
                    // TODO: Add support for other modalities when OpenRouter standardizes them
                }
            }
            
            if (contentParts.length > 1) {
                userContent = contentParts;
            }
        }

        // Construct messages
        // Check if history already ends with the same user message to avoid duplication
        const lastMessage = context.history[context.history.length - 1];
        const inputContentStr = typeof userContent === 'string' 
            ? userContent 
            : JSON.stringify(userContent);
        const lastMessageContentStr = lastMessage 
            ? (typeof lastMessage.content === 'string' 
                ? lastMessage.content 
                : JSON.stringify(lastMessage.content))
            : '';
        const isDuplicateUserMessage = 
            lastMessage?.role === 'user' && 
            lastMessageContentStr === inputContentStr;

        const messages: ChatMessage[] = [
            { role: 'system' as const, content: systemPrompt + contextInfo },
            ...context.history,
        ];
        
        // Only add user message if it's not already the last message in history
        if (!isDuplicateUserMessage) {
            messages.push({ role: 'user' as const, content: userContent as any });
        }

        // Build tools array from node config and global context tools
        const nodeToolNames = data.tools || [];
        const globalTools = context.tools || [];
        
        // Create a map of tool handlers from global tools
        const toolHandlers = new Map<string, (args: any) => Promise<string> | string>();
        for (const tool of globalTools) {
            if (tool.handler) {
                toolHandlers.set(tool.function.name, tool.handler);
            }
        }
        
        // Build tools for LLM - either from node config (basic) or global tools (full)
        let toolsForLLM: any[] | undefined;
        if (nodeToolNames.length > 0) {
            // Node specifies tool names - find matching tools from global registry
            toolsForLLM = nodeToolNames.map(name => {
                const globalTool = globalTools.find(t => t.function.name === name);
                if (globalTool) {
                    return { type: 'function', function: globalTool.function };
                }
                // Fallback: basic tool definition without schema
                return { type: 'function', function: { name } };
            });
        } else if (globalTools.length > 0) {
            // Use all global tools
            toolsForLLM = globalTools.map(t => ({ type: 'function', function: t.function }));
        }

        // Run LLM loop - execute tool calls until done or max iterations
        let currentMessages = [...messages];
        let toolIterations = 0;
        let finalContent = '';

        while (toolIterations < MAX_TOOL_ITERATIONS) {
            // Call LLM with streaming
            const result = await provider.chat(model, currentMessages, {
                temperature: data.temperature,
                maxTokens: data.maxTokens,
                tools: toolsForLLM,
                onToken: (token) => {
                    if (context.onToken) {
                        context.onToken(token);
                    }
                },
                signal: context.signal,
            });

            // If no tool calls, we're done
            if (!result.toolCalls || result.toolCalls.length === 0) {
                finalContent = result.content || '';
                break;
            }

            // Add assistant message with tool calls to conversation
            // Note: We store content even if there are tool calls, as some models send both
            currentMessages.push({
                role: 'assistant' as const,
                content: result.content || '',
            });

            // Execute each tool call
            for (const toolCall of result.toolCalls) {
                const toolName = toolCall.function?.name;
                const toolArgs = toolCall.function?.arguments;
                
                let parsedArgs: any;
                try {
                    parsedArgs = typeof toolArgs === 'string' 
                        ? JSON.parse(toolArgs) 
                        : toolArgs;
                } catch {
                    parsedArgs = toolArgs;
                }

                let toolResult: string;
                
                // Try to find and execute the tool handler
                const handler = toolHandlers.get(toolName);
                if (handler) {
                    try {
                        toolResult = await handler(parsedArgs);
                    } catch (err) {
                        toolResult = `Error executing tool ${toolName}: ${err instanceof Error ? err.message : String(err)}`;
                    }
                } else if (context.onToolCall) {
                    // Fallback to global onToolCall handler
                    try {
                        toolResult = await context.onToolCall(toolName, parsedArgs);
                    } catch (err) {
                        toolResult = `Error executing tool ${toolName}: ${err instanceof Error ? err.message : String(err)}`;
                    }
                } else {
                    toolResult = `Tool ${toolName} not found or no handler registered`;
                }

                // Add tool result as a user message (simplified approach)
                // Note: OpenAI format uses 'tool' role, but for compatibility we use 'user'
                currentMessages.push({
                    role: 'user' as const,
                    content: `Tool ${toolName} result: ${toolResult}`,
                });
            }

            toolIterations++;
        }

        if (toolIterations >= MAX_TOOL_ITERATIONS) {
            finalContent = `Warning: Maximum tool iterations (${MAX_TOOL_ITERATIONS}) reached. Last content: ${finalContent}`;
        }

        const output = finalContent;
        
        // Calculate next nodes
        const outgoingEdges = context.getOutgoingEdges(node.id, 'output');
        const nextNodes = outgoingEdges.map((e) => e.target);
        
        return {
            output,
            nextNodes,
        };
    },

    /**
     * Validate the agent node.
     */
    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[]
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as AgentNodeData;

        // Check for model
        if (!data.model) {
            errors.push({
                type: 'error',
                code: 'MISSING_MODEL',
                message: 'Agent node requires a model to be selected',
                nodeId: node.id,
            });
        }

        // Warn if prompt is empty
        if (!data.prompt || data.prompt.trim() === '') {
            errors.push({
                type: 'warning',
                code: 'EMPTY_PROMPT',
                message: 'Agent node has no system prompt configured',
                nodeId: node.id,
            });
        }

        // Check for incoming connections
        const incomingEdges = edges.filter((e) => e.target === node.id);
        if (incomingEdges.length === 0) {
            errors.push({
                type: 'error',
                code: 'DISCONNECTED_NODE',
                message: 'Agent node has no incoming connections',
                nodeId: node.id,
            });
        }

        return errors;
    },
};
