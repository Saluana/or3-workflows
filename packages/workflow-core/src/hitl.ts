/**
 * Human-in-the-Loop (HITL) types and utilities.
 *
 * HITL is opt-in per node. The framework provides the pause/resume mechanism;
 * developers provide the UI via callbacks.
 *
 * For long-running workflows that need persistence across process restarts,
 * implement the HITLAdapter interface with your own storage backend.
 *
 * @module hitl
 */

// ============================================================================
// Types
// ============================================================================

/**
 * HITL mode determines when and how human intervention occurs.
 *
 * - `approval`: Pause BEFORE node execution for approve/reject
 * - `input`: Pause to collect human input before execution
 * - `review`: Pause AFTER node execution to review output
 */
export type HITLMode = 'approval' | 'input' | 'review';

/**
 * HITL response action types.
 */
export type HITLAction =
    | 'approve'
    | 'reject'
    | 'submit'
    | 'modify'
    | 'skip'
    | 'custom';

/**
 * Configuration for HITL behavior on a node.
 *
 * @example
 * ```typescript
 * const nodeData: AgentNodeData = {
 *   label: 'Critical Decision',
 *   model: 'openai/gpt-4o',
 *   prompt: 'Analyze and recommend...',
 *   hitl: {
 *     enabled: true,
 *     mode: 'approval',
 *     prompt: 'Review this recommendation before proceeding',
 *     timeout: 300000, // 5 minutes
 *     defaultAction: 'reject',
 *   },
 * };
 * ```
 */
export interface HITLConfig {
    /** Enable HITL for this node (default: false) */
    enabled: boolean;

    /** HITL mode */
    mode: HITLMode;

    /** Prompt to show the human reviewer */
    prompt?: string;

    /**
     * JSON Schema for input mode - defines what fields to collect.
     * Used by UI implementations to generate input forms.
     */
    inputSchema?: Record<string, unknown>;

    /**
     * Custom options for approval mode.
     * If not provided, defaults to approve/reject.
     */
    options?: Array<{
        id: string;
        label: string;
        action: 'approve' | 'reject' | 'custom';
    }>;

    /**
     * Timeout in milliseconds.
     * 0 or undefined = no timeout (wait indefinitely)
     */
    timeout?: number;

    /**
     * Default action to take when timeout is reached.
     * Only used if timeout > 0.
     */
    defaultAction?: 'approve' | 'reject' | 'skip';
}

/**
 * Request object passed to the HITL callback.
 * Contains all context needed to render a human review UI.
 */
export interface HITLRequest {
    /** Unique request ID */
    id: string;

    /** Node requiring HITL */
    nodeId: string;

    /** Node label for display */
    nodeLabel: string;

    /** HITL mode */
    mode: HITLMode;

    /** Prompt to display to the human */
    prompt: string;

    /** Current execution context */
    context: {
        /** Current input to the node */
        input: string;
        /** Node output (only for review mode) */
        output?: string;
        /** Workflow name */
        workflowName: string;
        /** Session ID if available */
        sessionId?: string;
    };

    /** Options for approval mode */
    options?: Array<{ id: string; label: string; action: HITLAction }>;

    /** Schema for input mode */
    inputSchema?: Record<string, unknown>;

    /** Request creation timestamp (ISO string) */
    createdAt: string;

    /** Expiry timestamp if timeout is set (ISO string) */
    expiresAt?: string;
}

/**
 * Response from human interaction.
 */
export interface HITLResponse {
    /** Request ID being responded to */
    requestId: string;

    /**
     * Action taken by the human.
     * - `approve`: Proceed with original or modified input/output
     * - `reject`: Stop or route to rejection branch
     * - `submit`: Input mode - submit collected data
     * - `modify`: Review mode - use modified output
     * - `skip`: Skip this node entirely
     */
    action: HITLAction;

    /**
     * Data provided by the human.
     * - For `approve`: Optional modified input
     * - For `submit`: The collected input data
     * - For `modify`: The modified output
     */
    data?: string | Record<string, unknown>;

    /** Identifier of the responder (optional) */
    respondedBy?: string;

