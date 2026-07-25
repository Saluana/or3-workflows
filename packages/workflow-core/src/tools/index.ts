/**
 * Typed tools and policy (R5).
 *
 * @module tools
 */
export type {
    ToolAuthority,
    ToolSideEffect,
    ToolApproval,
    ToolDescriptor,
    ToolExecutionContext,
    WorkflowTool,
    ToolExecutionPolicy,
    ToolCallDisposition,
    ToolCallPlan,
    ToolBatchPlan,
    ToolReceipt,
    ToolCallOutcome,
} from './types';
export { DEFAULT_TOOL_POLICY } from './types';
export {
    decideDisposition,
    planToolBatch,
    type ToolCallInput,
} from './policy';
export {
    adaptExecutableTool,
    adaptRegisteredTool,
    providerServerTool,
    toModelToolDescriptor,
    type LegacyAdapterOptions,
} from './adapters';
export { WorkflowToolRegistry } from './registry';
export {
    executeToolBatch,
    type ToolReceiptStore,
    type ToolApprovalGate,
    type ToolBatchCall,
    type ExecuteToolBatchOptions,
} from './executor';
