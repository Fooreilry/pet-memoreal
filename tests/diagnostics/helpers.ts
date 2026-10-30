import type { Page } from '@playwright/test'

type HydratedNuxtRoot = Element & {
  __vue_app__?: { config: { globalProperties: { $router?: { push: (path: string) => Promise<unknown> } } } }
}

/** Enter through the hydrated public router so browser API fixtures cover auth. */
export async function enterGarden(page: Page, url: string) {
  const target = new URL(url)
  await page.goto(`${target.origin}/`)
  // Pinned Nuxt/Vue expose the mounted app on their root. Confine this test-only
  // access here; production SSR health checks remain unchanged.
  await page.waitForFunction(() => !!(document.querySelector('#__nuxt') as HydratedNuxtRoot | null)?.__vue_app__?.config.globalProperties.$router)
  await page.evaluate(async (path) => {
    const router = (document.querySelector('#__nuxt') as HydratedNuxtRoot).__vue_app__!.config.globalProperties.$router!
    await router.push(path)
  }, `${target.pathname}${target.search}${target.hash}`)
}
