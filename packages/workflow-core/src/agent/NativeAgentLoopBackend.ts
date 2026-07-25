/**
 * Native agent-loop backend (R6.AC1).
 *
 * The reference backend. It drives a bounded tool-calling loop entirely through
 * `ModelGateway.generate`, executing tool calls via the host executor and
 * appending complete assistant tool-call messages before tool results (so the
 * transcript ordering matches provider expectations). This remains the default
 * backend; optional backends must reach parity with it before selection.
 */
import type { ChatMessage } from '../types';
import { aggregateUsage } from './usage';
import type {
    AgentLoopBackend,
    AgentLoopInput,
    AgentLoopResult,
} from './types';

export class NativeAgentLoopBackend implements AgentLoopBackend {
    readonly id = 'native' as const;

    async run(input: AgentLoopInput): Promise<AgentLoopResult> {
        const messages: ChatMessage[] = [...input.messages];
        let iterations = 0;
        let finalContent = '';
        let actualModel: string | undefined;
        let provider: string | undefined;
        const usages = [];

        while (iterations < input.maxIterations) {
            if (input.signal?.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            iterations++;

            const result = await input.gateway.generate({
                models: input.models,
                messages,
                generation: input.generation,
                tools: input.tools,
                toolChoice: input.toolChoice,
                parallelToolCalls: input.parallelToolCalls,
                onTextDelta: input.onTextDelta,
                onReasoningDelta: input.onReasoningDelta,
                signal: input.signal,
            });

            if (result.usage) usages.push(result.usage);
            actualModel = result.actualModel ?? actualModel;
            provider = result.provider ?? provider;
            finalContent = result.content ?? finalContent;

            const toolCalls = result.toolCalls ?? [];
            if (toolCalls.length === 0 || !input.executeTool) {
                // Ensure the assistant message is recorded.
                messages.push(result.assistantMessage);
                return {
                    finalContent,
                    messages,
                    iterations,
                    usage: aggregateUsage(usages),
                    stoppedOnMaxIterations: false,
                    actualModel,
                    provider,
                };
            }

            // Complete assistant tool-call message precedes tool results.
            messages.push(result.assistantMessage);

            for (const call of toolCalls) {
                if (input.signal?.aborted) {
                    throw new DOMException('Aborted', 'AbortError');
                }
                const output = await input.executeTool({
                    callId: call.id,
                    toolName: call.function.name,
                    argumentsJson: call.function.arguments,
                });
                messages.push({
                    role: 'tool',
                    content: output,
                    tool_call_id: call.id,
                    name: call.function.name,
                });
            }
        }

        return {
            finalContent,
            messages,
            iterations,
            usage: aggregateUsage(usages),
            stoppedOnMaxIterations: true,
            actualModel,
            provider,
        };
    }
}

/** Shared native backend instance. */
export const nativeAgentLoopBackend = new NativeAgentLoopBackend();
