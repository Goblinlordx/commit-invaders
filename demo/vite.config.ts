import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    alias: {
      '../src': resolve(__dirname, '../src'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../docs'),
    emptyOutDir: true,
  },
})
