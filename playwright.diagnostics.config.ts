import { defineConfig, devices } from '@playwright/test'

// Isolated production acceptance: no database setup, developer .env or live API.
const server = (port: number, enabled: boolean) => ({
  command: 'node .output/server/index.mjs',
  url: `http://127.0.0.1:${port}/`,
  env: {
    NITRO_HOST: '127.0.0.1', NITRO_PORT: String(port),
    NUXT_PUBLIC_GARDEN_DIAGNOSTICS: String(enabled),
    DATABASE_URL: '', DIRECT_URL: '', VERCEL: '',
    POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: '9', POSTGRES_USER: 'diagnostics',
    POSTGRES_PASSWORD: 'unused-local-diagnostics', POSTGRES_DB: 'unused_diagnostics',
    BETTER_AUTH_URL: `http://127.0.0.1:${port}`,
    BETTER_AUTH_SECRET: 'diagnostics-local-test-secret-at-least-32-characters',
    SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_SECURE: 'false',
    SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM: 'diagnostics@petmemoreal.test'
  },
  reuseExistingServer: false,
  timeout: 60000
})

export default defineConfig({
  testDir: './tests/diagnostics',
  outputDir: './test-results/diagnostics-artifacts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1000 },
    baseURL: 'http://127.0.0.1:4180',
    reducedMotion: 'no-preference',
    colorScheme: 'light',
    trace: 'off', screenshot: 'off', video: 'off',
    acceptDownloads: true
  },
  webServer: [server(4180, true), server(4181, false)]
})
