// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV === 'development' },
  nitro: {
    vercel: { functions: { runtime: 'nodejs24.x', maxDuration: 30 } },
    prerender: { crawlLinks: false }
  },
  devServer: { host: '127.0.0.1', port: 3000 },
  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  colorMode: { preference: 'light', fallback: 'light' },
  routeRules: {
    '/ru': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/en': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/ru/login': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/en/login': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/ru/register': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/en/register': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/ru/gardens': { headers: { 'cache-control': 'private, no-store' } },
    '/en/gardens': { headers: { 'cache-control': 'private, no-store' } },
    '/api/auth/**': { headers: { 'cache-control': 'no-store' } },
    '/api/me': { headers: { 'cache-control': 'no-store' } },
    '/api/memorials/**': { headers: { 'cache-control': 'no-store' } },
    '/ru/memorials/new': { headers: { 'cache-control': 'no-store' } },
    '/en/memorials/new': { headers: { 'cache-control': 'no-store' } },
    '/ru/account': { headers: { 'cache-control': 'no-store' } },
    '/en/account': { headers: { 'cache-control': 'no-store' } }
  },
  i18n: {
    defaultLocale: 'ru',
    strategy: 'prefix',
    locales: [
      { code: 'ru', language: 'ru-RU', name: 'Русский', file: 'ru.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' }
    ]
  }
})
