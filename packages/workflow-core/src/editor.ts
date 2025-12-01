import {
    WorkflowData,
    WorkflowNode,
    WorkflowEdge,
    Extension,
    Command,
    WorkflowDataSchema,
    SCHEMA_VERSION,
    EditorEvent,
} from './types';
import { HistoryManager } from './history';
import { CommandManager } from './commands';

/**
 * Type-safe event callback signatures for the editor.
 * Maps each event type to its corresponding callback signature.
 */
type EditorEventCallback<T extends EditorEvent = EditorEvent> = 
    T extends 'update' | 'execute:start' | 'execute:done' | 'selectionUpdate' 
        ? () => void :
    T extends 'metaUpdate' 
        ? (meta: WorkflowData['meta']) => void :
    T extends 'viewportUpdate' 
        ? (viewport: { x: number; y: number; zoom: number }) => void :
    T extends 'nodeCreate' | 'nodeUpdate' | 'nodeDelete' 
        ? (node: WorkflowNode) => void :
    T extends 'edgeCreate' | 'edgeUpdate' | 'edgeDelete' 
        ? (edge: WorkflowEdge) => void :
    T extends 'execute:nodeStart' | 'execute:nodeFinish' 
        ? (nodeId: string, output?: string) => void :
    T extends 'execute:error' 
        ? (error: Error) => void :
    (...args: any[]) => void;

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
    
    // Use readonly to prevent external reassignment of these core objects
    public readonly extensions: ReadonlyMap<string, Extension>;
    public readonly extensionCommands: Readonly<Record<string, Command>>;
    public readonly history: HistoryManager;
    public readonly commands: CommandManager;

    // Type-safe event listeners with Set for better performance
    private listeners: Map<EditorEvent, Set<EditorEventCallback>> = new Map();
    
    // Internal mutable references for extensions and commands
    private _extensions: Map<string, Extension> = new Map();
    private _extensionCommands: Record<string, Command> = {};
    
    // Track if editor has been destroyed to prevent use-after-free
    private _destroyed = false;

    constructor(options: EditorOptions = {}) {
        this.history = new HistoryManager();
        this.commands = new CommandManager(this);
        
        // Expose readonly views
        this.extensions = this._extensions;
        this.extensionCommands = this._extensionCommands;
        
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
        }
    }

    /**
     * Register an extension with the editor.
     * @param extension - The extension to register
     * @throws Error if editor has been destroyed
     */
    public registerExtension(extension: Extension): void {
        this._checkNotDestroyed();
        
        if (this._extensions.has(extension.name)) {
            console.warn(`Extension ${extension.name} already registered.`);
            return;
        }
        
        this._extensions.set(extension.name, extension);

        if (extension.onCreate) {
            extension.onCreate();
        }

        if (extension.addCommands) {
            const commands = extension.addCommands();
            // Check for command name conflicts
            for (const commandName in commands) {
                if (commandName in this._extensionCommands) {
                    console.warn(
                        `Command '${commandName}' from extension '${extension.name}' conflicts with existing command`
                    );
                }
            }
            // Assign commands directly instead of spreading
            Object.assign(this._extensionCommands, commands);
        }
    }

    /**
     * Load workflow data into the editor.
     * Clears history and emits 'update' event.
     * @param content - The workflow data to load
     * @throws Error if workflow validation fails or editor has been destroyed
     */
    public load(content: WorkflowData): void {
        this._checkNotDestroyed();
        
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

    public canUndo(): boolean {
        return this.history.canUndo;
    }

    public canRedo(): boolean {
        return this.history.canRedo;
    }

    public undo(): void {
        this._checkNotDestroyed();
        const state = this.history.undo();
        if (state) {
            this.nodes = state.nodes;
            this.edges = state.edges;
            this.emit('update');
        }
    }

    public redo(): void {
        this._checkNotDestroyed();
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
                // Defensive defaults already in this.meta from constructor/setMeta
                version: this.meta.version,
                name: this.meta.name,
            },
            nodes: this.nodes,
            edges: this.edges,
        };
    }

    public getNodes(): readonly WorkflowNode[] {
        return this.nodes;
    }

    public getEdges(): readonly WorkflowEdge[] {
        return this.edges;
    }

    public getSelected(): { nodes: string[]; edges: string[] } {
        return {
            nodes: this.nodes.filter((n) => n.selected).map((n) => n.id),
            edges: this.edges.filter((e) => e.selected).map((e) => e.id),
        };
    }

    // Event Emitter with type safety
    public on<T extends EditorEvent>(
        event: T,
        callback: EditorEventCallback<T>
    ): () => void {
        this._checkNotDestroyed();
        
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.add(callback as EditorEventCallback);
        }
        
        // Return unsubscribe function
        return () => this.off(event, callback);
    }

    public off<T extends EditorEvent>(
        event: T,
        callback: EditorEventCallback<T>
    ): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.delete(callback as EditorEventCallback);
            // Clean up empty sets to prevent memory leaks
            if (callbacks.size === 0) {
                this.listeners.delete(event);
            }
        }
    }

    public emit<T extends EditorEvent>(event: T, ...args: any[]): void {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            // Create array copy to prevent issues if callbacks modify the set
            const callbackArray = Array.from(callbacks);
            for (const cb of callbackArray) {
                try {
                    (cb as (...args: any[]) => void)(...args);
                } catch (error) {
                    console.error(`Error in event listener for '${event}':`, error);
                }
            }
        }
    }

    public destroy(): void {
        if (this._destroyed) {
            console.warn('WorkflowEditor.destroy() called on already destroyed instance');
            return;
        }
        
        this._destroyed = true;
        
        // Clean up command manager timeouts
        this.commands.dispose();

        // Clean up extensions in reverse order of registration
        const extensionsArray = Array.from(this._extensions.values()).reverse();
        for (const ext of extensionsArray) {
            try {
                if (ext.onDestroy) {
                    ext.onDestroy();
                }
            } catch (error) {
                console.error(`Error destroying extension '${ext.name}':`, error);
            }
        }
        
        // Clear all event listeners to prevent memory leaks
        this.listeners.clear();
        
        // Clear extensions and commands
        this._extensions.clear();
        // Clear extension commands efficiently
        this._extensionCommands = {};
        
        // Clear data
        this.nodes = [];
        this.edges = [];
        
        // Clear history
        this.history.clear();
    }
    
    /**
     * Check if the editor has been destroyed.
     * @returns true if destroyed, false otherwise
     */
    public isDestroyed(): boolean {
        return this._destroyed;
    }
    
    /**
     * Internal helper to check if editor is still usable.
     * @throws Error if editor has been destroyed
     */
    private _checkNotDestroyed(): void {
        if (this._destroyed) {
            throw new Error('Cannot use WorkflowEditor after it has been destroyed');
        }
    }

    /**
     * Update workflow metadata such as name/description.
     * @param meta - Partial metadata to merge
     * @param options - Control timestamp updates
     * @throws Error if editor has been destroyed
     */
    public setMeta(
        meta: Partial<WorkflowData['meta']>,
        options: { touchUpdatedAt?: boolean } = {}
    ): void {
        this._checkNotDestroyed();
        
        const now = new Date().toISOString();
        const shouldTouch = options.touchUpdatedAt ?? true;

        this.meta = {
            ...this.meta,
            ...meta,
            version: meta.version ?? this.meta.version,
            createdAt: meta.createdAt ?? this.meta.createdAt,
            updatedAt: shouldTouch ? now : (meta.updatedAt ?? this.meta.updatedAt),
        };

        this.emit('metaUpdate', this.meta);
    }

    /**
     * Get current workflow metadata.
     */
    public getMeta(): Readonly<WorkflowData['meta']> {
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
     * @param level - Zoom level to set (will be clamped to 0.1-3 range)
     */
    public setViewportZoom(level: number): void {
        this._checkNotDestroyed();
        
        if (typeof level !== 'number' || !isFinite(level)) {
            console.warn('Invalid zoom level provided:', level);
            return;
        }
        
        const clamped = Math.max(0.1, Math.min(level, 3));
        this.viewport = { ...this.viewport, zoom: clamped };
        this.emit('viewportUpdate', this.viewport);
    }
}
