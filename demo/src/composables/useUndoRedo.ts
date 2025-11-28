import { ref, computed } from 'vue'
import type { Node, Edge } from '@vue-flow/core'

interface HistoryState {
  nodes: Node[]
  edges: Edge[]
  timestamp: number
}

const MAX_HISTORY = 50

export function useUndoRedo() {
  const history = ref<HistoryState[]>([])
  const currentIndex = ref(-1)
  const isUndoing = ref(false)

  const canUndo = computed(() => currentIndex.value > 0)
  const canRedo = computed(() => currentIndex.value < history.value.length - 1)

  // Deep clone nodes and edges
  function cloneState(nodes: Node[], edges: Edge[]): HistoryState {
    return {
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
      timestamp: Date.now(),
    }
  }

  // Push a new state to history
  function pushState(nodes: Node[], edges: Edge[]) {
    // Don't record if we're in the middle of undo/redo
    if (isUndoing.value) return

    // Remove any future states if we're not at the end
    if (currentIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, currentIndex.value + 1)
    }

    // Add new state
    history.value.push(cloneState(nodes, edges))
    currentIndex.value = history.value.length - 1

    // Limit history size
    if (history.value.length > MAX_HISTORY) {
      history.value.shift()
      currentIndex.value--
    }
  }

  // Initialize with current state
  function initialize(nodes: Node[], edges: Edge[]) {
    history.value = [cloneState(nodes, edges)]
    currentIndex.value = 0
  }

  // Undo to previous state
  function undo(): HistoryState | null {
    if (!canUndo.value) return null

    isUndoing.value = true
    currentIndex.value--
    const state = history.value[currentIndex.value]
    
    // Reset flag after a tick
    setTimeout(() => {
      isUndoing.value = false
    }, 0)

    return state ? cloneState(state.nodes, state.edges) : null
  }

  // Redo to next state
  function redo(): HistoryState | null {
    if (!canRedo.value) return null

    isUndoing.value = true
    currentIndex.value++
    const state = history.value[currentIndex.value]
    
    // Reset flag after a tick
    setTimeout(() => {
      isUndoing.value = false
    }, 0)

    return state ? cloneState(state.nodes, state.edges) : null
  }

  // Clear history
  function clear() {
    history.value = []
    currentIndex.value = -1
  }

  return {
    canUndo,
    canRedo,
    pushState,
    initialize,
    undo,
    redo,
    clear,
    historyLength: computed(() => history.value.length),
    currentIndex: computed(() => currentIndex.value),
  }
}
