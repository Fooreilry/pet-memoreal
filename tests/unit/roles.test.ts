import assert from 'node:assert/strict'
import test from 'node:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { roleFields, userRoles } from '../../shared/roles'
import type { UserRole } from '../../shared/roles'
import { user } from '../../server/db/schema'

test('authentication exposes exactly two roles and keeps their assignment outside client input', () => {
  assert.deepEqual(userRoles, ['user', 'admin'])
  assert.deepEqual(roleFields.role.type, userRoles)
  assert.equal(roleFields.role.defaultValue, 'user')
  assert.equal(roleFields.role.required, true)
  assert.equal(roleFields.role.input, false)
})

test('stored roles are non-null, default to user and are constrained to the shared role set', () => {
  const defaultRole: UserRole = 'user'
  assert.equal(user.role.default, defaultRole)
  assert.equal(user.role.notNull, true)
  assert.deepEqual(user.role.enumValues, userRoles)
  const roleCheck = getTableConfig(user).checks.find(check => check.name === 'auth_user_role_check')
  assert.ok(roleCheck)
  const query = new PgDialect().sqlToQuery(roleCheck.value)
  assert.equal(query.sql, '"auth_user"."role" in (\'user\', \'admin\')')
  assert.deepEqual(query.params, [])
})
