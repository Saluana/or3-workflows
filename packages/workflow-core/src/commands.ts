import { z } from 'zod';
import { WorkflowEditor } from './editor';
import {
    WorkflowNode,
    WorkflowEdge,
    NodeData,
    BaseNodeData,
    type ValidationError,
    type ValidationErrorCode,
} from './types';
import { validateWorkflow } from './validation';

// Validation schemas for command inputs
const EdgeUpdateSchema = z.object({
    label: z.string().max(100).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
});

const NodeDataUpdateSchema = z
    .object({
        label: z.string().max(200).optional(),
        prompt: z.string().optional(),
        model: z.string().optional(),
        tools: z.array(z.string()).optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().positive().optional(),
    })
    .passthrough();

export class CommandManager {
    private editor: WorkflowEditor;
    private historyTimeout: ReturnType<typeof setTimeout> | null = null;
    private pendingHistoryPush = false;
    private readonly nonBlockingErrors = new Set<ValidationErrorCode>([
        'DISCONNECTED_NODE',
        'MISSING_REQUIRED_PORT',
        'MISSING_MODEL',
        'MISSING_PROMPT',
        'MISSING_SUBFLOW_ID',
        'SUBFLOW_NOT_FOUND',
        'MISSING_INPUT_MAPPING',
        'MISSING_OPERATION',
        'INVALID_LIMIT',
        'MISSING_CONDITION_PROMPT',
        'INVALID_MAX_ITERATIONS',
        'MISSING_BODY',
        'MISSING_EXIT',
    ]);

    constructor(editor: WorkflowEditor) {
        this.editor = editor;
    }

    /**
     * Clean up pending timeouts. Call before destroying the editor.
     */
    public dispose(): void {
        if (this.historyTimeout) {
            clearTimeout(this.historyTimeout);
            this.historyTimeout = null;
        }
        this.pendingHistoryPush = false;
    }

    // Node operations
    public createNode(
        type: string,
        data: BaseNodeData & Record<string, unknown> = { label: '' },
        position = { x: 0, y: 0 }
    ): boolean {
        const id = crypto.randomUUID();
        const node: WorkflowNode = {
            id,
            type,
            position,
            // Trust boundary: data is validated by extensions at runtime
            data: data as NodeData,
        };

        const nextNodes = [...this.editor.nodes, node];
        const nextEdges = [...this.editor.edges];

        if (!this.isValidChange(nextNodes, nextEdges)) {
            return false;
        }

        this.editor.nodes = nextNodes;
        this.editor.incrementNodeVersion(id);
        this.editor.touchMeta();
        this.pushHistory();
        this.editor.emit('nodeCreate', node);
        this.editor.emit('update');
        return true;
    }

    public deleteNode(id: string): boolean {
        const index = this.editor.nodes.findIndex((n) => n.id === id);
        if (index === -1) return false;

        const node = this.editor.nodes[index];

        // Prevent deletion of the start node
        if (node.type === 'start') {
            console.warn('Cannot delete start node');
            return false;
        }

        // Track edges being deleted for version cleanup
        const deletedEdgeIds = this.editor.edges
            .filter((e) => e.source === id || e.target === id)
            .map((e) => e.id);

        const nextNodes = this.editor.nodes.filter((n) => n.id !== id);
        const nextEdges = this.editor.edges.filter(
            (e) => e.source !== id && e.target !== id
        );

        if (!this.isValidChange(nextNodes, nextEdges)) {
            return false;
        }

        this.editor.nodes = nextNodes;
        this.editor.edges = nextEdges;

        // Clean up version tracking
        this.editor.removeNodeVersion(id);
        deletedEdgeIds.forEach((edgeId) =>
            this.editor.removeEdgeVersion(edgeId)
        );

        this.editor.touchMeta();
        this.pushHistory();
        this.editor.emit('nodeDelete', node);
        this.editor.emit('update');
        return true;
    }

    public updateNodeData(id: string, data: Partial<NodeData>): boolean {
        // Validate input
        const result = NodeDataUpdateSchema.safeParse(data);
        if (!result.success) {
            console.warn('Invalid node data update:', result.error.issues);
            return false;
        }

        const idx = this.editor.nodes.findIndex((n) => n.id === id);
        if (idx === -1) return false;

        const node = this.editor.nodes[idx]!;
        const updatedNode = {
            ...node,
            data: { ...node.data, ...result.data },
        };

        const nextNodes = [
            ...this.editor.nodes.slice(0, idx),
            updatedNode,
            ...this.editor.nodes.slice(idx + 1),
        ];

        if (!this.isValidChange(nextNodes, this.editor.edges)) {
            return false;
        }

        this.editor.nodes = nextNodes;
        this.editor.incrementNodeVersion(id);
        this.editor.touchMeta();
        this.debouncedPushHistory();
        this.editor.emit('nodeUpdate', updatedNode);
        this.editor.emit('update');
        return true;
    }

