import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

export async function revealMemorialMarker(stone: Locator) {
  const outsideStage = await stone.evaluate(element => {
    const bounds = element.getBoundingClientRect()
    const stage = element.closest('.garden-stage')!.getBoundingClientRect()
    return bounds.left < stage.left || bounds.top < stage.top
      || bounds.right > stage.right || bounds.bottom > stage.bottom
  })
  if (!outsideStage) return
  // Keyboard focus deliberately reveals an offscreen place. Pointer activation
  // itself must retain the production rule that clicking never pans its target.
  await stone.evaluate(element => { if (element instanceof HTMLElement) element.blur() })
  await stone.focus()
  // IntersectionObserver rounds fractional camera coordinates just below 1.
  await expect(stone).toBeInViewport({ ratio: .99 })
}

export async function openMemorialStory(page: Page, stone: Locator, touch = false) {
  await revealMemorialMarker(stone)
  if (touch) await stone.tap()
  else await stone.click()
  const summary = page.getByTestId('memorial-summary')
  await expect(summary).toBeVisible()
  if (touch) await summary.tap()
  else await summary.click()
  await expect(summary).toHaveCount(0)
  await expect(page.getByRole('dialog')).toBeVisible()
}
