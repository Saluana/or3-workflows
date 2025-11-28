import { WorkflowNode, WorkflowEdge } from './types';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  type: 'error';
  code: ValidationErrorCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export interface ValidationWarning {
  type: 'warning';
  code: ValidationWarningCode;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export type ValidationErrorCode =
  | 'NO_START_NODE'
  | 'MULTIPLE_START_NODES'
  | 'DISCONNECTED_NODE'
  | 'CYCLE_DETECTED'
  | 'MISSING_REQUIRED_PORT'
  | 'INVALID_CONNECTION'
  | 'MISSING_MODEL'
  | 'MISSING_PROMPT';

export type ValidationWarningCode =
  | 'EMPTY_PROMPT'
  | 'UNREACHABLE_NODE'
  | 'DEAD_END_NODE'
  | 'MISSING_EDGE_LABEL';

export function validateWorkflow(nodes: WorkflowNode[], edges: WorkflowEdge[]): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // 1. Check Start Node
  const startNodes = nodes.filter(n => n.type === 'start');
  if (startNodes.length === 0) {
    errors.push({ type: 'error', code: 'NO_START_NODE', message: 'Workflow must have a start node' });
  } else if (startNodes.length > 1) {
    errors.push({ type: 'error', code: 'MULTIPLE_START_NODES', message: 'Workflow can only have one start node' });
  }

  // 2. Check Disconnected Nodes (Reachability)
  if (startNodes.length === 1) {
    const visited = new Set<string>();
    const queue = [startNodes[0].id];
    visited.add(startNodes[0].id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const outgoingEdges = edges.filter(e => e.source === currentId);
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.target)) {
          visited.add(edge.target);
          queue.push(edge.target);
        }
      }
    }

    nodes.forEach(node => {
      if (!visited.has(node.id)) {
        errors.push({ type: 'error', code: 'DISCONNECTED_NODE', message: 'Node is not reachable from start', nodeId: node.id });
      }
    });
  }

  // 3. Cycle Detection
  // TODO: Implement simple DFS cycle check

  // 4. Node Specific Checks
  nodes.forEach(node => {
    // Agent Node Checks
    if (node.type === 'agent') {
      const data = node.data as any; // Cast to access specific props
      if (!data.model) {
        errors.push({ type: 'error', code: 'MISSING_MODEL', message: 'Agent node missing model', nodeId: node.id });
      }
      if (!data.prompt) {
        warnings.push({ type: 'warning', code: 'EMPTY_PROMPT', message: 'Agent node has empty prompt', nodeId: node.id });
      }
    }

    // Dead End Check (except terminal nodes if we had them, but for now all should output or be end)
    // Actually, maybe we don't enforce dead end for all nodes, but let's warn if a node has no outgoing edges and is not an explicit "end" node (if we had one).
    // For now, just warn if it's not a start node and has no outputs? No, start node has outputs.
    // Let's skip dead end check for now or make it smarter.
  });

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
