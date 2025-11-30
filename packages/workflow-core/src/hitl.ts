/**
 * Human-in-the-Loop (HITL) types and utilities.
 *
 * HITL is opt-in per node. The framework provides the pause/resume mechanism;
 * developers provide the UI via callbacks.
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
    options?: Array<{ id: string; label: string; action: string }>;

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
    action: 'approve' | 'reject' | 'submit' | 'modify' | 'skip';

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
