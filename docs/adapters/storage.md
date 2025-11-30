# Storage Adapters

Persist workflows to local storage, IndexedDB, or custom backends.

## Overview

Storage adapters implement the `StorageAdapter` interface to save, load, and list workflows.

## Interface

```typescript
interface StorageAdapter {
    /** Load a workflow by ID */
    load(id: string): Promise<WorkflowData | null>;

    /** Save a workflow, returns ID */
    save(data: WorkflowData, id?: string): Promise<string>;

    /** Delete a workflow */
    delete(id: string): Promise<void>;

    /** List all workflows */
    list(): Promise<WorkflowSummary[]>;

    /** Export workflow as JSON string */
    export(id: string): Promise<string>;

    /** Import workflow from JSON string */
    import(json: string): Promise<string>;
}

interface WorkflowSummary {
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    nodeCount: number;
}
```

## Built-in Adapters

### LocalStorageAdapter

Simple browser localStorage storage:

```typescript
import { LocalStorageAdapter } from '@or3/workflow-core';

const storage = new LocalStorageAdapter();

// Save
const id = await storage.save(workflow);

// Load
const workflow = await storage.load(id);

// List
const workflows = await storage.list();

// Delete
await storage.delete(id);
```

#### Options

```typescript
const storage = new LocalStorageAdapter({
    prefix: 'my-app-', // Key prefix (default: 'or3-workflow-')
});
```

#### Limitations

-   ~5MB storage limit
-   Synchronous underlying API
-   No search/query capabilities
-   Single browser only

#### Autosave

```typescript
// Save autosave
storage.saveAutosave(workflow);

// Load autosave
const autosaved = storage.loadAutosave();

// Clear autosave
storage.clearAutosave();
```

### IndexedDBAdapter

Larger storage with better performance:

```typescript
import { IndexedDBAdapter } from '@or3/workflow-core';

const storage = new IndexedDBAdapter();

// Same API as LocalStorageAdapter
const id = await storage.save(workflow);
const workflow = await storage.load(id);
```

#### Options

```typescript
const storage = new IndexedDBAdapter({
    dbName: 'my-workflows', // Database name
    storeName: 'workflows', // Object store name
});
```

#### Advantages

-   Much larger storage (browser dependent, typically 50MB+)
-   Asynchronous API
-   Better performance for large workflows
-   Structured data storage

## Custom Adapters

### REST API Adapter

```typescript
import type {
    StorageAdapter,
    WorkflowData,
    WorkflowSummary,
} from '@or3/workflow-core';

export class APIStorageAdapter implements StorageAdapter {
    constructor(private baseUrl: string, private token: string) {}

    async load(id: string): Promise<WorkflowData | null> {
        const response = await fetch(`${this.baseUrl}/workflows/${id}`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });

        if (!response.ok) return null;
        return response.json();
    }

    async save(data: WorkflowData, id?: string): Promise<string> {
        const url = id
            ? `${this.baseUrl}/workflows/${id}`
            : `${this.baseUrl}/workflows`;

        const response = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${this.token}`,
            },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        return result.id;
    }

    async delete(id: string): Promise<void> {
        await fetch(`${this.baseUrl}/workflows/${id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${this.token}` },
        });
    }

    async list(): Promise<WorkflowSummary[]> {
        const response = await fetch(`${this.baseUrl}/workflows`, {
            headers: { Authorization: `Bearer ${this.token}` },
        });
        return response.json();
    }

    async export(id: string): Promise<string> {
        const workflow = await this.load(id);
        return JSON.stringify(workflow, null, 2);
    }

    async import(json: string): Promise<string> {
        const data = JSON.parse(json);
        return this.save(data);
    }
}
```

### Supabase Adapter

```typescript
import { createClient } from '@supabase/supabase-js';
import type {
    StorageAdapter,
    WorkflowData,
    WorkflowSummary,
} from '@or3/workflow-core';

export class SupabaseStorageAdapter implements StorageAdapter {
    private client;

    constructor(url: string, key: string) {
        this.client = createClient(url, key);
    }

    async load(id: string): Promise<WorkflowData | null> {
        const { data, error } = await this.client
            .from('workflows')
            .select('data')
            .eq('id', id)
            .single();

        if (error) return null;
        return data.data;
    }

    async save(data: WorkflowData, id?: string): Promise<string> {
        const workflowId = id ?? crypto.randomUUID();
        const now = new Date().toISOString();

        const { error } = await this.client.from('workflows').upsert({
            id: workflowId,
            name: data.meta.name,
            data,
            node_count: data.nodes.length,
            updated_at: now,
            created_at: id ? undefined : now,
        });

        if (error) throw error;
        return workflowId;
    }

    async delete(id: string): Promise<void> {
        await this.client.from('workflows').delete().eq('id', id);
    }

    async list(): Promise<WorkflowSummary[]> {
        const { data } = await this.client
            .from('workflows')
            .select('id, name, created_at, updated_at, node_count')
            .order('updated_at', { ascending: false });

        return (data ?? []).map((row) => ({
            id: row.id,
            name: row.name,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            nodeCount: row.node_count,
        }));
    }

    async export(id: string): Promise<string> {
        const workflow = await this.load(id);
        return JSON.stringify(workflow, null, 2);
    }

    async import(json: string): Promise<string> {
        const data = JSON.parse(json);
        return this.save(data);
    }
}
```

## Usage with Vue

```typescript
import { useWorkflowStorage } from '@or3/workflow-vue';
import { LocalStorageAdapter } from '@or3/workflow-core';

const storage = new LocalStorageAdapter();
const {
    workflows,
    currentWorkflow,
    isLoading,
    error,
    loadList,
    load,
    save,
    remove,
} = useWorkflowStorage(storage);

// Load list on mount
onMounted(() => loadList());

// Save current workflow
async function handleSave() {
    if (editor.value) {
        await save(editor.value.getJSON());
    }
}
```

## Best Practices

### 1. Handle Errors

```typescript
try {
    await storage.save(workflow);
} catch (error) {
    console.error('Failed to save:', error);
    showErrorToast('Could not save workflow');
}
```

### 2. Autosave

```typescript
// Debounced autosave
const debouncedSave = useDebounceFn(() => {
    storage.saveAutosave(editor.getJSON());
}, 1000);

editor.on('update', debouncedSave);
```

### 3. Validate on Load

```typescript
async function loadWorkflow(id: string) {
    const data = await storage.load(id);

    if (!data) {
        throw new Error('Workflow not found');
    }

    // Validate version compatibility
    if (!isVersionCompatible(data.meta.version)) {
        throw new Error('Incompatible workflow version');
    }

    editor.load(data);
}
```

### 4. Export/Import for Sharing

```typescript
// Export to file
async function exportWorkflow(id: string) {
    const json = await storage.export(id);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${id}.json`;
    a.click();
}

// Import from file
async function importWorkflow(file: File) {
    const json = await file.text();
    const id = await storage.import(json);
    await load(id);
}
```

## Next Steps

-   [Memory Adapters](./memory.md) - Vector memory
-   [Token Counters](./token-counter.md) - Token counting
