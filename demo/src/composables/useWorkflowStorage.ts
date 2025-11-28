import { ref } from 'vue'
import type { Node, Edge } from '@vue-flow/core'

const STORAGE_KEY = 'or3-workflow-saved'
const AUTOSAVE_KEY = 'or3-workflow-autosave'

export interface SavedWorkflow {
  id: string
  name: string
  description?: string
  nodes: Node[]
  edges: Edge[]
  createdAt: string
  updatedAt: string
}

export function useWorkflowStorage() {
  const savedWorkflows = ref<SavedWorkflow[]>([])
  const currentWorkflowId = ref<string | null>(null)
  const hasUnsavedChanges = ref(false)

  // Load saved workflows from localStorage
  function loadSavedWorkflows() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        savedWorkflows.value = JSON.parse(stored)
      }
    } catch (e) {
      console.error('Failed to load saved workflows:', e)
    }
  }

  // Save workflows to localStorage
  function persistWorkflows() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedWorkflows.value))
    } catch (e) {
      console.error('Failed to save workflows:', e)
    }
  }

  // Save current workflow
  function saveWorkflow(
    name: string,
    nodes: Node[],
    edges: Edge[],
    description?: string
  ): SavedWorkflow {
    const now = new Date().toISOString()
    
    // Check if updating existing workflow
    const existingIndex = savedWorkflows.value.findIndex(w => w.id === currentWorkflowId.value)
    
    if (existingIndex >= 0) {
      // Update existing
      const updated: SavedWorkflow = {
        ...savedWorkflows.value[existingIndex]!,
        name,
        description,
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        updatedAt: now,
      }
      savedWorkflows.value[existingIndex] = updated
      persistWorkflows()
      hasUnsavedChanges.value = false
      return updated
    } else {
      // Create new
      const workflow: SavedWorkflow = {
        id: crypto.randomUUID(),
        name,
        description,
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        createdAt: now,
        updatedAt: now,
      }
      savedWorkflows.value.push(workflow)
      currentWorkflowId.value = workflow.id
      persistWorkflows()
      hasUnsavedChanges.value = false
      return workflow
    }
  }

  // Load a workflow
  function loadWorkflow(id: string): SavedWorkflow | null {
    const workflow = savedWorkflows.value.find(w => w.id === id)
    if (workflow) {
      currentWorkflowId.value = id
      hasUnsavedChanges.value = false
      return JSON.parse(JSON.stringify(workflow))
    }
    return null
  }

  // Delete a workflow
  function deleteWorkflow(id: string) {
    savedWorkflows.value = savedWorkflows.value.filter(w => w.id !== id)
    if (currentWorkflowId.value === id) {
      currentWorkflowId.value = null
    }
    persistWorkflows()
  }

  // Export workflow to JSON file
  function exportWorkflow(nodes: Node[], edges: Edge[], name: string) {
    const workflow = {
      name,
      version: '1.0',
      exportedAt: new Date().toISOString(),
      nodes,
      edges,
    }
    
    const blob = new Blob([JSON.stringify(workflow, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${name.replace(/\s+/g, '-').toLowerCase()}-workflow.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Import workflow from JSON file
  function importWorkflow(file: File): Promise<{ nodes: Node[]; edges: Edge[]; name: string }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string
          const data = JSON.parse(content)
          
          if (!data.nodes || !data.edges) {
            throw new Error('Invalid workflow file format')
          }
          
          resolve({
            nodes: data.nodes,
            edges: data.edges,
            name: data.name || 'Imported Workflow',
          })
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }

  // Autosave current state
  function autosave(nodes: Node[], edges: Edge[]) {
    try {
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ nodes, edges, timestamp: Date.now() }))
    } catch (e) {
      console.error('Autosave failed:', e)
    }
  }

  // Load autosaved state
  function loadAutosave(): { nodes: Node[]; edges: Edge[] } | null {
    try {
      const stored = localStorage.getItem(AUTOSAVE_KEY)
      if (stored) {
        const data = JSON.parse(stored)
        return { nodes: data.nodes, edges: data.edges }
      }
    } catch (e) {
      console.error('Failed to load autosave:', e)
    }
    return null
  }

  // Clear autosave
  function clearAutosave() {
    localStorage.removeItem(AUTOSAVE_KEY)
  }

  // Initialize
  loadSavedWorkflows()

  return {
    savedWorkflows,
    currentWorkflowId,
    hasUnsavedChanges,
    saveWorkflow,
    loadWorkflow,
    deleteWorkflow,
    exportWorkflow,
    importWorkflow,
    autosave,
    loadAutosave,
    clearAutosave,
  }
}
