import type {
    NodeExtension,
    WorkflowNode,
    WorkflowEdge,
    WhileLoopNodeData,
    ExecutionContext,
    LLMProvider,
    ChatMessage,
    ValidationError,
    ValidationWarning,
} from '../types';
import { estimateTokenUsage } from '../compaction';

const DEFAULT_MODEL = 'z-ai/glm-4.6:exacto';

/**
 * While Loop node extension definition.
 * Provides loop execution logic, including LLM-based condition evaluation,
 * subgraph body execution, and max iteration handling.
 */
export const WhileLoopExtension: NodeExtension = {
    name: 'whileLoop',
    type: 'node',

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
        { id: 'body', type: 'output', label: 'Loop Body', dataType: 'any' },
        { id: 'done', type: 'output', label: 'Exit', dataType: 'any' },
    ],

    defaultData: {
        label: 'While Loop',
        conditionPrompt:
            'Based on the current output, should we continue iterating to improve the result? Respond with only "continue" or "done".',
        maxIterations: 10,
        onMaxIterations: 'warning',
        loopMode: 'condition',
        includePreviousOutputs: true,
        includeIterationContext: false,
        outputMode: 'last',
    },

    async execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<{ output: string; nextNodes: string[] }> {
        const data = node.data as WhileLoopNodeData;

        // Get settings with defaults
        const loopMode = data.loopMode ?? 'condition';
        const includePreviousOutputs = data.includePreviousOutputs ?? true;
        const includeIterationContext = data.includeIterationContext ?? false;
        const outputMode = data.outputMode ?? 'last';

        if (!context.executeSubgraph) {
            throw new Error(
                'WhileLoop execution requires executeSubgraph capability in context'
            );
        }

        const bodyEdges = context.getOutgoingEdges(node.id, 'body');
        const exitEdges = context.getOutgoingEdges(node.id, 'done');

        if (bodyEdges.length === 0) {
            throw new Error('While loop body is not connected');
        }

        const bodyStartNodeId = bodyEdges[0].target;

        let currentInput = context.input;
        let iteration = 0;
        const maxIterations = data.maxIterations || 10;
        const outputs: string[] = [];

        /**
         * Build the input for the body, enriched with context based on settings
         */
        const buildBodyInput = (baseInput: string): string => {
            const parts: string[] = [];

            // Add loop instructions if provided
            if (data.loopPrompt?.trim()) {
                parts.push(`[Instructions: ${data.loopPrompt.trim()}]`);
            }

            // Add iteration context if enabled
            if (includeIterationContext) {
                parts.push(`[Iteration ${iteration + 1} of ${maxIterations}]`);
            }

            // Add previous outputs context (enabled by default)
            if (includePreviousOutputs && outputs.length > 0) {
                parts.push(`[Previous attempts (${outputs.length}):]`);
                outputs.forEach((output, idx) => {
                    // Truncate long outputs to avoid context explosion
                    const truncated =
                        output.length > 500
                            ? output.substring(0, 500) + '...[truncated]'
                            : output;
                    parts.push(`Attempt ${idx + 1}: ${truncated}`);
                });
                parts.push('[Current input to improve:]');
            }

            parts.push(baseInput);

            return parts.join('\n\n');
        };

        // Helper function to evaluate the loop condition
        const evaluateCondition = async (): Promise<boolean> => {
            // Fixed mode: always continue until max iterations
            if (loopMode === 'fixed') {
                return iteration < maxIterations;
            }

            if (
                data.customEvaluator &&
                context.customEvaluators?.[data.customEvaluator]
            ) {
                const evaluator =
                    context.customEvaluators[data.customEvaluator];
                const loopState = {
                    iteration,
                    outputs,
                    lastOutput:
                        outputs.length > 0 ? outputs[outputs.length - 1] : null,
                };
                const evalContext = {
                    currentInput,
                    session: {
                        id: context.sessionId || '',
                        messages: context.history,
                    },
                    memory: context.memory,
                    outputs: context.outputs,
                };
                return evaluator(evalContext as any, loopState);
            } else if (!data.customEvaluator) {
                if (!provider) {
                    throw new Error(
                        'WhileLoop requires LLM provider for condition evaluation'
                    );
                }

                const model =
                    data.conditionModel ||
                    context.defaultModel ||
                    DEFAULT_MODEL;
                const inputLabel =
                    iteration > 0 ? 'Last output' : 'Initial input';
                const previousOutputsInfo =
                    outputs.length > 1
                        ? `Previous outputs: ${outputs.length} iterations`
                        : '';
                const prompt = `${data.conditionPrompt}

Current iteration: ${iteration}
${inputLabel}: ${currentInput}
${previousOutputsInfo}

Respond with only "continue" or "done".`;

                const messages: ChatMessage[] = [
                    {
                        role: 'system',
                        content:
                            'You are a loop controller. Respond with only "continue" or "done".',
                    },
                    { role: 'user', content: prompt },
                ];

                const result = await provider.chat(model, messages, {
                    temperature: 0,
                    maxTokens: 10,
                });

                if (context.tokenCounter && context.onTokenUsage) {
                    let usage = estimateTokenUsage({
                        model,
                        messages,
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

                const decision = result.content?.trim().toLowerCase() || '';
                return decision.includes('continue');
            }
            // No evaluator specified and no custom evaluator
            return true;
        };

        // Check condition BEFORE first iteration (proper while-loop semantics)
        // For fixed mode, we always start (evaluateCondition returns true if iteration < max)
        let shouldContinue = await evaluateCondition();

        while (shouldContinue && iteration < maxIterations) {
            // Build enriched input for the body
            const enrichedInput = buildBodyInput(currentInput);

            // Execute Body with enriched context
            const result = await context.executeSubgraph(
                bodyStartNodeId,
                enrichedInput
            );

            // Update State
            currentInput = result.output;
            outputs.push(result.output);
            iteration++;

            // Check condition for next iteration AFTER updating state
            // This ensures the condition is evaluated with the current iteration count
            shouldContinue =
                iteration < maxIterations && (await evaluateCondition());
        }

        if (iteration >= maxIterations) {
            if (data.onMaxIterations === 'error') {
                throw new Error(
                    `While loop reached max iterations (${maxIterations})`
                );
            } else if (data.onMaxIterations === 'warning') {
                // Could emit a warning event here if callbacks supported it
                // For now, just log to console in debug mode
                if (context.debug) {
                    console.warn(
                        `[WhileLoop] Reached max iterations (${maxIterations})`
                    );
                }
            }
            // 'continue' mode: silently continue without warning or error
        }

        // Build final output based on output mode
        let finalOutput: string;
        if (outputMode === 'accumulate') {
            finalOutput = JSON.stringify({
                iterations: iteration,
                outputs: outputs,
                finalOutput: currentInput,
            });
        } else {
            // 'last' mode - just return the final output
            finalOutput = currentInput;
        }

        // Done
        return {
            output: finalOutput,
            nextNodes: exitEdges.map((e) => e.target),
        };
    },

    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[]
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as WhileLoopNodeData;
        const loopMode = data.loopMode ?? 'condition';

        // Condition prompt only required in condition mode
        if (
            loopMode === 'condition' &&
            (!data.conditionPrompt || data.conditionPrompt.trim() === '')
        ) {
            errors.push({
                type: 'error',
                code: 'MISSING_CONDITION_PROMPT',
                message:
                    'While loop requires a condition prompt (or switch to fixed mode)',
                nodeId: node.id,
            });
        }

        if (!data.maxIterations || data.maxIterations <= 0) {
            errors.push({
                type: 'error',
                code: 'INVALID_MAX_ITERATIONS',
                message: 'Max iterations must be greater than zero',
                nodeId: node.id,
            });
        }

        const outgoing = edges.filter((e) => e.source === node.id);
        const hasBody = outgoing.some((e) => e.sourceHandle === 'body');
        const hasExit = outgoing.some((e) => e.sourceHandle === 'done');

        if (!hasBody) {
            errors.push({
                type: 'warning',
                code: 'MISSING_BODY',
                message: 'Loop body is not connected',
                nodeId: node.id,
            });
        }

        if (!hasExit) {
            errors.push({
                type: 'warning',
                code: 'MISSING_EXIT',
                message: 'Loop exit is not connected',
                nodeId: node.id,
            });
        }

        return errors;
    },
};
