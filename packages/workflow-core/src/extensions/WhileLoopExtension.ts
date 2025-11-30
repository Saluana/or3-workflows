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

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

/**
 * While Loop node extension definition.
 * Execution is handled by the adapter; this provides shape, defaults, and validation.
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
    },

    async execute(
        context: ExecutionContext,
        node: WorkflowNode,
        provider?: LLMProvider
    ): Promise<{ output: string; nextNodes: string[] }> {
        const data = node.data as WhileLoopNodeData;

        // We need persistent state for the loop.
        // Since ExecutionContext is recreated or passed around, we need a way to persist state.
        // The adapter's `loopStates` map was used for this.
        // We can use `context.outputs` to store state keyed by node ID if we serialize it?
        // Or we might need a `state` property in ExecutionContext that is mutable/persistent.
        // But `context.outputs` is for node outputs.
        // The original implementation in execution.ts used `this.loopStates`.
        // We don't have access to the adapter instance here.
        // HOWEVER, `executeSubgraph` is provided by the adapter.
        // If we handle the loop logic INSIDE this execute method (blocking), we don't need external state persistence across `execute` calls
        // IF we run the whole loop here.

        // The original implementation returned `nextNodes: [node.id]` to re-queue itself.
        // That approach relies on the adapter maintaining state between calls.
        // If we want to move logic here, we can either:
        // 1. Run the ENTIRE loop inside this execute method (blocking the adapter's queue for this branch).
        // 2. Keep the re-queueing mechanism but store state somewhere.

        // Option 1 is cleaner for the extension model IF we have `executeSubgraph`.
        // `executeSubgraph` allows us to run the body nodes until they finish.
        // So let's try Option 1: The "While Loop" node runs the whole loop loop synchronously (from the adapter's perspective).

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

        while (iteration < maxIterations) {
            // 1. Evaluate condition (except first iteration? Original logic: "if iteration === 0 return true")
            // Actually original logic said: if iteration === 0 return true.
            // So we always run at least once? Or is it a do-while?
            // "WhileLoop" implies check first. But often in workflows it's "Process then Check".
            // execution.ts: evaluateLoopCondition returns true if iteration === 0. So it is a DO-WHILE effectively, or always runs once.

            let shouldContinue = true;
            if (iteration > 0) {
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
                            outputs.length > 0
                                ? outputs[outputs.length - 1]
                                : null,
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
                    shouldContinue = await evaluator(
                        evalContext as any,
                        loopState
                    );
                } else if (!data.customEvaluator) {
                    if (!provider) {
                        throw new Error(
                            'WhileLoop requires LLM provider for condition evaluation'
                        );
                    }

                    const model = data.conditionModel || DEFAULT_MODEL;
                    const prompt = `${data.conditionPrompt}

Current iteration: ${iteration}
Last output: ${currentInput}
${outputs.length > 1 ? `Previous outputs: ${outputs.length} iterations` : ''}

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

                    const decision = result.content?.trim().toLowerCase() || '';
                    shouldContinue = decision.includes('continue');
                }
            }

            if (!shouldContinue) {
                break;
            }

            // 2. Execute Body
            const result = await context.executeSubgraph(
                bodyStartNodeId,
                currentInput
            );

            // 3. Update State
            currentInput = result.output;
            outputs.push(result.output);
            iteration++;
        }

        if (iteration >= maxIterations) {
            if (data.onMaxIterations === 'error') {
                throw new Error(
                    `While loop reached max iterations (${maxIterations})`
                );
            }
            // warning is handled by returning what we have
        }

        // Done
        return {
            output: currentInput,
            nextNodes: exitEdges.map((e) => e.target),
        };
    },

    validate(
        node: WorkflowNode,
        edges: WorkflowEdge[]
    ): (ValidationError | ValidationWarning)[] {
        const errors: (ValidationError | ValidationWarning)[] = [];
        const data = node.data as WhileLoopNodeData;

        if (!data.conditionPrompt || data.conditionPrompt.trim() === '') {
            errors.push({
                type: 'error',
                code: 'MISSING_CONDITION_PROMPT',
                message: 'While loop requires a condition prompt',
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
