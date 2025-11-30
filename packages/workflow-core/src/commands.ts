import { z } from 'zod';
import { WorkflowEditor } from './editor';
import { WorkflowNode, WorkflowEdge, NodeData, BaseNodeData } from './types';

// Validation schemas for command inputs
const EdgeUpdateSchema = z.object({
    label: z.string().max(100).optional(),
    data: z.record(z.unknown()).optional(),
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

        this.editor.nodes = [...this.editor.nodes, node];
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
        this.editor.nodes = this.editor.nodes.filter((n) => n.id !== id);
        // Also delete connected edges
        this.editor.edges = this.editor.edges.filter(
            (e) => e.source !== id && e.target !== id
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

        this.editor.nodes = [
            ...this.editor.nodes.slice(0, idx),
            updatedNode,
            ...this.editor.nodes.slice(idx + 1),
        ];

        this.editor.touchMeta();
        this.debouncedPushHistory();
        this.editor.emit('nodeUpdate', updatedNode);
        this.editor.emit('update');
        return true;
    }

    public duplicateNode(id: string): boolean {
        const node = this.editor.nodes.find((n) => n.id === id);
        if (!node) return false;

        const newNode: WorkflowNode = {
            ...node,
            id: crypto.randomUUID(),
            position: { x: node.position.x + 20, y: node.position.y + 20 },
            data: JSON.parse(JSON.stringify(node.data)),
            selected: false,
        };

        this.editor.nodes = [...this.editor.nodes, newNode];
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
        const id = crypto.randomUUID();
        const edge: WorkflowEdge = {
            id,
            source,
            target,
            sourceHandle,
            targetHandle,
        };

        this.editor.edges = [...this.editor.edges, edge];
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
        this.editor.edges = this.editor.edges.filter((e) => e.id !== id);

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

        this.editor.nodes = this.editor.nodes.map((n) => ({
            ...n,
            selected: n.id === id ? true : additive ? n.selected : false,
        }));
        this.editor.emit('selectionUpdate');
        return true;
    }

    public deselectAll(): boolean {
        this.editor.nodes = this.editor.nodes.map((n) => ({
            ...n,
            selected: false,
        }));
        this.editor.emit('selectionUpdate');
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
