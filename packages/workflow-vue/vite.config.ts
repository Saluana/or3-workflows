import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue(),
    dts({ rollupTypes: true })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'WorkflowVue',
      fileName: 'index'
    },
    rollupOptions: {
      external: ['vue', '@or3/workflow-core', '@vue-flow/core', '@vue-flow/background', '@vue-flow/controls'],
      output: {
        globals: {
          vue: 'Vue',
          '@or3/workflow-core': 'WorkflowCore',
          '@vue-flow/core': 'VueFlow',
          '@vue-flow/background': 'VueFlowBackground',
          '@vue-flow/controls': 'VueFlowControls'
        }
      }
    }
  }
})
