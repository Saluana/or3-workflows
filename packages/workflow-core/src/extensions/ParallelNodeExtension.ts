import type {
  NodeExtension,
  WorkflowNode,
  WorkflowEdge,
  ExecutionContext,
  ParallelNodeData,
  BranchDefinition,
} from '../types';
import type { ValidationError, ValidationWarning } from '../validation';

/**
 * Parallel Node Extension
 * 
 * Executes multiple branches concurrently and optionally merges the results.
 * Each branch can have its own model and prompt configuration.
 */
export const ParallelNodeExtension: NodeExtension = {
  name: 'parallel',
  type: 'node',

  // Port definitions - outputs are dynamic based on branches
  inputs: [
    {
      id: 'input',
      type: 'input',
      label: 'Input',
      dataType: 'any',
      required: true,
    },
  ],
  outputs: [
    // Dynamic outputs based on branches - these are defaults
    {
      id: 'branch-1',
      type: 'output',
      label: 'Branch 1',
      dataType: 'any',
    },
    {
      id: 'branch-2',
      type: 'output',
      label: 'Branch 2',
      dataType: 'any',
    },
    // Merge output (after all branches complete)
    {
      id: 'merged',
      type: 'output',
      label: 'Merged Output',
      dataType: 'string',
    },
  ],

  // Default data for new nodes
  defaultData: {
    label: 'Parallel',
    model: undefined, // Model for merge step
    prompt: '', // Merge/synthesis prompt
    branches: [
      { id: 'branch-1', label: 'Branch 1' },
      { id: 'branch-2', label: 'Branch 2' },
    ] as BranchDefinition[],
  },

  /**
   * Execute the parallel node.
   * Actual concurrent execution is handled by OpenRouterExecutionAdapter.
   */
  async execute(context: ExecutionContext): Promise<{ output: string; branchOutputs: Record<string, string>; nextNodes: string[] }> {
    const data = context.node.data as ParallelNodeData;
    const branches = data.branches || [];
    throw new Error(
      `ParallelNodeExtension.execute is handled by OpenRouterExecutionAdapter (${branches.length} branches configured). ` +
      'Use the adapter to run workflows instead of calling the extension directly.'
    );
  },

  /**
   * Validate the parallel node.
   */
  validate(node: WorkflowNode, edges: WorkflowEdge[]): (ValidationError | ValidationWarning)[] {
    const errors: (ValidationError | ValidationWarning)[] = [];
    const data = node.data as ParallelNodeData;
    const branches = data.branches || [];

    // Check for at least two branches (parallel needs multiple paths)
    if (branches.length < 2) {
      errors.push({
        type: 'warning',
        code: 'DEAD_END_NODE',
        message: 'Parallel node should have at least two branches for meaningful parallel execution',
        nodeId: node.id,
      });
    }

    // Check for incoming connections
    const incomingEdges = edges.filter(e => e.target === node.id);
    if (incomingEdges.length === 0) {
      errors.push({
        type: 'error',
        code: 'DISCONNECTED_NODE',
        message: 'Parallel node has no incoming connections',
        nodeId: node.id,
      });
    }

    // Check that each branch has an outgoing edge
    const outgoingEdges = edges.filter(e => e.source === node.id);
    branches.forEach((branch: BranchDefinition) => {
      const hasEdge = outgoingEdges.some(e => e.sourceHandle === branch.id);
      if (!hasEdge) {
        errors.push({
          type: 'warning',
          code: 'MISSING_EDGE_LABEL',
          message: `Branch "${branch.label}" has no connected node`,
          nodeId: node.id,
        });
      }
    });

    // Warn if no merge prompt is configured
    if (!data.prompt || data.prompt.trim() === '') {
      errors.push({
        type: 'warning',
        code: 'EMPTY_PROMPT',
        message: 'Parallel node has no merge prompt - outputs will be concatenated',
        nodeId: node.id,
      });
    }

    return errors;
  },

  /**
   * Get dynamic outputs based on branches configuration.
   */
  getDynamicOutputs(node: WorkflowNode): { id: string; label: string }[] {
    const data = node.data as ParallelNodeData;
    const branches = data.branches || [];
    
    return branches.map((branch: BranchDefinition) => ({
      id: branch.id,
      label: branch.label,
    }));
  },
};
