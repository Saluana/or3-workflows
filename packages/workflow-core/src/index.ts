// Core types and schemas
export {
    SCHEMA_VERSION,
    type WorkflowData,
    type WorkflowNode,
    type WorkflowEdge,
    type NodeData,
    type AgentNodeData,
    type RouterNodeData,
    type ParallelNodeData,
    type ToolNodeData,
    type MemoryNodeData,
    type WhileLoopNodeData,
    type LoopState,
    type StartNodeData,
    type ExecutionInput,
    type ExecutionResult,
    type ExecutionCallbacks,
    type ExecutionOptions,
    type ChatMessage,
    type NodeStatus,
    type Extension,
    type NodeExtension,
    type PortDefinition,
    type StorageAdapter,
    type WorkflowSummary,
    // Type guards
    isAgentNodeData,
    isRouterNodeData,
    isParallelNodeData,
    isToolNodeData,
    isMemoryNodeData,
    isWhileLoopNodeData,
    isSubflowNodeData,
    isStartNodeData,
    // Utility functions
    generateWorkflowId,
    isVersionCompatible,
    parseVersion,
} from './types';
export {
    type MemoryAdapter,
    type MemoryEntry,
    type MemoryQuery,
    InMemoryAdapter,
} from './memory';
export { type Session, ExecutionSession } from './session';
export {
    type NodeRetryConfig,
    type ExecutionError,
    type ErrorHandlingMode,
    type NodeErrorConfig,
} from './errors';

// Human-in-the-Loop (HITL)
export {
    type HITLMode,
    type HITLAction,
    type HITLConfig,
    type HITLRequest,
    type HITLResponse,
    type HITLCallback,
    isHITLMode,
    isHITLConfig,
    isHITLRequest,
    isHITLResponse,
    generateHITLRequestId,
    createDefaultHITLConfig,
    getDefaultApprovalOptions,
} from './hitl';

// Editor and state management
export {
    createWorkflowEditor,
    WorkflowEditor,
    type EditorOptions,
} from './editor';
export {
    validateWorkflow,
    type ValidationResult,
    type ValidationError,
    type ValidationWarning,
} from './validation';

// Execution adapters
export { type ExecutionAdapter } from './types';
export { OpenRouterExecutionAdapter } from './execution';

// Subflows
export {
    type SubflowPortType,
    type SubflowInput,
    type SubflowOutput,
    type SubflowDefinition,
    type SubflowNodeData,
    type SubflowRegistry,
    DefaultSubflowRegistry,
    isSubflowInput,
    isSubflowOutput,
    isSubflowDefinition,
    createSubflowDefinition,
    validateInputMappings,
} from './subflow';

// Storage adapters
export { LocalStorageAdapter, IndexedDBAdapter } from './storage';

// Standard node extensions
export {
    StartNodeExtension,
    AgentNodeExtension,
    RouterNodeExtension,
    ParallelNodeExtension,
    ToolNodeExtension,
    ToolRegistry,
    toolRegistry,
    type RegisteredTool,
    MemoryNodeExtension,
    WhileLoopExtension,
    SubflowExtension,
    getSubflowPorts,
    createDefaultInputMappings,
    OutputNodeExtension,
    type OutputNodeData,
    type OutputFormat,
    isOutputNodeData,
    interpolateTemplate,
    formatOutput,
    extractTemplatePlaceholders,
    // Extension configuration utilities
    createConfigurableExtension,
    makeConfigurable,
    isConfigurableExtension,
    type ConfigurableExtension,
    type ExtensionConfig,
    type ExtensionOptions,
    // StarterKit
    StarterKit,
    type StarterKitOptions,
    type StarterKitConfig,
    type SubflowOptions,
    type WhileLoopOptions,
    type AgentOptions,
} from './extensions';

// Context Compaction
export {
    type CompactionStrategy,
    type CompactionConfig,
    type CompactionResult,
    type TokenCounter,
    ApproximateTokenCounter,
    DEFAULT_COMPACTION_CONFIG,
    DEFAULT_SUMMARIZE_PROMPT,
    MODEL_CONTEXT_LIMITS,
    countMessageTokens,
    formatMessagesForSummary,
    calculateThreshold,
    splitMessagesForCompaction,
    createSummaryMessage,
    buildSummarizationPrompt,
    isCompactionConfig,
} from './compaction';
