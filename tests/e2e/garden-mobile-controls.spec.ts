import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { visitLocale } from './helpers/locale'
import { clickGardenControl, dismissGardenTools, ensureGardenControl } from './helpers/garden-controls'

async function showWholeMap(page: Page) {
  await dismissGardenTools(page)
  const scene = page.locator('.canvas-wrapper')
  for (let step = 0; step < 8 && Number(await scene.getAttribute('data-zoom')) > 1; step++) await page.getByTestId('garden-zoom-out').click()
  await expect(scene).toHaveAttribute('data-zoom', '1.000')
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/gardens/*/memorials', route => route.fulfill({ json: [] }))
  await page.emulateMedia({ reducedMotion: 'no-preference' })
})

for (const locale of ['ru', 'en']) {
  test(`${locale}: phone camera controls use a slim column and reveal secondary actions on demand`, async ({ page }, testInfo) => {
    test.slow()
    await page.setViewportSize({ width: 390, height: 844 })
    await visitLocale(page, '/gardens?garden=hill', locale)
    const scene = page.locator('.canvas-wrapper')
    await expect(scene).toHaveAttribute('data-state', 'ready')
    const more = page.getByTestId('garden-more')
    const menu = page.getByTestId('garden-tools-menu')

    for (const size of [{ width: 390, height: 844 }, { width: 320, height: 640 }, { width: 390, height: 390 }]) {
      await page.setViewportSize(size)
      const dock = page.locator('.camera-toolbar')
      await expect(scene).toHaveAttribute('data-zoom', '1.000')
      await expect(more).toHaveAttribute('aria-expanded', 'false')
      await expect(menu).toBeHidden()
      await expect(page.getByTestId('garden-camera-reset')).toBeHidden()
      await expect.poll(async () => (await dock.boundingBox())?.width ?? Infinity).toBeLessThanOrEqual(48)
      await expect.poll(async () => (await dock.boundingBox())?.height ?? Infinity).toBeLessThanOrEqual(170)
      const stage = (await page.locator('.garden-stage').boundingBox())!
      const bounds = (await dock.boundingBox())!
      expect(bounds.x).toBeGreaterThanOrEqual(stage.x)
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(stage.x + stage.width - 7)
      const navigation = (await page.locator('.garden-paths').boundingBox())!
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(navigation.y)
      const controls = await Promise.all(['garden-zoom-in', 'garden-zoom-out', 'garden-more'].map(async id => {
        const control = page.getByTestId(id)
        await expect(control).toBeVisible()
        return (await control.boundingBox())!
      }))
      expect(Math.max(...controls.map(box => box.x)) - Math.min(...controls.map(box => box.x))).toBeLessThanOrEqual(1)
      for (const box of controls) {
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
      expect(new Set(controls.map(box => box.y)).size).toBe(3)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      await page.screenshot({ path: testInfo.outputPath(`camera-column-${size.width}x${size.height}.png`), animations: 'disabled', scale: 'css' })
    }

    // Exercise one numeric zoom step from the explicitly selected whole-map view.
    await showWholeMap(page)
    await page.getByTestId('garden-zoom-in').click()
    await expect(page.locator('.camera-toolbar output:visible')).toHaveText('125%')
    await more.click()
    await expect(more).toHaveAttribute('aria-expanded', 'true')
    await expect(menu).toBeVisible()
    await menu.evaluate(element => {
      const content = element.closest('[data-slot="content"]') ?? element
      return Promise.allSettled(content.getAnimations({ subtree: true }).map(animation => animation.finished))
    })
    await expect.poll(() => menu.locator('button:visible').evaluateAll(buttons => buttons.length
      ? Math.min(...buttons.map(button => button.getBoundingClientRect().height)) : 0)).toBeGreaterThanOrEqual(44)
    const menuBounds = (await menu.boundingBox())!
    expect(menuBounds.x).toBeGreaterThanOrEqual(0)
    expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(page.viewportSize()!.width)
    expect(menuBounds.y).toBeGreaterThanOrEqual(0)
    expect(menuBounds.y + menuBounds.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    const actions = await menu.locator('button:visible').evaluateAll(buttons => buttons.map(button => {
      const box = button.getBoundingClientRect()
      return { width: box.width, height: box.height, label: button.getAttribute('aria-label') || button.textContent?.trim() }
    }))
    expect(actions.length).toBeGreaterThanOrEqual(5)
    for (const action of actions) {
      expect(action.height).toBeGreaterThanOrEqual(44)
      expect(action.width).toBeGreaterThanOrEqual(44)
      expect(action.label).toBeTruthy()
    }
    await page.screenshot({ path: testInfo.outputPath('camera-secondary-actions.png'), animations: 'disabled', scale: 'css' })
    await clickGardenControl(page, 'garden-camera-reset')
    await expect(scene).toHaveAttribute('data-zoom', '1.000')
    await expect(page.locator('.camera-toolbar output:visible')).toHaveText('100%')
    await expect(page.getByTestId('garden-zoom-out')).toBeDisabled()
    const effects = await ensureGardenControl(page, 'garden-effects')
    await effects.click()
    await expect(scene).toHaveAttribute('data-effects', 'off')
    await clickGardenControl(page, 'garden-effects')
    await expect(scene).toHaveAttribute('data-effects', 'on')
    await clickGardenControl(page, 'garden-motion')
    await expect(scene).toHaveAttribute('data-motion', 'paused')
    await clickGardenControl(page, 'garden-motion')
    await expect(scene).toHaveAttribute('data-motion', 'running')

    await clickGardenControl(page, 'garden-fullscreen')
    await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'true')
    const help = await ensureGardenControl(page, 'garden-help')
    await help.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.garden-help-card')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.garden-help-card')).toHaveCount(0)
    await expect(help).toBeFocused()
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(more).toBeFocused()
    await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(page.locator('.gardens-page')).toHaveAttribute('data-expanded', 'false')
  })
}


test('phone gardens open and reset at 100% while manual zoom survives panning and resize', async ({ page }, testInfo) => {
  test.slow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const scene = page.locator('.canvas-wrapper')
  const gardens = ['meadow', 'lake', 'grove', 'hill'] as const
  const zoomIn = page.getByTestId('garden-zoom-in')

  async function expectWholeMap() {
    await expect(scene).toHaveAttribute('data-zoom', '1.000')
    await expect(scene).toHaveAttribute('data-camera-x', '0.00')
    await expect(scene).toHaveAttribute('data-camera-y', '0.00')
    await expect(page.getByTestId('garden-zoom-out')).toBeDisabled()
    await expect(page.locator('.camera-toolbar output:visible')).toHaveText('100%')
    const viewport = (await scene.boundingBox())!
    const frame = (await page.getByTestId('garden-frame').boundingBox())!
    expect(frame.x).toBeGreaterThanOrEqual(viewport.x + 12)
    expect(frame.x + frame.width).toBeLessThanOrEqual(viewport.x + viewport.width - 12)
    expect(frame.y).toBeGreaterThanOrEqual(viewport.y + 12)
    expect(frame.y + frame.height).toBeLessThanOrEqual(viewport.y + viewport.height - 12)
    for (const target of await page.locator('.memorial-hit').all()) {
      const box = (await target.boundingBox())!
      expect(box.width).toBeGreaterThanOrEqual(43.9)
      expect(box.height).toBeGreaterThanOrEqual(43.9)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  }

  for (const size of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(size)
    await visitLocale(page, '/gardens?garden=meadow', 'en')
    await expect(scene).toHaveAttribute('data-state', 'ready')
    for (const [index, garden] of gardens.entries()) {
      await expect(scene).toHaveAttribute('data-displayed-garden', garden)
      await expectWholeMap()
      if (!index) {
        await expect(page.locator('.memorial-hit')).toHaveCount(12)
        await page.screenshot({ path: testInfo.outputPath(`whole-map-${size.width}.png`), animations: 'disabled', scale: 'css' })
      }
      await zoomIn.click()
      await expect(scene).toHaveAttribute('data-zoom', '1.250')
      if (!index) {
        for (let step = 0; step < 7 && await zoomIn.isEnabled(); step++) await zoomIn.click()
        await expect(scene).toHaveAttribute('data-zoom', '4.000')
        await scene.focus()
        const beforePan = Number(await scene.getAttribute('data-camera-y'))
        await page.keyboard.press('Shift+ArrowDown')
        expect(Number(await scene.getAttribute('data-camera-y'))).toBeLessThan(beforePan)
        const lastPlace = page.locator('.memorial-hit').last()
        await lastPlace.focus()
        await expect(lastPlace).toBeInViewport()
        await expect(lastPlace).toBeEnabled()
        const previousProjection = (await scene.getAttribute('data-projection-scale'))!
        await page.setViewportSize({ width: size.height, height: size.width })
        await expect(scene).not.toHaveAttribute('data-projection-scale', previousProjection)
        await expect(scene).toHaveAttribute('data-zoom', '4.000')
        const rotatedProjection = (await scene.getAttribute('data-projection-scale'))!
        await page.setViewportSize(size)
        await expect(scene).not.toHaveAttribute('data-projection-scale', rotatedProjection)
        await expect(scene).toHaveAttribute('data-zoom', '4.000')
      }
      await clickGardenControl(page, 'garden-camera-reset')
      await dismissGardenTools(page)
      await expectWholeMap()
      // A different garden opens at 100% even after a manual camera change.
      await zoomIn.click()
      const nextGarden = gardens[(index + 1) % gardens.length]!
      await page.getByTestId('garden-next').click()
      await expect(page).toHaveURL(new RegExp(`[?&]garden=${nextGarden}(?:&|$)`))
      await expect(scene).toHaveAttribute('data-state', 'ready')
    }
    await expectWholeMap()
  }
})

test('wide desktop gardens still open and reset to the complete 100% view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await visitLocale(page, '/gardens?garden=meadow', 'en')
  const scene = page.locator('.canvas-wrapper')
  await expect(scene).toHaveAttribute('data-state', 'ready')
  await expect(scene).toHaveAttribute('data-zoom', '1.000')
  await expect(page.getByTestId('garden-zoom-out')).toBeDisabled()
  await page.getByTestId('garden-zoom-in').click()
  await expect(scene).toHaveAttribute('data-zoom', '1.250')
  await clickGardenControl(page, 'garden-camera-reset')
  await expect(scene).toHaveAttribute('data-zoom', '1.000')
  await expect(scene).toHaveAttribute('data-camera-x', '0.00')
  await expect(scene).toHaveAttribute('data-camera-y', '0.00')
})
