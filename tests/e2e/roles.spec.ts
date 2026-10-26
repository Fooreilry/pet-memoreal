import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { hashPassword } from 'better-auth/crypto'
import { expect, test as base } from '@playwright/test'
import { getDatabaseOptions } from '../../server/db/config'
import { signInFixture } from './helpers/sign-in'

const origin = 'http://127.0.0.1:4173'
const password = 'Roles-fixture-2026!'
const test = base.extend<{ database: pg.Pool }>({
  database: async ({ baseURL }, use) => {
    const database = process.env.E2E_DATABASE
    if (baseURL !== origin || !database || !/^petmemoreal_e2e_\d+_[a-f0-9]{8}$/.test(database)) throw new Error('Role fixtures require the temporary E2E database')
    const pool = new pg.Pool({ ...getDatabaseOptions(), database })
    try { await use(pool) } finally { await pool.end() }
  }
})

test('registration assigns user and profile requests cannot promote that role', async ({ page, database }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Role assignment is enforced by the server')
  const email = `roles-signup-${randomUUID()}@example.test`
  const headers = { origin }
  try {
    const registration = await page.request.post('/api/auth/sign-up/email', {
      headers,
      data: { name: 'Role visitor', email, password, role: 'admin', emailVerified: true }
    })
    expect(registration.ok()).toBe(true)
    const created = await registration.json()
    expect(created.user).toMatchObject({ role: 'user', emailVerified: false })
    expect(created.token).toBeNull()
    const stored = await database.query('SELECT id, role, email_verified FROM auth_user WHERE email = $1', [email])
    expect(stored.rows).toHaveLength(1)
    expect(stored.rows[0]).toMatchObject({ role: 'user', email_verified: false })
    // Verification is a local fixture operation; no external message is delivered.
    await database.query('UPDATE auth_user SET email_verified = true WHERE id = $1', [stored.rows[0].id])
    const login = await signInFixture(page.request, { origin, email, password })
    expect(login.ok()).toBe(true)
    for (const role of ['admin', 'owner']) {
      const update = await page.request.post('/api/auth/update-user', { headers, data: { name: 'Role visitor', role } })
      expect([200, 400]).toContain(update.status())
      const after = await database.query('SELECT role FROM auth_user WHERE id = $1', [stored.rows[0].id])
      expect(after.rows[0].role).toBe('user')
      const me = await page.request.get('/api/me')
      expect(me.status()).toBe(200)
      expect(await me.json()).toMatchObject({ role: 'user', email })
    }
  } finally {
    await database.query('DELETE FROM auth_user WHERE email = $1', [email])
  }
})

test('the database rejects roles outside user and admin', async ({ database }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'The database contract does not depend on viewport')
  const id = randomUUID()
  try {
    for (const role of ['owner', '', 'USER']) {
      await expect(database.query('INSERT INTO auth_user (id, name, email, role) VALUES ($1, $2, $3, $4)', [id, 'Invalid role', `invalid-role-${id}@example.test`, role]))
        .rejects.toMatchObject({ code: '23514' })
    }
  } finally {
    await database.query('DELETE FROM auth_user WHERE id = $1', [id])
  }
})

for (const role of ['user', 'admin'] as const) {
  test(`${role}: the same gardens, personal account and profile operations remain available`, async ({ page, database }) => {
    const id = randomUUID()
    const email = `roles-${role}-${id}@example.test`
    const name = `Garden ${role}`
    try {
      await database.query('INSERT INTO auth_user (id, name, email, email_verified, role) VALUES ($1, $2, $3, true, $4)', [id, name, email, role])
      await database.query('INSERT INTO auth_account (id, account_id, provider_id, user_id, password) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), id, 'credential', id, await hashPassword(password)])
      const login = await signInFixture(page.request, { origin, email, password })
      expect(login.ok()).toBe(true)
      const me = await page.request.get('/api/me')
      expect(me.headers()['cache-control']).toContain('no-store')
      expect(await me.json()).toMatchObject({ id, role, email, emailVerified: true })
      await page.goto('/ru/account')
      await expect(page.getByTestId('profile-name')).toHaveText(name)
      await page.locator('.account-header .brand').click()
      await expect(page).toHaveURL(/\/ru\/gardens$/)
      await expect(page.locator('.landing')).toHaveCount(0)
      await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
      const profile = await page.request.post('/api/auth/update-user', { headers: { origin }, data: { name, surname: 'Visitor' } })
      expect(profile.ok()).toBe(true)
      expect(await (await page.request.get('/api/me')).json()).toMatchObject({ role, surname: 'Visitor' })
      expect((await page.request.get('/api/memorials/mine')).ok()).toBe(true)
    } finally {
      await database.query('DELETE FROM auth_user WHERE id = $1', [id])
    }
  })
}
