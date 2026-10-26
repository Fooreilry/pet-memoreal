export const userRoles = ['user', 'admin'] as const
export type UserRole = typeof userRoles[number]

// Role assignment belongs to trusted server/database operations, never profile input.
export const roleFields = {
  role: { type: userRoles.slice(), required: true, defaultValue: 'user', input: false }
} as const
