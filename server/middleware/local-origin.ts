const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]'])

export default defineEventHandler((event) => {
  if (!['GET', 'HEAD'].includes(getMethod(event))) return
  const current = getRequestURL(event)
  // Canonicalize page navigation only. API origin checks remain strict.
  if (/^\/(?:api|_nuxt|_i18n)(\/|$)/.test(current.pathname) || /\.[a-z0-9]+$/i.test(current.pathname)) return
  const configured = process.env.BETTER_AUTH_URL
  if (!configured) return
  const canonical = new URL(configured)
  if (!loopbackHosts.has(current.hostname) || !loopbackHosts.has(canonical.hostname)) return
  if (current.hostname === canonical.hostname || current.protocol !== canonical.protocol || current.port !== canonical.port) return
  canonical.pathname = current.pathname
  canonical.search = current.search
  setHeader(event, 'Cache-Control', 'no-store')
  return sendRedirect(event, canonical.href, 302)
})
