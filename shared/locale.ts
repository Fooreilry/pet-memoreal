export const localeCookieName = 'petmemoreal_locale'

export function resolveVisitorLocale(country: string | undefined, preference?: unknown): 'ru' | 'en' {
  if (preference === 'ru' || preference === 'en') return preference
  return country?.trim().toUpperCase() === 'RU' ? 'ru' : 'en'
}

export function withoutLocalePrefix(path: string) {
  return path.replace(/^\/(?:ru|en)(?=\/|\?|#|$)/, '').replace(/^(?=[?#]|$)/, '/')
}

export function safeLocaleReturnPath(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || /[\\\r\n]/.test(value)) return '/'
  const path = withoutLocalePrefix(value)
  if (path.startsWith('//') || /^\/(?:api|language)(?:[/?#]|$)/.test(path)) return '/'
  return path
}

export function resolveAuthRedirect(value: unknown) {
  if (typeof value !== 'string' || /[\\\r\n]/.test(value)) return undefined
  const path = withoutLocalePrefix(value)
  return /^\/(?:memorials\/new|gardens)(?:\?|$)/.test(path) ? path : undefined
}
