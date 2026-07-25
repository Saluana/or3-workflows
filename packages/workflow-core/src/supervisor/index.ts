/**
 * Supervisor graph template/composite (R9.AC1, R9.AC2, R9.AC3).
 *
 * A supervisor is a *pattern*, not a hidden engine primitive (design decision
 * 8). `createSupervisorTemplate` composes existing graph primitives — start,
 * router (or parallel), agent/subflow workers, optional HITL approval, and an
 * output/synthesis node — into an ordinary observable `WorkflowData`. Delegation
 * produces normal router/subflow/parallel/HITL nodes with scoped child paths and
 * explicit budgets/permissions.
 *
 * @module supervisor
 */
import { SCHEMA_VERSION, type WorkflowData, type WorkflowEdge, type WorkflowNode } from '../types';

/** A worker the supervisor can delegate to. */
export interface SupervisorWorker {
    id: string;
    label: string;
    kind: 'agent' | 'subflow';
    /** Agent worker: model + prompt. */
    model?: string;
    prompt?: string;
    /** Subflow worker: registered subflow id (scopes a child path). */
    subflowId?: string;
    /** Explicit permission scopes granted to this worker. */
    permissions?: string[];
}

/** Explicit budget applied to the supervisor run. */
export interface SupervisorBudget {
    maxSteps?: number;
    maxCostUsd?: number;
    maxDurationMs?: number;
}

export interface SupervisorConfig {
    name: string;
    description?: string;
    supervisorModel?: string;
    supervisorPrompt?: string;
    workers: SupervisorWorker[];
    /** Delegate to all workers in parallel instead of routing to one. */
    parallel?: boolean;
    /** Require human approval before delegation (inserts a HITL node). */
    requireApproval?: boolean;
    /** Synthesis model for combining worker outputs. */
    synthesisModel?: string;
    budget?: SupervisorBudget;
}

const DEFAULT_SUPERVISOR_MODEL = 'z-ai/glm-4.6:exacto';

function node(
    id: string,
    type: string,
    x: number,
    y: number,
    data: Record<string, unknown>
): WorkflowNode {
    return { id, type, position: { x, y }, data } as unknown as WorkflowNode;
}

function edge(
    id: string,
    source: string,
    target: string,
    sourceHandle?: string
): WorkflowEdge {
    return { id, source, target, sourceHandle };
}

/**
 * Build a supervisor composite as an ordinary `WorkflowData`. The returned graph
 * is fully observable and executable by the standard engine — no special
 * runtime primitive is required.
 */
export function createSupervisorTemplate(
    config: SupervisorConfig
): WorkflowData {
    if (config.workers.length === 0) {
        throw new Error('Supervisor requires at least one worker');
    }
    const nodes: WorkflowNode[] = [];
    const edges: WorkflowEdge[] = [];
    const supervisorModel = config.supervisorModel ?? DEFAULT_SUPERVISOR_MODEL;

    nodes.push(
        node('start', 'start', 0, 0, { label: 'Start' })
    );

    let delegationSource = 'start';

    if (config.requireApproval) {
        nodes.push(
            node('approval', 'agent', 200, 0, {
                label: 'Approval',
                model: supervisorModel,
                prompt: 'Await human approval before delegating to workers.',
                hitl: { enabled: true, mode: 'approval' },
            })
        );
        edges.push(edge('e-start-approval', 'start', 'approval'));
        delegationSource = 'approval';
    }

    const workerIds: string[] = [];

    if (config.parallel) {
        // Parallel delegation via a parallel node with one branch per worker.
        nodes.push(
            node('supervisor', 'parallel', 400, 0, {
                label: 'Supervisor (parallel)',
                model: supervisorModel,
                prompt: config.supervisorPrompt ?? 'Delegate to all workers.',
                branches: config.workers.map((w) => ({
                    id: w.id,
                    label: w.label,
                    model: w.model ?? supervisorModel,
                    prompt: w.prompt,
                })),
                mergeEnabled: true,
                permissions: collectPermissions(config),
                budget: config.budget,
            })
        );
        edges.push(edge(`e-${delegationSource}-supervisor`, delegationSource, 'supervisor'));
        // Parallel branches are executed inside the node; still surface explicit
        // worker subflow nodes for observability when kind === 'subflow'.
        config.workers.forEach((w, i) => {
            if (w.kind === 'subflow') {
                const wid = `worker-${w.id}`;
                nodes.push(
                    node(wid, 'subflow', 600, i * 120, {
                        label: w.label,
                        subflowId: w.subflowId ?? w.id,
                        permissions: w.permissions,
                    })
                );
                edges.push(edge(`e-supervisor-${wid}`, 'supervisor', wid));
                workerIds.push(wid);
            }
        });
        if (workerIds.length === 0) workerIds.push('supervisor');
    } else {
        // Routed delegation: a router chooses one worker (edges are source of truth).
        nodes.push(
            node('supervisor', 'router', 400, 0, {
                label: 'Supervisor',
                model: supervisorModel,
                prompt:
                    config.supervisorPrompt ??
                    'Choose the best worker for the task.',
                // Route ids drive the router's dynamic output handles.
                routes: config.workers.map((w) => ({
                    id: w.id,
                    label: w.label,
                })),
                fallbackBehavior: 'first',
                budget: config.budget,
                permissions: collectPermissions(config),
            })
        );
        edges.push(edge(`e-${delegationSource}-supervisor`, delegationSource, 'supervisor'));

        config.workers.forEach((w, i) => {
            const wid = `worker-${w.id}`;
            if (w.kind === 'subflow') {
                nodes.push(
                    node(wid, 'subflow', 600, i * 120, {
                        label: w.label,
                        subflowId: w.subflowId ?? w.id,
                        permissions: w.permissions,
                    })
                );
            } else {
                nodes.push(
                    node(wid, 'agent', 600, i * 120, {
                        label: w.label,
                        model: w.model ?? supervisorModel,
                        prompt: w.prompt ?? `You are ${w.label}.`,
                        permissions: w.permissions,
                    })
                );
            }
            // Route via sourceHandle = worker id.
            edges.push(edge(`e-supervisor-${wid}`, 'supervisor', wid, w.id));
            workerIds.push(wid);
        });
    }

    // Synthesis/output node combining worker outputs.
    nodes.push(
        node('output', 'output', 900, 0, {
            label: 'Synthesis',
            format: 'text',
            mode: 'synthesis',
            sources: workerIds,
            synthesis: {
                model: config.synthesisModel ?? supervisorModel,
                prompt: 'Combine the worker results into a final answer.',
            },
        })
    );
    for (const wid of workerIds) {
        edges.push(edge(`e-${wid}-output`, wid, 'output'));
    }

    return {
        meta: {
            version: SCHEMA_VERSION,
            name: config.name,
            description:
                config.description ??
                'Supervisor composite generated from graph primitives.',
        },
        nodes,
        edges,
    };
}

function collectPermissions(config: SupervisorConfig): string[] {
    const set = new Set<string>();
    for (const w of config.workers) {
        for (const p of w.permissions ?? []) set.add(p);
    }
    return [...set];
}
