import type {
  NodeExtension,
  WorkflowNode,
  WorkflowEdge,
  ExecutionContext,
} from '../types';
import type { ValidationError } from '../validation';

/**
 * Start Node Extension
 * 
 * The entry point for workflow execution. Every workflow must have exactly one start node.
 * It passes the user input through to connected nodes.
 */
export const StartNodeExtension: NodeExtension = {
  name: 'start',
  type: 'node',

  // Port definitions
  inputs: [],
  outputs: [
    {
      id: 'output',
      type: 'output',
      label: 'Output',
      dataType: 'any',
      multiple: true,
    },
  ],

  // Default data for new nodes
  defaultData: {
    label: 'Start',
  },

  /**
   * Execute the start node.
   * Simply passes through the input to connected nodes.
   */
  async execute(context: ExecutionContext): Promise<{ output: string; nextNodes: string[] }> {
    // Start node just passes through the input
    return {
      output: context.input,
      nextNodes: [], // Will be populated by the executor
    };
  },

  /**
   * Validate the start node.
   * Ensures only one start node exists in the workflow.
   */
  validate(node: WorkflowNode, edges: WorkflowEdge[], allNodes?: WorkflowNode[]): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check if there are multiple start nodes (if allNodes provided)
    if (allNodes) {
      const startNodes = allNodes.filter(n => n.type === 'start');
      if (startNodes.length > 1) {
        errors.push({
          type: 'error',
          code: 'MULTIPLE_START_NODES',
          message: 'Workflow can only have one start node',
          nodeId: node.id,
        });
      }
    }

    // Check if start node has at least one outgoing edge
    const outgoingEdges = edges.filter(e => e.source === node.id);
    if (outgoingEdges.length === 0) {
      errors.push({
        type: 'error',
        code: 'DISCONNECTED_NODE',
        message: 'Start node must have at least one outgoing connection',
        nodeId: node.id,
      });
    }

    return errors;
  },
};
