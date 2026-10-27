import { localeCookieName, resolveVisitorLocale } from '#shared/locale'

export default defineNuxtPlugin({
  name: 'visitor-locale',
  enforce: 'pre',
  setup(nuxtApp) {
    const preference = useCookie(localeCookieName)
    // The SSR choice travels in the payload, so hydration never guesses from navigator.language.
    const initialLocale = useState('visitor-locale', () => resolveVisitorLocale(
      import.meta.server ? useRequestHeader('x-vercel-ip-country') ?? undefined : undefined,
      preference.value
    ))
    let initialized = false
    nuxtApp.hook('i18n:beforeLocaleSwitch', (options) => {
      if (initialized) return
      options.newLocale = initialLocale.value
      initialized = true
    })
  }
})
