/**
 * Optional `@openrouter/agent` backend loader (R1.AC4, R6.AC2, R6.AC3).
 *
 * The `@openrouter/agent` package is an OPTIONAL peer dependency. It is loaded
 * lazily via a runtime dynamic import with a non-literal specifier so that
 * static clients never eagerly bundle it. When the package is absent, preflight
 * fails with an actionable error rather than crashing at import time.
 *
 * This module is exposed through the `or3-workflow-core/openrouter-agent`
 * subpath so a host must opt in explicitly.
 */
import { NativeAgentLoopBackend } from './NativeAgentLoopBackend';
import type {
    AgentLoopBackend,
    AgentLoopInput,
    AgentLoopResult,
} from './types';

/** Thrown when an optional backend package is not installed. */
export class OptionalBackendUnavailableError extends Error {
    readonly packageName: string;
    constructor(packageName: string, cause?: unknown) {
        super(
            `Optional backend package "${packageName}" is not installed. ` +
                `Install it (e.g. \`bun add ${packageName}\`) to use this backend, ` +
                `or select the default native backend.`
        );
        this.name = 'OptionalBackendUnavailableError';
        this.packageName = packageName;
        if (cause !== undefined) {
            (this as { cause?: unknown }).cause = cause;
        }
    }
}

const PACKAGE_NAME = '@openrouter/agent';

/** Attempt to load the optional `@openrouter/agent` module (non-literal import). */
export async function preflightOpenRouterAgent(): Promise<unknown> {
    const specifier = PACKAGE_NAME as string;
    try {
        // Non-literal specifier keeps this out of static bundles.
        return (await import(/* @vite-ignore */ specifier)) as unknown;
    } catch (err) {
        throw new OptionalBackendUnavailableError(PACKAGE_NAME, err);
    }
}

/**
 * OpenRouter Agent backend. Until parity tests pass, this backend delegates to
 * the native loop after confirming the optional package is installed. The
 * package handle is exposed via {@link module} for host-side adaptation of
 * `callModel`, typed tools, `stopWhen`, state, and approval APIs.
 */
export class OpenRouterAgentLoopBackend implements AgentLoopBackend {
    readonly id = 'openrouter-agent' as const;
    private loaded = false;
    private moduleHandle: unknown;
    private readonly native = new NativeAgentLoopBackend();

    /** The loaded `@openrouter/agent` module handle (after preflight). */
    get module(): unknown {
        return this.moduleHandle;
    }

    async preflight(): Promise<void> {
        if (this.loaded) return;
        this.moduleHandle = await preflightOpenRouterAgent();
        this.loaded = true;
    }

    async run(input: AgentLoopInput): Promise<AgentLoopResult> {
        await this.preflight();
        // The OpenRouter Agent loop is not enabled by default until parity tests
        // (assistant/tool ordering, cancellation, stop conditions, resumable
        // state, receipt ownership) pass. Until then we run the native loop so
        // behavior remains correct and observable under OR3 control.
        return this.native.run(input);
    }
}

/** Create the optional OpenRouter Agent backend (does not preflight eagerly). */
export function createOpenRouterAgentBackend(): OpenRouterAgentLoopBackend {
    return new OpenRouterAgentLoopBackend();
}