    public duplicateNode(id: string): boolean {
        const node = this.editor.nodes.find((n) => n.id === id);
        if (!node) return false;

        const newId = crypto.randomUUID();
        const newNode: WorkflowNode = {
            ...node,
            id: newId,
            position: { x: node.position.x + 20, y: node.position.y + 20 },
            data: JSON.parse(JSON.stringify(node.data)),
            selected: false,
        };

        const nextNodes = [...this.editor.nodes, newNode];

        if (!this.isValidChange(nextNodes, this.editor.edges)) {
            return false;
        }

        this.editor.nodes = nextNodes;
        this.editor.incrementNodeVersion(newId);
        this.editor.touchMeta();
        this.pushHistory();
        this.editor.emit('nodeCreate', newNode);
        this.editor.emit('update');
        return true;
    }

    public setNodePosition(
        id: string,
        position: { x: number; y: number }
    ): boolean {
        const idx = this.editor.nodes.findIndex((n) => n.id === id);
        if (idx === -1) return false;

        const node = this.editor.nodes[idx]!;
        const updatedNode = { ...node, position };

        this.editor.nodes = [
            ...this.editor.nodes.slice(0, idx),
            updatedNode,
            ...this.editor.nodes.slice(idx + 1),
        ];

        this.editor.incrementNodeVersion(id);
        this.editor.touchMeta();
        this.debouncedPushHistory();
        this.editor.emit('nodeUpdate', updatedNode);
        this.editor.emit('update');
        return true;
    }

    // Edge operations
    public createEdge(
        source: string,
        target: string,
        sourceHandle?: string,
        targetHandle?: string
    ): boolean {
        const sourceExists = this.editor.nodes.some((n) => n.id === source);
        const targetExists = this.editor.nodes.some((n) => n.id === target);
        if (!sourceExists || !targetExists) {
            console.warn(
                'Cannot create edge: source or target node does not exist',
                { source, target }
            );
            return false;
        }

        const id = crypto.randomUUID();
        const edge: WorkflowEdge = {
            id,
            source,
            target,
            sourceHandle,
            targetHandle,
        };

        const nextEdges = [...this.editor.edges, edge];
        if (!this.isValidChange(this.editor.nodes, nextEdges)) {
            return false;
        }

        this.editor.edges = nextEdges;
        this.editor.incrementEdgeVersion(id);
        this.editor.touchMeta();
        this.pushHistory();
        this.editor.emit('edgeCreate', edge);
        this.editor.emit('update');
        return true;
    }

    public deleteEdge(id: string): boolean {
        const index = this.editor.edges.findIndex((e) => e.id === id);
        if (index === -1) return false;

        const edge = this.editor.edges[index];
        const nextEdges = this.editor.edges.filter((e) => e.id !== id);

        if (!this.isValidChange(this.editor.nodes, nextEdges)) {
            return false;
        }

        this.editor.edges = nextEdges;

        this.editor.removeEdgeVersion(id);
        this.editor.touchMeta();
        this.pushHistory();
        this.editor.emit('edgeDelete', edge);
        this.editor.emit('update');
        return true;
    }

    public updateEdgeData(id: string, data: unknown): boolean {
        // Validate input
        const result = EdgeUpdateSchema.safeParse(data);
        if (!result.success) {
            console.warn('Invalid edge data update:', result.error.issues);
            return false;
        }

        const idx = this.editor.edges.findIndex((e) => e.id === id);
        if (idx === -1) return false;

        const edge = this.editor.edges[idx]!;
        const { label, data: edgeData } = result.data;

        const updatedEdge = {
            ...edge,
            ...(label !== undefined && { label }),
            ...(edgeData !== undefined && {
                data: { ...edge.data, ...edgeData },
            }),
        };

        this.editor.edges = [
            ...this.editor.edges.slice(0, idx),
            updatedEdge,
            ...this.editor.edges.slice(idx + 1),
        ];

        this.editor.incrementEdgeVersion(id);
        this.editor.touchMeta();
        this.debouncedPushHistory();
        this.editor.emit('edgeUpdate', updatedEdge);
        this.editor.emit('update');
        return true;
    }

