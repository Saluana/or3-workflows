import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        dts({
            include: ['src'],
            // Multiple entry points: emit per-file declarations (no single roll-up)
            // so the optional `./openrouter-agent` subpath keeps its own types.
            rollupTypes: false,
        }),
    ],
    build: {
        copyPublicDir: false,
        lib: {
            entry: {
                index: resolve(__dirname, 'src/index.ts'),
                'openrouter-agent': resolve(
                    __dirname,
                    'src/openrouter-agent.ts'
                ),
            },
            formats: ['es'],
        },
        rollupOptions: {
            // `@openrouter/agent` and `@opentelemetry/api` are OPTIONAL peer deps
            // and must never be bundled.
            external: [
                '@openrouter/sdk',
                'zod',
                '@openrouter/agent',
                '@opentelemetry/api',
            ],
        },
    },
});
