import type {
  StorageAdapter,
  WorkflowData,
  WorkflowSummary,
} from './types';
import { WorkflowDataSchema, SCHEMA_VERSION, generateWorkflowId, isVersionCompatible } from './types';

// ============================================================================
// Constants
// ============================================================================

/** Default storage key prefix for localStorage */
const DEFAULT_STORAGE_KEY = 'or3-workflow';

/** Autosave storage key */
const AUTOSAVE_KEY = 'or3-workflow-autosave';

// ============================================================================
// LocalStorageAdapter
// ============================================================================

/**
 * Storage adapter that persists workflows to browser localStorage.
 * Suitable for development and single-user applications.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private storageKey: string;

  constructor(storageKey: string = DEFAULT_STORAGE_KEY) {
    this.storageKey = storageKey;
  }

  /**
   * Load a workflow by ID.
   * @throws Error if workflow not found or version incompatible
   */
  async load(id: string): Promise<WorkflowData> {
    const stored = this.getStoredWorkflows();
    const workflow = stored[id];
    
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }

    // Check version compatibility
    if (workflow.meta?.version && !isVersionCompatible(workflow.meta.version)) {
      console.warn(
        `Workflow "${id}" has version ${workflow.meta.version} which may be incompatible ` +
        `with current schema version ${SCHEMA_VERSION}. Loading anyway.`
      );
    }

    // Validate the loaded data
    return WorkflowDataSchema.parse(workflow) as WorkflowData;
  }

  /**
   * Save a workflow, returns the ID.
   */
  async save(workflow: WorkflowData): Promise<string> {
    // Validate before saving
    const validated = WorkflowDataSchema.parse(workflow) as WorkflowData;
    
    // Generate ID from workflow name
    const id = generateWorkflowId(validated.meta.name);
    
    // Update timestamps
    const now = new Date().toISOString();
    const workflowToSave: WorkflowData = {
      ...validated,
      meta: {
        ...validated.meta,
        updatedAt: now,
        createdAt: validated.meta.createdAt || now,
      },
    };

    // Get existing workflows and add/update
    const stored = this.getStoredWorkflows();
    stored[id] = workflowToSave;
    
    this.setStoredWorkflows(stored);
    return id;
  }

  /**
   * Delete a workflow by ID.
   */
  async delete(id: string): Promise<void> {
    const stored = this.getStoredWorkflows();
    delete stored[id];
    this.setStoredWorkflows(stored);
  }

  /**
   * List all saved workflows.
   */
  async list(): Promise<WorkflowSummary[]> {
    const stored = this.getStoredWorkflows();
    
    return Object.entries(stored).map(([id, workflow]) => ({
      id,
      name: workflow.meta.name,
      description: workflow.meta.description,
      createdAt: workflow.meta.createdAt || new Date().toISOString(),
      updatedAt: workflow.meta.updatedAt || new Date().toISOString(),
      nodeCount: workflow.nodes.length,
    }));
  }

  /**
   * Export workflow to JSON string.
   */
  export(workflow: WorkflowData): string {
    const validated = WorkflowDataSchema.parse(workflow) as WorkflowData;
    return JSON.stringify({
      ...validated,
      meta: {
        ...validated.meta,
        exportedAt: new Date().toISOString(),
      },
    }, null, 2);
  }

  /**
   * Import workflow from JSON string.
   */
  import(json: string): WorkflowData {
    try {
      const data = JSON.parse(json);
      
      // Handle legacy format (v1)
      if (data.nodes && data.edges && !data.meta) {
        return {
          meta: {
            version: SCHEMA_VERSION,
            name: data.name || 'Imported Workflow',
            description: data.description,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          nodes: data.nodes,
          edges: data.edges,
        };
      }

      return WorkflowDataSchema.parse(data) as WorkflowData;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON format');
      }
      throw error;
    }
  }

  // ==========================================================================
  // Autosave Support
  // ==========================================================================

  /**
   * Save current state for autosave recovery.
   */
  autosave(workflow: WorkflowData): void {
    try {
      const data = {
        workflow,
        timestamp: Date.now(),
      };
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Autosave failed:', error);
    }
  }

  /**
   * Load autosaved state.
   */
  loadAutosave(): WorkflowData | null {
    try {
      const stored = localStorage.getItem(AUTOSAVE_KEY);
      if (!stored) return null;

      const data = JSON.parse(stored);
      return WorkflowDataSchema.parse(data.workflow) as WorkflowData;
    } catch (error) {
      console.error('Failed to load autosave:', error);
      return null;
    }
  }

  /**
   * Clear autosaved state.
   */
  clearAutosave(): void {
    localStorage.removeItem(AUTOSAVE_KEY);
  }

  /**
   * Check if autosave exists.
   */
  hasAutosave(): boolean {
    return localStorage.getItem(AUTOSAVE_KEY) !== null;
  }

  /**
   * Get autosave timestamp.
   */
  getAutosaveTimestamp(): number | null {
    try {
      const stored = localStorage.getItem(AUTOSAVE_KEY);
      if (!stored) return null;
      const data = JSON.parse(stored);
      return data.timestamp || null;
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Get all stored workflows from localStorage.
   */
  private getStoredWorkflows(): Record<string, WorkflowData> {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) return {};
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to load workflows from localStorage:', error);
      return {};
    }
  }

  /**
   * Save all workflows to localStorage.
   */
  private setStoredWorkflows(workflows: Record<string, WorkflowData>): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(workflows));
    } catch (error) {
      console.error('Failed to save workflows to localStorage:', error);
      throw new Error('Failed to save workflow: storage quota exceeded or unavailable');
    }
  }

}

