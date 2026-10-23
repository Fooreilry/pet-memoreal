import { defineConfig, devices } from '@playwright/test'
import { existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

if (existsSync('.env')) process.loadEnvFile('.env')
// Browser fixtures must never inherit an external Neon connection from a developer's shell.
process.env.DATABASE_URL = ''
process.env.DIRECT_URL = ''
process.env.E2E_DATABASE ??= `petmemoreal_e2e_${process.pid}_${randomBytes(4).toString('hex')}`

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: '**/vercel-runtime.spec.ts',
  globalSetup: './tests/e2e/setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' } }
  ],
  webServer: {
    command: 'node .output/server/index.mjs',
    url: 'http://127.0.0.1:4173/',
    env: {
      NITRO_HOST: '127.0.0.1', NITRO_PORT: '4173',
      POSTGRES_DB: process.env.E2E_DATABASE,
      DATABASE_URL: '', DIRECT_URL: '', VERCEL: '',
      BETTER_AUTH_URL: 'http://127.0.0.1:4173',
      BETTER_AUTH_SECRET: randomBytes(48).toString('base64url'),
      SMTP_HOST: '127.0.0.1', SMTP_PORT: process.env.MAILPIT_SMTP_PORT || '1025',
      SMTP_SECURE: 'false', SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM: 'noreply@petmemoreal.test'
    },
    reuseExistingServer: false,
    timeout: 60000
  }
})
