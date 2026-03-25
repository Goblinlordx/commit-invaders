import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname),
  resolve: {
    alias: {
      '../../src': resolve(__dirname, '../../src'),
    },
  },
})
