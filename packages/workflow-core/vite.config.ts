import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'WorkflowCore',
      fileName: 'index'
    },
    rollupOptions: {
      external: ['@openrouter/sdk', 'zod'],
      output: {
        globals: {
          '@openrouter/sdk': 'OpenRouterSDK',
          'zod': 'Zod'
        }
      }
    }
  },
  plugins: [dts({ rollupTypes: true })]
})