    // Selection
    public selectNode(id: string, additive = false): boolean {
        const nodeExists = this.editor.nodes.some((n) => n.id === id);
        if (!nodeExists) return false;

        // Track which nodes change selection state
        const changedNodeIds: string[] = [];

        this.editor.nodes = this.editor.nodes.map((n) => {
            const newSelected =
                n.id === id ? true : additive ? n.selected : false;
            if (n.selected !== newSelected) {
                changedNodeIds.push(n.id);
            }
            return { ...n, selected: newSelected };
        });

        // Increment versions for changed nodes
        changedNodeIds.forEach((nodeId) =>
            this.editor.incrementNodeVersion(nodeId)
        );

        this.editor.emit('selectionUpdate');
        return true;
    }

    public deselectAll(): boolean {
        // Track which nodes change selection state
        const changedNodeIds: string[] = [];

        this.editor.nodes = this.editor.nodes.map((n) => {
            if (n.selected) {
                changedNodeIds.push(n.id);
            }
            return { ...n, selected: false };
        });

        // Increment versions for changed nodes
        changedNodeIds.forEach((nodeId) =>
            this.editor.incrementNodeVersion(nodeId)
        );

        this.editor.emit('selectionUpdate');
        return true;
    }

    /**
     * Set the selection to a specific set of node IDs.
     * Used for syncing Vue Flow's multi-selection (box-select) back to the editor.
     */
    public setSelection(selectedIds: string[]): boolean {
        const selectedSet = new Set(selectedIds);
        const changedNodeIds: string[] = [];

        this.editor.nodes = this.editor.nodes.map((n) => {
            const newSelected = selectedSet.has(n.id);
            if (n.selected !== newSelected) {
                changedNodeIds.push(n.id);
            }
            return { ...n, selected: newSelected };
        });

        // Only emit if something actually changed
        if (changedNodeIds.length > 0) {
            changedNodeIds.forEach((nodeId) =>
                this.editor.incrementNodeVersion(nodeId)
            );
            this.editor.emit('selectionUpdate');
        }
        return true;
    }

    // Viewport (Placeholder - usually handled by renderer, but state can be here)
    public zoomTo(level: number): boolean {
        if (typeof level !== 'number' || Number.isNaN(level)) return false;
        const previous = this.editor.viewport.zoom;
        this.editor.setViewportZoom(level);
        return previous !== this.editor.viewport.zoom;
    }

    // History
    public undo(): boolean {
        if (this.editor.canUndo()) {
            this.editor.undo();
            return true;
        }
        return false;
    }

    public redo(): boolean {
        if (this.editor.canRedo()) {
            this.editor.redo();
            return true;
        }
        return false;
    }

    private getErrorKey(error: ValidationError): string {
        return `${error.code}|${error.nodeId ?? ''}|${error.edgeId ?? ''}`;
    }

    private isValidChange(
        nextNodes: WorkflowNode[],
        nextEdges: WorkflowEdge[],
        ignoreCodes: Set<ValidationErrorCode> = this.nonBlockingErrors
    ): boolean {
        const current = validateWorkflow(this.editor.nodes, this.editor.edges);
        const next = validateWorkflow(nextNodes, nextEdges);

        const currentBlocking = current.errors.filter(
            (error) => !ignoreCodes.has(error.code)
        );
        const nextBlocking = next.errors.filter(
            (error) => !ignoreCodes.has(error.code)
        );

        const currentKeys = new Set(
            currentBlocking.map((error) => this.getErrorKey(error))
        );

        const introduced = nextBlocking.filter(
            (error) => !currentKeys.has(this.getErrorKey(error))
        );

        if (introduced.length > 0) {
            console.warn(
                'Command rejected due to validation errors:',
                introduced
            );
            return false;
        }

        return true;
    }

    /**
     * Debounced history push - batches rapid changes into single history entries.
     * Waits 300ms of inactivity before committing to history.
     */
    private debouncedPushHistory(): void {
        this.pendingHistoryPush = true;
        if (this.historyTimeout) {
            clearTimeout(this.historyTimeout);
        }
        this.historyTimeout = setTimeout(() => {
            this.commitHistory();
        }, 300);
    }

    /**
     * Immediately commit current state to history.
     * Call this after drag-end or other discrete operations.
     */
    public commitHistory(): void {
        if (this.historyTimeout) {
            clearTimeout(this.historyTimeout);
            this.historyTimeout = null;
        }
        if (this.pendingHistoryPush) {
            this.pendingHistoryPush = false;
            this.pushHistory();
        }
    }

    private pushHistory(): void {
        // Use JSON serialization to ensure we store clean snapshots without proxies or non-serializable data
        const nodesSnapshot = JSON.parse(JSON.stringify(this.editor.nodes));
        const edgesSnapshot = JSON.parse(JSON.stringify(this.editor.edges));

        this.editor.history.push({
            nodes: nodesSnapshot,
            edges: edgesSnapshot,
        });
    }
}
