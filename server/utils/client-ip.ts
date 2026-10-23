import { isIP } from 'node:net'

export function getTrustedClientIP(headers: Headers, socketIP?: string, vercel = process.env.VERCEL === '1') {
  // Only the Vercel runtime may trust the headers overwritten by its ingress.
  const ip = vercel
    ? (headers.get('x-vercel-forwarded-for') || headers.get('x-forwarded-for'))?.trim()
    : socketIP
  return ip && isIP(ip) ? ip : undefined
}
