import { z } from 'zod'

export function getAuthConfig(env: Record<string, string | undefined> = process.env) {
  const result = z.object({
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    SMTP_HOST: z.string().min(1),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535),
    SMTP_SECURE: z.enum(['true', 'false']).default('false'),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.email()
  }).safeParse(env)
  if (!result.success) {
    // Report only setting names, never their values.
    throw new Error(`Invalid auth settings: ${result.error.issues.map(issue => issue.path.join('.')).join(', ')}`)
  }
  const config = result.data
  const url = new URL(config.BETTER_AUTH_URL)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((!local && url.protocol !== 'https:') || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BETTER_AUTH_URL must be an origin; HTTPS is required outside localhost')
  }
  if (!!config.SMTP_USER !== !!config.SMTP_PASSWORD) throw new Error('Set SMTP_USER and SMTP_PASSWORD together')
  if ([465, 2465].includes(config.SMTP_PORT) && config.SMTP_SECURE !== 'true') throw new Error('SMTP_SECURE must be true for implicit TLS ports')
  if (env.VERCEL === '1' && config.SMTP_PORT === 25) throw new Error('SMTP port 25 is unavailable on Vercel')
  if (config.SMTP_HOST === 'smtp.resend.com' && (config.SMTP_USER !== 'resend' || !config.SMTP_PASSWORD)) throw new Error('Set Resend SMTP credentials')
  return config
}
