import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@or3/workflow-core': resolve(__dirname, '../packages/workflow-core/src'),
      '@or3/workflow-vue': resolve(__dirname, '../packages/workflow-vue/src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5000,
    allowedHosts: true,
  },
  optimizeDeps: {
    include: ['@vue-flow/core', '@vue-flow/background', '@vue-flow/controls'],
  },
})
