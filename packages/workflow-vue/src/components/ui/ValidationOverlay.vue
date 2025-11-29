<script setup lang="ts">
import { WorkflowEditor } from '@or3/workflow-core';

defineProps<{
  editor: WorkflowEditor;
}>();

// We need to reactively re-validate when nodes/edges change
// For now, we'll just expose a validation result computed property if we had reactive state
// But since validateWorkflow is a function, we should call it on updates.

// TODO: Implement reactive validation overlay
</script>

<template>
  <div class="validation-overlay">
    <!-- Placeholder -->
  </div>
</template>
