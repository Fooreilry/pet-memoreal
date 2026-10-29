import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

export async function openMemorialStory(page: Page, stone: Locator, touch = false) {
  if (touch) await stone.tap()
  else await stone.click()
  const summary = page.getByTestId('memorial-summary')
  await expect(summary).toBeVisible()
  if (touch) await summary.tap()
  else await summary.click()
  await expect(summary).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
}