    /** Response timestamp (ISO string) */
    respondedAt: string;
}

/**
 * HITL callback function type.
 *
 * Implement this to show UI for human interaction. The callback is called
 * when a node with HITL enabled is reached during execution.
 *
 * @example
 * ```typescript
 * const adapter = new OpenRouterExecutionAdapter(client, {
 *   onHITLRequest: async (request) => {
 *     // Show your UI (modal, Slack message, email, etc.)
 *     const userResponse = await showApprovalModal(request);
 *     return {
 *       requestId: request.id,
 *       action: userResponse.approved ? 'approve' : 'reject',
 *       data: userResponse.modifiedInput,
 *       respondedAt: new Date().toISOString(),
 *     };
 *   },
 * });
 * ```
 */
export type HITLCallback = (request: HITLRequest) => Promise<HITLResponse>;

/**
 * Adapter interface for persistent HITL storage.
 *
 * Implement this interface to persist HITL requests across process restarts
 * for long-running workflows (multi-day approvals, async human tasks, etc.).
 *
 * The default in-memory implementation is suitable for interactive workflows
 * where the process stays alive during human interaction.
 *
 * @example
 * ```typescript
 * // Redis-backed implementation
 * class RedisHITLAdapter implements HITLAdapter {
 *   async store(request: HITLRequest): Promise<void> {
 *     await redis.hset('hitl:requests', request.id, JSON.stringify(request));
 *     if (request.expiresAt) {
 *       await redis.expireat('hitl:requests', new Date(request.expiresAt).getTime() / 1000);
 *     }
 *   }
 *
 *   async get(requestId: string): Promise<HITLRequest | null> {
 *     const data = await redis.hget('hitl:requests', requestId);
 *     return data ? JSON.parse(data) : null;
 *   }
 *
 *   async respond(requestId: string, response: HITLResponse): Promise<void> {
 *     await redis.hset('hitl:responses', requestId, JSON.stringify(response));
 *     await redis.hdel('hitl:requests', requestId);
 *   }
 *
 *   async getPending(workflowId?: string): Promise<HITLRequest[]> {
 *     const all = await redis.hgetall('hitl:requests');
 *     const requests = Object.values(all).map(v => JSON.parse(v));
 *     return workflowId
 *       ? requests.filter(r => r.context.workflowName === workflowId)
 *       : requests;
 *   }
 *
 *   async getResponse(requestId: string): Promise<HITLResponse | null> {
 *     const data = await redis.hget('hitl:responses', requestId);
 *     return data ? JSON.parse(data) : null;
 *   }
 *
 *   async delete(requestId: string): Promise<void> {
 *     await redis.hdel('hitl:requests', requestId);
 *     await redis.hdel('hitl:responses', requestId);
 *   }
 * }
 * ```
 */
export interface HITLAdapter {
    /**
     * Store a pending HITL request.
     * Called when a node reaches a HITL pause point.
     */
    store(request: HITLRequest): Promise<void>;

    /**
     * Get a pending HITL request by ID.
     * Returns null if not found or already responded.
     */
    get(requestId: string): Promise<HITLRequest | null>;

    /**
     * Record a response to a HITL request.
     * Should remove from pending and store the response.
     */
    respond(requestId: string, response: HITLResponse): Promise<void>;

    /**
     * Get all pending (unanswered) HITL requests.
     * Optionally filtered by workflow/session.
     */
    getPending(workflowId?: string, sessionId?: string): Promise<HITLRequest[]>;

    /**
     * Get the response for a request, if it exists.
     * Used when resuming a workflow to check if human has responded.
     */
    getResponse(requestId: string): Promise<HITLResponse | null>;

    /**
     * Delete a request and its response (cleanup).
     */
    delete(requestId: string): Promise<void>;

    /**
     * Clear all pending requests (optionally filtered).
     */
    clear(workflowId?: string, sessionId?: string): Promise<void>;
}

/**
 * Default in-memory HITL adapter.
 *
 * NOT suitable for production with long-running workflows.
 * Use a persistent adapter (Redis, Postgres, etc.) for durability.
 */
