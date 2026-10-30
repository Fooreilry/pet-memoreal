import { defineConfig } from '@playwright/test'
import { gardenBenchmarkProtocol } from './app/utils/gardenBenchmarkProtocol'

const fpsLimit = Number(process.env.GARDEN_BENCH_FPS ?? 30)
if (fpsLimit !== 30 && fpsLimit !== 60) throw new Error('GARDEN_BENCH_FPS must be 30 or 60')

// Deliberately independent of playwright.config.ts: no .env, database setup,
// temporary database, retries, tracing or screenshot recording affects a run.
export default defineConfig({
  testDir: './tests/benchmarks',
  testMatch: 'gardens.bench.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  retries: 0,
  timeout: 25 * 60 * 1000,
  globalTimeout: 30 * 60 * 1000,
  reporter: 'list',
  outputDir: './test-results/garden-benchmarks/artifacts',
  metadata: { gardenBenchmark: { fpsLimit, ...gardenBenchmarkProtocol } },
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: 'http://127.0.0.1:4175',
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    locale: 'en-US',
    colorScheme: 'light',
    serviceWorkers: 'block',
    screenshot: 'off',
    video: 'off',
    trace: 'off',
    launchOptions: {
      args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']
    }
  },
  webServer: {
    command: 'node .output/server/index.mjs',
    url: 'http://127.0.0.1:4175/',
    reuseExistingServer: false,
    timeout: 60000,
    env: {
      NITRO_HOST: '127.0.0.1', NITRO_PORT: '4175',
      NUXT_PUBLIC_GARDEN_DIAGNOSTICS: 'true',
      DATABASE_URL: '', DIRECT_URL: '', VERCEL: '',
      POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: '9',
      POSTGRES_USER: 'benchmark', POSTGRES_PASSWORD: 'unused-local-benchmark', POSTGRES_DB: 'unused_benchmark',
      BETTER_AUTH_URL: 'http://127.0.0.1:4175',
      BETTER_AUTH_SECRET: 'benchmark-local-only-secret-at-least-32-characters',
      SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', SMTP_SECURE: 'false',
      SMTP_USER: '', SMTP_PASSWORD: '', SMTP_FROM: 'benchmark@petmemoreal.test'
    }
  }
})
