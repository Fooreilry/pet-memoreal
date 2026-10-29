import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import test from 'node:test'
import { verifyPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { getAdminConfig, seedInitialAdmin } from '../../scripts/db/admin-data'
import { createDatabase } from '../../server/db/client'
import { account, user } from '../../server/db/schema'

test('initial admin is verified, has a real login hash and survives concurrent seed retries without password reset', async () => {
  const { db, pool } = createDatabase()
  const config = getAdminConfig({ ADMIN_EMAIL: `bootstrap-${randomUUID()}@petmemoreal.test`, ADMIN_PASSWORD: randomBytes(24).toString('base64url') })!
  try {
    assert.deepEqual((await Promise.all([seedInitialAdmin(db, config), seedInitialAdmin(db, config)])).sort(), ['created', 'existing'])
    const [created] = await db.select().from(user).where(eq(user.email, config.email))
    const id = created!.id
    assert.equal(created!.role, 'admin')
    assert.equal(created!.emailVerified, true)
    const [credential] = await db.select().from(account).where(eq(account.userId, id))
    assert.equal(credential!.providerId, 'credential')
    assert.equal(credential!.accountId, id)
    assert.equal(await verifyPassword({ hash: credential!.password!, password: config.password }), true)
    assert.equal(await seedInitialAdmin(db, { ...config, password: 'replacement-password-12345', name: 'Replacement' }), 'existing')
    const [unchanged] = await db.select().from(account).where(eq(account.userId, id))
    assert.equal(unchanged!.password, credential!.password)
    const [profile] = await db.select().from(user).where(eq(user.id, id))
    assert.equal(profile!.name, config.name)
  } finally {
    await db.delete(user).where(eq(user.email, config.email))
    await pool.end()
  }
})

test('admin provisioning refuses to take over an existing user or unverified admin account', async () => {
  const { db, pool } = createDatabase()
  const id = randomUUID()
  const config = getAdminConfig({ ADMIN_EMAIL: `bootstrap-conflict-${randomUUID()}@petmemoreal.test`, ADMIN_PASSWORD: randomBytes(24).toString('base64url') })!
  try {
    await db.insert(user).values({ id, name: 'Existing', email: config.email, role: 'user', emailVerified: true })
    await assert.rejects(seedInitialAdmin(db, config), /already used by another account/)
    const [existing] = await db.select().from(user).where(eq(user.id, id))
    assert.equal(existing!.role, 'user')
    await db.update(user).set({ role: 'admin', emailVerified: false }).where(eq(user.id, id))
    await assert.rejects(seedInitialAdmin(db, config), /already used by another account/)
    assert.equal((await db.select().from(account).where(eq(account.userId, id))).length, 0)
  } finally {
    await db.delete(user).where(eq(user.id, id))
    await pool.end()
  }
})
