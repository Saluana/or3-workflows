import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(here, '..');

/**
 * Static package-boundary checks for optional runtime modules (R1.AC4, R6.AC3).
 *
 * The main entry must not statically import the optional `@openrouter/agent`
 * backend or `@opentelemetry/api`; those load lazily / structurally so static
 * and SSR bundles omit them.
 */
function readIndexGraph(): string {
    // Concatenate the main entry and its direct barrels to inspect static imports.
    const files = [
        'index.ts',
        'agent/index.ts',
        'observability/index.ts',
        'observability/otel.ts',
    ];
    return files
        .map((f) => {
            const p = resolve(srcRoot, f);
            return existsSync(p) ? readFileSync(p, 'utf8') : '';
        })
        .join('\n');
}

describe('package boundaries (R1.AC4, R6.AC3)', () => {
    it('main entry does not export the optional openrouter-agent backend', () => {
        const index = readFileSync(resolve(srcRoot, 'index.ts'), 'utf8');
        expect(index).not.toContain('openrouterAgentBackend');
        expect(index).not.toContain('OpenRouterAgentLoopBackend');
    });

    it('reachable-from-main modules do not statically import optional packages', () => {
        const graph = readIndexGraph();
        expect(graph).not.toMatch(/from ['"]@openrouter\/agent['"]/);
        expect(graph).not.toMatch(/from ['"]@opentelemetry\/api['"]/);
    });

    it('the optional backend only uses a runtime dynamic import for @openrouter/agent', () => {
        const backend = readFileSync(
            resolve(srcRoot, 'agent/openrouterAgentBackend.ts'),
            'utf8'
        );
        // No static import of the optional package.
        expect(backend).not.toMatch(/^import[^;]*@openrouter\/agent/m);
        // Uses dynamic import with a non-literal specifier.
        expect(backend).toContain('await import(');
    });

    it('the OTel adapter depends only on structural types (no @opentelemetry/api import)', () => {
        const otel = readFileSync(
            resolve(srcRoot, 'observability/otel.ts'),
            'utf8'
        );
        expect(otel).not.toMatch(/from ['"]@opentelemetry\/api['"]/);
        expect(otel).not.toMatch(/import\(['"]@opentelemetry\/api['"]\)/);
    });
});
