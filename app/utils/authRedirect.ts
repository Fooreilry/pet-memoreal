export function authRedirect(value: unknown) {
  return typeof value === 'string' && /^\/(ru|en)\/(?:memorials\/new|gardens)(?:\?|$)/.test(value) ? value : undefined
}
