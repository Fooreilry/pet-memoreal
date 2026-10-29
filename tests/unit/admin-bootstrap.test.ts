import assert from 'node:assert/strict'
import test from 'node:test'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { getAdminConfig } from '../../scripts/db/admin-data'

const settings = { ADMIN_EMAIL: ' ADMIN@petmemoreal.test ', ADMIN_PASSWORD: 'bootstrap-password-12345' }

test('admin provisioning is opt-in and requires both valid credentials without exposing their values', () => {
  assert.equal(getAdminConfig({}), undefined)
  for (const env of [{}, { ADMIN_EMAIL: settings.ADMIN_EMAIL }, { ADMIN_PASSWORD: settings.ADMIN_PASSWORD }, { ...settings, ADMIN_EMAIL: 'invalid-secret-email' }, { ...settings, ADMIN_PASSWORD: 'short-secret' }, { ...settings, ADMIN_NAME: ' ' }, { ...settings, ADMIN_SURNAME: 'x'.repeat(81) }]) {
    assert.throws(() => getAdminConfig(env, true), error => {
      return error instanceof Error && error.message.startsWith('Invalid ADMIN_') && !error.message.includes('short-secret') && !error.message.includes('invalid-secret-email')
    })
  }
})

test('admin configuration normalizes the email and trims names while preserving password bytes', () => {
  assert.deepEqual(getAdminConfig(settings), {
    email: 'admin@petmemoreal.test', password: settings.ADMIN_PASSWORD, name: 'Administrator', surname: ''
  })
  const password = '  bootstrap-password-12345  '
  assert.deepEqual(getAdminConfig({ ...settings, ADMIN_NAME: '  Garden  ', ADMIN_SURNAME: ' Admin ', ADMIN_PASSWORD: password }), {
    email: 'admin@petmemoreal.test', password, name: 'Garden', surname: 'Admin'
  })
})

test('the bootstrap password hash is compatible with Better Auth sign-in and uses a random salt', async () => {
  const first = await hashPassword(settings.ADMIN_PASSWORD)
  const second = await hashPassword(settings.ADMIN_PASSWORD)
  assert.notEqual(first, second)
  assert.ok(!first.includes(settings.ADMIN_PASSWORD))
  assert.equal(await verifyPassword({ hash: first, password: settings.ADMIN_PASSWORD }), true)
  assert.equal(await verifyPassword({ hash: first, password: 'another-password-12345' }), false)
})
