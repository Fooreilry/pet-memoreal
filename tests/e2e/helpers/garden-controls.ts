import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'

/** Reveal secondary controls through the same mobile affordance a visitor uses. */
export async function ensureGardenControl(page: Page, id: string) {
  const control = page.getByTestId(id)
  const more = page.getByTestId('garden-more')
  await expect.poll(async () => await control.isVisible() || await more.isVisible()).toBe(true)
  if (!await control.isVisible()) {
    if (await more.isVisible() && await more.getAttribute('aria-expanded') !== 'true') await more.click()
  }
  await expect(control).toBeVisible()
  return control
}

export async function clickGardenControl(page: Page, id: string) {
  await (await ensureGardenControl(page, id)).click()
}

/** Keep transient menu text out of scenery comparisons and map-level input. */
export async function dismissGardenTools(page: Page) {
  const more = page.getByTestId('garden-more')
  for (let layer = 0; layer < 2 && await more.isVisible() && await more.getAttribute('aria-expanded') === 'true'; layer++) {
    await page.keyboard.press('Escape')
  }
  await expect(page.getByTestId('garden-tools-menu')).toBeHidden()
}
