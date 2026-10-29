import { randomUUID } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { createDatabase } from '../../server/db/client'
import { account, user } from '../../server/db/schema'

type Environment = Record<string, string | undefined>
const adminSchema = z.object({
  email: z.email().max(254).transform(value => value.toLowerCase()),
  password: z.string().min(16).max(128),
  name: z.string().trim().min(1).max(80),
  surname: z.string().trim().max(80)
})

export function getAdminConfig(env: Environment = process.env, required = false) {
  if (!env.ADMIN_EMAIL && !env.ADMIN_PASSWORD && !required) return undefined
  const result = adminSchema.safeParse({
    email: env.ADMIN_EMAIL?.trim(), password: env.ADMIN_PASSWORD,
    name: env.ADMIN_NAME ?? 'Administrator', surname: env.ADMIN_SURNAME ?? ''
  })
  if (!result.success) throw new Error('Invalid ADMIN_EMAIL, ADMIN_PASSWORD (16–128 characters), ADMIN_NAME or ADMIN_SURNAME')
  return result.data
}

export type AdminConfig = NonNullable<ReturnType<typeof getAdminConfig>>

export async function seedInitialAdmin(db: ReturnType<typeof createDatabase>['db'], config: AdminConfig) {
  return db.transaction(async (transaction) => {
    // Serialize CLI retries before checking for the unique email; never promote an existing account.
    await transaction.execute(sql`select pg_advisory_xact_lock(hashtextextended(${'bootstrap-admin:' + config.email}, 0))`)
    const [existing] = await transaction.select().from(user).where(sql`lower(${user.email}) = ${config.email}`).limit(1)
    if (existing) {
      const [credential] = await transaction.select({ password: account.password }).from(account)
        .where(and(eq(account.userId, existing.id), eq(account.providerId, 'credential'))).limit(1)
      if (existing.role !== 'admin' || !existing.emailVerified || !credential?.password) {
        throw new Error('Admin email is already used by another account; choose a different ADMIN_EMAIL')
      }
      // Bootstrap is provisioning, not password reset or profile synchronization.
      return 'existing' as const
    }

    const id = randomUUID()
    const password = await hashPassword(config.password)
    await transaction.insert(user).values({
      id, email: config.email, name: config.name, surname: config.surname,
      role: 'admin', emailVerified: true
    })
    await transaction.insert(account).values({
      id: randomUUID(), userId: id, accountId: id, providerId: 'credential', password
    })
    return 'created' as const
  })
}