export class InMemoryHITLAdapter implements HITLAdapter {
    private requests: Map<string, HITLRequest> = new Map();
    private responses: Map<string, HITLResponse> = new Map();

    async store(request: HITLRequest): Promise<void> {
        this.requests.set(request.id, request);
    }

    async get(requestId: string): Promise<HITLRequest | null> {
        return this.requests.get(requestId) ?? null;
    }

    async respond(requestId: string, response: HITLResponse): Promise<void> {
        this.responses.set(requestId, response);
        this.requests.delete(requestId);
    }

    async getPending(
        workflowId?: string,
        sessionId?: string
    ): Promise<HITLRequest[]> {
        const all = Array.from(this.requests.values());
        return all.filter((r) => {
            if (workflowId && r.context.workflowName !== workflowId)
                return false;
            if (sessionId && r.context.sessionId !== sessionId) return false;
            return true;
        });
    }

    async getResponse(requestId: string): Promise<HITLResponse | null> {
        return this.responses.get(requestId) ?? null;
    }

    async delete(requestId: string): Promise<void> {
        this.requests.delete(requestId);
        this.responses.delete(requestId);
    }

    async clear(workflowId?: string, sessionId?: string): Promise<void> {
        if (!workflowId && !sessionId) {
            this.requests.clear();
            this.responses.clear();
            return;
        }

        for (const [id, request] of this.requests) {
            if (workflowId && request.context.workflowName !== workflowId)
                continue;
            if (sessionId && request.context.sessionId !== sessionId) continue;
            this.requests.delete(id);
            this.responses.delete(id);
        }
    }
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid HITLMode.
 */
export function isHITLMode(value: unknown): value is HITLMode {
    return value === 'approval' || value === 'input' || value === 'review';
}

/**
 * Type guard to check if a value is a valid HITLConfig.
 */
export function isHITLConfig(value: unknown): value is HITLConfig {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const config = value as Record<string, unknown>;

    // enabled is required and must be boolean
    if (typeof config.enabled !== 'boolean') {
        return false;
    }

    // mode is required and must be valid
    if (!isHITLMode(config.mode)) {
        return false;
    }

    // Optional fields validation
    if (config.prompt !== undefined && typeof config.prompt !== 'string') {
        return false;
    }

    if (config.timeout !== undefined && typeof config.timeout !== 'number') {
        return false;
    }

    if (
        config.defaultAction !== undefined &&
        config.defaultAction !== 'approve' &&
        config.defaultAction !== 'reject' &&
        config.defaultAction !== 'skip'
    ) {
        return false;
    }

    return true;
}

/**
 * Type guard to check if a value is a valid HITLRequest.
 */
export function isHITLRequest(value: unknown): value is HITLRequest {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const request = value as Record<string, unknown>;

    return (
        typeof request.id === 'string' &&
        typeof request.nodeId === 'string' &&
        typeof request.nodeLabel === 'string' &&
        isHITLMode(request.mode) &&
        typeof request.prompt === 'string' &&
        typeof request.context === 'object' &&
        request.context !== null &&
        typeof request.createdAt === 'string'
    );
}

/**
 * Type guard to check if a value is a valid HITLResponse.
 */
export function isHITLResponse(value: unknown): value is HITLResponse {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const response = value as Record<string, unknown>;

    const validActions = ['approve', 'reject', 'submit', 'modify', 'skip'];

    return (
        typeof response.requestId === 'string' &&
        typeof response.action === 'string' &&
        validActions.includes(response.action) &&
        typeof response.respondedAt === 'string'
    );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique HITL request ID.
 */
export function generateHITLRequestId(): string {
    return `hitl_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 9)}`;
}

/**
 * Create a default HITLConfig with sensible defaults.
 */
export function createDefaultHITLConfig(
    overrides?: Partial<HITLConfig>
): HITLConfig {
    return {
        enabled: false,
        mode: 'approval',
        ...overrides,
    };
}

/**
 * Get default options for approval mode.
 */
export function getDefaultApprovalOptions(): HITLConfig['options'] {
    return [
        { id: 'approve', label: 'Approve', action: 'approve' },
        { id: 'reject', label: 'Reject', action: 'reject' },
    ];
}
