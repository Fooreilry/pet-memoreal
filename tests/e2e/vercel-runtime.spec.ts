import { expect, test } from '@playwright/test'
import pg from 'pg'
import { getDatabaseOptions } from '../../server/db/config'

test('Vercel runtime uses URL connections, a shared database limit and trusted proxy IPs', async ({ page, request }) => {
  const database = process.env.E2E_DATABASE
  if (!database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Temporary E2E database required')
  const health = await request.get('/api/health')
  expect(health.status()).toBe(200)
  expect(health.headers()['cache-control']).toContain('no-store')
  expect(await health.json()).toEqual({ status: 'ok' })
  await page.goto('/ru')
  await page.locator('.auth-header-login').click()
  await expect(page).toHaveURL('/ru/login')
  const origin = 'http://127.0.0.1:4175'
  const reset = (ip: string, extra: Record<string, string> = {}) => request.post('/api/auth/request-password-reset', {
    headers: { origin, 'x-vercel-forwarded-for': ip, ...extra },
    data: { email: 'absent-vercel-runtime@example.test', redirectTo: `${origin}/ru/reset-password` }
  })
  // Concurrent calls must not all pass a stale counter on separate DB connections.
  const responses = await Promise.all(Array.from({ length: 12 }, () => reset('198.51.100.41')))
  expect(responses.filter(response => response.status() === 200)).toHaveLength(10)
  expect(responses.filter(response => response.status() === 429)).toHaveLength(2)
  const spoofed = await reset('198.51.100.41', { 'x-auth-client-ip': '198.51.100.99', 'x-forwarded-for': '198.51.100.99', 'x-real-ip': '198.51.100.99' })
  expect(spoofed.status()).toBe(429)
  expect(Number(spoofed.headers()['x-retry-after'])).toBeGreaterThan(0)
  expect((await reset('198.51.100.42')).status()).toBe(200)
  const pool = new pg.Pool({ ...getDatabaseOptions(), database })
  try {
    const result = await pool.query('SELECT count FROM auth_rate_limit WHERE count = 10')
    expect(result.rowCount).toBe(1)
    // Age only this dedicated fixture's exhausted bucket and verify recovery.
    await pool.query('UPDATE auth_rate_limit SET last_request = $1 WHERE count = 10', [Date.now() - 61000])
    expect((await reset('198.51.100.41')).status()).toBe(200)
  } finally {
    await pool.end()
  }
})
