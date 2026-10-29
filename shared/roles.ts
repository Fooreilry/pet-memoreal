export const userRoles = ['user', 'manager', 'developer', 'admin'] as const
export type UserRole = typeof userRoles[number]

export type AccessLevel = 0 | 1 | 2 | 3
export type Permissions = Readonly<{
  adminPanel: AccessLevel
  experimentalFeatures: boolean
  configuration: AccessLevel
}>

const permissions: Readonly<Record<UserRole, Permissions>> = Object.freeze({
  user: Object.freeze({ adminPanel: 0, experimentalFeatures: false, configuration: 0 }),
  manager: Object.freeze({ adminPanel: 2, experimentalFeatures: false, configuration: 0 }),
  developer: Object.freeze({ adminPanel: 1, experimentalFeatures: true, configuration: 3 }),
  admin: Object.freeze({ adminPanel: 3, experimentalFeatures: true, configuration: 3 })
})

export function isUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && (userRoles as readonly string[]).includes(role)
}

// Unknown or missing roles receive no privileged capabilities.
export function getPermissions(role: unknown): Permissions {
  return permissions[isUserRole(role) ? role : 'user']
}

export function canAccessAdmin(role: unknown, action: 'view' | 'edit' | 'create' | 'delete' = 'view') {
  const minimum = { view: 1, edit: 2, create: 3, delete: 3 } as const
  return getPermissions(role).adminPanel >= minimum[action]
}

export function canConfigure(role: unknown, scope: 'own' | 'gardens' | 'all') {
  const minimum = { own: 1, gardens: 2, all: 3 } as const
  return getPermissions(role).configuration >= minimum[scope]
}

export function canEditMemorial(role: unknown, ownerId: string, viewerId?: string) {
  return !!viewerId && isUserRole(role) && (ownerId === viewerId || canAccessAdmin(role, 'edit') || canConfigure(role, 'all'))
}

// Role assignment belongs to trusted server/database operations, never profile input.
export const roleFields = {
  role: { type: userRoles.slice(), required: true, defaultValue: 'user', input: false }
} as const
