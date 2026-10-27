import { withoutLocalePrefix } from '#shared/locale'

export default defineEventHandler((event) => {
  if (!['GET', 'HEAD'].includes(getMethod(event))) return
  const url = getRequestURL(event)
  if (!/^\/(ru|en)(\/|$)/.test(url.pathname)) return
  const target = withoutLocalePrefix(url.pathname)
  if (target.startsWith('//')) throw createError({ statusCode: 400, statusMessage: 'Invalid path' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return sendRedirect(event, target + url.search, 301)
})
