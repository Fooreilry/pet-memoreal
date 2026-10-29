import assert from 'node:assert/strict'
import test from 'node:test'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { canAccessAdmin, canConfigure, canEditMemorial, getPermissions, roleFields, userRoles } from '../../shared/roles'
import type { UserRole } from '../../shared/roles'
import { user } from '../../server/db/schema'

const expectedPermissions = {
  user: { adminPanel: 0, experimentalFeatures: false, configuration: 0 },
  manager: { adminPanel: 2, experimentalFeatures: false, configuration: 0 },
  developer: { adminPanel: 1, experimentalFeatures: true, configuration: 3 },
  admin: { adminPanel: 3, experimentalFeatures: true, configuration: 3 }
} as const

test('authentication exposes four roles and keeps assignment outside client input', () => {
  assert.deepEqual(userRoles, ['user', 'manager', 'developer', 'admin'])
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
  assert.equal(query.sql, '"auth_user"."role" in (\'user\', \'manager\', \'developer\', \'admin\')')
  assert.deepEqual(query.params, [])
})

test('permissions are immutable and distinguish panel access from configuration access', () => {
  for (const role of userRoles) {
    const permissions = getPermissions(role)
    assert.deepEqual(permissions, expectedPermissions[role])
    assert.ok(Object.isFrozen(permissions))
    assert.equal(canAccessAdmin(role, 'view'), permissions.adminPanel >= 1)
    assert.equal(canAccessAdmin(role, 'edit'), permissions.adminPanel >= 2)
    assert.equal(canAccessAdmin(role, 'create'), permissions.adminPanel >= 3)
    assert.equal(canAccessAdmin(role, 'delete'), permissions.adminPanel >= 3)
    assert.equal(canConfigure(role, 'own'), permissions.configuration >= 1)
    assert.equal(canConfigure(role, 'gardens'), permissions.configuration >= 2)
    assert.equal(canConfigure(role, 'all'), permissions.configuration >= 3)
  }
})

test('missing and malformed roles fail closed, including object prototype names', () => {
  for (const role of [undefined, null, '', 'owner', 'ADMIN', 'toString', 'constructor', '__proto__', {}, 3]) {
    assert.deepEqual(getPermissions(role), expectedPermissions.user)
    for (const action of ['view', 'edit', 'create', 'delete'] as const) assert.equal(canAccessAdmin(role, action), false)
    for (const scope of ['own', 'gardens', 'all'] as const) assert.equal(canConfigure(role, scope), false)
    assert.equal(canEditMemorial(role, 'owner', 'someone-else'), false)
    assert.equal(canEditMemorial(role, 'owner', 'owner'), false)
  }
})

test('memorial editing combines ownership with distinct administrative and configuration grants', () => {
  assert.equal(canEditMemorial('user', 'owner', 'owner'), true)
  assert.equal(canEditMemorial('user', 'owner', 'someone-else'), false)
  assert.equal(canEditMemorial('manager', 'owner', 'someone-else'), true)
  assert.equal(canEditMemorial('developer', 'owner', 'someone-else'), true)
  assert.equal(canEditMemorial('admin', 'owner', 'someone-else'), true)
  assert.equal(canEditMemorial('user', '', ''), false)
})
