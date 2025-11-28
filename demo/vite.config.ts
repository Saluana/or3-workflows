import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'or3-workflow': resolve(__dirname, '../src'),
      '@': resolve(__dirname, 'src'),
    },
  },
})
