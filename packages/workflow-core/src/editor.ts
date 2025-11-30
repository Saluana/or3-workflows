import {
    WorkflowData,
    WorkflowNode,
    WorkflowEdge,
    Extension,
    Command,
    WorkflowDataSchema,
    SCHEMA_VERSION,
} from './types';
import { HistoryManager } from './history';
import { CommandManager } from './commands';

export interface EditorOptions {
    extensions?: Extension[];
    content?: WorkflowData;
    onUpdate?: (props: { editor: WorkflowEditor }) => void;
    onSelectionUpdate?: (props: { editor: WorkflowEditor }) => void;
}

/**
 * Factory function to create a new WorkflowEditor instance.
 *
 * @example
 * ```ts
 * const editor = createWorkflowEditor({
 *   content: initialWorkflowData,
 *   extensions: [new MyExtension()]
 * });
 * ```
 *
 * @param options - Configuration options for the editor
 * @returns A new WorkflowEditor instance
 */
export function createWorkflowEditor(
    options: EditorOptions = {}
): WorkflowEditor {
    return new WorkflowEditor(options);
}

/**
 * Core class for managing workflow state and operations.
 * Handles node/edge management, history (undo/redo), selection, and extensions.
 */
export class WorkflowEditor {
    public nodes: WorkflowNode[] = [];
    public edges: WorkflowEdge[] = [];
    public meta: WorkflowData['meta'];
    public viewport = { x: 0, y: 0, zoom: 1 };
    public extensions: Map<string, Extension> = new Map();
    public extensionCommands: Record<string, Command> = {};

    private listeners: Map<string, Function[]> = new Map();

    public history: HistoryManager;
    public commands: CommandManager;

    constructor(options: EditorOptions = {}) {
        this.history = new HistoryManager();
        this.commands = new CommandManager(this);
        const now = new Date().toISOString();
        this.meta = {
            version: SCHEMA_VERSION,
            name: 'Untitled',
            createdAt: now,
            updatedAt: now,
        };

        if (options.extensions) {
            options.extensions.forEach((ext) => this.registerExtension(ext));
        }

        if (options.content) {
            this.load(options.content);
            // Initial state for history
            this.history.push({ nodes: this.nodes, edges: this.edges });
        }

        // Bind methods
        this.registerExtension = this.registerExtension.bind(this);
        this.emit = this.emit.bind(this);
    }

    /**
     * Register an extension with the editor.
     * @param extension - The extension to register
     */
    public registerExtension(extension: Extension) {
        if (this.extensions.has(extension.name)) {
            console.warn(`Extension ${extension.name} already registered.`);
            return;
        }
        this.extensions.set(extension.name, extension);

        if (extension.onCreate) {
            extension.onCreate();
        }

        if (extension.addCommands) {
            const commands = extension.addCommands();
            this.extensionCommands = { ...this.extensionCommands, ...commands };
        }
    }

    /**
     * Load workflow data into the editor.
     * Clears history and emits 'update' event.
     * @param content - The workflow data to load
     */
    public load(content: WorkflowData) {
        try {
            const parsed = WorkflowDataSchema.parse(content);
            this.nodes = parsed.nodes as WorkflowNode[];
            this.edges = parsed.edges;
            this.setMeta(parsed.meta, { touchUpdatedAt: false });
            this.history.clear();
            this.history.push({ nodes: this.nodes, edges: this.edges });
            this.emit('update');
        } catch (error) {
            console.error('Failed to load workflow:', error);
            throw error;
        }
    }

    // ... (getJSON implementation)

    public canUndo(): boolean {
        return this.history.canUndo;
    }

    public canRedo(): boolean {
        return this.history.canRedo;
    }

    public undo() {
        const state = this.history.undo();
        if (state) {
            this.nodes = state.nodes;
            this.edges = state.edges;
            this.emit('update');
        }
    }

    public redo() {
        const state = this.history.redo();
        if (state) {
            this.nodes = state.nodes;
            this.edges = state.edges;
            this.emit('update');
        }
    }

    /**
     * Get the current workflow data as JSON.
     * @returns The current workflow data
     */
    public getJSON(): WorkflowData {
        return {
            meta: {
                ...this.meta,
                version: this.meta.version || SCHEMA_VERSION,
                name: this.meta.name || 'Untitled',
            },
            nodes: this.nodes,
            edges: this.edges,
        };
    }

    public getNodes(): WorkflowNode[] {
        return this.nodes;
    }

    public getEdges(): WorkflowEdge[] {
        return this.edges;
    }

    public getSelected() {
        return {
            nodes: this.nodes.filter((n) => n.selected).map((n) => n.id),
            edges: this.edges.filter((e) => e.selected).map((e) => e.id),
        };
    }

    // Event Emitter
    public on(event: string, callback: Function): () => void {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event)?.push(callback);
        return () => this.off(event, callback);
    }

    public off(event: string, callback: Function) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            this.listeners.set(
                event,
                callbacks.filter((cb) => cb !== callback)
            );
        }
    }

    public emit(event: string, ...args: any[]) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach((cb) => cb(...args));
        }
    }

    public destroy() {
        // Clean up command manager timeouts
        this.commands.dispose();

        this.extensions.forEach((ext) => {
            if (ext.onDestroy) ext.onDestroy();
        });
        this.listeners.clear();
        this.nodes = [];
        this.edges = [];
    }

    /**
     * Update workflow metadata such as name/description.
     * @param meta - Partial metadata to merge
     * @param options - Control timestamp updates
     */
    public setMeta(
        meta: Partial<WorkflowData['meta']>,
        options: { touchUpdatedAt?: boolean } = {}
    ): void {
        const now = new Date().toISOString();
        const shouldTouch = options.touchUpdatedAt ?? true;

        this.meta = {
            ...this.meta,
            ...meta,
            version: meta.version || this.meta.version || SCHEMA_VERSION,
            createdAt: meta.createdAt || this.meta.createdAt || now,
            updatedAt: shouldTouch
                ? now
                : meta.updatedAt || this.meta.updatedAt || now,
        };

        this.emit('metaUpdate', this.meta);
    }

    /**
     * Get current workflow metadata.
     */
    public getMeta(): WorkflowData['meta'] {
        return this.meta;
    }

    /**
     * Touch the metadata updatedAt timestamp.
     */
    public touchMeta(): void {
        this.setMeta({}, { touchUpdatedAt: true });
    }

    /**
     * Update viewport zoom level stored in core state.
     */
    public setViewportZoom(level: number): void {
        const clamped = Math.max(0.1, Math.min(level, 3));
        this.viewport = { ...this.viewport, zoom: clamped };
        this.emit('viewportUpdate', this.viewport);
    }
}
