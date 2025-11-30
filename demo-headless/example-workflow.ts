import type { WorkflowData } from '@or3/workflow-core';

export const workflow: WorkflowData = {
    meta: {
        version: '2.0.0',
        name: 'Headless TS Demo Workflow',
        description:
            'Simple demo workflow defined in TypeScript for the headless runner.',
    },
    nodes: [
        {
            id: 'start-1',
            type: 'start',
            position: { x: 0, y: 0 },
            data: { label: 'Start' },
        },
        {
            id: 'agent-1',
            type: 'agent',
            position: { x: 200, y: 0 },
            data: {
                label: 'TS Agent',
                model: 'openai/gpt-4o-mini',
                prompt: 'You are a helpful assistant. Use the input to respond clearly and concisely.',
            },
        },
    ],
    edges: [
        {
            id: 'edge-1',
            source: 'start-1',
            target: 'agent-1',
        },
    ],
};

export default workflow;

