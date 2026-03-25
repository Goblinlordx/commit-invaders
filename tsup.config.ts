import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/action/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  target: 'node20',
  platform: 'node',
  clean: true,
  noExternal: [/.*/], // bundle everything into one file
  minify: false, // keep readable for debugging
})
