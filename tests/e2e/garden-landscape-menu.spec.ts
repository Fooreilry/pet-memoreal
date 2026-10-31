import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'

const gardens = ['meadow', 'lake', 'grove', 'hill'] as const

async function expectUnclipped(target: Locator) {
  await expect(target).toBeVisible()
  const bounds = await target.evaluate(element => {
    const box = element.getBoundingClientRect()
    const viewport = window.visualViewport
    let left = viewport?.offsetLeft ?? 0
    let top = viewport?.offsetTop ?? 0
    let right = left + (viewport?.width ?? innerWidth)
    let bottom = top + (viewport?.height ?? innerHeight)
    for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor)
      const parent = ancestor.getBoundingClientRect()
      if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
        left = Math.max(left, parent.left + ancestor.clientLeft)
        right = Math.min(right, parent.left + ancestor.clientLeft + ancestor.clientWidth)
      }
      if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
        top = Math.max(top, parent.top + ancestor.clientTop)
        bottom = Math.min(bottom, parent.top + ancestor.clientTop + ancestor.clientHeight)
      }
    }
    const centre = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return {
      width: box.width,
      height: box.height,
      visibleWidth: Math.max(0, Math.min(box.right, right) - Math.max(box.left, left)),
      visibleHeight: Math.max(0, Math.min(box.bottom, bottom) - Math.max(box.top, top)),
      receivesPointer: !!centre && (centre === element || element.contains(centre))
    }
  })
  expect(bounds.visibleWidth).toBeGreaterThanOrEqual(bounds.width - 1)
  expect(bounds.visibleHeight).toBeGreaterThanOrEqual(bounds.height - 1)
  expect(bounds.width).toBeGreaterThanOrEqual(44)
  expect(bounds.height).toBeGreaterThanOrEqual(44)
  expect(bounds.receivesPointer).toBe(true)
}

async function finishMenuAnimation(page: Page) {
  await page.locator('.garden-menu').evaluate(async element => {
    const content = element.closest('[data-slot="content"]') ?? element
    await Promise.allSettled(content.getAnimations({ subtree: true }).map(animation => animation.finished))
  })
}

async function expectUsableMenu(page: Page, locale: string) {
  const overview = page.getByTestId('garden-overview')
  await expect(overview).toHaveAccessibleName(locale === 'ru' ? 'Все сады' : 'All gardens')
  // Check before Playwright can scroll the obscured link into view for a tap.
  await expectUnclipped(overview)
  for (const garden of gardens) {
    const choice = page.getByTestId(`garden-${garden}`)
    await choice.scrollIntoViewIfNeeded()
    await expectUnclipped(choice)
    // Only the choices scroll; returning to the overview stays available.
    await expectUnclipped(overview)
  }
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight
    && document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

async function returnToOverview(page: Page) {
  await page.getByTestId('garden-overview').tap()
  await expect(page).toHaveURL(/\/gardens$/)
  await expect(page.getByTestId('garden-choices')).toBeVisible()
  await expect(page.getByTestId('garden-choices').getByRole('button')).toHaveCount(4)
  await expect(page.locator('.garden-menu')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await page.emulateMedia({ reducedMotion: 'reduce' })
})

test.describe('touch landscape garden menu', () => {
  test.skip(({ isMobile }) => !isMobile, 'Touch menu regressions use the mobile browser profile')

  for (const locale of ['ru', 'en']) {
    for (const size of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
      test(`${locale}: overview stays fully visible and tappable at ${size.width}x${size.height}`, async ({ page }, testInfo) => {
        await page.setViewportSize(size)
        await visitLocale(page, '/gardens?garden=meadow', locale)
        await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
        await page.getByTestId('garden-switch').tap()
        await finishMenuAnimation(page)
        await expectUsableMenu(page, locale)
        if (locale === 'ru' && size.width === 844) {
          await page.getByTestId('garden-meadow').focus()
          for (let step = 0; step < 3; step++) await page.keyboard.press('Tab')
          const lastGarden = page.getByTestId('garden-hill')
          await expect(lastGarden).toBeFocused()
          await expectUnclipped(lastGarden)
          await expectUnclipped(page.getByTestId('garden-overview'))
          await page.screenshot({ path: testInfo.outputPath('menu-keyboard-focus.png'), animations: 'disabled', scale: 'css' })
          await page.keyboard.press('Escape')
          await expect(page.locator('.garden-menu')).toHaveCount(0)
          await expect(page.getByTestId('garden-switch')).toBeFocused()
          await page.getByTestId('garden-switch').tap()
          await finishMenuAnimation(page)
          await expectUnclipped(page.getByTestId('garden-overview'))
        }
        await page.screenshot({ path: testInfo.outputPath(`menu-${locale}-${size.width}.png`), animations: 'disabled', scale: 'css' })
        await returnToOverview(page)
      })
    }

    test(`${locale}: an open portrait menu adapts when the phone rotates to landscape`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await visitLocale(page, '/gardens?garden=lake', locale)
      await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
      await page.getByTestId('garden-switch').tap()
      await finishMenuAnimation(page)
      await expectUnclipped(page.getByTestId('garden-overview'))
      await page.setViewportSize({ width: 844, height: 390 })
      await expect(page.getByTestId('garden-switch')).toHaveAttribute('aria-expanded', 'true')
      await expect.poll(async () => {
        const box = (await page.getByTestId('garden-overview').boundingBox())!
        return box.y + box.height
      }).toBeLessThanOrEqual(390)
      await expectUsableMenu(page, locale)
      await page.screenshot({ path: testInfo.outputPath(`menu-${locale}-after-rotation.png`), animations: 'disabled', scale: 'css' })
      await returnToOverview(page)
    })
  }
})

test('desktop keeps its single-column menu dimensions and scrolling owner', async ({ page, isMobile }, testInfo) => {
  test.skip(isMobile, 'Desktop layout is checked with a desktop browser profile')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  await expect(page.locator('.canvas-wrapper')).toHaveAttribute('data-state', 'ready')
  await page.getByTestId('garden-switch').click()
  await finishMenuAnimation(page)
  const metrics = await page.locator('.garden-menu').evaluate(element => {
    const menu = getComputedStyle(element)
    const navigation = element.querySelector('nav')!
    const nav = getComputedStyle(navigation)
    return { width: element.getBoundingClientRect().width, maxHeight: menu.maxHeight, overflow: menu.overflowY, navOverflow: nav.overflowY, columns: nav.gridTemplateColumns.split(' ').length }
  })
  expect(metrics).toEqual({ width: 280, maxHeight: '440px', overflow: 'auto', navOverflow: 'visible', columns: 1 })
  for (const garden of gardens) await expectUnclipped(page.getByTestId(`garden-${garden}`))
  await expectUnclipped(page.getByTestId('garden-overview'))
  await page.screenshot({ path: testInfo.outputPath('menu-desktop.png'), animations: 'disabled', scale: 'css' })
  await page.getByTestId('garden-overview').click()
  await expect(page).toHaveURL(/\/gardens$/)
  await expect(page.getByTestId('garden-choices')).toBeVisible()
})
