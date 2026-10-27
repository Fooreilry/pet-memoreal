import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { localeCookieName } from '../../../shared/locale'

// Locale is a preference, independent of the tested URL and browser language.
export async function visitLocale(page: Page, path: string, locale: string) {
  const origin = new URL(test.info().project.use.baseURL!).origin
  await page.context().addCookies([{ name: localeCookieName, value: locale, url: origin }])
  return page.goto(path)
}
