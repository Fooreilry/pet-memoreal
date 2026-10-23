import { defineConfig } from '@playwright/test'
import config from './playwright.config'
import { getDatabaseOptions } from './server/db/config'

const options = getDatabaseOptions()
if (!['127.0.0.1', 'localhost'].includes(options.host || '') || typeof options.password !== 'string') {
  throw new Error('Vercel runtime scenarios require local PostgreSQL')
}
const url = new URL(`postgresql://${options.host}:${options.port}/${process.env.E2E_DATABASE}`)
url.username = options.user!
url.password = options.password
url.searchParams.set('sslmode', 'disable')

export default defineConfig({
  ...config,
  testMatch: 'vercel-runtime.spec.ts',
  testIgnore: [],
  projects: config.projects!.filter(project => project.name === 'desktop'),
  use: { ...config.use, baseURL: 'http://127.0.0.1:4175' },
  webServer: {
    ...config.webServer,
    command: 'node .output/server/index.mjs',
    url: 'http://127.0.0.1:4175/',
    env: {
      ...(config.webServer as { env: Record<string, string> }).env,
      NITRO_PORT: '4175', VERCEL: '1',
      DATABASE_URL: url.href,
      BETTER_AUTH_URL: 'http://127.0.0.1:4175'
    },
    reuseExistingServer: false
  }
})
