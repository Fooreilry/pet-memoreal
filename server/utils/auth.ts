import { betterAuth } from 'better-auth'
import { APIError, createAuthMiddleware } from 'better-auth/api'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { z } from 'zod'
import { getDatabase } from '../db/client'
import * as schema from '../db/schema'
import { getAuthConfig } from './auth-config'
import { profileFields } from '../../shared/profile'
import { createMailTransport } from './mail'
import { createDatabaseRateLimitStorage } from './rate-limit'

function createAuth() {
  const config = getAuthConfig()
  const { db } = getDatabase()
  const mail = createMailTransport(config)

  async function sendEmail(email: string, url: string, kind: 'verify' | 'reset', request?: Request) {
    const en = request?.headers.get('x-app-locale') === 'en'
    const subject = kind === 'verify'
      ? (en ? 'Confirm your email' : 'Подтвердите почту')
      : (en ? 'Reset your password' : 'Восстановление пароля')
    const instruction = kind === 'verify'
      ? (en ? 'Follow this link to confirm your email and then sign in.' : 'Перейдите по ссылке, чтобы подтвердить почту, а затем войдите в аккаунт.')
      : (en ? 'Follow this link to choose a new password.' : 'Перейдите по ссылке, чтобы задать новый пароль.')
    const note = en ? 'This link expires in one hour. If you did not request it, ignore this email.' : 'Ссылка действует один час. Если вы не отправляли запрос, просто проигнорируйте письмо.'
    await mail.sendMail({ from: config.SMTP_FROM, to: email, subject: `PetMemoreal — ${subject}`, text: `${instruction}\n\n${url}\n\n${note}` })
  }

  return betterAuth({
    appName: 'PetMemoreal',
    baseURL: config.BETTER_AUTH_URL,
    secret: config.BETTER_AUTH_SECRET,
    trustedOrigins: [new URL(config.BETTER_AUTH_URL).origin],
    advanced: { ipAddress: { ipAddressHeaders: ['x-auth-client-ip'] } },
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    user: { additionalFields: { ...profileFields, role: { type: 'string', defaultValue: 'user', input: false } } },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 3600,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: ({ user, url }, request) => sendEmail(user.email, url, 'reset', request)
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: ({ user, url }, request) => sendEmail(user.email, url, 'verify', request)
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      customStorage: createDatabaseRateLimitStorage(db),
      window: 60,
      max: 100,
      customRules: {
        '/sign-up/email': { window: 60, max: 10 },
        '/sign-in/email': { window: 60, max: 30 },
        '/send-verification-email': { window: 60, max: 10 },
        '/request-password-reset': { window: 60, max: 10 }
      }
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === '/sign-up/email' || ctx.path === '/update-user') {
          const body = { ...ctx.body }
          if (ctx.path === '/sign-up/email' || ctx.body?.name !== undefined) {
            const name = z.string().trim().min(1).max(80).safeParse(ctx.body?.name)
            if (!name.success) throw new APIError('BAD_REQUEST', { code: 'INVALID_NAME', message: 'Invalid name' })
            body.name = name.data
          }
          if (ctx.body?.surname !== undefined) {
            const surname = z.string().trim().max(80).safeParse(ctx.body.surname)
            if (!surname.success) throw new APIError('BAD_REQUEST', { code: 'INVALID_SURNAME', message: 'Invalid surname' })
            body.surname = surname.data
          }
          return { context: { body } }
        }
      })
    }
  })
}

let instance: ReturnType<typeof createAuth> | undefined
export function getAuth() {
  return instance ??= createAuth()
}
