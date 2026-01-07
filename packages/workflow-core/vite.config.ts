import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        dts({
            include: ['src'],
            rollupTypes: true,
        }),
    ],
    build: {
        copyPublicDir: false,
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'Or3WorkflowCore',
            fileName: (format) => `index.${format === 'es' ? 'js' : 'umd.cjs'}`,
        },
        rollupOptions: {
            external: ['@openrouter/sdk', 'zod'],
            output: {
                globals: {
                    '@openrouter/sdk': 'OpenRouterSDK',
                    zod: 'Zod',
                },
            },
        },
    },
});
