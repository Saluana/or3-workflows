# Fix: Loop Node and Parallel Branch Collapsible Rendering

## Problem Statement

When a workflow contained a loop node with a parallel node (with merge enabled) inside it, the chat UI would not properly display collapsibles after the second iteration. The UI would display content as plain lines instead of the expected collapsible components.

## Root Cause

The issue was in the branch tracking logic in `demo-v2/src/App.vue`. The code manages live streaming of parallel branches using a `branchStreams` reactive object, and tracks execution instances using a `parallelExecutionCounter` to generate unique keys for each loop iteration.

Three interconnected issues caused the bug:

### 1. Merge Branches Interfered with Execution Counter

When a parallel node started, the code checked if there were existing branches with the same `nodeId` to determine if it was a "new execution" (e.g., a new loop iteration). If no existing branches were found, it would increment the execution counter.

However, merge branches (with `branchId === '__merge__'`) were not excluded from this check. Since merge branches start AFTER regular branches complete, they could still be present when a new iteration started, preventing the counter from incrementing properly.

**Example scenario:**
- Iteration 1: Regular branches complete → Merge starts → Still streaming
- Iteration 2 starts: Finds existing merge branch → Doesn't increment counter
- Result: Branch keys collide, UI breaks

### 2. Premature Branch Clearing

When the last regular branch completed, the code would:
1. Check if all branches were complete
2. Create a message with branch contents
3. Clear ALL branches for that node

But the merge phase starts AFTER regular branches complete. This meant:
- Regular branches complete and ALL branches get cleared (lines instead of collapsibles)
- OR merge branch hasn't started yet but gets scheduled for clearing

### 3. Duplicate Message Creation

When a merge branch completed, it would go through the same completion logic as regular branches, attempting to create a branches message even though one was already created when regular branches completed.

## Solution

The fix involved three key changes to `demo-v2/src/App.vue`:

### 1. Extract Merge Branch Constant

```typescript
// Constant for merge branch identifier
const MERGE_BRANCH_ID = '__merge__';
```

This replaces the magic string `'__merge__'` throughout the code for better maintainability.

### 2. Exclude Merge Branches from Execution Counter

In `onBranchStart`:

```typescript
// Check if this is a new execution (first branch of a new batch)
// Exclude merge branches from this check
const existingBranches = Object.keys(branchStreams.value).filter(
    (k) =>
        branchStreams.value[k].nodeId === nodeId &&
        branchStreams.value[k].branchId !== MERGE_BRANCH_ID
);

// Only increment counter for non-merge branches starting a new execution
if (branchId !== MERGE_BRANCH_ID && existingBranches.length === 0) {
    parallelExecutionCounter.value[nodeId]++;
}
```

### 3. Separate Merge Branch Completion Handling

In `onBranchComplete`:

```typescript
// Handle merge branch completion separately
if (branchId === MERGE_BRANCH_ID) {
    // Merge branch completes after regular branches
    // Just clear the merge branch from streams
    branchStreams.value = Object.fromEntries(
        Object.entries(branchStreams.value).filter(
            ([, v]) => !(v.nodeId === nodeId && v.branchId === MERGE_BRANCH_ID)
        )
    );
    return; // Don't proceed with regular branch completion logic
}

// Check if all NON-MERGE branches for this node are completed
const nodeBranches = Object.values(branchStreams.value).filter(
    (b) => b.nodeId === nodeId && b.branchId !== MERGE_BRANCH_ID
);

// ... rest of completion logic
```

### 4. Performance Optimization

When clearing regular branches, use a Set for O(1) lookup instead of O(n²) array includes:

```typescript
const keysToDeleteSet = new Set(
    Object.keys(branchStreams.value).filter(
        (k) =>
            branchStreams.value[k].nodeId === nodeId &&
            branchStreams.value[k].branchId !== MERGE_BRANCH_ID
    )
);

branchStreams.value = Object.fromEntries(
    Object.entries(branchStreams.value).filter(
        ([k]) => !keysToDeleteSet.has(k)
    )
);
```

## Execution Flow

The corrected execution flow for a parallel node with merge enabled is:

1. **Regular Branches Execute**
   - All regular branches start in parallel
   - Each calls: `onBranchStart` → `onBranchToken` → `onBranchComplete`

2. **Regular Branches Complete**
   - When the last regular branch completes:
   - Create a message with branch contents
   - Clear only regular branches from streams
   - Leave merge branch (if any) in streams

3. **Merge Phase Starts**
   - After all regular branches complete
   - Calls: `onBranchStart(MERGE_BRANCH_ID)`
   - Merge branch is added to streams

4. **Merge Completes**
   - Calls: `onBranchComplete(MERGE_BRANCH_ID)`
   - Only clear the merge branch itself
   - No message creation (already done)

## Testing

- All existing tests pass (477 tests in workflow-core)
- TypeScript compilation successful
- Code review completed with feedback addressed
- Security check passed (CodeQL)

## Benefits

1. **Correct UI Rendering**: Collapsibles display properly across all loop iterations
2. **Unique Branch Keys**: Each loop iteration gets unique branch keys
3. **No Interference**: Merge branches don't interfere with execution tracking
4. **Maintainable**: Magic strings replaced with constants
5. **Performant**: O(1) lookups instead of O(n²)

## Related Files

- `demo-v2/src/App.vue` - Main fix location
- `packages/workflow-core/src/extensions/ParallelNodeExtension.ts` - Parallel node execution logic
- `packages/workflow-core/src/extensions/WhileLoopExtension.ts` - Loop iteration logic
- `demo-v2/src/components/ChatPanel.vue` - UI rendering of collapsibles
