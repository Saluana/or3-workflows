/**
 * Optional OpenRouter Agent backend subpath entry (`or3-workflow-core/openrouter-agent`).
 *
 * Import this only when you intend to use the `@openrouter/agent` backend. It is
 * kept out of the main entry so static/SSR clients never eagerly bundle the
 * optional peer dependency (R1.AC4, R6.AC3).
 */
export {
    OpenRouterAgentLoopBackend,
    OpenRouterAgentClientRequiredError,
    OptionalBackendUnavailableError,
    createOpenRouterAgentBackend,
    preflightOpenRouterAgent,
} from './agent/openrouterAgentBackend';
export type { OpenRouterAgentBackendOptions } from './agent/openrouterAgentBackend';
export type {
    AgentLoopBackend,
    AgentLoopInput,
    AgentLoopResult,
} from './agent/types';
