import { defineConfig } from '@playwright/test'
import config from './playwright.config'
import { outageOrigin, outageSecret } from './tests/e2e/helpers/outage'

// This server intentionally cannot reach Postgres. No Docker or test database is needed.
export default defineConfig({
  ...config,
  testMatch: 'service-outage.spec.ts',
  testIgnore: [],
  globalSetup: undefined,
  use: { ...config.use, baseURL: outageOrigin },
  webServer: {
    command: 'node .output/server/index.mjs',
    url: `${outageOrigin}/`,
    env: {
      NITRO_HOST: '127.0.0.1', NITRO_PORT: '4176', VERCEL: '',
      DATABASE_URL: '', DIRECT_URL: '',
      POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: '1', POSTGRES_DB: 'offline_fixture',
      POSTGRES_USER: 'offline_fixture', POSTGRES_PASSWORD: 'offline_fixture',
      BETTER_AUTH_URL: outageOrigin, BETTER_AUTH_SECRET: outageSecret,
      SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_SECURE: 'false',
      SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM: 'outage@petmemoreal.test'
    },
    reuseExistingServer: false,
    timeout: 60000
  }
})
