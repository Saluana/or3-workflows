import { WorkflowData, WorkflowNode, WorkflowEdge, Extension, Command, WorkflowDataSchema } from './types';
import { HistoryManager } from './history';
import { CommandManager } from './commands';

export interface EditorOptions {
  extensions?: Extension[];
  content?: WorkflowData;
  onUpdate?: (props: { editor: WorkflowEditor }) => void;
  onSelectionUpdate?: (props: { editor: WorkflowEditor }) => void;
}

export class WorkflowEditor {
  public nodes: WorkflowNode[] = [];
  public edges: WorkflowEdge[] = [];
  public extensions: Map<string, Extension> = new Map();
  public extensionCommands: Record<string, Command> = {};
  
  private listeners: Map<string, Function[]> = new Map();

  public history: HistoryManager;
  public commands: CommandManager;

  constructor(options: EditorOptions = {}) {
    this.history = new HistoryManager();
    this.commands = new CommandManager(this);
    
    if (options.extensions) {
      options.extensions.forEach(ext => this.registerExtension(ext));
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

  public load(content: WorkflowData) {
    try {
      const parsed = WorkflowDataSchema.parse(content);
      this.nodes = parsed.nodes as WorkflowNode[];
      this.edges = parsed.edges;
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

  public getJSON(): WorkflowData {
    return {
      meta: {
        version: '2.0.0',
        name: 'Untitled', // TODO: Manage meta
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
      nodes: this.nodes.filter(n => n.selected).map(n => n.id),
      edges: this.edges.filter(e => e.selected).map(e => e.id),
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
      this.listeners.set(event, callbacks.filter(cb => cb !== callback));
    }
  }

  public emit(event: string, ...args: any[]) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(...args));
    }
  }

  public destroy() {
    this.extensions.forEach(ext => {
      if (ext.onDestroy) ext.onDestroy();
    });
    this.listeners.clear();
    this.nodes = [];
    this.edges = [];
  }
}
