import { localeCookieName, safeLocaleReturnPath } from '#shared/locale'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  if (query.locale !== 'ru' && query.locale !== 'en') throw createError({ statusCode: 400, statusMessage: 'Unsupported locale' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  setCookie(event, localeCookieName, query.locale, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365, httpOnly: true, secure: process.env.VERCEL === '1' })
  return sendRedirect(event, safeLocaleReturnPath(query.returnTo), 302)
})
