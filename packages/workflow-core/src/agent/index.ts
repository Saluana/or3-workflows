/**
 * Agent-loop backends (R6).
 *
 * The optional `@openrouter/agent` backend is NOT re-exported here to keep it
 * out of the default bundle; import it from `or3-workflow-core/openrouter-agent`.
 *
 * @module agent
 */
export type {
    AgentLoopBackend,
    AgentLoopInput,
    AgentLoopResult,
    AgentToolInvocation,
    AgentToolExecutor,
} from './types';
export {
    NativeAgentLoopBackend,
    nativeAgentLoopBackend,
} from './NativeAgentLoopBackend';
export { aggregateUsage } from './usage';
