import { defineConfig } from '@playwright/test'
import config from './playwright.config'

// Page readiness checks use an isolated temporary database, including guest visits.
export default defineConfig({
  ...config,
  testMatch: ['locale.spec.ts', 'landing.spec.ts', 'theme.spec.ts', 'gardens.spec.ts', 'memorial-preview.spec.ts', 'memorial-detail.spec.ts', 'garden-transitions.spec.ts', 'garden-directed-transitions.spec.ts', 'garden-transition-directions.spec.ts', 'garden-title.spec.ts', 'garden-overscan.spec.ts', 'garden-shell.spec.ts', 'garden-selection.spec.ts', 'garden-effects.spec.ts', 'garden-surfaces.spec.ts', 'garden-chunks.spec.ts', 'garden-session.spec.ts', 'monuments.spec.ts', 'hill.spec.ts', 'grove.spec.ts', 'lake.spec.ts', 'meadow.spec.ts'],
  webServer: {
    ...config.webServer,
    url: 'http://127.0.0.1:4174/',
    env: { ...(config.webServer as { env: Record<string, string> }).env, NITRO_PORT: '4174', BETTER_AUTH_URL: 'http://127.0.0.1:4174', NUXT_PUBLIC_GARDEN_DIAGNOSTICS: 'false' },
    reuseExistingServer: false
  },
  use: { ...config.use, baseURL: 'http://127.0.0.1:4174' }
})