// ============================================================================
// IndexedDBAdapter (Optional - for larger workflows)
// ============================================================================

/**
 * Storage adapter that uses IndexedDB for larger workflow storage.
 * Provides better performance for workflows with many nodes.
 */
export class IndexedDBAdapter implements StorageAdapter {
  private dbName: string;
  private storeName: string;
  private db: IDBDatabase | null = null;

  constructor(dbName: string = 'or3-workflows', storeName: string = 'workflows') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  /**
   * Initialize the database connection.
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(new Error('Failed to open IndexedDB'));

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  /**
   * Load a workflow by ID.
   * @throws Error if workflow not found or version incompatible
   */
  async load(id: string): Promise<WorkflowData> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(id);

      request.onerror = () => reject(new Error(`Failed to load workflow: ${id}`));
      request.onsuccess = () => {
        if (!request.result) {
          reject(new Error(`Workflow not found: ${id}`));
          return;
        }
        const workflow = request.result.data;
        
        // Check version compatibility
        if (workflow.meta?.version && !isVersionCompatible(workflow.meta.version)) {
          console.warn(
            `Workflow "${id}" has version ${workflow.meta.version} which may be incompatible ` +
            `with current schema version ${SCHEMA_VERSION}. Loading anyway.`
          );
        }
        
        resolve(WorkflowDataSchema.parse(workflow) as WorkflowData);
      };
    });
  }

  /**
   * Save a workflow, returns the ID.
   */
  async save(workflow: WorkflowData): Promise<string> {
    const db = await this.getDB();
    const validated = WorkflowDataSchema.parse(workflow) as WorkflowData;
    
    const id = generateWorkflowId(validated.meta.name);
    const now = new Date().toISOString();

    const record = {
      id,
      data: {
        ...validated,
        meta: {
          ...validated.meta,
          updatedAt: now,
          createdAt: validated.meta.createdAt || now,
        },
      },
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(record);

      request.onerror = () => reject(new Error('Failed to save workflow'));
      request.onsuccess = () => resolve(id);
    });
  }

  /**
   * Delete a workflow by ID.
   */
  async delete(id: string): Promise<void> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(id);

      request.onerror = () => reject(new Error(`Failed to delete workflow: ${id}`));
      request.onsuccess = () => resolve();
    });
  }

  /**
   * List all saved workflows.
   */
  async list(): Promise<WorkflowSummary[]> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => reject(new Error('Failed to list workflows'));
      request.onsuccess = () => {
        const summaries = request.result.map((record: { id: string; data: WorkflowData }) => ({
          id: record.id,
          name: record.data.meta.name,
          description: record.data.meta.description,
          createdAt: record.data.meta.createdAt || new Date().toISOString(),
          updatedAt: record.data.meta.updatedAt || new Date().toISOString(),
          nodeCount: record.data.nodes.length,
        }));
        resolve(summaries);
      };
    });
  }

  /**
   * Export workflow to JSON string.
   */
  export(workflow: WorkflowData): string {
    const validated = WorkflowDataSchema.parse(workflow) as WorkflowData;
    return JSON.stringify({
      ...validated,
      meta: {
        ...validated.meta,
        exportedAt: new Date().toISOString(),
      },
    }, null, 2);
  }

  /**
   * Import workflow from JSON string.
   */
  import(json: string): WorkflowData {
    try {
      const data = JSON.parse(json);
      
      // Handle legacy format
      if (data.nodes && data.edges && !data.meta) {
        return {
          meta: {
            version: SCHEMA_VERSION,
            name: data.name || 'Imported Workflow',
            description: data.description,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          nodes: data.nodes,
          edges: data.edges,
        };
      }

      return WorkflowDataSchema.parse(data) as WorkflowData;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error('Invalid JSON format');
      }
      throw error;
    }
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
