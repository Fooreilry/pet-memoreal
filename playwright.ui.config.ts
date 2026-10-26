import { defineConfig } from '@playwright/test'
import config from './playwright.config'

// These public UI scenarios do not use the database or email service.
export default defineConfig({
  ...config,
  testMatch: ['landing.spec.ts', 'theme.spec.ts', 'gardens.spec.ts', 'garden-shell.spec.ts', 'garden-selection.spec.ts', 'monuments.spec.ts', 'hill.spec.ts', 'grove.spec.ts', 'lake.spec.ts', 'meadow.spec.ts'],
  globalSetup: undefined,
  webServer: {
    command: 'node .output/server/index.mjs',
    url: 'http://127.0.0.1:4174/ru',
    env: { NITRO_HOST: '127.0.0.1', NITRO_PORT: '4174', BETTER_AUTH_URL: 'http://127.0.0.1:4174' },
    reuseExistingServer: false
  },
  use: { ...config.use, baseURL: 'http://127.0.0.1:4174' }
})
