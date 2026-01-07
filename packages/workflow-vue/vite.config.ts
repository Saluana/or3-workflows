import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'vite-plugin-dts';
import { resolve } from 'path';

export default defineConfig({
    plugins: [
        vue(),
        dts({
            include: ['src'],
            rollupTypes: true,
        }),
    ],
    build: {
        copyPublicDir: false,
        lib: {
            entry: resolve(__dirname, 'src/index.ts'),
            name: 'Or3WorkflowVue',
            fileName: (format) => `index.${format === 'es' ? 'js' : 'umd.cjs'}`,
        },
        rollupOptions: {
            external: [
                'vue',
                'or3-workflow-core',
                '@vue-flow/core',
                '@vue-flow/background',
                '@vue-flow/controls',
                '@vue-flow/minimap',
                '@vueuse/core',
            ],
            output: {
                globals: {
                    vue: 'Vue',
                    'or3-workflow-core': 'Or3WorkflowCore',
                    '@vue-flow/core': 'VueFlow',
                    '@vue-flow/background': 'VueFlowBackground',
                    '@vue-flow/controls': 'VueFlowControls',
                    '@vue-flow/minimap': 'VueFlowMinimap',
                    '@vueuse/core': 'VueUse',
                },
                assetFileNames: 'style.css',
            },
        },
    },
});
