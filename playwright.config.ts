import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/visual',
  timeout: 60000,
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 800, height: 400 },
  },
  webServer: {
    command: 'npx vite dev/entity-validator --port 5180',
    port: 5180,
    reuseExistingServer: !process.env.CI,
    timeout: 15000,
  },
})
