import { WorkflowEditor } from './editor';
import { WorkflowNode, WorkflowEdge, NodeData } from './types';

export class CommandManager {
  private editor: WorkflowEditor;

  constructor(editor: WorkflowEditor) {
    this.editor = editor;
  }

  // Node operations
  public createNode(type: string, data: any = {}, position = { x: 0, y: 0 }): boolean {
    const id = crypto.randomUUID();
    const node: WorkflowNode = {
      id,
      type,
      position,
      data,
    };
    
    this.editor.nodes = [...this.editor.nodes, node];
    this.pushHistory();
    this.editor.emit('nodeCreate', node);
    this.editor.emit('update');
    return true;
  }

  public deleteNode(id: string): boolean {
    const index = this.editor.nodes.findIndex(n => n.id === id);
    if (index === -1) return false;

    const node = this.editor.nodes[index];
    this.editor.nodes = this.editor.nodes.filter(n => n.id !== id);
    // Also delete connected edges
    this.editor.edges = this.editor.edges.filter(e => e.source !== id && e.target !== id);
    
    this.pushHistory();
    this.editor.emit('nodeDelete', node);
    this.editor.emit('update');
    return true;
  }

  public updateNodeData(id: string, data: Partial<NodeData>): boolean {
    const node = this.editor.nodes.find(n => n.id === id);
    if (!node) return false;

    node.data = { ...node.data, ...data };
    this.pushHistory();
    this.editor.emit('nodeUpdate', node);
    this.editor.emit('update');
    return true;
  }

  public duplicateNode(id: string): boolean {
    const node = this.editor.nodes.find(n => n.id === id);
    if (!node) return false;

    const newNode: WorkflowNode = {
      ...node,
      id: crypto.randomUUID(),
      position: { x: node.position.x + 20, y: node.position.y + 20 },
      data: { ...node.data }, // Deep copy if needed, shallow for now
      selected: false,
    };

    this.editor.nodes = [...this.editor.nodes, newNode];
    this.pushHistory();
    this.editor.emit('nodeCreate', newNode);
    this.editor.emit('update');
    return true;
  }

  public setNodePosition(id: string, position: { x: number; y: number }): boolean {
    const node = this.editor.nodes.find(n => n.id === id);
    if (!node) return false;

    node.position = position;
    this.pushHistory();
    this.editor.emit('nodeUpdate', node);
    this.editor.emit('update');
    return true;
  }

  // Edge operations
  public createEdge(source: string, target: string, sourceHandle?: string, targetHandle?: string): boolean {
    const id = crypto.randomUUID();
    const edge: WorkflowEdge = {
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
    };

    this.editor.edges = [...this.editor.edges, edge];
    this.pushHistory();
    this.editor.emit('edgeCreate', edge);
    this.editor.emit('update');
    return true;
  }

  public deleteEdge(id: string): boolean {
    const index = this.editor.edges.findIndex(e => e.id === id);
    if (index === -1) return false;

    const edge = this.editor.edges[index];
    this.editor.edges = this.editor.edges.filter(e => e.id !== id);
    
    this.pushHistory();
    this.editor.emit('edgeDelete', edge);
    this.editor.emit('update');
    return true;
  }

  // Selection
  public selectNode(id: string, additive = false): boolean {
    if (!additive) {
      this.editor.nodes.forEach(n => n.selected = false);
    }
    const node = this.editor.nodes.find(n => n.id === id);
    if (node) {
      node.selected = true;
      this.editor.emit('selectionUpdate');
      return true;
    }
    return false;
  }

  public deselectAll(): boolean {
    this.editor.nodes.forEach(n => n.selected = false);
    this.editor.emit('selectionUpdate');
    return true;
  }

  // Viewport (Placeholder - usually handled by renderer, but state can be here)
  public zoomTo(_level: number): boolean {
    // TODO: Implement if we store viewport state in core
    return true;
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

  private pushHistory() {
    this.editor.history.push({
      nodes: JSON.parse(JSON.stringify(this.editor.nodes)),
      edges: JSON.parse(JSON.stringify(this.editor.edges)),
    });
  }
}
