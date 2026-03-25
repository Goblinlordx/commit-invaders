import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname),
  base: "/commit-invaders/",
  resolve: {
    alias: {
      '../src': resolve(__dirname, '../src'),
      '../dev': resolve(__dirname, '../dev'),
    },
  },
  build: {
    outDir: resolve(__dirname, '../docs'),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // Proxy GitHub contributions page for dev mode
      '/api/contributions': {
        target: 'https://github.com',
        changeOrigin: true,
        rewrite: (path) => path.replace('/api/contributions/', '/users/') + '/contributions',
      },
    },
  },
})
