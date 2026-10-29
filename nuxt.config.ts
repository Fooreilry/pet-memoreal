// https://nuxt.com/docs/api/configuration/nuxt-config
import { petSpeciesIcons } from './app/data/petSpeciesIcons'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV === 'development' },
  nitro: {
    vercel: { functions: { runtime: 'nodejs24.x', maxDuration: 30 } },
    prerender: { crawlLinks: false }
  },
  devServer: { host: '127.0.0.1', port: 3000 },
  modules: ['@nuxt/ui', '@nuxtjs/i18n', '@nuxt/eslint'],
  icon: {
    clientBundle: {
      icons: [
        ...Object.values(petSpeciesIcons).flatMap(drawing => 'icon' in drawing ? [drawing.icon.replace('i-lucide-', 'lucide:')] : []),
        'lucide:cloud-rain', 'lucide:sun', 'lucide:sun-medium', 'lucide:cloud-sun'
      ]
    }
  },
  css: ['~/assets/css/main.css'],
  colorMode: { preference: 'light', fallback: 'light' },
  routeRules: {
    '/': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/login': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/register': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/verify-email': { headers: { 'cache-control': 'private, no-store' } },
    '/forgot-password': { headers: { 'cache-control': 'private, no-store' } },
    '/reset-password': { headers: { 'cache-control': 'private, no-store' } },
    '/gardens': { headers: { 'cache-control': 'private, no-store' } },
    '/api/auth/**': { headers: { 'cache-control': 'no-store' } },
    '/api/me': { headers: { 'cache-control': 'no-store' } },
    '/api/memorials/**': { headers: { 'cache-control': 'no-store' } },
    '/memorials/new': { headers: { 'cache-control': 'private, no-store' } },
    '/account': { headers: { 'cache-control': 'private, no-store' } },
    '/admin': { prerender: false, headers: { 'cache-control': 'private, no-store' } },
    '/api/admin/**': { headers: { 'cache-control': 'private, no-store' } }
  },
  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    locales: [
      { code: 'ru', language: 'ru-RU', name: 'Русский', file: 'ru.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' }
    ]
  }
})
