import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
    OpenRouterExecutionAdapter,
    type WorkflowData,
} from '@or3/workflow-core';
import { OpenRouter } from '@openrouter/sdk';

async function fileExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

function normalizeWorkflow(data: unknown, source: string): WorkflowData {
    if (!data || typeof data !== 'object') {
        throw new Error(`Workflow from ${source} is not an object`);
    }

    const wf = data as WorkflowData;

    if (!wf.meta || typeof wf.meta.name !== 'string') {
        throw new Error(
            `Workflow from ${source} is missing required meta.name`
        );
    }
    if (!Array.isArray(wf.nodes) || !Array.isArray(wf.edges)) {
        throw new Error(
            `Workflow from ${source} must have nodes[] and edges[]`
        );
    }

    return wf;
}

async function loadWorkflow(path: string): Promise<WorkflowData> {
    const absPath = resolve(process.cwd(), path);

    if (!(await fileExists(absPath))) {
        throw new Error(`Workflow file not found: ${absPath}`);
    }

    if (absPath.endsWith('.json')) {
        const raw = await readFile(absPath, 'utf8');
        const json = JSON.parse(raw);
        return normalizeWorkflow(json, absPath);
    }

    if (
        absPath.endsWith('.ts') ||
        absPath.endsWith('.js') ||
        absPath.endsWith('.mjs')
    ) {
        const url = pathToFileURL(absPath).href;
        const mod = await import(url);
        const candidate =
            mod.default ??
            mod.workflow ??
            mod.defaultWorkflow ??
            mod.workflowData;

        if (!candidate) {
            throw new Error(
                'TS/JS workflow module must export a workflow object (default export or named export "workflow").'
            );
        }

        return normalizeWorkflow(candidate, absPath);
    }

    throw new Error(
        `Unsupported workflow file extension. Use .json or .ts (got: ${absPath}).`
    );
}

async function readStdin(): Promise<string> {
    if (process.stdin.isTTY) {
        return '';
    }

    return new Promise((resolve) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => {
            resolve(data.trim());
        });
    });
}

async function loadDotEnvIfNeeded() {
    if (Bun.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY) {
        return;
    }

    const candidates = [
        resolve(process.cwd(), '.env'),
        resolve(process.cwd(), '..', '.env'),
    ];

    for (const file of candidates) {
        if (!(await fileExists(file))) continue;

        const raw = await readFile(file, 'utf8');
        const lines = raw.split(/\r?\n/);

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const match = trimmed.match(
                /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/
            );
            if (!match) continue;

            const [, key, rawValue] = match;
            let value = rawValue;

            if (
                (value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))
            ) {
                value = value.slice(1, -1);
            }

            if (!(key in Bun.env)) {
                (Bun.env as Record<string, string | undefined>)[key] = value;
            }
            if (!(key in process.env)) {
                process.env[key] = value;
            }
        }

        // Stop after first .env we successfully load
        break;
    }
}

function printHelp() {
    const script = Bun.argv[1] ?? 'src/index.ts';
    // eslint-disable-next-line no-console
    console.log(
        [
            'Headless OR3 workflow runner',
            '',
            'Usage:',
            `  bun ${script} <workflow.(json|ts)> [input text]`,
            '  bun run src/index.ts <workflow.(json|ts)> -- --input "your question"',
            '',
            'If no input text is provided, the tool will read from STDIN.',
            '',
            'Environment:',
            '  OPENROUTER_API_KEY must be set (loaded from Bun.env / .env).',
        ].join('\n')
    );
}

async function main() {
    await loadDotEnvIfNeeded();

    const [, , ...args] = Bun.argv;

    if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
        printHelp();
        return;
    }

    const workflowPath = args[0];

    let input = '';
    const inputFlagIndex = args.findIndex(
        (arg) => arg === '--input' || arg === '-i'
    );

    if (inputFlagIndex !== -1 && args[inputFlagIndex + 1]) {
        input = args[inputFlagIndex + 1];
    } else if (args.length > 1 && !args[1].startsWith('-')) {
        input = args.slice(1).join(' ');
    } else {
        input = await readStdin();
    }

    if (!input) {
        // eslint-disable-next-line no-console
        console.error(
            'No input provided. Pass text as a positional argument, with --input, or via STDIN.'
        );
        process.exitCode = 1;
        return;
    }

    const apiKey =
        Bun.env.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? '';

    if (!apiKey) {
        // eslint-disable-next-line no-console
        console.error(
            'OPENROUTER_API_KEY is not set. Add it to your .env or environment (Bun.env).'
        );
        process.exitCode = 1;
        return;
    }

    const workflow = await loadWorkflow(workflowPath);

    const client = new OpenRouter({ apiKey });
    const adapter = new OpenRouterExecutionAdapter(client as any, {
        defaultModel: 'openai/gpt-4o-mini',
    });

    const executionInput = {
        text: input,
        attachments: [],
    };

    // eslint-disable-next-line no-console
    console.error(
        `Running workflow "${workflow.meta?.name ?? workflowPath}"...`
    );

    let sawTokens = false;

    const result = await adapter.execute(
        workflow,
        executionInput,
        {
            onNodeStart: (nodeId) => {
                // eslint-disable-next-line no-console
                console.error(`[node:start] ${nodeId}`);
            },
            onNodeFinish: (nodeId, output) => {
                // eslint-disable-next-line no-console
                console.error(`[node:finish] ${nodeId} -> ${output.slice(0, 60)}`);
            },
            onNodeError: (nodeId, error) => {
                // eslint-disable-next-line no-console
                console.error(
                    `[node:error] ${nodeId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                );
            },
            onToken: (_nodeId, token) => {
                sawTokens = true;
                process.stdout.write(token);
            },
            onRouteSelected: (nodeId, routeId) => {
                // eslint-disable-next-line no-console
                console.error(`[route] ${nodeId} -> ${routeId}`);
            },
        }
    );

    if (!result.success) {
        if (sawTokens) {
            process.stdout.write('\n');
        }
        // eslint-disable-next-line no-console
        console.error('Workflow execution failed.');
        if (result.error) {
            // eslint-disable-next-line no-console
            console.error(result.error);
        }
        process.exitCode = 1;
        return;
    }

    if (!sawTokens) {
        // If nothing was streamed, print the final output now.
        // eslint-disable-next-line no-console
        console.log(result.output);
    } else {
        process.stdout.write('\n');
    }

    // eslint-disable-next-line no-console
    console.error(
        `\nDone in ${result.duration}ms${
            result.usage
                ? ` (tokens: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens})`
                : ''
        }`
    );
}

main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Fatal error in headless workflow runner:', error);
    process.exitCode = 1;
});
